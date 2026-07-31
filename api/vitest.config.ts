import { defineConfig } from 'vitest/config';

/**
 * 헌장 원칙 IV 가 REQUIRED 로 지목한 것만 덮는다 — 입력 검증, 세 겹 방어, 라우팅.
 * 겉모습은 테스트하지 않는다.
 *
 * 데이터베이스가 필요한 테스트는 실제 PostgreSQL 을 쓴다. 인메모리 흉내는 SQL 방언
 * 차이 때문에 통과해도 운영에서 깨진다. 대신 방어 로직을 순수 함수로 떼어 두어
 * 대부분의 테스트가 DB 없이 돈다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB 를 쓰는 테스트가 서로의 행을 밟지 않도록 파일 단위 순차 실행.
    fileParallelism: false,
  },
});
