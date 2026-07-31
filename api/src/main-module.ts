import { pathToFileURL } from 'node:url';

/**
 * 이 모듈이 `node <파일>` 로 직접 실행됐는가.
 *
 * 문자열로 `file://` + argv[1] 을 이어 붙이면 안 된다 — 윈도우에서 `import.meta.url` 은
 * `file:///C:/...`(슬래시 셋)인데 그 조합은 `file://C:/...`(둘)이라 절대 일치하지 않는다.
 * 리눅스에서는 우연히 맞아떨어져서, 컨테이너에서는 돌고 로컬에서만 조용히 안 뜨는
 * 형태가 된다. `pathToFileURL` 이 두 환경을 같게 만든다.
 */
export function isMainModule(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return importMetaUrl === pathToFileURL(entry).href;
}
