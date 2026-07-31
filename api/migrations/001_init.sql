-- 방명록 초기 스키마 (data-model.md 그대로)
--
-- 이 파일은 이미 적용된 뒤에는 고치지 않는다. 바꿀 것이 생기면 002_ 로 새로 추가한다.

-- ── 방명록 글 ──
CREATE TABLE guestbook_entry (
  id            bigserial   PRIMARY KEY,
  author        text        NOT NULL,
  body          text        NOT NULL,
  -- visible: 방문자에게 보인다 / held: 보류, 주인 확인 대기 / removed: 지워짐
  status        text        NOT NULL,
  held_reason   text,
  verdict_score real,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,

  CONSTRAINT guestbook_entry_status_ck
    CHECK (status IN ('visible', 'held', 'removed')),
  -- 길이 규칙은 API 도 검사하지만 DB 에도 둔다. 어느 경로로 들어와도 지켜져야 한다.
  CONSTRAINT guestbook_entry_author_len_ck
    CHECK (char_length(author) BETWEEN 1 AND 20),
  CONSTRAINT guestbook_entry_body_len_ck
    CHECK (char_length(body) BETWEEN 1 AND 500),
  CONSTRAINT guestbook_entry_score_range_ck
    CHECK (verdict_score IS NULL OR (verdict_score >= 0 AND verdict_score <= 1))
);

-- 방문자 목록 조회는 이 형태 하나뿐이다.
CREATE INDEX guestbook_entry_visible_idx
  ON guestbook_entry (status, created_at DESC);

-- 보류함 조회용.
CREATE INDEX guestbook_entry_created_idx
  ON guestbook_entry (created_at DESC);

COMMENT ON TABLE guestbook_entry IS '방문자가 남긴 방명록 글. status=visible 인 것만 공개된다.';
COMMENT ON COLUMN guestbook_entry.body IS '순수 텍스트. 마크다운·HTML 을 해석하지 않는다 — 표시 단계에서 텍스트로 넣는다.';

-- ── 남용 기록 ──
-- 원문 접속 주소를 저장하지 않는다. 소금 섞은 해시와 시각만 남긴다 (FR-020).
-- guestbook_entry 와 연결하지 않는다 — 연결하면 "누가 어떤 글을 썼는지" 복원할 수 있다.
CREATE TABLE abuse_mark (
  id          bigserial   PRIMARY KEY,
  client_hash text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX abuse_mark_client_idx
  ON abuse_mark (client_hash, created_at DESC);

CREATE INDEX abuse_mark_expiry_idx
  ON abuse_mark (expires_at);

COMMENT ON TABLE abuse_mark IS '반복 등록을 세기 위한 흔적. 사람을 식별하기 위한 것이 아니며 보관 기간이 지나면 지운다.';
COMMENT ON COLUMN abuse_mark.client_hash IS '접속 식별값 + 서버 소금의 해시. 원문을 저장하지 않는다.';
