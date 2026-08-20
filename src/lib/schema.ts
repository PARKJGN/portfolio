import { z } from 'zod';

/**
 * 콘텐츠 계약의 실행 가능한 형태.
 * 사람이 읽는 정의는 specs/001-room-bookshelf-shell/contracts/content-schema.md 에 있다.
 *
 * 검증 실패는 빌드 실패로 이어진다. 잘못된 콘텐츠가 배포되는 것보다 빌드가 멈추는 편이 낫다.
 */

/** 책등 색 토큰. 각 값은 배경/글자 대비가 4.5:1 이상임이 확인된 쌍의 이름이다. */
export const SPINE_COLORS = [
  'crimson',
  'walnut',
  'sand',
  'olive',
  'parchment',
  'ink',
  'oak',
  'brick',
  'wine',
] as const;
export type SpineColor = (typeof SPINE_COLORS)[number];

export const SPINE_HEIGHTS = ['short', 'medium', 'tall'] as const;
export const SPINE_WIDTHS = ['narrow', 'medium', 'wide'] as const;

/** 파일명에서 유도되는 슬러그. 소문자·숫자·하이픈만 허용한다. */
export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '슬러그는 소문자·숫자·하이픈만 쓸 수 있다');

export const shelfFrontmatterSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().positive(),
  description: z.string().min(1),
  emptyMessage: z.string().min(1).optional(),
});

/** 프로필 책의 소개 카드(사진 + 이름 + 연락처)와 기술 스택. 있으면 소개용으로 렌더한다. */
export const profileSchema = z.object({
  name: z.string().min(1),
  english: z.string().optional(),
  /** 사진 경로. 비어 있으면 자리표시 네모를 그린다. */
  photo: z.string().optional(),
  contacts: z.array(z.string().min(1)).optional(),
});

export const techSchema = z.object({
  name: z.string().min(1),
  /** 아이콘 색(브랜드색). 자리표시 네모/원에 쓴다. */
  color: z.string().optional(),
  desc: z.string().min(1),
});

export const bookFrontmatterSchema = z.object({
  title: z.string().min(1),
  order: z.number().int().positive(),
  spine: z.object({
    color: z.enum(SPINE_COLORS),
    height: z.enum(SPINE_HEIGHTS),
    width: z.enum(SPINE_WIDTHS),
  }),
  year: z.string().optional(),
  callNumber: z.string().optional(),
  summary: z.string().min(1),
  profile: profileSchema.optional(),
  tech: z.array(techSchema).optional(),
  /**
   * 이 책을 어떤 리더로 열 것인가. 기본은 3D 다.
   *
   * `flat` 은 3D 를 건너뛰고 평면 모달로 연다. 원래 방명록을 위해 둔 탈출구였는데
   * (003 research.md R-2), 그 결정이 2026-08-01 에 뒤집혀 방명록도 3D 로 연다 — 캔버스에
   * 입력칸을 못 놓는 제약은 3D 가 한 면을 비우고 그 위에 진짜 폼을 얹어 풀었다.
   *
   * **지금 이 값을 쓰는 책은 없다.** 어떤 책이 3D 와 맞지 않는 것으로 드러날 때를 위해
   * 남겨 둔 장치다. 쓸 일이 끝내 없다면 걷어내도 된다.
   */
  reader: z.enum(['3d', 'flat']).optional(),
  /** 이 책 자리에 방명록(폼 + 목록)을 놓는다. 본문 아래에 붙는다. */
  guestbook: z.boolean().optional(),
});

export type ShelfFrontmatter = z.infer<typeof shelfFrontmatterSchema>;
export type BookFrontmatter = z.infer<typeof bookFrontmatterSchema>;

export interface Book extends BookFrontmatter {
  slug: string;
  shelfSlug: string;
  /** 마크다운 원문. 비어 있으면 빌드가 실패한다. */
  body: string;
}

export interface Shelf extends ShelfFrontmatter {
  slug: string;
  books: Book[];
}

/** 방에는 책장이 정확히 셋이다 (FR-001). */
export const SHELF_COUNT = 3;

/** 프로필 책장의 슬러그. FR-022 검사에 쓴다. */
export const PROFILE_SHELF_SLUG = 'profile';

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

/**
 * 개별 파일 검증을 통과한 책장들이 컬렉션으로서 성립하는지 본다.
 * 파일 하나만 봐서는 알 수 없는 규칙들이다.
 */
export function validateCollection(shelves: Shelf[]): void {
  if (shelves.length !== SHELF_COUNT) {
    throw new ContentError(
      `책장은 정확히 ${SHELF_COUNT}개여야 한다. 현재 ${shelves.length}개 (FR-001).`,
    );
  }

  const orders = shelves.map((s) => s.order).sort((a, b) => a - b);
  const expected = Array.from({ length: SHELF_COUNT }, (_, i) => i + 1);
  if (orders.join(',') !== expected.join(',')) {
    throw new ContentError(
      `책장 order 는 ${expected.join('·')} 이 각각 하나씩이어야 한다. 현재 ${orders.join('·')}.`,
    );
  }

  // 슬러그는 모달 id(book-dialog-<slug>)로 쓰이므로 책장을 가로질러 고유해야 한다.
  const seen = new Map<string, string>();
  for (const shelf of shelves) {
    for (const book of shelf.books) {
      const prev = seen.get(book.slug);
      if (prev) {
        throw new ContentError(
          `책 슬러그가 중복된다: "${book.slug}" (${prev}, ${shelf.slug}). ` +
            `모달 id(book-dialog-<slug>)가 겹치면 안 되므로 책장이 달라도 고유해야 한다.`,
        );
      }
      seen.set(book.slug, shelf.slug);
    }

    const shelfOrders = shelf.books.map((b) => b.order);
    if (new Set(shelfOrders).size !== shelfOrders.length) {
      throw new ContentError(`"${shelf.slug}" 책장 안에서 책 order 가 중복된다.`);
    }
  }
}

/**
 * FR-022 — 프로필 책장에 본문을 가진 책이 최소 1권 있어야 한다.
 *
 * validateCollection 과 분리한 이유: 이 규칙은 "골격이 검증 가능한 상태인가"를 묻는
 * 기능 완료 조건이라, 콘텐츠 구조가 올바른가와는 성격이 다르다. 실제 프로필 책을
 * 쓰는 T018 이 끝난 뒤 페이지 빌드 시점(T021)에서 호출한다.
 */
export function assertFeatureReadiness(shelves: Shelf[]): void {
  const profile = shelves.find((s) => s.slug === PROFILE_SHELF_SLUG);
  if (!profile) {
    throw new ContentError(`"${PROFILE_SHELF_SLUG}" 책장이 없다.`);
  }
  if (profile.books.length === 0) {
    throw new ContentError(
      `프로필 책장에 본문을 가진 책이 최소 1권 있어야 한다 (FR-022). 현재 0권.`,
    );
  }
}
