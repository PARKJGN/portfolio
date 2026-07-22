import next from 'eslint-config-next/core-web-vitals';

// 헌장 원칙 V(One Design System) 강제.
//
// 원래 eslint-plugin-tailwindcss 의 no-arbitrary-value 규칙을 썼으나 걷어냈다.
// 그 플러그인은 ESLint 9 를 지원하는 버전(4.x)이 Tailwind 4 를 요구하는데,
// Tailwind 4 는 CSS-first 재작성이라 지금 감당할 변화가 아니다. 게다가 3.18.3 에서
// 이미 한 번 규칙 로딩이 깨진 전력이 있다.
//
// 그래서 의존성 없이 직접 막는다. 아래 세 가지가 리터럴 값이 스며드는 주요 경로다.
//
// 한계: 동적으로 조립된 클래스 문자열(clsx(cond && `p-[${n}px]`) 같은 형태)은
// 잡지 못한다. 정적 문자열과 템플릿 리터럴까지가 이 방식의 사정거리다.
const designSystemRules = {
  'no-restricted-syntax': [
    'error',
    {
      // className="bg-[#ae1800]" / "p-[13px]"
      selector: "JSXAttribute[name.name='className'] > Literal[value=/\\[.+\\]/]",
      message:
        '임의값 클래스는 금지다. src/styles/tokens.css 에 이름 있는 토큰을 정의하고 그것을 쓸 것 (헌장 원칙 V).',
    },
    {
      // className={`... p-[13px] ...`}
      selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/\\[.+\\]/]",
      message:
        '임의값 클래스는 금지다. src/styles/tokens.css 에 이름 있는 토큰을 정의하고 그것을 쓸 것 (헌장 원칙 V).',
    },
    {
      // style={{ color: '#ae1800' }} — 시안이 인라인 hex 를 수십 개 쓰고 있어 특히 위험한 경로
      selector: "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
      message:
        '인라인 색상 리터럴은 금지다. tokens.css 의 토큰을 참조할 것 (헌장 원칙 V).',
    },
  ],
};

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'next-env.d.ts',
      // Claude Design 시안과 그 런타임. 우리가 작성한 코드가 아니고
      // 빌드에도 들어가지 않는다. 참고 자료로만 저장소에 둔다.
      'design/**',
    ],
  },
  ...next,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      ...designSystemRules,

      // next/link 대신 <a> 를 쓰는 것은 이 프로젝트의 의도적 결정이다.
      //  1) Link 는 자체 클릭 핸들러로 router.push 를 호출해, 문서 레벨에서
      //     preventDefault 를 해도 이동을 막을 수 없다. 책 링크를 가로채
      //     모달로 여는 구조(R-3)가 성립하지 않는다.
      //  2) output: 'export' 정적 사이트라 클라이언트 라우팅이 주는 이득이 없다.
      //  3) 평범한 <a> 여야 JS 없이도 동작한다 (헌장 원칙 I).
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];

export default config;
