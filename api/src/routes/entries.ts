import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db/pool.js';
import type { Config } from '../config.js';
import { hasRecentDuplicate, insertEntry, listVisible, type PublicEntry } from '../db/entries.js';
import { countRecentMarks, hashClient, recordMark } from '../db/abuse.js';
import { checkBot } from '../guard/bot.js';
import { checkRules } from '../guard/rules.js';
import type { Judge } from '../guard/verdict.js';
import { normalizeEntry, normalizeListQuery, AUTHOR_MAX, BODY_MAX } from '../validate.js';
import { duplicate, rateLimited, unavailable } from '../errors.js';

/**
 * 방명록 목록과 남기기 (contracts/guestbook-api.md).
 *
 * 남기기 경로는 세 겹을 순서대로 지난다. 값싼 검사가 앞에 온다 — 봇이면 데이터베이스도
 * 판정도 부르지 않는다.
 *
 *   1층 봇   → 저장하지 않고 성공처럼 응답 (봇에게 실패를 알리지 않는다)
 *   한도·중복 → 429 · 409
 *   2층 규칙 → held 로 저장, 202
 *   3층 판정 → publish 면 visible/201, 그 밖은 held/202 (판정 실패 포함)
 */

// 스키마는 타입과 필수 여부만 본다. 다듬은 뒤의 길이는 normalizeEntry 가 본다.
// maxLength 를 넉넉히 둔 이유: 여기서 자르면 "500자까지" 라는 우리 문구와 어긋난 지점에서
// 잘리게 되고, 방문자는 왜 잘렸는지 모른다. 초과 판단은 한 곳(normalizeEntry)에서만 한다.
const createBodySchema = {
  type: 'object',
  required: ['author', 'body', 'website', 'openedAt'],
  properties: {
    author: { type: 'string', maxLength: AUTHOR_MAX * 4 },
    body: { type: 'string', maxLength: BODY_MAX * 4 },
    // 사람 눈에 보이지 않는 칸. 1층 방어가 US2 에서 이 값을 본다.
    website: { type: 'string', maxLength: 200 },
    openedAt: { type: 'string', maxLength: 40 },
  },
  additionalProperties: false,
} as const;

const listQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'string' },
    before: { type: 'string' },
  },
  additionalProperties: false,
} as const;

interface ListResponse {
  entries: PublicEntry[];
  nextBefore: string | null;
}

/** pg 가 던지는 접속 계열 오류를 방문자용 503 으로 바꾼다. */
function asUnavailable(err: unknown): never {
  const code = (err as { code?: string }).code;
  // 08*: 접속 실패, 57P03: 기동 중, ECONNREFUSED: 아예 없음
  if (code?.startsWith('08') || code === '57P03' || code === 'ECONNREFUSED') throw unavailable();
  throw err;
}

export interface EntryRouteDeps {
  config: Config;
  judge: Judge;
}

/** 보류됐을 때 방문자에게 하는 말. 어느 겹에 걸렸는지는 알리지 않는다 — 알려 주면 우회를 돕는다. */
const HELD_MESSAGE = '남겨 주셔서 고맙습니다. 확인한 뒤 보이게 됩니다.';

/** 흔적을 얼마나 두는가. 세는 창보다 넉넉히 둬야 창 경계에서 새지 않는다. */
const MARK_TTL_FACTOR = 2;

export function registerEntryRoutes(app: FastifyInstance, pool: Pool, deps: EntryRouteDeps): void {
  const { config, judge } = deps;
  app.get('/api/guestbook/entries', { schema: { querystring: listQuerySchema } }, async (req) => {
    const { limit, before } = normalizeListQuery(req.query as Record<string, unknown>);

    const entries = await listVisible(pool, { limit, before }).catch(asUnavailable);

    // 가져온 수가 요청한 수와 같으면 더 있을 수 있다. 적으면 끝이다.
    const last = entries.at(-1);
    const response: ListResponse = {
      entries,
      nextBefore: entries.length === limit && last ? last.createdAt : null,
    };
    return response;
  });

  app.post(
    '/api/guestbook/entries',
    { schema: { body: createBodySchema } },
    async (req, reply) => {
      const raw = req.body as Record<string, unknown>;
      const input = normalizeEntry(raw);

      // ── 1층: 봇 ──
      const bot = checkBot({ website: raw['website'], openedAt: raw['openedAt'] });
      if (bot.bot) {
        // 사유만 남긴다. 글 내용은 로그에도 남기지 않는다.
        req.log.info({ layer: 'bot', reason: bot.reason }, 'guard rejected');
        // 저장하지 않았지만 성공처럼 보이게 한다(계약). id 0 은 어떤 행에도 없는 값이다.
        return reply.status(201).send({
          status: 'visible',
          entry: {
            id: 0,
            author: input.author,
            body: input.body,
            createdAt: new Date().toISOString(),
          },
        });
      }

      const clientHash = hashClient(req.ip, config.clientHashSalt);
      const { windowMs, max } = config.rateLimit;

      // ── 시간당 한도 (재시작해도 유지되도록 데이터베이스가 센다) ──
      const marks = await countRecentMarks(pool, clientHash, windowMs).catch(asUnavailable);
      if (marks.count >= max && marks.oldestAt) {
        const readyAt = marks.oldestAt.getTime() + windowMs;
        throw rateLimited(Math.max(1, Math.ceil((readyAt - Date.now()) / 1000)));
      }

      // ── 중복 ──
      if (await hasRecentDuplicate(pool, input.body).catch(asUnavailable)) throw duplicate();

      const store = async (status: 'visible' | 'held', reason?: string, score?: number | null) => {
        const entry = await insertEntry(pool, {
          author: input.author,
          body: input.body,
          status,
          heldReason: reason,
          verdictScore: score ?? undefined,
        }).catch(asUnavailable);
        await recordMark(pool, clientHash, windowMs * MARK_TTL_FACTOR).catch(asUnavailable);
        return entry;
      };

      // ── 2층: 규칙 ──
      const rules = checkRules(input.body);
      if (!rules.ok) {
        req.log.info({ layer: 'rules', reason: rules.reason }, 'guard held');
        await store('held', rules.reason);
        return reply.status(202).send({ status: 'held', message: HELD_MESSAGE });
      }

      // ── 3층: 판정. 실패·시간 초과는 공개가 아니라 보류다 (FR-013) ──
      const verdict = await judge({ author: input.author, body: input.body });
      if (verdict.decision !== 'publish') {
        req.log.info(
          { layer: 'verdict', decision: verdict.decision, score: verdict.score },
          'guard held',
        );
        await store('held', `판정: ${verdict.reason}`, verdict.score);
        return reply.status(202).send({ status: 'held', message: HELD_MESSAGE });
      }

      const entry = await store('visible', undefined, verdict.score);
      return reply.status(201).send({ status: 'visible', entry });
    },
  );
}
