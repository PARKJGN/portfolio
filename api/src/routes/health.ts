import type { FastifyInstance } from 'fastify';
import { ping, type Pool } from '../db/pool.js';

/**
 * 살아 있는지 확인한다 (contracts/guestbook-api.md).
 *
 * 프로세스가 떠 있는 것만으로는 부족하다. 데이터베이스에 닿지 못하면 이 서비스는 아무것도
 * 할 수 없으므로 503 을 준다 — 네임스페이스를 건너가는 접속이라 더욱 확인할 값이 있다.
 */
export function registerHealthRoute(app: FastifyInstance, pool: Pool): void {
  app.get('/api/health', async (_req, reply) => {
    const ok = await ping(pool);
    return reply.status(ok ? 200 : 503).send({ ok });
  });
}
