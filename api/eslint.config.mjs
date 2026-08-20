import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * API 전용 린트 설정.
 *
 * 루트 설정은 Next 앱(`src/**`)을 위한 것이라 여기 적용하지 않는다. 대신 루트가 요구하는
 * 것 중 이쪽에도 해당하는 것을 옮겨 왔다 — 특히 **글 내용을 로그에 남기지 않는다**는 규칙이다
 * (계약 참조). 지운 글도 로그에는 남기 때문에, 로그로 새는 경로를 린트로 막는다.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      // console 로 직접 찍으면 로거의 필터를 우회한다. Fastify 로거만 쓴다.
      'no-console': ['error', { allow: ['error'] }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 방문자 입력을 다루는 서비스다. any 로 빠져나가면 검증이 뚫린다.
      '@typescript-eslint/no-explicit-any': 'error',

      'no-restricted-syntax': [
        'error',
        {
          // req.body 를 통째로 로그에 넘기는 형태 — 글 내용이 그대로 남는다.
          selector:
            "CallExpression[callee.property.name=/^(info|warn|debug|trace)$/] Identifier[name='body']",
          message:
            '글 내용을 로그에 남기지 않는다. 지운 글도 로그에는 남는다 — 식별자나 길이만 남길 것.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // 테스트에서는 콘솔 출력이 진단에 쓰인다.
      'no-console': 'off',
    },
  },
  {
    // E2E 를 거들기 위한 순수 Node 스크립트. 서비스 코드가 아니라 서비스 코드의 규칙
    // (로거만 쓰기, any 금지)이 적용되지 않는다.
    files: ['tests/e2e-support/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // 표준 전역을 손으로 적는다. `globals` 패키지를 들이지 않는 이유는 이 목록이
      // 대역 스크립트 두어 개만 위한 것이라서다 — 새 전역을 쓰면 여기 한 줄 더한다.
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
);
