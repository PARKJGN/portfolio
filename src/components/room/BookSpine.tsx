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
 * <button> 이다. 책은 3D/모달로만 열리고 이동할 정적 페이지가 없으므로, 링크가
 * 아니라 버튼이 의미상 옳다 — 이 자리에서 무언가를 여는 조작이다. 클릭 동작은
 * BookController 가 문서 레벨에서 위임받는다(R-3).
 */
export function BookSpine({ book }: { book: Book }) {
  const classes = [
    'spine',
    `spine--${book.spine.color}`,
    `spine--${book.spine.height}`,
    WIDTH_CLASS[book.spine.width],
  ].join(' ');

  return (
    <button type="button" className={classes} data-book-slug={book.slug}>
      {/* 페이지 단면(책 머리) */}
      <span className="spine__cap" aria-hidden="true" />
      {/* 위에 연도. 아래는 빈 자리를 둬 제목이 가운데 오게 한다(청구기호 제거). */}
      <span className="spine__meta">{book.year ?? ''}</span>
      <span className="spine__title">{book.title}</span>
      <span className="spine__meta" aria-hidden="true" />
    </button>
  );
}
