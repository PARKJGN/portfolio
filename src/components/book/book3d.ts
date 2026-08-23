/**
 * 3D 책 리더 (Three.js).
 *
 * 헌장 원칙 I·성능 때문에 이 모듈은 **책을 처음 누를 때만 동적 import** 된다.
 * 초기 로딩에는 들어가지 않는다. 읽는 동안 화면은 계속 3D 책이고, 페이지 넘김도
 * 3D 로 한다. 접근성·무JS·검색을 위해 같은 내용의 HTML 은 화면 뒤에 그대로 두고
 * (낭독기가 읽는다), 조작 버튼(넘기기·덮기)도 HTML 을 재사용한다.
 *
 * 좌표계: z=0 평면이 화면 픽셀과 1:1 이 되도록 원근 카메라를 배치한다.
 * world.x = 화면 x, world.y = (뷰포트 높이 - 화면 y).
 *
 * 모델(그룹 원점 = 책등 x=0):
 *  - body: 책 몸통 상자. 앞면(+z)=오른쪽 페이지(갱신), -x=책등, 그 외=페이지 단면.
 *  - coverHinge/cover: 앞표지. 열리면 -pi 회전해 왼쪽에 눕고, 안쪽(-z)=왼쪽 페이지(갱신).
 *  - turnHinge/turnLeaf: 넘기는 한 장. 평소 숨김. 앞/뒤 면 텍스처를 갈아 끼워 회전.
 */
import type * as THREE_NS from 'three';
import { logoFor } from '@/lib/tech-logos';

type THREE = typeof THREE_NS;

/** 페이지에 흐르는 한 덩이. 소개 카드(header)·소제목(h)·문단(p)·목록(li)·기술(tech). */
export type Block =
  | { kind: 'header'; name: string; english?: string; contacts: string[]; photo?: string }
  | { kind: 'product'; name: string; meta?: string; logo?: string; logoOnDark?: boolean }
  | { kind: 'h'; text: string; sub?: boolean }
  /**
   * `href` 가 있으면 이 덩이는 통째로 링크다 — 종이 위에서 눌린다.
   *
   * 글 가운데 일부만 링크로 만들지 않는 이유: `wrapLines` 가 긴 토큰을 글자 단위로
   * 쪼개기도 해서 원문 오프셋을 줄 위치로 되짚는 일이 취약하다. 문단이나 목록 항목
   * 하나를 통째로 링크로 두면 그 덩이의 모든 줄이 곧 링크 자리라 되짚을 것이 없다.
   * 콘텐츠는 주인이 직접 쓰므로 "링크는 제 줄에 둔다" 는 지킬 만한 약속이다.
   */
  | { kind: 'p'; text: string; href?: string }
  | { kind: 'li'; text: string; href?: string }
  | { kind: 'tech'; name: string; color?: string; desc: string }
  /**
   * 방명록에 남겨진 글 한 편.
   *
   * 다른 덩이와 달리 **시스템 글꼴로 그린다.** 방문자가 무슨 글자를 쓸지 알 수 없어
   * 서브셋 글꼴로는 담을 수 없기 때문이다(HTML 쪽 .guestbook__body 와 같은 이유).
   */
  | { kind: 'entry'; author: string; when: string; text: string };

/**
 * 한 덩이를 앞에서부터 이만큼만 드러낸다 — 방금 남긴 글이 펜을 따라 그어지는 연출.
 *
 * 왜 종이 텍스처에 직접 그리는가: 종이 위에 캔버스를 겹쳐 놓고 같은 글을 다시 그리면
 * 줄바꿈 위치를 두 곳에서 계산하게 되고, 반드시 어긋난다. 여기서 그리면 줄을 나눈 바로
 * 그 코드가 드러내는 일까지 맡으므로 어긋날 자리가 없다.
 *
 * `ratio` 는 **덩이 전체**에 대한 비율이다. 두 면에 걸친 글이면 두 면을 모두 다시 그려야
 * 하고(`Book3D.reveal`), 각 면은 앞 면에서 지나온 거리를 빼고 자기 몫을 그린다 —
 * 그래야 펜이 왼 면 끝에서 오른 면 첫머리로 이어진다.
 */
export interface Reveal {
  /** 드러낼 덩이의 blocks 안 번호. */
  block: number;
  /** 0 이면 한 글자도 안 보이고, 1 이면 다 보인다. */
  ratio: number;
}

export interface BookVisual {
  cover: string;
  ink: string;
  pages: string;
  title: string;
  year?: string;
  blocks?: Block[];
}

/** 종이 위에서 눌리는 자리. 좌표는 페이지 텍스처의 픽셀이다. */
export interface LinkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  href: string;
  /** 종이에 그려진 글자. 손잡이의 이름으로 쓴다 — 낭독기가 이것을 읽는다. */
  text: string;
}

/** 지금 보이는 링크 하나 — 화면 좌표. 컨트롤러가 이 자리에 `<a>` 를 얹는다. */
export interface VisibleLink {
  left: number;
  top: number;
  width: number;
  height: number;
  href: string;
  text: string;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 페이지에 그릴 이미지(소개 사진·제품 로고).
 *
 * 캔버스에 그리는 일은 **동기**다 — `buildPages` 가 페이지 텍스처를 한 번에 만든다.
 * 그래서 이미지는 그리기 전에 미리 받아 두고, 그릴 때는 이 표에서 꺼내 쓴다.
 *
 * 못 받은 이미지는 표에 없고, 그리는 쪽은 그때 자리표시 네모를 그린다. **이미지 하나가
 * 책 열리는 것을 막지 않는다** — 로고가 안 뜨는 것보다 책이 안 열리는 것이 나쁘다.
 */
const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string, timeoutMs: number): Promise<void> {
  if (imageCache.has(src)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (ok) imageCache.set(src, img);
      resolve();
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    img.src = src;
  });
}

/**
 * 블록이 쓰는 이미지를 모두 받아 둔다. 실패해도 거절하지 않는다.
 *
 * 3D 를 띄우기 직전에 부른다. 대개는 HTML 이 이미 같은 주소를 받아 두어 캐시에서 즉시
 * 끝나고, 그렇지 않더라도 정해진 시간을 넘기면 기다리지 않는다.
 */
export function preloadBlockImages(blocks: Block[], timeoutMs = 1500): Promise<void> {
  const urls = new Set<string>();
  for (const b of blocks) {
    if (b.kind === 'header' && b.photo) urls.add(b.photo);
    if (b.kind === 'product' && b.logo) urls.add(b.logo);
  }
  if (urls.size === 0) return Promise.resolve();
  return Promise.all([...urls].map((u) => loadImage(u, timeoutMs))).then(() => undefined);
}

/**
 * 정사각 칸에 이미지를 그린다. 표에 없으면 false 를 돌려주고 부르는 쪽이 자리표시를 그린다.
 *
 * `cover` 는 칸을 채우고 넘치는 만큼 잘라낸다(사진 — 3:4 를 정사각에 맞출 때 필요하다),
 * `contain` 은 다 보이게 넣고 남는 자리를 비운다(로고 — 잘리면 안 된다).
 * HTML 쪽 object-fit 과 같은 규칙을 캔버스에서 손으로 구현한 것이다.
 */
function drawImageInBox(
  g: CanvasRenderingContext2D,
  src: string | undefined,
  x: number,
  y: number,
  size: number,
  fit: 'cover' | 'contain',
  /**
   * cover 로 자를 때 원본의 어디를 남길지 (0 = 위, 0.5 = 가운데, 1 = 아래).
   * CSS 의 object-position 세로값과 같은 뜻이다.
   */
  focusY = 0.5,
): boolean {
  const img = src ? imageCache.get(src) : undefined;
  if (!img || !img.naturalWidth || !img.naturalHeight) return false;

  const ratio = img.naturalWidth / img.naturalHeight;
  let dw = size;
  let dh = size;
  if (fit === 'contain') {
    if (ratio > 1) dh = size / ratio;
    else dw = size * ratio;
  }
  const dx = x + (size - dw) / 2;
  const dy = y + (size - dh) / 2;

  if (fit === 'cover') {
    // 넘치는 부분을 칸 밖으로 흘리지 않게 잘라낸다.
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (ratio > 1) sw = sh;
    else sh = sw;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) * focusY;
    g.drawImage(img, sx, sy, sw, sh, x, y, size, size);
  } else {
    g.drawImage(img, dx, dy, dw, dh);
  }
  return true;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PI = Math.PI;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}
function tex(THREE: THREE, c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function coverTexture(THREE: THREE, v: BookVisual, w: number, h: number, blank = false) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.cover;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = v.pages;
  g.fillRect(0, 0, c.width, Math.max(2, c.height * 0.012));
  if (!blank) {
    g.fillStyle = v.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fs = Math.round(c.width * 0.11);
    g.font = `600 ${fs}px "Noto Serif KR Subset", serif`;
    g.fillText(v.title, c.width / 2, c.height / 2);
    if (v.year) {
      g.globalAlpha = 0.85;
      g.font = `500 ${Math.round(fs * 0.42)}px "Noto Serif KR Subset", serif`;
      g.fillText(v.year, c.width / 2, c.height / 2 + fs * 0.95);
      g.globalAlpha = 1;
    }
  }
  return tex(THREE, c);
}

function spineTexture(THREE: THREE, v: BookVisual, w: number, h: number) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.cover;
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(PI / 2);
  g.fillStyle = v.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(c.width * 0.5)}px "Noto Serif KR Subset", serif`;
  g.fillText(v.title, 0, 0);
  g.restore();
  return tex(THREE, c);
}

function edgeTexture(THREE: THREE, v: BookVisual, w: number, h: number, vertical: boolean) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.pages;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(90,70,40,0.28)';
  g.lineWidth = 1;
  const n = vertical ? c.width : c.height;
  for (let i = 3; i < n; i += 3) {
    g.beginPath();
    if (vertical) {
      g.moveTo(i, 0);
      g.lineTo(i, c.height);
    } else {
      g.moveTo(0, i);
      g.lineTo(c.width, i);
    }
    g.stroke();
  }
  return tex(THREE, c);
}

/**
 * 접기 단위로 쪼갠다. 한글은 글자마다 끊어도 되지만 라틴 낱말은 그러면 안 된다
 * (`React Native` 가 `Nativ`/`e` 로 갈라진다). 낱말은 한 덩어리로 묶고 나머지는
 * 글자 단위로 둔다. 낱말 안에 섞이는 기호(`Next.js`·`n8n`·`amd64/arm64`)도 함께 묶는다.
 */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let word = '';
  for (const ch of text) {
    // 낱말이 시작된 뒤에만 붙는 기호가 있다 — `min(sort)` 의 괄호가 그렇다.
    // 낱말을 시작하지는 못하므로 `(카테고리` 같은 한글은 영향받지 않는다.
    const cont = word ? /[0-9A-Za-z.\-_/+#@'()]/.test(ch) : /[0-9A-Za-z]/.test(ch);
    if (cont) {
      word += ch;
      continue;
    }
    if (word) {
      out.push(word);
      word = '';
    }
    out.push(ch);
  }
  if (word) out.push(word);
  return out;
}

/**
 * 책 뒤 벽에 지는 그림자.
 *
 * 크림색 종이와 크림색 벽은 명도가 거의 같아, 그림자가 없으면 책이 물체로 읽히지 않고
 * 벽에 글씨만 떠 있는 것처럼 보인다. 캔버스는 알파를 가지므로 이 어두운 판이 그대로
 * 뒤쪽 HTML 방 위에 얹혀 진짜 그림자처럼 보인다.
 */
function shadowTexture(THREE: THREE, w: number, h: number) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  const pad = Math.round(w * 0.1);
  g.filter = `blur(${Math.round(w * 0.05)}px)`;
  g.fillStyle = 'rgba(38,24,8,0.45)';
  g.fillRect(pad, pad, c.width - pad * 2, c.height - pad * 2);
  g.filter = 'none';
  return tex(THREE, c);
}

/** 줄 첫머리에 홀로 설 수 없는 문장부호(금칙). 넘치더라도 앞 줄에 붙인다. */
const NO_LINE_START = /^[.,)\]}!?;:%·…’”]$/;

function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur) lines.push(cur);
    cur = '';
  };
  for (const tk of tokenize(text)) {
    if (!cur && tk === ' ') continue; // 줄 첫머리로 밀려난 공백은 버린다
    // 마침표 하나가 다음 줄로 떨어지는 것보다 한 글자 넘치는 편이 낫다.
    if (cur && NO_LINE_START.test(tk)) {
      cur += tk;
      continue;
    }
    // 한 줄보다 긴 덩어리(긴 주소 같은 것)는 어쩔 수 없이 글자로 쪼갠다.
    if (g.measureText(tk).width > maxW) {
      for (const ch of tk) {
        if (cur && g.measureText(cur + ch).width > maxW) flush();
        cur += ch;
      }
      continue;
    }
    if (cur && g.measureText(cur + tk).width > maxW) {
      flush();
      if (tk === ' ') continue;
    }
    cur += tk;
  }
  flush();
  return lines;
}

const INK = '#463714';
/** 성과 소제목 앞 표식 색 — CSS 의 --page-accent 와 같은 값. */
const ACCENT = '#ae1800';
/** 곁들이는 글(방명록의 이름·날짜). 본문보다 흐려 글 자체가 먼저 읽힌다. */
const CAPTION = 'rgba(70,55,20,0.62)';
const serif = (weight: number, px: number) => `${weight} ${px}px "Noto Serif KR Subset", serif`;
/**
 * 방문자가 쓴 글자용. 서브셋 글꼴에 없는 글자가 섞여도 시스템 글꼴이 받아 준다 —
 * 캔버스도 HTML 과 똑같이 글꼴 대체가 동작한다. (초안에서는 이것을 못 한다고 보고
 * 방명록을 평면으로 정했는데, 그 판단이 틀렸다.)
 */
const sans = (weight: number, px: number) =>
  `${weight} ${px}px system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif`;

/** 소개 카드: 왼쪽 사진(자리표시) + 오른쪽 이름·영문·연락처. 쓴 높이를 돌려준다. */
function drawHeader(
  g: CanvasRenderingContext2D,
  b: Extract<Block, { kind: 'header' }>,
  x: number,
  colW: number,
  y: number,
  cw: number,
) {
  const ps = Math.round(cw * 0.22); // 사진 정사각 한 변

  // 사진이 있으면 그린다. 세로 사진이라도 cover 로 가운데를 잘라 정사각을 채운다 —
  // HTML 쪽 .profile-card__photo 의 object-fit: cover 와 같은 결과다.
  // focusY = 0 — 위를 기준으로 자른다. 인물 사진은 얼굴이 위쪽에 있어 가운데를 자르면
  // 머리가 잘린다(900×1200 사진에서 위 150px 이 날아갔다). 아래 여백은 잘려도 무방하다.
  if (drawImageInBox(g, b.photo, x, y, ps, 'cover', 0)) {
    // 종이 위에 사진만 덩그러니 놓이지 않게 얇은 테두리를 두른다.
    g.strokeStyle = 'rgba(70,55,20,0.25)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, ps - 2, ps - 2);
  } else {
    // 사진이 없거나 못 받았을 때 — 옅은 네모 + 테두리 + '사진'
    g.fillStyle = 'rgba(70,55,20,0.08)';
    g.fillRect(x, y, ps, ps);
    g.strokeStyle = 'rgba(70,55,20,0.35)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, ps - 2, ps - 2);
    g.fillStyle = 'rgba(70,55,20,0.5)';
    g.textAlign = 'center';
    g.font = serif(500, Math.round(cw * 0.03));
    g.fillText('사진', x + ps / 2, y + ps / 2 + cw * 0.011);
    g.textAlign = 'left';
  }

  // 오른쪽 메타
  const mx = x + ps + Math.round(cw * 0.05);
  let my = y + Math.round(cw * 0.02);
  g.fillStyle = INK;
  const nameS = Math.round(cw * 0.054);
  g.font = serif(600, nameS);
  g.fillText(b.name, mx, my + nameS);
  my += nameS * 1.28;
  if (b.english) {
    const es = Math.round(cw * 0.03);
    g.fillStyle = 'rgba(70,55,20,0.7)';
    g.font = serif(500, es);
    g.fillText(b.english, mx, my + es);
    my += es * 1.7;
  }
  const cs = Math.round(cw * 0.028);
  g.font = serif(400, cs);
  g.fillStyle = 'rgba(70,55,20,0.82)';
  for (const line of b.contacts) {
    my += cs * 0.2;
    g.fillText(line, mx, my + cs, colW - (mx - x));
    my += cs * 1.5;
  }

  let used = Math.max(ps, my - y) + Math.round(cw * 0.03);
  // 카드 아래 얇은 구분선
  g.strokeStyle = 'rgba(70,55,20,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + used);
  g.lineTo(x + colW, y + used);
  g.stroke();
  used += Math.round(cw * 0.04);
  return used;
}

/**
 * 제품 머리: 정사각 로고 자리 + 오른쪽에 제품명·회사·기간.
 *
 * 로고 이미지는 아직 없다. 자리만 네모로 잡아 두고, 파일이 들어오면 소개 사진과 같은
 * 방식(이미지 비동기 프리로드)이 필요하다 — path 로 그리는 기술 로고와 달리 그림이라
 * 그리기 전에 다 받아 놔야 한다.
 */
function drawProduct(
  g: CanvasRenderingContext2D,
  b: Extract<Block, { kind: 'product' }>,
  x: number,
  colW: number,
  y: number,
  cw: number,
  measureOnly = false,
) {
  const ls = Math.round(cw * 0.13); // 로고 정사각 한 변
  const ns = Math.round(cw * 0.046);
  const ms = Math.round(cw * 0.028);
  const textH = ns * 1.45 + (b.meta ? ms * 1.6 : 0) + Math.round(cw * 0.012);
  const height = Math.max(ls, textH) + Math.round(cw * 0.05);
  if (measureOnly) return height;

  // 흰색 로고는 어두운 배경용이라 크림색 종이에 묻힌다. 브랜드 마크를 반전시키는 대신
  // 어두운 판을 깔아 준다(HTML 의 img.product__logo--on-dark 와 같은 규칙).
  // 자동 판별하지 않고 콘텐츠가 표시한다 — 밝기 추측은 어긋나는 날 이유를 알기 어렵다.
  const hasLogo = b.logo !== undefined && imageCache.has(b.logo);
  if (hasLogo && b.logoOnDark) {
    g.fillStyle = INK;
    const r = Math.round(ls * 0.06);
    g.beginPath();
    g.roundRect(x, y, ls, ls, r);
    g.fill();
  }

  // 로고는 contain — 잘리면 안 된다. 정사각이 아닌 로고도 다 보이게 넣는다.
  // 테두리를 두르지 않는 이유: 로고는 대개 배경이 투명해서, 네모를 치면 종이 위에
  // 상자가 하나 더 얹힌 것처럼 보인다(HTML 쪽 img.product__logo 도 같은 이유로 걷었다).
  // 어두운 판 위에서는 로고를 조금 줄여 판의 여백을 남긴다.
  const pad = b.logoOnDark ? Math.round(ls * 0.14) : 0;
  if (!drawImageInBox(g, b.logo, x + pad, y + pad, ls - pad * 2, 'contain')) {
    g.fillStyle = 'rgba(70,55,20,0.07)';
    g.fillRect(x, y, ls, ls);
    g.strokeStyle = 'rgba(70,55,20,0.3)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, ls - 2, ls - 2);
    g.fillStyle = 'rgba(70,55,20,0.45)';
    g.textAlign = 'center';
    g.font = serif(500, Math.round(cw * 0.026));
    g.fillText('로고', x + ls / 2, y + ls / 2 + cw * 0.009);
    g.textAlign = 'left';
  }

  const mx = x + ls + Math.round(cw * 0.045);
  let my = y + Math.round(cw * 0.012);
  g.fillStyle = INK;
  g.font = serif(600, ns);
  g.fillText(b.name, mx, my + ns);
  my += ns * 1.45;
  if (b.meta) {
    g.font = serif(400, ms);
    g.fillStyle = 'rgba(70,55,20,0.7)';
    g.fillText(b.meta, mx, my + ms, colW - (mx - x));
  }
  return height;
}

/** 기술 한 항목: 색 아이콘(자리표시) + 이름 + 2줄 설명. measureOnly 면 안 그리고 높이만. */
function drawTech(
  g: CanvasRenderingContext2D,
  b: Extract<Block, { kind: 'tech' }>,
  x: number,
  colW: number,
  y: number,
  cw: number,
  measureOnly = false,
) {
  const ic = Math.round(cw * 0.075); // 아이콘 한 변
  const tx = x + ic + Math.round(cw * 0.035); // 글자 시작
  const tw = colW - (tx - x);
  const ns = Math.round(cw * 0.037);
  const ds = Math.round(cw * 0.028);
  const lh = ds * 1.42;
  g.font = serif(400, ds);
  // 설명의 명시적 개행(\n)을 지킨 뒤, 각 줄을 폭에 맞춰 다시 접는다.
  const lines = b.desc.split('\n').flatMap((seg) => wrapLines(g, seg, tw));
  const textH = ns * 1.5 + lines.length * lh;
  const height = Math.max(ic, textH) + Math.round(cw * 0.03);
  if (measureOnly) return height;

  // 아이콘 — 로고를 아는 기술이면 브랜드색 심벌(24×24 path 를 아이콘 크기로 축소),
  // 모르면 색 둥근 네모 + 이니셜. HTML 쪽(BookContent)과 같은 판단이다.
  const logo = logoFor(b.name);
  if (logo) {
    g.save();
    g.translate(x, y);
    g.scale(ic / 24, ic / 24);
    g.fillStyle = b.color || logo.color;
    g.fill(new Path2D(logo.path));
    g.restore();
  } else {
    g.fillStyle = b.color || '#8a6d3b';
    const r = Math.round(ic * 0.22);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + ic, y, x + ic, y + ic, r);
    g.arcTo(x + ic, y + ic, x, y + ic, r);
    g.arcTo(x, y + ic, x, y, r);
    g.arcTo(x, y, x + ic, y, r);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = serif(700, Math.round(ic * 0.52));
    g.fillText(b.name.slice(0, 1), x + ic / 2, y + ic / 2 + ic * 0.18);
    g.textAlign = 'left';
  }

  g.fillStyle = INK;
  g.font = serif(600, ns);
  g.fillText(b.name, tx, y + ns);
  let yy = y + ns * 1.5;
  g.font = serif(400, ds);
  g.fillStyle = 'rgba(70,55,20,0.9)';
  for (const ln of lines) {
    g.fillText(ln, tx, yy + ds, tw);
    yy += lh;
  }
  return height;
}

/** 산문 한 덩이(소제목·문단·목록)를 접어 놓은 결과. 재기 따로, 그리기 따로 쓴다. */
interface Flow {
  font: string;
  fs: number;
  lineH: number;
  gap: number;
  after: number;
  indent: number;
  lines: string[];
  /** 앞뒤 여백까지 포함한 총 높이. */
  blockH: number;
  isLi: boolean;
  /** 성과 소제목(h3) — 앞에 표식 네모를 그린다. */
  isSub: boolean;
  /** 통째로 링크인 덩이. 색을 달리하고 밑줄을 긋고, 눌린 자리를 알린다. */
  href?: string;
  /** 그 덩이의 원문. 링크 손잡이의 이름으로 쓴다. */
  text: string;
  /** 방명록 글의 '이름 · 날짜' 줄. 없으면 방명록 글이 아니다. */
  meta?: string;
  metaFs: number;
  metaH: number;
}

type FlowBlock = Extract<Block, { kind: 'h' | 'p' | 'li' | 'entry' }>;

/** 덩이를 폭에 맞춰 접고 크기를 잰다. 재는 동안 g.font 가 그 덩이의 글꼴로 바뀐다. */
function measureFlow(g: CanvasRenderingContext2D, bl: FlowBlock, cw: number, colW: number): Flow {
  const isH = bl.kind === 'h';
  const isLi = bl.kind === 'li';
  const isEntry = bl.kind === 'entry';
  const sub = bl.kind === 'h' && bl.sub;
  // 글자는 작게, 사이는 넉넉하게. 빽빽한 큰 글씨보다 이쪽이 훨씬 잘 읽힌다.
  const fs = isH ? Math.round(cw * (sub ? 0.036 : 0.042)) : Math.round(cw * 0.03);
  const lineH = fs * 1.62;
  // 방명록 글만 시스템 글꼴 — 방문자가 무슨 글자를 쓸지 알 수 없다.
  const font = isEntry ? sans(400, fs) : serif(isH ? 600 : 400, fs);
  g.font = font;
  // 목록의 글머리 기호, 소제목의 표식 네모 — 그 자리만큼 안으로 들이고 폭이 줄어든다.
  const indent = isLi ? Math.round(cw * 0.032) : sub ? Math.round(cw * 0.028) : 0;
  // 소제목 앞은 크게 벌려 덩이의 시작이 눈에 띄게 한다.
  const gap = isH ? lineH * (sub ? 0.9 : 1.05) : 0;
  // 목록 항목끼리는 문단 사이보다 촘촘히 붙인다.
  const after = isH ? lineH * 0.3 : isLi ? lineH * 0.22 : isEntry ? lineH * 0.85 : lineH * 0.6;
  // 방명록 글은 본문 위에 '이름 · 날짜' 한 줄을 얹는다. 그 줄도 방문자 이름을 담으므로
  // 시스템 글꼴이다.
  const metaFs = isEntry ? Math.round(fs * 0.78) : 0;
  const metaH = isEntry ? metaFs * 1.7 : 0;
  const lines = wrapLines(g, bl.text, colW - indent);
  return {
    font,
    fs,
    lineH,
    gap,
    after,
    indent,
    lines,
    blockH: gap + metaH + lines.length * lineH + after,
    isLi,
    isSub: !!sub,
    href: bl.kind === 'p' || bl.kind === 'li' ? bl.href : undefined,
    text: bl.text,
    meta: isEntry ? `${bl.author} · ${bl.when}` : undefined,
    metaFs,
    metaH,
  };
}

/** 한 덩이를 이 면에 그린 결과. 다 못 그렸으면 다음 면에서 이어 그린다. */
interface FlowDraw {
  /** 이 면에서 쓴 높이. */
  height: number;
  /** 이 면에 그린 줄 수. */
  drawn: number;
  /** 이 덩이를 끝까지 그렸나. */
  done: boolean;
}

/**
 * 잰 덩이를 그리고 쓴 높이를 돌려준다.
 *
 * **덩이는 면 경계에서 쪼개진다.** `skip` 만큼 앞줄을 건너뛰고 그리므로, 왼 면이 바닥에
 * 닿으면 거기까지 채우고 나머지는 오른 면 첫머리에서 이어진다. 예전에는 통째로 안
 * 들어가면 다음 면으로 미뤄 아래가 비었고, 한 면보다 긴 글은 바닥에서 잘린 채 넘친 줄이
 * 사라졌다.
 *
 * `ratio` 가 있으면 앞에서부터 그만큼만 드러낸다. 글자를 한 자씩 붙이지 않고 줄마다
 * 드러난 폭만큼 오려 내는(clip) 이유는, 자소가 반쯤 그어진 순간이 곧 펜이 지나는
 * 중인 모습이기 때문이다. 한 자씩 튀어나오면 타자기지 손글씨가 아니다.
 *
 * `ratio` 는 **덩이 전체**를 기준으로 한다(이 면의 몫이 아니라). 그래야 두 면에 걸친
 * 글도 왼 면에서 오른 면으로 펜이 이어져 지나간다.
 *
 * 펜촉이 놓일 자리는 `penAt` 으로 알린다 — 이 덩이가 이 면에서 아직 다 그어지지
 * 않았을 때만 채워진다.
 */
function drawFlow(
  g: CanvasRenderingContext2D,
  f: Flow,
  x: number,
  y: number,
  bottom: number,
  opts: {
    /** 앞의 몇 줄은 이미 앞 면에 그렸다. */
    skip?: number;
    ratio?: number;
    penAt?: { x: number; y: number; fs: number } | null;
    /** 링크 덩이면 눌린 자리를 여기에 담는다. */
    linksAt?: LinkRect[];
  } = {},
): FlowDraw {
  const { skip = 0, ratio, penAt, linksAt } = opts;
  // 이어 그리는 면에서는 덩이 앞 여백을 다시 벌리지 않는다 — 면 첫머리에 빈칸이 생긴다.
  let yy = y + (skip === 0 ? f.gap : 0);
  g.font = f.font;
  // 앞선 소개 카드·기술 항목이 흐린 색을 남겨 두므로 본문 색을 되돌린다.
  g.fillStyle = INK;

  // 줄 폭은 **모든 줄**을 잰다. 이 면에 그릴 것만 재면 두 면에 걸친 글의 ratio 가
  // 면마다 다른 기준을 갖게 되어 펜이 경계에서 튄다.
  const widths = f.lines.map((ln) => g.measureText(ln).width);
  // 머리(이름·날짜)도 펜이 지나야 하는 거리다. 본문만 그어지면 이름이 먼저 떠 있다.
  let metaW = 0;
  if (f.meta) {
    g.font = sans(500, f.metaFs);
    metaW = g.measureText(f.meta).width;
    g.font = f.font;
  }
  const total = metaW + widths.reduce((s, w) => s + w, 0);
  // 앞 면에서 이미 지나온 거리. 머리는 첫 면에만 있다.
  const before = skip === 0 ? 0 : metaW + widths.slice(0, skip).reduce((s, w) => s + w, 0);
  let left = ratio === undefined ? Infinity : total * ratio - before;
  /**
   * 펜의 끝(잉크가 멈춘 자리)이 이 면에 있을 수 있는가.
   *
   * 이어 그리는 면에서 `left` 는 음수로 시작한다 — 펜은 아직 앞 면에 있다는 뜻이다.
   * 이걸 가려내지 않으면 아래 stroke 의 "줄 첫머리" 갈래가 걸려, 왼 면에서 쓰는 동안
   * 오른 면에도 펜이 하나 서 있게 된다. 게다가 그 면이 펜의 자리로 보고되어
   * (`penDrawn`) 컨트롤러가 아직 오지도 않은 장으로 책을 넘겨 버린다.
   */
  const frontierHere = left >= 0;

  /** 한 줄을 드러난 폭만큼만 그린다. 다 그렸으면 true. */
  const stroke = (text: string, tx: number, ty: number, w: number) => {
    if (left >= w) {
      g.fillText(text, tx, ty);
      left -= w;
      return true;
    }
    if (left > 0) {
      g.save();
      g.beginPath();
      g.rect(tx, ty - f.fs * 1.25, left, f.fs * 1.8);
      g.clip();
      g.fillText(text, tx, ty);
      g.restore();
      if (penAt) {
        penAt.x = tx + left;
        penAt.y = ty;
        penAt.fs = f.fs;
      }
    } else if (frontierHere && penAt && penAt.fs === 0) {
      // 잉크가 앞 줄에서 딱 떨어졌다 — 펜은 이 줄 첫머리에서 기다린다.
      // `frontierHere` 가 아니면 펜은 앞 면에 있다. 여기 세우면 안 된다.
      penAt.x = tx;
      penAt.y = ty;
      penAt.fs = f.fs;
    }
    left = 0;
    return false;
  };

  // 방명록 글의 머리 — 이름 · 날짜. 본문보다 작고 흐리게 둬서 글 자체가 먼저 읽히게 한다.
  // 이어 그리는 면에서는 다시 찍지 않는다 — 한 글에 이름이 두 번 붙는다.
  if (f.meta && skip === 0) {
    g.font = sans(500, f.metaFs);
    g.fillStyle = CAPTION;
    stroke(f.meta, x, yy + f.metaFs, metaW);
    yy += f.metaH;
    g.font = f.font;
    g.fillStyle = INK;
  }

  // 글머리 기호·표식도 덩이의 시작 표시라 첫 면에만.
  if (skip === 0) {
    if (f.isLi) {
      g.beginPath();
      g.arc(x + f.fs * 0.22, yy + f.fs * 0.62, Math.max(1.5, f.fs * 0.09), 0, PI * 2);
      g.fill();
    } else if (f.isSub) {
      // 소제목 표식 — HTML 의 h3::before 와 같은 네모. 글자 높이의 42%.
      const s = f.fs * 0.42;
      g.fillStyle = ACCENT;
      g.fillRect(x, yy + f.fs - s, s, s);
      g.fillStyle = INK;
    }
  }

  // 링크는 색을 달리하고 밑줄을 긋는다. 종이 위에서는 손 모양 커서가 없으므로
  // 눌러도 된다는 것을 생김새로만 알려야 한다.
  if (f.href) g.fillStyle = ACCENT;

  let i = skip;
  for (; i < f.lines.length; i++) {
    if (yy + f.fs > bottom) break;
    const lx = x + f.indent;
    const ly = yy + f.fs;
    const lw = widths[i] ?? 0;
    // 이 줄에 들어오기 전에 남아 있던 잉크. stroke 가 left 를 깎으므로 먼저 잡아 둔다.
    const avail = left;
    stroke(f.lines[i], lx, ly, lw);
    if (f.href) {
      // 밑줄 — 글자가 그어진 만큼만. 잉킹 중이면 잉크를 따라 같이 자란다.
      const shown = Math.max(0, Math.min(lw, avail));
      if (shown > 0) g.fillRect(lx, ly + f.fs * 0.16, shown, Math.max(1, f.fs * 0.06));
      // 누를 자리는 글줄보다 조금 넉넉하게 — 손가락은 정확하지 않다.
      if (linksAt && lw > 0) {
        linksAt.push({
          x: lx,
          y: ly - f.fs,
          w: lw,
          h: f.fs * 1.45,
          href: f.href,
          text: f.text,
        });
      }
    }
    yy += f.lineH;
  }

  const done = i >= f.lines.length;
  // 끝맺은 덩이만 뒤 여백을 붙인다. 이어지는 중이면 바닥까지 쓴 것이라 붙일 자리가 없다.
  return { height: yy + (done ? f.after : 0) - y, drawn: i - skip, done };
}

/**
 * 펜. 촉 끝이 (x, y) 에 오도록 오른쪽 위로 비스듬히 세워 그린다.
 *
 * 종이 텍스처에 그리므로 책이 기울면 펜도 같이 기운다 — 종이 위에 놓인 물건이라
 * 그게 맞다. 화면에 겹쳐 그렸다면 책과 따로 놀았을 것이다.
 */
function drawPen(g: CanvasRenderingContext2D, x: number, y: number, fs: number) {
  const len = fs * 2.6;
  const ang = -PI / 3; // 손이 오른쪽에 있는 각도. 글자를 가리지 않게 충분히 세운다.
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const nib = len * 0.22;

  g.save();
  // 종이에 지는 그림자 — 이게 없으면 펜이 아니라 글자에 붙은 도형으로 보인다.
  g.shadowColor = 'rgba(40,28,8,0.3)';
  g.shadowBlur = fs * 0.3;
  g.shadowOffsetX = fs * 0.16;
  g.shadowOffsetY = fs * 0.16;
  g.strokeStyle = '#2b2118';
  g.lineWidth = Math.max(2.5, fs * 0.2);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x + dx * nib, y + dy * nib);
  g.lineTo(x + dx * len, y + dy * len);
  g.stroke();

  // 촉 — 끝으로 갈수록 뾰족해지는 삼각형.
  g.shadowColor = 'transparent';
  const halfW = Math.max(1.6, fs * 0.11);
  g.fillStyle = '#100c07';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + dx * nib - dy * halfW, y + dy * nib + dx * halfW);
  g.lineTo(x + dx * nib + dy * halfW, y + dy * nib - dx * halfW);
  g.closePath();
  g.fill();
  g.restore();
}

/** 한 페이지를 그린다. startIdx 부터 담기는 만큼 담고 다음 인덱스를 돌려준다. */
function drawContentPage(
  THREE: THREE,
  v: BookVisual,
  w: number,
  h: number,
  gutter: 'left' | 'right',
  startIdx: number,
  /** 그 덩이의 이 줄부터 그린다. 앞 면에서 이어지는 경우 0 이 아니다. */
  startLine = 0,
  /** 이 면 아래에 '남기기' 버튼이 얹힌다 — 그만큼 본문 바닥을 올려 자리를 비운다. */
  corner = false,
  reveal?: Reveal,
) {
  const blocks = v.blocks ?? [];
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  const cw = c.width;
  g.fillStyle = v.pages;
  g.fillRect(0, 0, cw, c.height);

  const padX = Math.round(cw * 0.115);
  const colW = cw - padX * 2;
  // 버튼이 얹히는 면은 본문 바닥을 올려 그 자리를 비운다. 버튼은 HTML 이라 종이에
  // 그려지지 않으므로, 여기서 비켜 주지 않으면 글자 위에 그대로 올라탄다.
  // 0.895 는 컨트롤러가 버튼을 놓는 0.905 보다 조금 위다(placeWriteButton).
  const bottom = c.height * (corner ? 0.895 : 0.93);
  const top = c.height * 0.09;
  g.fillStyle = INK;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let y = top;

  // 첫 면에 책 제목을 얹지 않는다. 책등과 표지가 이미 제목을 보여 준 뒤라 세 번째
  // 반복이고, 밑줄까지 있어 본문이 시작되기 전에 한 덩이를 더 읽게 만들었다.
  // 제목은 낭독기용으로 HTML 머리글(book__header)에만 남는다.

  /** 덩이가 차지할 높이. 다음 덩이까지 들어가는지 미리 볼 때 쓴다. */
  const heightOf = (b: Block, atY: number) =>
    b.kind === 'tech'
      ? drawTech(g, b, padX, colW, atY, cw, true)
      : b.kind === 'product'
        ? drawProduct(g, b, padX, colW, atY, cw, true)
        : b.kind === 'header'
          ? 0 // 소개 카드는 늘 첫 블록이라 무엇의 뒤에 올 일이 없다
          : measureFlow(g, b, cw, colW).blockH;

  // 펜이 놓일 자리. fs 가 0 이면 이 면에서는 펜을 그리지 않는다.
  const pen = { x: 0, y: 0, fs: 0 };
  /** 이 면에서 눌리는 자리. 텍스처 픽셀 좌표다. */
  const links: LinkRect[] = [];

  let i = startIdx;
  let line = startLine;
  /** 다음 면이 이어받을 줄 번호. 0 이면 덩이가 이 면에서 끝났다. */
  let nextLine = 0;
  let drew = false; // 이 페이지에 이미 뭔가 그렸나 — 안 들어가는 블록을 다음 장으로 미룰 기준
  for (; i < blocks.length; i++) {
    const bl = blocks[i];
    if (bl.kind === 'header') {
      y += drawHeader(g, bl, padX, colW, y, cw);
    } else if (bl.kind === 'tech' || bl.kind === 'product') {
      // **제품 머리는 늘 새 면에서 시작한다.** 앞 제품의 꼬리 밑에 다음 제품의 이름이
      // 붙으면 어디까지가 누구 이야기인지 흐려진다 — 책에서 장이 바뀌는 자리다.
      // 자리가 남아도 넘긴다. 남는 아래쪽은 앞 이야기가 끝났다는 표시가 된다.
      if (bl.kind === 'product' && drew) break;
      // 한 항목이 통째로 들어갈 자리가 없으면(그리고 페이지에 이미 뭔가 있으면) 다음 장으로.
      const h0 = heightOf(bl, y);
      if (drew && y + h0 > bottom) break;
      y +=
        bl.kind === 'tech'
          ? drawTech(g, bl, padX, colW, y, cw)
          : drawProduct(g, bl, padX, colW, y, cw);
    } else {
      const flow = measureFlow(g, bl, cw, colW);
      // **덩이는 쪼갠다.** 남은 자리를 채우고 못 그린 줄은 다음 면에서 이어 그린다.
      // 다만 한 줄도 못 넣을 자리에 시작하지는 않는다 — 머리만 덜렁 남고 본문이
      // 통째로 넘어가면 오히려 어색하다. 그때는 이 면을 끝낸다.
      const roomFor1 = y + (line === 0 ? flow.gap + flow.metaH : 0) + flow.fs <= bottom;
      if (drew && !roomFor1) break;
      // 소제목은 여전히 통째로 옮긴다 — 제목 한 줄이 면 끝에 홀로 남으면 못 읽는다.
      if (bl.kind === 'h' && drew) {
        const next = blocks[i + 1];
        if (y + flow.blockH > bottom) break;
        if (next && y + flow.blockH + heightOf(next, y + flow.blockH) > bottom) break;
      }
      // 드러내는 중인 덩이면 앞에서부터 ratio 만큼만, 아니면 통째로.
      const on = reveal && reveal.block === i;
      const skip = line;
      line = 0; // 이어받은 줄 번호는 첫 덩이에만 쓴다
      const r = drawFlow(g, flow, padX, y, bottom, {
        skip,
        ratio: on ? reveal.ratio : undefined,
        penAt: on ? pen : null,
        linksAt: links,
      });
      y += r.height;
      if (!r.done) {
        // 바닥에 닿았다. 이 덩이의 나머지는 다음 면 첫머리에서 이어진다.
        nextLine = skip + r.drawn;
        drew = true;
        break;
      }
    }
    drew = true;
  }

  const penDrawn = pen.fs > 0;
  if (penDrawn) drawPen(g, pen.x, pen.y, pen.fs);

  // 책등 쪽(안쪽) 그늘 — 종이가 골로 말려 드는 느낌.
  //
  // 텍스처 x 는 화면 x 와 그대로 대응한다(왼 면도 뒤집히지 않는다 — 표지를 180° 젖히며
  // 생기는 뒤집힘과 -z 면의 UV 뒤집힘이 서로 상쇄된다). 따라서 책등은 gutter 가 가리키는
  // 그 쪽 끝이다. 예전엔 반대편에 그려 바깥이 어둡고 가운데가 밝은, 책과 정반대인 그늘이
  // 생겼다.
  const atStart = gutter === 'left'; // 책등이 텍스처의 왼쪽 끝인가
  const edge = atStart ? 0 : cw;
  // 골 그늘은 좁다 — 페이지 폭의 5분의 1 안에서 사라져야 종이가 넓어 보인다.
  const grad = g.createLinearGradient(edge, 0, atStart ? cw * 0.2 : cw * 0.8, 0);
  grad.addColorStop(0, 'rgba(60,42,16,0.34)');
  grad.addColorStop(0.35, 'rgba(60,42,16,0.12)');
  grad.addColorStop(1, 'rgba(60,42,16,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, cw, c.height);
  // 골 접힘선 — 예전의 4px 검은 막대는 종이에 그은 줄처럼 보였다. 얇고 옅게.
  const crease = Math.max(1.5, cw * 0.004);
  g.fillStyle = 'rgba(60,42,16,0.26)';
  g.fillRect(atStart ? 0 : cw - crease, 0, crease, c.height);

  return { tex: tex(THREE, c), next: i, nextLine, penDrawn, links };
}

/**
 * 한 면이 담은 범위.
 *
 * 덩이가 면 경계에서 쪼개지므로 "몇 번째 덩이" 만으로는 부족하다 — 그 덩이의 몇 번째
 * 줄부터인지까지 있어야 같은 면을 다시 그릴 수 있다.
 */
interface PageRange {
  /** 이 면이 시작하는 덩이. */
  start: number;
  /** 그 덩이의 이 줄부터. 앞 면에서 이어받았으면 0 이 아니다. */
  startLine: number;
  /** 이 면에 잉크가 닿은 마지막 덩이의 **다음** 번호. 걸쳐 있는 덩이도 포함한다. */
  end: number;
}

type StdMat = THREE_NS.MeshStandardMaterial;

export class Book3D {
  private THREE: THREE;
  private renderer: THREE_NS.WebGLRenderer;
  private scene: THREE_NS.Scene;
  private camera: THREE_NS.PerspectiveCamera;
  private group?: THREE_NS.Group;
  private coverHinge?: THREE_NS.Group;
  private turnHinge?: THREE_NS.Group;
  private bodyFrontMat?: StdMat;
  private coverBackMat?: StdMat;
  private turnFrontMat?: StdMat;
  private turnBackMat?: StdMat;
  /** 책 뒤 그림자. 펼침 정도에 따라 짙어진다. */
  private shadowMat?: THREE_NS.MeshBasicMaterial;
  private pages: THREE_NS.Texture[] = [];
  private dims = { W: 0, H: 0, t: 0 };
  // 좁은 화면(모바일)에서는 한 면만 폭에 꽉 채워 보여주고 한 장씩 넘긴다.
  // 넓은 화면은 두 면 펼침(false). playOpen 에서 정해진다.
  private single = false;
  // 책이 쉬는 자리를 위·아래 여백만큼 비켜 잡는다(아래 도구 막대 자리 확보). 0 이면 화면 정중앙.
  private reserveTop = 0;
  private reserveBottom = 0;
  private index = 0;
  /**
   * 면마다 어디서 시작해 어디까지 그렸는지. 어떤 덩이가 어느 면에 있는지 되짚을 때
   * 쓴다 — 방금 남긴 글이 있는 장으로 넘기고 거기에 잉크를 그리려면 이게 필요하다.
   */
  private ranges: PageRange[] = [];
  /** 마지막으로 그린 시각 정보. 잉크를 다시 그릴 때 같은 값으로 그려야 한다. */
  private visual: BookVisual | null = null;
  /** 페이지 텍스처의 픽셀 크기. dims(월드 크기)와 다르다. */
  private texDims = { pw: 0, ph: 0 };
  /** 면마다 눌리는 자리. 텍스처 픽셀 좌표다. */
  private links: LinkRect[][] = [];
  private busy = false;
  private raf = 0;
  private w = 0;
  private h = 0;
  readonly canvas: HTMLCanvasElement;
  onProgress?: (index: number, total: number) => void;

  constructor(THREE: THREE) {
    this.THREE = THREE;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.canvas = this.renderer.domElement;
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60;opacity:0;transition:opacity 200ms ease;';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 100000);
    this.resize();

    // 조명은 종이색이 CSS 토큰(--spine-pages) 그대로 보이는 지점에 맞춰 놨다. 예전엔
    // 키 라이트가 세고 누래서 종이가 #ece0c4 대신 #deceb0 로 내려앉아 칙칙했다.
    const key = new THREE.DirectionalLight(0xfffaf2, 1.9);
    key.position.set(-0.35, 0.7, 1).multiplyScalar(1000);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xeaf0ff, 0.57);
    fill.position.set(0.8, 0.2, 0.6).multiplyScalar(1000);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.38));
  }

  private resize() {
    const T = this.THREE;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    const dist = this.h / 2 / Math.tan(((this.camera.fov / 2) * PI) / 180);
    this.camera.position.set(this.w / 2, this.h / 2, dist);
    this.camera.lookAt(new T.Vector3(this.w / 2, this.h / 2, 0));
    this.camera.updateProjectionMatrix();
  }
  private toWorld(px: number, py: number) {
    return new this.THREE.Vector3(px, this.h - py, 0);
  }
  /** 위·아래 여백을 비켜 잡을 화면 여백(px). 컨트롤러가 도구막대 자리에 맞춰 준다. */
  setReserve(top: number, bottom: number) {
    this.reserveTop = top;
    this.reserveBottom = bottom;
  }
  /** 책이 쉬는(펼쳐 읽는) 화면상의 중심. 여백이 있으면 그 사이 가운데로 올려 잡는다. */
  private restCenter() {
    const cy =
      this.reserveTop || this.reserveBottom
        ? (this.reserveTop + (this.h - this.reserveBottom)) / 2
        : this.h / 2;
    return this.toWorld(this.w / 2, cy);
  }

  get total() {
    // 한 면 모드는 페이지 하나가 한 화면, 두 면 모드는 두 페이지가 한 스프레드.
    return Math.max(1, this.single ? this.pages.length : Math.ceil(this.pages.length / 2));
  }
  get current() {
    return this.index;
  }

  /**
   * 페이지를 다시 그린다. 내용이 바뀌었을 때(방명록에 글이 하나 늘었을 때) 쓴다.
   *
   * 보던 장은 그대로 둔다 — 글을 남긴 사람은 쓰던 자리에 남아 있어야 한다. 장 수가
   * 줄면 마지막 장으로 당긴다. 넘기는 중에는 하지 않는다(잎 재질이 바뀌면 튄다).
   */
  rebuildPages(v: BookVisual): boolean {
    if (!this.group || this.busy) return false;
    this.buildPages(v, this.texDims.pw, this.texDims.ph);
    this.index = Math.min(this.index, this.total - 1);
    // 두 면 모드: 왼 면은 표지 안쪽(coverBack), 오른 면은 몸통 앞면(bodyFront).
    // 한 면 모드: 몸통 앞면 하나뿐이다.
    this.showSpread(this.index);
    this.render();
    this.onProgress?.(this.index, this.total);
    return true;
  }

  /**
   * 펼쳐진 책 전체가 차지하는 화면 사각형(CSS px). 아직 안 떴으면 null.
   *
   * 캔버스는 화면을 다 덮되 pointer-events:none 이라 클릭이 그대로 통과한다. 그래서
   * '책을 눌렀는지'를 요소로는 알 수 없고, 이 사각형과 좌표를 견줘 판단한다.
   * 넘기는 중(busy)에도 자리는 그대로이므로 여기서는 busy 를 보지 않는다.
   */
  bookRect(): { left: number; top: number; width: number; height: number } | null {
    if (!this.group) return null;
    const { W, H } = this.dims;
    const c = this.restCenter();
    const spreadW = this.single ? W : W * 2;
    return { left: c.x - spreadW / 2, top: this.h - c.y - H / 2, width: spreadW, height: H };
  }

  /**
   * 지금 보이는 면 하나의 화면 사각형(CSS px). 넘기는 중이면 null.
   *
   * z=0 평면이 화면 픽셀과 1:1 로 대응하도록 카메라를 잡아 두었으므로(resize),
   * 원근 투영을 되짚을 필요 없이 책 중심과 면 크기만으로 자리가 나온다.
   * 넘기는 중(busy)에는 면이 접혀 있어 자리가 뜻을 잃는다 — null 을 준다.
   *
   * 한 면 모드에서는 어느 쪽을 물어도 그 한 면을 준다. '남기기' 버튼을 종이 오른쪽
   * 아래 구석에 놓는 데 쓴다.
   */
  pageRect(
    side: 'left' | 'right',
  ): { left: number; top: number; width: number; height: number } | null {
    if (!this.group || this.busy) return null;
    const { W, H } = this.dims;
    const c = this.restCenter();
    const cy = this.h - c.y; // 월드 y 를 화면 y 로 되돌린다
    const left = this.single ? c.x - W / 2 : side === 'left' ? c.x - W : c.x;
    return { left, top: cy - H / 2, width: W, height: H };
  }

  /** 그 덩이가 **시작하는** 면의 번호. 없으면 -1. */
  pageOfBlock(block: number): number {
    return this.ranges.findIndex((r) => block >= r.start && block < r.end);
  }

  /**
   * 그 덩이의 잉크가 닿는 **마지막** 면. 없으면 -1.
   *
   * 덩이는 면 경계에서 쪼개지므로 시작 면과 끝 면이 다를 수 있다. 다 쓴 글을 보여 줄
   * 때는 끝 면이어야 한다 — 펜은 이미 사라져 어디 있었는지 물어볼 수 없다.
   */
  lastPageOfBlock(block: number): number {
    for (let p = this.ranges.length - 1; p >= 0; p--) {
      const r = this.ranges[p];
      if (block >= r.start && block < r.end) return p;
    }
    return -1;
  }

  /** 그 면을 품은 펼침(장) 번호. */
  spreadOfPage(page: number): number {
    return this.single ? page : Math.floor(page / 2);
  }

  get spread(): number {
    return this.index;
  }

  /**
   * 한 덩이를 앞에서부터 `ratio` 만큼만 드러낸 상태로 다시 그린다.
   *
   * 그 덩이가 걸친 면만 다시 만든다. 매 프레임 부르는 자리라 60장을 통째로 다시
   * 그리면 저사양 기기에서 버벅인다.
   */
  reveal(block: number, ratio: number): { ok: boolean; penPage: number } {
    const v = this.visual;
    if (!v || !this.group) return { ok: false, penPage: -1 };
    if (this.pageOfBlock(block) < 0) return { ok: false, penPage: -1 };

    // 한 덩이가 두 면에 걸칠 수 있으므로 그 덩이에 잉크가 닿는 면을 모두 다시 그린다.
    const { pw, ph } = this.texDims;
    let penPage = -1;
    for (let p = 0; p < this.ranges.length; p++) {
      const r = this.ranges[p];
      if (block < r.start || block >= r.end) continue;
      const gutter = this.single ? 'left' : p % 2 === 0 ? 'right' : 'left';
      this.pages[p]?.dispose();
      const drawn = drawContentPage(
        this.THREE,
        v,
        pw,
        ph,
        gutter,
        r.start,
        r.startLine,
        this.hasCorner(p),
        { block, ratio },
      );
      this.pages[p] = this.crisp(drawn.tex);
      this.links[p] = drawn.links;
      if (drawn.penDrawn) penPage = p;
    }
    this.showSpread(this.index);
    this.render();
    return { ok: true, penPage };
  }

  /**
   * 지금 보이는 두 면(또는 한 면)의 링크 자리를 **화면 좌표**로 준다.
   *
   * 좌표를 돌려줄 뿐 직접 열지 않는 이유: 컨트롤러가 이 자리에 진짜 `<a>` 를 얹는다.
   * 클릭 좌표를 견줘 `window.open` 을 부르는 편이 짧지만, 그러면 키보드로 닿을 수
   * 없고(본문 HTML 은 3D 에서 opacity 0 인 조상 안에 있어 초점이 가도 보이지 않는다)
   * 가운데 클릭·새 탭·주소 복사도 손으로 다시 만들어야 한다. 브라우저가 이미 아는
   * 일을 흉내 내지 않는다.
   *
   * z=0 평면이 화면 픽셀과 1:1 이라(resize) 면의 화면 사각형만 알면 텍스처 좌표를
   * 되돌릴 수 있다. 넘기는 중에는 `pageRect` 가 null 을 주므로 빈 배열이 된다.
   */
  visibleLinks(): VisibleLink[] {
    if (!this.group || this.busy) return [];
    const { pw, ph } = this.texDims;
    if (!pw || !ph) return [];
    const out: VisibleLink[] = [];
    // 한 면 모드는 보이는 면이 하나, 두 면 모드는 왼·오 두 면이다.
    const sides: ('left' | 'right')[] = this.single ? ['left'] : ['left', 'right'];
    for (const side of sides) {
      const rect = this.pageRect(side);
      if (!rect) continue;
      const page = this.single ? this.index : 2 * this.index + (side === 'right' ? 1 : 0);
      // 여러 줄에 걸친 링크는 **하나로 합친다.** 줄마다 손잡이를 두면 낭독기가 같은
      // 이름을 여러 번 읽고, Tab 도 그만큼 더 눌러야 한다.
      const merged = new Map<string, LinkRect>();
      for (const r of this.links[page] ?? []) {
        const at = merged.get(r.href);
        if (!at) {
          merged.set(r.href, { ...r });
          continue;
        }
        const right = Math.max(at.x + at.w, r.x + r.w);
        const bot = Math.max(at.y + at.h, r.y + r.h);
        at.x = Math.min(at.x, r.x);
        at.y = Math.min(at.y, r.y);
        at.w = right - at.x;
        at.h = bot - at.y;
      }
      for (const r of merged.values()) {
        out.push({
          left: rect.left + (r.x / pw) * rect.width,
          top: rect.top + (r.y / ph) * rect.height,
          width: (r.w / pw) * rect.width,
          height: (r.h / ph) * rect.height,
          href: r.href,
          text: r.text,
        });
      }
    }
    return out;
  }

  /**
   * 그 면에 '남기기' 버튼이 얹히는가.
   *
   * 두 면 모드에서는 오른 면(홀수)에만, 한 면 모드에서는 모든 면에 얹힌다.
   * 버튼은 HTML 이라 종이에 그려지지 않으므로, 그 면은 본문 바닥을 올려 자리를 비운다.
   */
  private hasCorner(page: number): boolean {
    return this.single || page % 2 === 1;
  }

  private buildPages(v: BookVisual, pw: number, ph: number) {
    for (const p of this.pages) p.dispose();
    const blocks = v.blocks ?? [];
    const pages: THREE_NS.Texture[] = [];
    const ranges: PageRange[] = [];
    const links: LinkRect[][] = [];
    // 잉크를 다시 그릴 때 같은 값·같은 크기로 그려야 한다.
    this.visual = v;
    this.texDims = { pw, ph };
    let start = 0;
    let startLine = 0;
    let idx = 0;
    while (start < blocks.length && idx < 60) {
      // 두 면: 왼/오 번갈아 안쪽(책등) 그늘. 한 면: 항상 왼쪽 제본(일관된 한 쪽 그늘).
      const gutter = this.single ? 'left' : idx % 2 === 0 ? 'right' : 'left';
      const r = drawContentPage(
        this.THREE,
        v,
        pw,
        ph,
        gutter,
        start,
        startLine,
        this.hasCorner(idx),
      );
      pages.push(this.crisp(r.tex));
      links.push(r.links);
      // 덩이가 이 면에서 안 끝났으면(nextLine > 0) 그 덩이는 이 면에도 잉크가 있다 —
      // end 는 그것까지 포함해야 reveal 이 이 면을 다시 그린다.
      ranges.push({ start, startLine, end: r.nextLine > 0 ? r.next + 1 : r.next });
      // 한 줄도 못 나아갔으면 강제로 다음 덩이로 넘긴다. 자리가 너무 좁아 아무것도
      // 못 그리는 상태에서 같은 자리를 다시 시도하면 60장까지 빈 면만 쌓인다.
      if (r.next === start && r.nextLine <= startLine) {
        start += 1;
        startLine = 0;
      } else {
        start = r.next;
        startLine = r.nextLine;
      }
      idx++;
    }
    if (pages.length === 0) {
      pages.push(
        this.crisp(drawContentPage(this.THREE, v, pw, ph, this.single ? 'left' : 'right', 0).tex),
      );
      ranges.push({ start: 0, startLine: 0, end: 0 });
      links.push([]);
    }
    // 두 면 모드만 짝수로 맞춘다(스프레드 짝맞춤). 한 면은 페이지마다 한 화면이라 불필요.
    if (!this.single && pages.length % 2 === 1) {
      pages.push(this.crisp(drawContentPage(this.THREE, v, pw, ph, 'left', blocks.length).tex));
      ranges.push({ start: blocks.length, startLine: 0, end: blocks.length });
      links.push([]);
    }
    this.pages = pages;
    this.ranges = ranges;
    this.links = links;
  }

  /**
   * 밉맵을 끄고 LinearFilter 로 둔다. 고해상도 텍스처가 화면 크기로 줄 때 밉맵이
   * 끼면 저해상 단계를 섞어 글씨가 뭉개진다(오버샘플링일수록 더). 밉맵 없이 선형으로
   * 축소하면 슈퍼샘플링(SSAA)처럼 또렷하게 다운스케일된다 — 텍스트엔 이게 정석이다.
   */
  private crisp(t: THREE_NS.Texture) {
    const T = this.THREE;
    t.minFilter = T.LinearFilter;
    t.magFilter = T.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  /** 그 장의 두 면(또는 한 면)을 재질에 물린다. */
  private showSpread(spread: number) {
    const at = this.single ? spread : 2 * spread + 1;
    if (this.bodyFrontMat) {
      this.bodyFrontMat.map = this.pages[at] ?? this.pages[0];
      this.bodyFrontMat.needsUpdate = true;
    }
    if (!this.single && this.coverBackMat) {
      this.coverBackMat.map = this.pages[2 * spread] ?? this.pages[0];
      this.coverBackMat.needsUpdate = true;
    }
  }

  /**
   * 표지를 0(덮임)에서 1(열림)까지 연다. 축은 모드마다 다르다 — 두 면은 책등(y),
   * 한 면은 위 모서리(x). 한 면에선 다 젖혀진 표지가 책 위에 그대로 서 있으므로
   * 마지막에 감춘다. 두 면에선 눕힌 표지가 곧 왼 면이라 감추면 안 된다.
   */
  private setCoverOpen(open: number) {
    const hinge = this.coverHinge;
    if (!hinge) return;
    const a = -PI * 0.985 * open;
    if (this.single) {
      hinge.rotation.x = a;
      hinge.visible = open < 0.999;
    } else {
      hinge.rotation.y = a;
    }
  }

  /** 책 메시(몸통 + 표지 + 넘김용 잎)를 만든다. 페이지 텍스처는 미리 만들어 둔다. */
  private buildBook(v: BookVisual, W: number, H: number, thickness: number) {
    const T = this.THREE;
    this.disposeBook();
    this.dims = { W, H, t: thickness };
    // 한 면은 화면에서 약 W(CSS px) 폭으로 보이고, 고해상도 화면에선 그 DPR 배의
    // 디바이스 픽셀을 차지한다. 텍스처를 그만큼(약간 여유 있게) 촘촘히 그려야 확대돼
    // 흐려지지 않는다. 640 고정이 흐림의 원인이었다.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.min(1536, Math.max(768, Math.round(W * dpr * 1.35)));
    this.buildPages(v, pw, Math.round((pw * H) / W));

    const group = new T.Group();
    const ratio = (a: number, b: number) => Math.max(8, Math.round((a * 96) / b));
    const spineTex = spineTexture(T, v, 96, ratio(H, thickness));
    const headTail = edgeTexture(T, v, 512, 96, false);
    const foreEdge = edgeTexture(T, v, 96, ratio(H, thickness), true);
    const coverTex = coverTexture(T, v, 512, Math.round((512 * H) / W));
    const backTex = coverTexture(T, v, 512, Math.round((512 * H) / W), true);
    const mat = (map: THREE_NS.Texture | null, rough = 0.62) =>
      new T.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });

    // 몸통 앞면(+z): 두 면 모드는 첫 스프레드의 오른 면(pages[1]), 한 면 모드는 첫
    // 페이지(pages[0]). 어느 쪽이든 표지가 열리며 이 면이 드러난다.
    const bodyFront = mat(this.single ? this.pages[0] : (this.pages[1] ?? this.pages[0]), 0.66);
    this.bodyFrontMat = bodyFront;
    const body = new T.Mesh(new T.BoxGeometry(W, H, thickness), [
      mat(foreEdge),
      mat(spineTex),
      mat(headTail),
      mat(headTail),
      bodyFront,
      mat(backTex, 0.5),
    ]);
    body.position.set(W / 2, 0, 0);
    group.add(body);

    // 뒤로 지는 그림자. 펼치면 좌우로 W 씩(두 면) 벌어지므로 그만큼 넓게 잡는다.
    // 빛이 왼쪽 위에서 오니 그림자는 오른쪽 아래로 조금 밀린다. 조명을 받지 않는
    // MeshBasicMaterial 이라 어두운 판 그대로 남는다.
    const spread = this.single ? W : 2 * W;
    const shadowMat = new T.MeshBasicMaterial({
      map: shadowTexture(T, 512, Math.max(8, Math.round((512 * H * 1.3) / (spread * 1.24)))),
      transparent: true,
      depthWrite: false,
      // 펼쳐지는 만큼 함께 짙어진다. 그룹에 매달려 있어 등장 중 90° 로 서면 화면을
      // 가로지르는 얼룩이 되므로, 책이 평평해질 때까지는 보이지 않아야 한다.
      opacity: 0,
    });
    this.shadowMat = shadowMat;
    const shadow = new T.Mesh(new T.PlaneGeometry(spread * 1.24, H * 1.3), shadowMat);
    shadow.position.set((this.single ? W / 2 : 0) + W * 0.02, -H * 0.03, -thickness / 2 - 2);
    group.add(shadow);

    const ct = Math.max(6, thickness * 0.16);
    // 앞표지. 두 면 모드는 책등(왼쪽 세로축)을 축으로 왼쪽에 눕고, 그 안쪽(-z)이 곧
    // 왼 면이 된다. 한 면 모드는 눕힐 왼쪽이 없으니 **페이지와 같은 축** — 위 모서리를
    // 축으로 위로 젖혀 올린다. 젖혀진 표지의 안쪽은 페이지가 아니라 빈 속표지(backTex)다.
    //
    // 한동안 한 면 모드엔 표지가 아예 없었다. 뽑히자마자 본문이 앞면이라, 책을 여는
    // 게 아니라 종이 한 장이 날아오는 것처럼 보였다.
    const coverBack = this.single ? mat(backTex, 0.5) : mat(this.pages[0], 0.66);
    this.coverBackMat = this.single ? undefined : coverBack;
    const coverHinge = new T.Group();
    coverHinge.position.set(0, this.single ? H / 2 : 0, thickness / 2 + 0.6);
    const cover = new T.Mesh(new T.BoxGeometry(W, H, ct), [
      mat(foreEdge),
      mat(spineTex),
      mat(headTail),
      mat(headTail),
      mat(coverTex, 0.5),
      coverBack,
    ]);
    cover.position.set(W / 2, this.single ? -H / 2 : 0, 0);
    coverHinge.add(cover);
    group.add(coverHinge);
    this.coverHinge = coverHinge;

    // 넘기는 잎(평소 숨김)
    const turnFront = mat(null, 0.66);
    const turnBack = mat(null, 0.66);
    this.turnFrontMat = turnFront;
    this.turnBackMat = turnBack;
    const turnHinge = new T.Group();
    // 두 면: 책등(왼쪽 세로축)을 축으로 넘긴다. 한 면: 위 모서리(가로축)를 축으로 위로
    // 넘긴다 — 모바일에서 위/아래로 넘기는 손맛에 맞춘다.
    turnHinge.position.set(0, this.single ? H / 2 : 0, thickness / 2 + ct + 1.0);
    turnHinge.visible = false;
    const leaf = new T.Mesh(new T.BoxGeometry(W, H, Math.max(3, ct * 0.5)), [
      mat(foreEdge),
      mat(null),
      mat(headTail),
      mat(headTail),
      turnFront,
      turnBack,
    ]);
    // 한 면은 경첩이 위 모서리라 잎을 아래로 매단다(-H/2). 두 면은 가운데(0).
    leaf.position.set(W / 2, this.single ? -H / 2 : 0, 0);
    turnHinge.add(leaf);
    group.add(turnHinge);

    this.scene.add(group);
    this.group = group;
    this.turnHinge = turnHinge;
    this.index = 0;
  }

  private disposeBook() {
    if (!this.group) return;
    this.group.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of mats) (mm as StdMat).dispose();
    });
    this.scene.remove(this.group);
    this.group = undefined;
    this.shadowMat = undefined; // 버린 재질을 다음 책의 트윈이 만지지 않게
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  private tween(update: (p: number) => void, duration: number, done?: () => void) {
    const t0 = performance.now();
    const step = (now: number) => {
      const p = clamp01((now - t0) / duration);
      update(p);
      this.render();
      if (p < 1) this.raf = requestAnimationFrame(step);
      else done?.();
    };
    this.raf = requestAnimationFrame(step);
  }

  /** 등장+펼침: 책장에서 뽑혀 회전하고 표지가 열려 첫 스프레드를 편다. 끝나도 유지. */
  playOpen(opts: {
    spineRect: Rect;
    v: BookVisual;
    coverW: number;
    coverH: number;
    thickness: number;
    duration: number;
    single?: boolean;
    onDone: () => void;
  }) {
    this.single = !!opts.single;
    // 페이지 텍스처를 그리기 전에 본문 글꼴을 확실히 로드한다 — 안 그러면 canvas 가
    // 시스템 명조로 폴백해 HTML 과 글꼴이 달라 보인다.
    const build = () => this.startOpen(opts);
    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      Promise.all([
        fonts.load('600 40px "Noto Serif KR Subset"'),
        fonts.load('400 40px "Noto Serif KR Subset"'),
      ]).then(build, build);
    } else build();
  }

  private startOpen(opts: {
    spineRect: Rect;
    v: BookVisual;
    coverW: number;
    coverH: number;
    thickness: number;
    duration: number;
    single?: boolean;
    onDone: () => void;
  }) {
    this.buildBook(opts.v, opts.coverW, opts.coverH, opts.thickness);
    const group = this.group!;
    const start = this.toWorld(
      opts.spineRect.left + opts.spineRect.width / 2,
      opts.spineRect.top + opts.spineRect.height / 2,
    );
    const center = this.restCenter();
    const startScale = opts.spineRect.height / opts.coverH;
    const halfW = () => -this.dims.W / 2;
    this.tween(
      (p) => {
        if (this.single) {
          // 한 면: 뽑혀 나와 정면을 보고(rot), 그 다음 표지가 위로 젖혀진다(open).
          // 페이지(몸통 0..W)가 가운데 오도록 offX=-W/2 — 회전 중엔 원점이 곧 책등이라
          // ×rot 로 줄인다. 표지가 열려도 페이지 자리는 그대로라 open 은 안 곱한다.
          const move = easeInOut(clamp01(p / 0.5));
          const rot = easeInOut(clamp01((p - 0.2) / 0.4));
          const open = easeInOut(clamp01((p - 0.6) / 0.4));
          const s = lerp(startScale, 1, easeOut(clamp01(p / 0.75)));
          const offX = halfW() * s * rot;
          group.position.set(
            lerp(start.x, center.x, move) + offX,
            lerp(start.y, center.y, move),
            lerp(start.z, center.z, move),
          );
          group.scale.setScalar(s);
          group.rotation.y = lerp(PI / 2, 0, rot);
          this.setCoverOpen(open);
          // 그늘의 폭이 한 장 기준이라 표지가 아니라 회전에 맞춰 짙어진다.
          if (this.shadowMat) this.shadowMat.opacity = rot;
          return;
        }
        const move = easeInOut(clamp01(p / 0.42));
        const rot = easeInOut(clamp01((p - 0.24) / 0.36));
        const open = easeInOut(clamp01((p - 0.6) / 0.4));
        const s = lerp(startScale, 1, easeOut(clamp01(p / 0.7)));
        // 그룹 원점(=책등) 기준 가운데 맞춤. 단 90° 회전해 책등만 보일 때(rot 작음)는
        // 원점이 곧 책등이라 오프셋이 필요 없다 — rot 을 곱해, 책등이 실제 클릭 위치(start)
        // 에서 나오게 한다(안 그러면 W/2·s 만큼 왼쪽에서 나온다). 펼치면 원래대로 가운데.
        const offX = lerp(-this.dims.W / 2, 0, open) * s * rot;
        group.position.set(
          lerp(start.x, center.x, move) + offX,
          lerp(start.y, center.y, move),
          lerp(start.z, center.z, move),
        );
        group.scale.setScalar(s);
        group.rotation.y = lerp(PI / 2, 0, rot);
        this.setCoverOpen(open);
        // 그림자는 표지가 열리는 만큼 짙어진다 — 그늘의 폭이 두 면 기준이라, 아직
        // 접혀 있는 동안 짙게 깔리면 책보다 그림자가 넓어 보인다.
        if (this.shadowMat) this.shadowMat.opacity = open;
      },
      opts.duration,
      () => {
        this.onProgress?.(this.index, this.total);
        opts.onDone();
      },
    );
  }

  /** 페이지 넘김: dir=+1 다음 두 면, -1 이전. 한 장이 책등을 축으로 넘어간다. */
  /**
   * 그 장까지 넘어간다. 이미 그 장이면 곧바로 끝난다.
   *
   * 멀리 떨어져 있으면 **마지막 한 장만 넘기는 연출**을 하고 나머지는 건너뛴다.
   * 열 장을 한 장씩 넘기면 7초를 기다려야 하는데, 그건 연출이 아니라 대기다.
   * 마지막 한 장이 넘어가는 것만 보여도 "책이 그리로 갔다"는 것은 충분히 읽힌다.
   */
  turnTo(target: number, onDone?: () => void) {
    const to = Math.max(0, Math.min(this.total - 1, target));
    if (!this.group || this.busy || to === this.index) {
      onDone?.();
      return;
    }
    const dir: 1 | -1 = to > this.index ? 1 : -1;
    const hop = () => {
      // 마지막 한 장을 남겨 두고 나머지는 소리 없이 건너뛴다.
      if (Math.abs(to - this.index) > 1) {
        this.index = to - dir;
        this.showSpread(this.index);
      }
      this.turn(dir, onDone);
    };
    hop();
  }

  /**
   * 한 장 넘긴다. `onDone` 은 넘김이 **실제로 끝났을 때만** 불린다 — 넘길 수 없어
   * 아무 일도 안 했으면 불리지 않는다. 여러 장을 이어 넘길 때(turnTo) 쓴다.
   */
  turn(dir: 1 | -1, onDone?: () => void) {
    if (this.busy || !this.group || !this.turnHinge) return;
    const nextIdx = this.index + dir;
    if (nextIdx < 0 || nextIdx >= this.total) return;
    this.busy = true;
    const finish = onDone;
    const leftOf = (s: number) => this.pages[2 * s] ?? this.pages[0];
    const rightOf = (s: number) => this.pages[2 * s + 1] ?? this.pages[0];
    const hinge = this.turnHinge;
    hinge.visible = true;

    // ── 한 면 모드: 한 장(잎)이 위 모서리를 축으로 위로 넘어가며 다음/이전 면이 드러난다.
    if (this.single) {
      const pageAt = (i: number) => this.pages[i] ?? this.pages[0];
      const V = -PI * 0.985; // 위쪽(카메라 쪽)으로 젖혀 올린다
      const done = () => {
        hinge.visible = false;
        hinge.rotation.x = 0;
        this.index = nextIdx;
        this.busy = false;
        this.render();
        this.onProgress?.(this.index, this.total);
        finish?.();
      };
      if (dir === 1) {
        // 현재 페이지(잎)가 위로 넘어가고, 그 아래 다음 페이지가 드러난다.
        this.turnFrontMat!.map = pageAt(this.index);
        this.turnBackMat!.map = pageAt(nextIdx);
        this.turnFrontMat!.needsUpdate = this.turnBackMat!.needsUpdate = true;
        let swapped = false;
        this.tween(
          (p) => {
            hinge.rotation.x = V * easeInOut(p);
            if (!swapped && p > 0.16) {
              swapped = true;
              this.bodyFrontMat!.map = pageAt(nextIdx); // 잎이 들리며 다음 면 드러남
              this.bodyFrontMat!.needsUpdate = true;
            }
          },
          560,
          done,
        );
      } else {
        // 이전 페이지로. 잎이 위에서 내려와 몸통을 덮으며 이전 면을 보인다. 몸통(현재)은
        // 잎이 다 덮은 '끝'에서 이전 면으로 바꾼다 — 일찍 바꾸면 덮이기 전에 드러난다.
        this.turnFrontMat!.map = pageAt(nextIdx);
        this.turnBackMat!.map = pageAt(this.index);
        this.turnFrontMat!.needsUpdate = this.turnBackMat!.needsUpdate = true;
        this.tween(
          (p) => {
            hinge.rotation.x = V * (1 - easeInOut(p));
          },
          560,
          () => {
            this.bodyFrontMat!.map = pageAt(nextIdx);
            this.bodyFrontMat!.needsUpdate = true;
            done();
          },
        );
      }
      return;
    }

    if (dir === 1) {
      // 오른쪽 면(현재)이 왼쪽으로 넘어가 다음 왼쪽 면이 된다.
      this.turnFrontMat!.map = rightOf(this.index);
      this.turnBackMat!.map = leftOf(nextIdx);
      this.turnFrontMat!.needsUpdate = this.turnBackMat!.needsUpdate = true;
      let swapped = false;
      this.tween(
        (p) => {
          hinge.rotation.y = -PI * 0.985 * easeInOut(p);
          if (!swapped && p > 0.16) {
            swapped = true;
            this.bodyFrontMat!.map = rightOf(nextIdx); // 오른쪽에 다음 오른 면 드러냄
            this.bodyFrontMat!.needsUpdate = true;
          }
        },
        620,
        () => {
          this.coverBackMat!.map = leftOf(nextIdx); // 왼쪽에 다음 왼 면
          this.coverBackMat!.needsUpdate = true;
          hinge.visible = false;
          hinge.rotation.y = 0;
          this.index = nextIdx;
          this.busy = false;
          this.render();
          this.onProgress?.(this.index, this.total);
          finish?.();
        },
      );
    } else {
      // 왼쪽 면(현재)이 오른쪽으로 넘어가 이전 오른쪽 면이 된다. 잎은 왼쪽(-PI)에서
      // 오른쪽(0)으로 쓸려 간다. 왼쪽은 시작에 잎이 덮고 있으니 새 왼 면을 미리 깔아도
      // 안 보이지만, 오른쪽은 시작엔 드러나 있고 '끝'에서야 잎이 덮는다. 그래서 오른쪽
      // 면은 끝에서 바꿔야 한다 — 일찍 바꾸면 잎이 도착하기 전에 내용이 미리 드러난다.
      this.turnFrontMat!.map = rightOf(nextIdx);
      this.turnBackMat!.map = leftOf(this.index);
      this.turnFrontMat!.needsUpdate = this.turnBackMat!.needsUpdate = true;
      this.coverBackMat!.map = leftOf(nextIdx); // 왼쪽에 이전 왼 면을 미리(잎이 덮은 채)
      this.coverBackMat!.needsUpdate = true;
      this.tween(
        (p) => {
          hinge.rotation.y = -PI * 0.985 * (1 - easeInOut(p));
        },
        620,
        () => {
          // 잎이 오른쪽을 덮은 끝에서 오른 면 교체 → 드러난 채로 바뀌는 순간이 없다.
          this.bodyFrontMat!.map = rightOf(nextIdx);
          this.bodyFrontMat!.needsUpdate = true;
          hinge.visible = false;
          hinge.rotation.y = 0;
          this.index = nextIdx;
          this.busy = false;
          this.render();
          this.onProgress?.(this.index, this.total);
          finish?.();
        },
      );
    }
  }

  /** 퇴장: 표지를 덮고 회전하며 책장으로 들어간다. */
  playClose(opts: { spineRect: Rect; coverH: number; duration: number; onDone: () => void }) {
    if (!this.group) {
      opts.onDone();
      return;
    }
    const group = this.group;
    const center = this.restCenter();
    const end = this.toWorld(
      opts.spineRect.left + opts.spineRect.width / 2,
      opts.spineRect.top + opts.spineRect.height / 2,
    );
    const endScale = opts.spineRect.height / opts.coverH;
    const W = this.dims.W;
    // 표지 안쪽(왼 면)은 **지금 보고 있던 것 그대로** 두고 접는다.
    //
    // 예전에는 여기서 pages[0] 으로 되돌렸다. 닫으려면 표지가 처음 상태여야 자연스럽다고
    // 본 것인데, 화면에서는 반대였다 — 2장에서 덮으면 왼쪽이 갑자기 1장 내용으로 바뀌며
    // 접혔다. 실제 책은 보던 자리를 그대로 덮는다.
    //
    // 되돌릴 필요도 없다. 다시 열 때 startOpen 이 buildBook 을 부르고, 거기서 표지 안쪽이
    // pages[0] 으로 새로 만들어진다.
    this.tween(
      (p) => {
        const close = easeInOut(clamp01(p / 0.4));
        const rot = easeInOut(clamp01((p - 0.3) / 0.34));
        const move = easeInOut(clamp01((p - 0.45) / 0.55));
        const s = lerp(1, endScale, easeInOut(p));
        // 등장과 대칭: 책등만 보이도록 회전(rot 큼)할수록 오프셋을 0 으로 줄여, 책등이
        // 실제 책장 자리(end)로 곧장 들어가게 한다(안 그러면 왼쪽으로 들어간다).
        // 한 면은 늘 한 장 가운데(-W/2)에서 시작하고, 두 면은 표지가 닫히며(close) 그리 모인다.
        const offX = (this.single ? -W / 2 : lerp(0, -W / 2, close)) * s * (1 - rot);
        this.setCoverOpen(1 - close);
        // 덮으면서 그림자도 걷힌다(등장의 역순).
        if (this.shadowMat) this.shadowMat.opacity = 1 - (this.single ? rot : close);
        group.rotation.y = lerp(0, PI / 2, rot);
        group.position.set(
          lerp(center.x, end.x, move) + offX,
          lerp(center.y, end.y, move),
          lerp(center.z, end.z, move),
        );
        group.scale.setScalar(s);
      },
      opts.duration,
      opts.onDone,
    );
  }

  onResize() {
    this.resize();
    if (this.group) {
      // 열려 있으면 다시 맞춘다. 한 면 모드는 한 장(0..W)이 가운데 오도록 -W/2.
      const center = this.restCenter();
      const offX = this.single ? -this.dims.W / 2 : 0;
      this.group.position.set(center.x + offX, center.y, center.z);
      this.render();
    }
  }

  cancel() {
    cancelAnimationFrame(this.raf);
  }
  mount() {
    if (!this.canvas.isConnected) document.body.appendChild(this.canvas);
  }
  hide() {
    this.canvas.style.opacity = '0';
  }
  show() {
    this.canvas.style.opacity = '1';
  }
  clear() {
    this.disposeBook();
    this.render();
  }
}

let engine: Book3D | null = null;
let loading: Promise<Book3D> | null = null;
export function getBook3D(): Promise<Book3D> {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  loading = import('three').then((THREE) => {
    engine = new Book3D(THREE as unknown as THREE);
    engine.mount();
    return engine;
  });
  return loading;
}
