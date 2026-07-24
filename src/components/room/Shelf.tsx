import type { Shelf as ShelfData } from '@/lib/schema';
import { BookSpine } from './BookSpine';

/**
 * 책장 하나. 서버 컴포넌트.
 *
 * 모던 책장: 얇은 틀로 짠 열린 칸(box) 안에 책이 선다. 칸의 아래 틀이 선반이 된다.
 * 안쪽 패널을 벽보다 살짝 짙게 해 오목한 깊이를 준다.
 *
 * 빈 책장도 칸을 유지한 채 "비어 있음"만 드러낸다 (FR-014).
 */
export function Shelf({ shelf }: { shelf: ShelfData }) {
  const isEmpty = shelf.books.length === 0;

  return (
    <section className="shelf" aria-labelledby={`shelf-${shelf.slug}`}>
      <h2 className="shelf__name" id={`shelf-${shelf.slug}`}>
        {shelf.name}
      </h2>

      <div className="shelf__box">
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
    </section>
  );
}
