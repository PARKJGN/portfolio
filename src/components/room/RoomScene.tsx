/**
 * 배경 장면 — 모던 서재. 평면 벡터 일러스트다(사진 없음, 자체 렌더).
 *
 * 큰 창으로 자연광이 들고, 바닥선과 화분이 공간을 만든다. 책장은 이 벽에 걸린
 * 플로팅 선반으로 읽힌다.
 *
 * 전체가 장식이므로 aria-hidden 이고 pointer-events 는 CSS 에서 끈다 — 낭독기와
 * 클릭 모두에 관여하지 않는다. 색은 tokens.css 의 --room-* 를 참조한다(원칙 V).
 * 화면 비율에 상관없이 벽·바닥·창은 CSS 로 채우고, 화분·창틀 같은 물체만 얹는다.
 */
export function RoomScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene__floor" />
      <div className="scene__window">
        <span className="scene__mullion scene__mullion--v" />
        <span className="scene__mullion scene__mullion--v2" />
        <span className="scene__mullion scene__mullion--h" />
      </div>
      <div className="scene__beam" />

      {/* 화분 — 단순한 실루엣. 잎은 유기적이라 SVG 가 깔끔하다. */}
      <svg className="scene__plant" viewBox="0 0 120 200" preserveAspectRatio="xMidYMax meet">
        <g fill="currentColor">
          {/* 잎 */}
          <path d="M60 96 C40 70 40 40 58 16 C64 44 64 70 60 96 Z" />
          <path d="M60 100 C34 84 22 60 24 34 C46 50 58 74 60 100 Z" />
          <path d="M60 100 C86 84 98 60 96 34 C74 50 62 74 60 100 Z" />
          {/* 화분 */}
          <path d="M40 100 L80 100 L74 150 L46 150 Z" />
        </g>
      </svg>
    </div>
  );
}
