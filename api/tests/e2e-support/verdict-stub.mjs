import { createServer } from 'node:http';

/**
 * E2E 용 판정 대역.
 *
 * 왜 필요한가: E2E 는 결과가 매번 같아야 한다. 진짜 판정을 부르면 (1) 같은 글에 다른 답이
 * 올 수 있고 (2) 시험용 문장이 밖으로 나가고 (3) 키가 없으면 전부 보류로 떨어져 "글이
 * 목록에 나타난다" 를 확인할 수 없다.
 *
 * 왜 코드에 우회 스위치를 두지 않았는가: `VERDICT_OFF=1` 같은 환경변수를 만들면 그 값이
 * 운영에 새는 날 방어가 통째로 사라진다. 대신 SDK 가 이미 보는 `ANTHROPIC_BASE_URL` 을
 * 이쪽으로 돌린다 — **`api/src` 는 한 줄도 달라지지 않는다.**
 *
 *   node api/tests/e2e-support/verdict-stub.mjs
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 npm --prefix api run dev
 *
 * 기본은 publish 다. 보류를 확인하는 E2E 는 2층 규칙(링크 셋)으로 만든다 — 그쪽은 애초에
 * 판정까지 가지 않으므로 대역이 무엇을 답하든 상관없다.
 */

const PORT = Number(process.env.VERDICT_STUB_PORT ?? 8787);
const DECISION = process.env.VERDICT_STUB_DECISION ?? 'publish';

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
    res.writeHead(404).end('{}');
    return;
  }

  // 본문은 읽어서 버린다. 읽지 않으면 소켓이 막힌다.
  req.resume();
  req.on('end', () => {
    const verdict = JSON.stringify({
      decision: DECISION,
      reason: '대역 응답',
      score: DECISION === 'publish' ? 0.01 : 0.9,
    });

    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: verdict }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`판정 대역: http://127.0.0.1:${PORT} (decision=${DECISION})`);
});
