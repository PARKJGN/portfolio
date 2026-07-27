import type { Book } from '@/lib/schema';
import { renderMarkdown } from '@/lib/markdown';

/**
 * 책 한 권의 내용. 서버 컴포넌트라 마크다운 변환이 빌드 시점에 끝나고
 * 클라이언트 JS 를 늘리지 않는다.
 *
 * 모달과 책 단독 페이지가 이 컴포넌트를 함께 쓴다. 같은 마크업을 두 곳에서
 * 렌더하므로 "모달에서 본 내용"과 "직접 주소로 들어와 본 내용"이 어긋날 수 없다.
 */
export function BookContent({
  book,
  prev,
  next,
  onCloseSlot,
}: {
  book: Book;
  prev?: Book;
  next?: Book;
  /** 모달일 때만 들어오는 닫기 버튼. 단독 페이지에서는 방으로 가는 링크가 대신 온다. */
  onCloseSlot?: React.ReactNode;
}) {
  return (
    <article className="book">
      {/* 펼친 두 면 — 크림 종이. 제목은 왼쪽 면 머리글, 본문은 가운데 책등을
          기준으로 좌우 두 면에 흐른다. 도구(chrome)는 이 안에 두지 않는다. */}
      <div className="book__pages">
        <header className="book__header">
          <h1 className="book__title">{book.title}</h1>
          {book.year ? <span className="book__call">{book.year}</span> : null}
        </header>

        <div
          className="book__body"
          tabIndex={0}
          role="region"
          aria-label={`${book.title} 본문`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(book.body) }}
        />
      </div>

      {/* 도구 막대 — 종이 밖(모달에서는 하드커버 보드) 에 얹힌다. 그래야 두 면이
          순수한 책 페이지로 보인다. */}
      <div className="book__tools">
        <div className="book__controls">
          {/* 조작부 마크업은 서버에서 렌더하고 동작만 BookController 가 위임받는다.
              버튼마다 클라이언트 컴포넌트를 두면 책 권수만큼 늘어난다. */}
          <span className="book__paging">
            <button
              type="button"
              className="book__btn"
              data-action="page-prev"
              aria-label="이전 장"
            >
              ←
            </button>
            <span className="book__progress" data-progress aria-live="polite">
              1 / 1
            </span>
            <button
              type="button"
              className="book__btn"
              data-action="page-next"
              aria-label="다음 장"
            >
              →
            </button>
          </span>
          <button
            type="button"
            className="book__btn"
            data-action="toggle-view"
            aria-pressed="false"
            data-toggle-label
          >
            전체 이어보기
          </button>
        </div>

        <footer className="book__footer">
          <nav className="book__nav" aria-label="같은 책장의 다른 책">
            {prev ? <a href={`/books/${prev.slug}`}>← {prev.title}</a> : null}
            {next ? <a href={`/books/${next.slug}`}>{next.title} →</a> : null}
          </nav>
          {onCloseSlot ?? (
            <a href="/" className="book__link">
              방으로 돌아가기
            </a>
          )}
        </footer>
      </div>
    </article>
  );
}
