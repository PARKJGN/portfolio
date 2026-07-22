import type { Metadata } from 'next';
import '@/styles/tokens.css'; // 토큰이 먼저 — Tailwind 유틸리티가 이 변수들을 참조한다
import './globals.css';
import '@/styles/room.css';
import '@/styles/book.css';

export const metadata: Metadata = {
  title: '포트폴리오',
  description: '방 안의 책장에서 책을 꺼내 읽는 포트폴리오',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* T010 에서 서브셋 폰트를 연결한다. 그전까지는 시스템 명조 계열로 폴백한다. */}
      <body className="bg-room-wall-bottom font-serif text-room-text">{children}</body>
    </html>
  );
}
