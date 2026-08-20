# 검증 절차: 방명록

**Feature**: 003-guestbook | **Date**: 2026-07-31

구현이 끝났는지 사람이 직접 확인하는 절차다. 위에서 아래로 한 번에 수행한다.

---

## 준비 — 처음 한 번만

### 1. 데이터베이스 계정 만들기 (수동, 잊기 쉬움)

oneBite 의 PostgreSQL 은 앱 롤을 최초 기동 스크립트로 만든다. **이미 데이터가 있으므로 그
스크립트는 다시 실행되지 않는다.** portfolio 롤은 손으로 만들어야 한다(research.md R-6).

```bash
# 비밀번호를 먼저 만든다
openssl rand -base64 24

# 돌고 있는 인스턴스에 붙어 롤과 데이터베이스를 만든다
kubectl -n onebite exec -it deploy/postgres -- \
  psql -U "$POSTGRES_MASTER_USER" -d postgres

# psql 안에서
CREATE ROLE portfolio LOGIN PASSWORD '<위에서 만든 값>';
CREATE DATABASE portfolio OWNER portfolio;
REVOKE ALL ON DATABASE portfolio FROM PUBLIC;
\q
```

비밀번호는 시크릿의 `PGPASSWORD` 와 **같은 값**이어야 한다. 직접 치지 말고 읽어 쓰면
오타가 없다.

```bash
PW=$(kubectl -n jgbak-portfolio get secret portfolio-secrets \
       -o jsonpath='{.data.PGPASSWORD}' | base64 -d)
```

확인 — 자기 롤·자기 데이터베이스로 붙으면 성공이다.

```bash
printf '%s' "$PW" | kubectl -n onebite exec -i deploy/postgres -- \
  sh -c 'read -r P; PGPASSWORD="$P" psql -tAU portfolio -d portfolio \
           -c "select current_user, current_database();"'
# → portfolio|portfolio
```

**onebite 데이터베이스에 붙는 것 자체는 막히지 않는다.** 위 `REVOKE` 는 portfolio
데이터베이스에만 적용되고, PostgreSQL 은 기본으로 모든 롤에게 CONNECT 를 준다.
(초안에는 "거절되어야 한다"고 적혀 있었는데 틀린 기대였다.)

다만 **붙는 것과 읽는 것은 다르다.** onebite 의 표는 onebite 롤 소유이고 PUBLIC 에 권한이
없어 데이터는 읽히지 않는다 — 보이는 것은 시스템 카탈로그(표·컬럼 이름) 정도다.

접속까지 막고 싶다면 순서가 중요하다. 거꾸로 하면 **oneBite 앱이 자기 DB 에 못 붙는다.**

```sql
GRANT CONNECT ON DATABASE onebite TO onebite;    -- 먼저 명시적으로 준다
REVOKE CONNECT ON DATABASE onebite FROM PUBLIC;  -- 그다음 PUBLIC 을 거둔다
```

돌고 있는 남의 서비스를 건드리는 일이라 배포와 함께 하지 않는다.

### 2. 시크릿 채우기

```bash
kubectl -n jgbak-portfolio create secret generic portfolio-secrets \
  --from-literal=PORTFOLIO_DB_PASSWORD='<1단계 비밀번호>' \
  --from-literal=ANTHROPIC_API_KEY='<판정용 키>' \
  --from-literal=ADMIN_TOKEN="$(openssl rand -hex 32)" \
  --from-literal=CLIENT_HASH_SALT="$(openssl rand -hex 32)"
```

`ADMIN_TOKEN` 은 따로 적어 둔다. 관리 화면에서 쓴다.

---

## 로컬에서 확인

### 3-a. 화면만 볼 때 — 대역으로 건너뛰기

연출(펜이 써지는 모습, 마지막 장으로 넘어가는 모습)만 확인하려면 데이터베이스도 판정 키도
필요 없다. 계약이 정한 응답의 모양만 흉내 내는 대역이 있다.

```bash
node api/tests/e2e-support/guestbook-stub.mjs
```

글은 메모리에만 쌓이고 끄면 사라진다. 실패했을 때의 화면을 보려면 다음 제출의 답을 바꾼다.

```bash
curl "localhost:8080/__stub?next=held"          # 보류 (202)
curl "localhost:8080/__stub?next=duplicate"     # 중복 (409)
curl "localhost:8080/__stub?next=rate_limited"  # 한도 (429)
curl "localhost:8080/__stub?next=unavailable"   # 장애 (503)
```

한 번 쓰면 `visible` 로 돌아온다. 계속 실패시키려면 `&sticky=1` 을 붙인다.

**대역에는 방어가 하나도 없다** — 봇 판별도 규칙도 판정도 한도도 없다. 저장·방어까지
확인하려면 아래 3 · 4 로 간다.

### 3. API 띄우기

```bash
cd api
cp .env.example .env      # DB 접속·키를 로컬 값으로 채운다
npm install
npm run migrate           # migrations/ 의 SQL 을 적용한다
npm run dev
```

기대: `GET http://localhost:8080/api/health` 가 `{"ok":true}` 를 준다. 데이터베이스를 끄면
`503` 과 `{"ok":false}` 를 준다.

### 4. 사이트 띄우기

브라우저가 API 를 어디로 찾을지 먼저 알려 준다. 운영에서는 인그레스가 `/api` 를 API 로
보내 주어 같은 출처가 되지만, **로컬에는 그 인그레스가 없다.** 사이트는 3000, API 는 8080 이라
그냥 두면 `/api/...` 가 3000 으로 가서 404 가 난다. `output: 'export'` 라 rewrite 로 프록시를
놓을 수도 없다 — 정적 산출물에는 런타임 서버가 없다.

```bash
echo 'NEXT_PUBLIC_GUESTBOOK_API=http://localhost:8080' > .env.local   # 저장소 루트
npm run dev
```

`NEXT_PUBLIC_*` 은 빌드 시점에 박히므로 **파일을 만든 뒤 dev 서버를 다시 띄워야** 한다.
API 쪽 `ALLOWED_ORIGIN` 도 `http://localhost:3000` 이어야 한다 — 운영 도메인이 적혀 있으면
요청은 나가는데 브라우저가 응답을 막아 화면에는 실패로만 보인다.

방명록 책장의 책을 연다. 기대:

- **다른 책과 똑같이 3D 로 펼쳐진다.** R-2(방명록만 평면)는 2026-08-01 에 뒤집혔다.
- 종이에는 **남겨진 글만** 있다. 안내문 면은 없앴다 — 남길 때 알아야 할 말은 모달
  안 고지문으로 옮겼다.
- 글은 **오래된 것이 앞, 새 것이 뒤**다(책 안에서만 시간순). 평면 목록은 최신순 그대로다.
- 오른쪽 면의 **오른쪽 아래 구석에 '남기기'** 가 있다. 장을 넘기면 그 장의 구석으로 따라
  간다(`BookController.placeWriteButton`).
- 그걸 누르면 모달이 열리고, 좌우로는 남들 글이 그대로 보인다.
- 이름·내용 입력칸과 남기기 버튼이 보인다.
- 남긴 글이 판정을 위해 외부로 전송된다는 안내와, 지우고 싶을 때 닿을 주소가
  **남기기 전에** 보인다(FR-014 · spec.md 190줄).
- 남기면 모달이 닫히고, **그 글이 놓인 마지막 장까지 책이 넘어간 뒤 펜으로 써진다.**
  움직임 최소화 설정에서는 연출 없이 곧바로 나타난다.

**글이 면을 넘길 때** (긴 글을 몇 개 남겨 마지막 면을 채운 뒤 확인한다 — 이 부분은
자동 시험이 없다. 캔버스 안이라 지금 시험 환경에서 돌릴 수 없다)

- 왼 면 아래가 **비지 않는다.** 바닥까지 채우고 오른 면 첫머리에서 이어진다.
- 이어지는 면에 **이름·날짜가 다시 찍히지 않는다.** 한 번만 나온다.
- 500자를 꽉 채운 글을 남겨도 **끝줄이 사라지지 않는다.**
- 펜이 왼 면 끝에서 오른 면 첫머리로 **이어져** 지나간다(끊기거나 되돌아가지 않는다).
- 소제목("남겨 주신 글")은 쪼개지지 않고 통째로 다음 면으로 간다.

---

## 검증 1 — 남기고 바로 보인다 (US1)

1. 이름과 내용을 적고 남긴다.
2. 화면을 새로 고치지 않았는데 목록 맨 위에 그 글이 나타난다(FR-003).
3. 새로고침해도 남아 있다(FR-004).
4. API 를 재시작해도 남아 있다.
5. 남긴 시각이 함께 보인다(FR-006).

**실패 조건도 본다**

6. 이름을 비우고 남기면 무엇이 비었는지 알려 주고 남기지 않는다.
7. 내용에 501자를 넣으면 남기기 전에 알려 준다.
8. API 를 끈 채로 남기면 실패를 알리되 **적던 내용이 그대로 남아 있다**(FR-007).

---

## 검증 2 — 스크립트가 실행되지 않는다 (FR-008)

내용에 다음을 그대로 적어 남긴다.

```text
<img src=x onerror=alert(1)>
<script>alert(2)</script>
**굵게** [링크](http://example.com)
```

기대: **글자 그대로 보인다.** 경고창이 뜨지 않고, 굵어지지도 링크가 걸리지도 않는다.
브라우저 콘솔에 오류가 없다.

---

## 검증 3 — 세 겹 방어 (US2)

### 1층 — 봇

```bash
# 숨은 칸이 채워진 요청
curl -s -X POST localhost:8080/api/guestbook/entries \
  -H 'content-type: application/json' \
  -d '{"author":"bot","body":"광고입니다","website":"http://spam.example","openedAt":"2026-07-31T00:00:00Z"}'
```

기대: **201 을 돌려주지만 목록에는 나타나지 않는다.** 봇에게 실패를 알리지 않는다.

```bash
# 폼을 연 지 3초도 안 돼 제출
# openedAt 을 현재 시각으로 넣고 즉시 호출한다
```

기대: 같다 — 201, 저장 안 됨.

### 2층 — 규칙

- 링크처럼 보이는 것을 3개 넣어 남긴다 → 목록에 나타나지 않는다.
- 같은 글자를 30번 반복해 남긴다 → 나타나지 않는다.
- 방금 남긴 것과 똑같은 내용을 다시 남긴다 → `409 duplicate`.
- 시간당 한도를 넘겨 남긴다 → `429` 와 다시 남길 수 있는 시각.

### 3층 — 판정

- 욕설이 들어간 글을 남긴다 → 목록에 나타나지 않고, 보류함에 사유와 함께 있다.
- **판정 API 키를 일부러 틀리게 하고** 멀쩡한 글을 남긴다 → 공개되지 않고 **보류로 간다**
  (FR-013). 판정 없이 통과하면 안 된다. 이것이 이 검증에서 가장 중요하다.

---

## 검증 4 — 주인의 안전망 (US3)

```bash
TOKEN=<ADMIN_TOKEN>

# 보류함
curl -s localhost:8080/api/guestbook/held -H "authorization: Bearer $TOKEN"

# 공개
curl -s -X POST localhost:8080/api/guestbook/entries/44/publish -H "authorization: Bearer $TOKEN"

# 삭제
curl -s -X DELETE localhost:8080/api/guestbook/entries/45 -H "authorization: Bearer $TOKEN"
```

기대:

- 공개한 글이 방문자 목록에 나타난다.
- 삭제한 글은 어느 목록에도 없다.
- **토큰 없이 같은 요청을 하면 401** 이다(FR-018). 이것도 반드시 확인한다.

### 화면으로 하기

`/admin` 을 연다(사이트와 같은 도메인, 색인은 막혀 있다). 토큰을 붙여 넣으면 보류함이
보인다.

- 토큰은 `sessionStorage` 에 둔다 — **창을 닫으면 사라진다.** 자주 오는 화면이 아니므로
  기기에 남기지 않는 편을 택했다.
- 지우기는 **두 번 눌러야** 실제로 지운다. 되돌릴 수단이 없다.
- 401 이 오면 들고 있던 토큰을 버리고 입력칸으로 돌아간다.
- 보류함에 없는 **공개된 글**은 아래쪽 "글 번호로 지우기" 로 지운다. 번호는 보류함 목록의
  `#12` 표시나 API 응답의 `id` 다.

확인할 것:

- 틀린 토큰 → "토큰이 맞지 않습니다" 가 뜨고 입력칸으로 돌아온다.
- 한글이나 이모지가 섞인 값 → 요청을 보내지 않고 "쓸 수 없는 글자" 라고 알린다.
  (HTTP 헤더는 ASCII 만 실을 수 있어, 막지 않으면 `fetch` 가 던지고 "서버에 닿지 못했다"
  처럼 보인다.)
- 새로고침해도 토큰이 유지되고, **새 창에서는 다시 물어본다.**

---

## 검증 5 — 방명록이 죽어도 사이트는 산다 (FR-019)

1. API 를 끈다.
2. 프로필·프로젝트 책을 연다 → **평소와 똑같이 3D 로 열리고 읽힌다.**
3. 방명록 책을 연다 → 지금 글을 남길 수 없다는 안내가 보인다. 화면이 깨지지 않는다.

---

## 검증 6 — 접근성과 반응형

```bash
npx playwright test
npm test
```

### 방명록 E2E 를 함께 돌리려면

`tests/e2e/guestbook.spec.ts` 는 **서버 셋이 떠 있어야** 돈다. 없으면 그 파일만 통째로
건너뛴다 — 도커 없이 `npx playwright test` 를 도는 사람에게 방명록 때문에 빨간 줄이 나오지
않게 하기 위해서다. 건너뛰는지 여부는 목록에서 `-` 로 보인다.

세 개를 각각 다른 터미널에서 띄운다.

```bash
# 1. 데이터베이스
docker compose -f api/docker-compose.dev.yml up -d

# 2. 판정 대역 — 진짜 판정을 부르면 같은 글에 다른 답이 와 E2E 가 흔들린다.
#    SDK 가 이미 보는 ANTHROPIC_BASE_URL 을 돌리는 방식이라 api/src 는 건드리지 않는다.
node api/tests/e2e-support/verdict-stub.mjs

# 3. API — 두 한도를 올린다. E2E 는 한 주소에서 사람보다 훨씬 자주 두드리므로
#    올리지 않으면 검증하려던 것이 아니라 한도에 걸려 실패한다.
cd api && npm run build && \
  ANTHROPIC_BASE_URL=http://127.0.0.1:8787 \
  RATE_LIMIT_MAX=1000 BURST_LIMIT_MAX=2000 \
  node --env-file=.env dist/server.js
```

그다음 사이트를 **API 주소를 박아서** 빌드해야 한다. 정적 export 라 이 값은 빌드 시점에
들어간다. `playwright.config.ts` 의 webServer 가 알아서 넣으므로, 이전에 띄워 둔
`npm run serve` 가 있으면 **먼저 끄고** 돌린다(안 끄면 그 빌드를 그대로 쓴다).

```bash
npx playwright test guestbook
```

글을 남기는 검증은 `desktop` 한 곳에서만 돈다. 방명록은 서버 한 곳에 쌓이는 공유 상태라,
두 프로젝트가 같이 남기면 서로의 글이 목록에 끼어 순서 검증이 어긋난다. 320px 폭은 글을
남기지 않고 배치만 본다.

손으로도 걷는다.

- Tab 만으로 이름 → 내용 → 남기기 버튼에 순서대로 닿고, 초점 표시가 보인다.
- 낭독기가 각 칸의 라벨을 읽는다.
- 남기기 결과(성공·보류·실패)가 낭독기에 전달된다.
- 320px 폭에서 가로 스크롤이 없다(SC-008).
- `prefers-reduced-motion` 을 켜면 불필요한 움직임이 없다.

---

## 검증 7 — 배포 뒤 확인

**선행**: 001 의 Phase 6 가 끝나 `portfolio.jgbak-land.com` 에 정적 사이트가 떠 있어야 한다.

```bash
kubectl -n jgbak-portfolio get pods
kubectl -n jgbak-portfolio logs deploy/api --tail=50
curl -s https://portfolio.jgbak-land.com/api/health
```

기대:

- `api` 파드가 Running 이고 재시작 횟수가 0 이다.
- `/api/health` 가 `{"ok":true}` 를 준다 — 네임스페이스를 건너 데이터베이스에 닿았다는 뜻이다.
- 실제 도메인에서 글을 남기고 목록에 나타나는 것을 확인한다.
- 인증서가 유효하다(자물쇠).
- 로그에 **글 내용이 남아 있지 않다.**

---

## 확인 기록

| 검증 | 수행일 | 결과 | 비고 |
|---|---|---|---|
| 1. 남기고 보인다 | | | |
| 2. 스크립트 미실행 | | | |
| 3. 세 겹 방어 | | | |
| 4. 주인 안전망 | | | |
| 5. 장애 시 분리 | | | |
| 6. 접근성·반응형 | | | |
| 7. 배포 뒤 | | | |
