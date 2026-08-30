/**
 * 없는 주소로 들어왔을 때의 화면.
 *
 * 이 파일이 없던 동안에는 Next 기본 화면이 나왔다 — 흰 바탕에 영어 한 줄로
 * "404 | This page could not be found." 방과 아무 상관 없는 화면이라, 주소를
 * 잘못 친 사람은 사이트가 깨진 줄 안다.
 *
 * **상태 코드는 404 그대로 둔다.** 메인으로 넘겨 버리면 방문자는 편하지만 두 가지를
 * 잃는다 — 검색엔진은 없는 문서를 있는 것으로 색인하고(soft 404), 우리는 어떤 링크가
 * 깨졌는지 알 수 없게 된다. 그걸 보려고 대시보드에 「404 가 난 주소」 패널을 뒀다.
 *
 * 방 배경 위에 안내와 돌아가는 길만 둔다. RoomScene(창·화분)은 쓰지 않는다 —
 * 그것들은 BookController 가 눌림을 받아 주는데 이 화면엔 컨트롤러가 없어서,
 * 눌러도 아무 일이 없는 버튼만 놓이게 된다.
 */
export default function NotFound() {
  return (
    <main className="room notfound">
      <div className="scene__floor" aria-hidden="true" />

      <div className="notfound__inner">
        <p className="notfound__code">404</p>
        <h1 className="notfound__title">그 책은 여기 없습니다</h1>
        <p className="notfound__lead">주소가 바뀌었거나, 서가에 없는 자리를 찾으신 것 같습니다.</p>
        <a className="notfound__home" href="/">
          서재로 돌아가기
        </a>
      </div>
    </main>
  );
}
