import { describe, it, expect } from 'vitest';
import {
  bookFrontmatterSchema,
  shelfFrontmatterSchema,
  slugSchema,
  validateCollection,
  assertFeatureReadiness,
  ContentError,
  SPINE_COLORS,
  type Shelf,
  type Book,
} from '@/lib/schema';

const book = (over: Partial<Book> = {}): Book => ({
  slug: 'a-book',
  shelfSlug: 'profile',
  title: '책 제목',
  order: 1,
  spine: { color: 'crimson', height: 'tall', width: 'medium' },
  summary: '요약',
  body: '본문',
  ...over,
});

const shelf = (over: Partial<Shelf> = {}): Shelf => ({
  slug: 'profile',
  name: '프로필',
  order: 1,
  description: '설명',
  books: [],
  ...over,
});

const threeShelves = (books: Record<string, Book[]> = {}): Shelf[] => [
  shelf({ slug: 'profile', order: 1, books: books.profile ?? [] }),
  shelf({ slug: 'project', name: '프로젝트', order: 2, books: books.project ?? [] }),
  shelf({ slug: 'guestbook', name: '방명록', order: 3, books: books.guestbook ?? [] }),
];

describe('슬러그', () => {
  it.each(['profile', 'my-book', 'book-2'])('허용: %s', (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });

  it.each(['Profile', 'my_book', '한글', 'trailing-', '-leading', 'double--dash'])(
    '거부: %s',
    (s) => {
      expect(slugSchema.safeParse(s).success).toBe(false);
    },
  );
});

describe('책 프론트매터', () => {
  const valid = {
    title: '제목',
    order: 1,
    spine: { color: 'crimson', height: 'tall', width: 'medium' },
    summary: '요약',
  };

  it('올바른 값을 통과시킨다', () => {
    expect(bookFrontmatterSchema.safeParse(valid).success).toBe(true);
  });

  it('허용 목록 밖의 책등 색을 거부한다 — 대비가 검증되지 않은 조합이기 때문', () => {
    const r = bookFrontmatterSchema.safeParse({
      ...valid,
      spine: { ...valid.spine, color: 'neon' },
    });
    expect(r.success).toBe(false);
  });

  it('hex 리터럴을 색으로 쓰면 거부한다 (헌장 원칙 V)', () => {
    const r = bookFrontmatterSchema.safeParse({
      ...valid,
      spine: { ...valid.spine, color: '#ae1800' },
    });
    expect(r.success).toBe(false);
  });

  it('요약이 없으면 거부한다', () => {
    const { summary, ...noSummary } = valid;
    expect(bookFrontmatterSchema.safeParse(noSummary).success).toBe(false);
  });

  it('order 가 0 이하면 거부한다', () => {
    expect(bookFrontmatterSchema.safeParse({ ...valid, order: 0 }).success).toBe(false);
  });

  it('허용된 책등 색 9종을 모두 받는다', () => {
    for (const color of SPINE_COLORS) {
      const r = bookFrontmatterSchema.safeParse({ ...valid, spine: { ...valid.spine, color } });
      expect(r.success, color).toBe(true);
    }
  });
});

describe('책장 프론트매터', () => {
  it('emptyMessage 는 선택 사항이다', () => {
    const r = shelfFrontmatterSchema.safeParse({ name: '프로필', order: 1, description: '설명' });
    expect(r.success).toBe(true);
  });
});

describe('컬렉션 규칙', () => {
  it('책장이 셋이면 통과한다', () => {
    expect(() => validateCollection(threeShelves())).not.toThrow();
  });

  it('책장이 셋이 아니면 실패한다 (FR-001)', () => {
    expect(() => validateCollection([shelf()])).toThrow(ContentError);
  });

  it('책장 order 가 1·2·3 이 아니면 실패한다', () => {
    const bad = threeShelves();
    bad[2].order = 5;
    expect(() => validateCollection(bad)).toThrow(/order/);
  });

  it('책 슬러그가 책장을 가로질러 중복되면 실패한다', () => {
    const dup = threeShelves({
      profile: [book({ slug: 'same' })],
      project: [book({ slug: 'same', shelfSlug: 'project' })],
    });
    expect(() => validateCollection(dup)).toThrow(/중복/);
  });

  it('같은 책장 안에서 order 가 중복되면 실패한다', () => {
    const dup = threeShelves({
      profile: [book({ slug: 'a', order: 1 }), book({ slug: 'b', order: 1 })],
    });
    expect(() => validateCollection(dup)).toThrow(/order/);
  });

  it('빈 책장은 허용한다 (FR-014)', () => {
    expect(() => validateCollection(threeShelves({ profile: [book()] }))).not.toThrow();
  });
});

describe('기능 완료 조건 (FR-022)', () => {
  it('프로필 책장에 책이 있으면 통과한다', () => {
    expect(() => assertFeatureReadiness(threeShelves({ profile: [book()] }))).not.toThrow();
  });

  it('프로필 책장이 비어 있으면 실패한다', () => {
    expect(() => assertFeatureReadiness(threeShelves())).toThrow(/FR-022/);
  });
});
