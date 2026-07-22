import { SPINE_COLORS } from '@/lib/schema';

/**
 * 장식용 책 단. 누를 수 없고 내용도 없다 — 책장이 책장처럼 보이게 하는 배경이다.
 *
 * `aria-hidden` 으로 접근성 트리에서 완전히 뺀다. 낭독기 사용자에게 "제목 없는 책
 * 열두 권"을 읽어줄 이유가 없다. 시안도 같은 처리를 하고 있었다.
 *
 * 크기와 색은 책장 슬러그에서 결정적으로 계산한다. 난수를 쓰면 서버와 클라이언트가
 * 다른 값을 내 하이드레이션이 어긋나고, 빌드할 때마다 방 모습이 바뀐다.
 */
function decorFor(seed: string, count: number) {
  const base = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return Array.from({ length: count }, (_, i) => {
    const k = base * 7 + i * 13;
    return {
      color: SPINE_COLORS[k % SPINE_COLORS.length],
      width: 18 + (k * 11) % 20, // 18~37px
      height: 62 + (k * 17) % 34, // 62~95%
    };
  });
}

export function ShelfDecor({ seed, count = 11 }: { seed: string; count?: number }) {
  return (
    <div className="shelf__decor" aria-hidden="true">
      {decorFor(seed, count).map((d, i) => (
        <span
          key={i}
          className={`decor-spine spine--${d.color}`}
          // 값이 아니라 데이터다 — 디자인 척도가 아니라 seed 에서 계산된 형상이라
          // 토큰으로 만들 수 없다. 적용 방식은 room.css 가 결정한다.
          style={{ '--decor-w': `${d.width}px`, '--decor-h': `${d.height}%` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
