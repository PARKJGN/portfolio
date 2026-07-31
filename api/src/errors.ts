import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * 오류 응답의 형태는 하나다 (contracts/guestbook-api.md).
 *
 *   { "error": "rate_limited", "message": "잠시 뒤 다시 남겨 주세요.", "retryAfter": 240 }
 *
 * `message` 는 **그대로 방문자에게 보여도 되는 문구**여야 한다. 화면이 오류 코드를 보고
 * 문구를 새로 지어내면 두 곳에서 말이 갈린다 — 서버가 정한 말을 그대로 쓴다 (원칙 II).
 */

export type ErrorCode =
  | 'invalid_input'
  | 'duplicate'
  | 'rate_limited'
  | 'unauthorized'
  | 'not_found'
  | 'invalid_state'
  | 'unavailable'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  duplicate: 409,
  rate_limited: 429,
  unauthorized: 401,
  not_found: 404,
  invalid_state: 409,
  unavailable: 503,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly retryAfter: number | undefined;

  constructor(code: ErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = STATUS[code];
    this.retryAfter = retryAfter;
  }
}

export const invalidInput = (message: string) => new ApiError('invalid_input', message);
export const duplicate = () =>
  new ApiError('duplicate', '방금 남기신 것과 같은 내용입니다.');
export const rateLimited = (retryAfterSeconds: number) =>
  new ApiError('rate_limited', '잠시 뒤 다시 남겨 주세요.', retryAfterSeconds);
export const unauthorized = () => new ApiError('unauthorized', '권한이 없습니다.');
export const notFound = () => new ApiError('not_found', '그런 글이 없습니다.');
export const invalidState = (message: string) => new ApiError('invalid_state', message);
export const unavailable = () =>
  new ApiError('unavailable', '지금은 글을 남길 수 없습니다. 잠시 뒤 다시 시도해 주세요.');

interface ErrorBody {
  error: ErrorCode;
  message: string;
  retryAfter?: number;
}

/**
 * 모든 오류를 위 형태로 바꿔 내보낸다.
 *
 * 예상하지 못한 오류는 내부 사정을 방문자에게 흘리지 않는다 — 로그에만 남긴다. 다만
 * **글 내용은 로그에도 남기지 않는다**(계약 참조). 지운 글도 로그에는 남기 때문이다.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  // 없는 경로도 우리 형태로 답한다. 두지 않으면 Fastify 기본 형태
  // (`{message, error: "Not Found", statusCode}`)가 나가 계약과 어긋난다.
  app.setNotFoundHandler((_req, reply) => {
    void reply
      .status(404)
      .send({ error: 'not_found', message: '그런 곳이 없습니다.' } satisfies ErrorBody);
  });

  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ApiError) {
      const body: ErrorBody = { error: err.code, message: err.message };
      if (err.retryAfter !== undefined) {
        body.retryAfter = err.retryAfter;
        void reply.header('retry-after', String(err.retryAfter));
      }
      void reply.status(err.statusCode).send(body);
      return;
    }

    // Fastify 의 스키마 검증 실패. 어떤 칸이 문제인지는 알려 주되 값은 담지 않는다.
    const maybe = err as { validation?: unknown; statusCode?: number; message?: string };
    if (maybe.validation) {
      void reply
        .status(400)
        .send({ error: 'invalid_input', message: '입력을 다시 확인해 주세요.' } satisfies ErrorBody);
      return;
    }

    // Fastify 가 직접 만드는 4xx — 본문이 상한을 넘음, content-length 불일치, 다루지 못하는
    // 미디어 타입. 보낸 쪽 잘못인데 500 으로 답하면 "서버가 고장 났다" 는 거짓말이 되고,
    // 화면은 재시도해도 소용없는 것을 재시도한다. 상태는 살리되 문구는 우리가 정한다.
    if (
      typeof maybe.statusCode === 'number' &&
      maybe.statusCode >= 400 &&
      maybe.statusCode < 500
    ) {
      void reply
        .status(maybe.statusCode)
        .send({ error: 'invalid_input', message: '입력을 다시 확인해 주세요.' } satisfies ErrorBody);
      return;
    }

    req.log.error({ err }, 'unhandled error');
    void reply
      .status(500)
      .send({ error: 'internal', message: '문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' } satisfies ErrorBody);
  });
}
