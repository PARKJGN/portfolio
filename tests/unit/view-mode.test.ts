import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_VIEW_MODE,
  STORAGE_KEY,
  normalizeViewMode,
  otherMode,
  pageProgress,
  readStoredMode,
  writeStoredMode,
} from '@/lib/view-mode';

describe('보기 방식 정규화', () => {
  it('기본값은 한 장씩이다', () => {
    expect(DEFAULT_VIEW_MODE).toBe('paged');
  });

  it.each(['paged', 'continuous'] as const)('유효한 값은 그대로 둔다: %s', (m) => {
    expect(normalizeViewMode(m)).toBe(m);
  });

  it.each([null, undefined, '', 'PAGED', 'zoomed', 42, {}])(
    '알 수 없는 값은 기본값으로 되돌린다: %s',
    (v) => {
      expect(normalizeViewMode(v)).toBe(DEFAULT_VIEW_MODE);
    },
  );

  it('전환은 두 값을 오간다 (FR-008)', () => {
    expect(otherMode('paged')).toBe('continuous');
    expect(otherMode('continuous')).toBe('paged');
  });
});

describe('저장소', () => {
  it('저장된 값을 읽는다 (FR-009)', () => {
    const storage = { getItem: vi.fn().mockReturnValue('continuous') };
    expect(readStoredMode(storage)).toBe('continuous');
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('저장소가 없어도 기본값으로 동작한다', () => {
    expect(readStoredMode(null)).toBe(DEFAULT_VIEW_MODE);
    expect(readStoredMode(undefined)).toBe(DEFAULT_VIEW_MODE);
  });

  it('읽기가 예외를 던져도 기본값으로 동작한다 — 사생활 보호 모드', () => {
    const storage = {
      getItem: () => {
        throw new Error('접근 거부');
      },
    };
    expect(() => readStoredMode(storage)).not.toThrow();
    expect(readStoredMode(storage)).toBe(DEFAULT_VIEW_MODE);
  });

  it('쓰기가 예외를 던져도 조용히 넘어간다 — 읽기를 막을 이유가 없다', () => {
    const storage = {
      setItem: () => {
        throw new Error('용량 초과');
      },
    };
    expect(() => writeStoredMode(storage, 'continuous')).not.toThrow();
  });

  it('저장소가 없어도 쓰기가 터지지 않는다', () => {
    expect(() => writeStoredMode(null, 'paged')).not.toThrow();
  });
});

describe('현재 위치와 전체 분량 (FR-010)', () => {
  it('첫 장', () => {
    expect(pageProgress(0, 800, 2400)).toEqual({ current: 1, total: 3 });
  });

  it('가운데 장', () => {
    expect(pageProgress(800, 800, 2400)).toEqual({ current: 2, total: 3 });
  });

  it('마지막 장', () => {
    expect(pageProgress(1600, 800, 2400)).toEqual({ current: 3, total: 3 });
  });

  it('한 장뿐이면 1 / 1', () => {
    expect(pageProgress(0, 800, 800)).toEqual({ current: 1, total: 1 });
  });

  it('스크롤이 끝을 살짝 넘어도 전체 분량을 넘지 않는다', () => {
    expect(pageProgress(2000, 800, 2400).current).toBe(3);
  });

  it('너비가 0 이어도 터지지 않는다 — 아직 그려지기 전 상태', () => {
    expect(pageProgress(0, 0, 0)).toEqual({ current: 1, total: 1 });
  });
});
