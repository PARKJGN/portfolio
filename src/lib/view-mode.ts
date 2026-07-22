/**
 * 보기 방식 상태 (FR-007 ~ FR-009).
 *
 * 콘텐츠가 아니라 방문자의 선택이므로 파일이 아니라 브라우저에 저장한다.
 * DOM 과 무관한 순수 함수로 두어 단위 테스트가 가능하게 했다.
 */

export const VIEW_MODES = ['paged', 'continuous'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** 기본값은 '한 장씩'. 시안의 책 은유를 첫인상으로 준다. */
export const DEFAULT_VIEW_MODE: ViewMode = 'paged';

export const STORAGE_KEY = 'book-view-mode';

/** 저장소에 무엇이 들어 있든 유효한 모드로 만든다. */
export function normalizeViewMode(value: unknown): ViewMode {
  return VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : DEFAULT_VIEW_MODE;
}

export function otherMode(mode: ViewMode): ViewMode {
  return mode === 'paged' ? 'continuous' : 'paged';
}

/**
 * 저장된 모드를 읽는다.
 * 사생활 보호 모드처럼 localStorage 접근이 예외를 던지는 환경에서도
 * 오류를 내지 않고 기본값으로 동작해야 한다.
 */
export function readStoredMode(storage: Pick<Storage, 'getItem'> | null | undefined): ViewMode {
  try {
    return normalizeViewMode(storage?.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

/** 저장에 실패해도 조용히 넘어간다 — 읽기 경험을 막을 이유가 없다. */
export function writeStoredMode(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  mode: ViewMode,
): void {
  try {
    storage?.setItem(STORAGE_KEY, mode);
  } catch {
    /* 저장 불가 환경. 이번 방문 동안만 유지된다. */
  }
}

/** 현재 위치와 전체 분량 (FR-010). 가로 스크롤 위치에서 계산한다. */
export function pageProgress(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  if (clientWidth <= 0) return { current: 1, total: 1 };
  const total = Math.max(1, Math.round(scrollWidth / clientWidth));
  const current = Math.min(total, Math.round(scrollLeft / clientWidth) + 1);
  return { current, total };
}
