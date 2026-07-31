import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from '../db/pool.js';
import type { Config } from '../config.js';
import {
  listHeld,
  publishEntry,
  removeEntry,
  type HeldEntry,
  type TransitionResult,
} from '../db/entries.js';
import { invalidState, notFound, unauthorized, unavailable } from '../errors.js';

/**
 * 주인의 안전망 (contracts/guestbook-api.md).
 *
 * 세 겹 방어는 완벽하지 않다. 평범한 인사가 보류되기도 하고, 교묘한 광고가 통과하기도
 * 한다. 그래서 사람이 손댈 수 있는 자리를 반드시 둔다 — 다만 평소엔 열어볼 일 없는
 * 안전망이다.
 *
 * 여기 있는 모든 경로는 토큰이 필요하다. 토큰이 없으면 **보류함이 있다는 사실조차** 알려
 * 주지 않는다 — 없는 글과 권한 없는 요청을 같은 말로 막지는 않지만, 목록은 통째로 401 이다.
 */

/** 한 번에 가져올 보류 글 수. 보류함이 길어질 일이 없다 — 길어지면 방어가 잘못된 것이다. */
const HELD_LIMIT = 100;

/**
 * 토큰을 시간 정보가 새지 않게 비교한다.
 *
 * `===` 는 다른 첫 글자에서 바로 멈추므로, 응답 시간을 재면 앞에서부터 한 글자씩 맞춰
 * 갈 수 있다. 길이도 정보라서 먼저 해시해 길이를 같게 만든 뒤 비교한다.
 */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function readBearer(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return '';
  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return '';
  return rest.join(' ').trim();
}

/** pg 의 접속 계열 오류를 503 으로 바꾼다. */
function asUnavailable(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code?.startsWith('08') || code === '57P03' || code === 'ECONNREFUSED') throw unavailable();
  throw err;
}

/** `not_found` 와 `invalid_state` 를 계약이 정한 상태 코드로 옮긴다. */
function assertMoved(result: TransitionResult, whenInvalid: string): void {
  if (result === 'not_found') throw notFound();
  if (result === 'invalid_state') throw invalidState(whenInvalid);
}

// id 는 bigserial 이다. 숫자로 바꾸지 않고 문자열 그대로 넘긴다 — JS 의 안전 정수 범위를
// 넘길 일은 없지만, 바꿔 봐야 얻는 것이 없고 정밀도만 잃을 수 있다.
const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[0-9]{1,19}$' } },
} as const;

interface IdParams {
  id: string;
}

export interface AdminRouteDeps {
  config: Config;
}

export function registerAdminRoutes(app: FastifyInstance, pool: Pool, deps: AdminRouteDeps): void {
  const { config } = deps;

  // 이 함수 안에서 등록하는 경로에만 붙는 훅을 만들기 위해 하위 컨텍스트로 감싼다.
  // 감싸지 않으면 addHook 이 앱 전체에 걸려 목록·남기기까지 토큰을 요구하게 된다.
  void app.register(async (scope) => {
    scope.addHook('onRequest', async (req) => {
      if (!tokenMatches(readBearer(req), config.adminToken)) throw unauthorized();
    });

    scope.get('/api/guestbook/held', async () => {
      const entries: HeldEntry[] = await listHeld(pool, HELD_LIMIT).catch(asUnavailable);
      return { entries };
    });

    scope.post<{ Params: IdParams }>(
      '/api/guestbook/entries/:id/publish',
      { schema: { params: idParamsSchema } },
      async (req) => {
        const result = await publishEntry(pool, req.params.id).catch(asUnavailable);
        assertMoved(result, '보류 중인 글만 공개할 수 있습니다.');
        return { status: 'visible' };
      },
    );

    scope.delete<{ Params: IdParams }>(
      '/api/guestbook/entries/:id',
      { schema: { params: idParamsSchema } },
      async (req) => {
        const result = await removeEntry(pool, req.params.id).catch(asUnavailable);
        assertMoved(result, '지울 수 없는 글입니다.');
        return { status: 'removed' };
      },
    );
  });
}
