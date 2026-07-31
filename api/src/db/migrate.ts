import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool, type Pool } from './pool.js';
import { loadConfig } from '../config.js';
import { isMainModule } from '../main-module.js';

/**
 * 번호를 붙인 SQL 파일을 순서대로 한 번씩 적용한다.
 *
 * oneBite 는 Flyway 를 쓰지만 그것은 JVM 도구다. 같은 일을 Node 쪽에서 최소로 한다
 * (research.md R-5). `CREATE TABLE IF NOT EXISTS` 만으로는 두 번째 변경에서 막힌다.
 *
 * 규칙:
 *  - 파일 이름은 `001_설명.sql` 처럼 번호로 시작한다. 이름순 정렬이 곧 적용 순서다.
 *  - 이미 적용한 파일은 **고치지 않는다.** 바꿀 것이 생기면 새 번호로 추가한다.
 *  - 파일 하나가 트랜잭션 하나다. 중간에 실패하면 그 파일은 통째로 되돌아간다.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name        text        PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`;

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(pool: Pool, log: (msg: string) => void): Promise<MigrateResult> {
  await pool.query(CREATE_LEDGER);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(MIGRATIONS_DIR + file, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      log(`적용: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`마이그레이션 실패: ${file}\n${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}

/** `npm run migrate` 진입점. 서버 기동과 분리해 두어 배포 순서를 손으로 정할 수 있다. */
async function main(): Promise<void> {
  const pool = createPool(loadConfig());
  try {
    const result = await migrate(pool, (msg) => process.stdout.write(`${msg}\n`));
    const summary =
      result.applied.length === 0
        ? `적용할 것이 없다 (이미 ${result.skipped.length}개 적용됨)`
        : `${result.applied.length}개 적용, ${result.skipped.length}개 건너뜀`;
    process.stdout.write(`${summary}\n`);
  } finally {
    await pool.end();
  }
}

// 직접 실행됐을 때만 돈다. 테스트에서 import 할 때는 돌지 않는다.
if (isMainModule(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
