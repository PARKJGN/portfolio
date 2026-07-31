import type { Book } from '@/lib/schema';
import { renderMarkdown } from '@/lib/markdown';
import { logoFor } from '@/lib/tech-logos';
import { Guestbook } from './Guestbook';

/**
 * 책 한 권의 내용. 서버 컴포넌트라 마크다운 변환이 빌드 시점에 끝나고
 * 클라이언트 JS 를 늘리지 않는다.
 *
 * 책은 3D/모달로만 열린다. 이 마크업은 <dialog> 안에 미리 렌더돼 낭독기·검색이
 * 읽을 수 있는 실제 본문이 되고, 3D 리더가 켜지면 화면에서만 감춰진다(DOM 에는 남는다).
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
  /** 모달의 닫기 버튼. */
  onCloseSlot?: React.ReactNode;
}) {
  return (
    <article className="book">
      {/* 펼친 두 면 — 크림 종이. 제목은 왼쪽 면 머리글, 본문은 가운데 책등을
          기준으로 좌우 두 면에 흐른다. 도구(chrome)는 이 안에 두지 않는다. */}
      <div className="book__pages">
        {/* 머리글 — 화면에는 두지 않는다. 표지와 책등이 이미 제목을 보여 주고 있어
            펼친 첫 면의 제목은 같은 말을 세 번째로 반복하는 셈이었다. 다만 DOM 에는
            남겨 낭독기가 창을 열 때 어떤 책인지 읽어 준다(dialog 의 aria-labelledby). */}
        <header className="book__header book__header--sr">
          <h1 className="book__title" id={`book-title-${book.slug}`}>
            {book.title}
          </h1>
          {book.year ? <span className="book__call">{book.year}</span> : null}
        </header>

        <div className="book__body" tabIndex={0} role="region" aria-label={`${book.title} 본문`}>
          {book.profile ? (
            <figure className="profile-card">
              {book.profile.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="profile-card__photo"
                  src={book.profile.photo}
                  alt={book.profile.name}
                  // 이 <img> 는 닫힌 <dialog> 안에 있어, 그냥 두면 방을 여는 순간 함께
                  // 받아진다. 책을 한 번도 안 누른 방문자까지 사진을 받게 되고 첫 화면
                  // LCP 가 밀린다(실측 2858 → 3459ms). lazy 면 창이 열릴 때 받는다.
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="profile-card__photo profile-card__photo--empty" aria-hidden="true">
                  사진
                </span>
              )}
              <figcaption className="profile-card__meta">
                <span className="profile-card__name">{book.profile.name}</span>
                {book.profile.english ? (
                  <span className="profile-card__english">{book.profile.english}</span>
                ) : null}
                {book.profile.contacts?.length ? (
                  <ul className="profile-card__contacts">
                    {book.profile.contacts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </figcaption>
            </figure>
          ) : null}

          <div className="book__prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(book.body) }} />

          {/* 방명록은 런타임에 도착하는 남의 글이라 renderMarkdown 을 거치지 않는다.
              그 함수 주석의 경고 그대로다 — 방문자 입력에 쓰면 안 된다. */}
          {book.guestbook ? <Guestbook /> : null}

          {book.tech?.length ? (
            <ul className="tech-list">
              {book.tech.map((t) => {
                // 로고를 아는 기술이면 브랜드색 심벌을, 모르면 예전처럼 색 네모 + 이니셜을
                // 그린다. 3D 캔버스도 같은 logoFor 를 보고 같은 판단을 한다.
                const logo = logoFor(t.name);
                const color = t.color ?? logo?.color;
                return (
                  <li key={t.name} className="tech-item" data-tech-color={color ?? ''}>
                    {logo ? (
                      <svg
                        className="tech-item__icon tech-item__icon--logo"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        style={color ? { fill: color } : undefined}
                      >
                        <path d={logo.path} />
                      </svg>
                    ) : (
                      <span
                        className="tech-item__icon"
                        aria-hidden="true"
                        style={color ? { background: color } : undefined}
                      >
                        {t.name.slice(0, 1)}
                      </span>
                    )}
                    <div className="tech-item__body">
                      <span className="tech-item__name">{t.name}</span>
                      <p className="tech-item__desc">{t.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
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
            {/* 위치 표시 두 벌: 3D 리더는 점(pip)으로, 평면 모달은 숫자로 보인다(CSS 로
                모드별 전환). 숫자는 aria-live 로 낭독기에 읽히고, 점은 장식이라 aria-hidden.
                점은 BookController 가 장 수만큼 채운다. */}
            <span className="book__pips" data-pips aria-hidden="true" />
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
            {/* 다른 책으로 이동 — 지금 책을 접고 그 책을 연다(BookController 가 위임받음).
                이동할 정적 페이지가 없으므로 링크가 아니라 버튼이다. data-book-slug 는
                책장 책등 전용(고유)이라, 이동 버튼은 data-book-goto 로 구분한다. */}
            {prev ? (
              <button type="button" data-book-goto={prev.slug}>
                ← {prev.title}
              </button>
            ) : null}
            {next ? (
              <button type="button" data-book-goto={next.slug}>
                {next.title} →
              </button>
            ) : null}
          </nav>
          {onCloseSlot}
        </footer>
      </div>
    </article>
  );
}
