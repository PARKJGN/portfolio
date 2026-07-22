import type { Shelf as ShelfData } from '@/lib/schema';
import { BookSpine } from './BookSpine';

/**
 * 책장 하나. 서버 컴포넌트.
 *
 * 빈 책장은 제목을 유지한 채 "비어 있음"을 드러낸다 (FR-014).
 * 명세가 요구하는 것은 "방문자가 고장으로 오해하지 않는 것"이지
 * 책장을 감추는 것이 아니다 — 세 책장이 항상 보여야 방의 구조가 전달된다.
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
