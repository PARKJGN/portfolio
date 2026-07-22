/**
 * 콘텐츠에 실제로 쓰인 글자만 담은 글꼴을 만든다 (research.md R-4).
 *
 * 한글 글꼴은 글리프가 많아 통째로 내려보내면 무겁다. 이 사이트는 콘텐츠가 전부
 * 저장소 안에 있는 정적 사이트라, 어떤 글자가 필요한지 빌드 시점에 알 수 있다.
 *
 *   실측:  유니코드 구간 분할 방식 — 방 243KB, 책 페이지 536KB (콘텐츠 늘면 증가)
 *          이 방식               — 두 굵기 합쳐 219KB 로 모든 페이지 커버
 *
 * 원본 글꼴(23MB)은 저장소에 두지 않는다. `npm run fonts:fetch` 로 한 번 받고
 * 결과물(작은 woff2)만 커밋한다.
 *
 * 한계: 방명록(003)은 방문자가 어떤 글자를 쓸지 미리 알 수 없어 이 방식이 통하지
 * 않는다. 그 화면만 유니코드 구간 분할 글꼴이나 시스템 글꼴로 처리해야 한다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import { collectCharacters } from './collect-characters.mjs';

const SOURCE = '.fontsrc/NotoSerifKR.ttf';
const OUT_DIR = 'public/fonts';
const WEIGHTS = [400, 700];
const CHARSET_RECORD = 'scripts/generated-charset.txt';

if (!existsSync(SOURCE)) {
  console.error(`원본 글꼴이 없다: ${SOURCE}\n먼저 실행: npm run fonts:fetch`);
  process.exit(1);
}

const text = collectCharacters();
const hangul = [...text].filter((c) => /[가-힣]/.test(c)).length;
console.log(`수집한 글자 ${text.length}자 (한글 음절 ${hangul}자)`);

mkdirSync(OUT_DIR, { recursive: true });
const source = readFileSync(SOURCE);

for (const weight of WEIGHTS) {
  const buf = await subsetFont(source, text, {
    targetFormat: 'woff2',
    variationAxes: { wght: weight }, // 가변 축을 고정해 정적 인스턴스로 뽑는다
  });
  const out = join(OUT_DIR, `noto-serif-kr-${weight}.woff2`);
  writeFileSync(out, buf);
  console.log(`${out} — ${(buf.length / 1024).toFixed(1)}KB`);
}

// 생성에 쓴 글자 목록을 남긴다. 콘텐츠에 새 글자가 생겼는데 글꼴을 다시 만들지
// 않으면 그 글자만 폴백으로 렌더되어 본문과 어긋난다 — 단위 테스트가 이 파일과
// 현재 콘텐츠를 대조해 그 상황을 잡는다.
// public/ 이 아니라 scripts/ 에 둔다 — 배포 산출물에 들어갈 이유가 없는 내부 기록이다.
writeFileSync(CHARSET_RECORD, text, 'utf8');
console.log(`${CHARSET_RECORD} — 대조용 글자 목록`);
