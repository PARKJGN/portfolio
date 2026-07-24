/**
 * 배경 장면 — 모던 서재. 평면 벡터 일러스트(사진 없음).
 *
 * 대부분 장식이지만 두 요소는 만질 수 있다:
 *  - 창: 누르면 해가 떴다가 다시 누르면 진다 (data-action="toggle-sky")
 *  - 화분: 누르면 잎이 하나씩 떨어지고, 한 장 남았을 때 누르면 꽃이 핀다
 *          (data-action="plant"). 동작은 BookController 가 위임받는다.
 *
 * 그래서 창·화분은 접근 가능한 <button>(aria-label + 키보드)이고, 나머지 장식은
 * 개별적으로 aria-hidden 이다. 색은 tokens.css 의 room·sky 토큰 참조(원칙 V).
 */
export function RoomScene() {
  return (
    <div className="scene">
      <div className="scene__floor" aria-hidden="true" />
      <div className="scene__beam" aria-hidden="true" />

      <button type="button" className="scene__window" data-action="toggle-sky" aria-label="해 띄우기">
        <span className="scene__sun" aria-hidden="true" />
        <span className="scene__mullion scene__mullion--v" aria-hidden="true" />
        <span className="scene__mullion scene__mullion--v2" aria-hidden="true" />
        <span className="scene__mullion scene__mullion--h" aria-hidden="true" />
      </button>

      <button type="button" className="scene__plant" data-action="plant" aria-label="화분 만지기">
        <svg viewBox="0 0 120 150" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <g fill="currentColor">
            {/* 잎 — 바깥부터 떨어지고 가운데 한 장이 남는다 */}
            <path className="leaf" data-leaf="2" d="M60 100 C34 84 22 60 24 34 C46 50 58 74 60 100 Z" />
            <path className="leaf" data-leaf="3" d="M60 100 C86 84 98 60 96 34 C74 50 62 74 60 100 Z" />
            <path className="leaf" data-leaf="1" d="M60 96 C40 70 40 40 58 16 C64 44 64 70 60 96 Z" />
            {/* 화분 */}
            <path d="M40 100 L80 100 L74 150 L46 150 Z" />
          </g>
          {/* 꽃 — 기본은 접혀 있다가(scale 0) 마지막에 핀다 */}
          <g className="scene__flower">
            <circle className="petal" cx="60" cy="16" r="6" />
            <circle className="petal" cx="70" cy="22" r="6" />
            <circle className="petal" cx="67" cy="33" r="6" />
            <circle className="petal" cx="53" cy="33" r="6" />
            <circle className="petal" cx="50" cy="22" r="6" />
            <circle className="pip" cx="60" cy="25" r="5" />
          </g>
        </svg>
      </button>
    </div>
  );
}
