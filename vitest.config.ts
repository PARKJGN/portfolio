import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 헌장 원칙 IV: 테스트는 위험을 따른다.
// 여기서 도는 것은 로직뿐이다 — 콘텐츠 스키마 검증, 슬러그 해석, 보기 모드 상태.
// 표현용 마크업의 스냅샷 테스트는 만들지 않는다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
