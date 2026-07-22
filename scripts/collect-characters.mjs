/**
 * 화면에 나올 수 있는 모든 글자를 모은다. 부수 효과가 없는 순수 모듈이라
 * 서브셋 생성기와 단위 테스트가 함께 쓴다.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const SCAN_DIRS = ['src'];
const SCAN_EXT = new Set(['.md', '.ts', '.tsx', '.css']);

/** 어디서든 나오는 글자 — 콘텐츠에 없더라도 항상 담는다 */
const ALWAYS = (() => {
  let s = '';
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
  return s + '·—–…“”‘’←→「」『』※°±×÷≤≥';
})();

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (SCAN_EXT.has(extname(path))) files.push(path);
  }
  return files;
}

/**
 * 콘텐츠(마크다운)뿐 아니라 소스도 훑는다. 버튼 라벨·빈 상태 문구처럼 화면에
 * 보이는 한글이 컴포넌트 안에 있기 때문이다. 이걸 빼면 UI 글자만 폴백 글꼴로
 * 렌더되어 본문과 어긋난다.
 */
export function collectCharacters() {
  const chars = new Set(ALWAYS);

  for (const dir of SCAN_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      for (const ch of readFileSync(file, 'utf8')) chars.add(ch);
    }
  }

  return [...chars]
    .filter((c) => c.codePointAt(0) > 0x1f)
    .sort()
    .join('');
}
