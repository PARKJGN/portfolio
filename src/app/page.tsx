import { getShelves, getBookNeighbors } from '@/lib/content';
import { assertFeatureReadiness } from '@/lib/schema';
import { Shelf } from '@/components/room/Shelf';
import { ShelfNav } from '@/components/room/ShelfNav';
import { BookContent } from '@/components/book/BookContent';
import { BookController } from '@/components/book/BookController';

/**
 * 방 — 사이트의 첫 화면.
 *
 * 책 내용을 전부 이 페이지에 <dialog> 로 미리 렌더해 둔다. 클릭 시 가져올 것이
 * 없으므로 즉시 열리고, 네트워크 실패 경로도 없다. 서버 컴포넌트라 이 내용들은
 * 클라이언트 JS 를 늘리지 않는다 — HTML 이 조금 커질 뿐이고 그건 압축된다.
 */
export default function RoomPage() {
  const shelves = getShelves();

  // FR-022 — 프로필 책장에 실제 내용을 가진 책이 최소 1권. 없으면 빌드가 멈춘다.
  assertFeatureReadiness(shelves);

  const books = shelves.flatMap((s) => s.books);

  return (
    <main className="room">
      <h1 className="room__title">서재</h1>

      <ShelfNav shelves={shelves} />

      {/* role="list" 를 흉내내지 않고 진짜 ul/li 를 쓴다 — 낭독기와 검사 도구
          양쪽에서 군더더기가 없다. */}
      <ul className="shelf-row">
        {shelves.map((shelf) => (
          <li key={shelf.slug} className="shelf-row__item" data-shelf-slug={shelf.slug}>
            <Shelf shelf={shelf} />
          </li>
        ))}
      </ul>

      {books.map((book) => {
        const { prev, next } = getBookNeighbors(book.slug);
        return (
          <dialog
            key={book.slug}
            id={`book-dialog-${book.slug}`}
            className="book-dialog"
            aria-labelledby={`book-title-${book.slug}`}
          >
            <BookContent
              book={book}
              prev={prev}
              next={next}
              onCloseSlot={
                <form method="dialog">
                  <button type="submit" className="book__close">
                    덮기
                  </button>
                </form>
              }
            />
          </dialog>
        );
      })}

      <BookController />
    </main>
  );
}
