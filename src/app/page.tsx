import { getShelves, getBookNeighbors } from '@/lib/content';
import { assertFeatureReadiness } from '@/lib/schema';
import { Shelf } from '@/components/room/Shelf';
import { ShelfNav } from '@/components/room/ShelfNav';
import { RoomScene } from '@/components/room/RoomScene';
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
      <RoomScene />

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
            // 리더 방식을 책이 스스로 표시한다. BookController 가 이것을 보고 3D 를 건너뛴다.
            // 이름이 data-reader 가 아닌 이유: 그쪽은 컨트롤러가 "3D 리더 동작 중"을
            // 나타내는 런타임 표시라, 같은 이름을 쓰면 본문을 감추는 규칙이 함께 걸린다.
            data-reader-mode={book.reader ?? '3d'}
            // 방명록은 폼과 목록이 들어가 단 나눔·장 넘김에 맞지 않는다(guestbook.css).
            {...(book.guestbook ? { 'data-guestbook': '' } : {})}
          >
            {/* 열 때 이 표지가 경첩처럼 펼쳐지며 내용이 드러난다(book.css). 장식이라 aria-hidden. */}
            <div className="book-stage">
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
              {/* 표지 — 닫힌 책은 오른쪽 한 면(가로 절반)뿐이다. 이 앞장이 가운데
                  책등을 경첩으로 왼쪽으로 넘어가며 그 뒷면이 왼쪽 페이지가 되고,
                  동시에 책이 반쪽에서 두 면 전체로 벌어진다. 장식이라 aria-hidden. */}
              <div className="book__cover" aria-hidden="true">
                {/* 넘어가는 잎 — 바깥(leaf)은 페이드, 안쪽(inner)은 회전. 둘을 나눠야
                    opacity 가 3D 를 평면화하지 않아 뒷면(페이지) 전환이 된다. */}
                <span className="book__cover-leaf">
                  <span className="book__cover-leaf-inner">
                    {/* 앞면 = 표지(글자). 넘어가 90°를 지나면 사라지며 그 아래 실제
                        내용이 바로 드러난다(빈 뒷면을 두지 않는다). */}
                    <span className={`book__cover-leaf-front spine--${book.spine.color}`}>
                      <span className="book__cover-cap" />
                      <span className="book__cover-title">{book.title}</span>
                      {book.year ? <span className="book__cover-year">{book.year}</span> : null}
                    </span>
                  </span>
                  {/* 책등(옆면) — 책장에서 뽑힐 때 처음 보이는 면. 나오며 회전해 표지가
                      정면을 향하고, 들어갈 때 다시 책등으로 돌아간다. 세로 제목. */}
                  <span className={`book__cover-spine spine--${book.spine.color}`}>
                    <span className="book__cover-spine-title">{book.title}</span>
                  </span>
                </span>
              </div>
            </div>
          </dialog>
        );
      })}

      <BookController />
    </main>
  );
}
