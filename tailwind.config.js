// 토큰 원본은 src/styles/tokens.css 의 CSS 사용자 정의 속성이다.
// 여기서는 그 변수를 이름에 매핑만 한다 — 색·간격 리터럴을 이 파일에 적지 않는다.
// 헌장 원칙 V: 리터럴 값 금지, 이름 있는 토큰만.
//
// 왜 .ts 가 아니라 .js 인가: 과거 eslint-plugin-tailwindcss 가 TS 설정을 읽지 못했다.
// 플러그인은 이제 걷어냈지만(eslint.config.mjs 참조) 굳이 되돌릴 이유가 없어 유지한다.

const v = (name) => `var(--${name})`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        spine: {
          'crimson-bg': v('spine-crimson-bg'),
          'crimson-fg': v('spine-crimson-fg'),
          'walnut-bg': v('spine-walnut-bg'),
          'walnut-fg': v('spine-walnut-fg'),
          'sand-bg': v('spine-sand-bg'),
          'sand-fg': v('spine-sand-fg'),
          'olive-bg': v('spine-olive-bg'),
          'olive-fg': v('spine-olive-fg'),
          'parchment-bg': v('spine-parchment-bg'),
          'parchment-fg': v('spine-parchment-fg'),
          'ink-bg': v('spine-ink-bg'),
          'ink-fg': v('spine-ink-fg'),
          'oak-bg': v('spine-oak-bg'),
          'oak-fg': v('spine-oak-fg'),
          'brick-bg': v('spine-brick-bg'),
          'brick-fg': v('spine-brick-fg'),
          'wine-bg': v('spine-wine-bg'),
          'wine-fg': v('spine-wine-fg'),
        },
        room: {
          'wall-top': v('room-wall-top'),
          'wall-bottom': v('room-wall-bottom'),
          text: v('room-wall-text'),
          'floor-top': v('room-floor-top'),
          'floor-bottom': v('room-floor-bottom'),
          rail: v('room-rail'),
        },
        cabinet: {
          body: v('cabinet-body'),
          edge: v('cabinet-edge'),
          'plank-top': v('cabinet-plank-top'),
          'plank-bottom': v('cabinet-plank-bottom'),
          'plank-highlight': v('cabinet-plank-highlight'),
        },
        page: {
          DEFAULT: v('page-bg'),
          edge: v('page-bg-edge'),
          text: v('page-text'),
          caption: v('page-caption'),
          accent: v('page-accent'),
          rule: v('page-rule'),
        },
        backdrop: v('backdrop'),
      },
      spacing: {
        1: v('space-1'),
        2: v('space-2'),
        3: v('space-3'),
        4: v('space-4'),
        6: v('space-6'),
        8: v('space-8'),
        12: v('space-12'),
        16: v('space-16'),
      },
      fontFamily: {
        serif: v('font-serif'),
      },
      fontSize: {
        xs: v('text-xs'),
        sm: v('text-sm'),
        base: v('text-base'),
        lg: v('text-lg'),
        xl: v('text-xl'),
        '2xl': v('text-2xl'),
        '3xl': v('text-3xl'),
      },
      lineHeight: {
        body: v('leading-body'),
        tight: v('leading-tight'),
      },
      borderRadius: {
        none: v('radius-none'),
        sm: v('radius-sm'),
      },
      boxShadow: {
        book: v('shadow-book'),
        open: v('shadow-open'),
      },
      transitionDuration: {
        fast: v('motion-fast'),
        base: v('motion-base'),
        slow: v('motion-slow'),
      },
    },
  },
  plugins: [],
};
