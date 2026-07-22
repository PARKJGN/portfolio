import Link from 'next/link';
import { StubDialog } from '@/components/book/StubDialog';

// T007 측정 전용 스텁 — 실제 방 화면은 T021 에서 만든다.
export default function RoomStubPage() {
  return (
    <main>
      <h1>방 (측정용 스텁)</h1>
      <Link href="/books/stub">책 열기</Link>
      <StubDialog />
    </main>
  );
}
