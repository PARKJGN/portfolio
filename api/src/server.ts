import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, type Config } from './config.js';
import { createPool, type Pool } from './db/pool.js';
import { hashClient, startPurgeLoop } from './db/abuse.js';
import { createJudge, type Judge } from './guard/verdict.js';
import { ApiError, registerErrorHandler } from './errors.js';
import { registerHealthRoute } from './routes/health.js';
import { registerEntryRoutes } from './routes/entries.js';
import { registerAdminRoutes } from './routes/admin.js';
import { isMainModule } from './main-module.js';

/**
 * 방명록 API.
 *
 * 로그에 대해: **글 내용과 이름을 남기지 않는다.** 방문자가 글을 지워 달라고 해서 지워도
 * 로그에 남아 있으면 지운 것이 아니다. 아래 redact 로 요청 본문 계열을 통째로 가리고,
 * 코드에서도 본문을 로그에 넘기지 않는다(린트 규칙이 흔한 형태를 막는다).
 */

export interface BuiltServer {
  app: FastifyInstance;
  pool: Pool;
  config: Config;
}

export interface ServerDeps {
  /**
   * 3층 판정. 테스트는 여기에 가짜를 끼운다 — 끼우지 않으면 테스트가 실제 판정 API 를
   * 부르게 되고, 느려지는 것보다 나쁜 것은 방문자 글이 아닌 시험용 문장이 밖으로 나가는
   * 것이다.
   */
  judge?: Judge;
  /**
   * 순간 폭주 막이의 분당 상한. 테스트만 넘긴다 — 낮게 두지 않으면 걸린 모습을 볼 수 없고,
   * 테스트 기본값을 낮게 두면 다른 테스트가 전부 여기 걸린다.
   */
  burstMax?: number;
}

export async function buildServer(
  config: Config = loadConfig(),
  deps: ServerDeps = {},
): Promise<BuiltServer> {
  const app = Fastify({
    // 테스트에서는 로그를 끈다. 켜 두면 실패한 단언이 요청 로그에 파묻힌다.
    logger: config.nodeEnv === 'test' ? false : {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      redact: {
        paths: [
          'req.body',
          'req.headers.authorization',
          'req.headers.cookie',
          'body',
          'author',
          'entry.body',
        ],
        remove: true,
      },
      // 요청 로그에서도 본문은 빠진다. 남기는 것은 메서드·경로·상태·소요시간뿐이다.
      serializers: {
        req(req) {
          return { method: req.method, url: req.url };
        },
      },
    },
    // 프록시(인그레스) 뒤에 있으므로 X-Forwarded-* 를 신뢰해야 접속 주소를 알 수 있다.
    // 그 값은 해시해서만 쓴다 — 원문을 저장하지 않는다(FR-020).
    trustProxy: true,
    bodyLimit: 16 * 1024,
  });

  await app.register(cors, {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
  });

  /**
   * 순간 폭주 막이.
   *
   * 시간당 제한은 데이터베이스가 센다(재시작해도 남아야 하므로). 이쪽은 메모리에 두고
   * 1분 단위로만 본다 — 초당 수십 번 두드리는 것을 데이터베이스까지 보내지 않기 위해서다.
   * 열쇠는 주소가 아니라 해시다. 메모리에도 원문을 두지 않는다(FR-020).
   */
  await app.register(rateLimit, {
    // 테스트는 한 주소에서 수백 번 두드린다. 여기서 막으면 검증하려던 것이 아니라
    // 이 막이에 걸려 실패한다. 시간당 제한(데이터베이스 쪽)은 테스트에서도 그대로 돈다.
    max: deps.burstMax ?? (config.nodeEnv === 'test' ? 100_000 : config.rateLimit.burstMax),
    timeWindow: '1 minute',
    keyGenerator: (req) => hashClient(req.ip, config.clientHashSalt),
    // 평범한 객체를 돌려주면 우리 오류 처리기가 알아보지 못해 **429 가 아니라 500** 이
    // 나간다 — 실제로 그랬다. 방문자는 "문제가 생겼습니다" 를 보고 될 때까지 다시 누르고,
    // 로그는 진짜가 아닌 오류로 찬다. ApiError 로 던져야 형태와 상태가 맞는다.
    errorResponseBuilder: (_req, context) =>
      new ApiError('rate_limited', '잠시 뒤 다시 남겨 주세요.', Math.ceil(context.ttl / 1000)),
  });

  const pool = createPool(config, (err) => {
    app.log.error({ err: err.message }, 'db idle client error');
  });

  const judge = deps.judge ?? createJudge(config.verdict);

  registerErrorHandler(app);
  registerHealthRoute(app, pool);
  registerEntryRoutes(app, pool, { config, judge });
  registerAdminRoutes(app, pool, { config });

  // 만료된 남용 흔적 청소 (T054). 테스트에서는 돌리지 않는다 — 표를 비우는 것과 겹치면
  // 무엇이 지웠는지 흐려지고, 얻는 것도 없다.
  const stopPurge =
    config.nodeEnv === 'test'
      ? () => {}
      : startPurgeLoop(pool, {
          onPurged: (count) => app.log.info({ count }, 'expired abuse marks purged'),
          onError: (err) =>
            app.log.warn({ err: err instanceof Error ? err.message : err }, 'abuse purge failed'),
        });

  app.addHook('onClose', async () => {
    stopPurge();
    await pool.end();
  });

  return { app, pool, config };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { app } = await buildServer(config);

  const shutdown = (signal: string) => {
    app.log.info({ signal }, '종료 신호 — 정리하고 내려간다');
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // 컨테이너 안에서는 루프백이 아니라 모든 인터페이스에 붙어야 밖에서 닿는다.
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

if (isMainModule(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
