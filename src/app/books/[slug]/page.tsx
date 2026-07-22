import Link from 'next/link';

// T007 측정 전용 스텁 — 실제 책 페이지는 T022 에서 만든다.
export function generateStaticParams() {
  return [{ slug: 'stub' }];
}

// Next 15 부터 params 는 Promise 다. 정적 export 에서도 동일하다.
export default async function BookStubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main>
      <h1>책: {slug} (측정용 스텁)</h1>
      <p>이 페이지는 JS 없이도 읽혀야 한다.</p>
      <Link href="/">방으로 돌아가기</Link>
    </main>
  );
}
