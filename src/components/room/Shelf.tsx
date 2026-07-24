import type { Shelf as ShelfData } from '@/lib/schema';
import { BookSpine } from './BookSpine';

/**
 * 책장 하나. 서버 컴포넌트.
 *
 * 평면·미니멀: 나무 캐비닛 없이, 책이 얇은 선반 선 위에 선다. 라벨이 위에 붙는다.
 *
 * 빈 책장도 자리를 지킨 채 "비어 있음"만 드러낸다 (FR-014). 명세가 요구하는 것은
 * 방문자가 고장으로 오해하지 않는 것이지 책장을 감추는 것이 아니다 — 세 책장이
 * 항상 보여야 방의 구조가 전달된다.
 */
export function Shelf({ shelf }: { shelf: ShelfData }) {
  const isEmpty = shelf.books.length === 0;

  return (
    <section className="shelf" aria-labelledby={`shelf-${shelf.slug}`}>
      <h2 className="shelf__name" id={`shelf-${shelf.slug}`}>
        {shelf.name}
      </h2>

      <div className="shelf__plane">
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
      </div>

      <div className="shelf__line" aria-hidden="true" />
    </section>
  );
}
