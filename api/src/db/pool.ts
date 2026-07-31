import pg from 'pg';
import type { Config } from '../config.js';

/**
 * PostgreSQL 커넥션 풀.
 *
 * 이 인스턴스는 oneBite 와 공유한다 — 데이터베이스와 롤만 분리돼 있다(research.md R-6).
 * 남의 서비스와 같은 서버를 쓰므로 커넥션을 넉넉히 잡지 않는다. 방명록은 하루 몇 건이라
 * 소수로 충분하고, 여유를 남기는 편이 이웃에게 예의다.
 */

export type Pool = pg.Pool;

export function createPool(config: Config, onError?: (err: Error) => void): Pool {
  const pool = new pg.Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // 질의가 매달려 풀을 잠그는 것을 막는다. 방명록 질의는 전부 짧다.
    statement_timeout: 5_000,
  });

  // 유휴 커넥션이 끊기면(데이터베이스 재시작·네트워크 단절) 풀이 'error' 를 던진다.
  // **듣는 사람이 없으면 Node 가 프로세스를 죽인다.** 데이터베이스는 oneBite 와 공유하고
  // 그쪽 파드는 Recreate 전략이라 재시작이 언제든 있다 — 그때마다 방명록이 함께 죽으면
  // 안 된다. 여기서 받아 두면 풀이 끊긴 커넥션을 버리고 다음 요청에 새로 만든다.
  pool.on('error', (err: Error) => {
    if (onError) onError(err);
    else console.error(`[db] 유휴 커넥션 오류: ${err.message}`);
  });

  return pool;
}

/** 데이터베이스에 닿는지 확인한다. `/api/health` 가 쓴다. */
export async function ping(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
