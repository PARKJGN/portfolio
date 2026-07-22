import type { Book } from '@/lib/schema';

const WIDTH_CLASS = {
  narrow: 'spine--narrow',
  medium: 'spine--medium-w',
  wide: 'spine--wide',
} as const;

/**
 * 책등. 서버 컴포넌트라 클라이언트 JS 를 늘리지 않는다.
 *
 * next/link 가 아니라 평범한 <a> 를 쓴다. Link 는 자체 클릭 핸들러로
 * router.push 를 호출하기 때문에 문서 레벨에서 preventDefault 를 해도
 * 이동을 막을 수 없다 — 모달 가로채기(R-3)가 성립하지 않는다.
 * 정적 export 라 클라이언트 라우팅이 주는 이득도 없다.
 */
export function BookSpine({ book }: { book: Book }) {
  const classes = [
    'spine',
    `spine--${book.spine.color}`,
    `spine--${book.spine.height}`,
    WIDTH_CLASS[book.spine.width],
  ].join(' ');

  return (
    <a href={`/books/${book.slug}`} className={classes} data-book-slug={book.slug}>
      {book.year ? <span className="spine__meta">{book.year}</span> : <span />}
      <span className="spine__title">{book.title}</span>
      {book.callNumber ? <span className="spine__meta">{book.callNumber}</span> : <span />}
    </a>
  );
}
