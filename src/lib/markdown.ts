import { marked } from 'marked';

/**
 * 마크다운 → HTML. 빌드 시점에만 돈다.
 *
 * 콘텐츠는 저장소 안에서 사이트 주인이 직접 쓰는 글이므로 신뢰 경계 안쪽이다.
 * 방문자 입력을 렌더링하는 곳이 아니다 — 방명록(003)이 들어오면 그때는
 * 반드시 정화(sanitize)를 거쳐야 하고, 이 함수를 그대로 쓰면 안 된다.
 */
marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false });
}
