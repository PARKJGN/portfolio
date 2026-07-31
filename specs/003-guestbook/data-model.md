# 데이터 모델: 방명록

**Feature**: 003-guestbook | **Date**: 2026-07-31

데이터베이스는 `portfolio`, 소유 롤은 `portfolio` 다(research.md R-6). 테이블은 둘이다.

---

## guestbook_entry — 방명록 글

방문자가 남긴 한 편. 공개 상태인 것만 방문자에게 보인다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | bigserial | PK | |
| `author` | text | not null, 1–20자 | 방문자가 적은 이름. 실명 검증은 하지 않는다 |
| `body` | text | not null, 1–500자 | 순수 텍스트. 마크다운·HTML 을 해석하지 않는다(R-8) |
| `status` | text | not null, `visible`·`held`·`removed` 중 하나 | 아래 상태 전이 참조 |
| `held_reason` | text | null 허용 | 보류된 이유. 주인이 보류함에서 읽는다 |
| `verdict_score` | real | null 허용, 0–1 | 판정이 돌려준 유해성 정도. 판정을 못 받았으면 null |
| `created_at` | timestamptz | not null, 기본 now() | 남긴 시각 |
| `reviewed_at` | timestamptz | null 허용 | 주인이 손댄 시각 |

**인덱스**

- `(status, created_at desc)` — 방문자 목록 조회가 이 형태 하나뿐이다.
- `(created_at desc)` — 보류함 조회용.

**검증 규칙** (FR-002 · FR-011)

- `author` 는 앞뒤 공백을 제거한 뒤 1자 이상 20자 이하.
- `body` 는 앞뒤 공백을 제거한 뒤 1자 이상 500자 이하.
- `body` 안의 링크로 보이는 토큰이 2개를 넘으면 규칙 위반.
- 같은 문자가 20회 이상 연속되면 규칙 위반.
- 직전 24시간 안에 같은 `body` 가 이미 있으면 중복.

**상태 전이**

```text
          [남기기]
              │
      ┌───────┴────────┐
   통과              걸림
      │                │
   visible ◀──공개── held ──삭제──▶ removed
      │                              ▲
      └──────────── 삭제 ────────────┘
```

- 세 겹 방어를 모두 통과하면 `visible` 로 저장한다.
- 어느 겹에서든 걸리거나 **판정을 받지 못하면** `held` 로 저장한다(FR-013). 방문자에게는
  "확인 뒤 보일 수 있다"고 알린다.
- 봇으로 판정된 요청(1층)은 저장하지 않고 버린다 — 봇에게 보류함을 채우게 둘 이유가 없다.
- 주인은 `held → visible`, `held → removed`, `visible → removed` 로 옮길 수 있다.
- `removed` 는 목록 어디에도 나오지 않는다. 행을 지우지 않는 이유는 같은 글이 다시
  등록되는 것을 중복 검사로 막기 위해서다.

---

## abuse_mark — 남용 기록

짧은 시간 안의 반복 등록을 막기 위한 흔적. **원문 접속 주소를 저장하지 않는다**(FR-020).

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | bigserial | PK | |
| `client_hash` | text | not null | 접속 식별값에 서버 비밀 소금을 섞어 해시한 값 |
| `created_at` | timestamptz | not null, 기본 now() | |
| `expires_at` | timestamptz | not null | 이 시각이 지나면 지운다 |

**인덱스**

- `(client_hash, created_at desc)` — 시간당 등록 수 확인.
- `(expires_at)` — 만료 정리.

**규칙**

- 소금은 Secret 으로 주입한다. 소금 없이 해시하면 주소 공간이 좁아 되돌릴 수 있다.
- 보관 기간은 24시간. 지난 것은 주기적으로 지운다.
- 이 표는 사람을 식별하기 위한 것이 아니라 같은 출처의 반복을 세기 위한 것이다. 글과
  연결하지 않는다 — `guestbook_entry` 에 `client_hash` 를 두지 않는 이유다.

---

## 두 표의 관계

없다. 의도적으로 연결하지 않는다. 연결하면 "누가 어떤 글을 남겼는지"를 복원할 수 있게 되어
개인정보 최소화 원칙과 어긋난다. 남용 판단은 등록 시점에만 하고, 판단이 끝나면 글과 흔적은
서로를 모른다.

---

## 보관과 삭제

- 글은 기간 제한 없이 보관한다. 지우는 것은 주인의 판단이다(명세 Assumptions).
- 남용 기록은 24시간 뒤 지운다.
- 데이터베이스 백업은 oneBite 인스턴스의 정책을 따른다 — 별도 백업을 두지 않는다.
