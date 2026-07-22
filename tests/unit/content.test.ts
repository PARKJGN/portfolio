import { describe, it, expect, beforeEach } from 'vitest';
import {
  getShelves,
  getAllBooks,
  getBook,
  getBookSlugs,
  getBookNeighbors,
  getUsedCharacters,
  __resetCache,
} from '@/lib/content';

// 이 테스트는 저장소의 실제 콘텐츠 파일을 읽는다.
// 픽스처를 따로 두지 않는 이유: 검증하려는 위험이 "실제 파일이 계약을 지키는가"이기 때문이다.
// 가짜 파일로 통과시켜도 배포되는 것은 진짜 파일이다.
describe('실제 콘텐츠 로딩', () => {
  beforeEach(() => __resetCache());

  it('책장 셋을 배치 순서대로 읽는다', () => {
    const shelves = getShelves();
    expect(shelves.map((s) => s.slug)).toEqual(['profile', 'project', 'guestbook']);
    expect(shelves.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('책장 이름이 명세와 일치한다 (FR-002)', () => {
    expect(getShelves().map((s) => s.name)).toEqual(['프로필', '프로젝트', '방명록']);
  });

  it('모든 책장에 빈 상태 안내 문구가 있다 (FR-014)', () => {
    for (const s of getShelves()) {
      expect(s.emptyMessage, s.slug).toBeTruthy();
    }
  });

  it('책 슬러그가 전부 고유하다', () => {
    const slugs = getBookSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('알 수 없는 슬러그는 undefined 를 준다', () => {
    expect(getBook('없는-책')).toBeUndefined();
  });

  it('없는 책의 이웃을 물어도 터지지 않는다', () => {
    expect(getBookNeighbors('없는-책')).toEqual({});
  });

  it('폰트 서브셋용 문자 집합이 중복 없이 나온다', () => {
    const chars = getUsedCharacters();
    expect(chars.length).toBeGreaterThan(0);
    expect(new Set([...chars]).size).toBe(chars.length);
    // 책장 이름에 쓰인 글자는 반드시 포함되어야 한다
    for (const ch of '프로필프로젝트방명록') {
      expect(chars, ch).toContain(ch);
    }
  });

  it('책이 없어도 로딩이 성공한다 — 빈 것은 책장 단위로 허용된다', () => {
    expect(() => getAllBooks()).not.toThrow();
  });
});
