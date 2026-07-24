import type { Book } from '@/lib/schema';

const WIDTH_CLASS = {
  narrow: 'spine--narrow',
  medium: 'spine--medium-w',
  wide: 'spine--wide',
} as const;

/**
 * 책등. 서버 컴포넌트라 클라이언트 JS 를 늘리지 않는다.
 *
 * 평면·미니멀: 색면 위에 세로 제목만. 연도·청구기호는 책등에서 빼 여백을 살리고,
 * 그 정보는 펼친 책 안에서 보여준다.
 *
 * next/link 가 아니라 평범한 <a> 를 쓴다. Link 는 자체 클릭 핸들러로 router.push 를
 * 호출해 문서 레벨 preventDefault 로 막을 수 없다 — 모달 가로채기(R-3)가 성립하지
 * 않는다. 정적 export 라 클라이언트 라우팅의 이득도 없다.
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
      {/* 페이지 단면(책 머리) */}
      <span className="spine__cap" aria-hidden="true" />
      {/* 연도·청구기호. 없어도 빈 자리를 둬 제목이 가운데 오게 한다. */}
      <span className="spine__meta">{book.year ?? ''}</span>
      <span className="spine__title">{book.title}</span>
      <span className="spine__meta">{book.callNumber ?? ''}</span>
    </a>
  );
}
