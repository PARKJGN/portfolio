// 토큰 원본은 src/styles/tokens.css 의 CSS 사용자 정의 속성이다 (T008).
// 여기서는 그 변수를 참조만 한다 — 색·간격 값을 이 파일에 직접 적지 않는다.
// 헌장 원칙 V: 리터럴 값 금지, 이름 있는 토큰만.
//
// 왜 .ts 가 아니라 .js 인가:
// eslint-plugin-tailwindcss 3.18 이 TypeScript 설정 파일을 읽지 못해
// no-arbitrary-value 규칙이 로드되지 않는다. 그 규칙이 원칙 V 를 강제하는
// 유일한 수단이므로, 설정의 타입 안전성보다 규칙 작동을 택했다.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // T009 에서 tokens.css 의 변수를 여기에 매핑한다.
    },
  },
  plugins: [],
};
