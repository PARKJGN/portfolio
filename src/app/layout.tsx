import type { Metadata } from 'next';
import { preload } from 'react-dom';
import '@/styles/fonts.css'; // @font-face 가 먼저 — 토큰이 이 이름을 참조한다
import '@/styles/tokens.css'; // 토큰이 먼저 — Tailwind 유틸리티가 이 변수들을 참조한다
import './globals.css';
import '@/styles/room.css';
import '@/styles/book.css';
import '@/styles/guestbook.css';
import { STORAGE_KEY, DEFAULT_VIEW_MODE, VIEW_MODES } from '@/lib/view-mode';

export const metadata: Metadata = {
  title: '포트폴리오',
  description: '방 안의 책장에서 책을 꺼내 읽는 포트폴리오',
};

/**
 * 저장된 보기 방식을 첫 페인트 전에 적용한다. 없으면 화면이 한 번 그려진 뒤
 * 모드가 바뀌면서 깜빡인다.
 *
 * 이 속성이 붙지 않았다는 것은 JS 가 돌지 않았다는 뜻이고, 그때 본문은 기본
 * 스타일 — 전체가 이어진 형태 — 로 읽힌다. 한 장씩 넘기기는 버튼이 있어야
 * 성립하므로 JS 없는 방문자에게 기본값으로 주면 안 된다 (헌장 원칙 I).
 */
const applyStoredViewMode = `
try {
  var m = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  document.documentElement.dataset.viewMode =
    ${JSON.stringify(VIEW_MODES)}.indexOf(m) >= 0 ? m : ${JSON.stringify(DEFAULT_VIEW_MODE)};
} catch (e) {
  document.documentElement.dataset.viewMode = ${JSON.stringify(DEFAULT_VIEW_MODE)};
}
`.trim();

/**
 * 본문 글꼴을 미리 받는다.
 *
 * 없을 때 모바일 FCP 가 1667ms 였다. preload 가 없으면 브라우저는 CSS 를 받아 파싱하고
 * 배치를 계산한 뒤에야 글꼴이 필요하다는 것을 안다. 미리 알려 주니 908ms 로 줄었다.
 *
 * JSX 로 <link> 를 직접 쓰지 않는 이유: React 가 그것을 head 로 올리면서 원본도 남겨
 * **같은 preload 가 두 번** 들어갔다. 이 함수는 하나만 남긴다.
 *
 * 400 만 받는다. 책등도 본문도 400 이고(실측: 700 은 첫 화면에서 아예 요청되지 않는다),
 * 700 까지 받으면 292KB 를 첫 화면 대역폭에 얹는 셈이라 오히려 손해다.
 */
function preloadBodyFont() {
  preload('/fonts/noto-serif-kr-400.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  });
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  preloadBodyFont();

  return (
    // suppressHydrationWarning 이 필요한 이유: 아래 인라인 스크립트가 하이드레이션 전에
    // <html> 에 data-view-mode 를 붙인다. 서버 HTML 에는 없는 속성이라 React 가 불일치로
    // 보고 트리를 통째로 다시 그린다. 이 속성은 의도적으로 클라이언트가 붙이는 것이다.
    <html lang="ko" suppressHydrationWarning>
      {/* T010 에서 서브셋 폰트를 연결한다. 그전까지는 시스템 명조 계열로 폴백한다. */}
      <body className="bg-room-wall-bottom font-serif text-room-text">
        <script dangerouslySetInnerHTML={{ __html: applyStoredViewMode }} />
        {children}
      </body>
    </html>
  );
}
