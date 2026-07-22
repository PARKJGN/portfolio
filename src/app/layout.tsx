import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '포트폴리오',
  description: '방 안의 책장에서 책을 꺼내 읽는 포트폴리오',
};

// T015 에서 서브셋 폰트와 토큰 스타일을 여기에 연결한다.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
