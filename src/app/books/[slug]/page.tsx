import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBook, getBookSlugs, getBookNeighbors } from '@/lib/content';
import { BookContent } from '@/components/book/BookContent';
import { BookController } from '@/components/book/BookController';

/**
 * 책 한 권의 정본 페이지.
 *
 * 이 페이지가 존재하는 것이 R-3 결정의 핵심이다 — 방의 모달은 이 페이지를
 * 가로채는 향상일 뿐이고, JS 가 없으면 방문자는 그냥 여기로 온다.
 * 공유받은 주소로 들어와도 추가 조작 없이 바로 읽힌다 (FR-012).
 */
export function generateStaticParams() {
  return getBookSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const book = getBook(slug);
  if (!book) return {};
  return { title: book.title, description: book.summary };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = getBook(slug);
  if (!book) notFound();

  const { prev, next } = getBookNeighbors(slug);

  return (
    <main className="book-page">
      <BookContent book={book} prev={prev} next={next} />
      <BookController />
    </main>
  );
}
