import type { Shelf } from '@/lib/schema';

/**
 * 책장 바로가기 (FR-018, FR-019).
 *
 * 좁은 화면에서는 책장이 가로로 넘어가므로, 스와이프 말고도 이동 수단이 있어야 한다.
 * 평범한 조각 링크(#shelf-slug)라 JS 없이도 동작하고, 낭독기에는 목차 역할을 한다.
 *
 * 현재 보고 있는 책장 표시(aria-current)는 BookController 가 스크롤을 관찰해 갱신한다.
 * JS 가 없으면 표시만 없을 뿐 이동은 그대로 된다.
 */
export function ShelfNav({ shelves }: { shelves: Shelf[] }) {
  return (
    <nav className="shelf-nav" aria-label="책장 바로가기">
      <ul>
        {shelves.map((shelf) => (
          <li key={shelf.slug}>
            <a href={`#shelf-${shelf.slug}`} data-shelf-link={shelf.slug}>
              {shelf.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
