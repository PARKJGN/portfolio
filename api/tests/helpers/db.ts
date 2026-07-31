import pg from 'pg';
import { migrate } from '../../src/db/migrate.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { loadConfig, type Config } from '../../src/config.js';

/**
 * 테스트용 데이터베이스.
 *
 * 개발용 `portfolio` 를 쓰지 않는다 — 테스트가 표를 비우므로 작업하던 데이터가 사라진다.
 * 대신 `portfolio_test` 를 따로 만들어 쓴다. 실제 PostgreSQL 을 쓰는 이유는 인메모리
 * 흉내로는 CHECK 제약과 SQL 방언을 검증할 수 없기 때문이다(vitest.config.ts 주석 참조).
 */

const TEST_DB = 'portfolio_test';

export function testConfig(): Config {
  const base = loadConfig();
  return { ...base, nodeEnv: 'test', db: { ...base.db, database: TEST_DB } };
}

/** 테스트 데이터베이스를 만들고(없으면) 마이그레이션을 올린 풀을 돌려준다. */
export async function setupTestDb(): Promise<Pool> {
  const base = loadConfig();

  // CREATE DATABASE 는 트랜잭션 밖에서만 되고 다른 데이터베이스에 붙어 실행해야 한다.
  const admin = new pg.Client({ ...base.db });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB,
    ]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }

  const pool = createPool(testConfig());
  await migrate(pool, () => {});
  return pool;
}

/** 표를 비운다. 테스트마다 같은 자리에서 시작하기 위해서다. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE guestbook_entry, abuse_mark RESTART IDENTITY');
}
