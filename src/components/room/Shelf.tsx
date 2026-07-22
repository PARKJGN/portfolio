import type { Shelf as ShelfData } from '@/lib/schema';
import { BookSpine } from './BookSpine';
import { ShelfDecor } from './ShelfDecor';

/**
 * 책장 하나. 서버 컴포넌트.
 *
 * 위 칸은 장식이고 아래 칸이 실제 책이다. 두 칸의 높이를 고정해 책 권수나
 * 책등 크기와 무관하게 모든 책장이 같은 크기로 선다 — 그러지 않으면 책장들이
 * 계단처럼 들쭉날쭉해진다.
 *
 * 빈 책장도 같은 크기를 유지한 채 "비어 있음"만 드러낸다 (FR-014).
 * 명세가 요구하는 것은 방문자가 고장으로 오해하지 않는 것이지 책장을 감추는 것이
 * 아니다 — 세 책장이 항상 보여야 방의 구조가 전달된다.
 */
export function Shelf({ shelf }: { shelf: ShelfData }) {
  const isEmpty = shelf.books.length === 0;

  return (
    <section className="shelf" aria-labelledby={`shelf-${shelf.slug}`}>
      <h2 className="shelf__name" id={`shelf-${shelf.slug}`}>
        {shelf.name}
      </h2>

      <div className="shelf__plank" aria-hidden="true" />

      <div className="shelf__cabinet">
        <ShelfDecor seed={shelf.slug} />
        <div className="shelf__divider" aria-hidden="true" />

        {isEmpty ? (
          <p className="shelf__empty">{shelf.emptyMessage ?? '아직 준비 중입니다.'}</p>
        ) : (
          <ul className="shelf__books">
            {shelf.books.map((book) => (
              <li key={book.slug}>
                <BookSpine book={book} />
              </li>
            ))}
          </ul>
        )}

        <div className="shelf__base" aria-hidden="true" />
      </div>
    </section>
  );
}
