import { createServer } from 'node:http';

/**
 * 방명록 API 대역 — **화면 연출만 볼 때 쓴다.**
 *
 * 왜 필요한가: 펜이 글을 쓰는 연출, 책이 마지막 장으로 넘어가는 모습을 보려면 API 가
 * 201 을 주기만 하면 된다. 그걸 보자고 PostgreSQL 을 띄우고 롤과 데이터베이스를 만들고
 * 판정 키까지 채우는 것은 과하다.
 *
 * 왜 `api/src` 의 DB 연결을 빼지 않는가: 진짜 라우트는 한도·중복·저장까지 데이터베이스를
 * 네 번 왕복하고 그 사이 실패를 503 으로 바꾼다(entries.ts 의 asUnavailable). 그 구조를
 * 들어내면 화면이 상대하는 것은 더 이상 배포되는 코드가 아니다. 되돌릴 때 흔적이 남을
 * 위험도 있다. 대역은 **밖에서 갈아 끼우므로** 저쪽 코드가 한 줄도 달라지지 않는다 —
 * `verdict-stub.mjs` 가 판정에 쓰는 것과 같은 방법이다.
 *
 *   node api/tests/e2e-support/guestbook-stub.mjs
 *   # 다른 창에서, 저장소 뿌리
 *   NEXT_PUBLIC_GUESTBOOK_API=http://localhost:8080 npm run dev
 *
 * 글은 메모리에만 쌓인다. 끄면 사라진다 — 그게 목적이다.
 *
 * **운영에 쓰지 말 것.** 규칙도 판정도 한도도 없다. 계약서(contracts/guestbook-api.md)가
 * 정한 **응답의 모양만** 흉내 낸다.
 *
 * 다만 **1층 봇 판별은 흉내 낸다.** 그것만 정상 사용자의 화면에 영향을 주기 때문이다 —
 * 걸리면 저장하지 않고 성공처럼 응답하므로 "모달은 닫히는데 글이 없다" 가 된다.
 * 대역이 이걸 빼먹었더니 로컬에서는 멀쩡하고 운영에서만 글이 사라졌다. 방어를 시험하려는
 * 것이 아니라, 대역이 화면에 거짓말을 하지 않게 하려는 것이다.
 */

const PORT = Number(process.env.GUESTBOOK_STUB_PORT ?? 8080);
const ORIGIN = process.env.GUESTBOOK_STUB_ORIGIN ?? 'http://localhost:3000';

/**
 * 다음 제출에 이 답을 준다. 실패했을 때 화면이 어떻게 되는지 보려고 둔다 —
 * 적던 내용이 남는지(FR-007), 보류 문구가 뜨는지.
 *
 *   curl "localhost:8080/__stub?next=held"
 *
 * 값: visible(기본) · held · duplicate · rate_limited · unavailable
 * 한 번 쓰면 visible 로 돌아온다. 계속 실패시키려면 `&sticky=1`.
 */
let nextResult = 'visible';
let sticky = false;

/** 메모리 저장소. 최신순으로 들고 있는다(API 계약이 최신순이다). */
let entries = [];
let nextId = 1;

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    ...extra,
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // 사이트(3000)와 API(8080)가 갈리므로 브라우저가 먼저 예비 요청을 보낸다.
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (url.pathname === '/api/health') return json(res, 200, { ok: true });

  // 대역 조종석. 다음 제출의 답을 바꾼다.
  if (url.pathname === '/__stub') {
    nextResult = url.searchParams.get('next') ?? 'visible';
    sticky = url.searchParams.get('sticky') === '1';
    return json(res, 200, { nextResult, sticky, count: entries.length });
  }

  if (url.pathname === '/api/guestbook/entries' && req.method === 'GET') {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const before = url.searchParams.get('before');
    const pool = before ? entries.filter((e) => e.createdAt < before) : entries;
    const page = pool.slice(0, limit);
    return json(res, 200, {
      entries: page,
      nextBefore: page.length === limit ? page[page.length - 1].createdAt : null,
    });
  }

  if (url.pathname === '/api/guestbook/entries' && req.method === 'POST') {
    const raw = await readBody(req);
    const author = String(raw.author ?? '').trim();
    const body = String(raw.body ?? '').trim();

    // 진짜 서버가 스키마와 validate.ts 로 막는 자리. 화면이 오류를 어떻게 보여 주는지
    // 확인하려면 이것도 흉내 내야 한다.
    if (!author) return json(res, 400, { error: 'invalid_input', message: '이름을 적어 주세요.' });
    if (!body) return json(res, 400, { error: 'invalid_input', message: '내용을 적어 주세요.' });

    // ── 1층 봇 판별 (api/src/guard/bot.ts 와 같은 규칙) ──
    // 걸리면 **저장하지 않고 201 을 준다.** 봇에게 실패를 알려 주면 조건을 바꿔 다시 온다.
    const opened = Date.parse(String(raw.openedAt ?? ''));
    const tooFast = !Number.isNaN(opened) && Date.now() - opened >= 0 && Date.now() - opened < 3000;
    const honeypot = String(raw.website ?? '').trim() !== '';
    if (honeypot || tooFast || Number.isNaN(opened)) {
      console.log(
        '[대역] 봇으로 판정 — 저장하지 않는다:',
        honeypot ? 'honeypot' : tooFast ? 'too_fast' : 'bad_timestamp',
      );
      return json(res, 201, {
        status: 'visible',
        entry: { id: 0, author, body, createdAt: new Date().toISOString() },
      });
    }

    const verdict = nextResult;
    if (!sticky) nextResult = 'visible';

    // 판정이 걸리는 시간을 흉내 낸다. 이게 없으면 '남기는 중…' 이 보이지 않아
    // 기다리는 동안의 화면을 확인할 수 없다.
    await new Promise((r) => setTimeout(r, 900));

    if (verdict === 'held') {
      return json(res, 202, {
        status: 'held',
        message: '남겨 주셔서 고맙습니다. 확인한 뒤 보이게 됩니다.',
      });
    }
    if (verdict === 'duplicate') {
      return json(res, 409, { error: 'duplicate', message: '방금 남기신 것과 같은 내용입니다.' });
    }
    if (verdict === 'rate_limited') {
      return json(res, 429, {
        error: 'rate_limited',
        message: '잠시 뒤 다시 남겨 주세요.',
        retryAfter: 240,
      });
    }
    if (verdict === 'unavailable') {
      return json(res, 503, {
        error: 'unavailable',
        message: '지금은 글을 남길 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
      });
    }

    const entry = { id: nextId++, author, body, createdAt: new Date().toISOString() };
    entries = [entry, ...entries]; // 최신순
    return json(res, 201, { status: 'visible', entry });
  }

  json(res, 404, { error: 'not_found', message: '그런 길이 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`방명록 대역: http://localhost:${PORT}  (허용 출처 ${ORIGIN})`);
  console.log('다음 제출 바꾸기: curl "localhost:%d/__stub?next=held"', PORT);
});
