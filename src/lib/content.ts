import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import matter from 'gray-matter';
import {
  bookFrontmatterSchema,
  shelfFrontmatterSchema,
  slugSchema,
  validateCollection,
  ContentError,
  type Book,
  type Shelf,
} from './schema';

/**
 * 저장소의 마크다운을 읽어 방을 구성한다. 전부 빌드 시점에만 돈다 —
 * 클라이언트 번들에는 들어가지 않는다.
 */

const CONTENT_ROOT = join(process.cwd(), 'src', 'content');
const SHELVES_DIR = join(CONTENT_ROOT, 'shelves');
const BOOKS_DIR = join(CONTENT_ROOT, 'books');

function markdownFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => extname(f) === '.md')
    .sort();
}

function slugFromFilename(file: string): string {
  const slug = basename(file, '.md');
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    throw new ContentError(`파일명이 슬러그 규칙에 맞지 않는다: ${file} — ${parsed.error.issues[0].message}`);
  }
  return parsed.data;
}

function parseBook(shelfSlug: string, file: string): Book {
  const slug = slugFromFilename(file);
  const raw = readFileSync(join(BOOKS_DIR, shelfSlug, file), 'utf8');
  const { data, content } = matter(raw);

  const parsed = bookFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new ContentError(`책 프론트매터가 잘못됐다: ${shelfSlug}/${file} — ${detail}`);
  }

  const body = content.trim();
  if (body.length === 0) {
    throw new ContentError(
      `책 본문이 비어 있다: ${shelfSlug}/${file}. 빈 책은 존재할 수 없다 — 비어 있는 것은 책장 단위로만 허용된다.`,
    );
  }

  return { ...parsed.data, slug, shelfSlug, body };
}

function parseShelf(file: string): Shelf {
  const slug = slugFromFilename(file);
  const raw = readFileSync(join(SHELVES_DIR, file), 'utf8');
  const { data } = matter(raw);

  const parsed = shelfFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new ContentError(`책장 프론트매터가 잘못됐다: ${file} — ${detail}`);
  }

  // 소속 책장은 디렉터리가 결정한다. 프론트매터에 또 적지 않으므로 어긋날 여지가 없다.
  const books = markdownFilesIn(join(BOOKS_DIR, slug))
    .map((f) => parseBook(slug, f))
    .sort((a, b) => a.order - b.order);

  return { ...parsed.data, slug, books };
}

let cached: Shelf[] | null = null;

/**
 * 개발 중에는 캐시하지 않는다.
 *
 * 마크다운은 번들러의 모듈 그래프 밖에서 fs 로 읽으므로, 파일을 고쳐도 Next 개발
 * 서버가 이 모듈을 다시 평가하지 않는다. 캐시를 그대로 두면 서버를 켤 때 읽은 내용이
 * 세션 내내 남아, 글을 고쳐도 화면이 그대로인 것처럼 보인다. 빌드는 한 번만 도는
 * 프로세스라 캐시가 그대로 의미 있다.
 */
const CACHE_ENABLED = process.env.NODE_ENV === 'production';

/** 책장 셋을 배치 순서대로 반환한다. 컬렉션 규칙 위반은 여기서 던진다. */
export function getShelves(): Shelf[] {
  if (cached && CACHE_ENABLED) return cached;

  const shelves = markdownFilesIn(SHELVES_DIR)
    .map(parseShelf)
    .sort((a, b) => a.order - b.order);

  validateCollection(shelves);
  cached = shelves;
  return shelves;
}

export function getAllBooks(): Book[] {
  return getShelves().flatMap((s) => s.books);
}

export function getBook(slug: string): Book | undefined {
  return getAllBooks().find((b) => b.slug === slug);
}

/** 모든 책의 슬러그. 슬러그 고유성 검증·디버깅용. */
export function getBookSlugs(): string[] {
  return getAllBooks().map((b) => b.slug);
}

/** 같은 책장 안에서의 이전·다음 책. 열린 책에서 다른 책으로 갈아탈 때 쓴다. */
export function getBookNeighbors(slug: string): { prev?: Book; next?: Book } {
  const book = getBook(slug);
  if (!book) return {};
  const siblings = getShelves().find((s) => s.slug === book.shelfSlug)?.books ?? [];
  const i = siblings.findIndex((b) => b.slug === slug);
  return { prev: siblings[i - 1], next: siblings[i + 1] };
}

/** 폰트 서브셋(R-4)에 쓸, 콘텐츠에 실제로 등장하는 문자 집합. */
export function getUsedCharacters(): string {
  const shelves = getShelves();
  const text = shelves
    .flatMap((s) => [
      s.name,
      s.description,
      s.emptyMessage ?? '',
      ...s.books.flatMap((b) => [
        b.title,
        b.summary,
        b.year ?? '',
        b.callNumber ?? '',
        b.body,
        // 소개 카드·기술 스택 텍스트도 화면(3D canvas 포함)에 나오므로 서브셋에 담는다.
        b.profile?.name ?? '',
        b.profile?.english ?? '',
        ...(b.profile?.contacts ?? []),
        ...(b.tech?.flatMap((t) => [t.name, t.desc]) ?? []),
      ]),
    ])
    .join('');
  return [...new Set(text)].sort().join('');
}

/** 테스트용 — 모듈 캐시를 비운다. */
export function __resetCache(): void {
  cached = null;
}
