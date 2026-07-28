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

type THREE = typeof THREE_NS;

export interface BookVisual {
  cover: string;
  ink: string;
  pages: string;
  title: string;
  year?: string;
  blocks?: { h: boolean; text: string }[];
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
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

function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let cur = '';
  for (const ch of [...text]) {
    const test = cur + ch;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 한 페이지를 그린다. startIdx 부터 담기는 만큼 담고 다음 인덱스를 돌려준다. */
function drawContentPage(
  THREE: THREE,
  v: BookVisual,
  w: number,
  h: number,
  gutter: 'left' | 'right',
  startIdx: number,
  withTitle: boolean,
) {
  const blocks = v.blocks ?? [];
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.pages;
  g.fillRect(0, 0, c.width, c.height);

  const padX = Math.round(c.width * 0.11);
  const colW = c.width - padX * 2;
  const bottom = c.height * 0.93;
  g.fillStyle = '#463714';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let y = c.height * 0.09;

  if (withTitle) {
    const ts = Math.round(c.width * 0.052);
    g.font = `600 ${ts}px "Noto Serif KR Subset", serif`;
    g.fillText(v.title, padX, y + ts);
    y += ts * 2.1;
    g.strokeStyle = 'rgba(70,55,20,0.25)';
    g.beginPath();
    g.moveTo(padX, y);
    g.lineTo(c.width - padX, y);
    g.stroke();
    y += ts * 0.9;
  }

  let i = startIdx;
  for (; i < blocks.length; i++) {
    const bl = blocks[i];
    const fs = bl.h ? Math.round(c.width * 0.05) : Math.round(c.width * 0.038);
    const lineH = fs * 1.62;
    g.font = `${bl.h ? 600 : 400} ${fs}px "Noto Serif KR Subset", serif`;
    if (bl.h) y += lineH * 0.5;
    if (y + fs > bottom) break;
    for (const ln of wrapLines(g, bl.text, colW)) {
      if (y + fs > bottom) break;
      g.fillText(ln, padX, y + fs);
      y += lineH;
    }
    y += bl.h ? lineH * 0.15 : lineH * 0.5;
  }

  const gx = gutter === 'left' ? c.width : 0;
  const grad = g.createLinearGradient(gx, 0, gutter === 'left' ? c.width * 0.72 : c.width * 0.28, 0);
  grad.addColorStop(0, 'rgba(40,26,10,0.26)');
  grad.addColorStop(1, 'rgba(40,26,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  return { tex: tex(THREE, c), next: i };
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
  private pages: THREE_NS.Texture[] = [];
  private dims = { W: 0, H: 0, t: 0 };
  private index = 0;
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

    const key = new THREE.DirectionalLight(0xfff4e2, 2.0);
    key.position.set(-0.35, 0.7, 1).multiplyScalar(1000);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.5);
    fill.position.set(0.8, 0.2, 0.6).multiplyScalar(1000);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
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

  get total() {
    return Math.max(1, Math.ceil(this.pages.length / 2));
  }
  get current() {
    return this.index;
  }

  private buildPages(v: BookVisual, pw: number, ph: number) {
    for (const p of this.pages) p.dispose();
    const blocks = v.blocks ?? [];
    const pages: THREE_NS.Texture[] = [];
    let start = 0;
    let idx = 0;
    while (start < blocks.length && idx < 60) {
      const gutter = idx % 2 === 0 ? 'right' : 'left';
      const r = drawContentPage(this.THREE, v, pw, ph, gutter, start, idx === 0);
      pages.push(r.tex);
      start = r.next > start ? r.next : start + 1;
      idx++;
    }
    if (pages.length === 0) pages.push(drawContentPage(this.THREE, v, pw, ph, 'right', 0, true).tex);
    if (pages.length % 2 === 1)
      pages.push(drawContentPage(this.THREE, v, pw, ph, 'left', blocks.length, false).tex);
    this.pages = pages;
  }

  /** 책 메시(몸통 + 표지 + 넘김용 잎)를 만든다. 페이지 텍스처는 미리 만들어 둔다. */
  private buildBook(v: BookVisual, W: number, H: number, thickness: number) {
    const T = this.THREE;
    this.disposeBook();
    this.dims = { W, H, t: thickness };
    this.buildPages(v, 640, Math.round((640 * H) / W));

    const group = new T.Group();
    const ratio = (a: number, b: number) => Math.max(8, Math.round((a * 96) / b));
    const spineTex = spineTexture(T, v, 96, ratio(H, thickness));
    const headTail = edgeTexture(T, v, 512, 96, false);
    const foreEdge = edgeTexture(T, v, 96, ratio(H, thickness), true);
    const coverTex = coverTexture(T, v, 512, Math.round((512 * H) / W));
    const backTex = coverTexture(T, v, 512, Math.round((512 * H) / W), true);
    const mat = (map: THREE_NS.Texture | null, rough = 0.62) =>
      new T.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });

    // 몸통: +z = 오른쪽 페이지(첫 스프레드의 오른 면)
    const bodyFront = mat(this.pages[1] ?? this.pages[0], 0.66);
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

    // 앞표지: -z 안쪽 = 왼쪽 페이지(첫 스프레드의 왼 면)
    const ct = Math.max(6, thickness * 0.16);
    const coverBack = mat(this.pages[0], 0.66);
    this.coverBackMat = coverBack;
    const coverHinge = new T.Group();
    coverHinge.position.set(0, 0, thickness / 2 + 0.6);
    const cover = new T.Mesh(new T.BoxGeometry(W, H, ct), [
      mat(foreEdge),
      mat(spineTex),
      mat(headTail),
      mat(headTail),
      mat(coverTex, 0.5),
      coverBack,
    ]);
    cover.position.set(W / 2, 0, 0);
    coverHinge.add(cover);
    group.add(coverHinge);

    // 넘기는 잎(평소 숨김)
    const turnFront = mat(null, 0.66);
    const turnBack = mat(null, 0.66);
    this.turnFrontMat = turnFront;
    this.turnBackMat = turnBack;
    const turnHinge = new T.Group();
    turnHinge.position.set(0, 0, thickness / 2 + ct + 1.0);
    turnHinge.visible = false;
    const leaf = new T.Mesh(new T.BoxGeometry(W, H, Math.max(3, ct * 0.5)), [
      mat(foreEdge),
      mat(null),
      mat(headTail),
      mat(headTail),
      turnFront,
      turnBack,
    ]);
    leaf.position.set(W / 2, 0, 0);
    turnHinge.add(leaf);
    group.add(turnHinge);

    this.scene.add(group);
    this.group = group;
    this.coverHinge = coverHinge;
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
    onDone: () => void;
  }) {
    this.buildBook(opts.v, opts.coverW, opts.coverH, opts.thickness);
    const group = this.group!;
    const start = this.toWorld(
      opts.spineRect.left + opts.spineRect.width / 2,
      opts.spineRect.top + opts.spineRect.height / 2,
    );
    const center = this.toWorld(this.w / 2, this.h / 2);
    const startScale = opts.spineRect.height / opts.coverH;
    const OPEN = PI * 0.985;
    this.tween(
      (p) => {
        const move = easeInOut(clamp01(p / 0.42));
        const rot = easeInOut(clamp01((p - 0.24) / 0.36));
        const open = easeInOut(clamp01((p - 0.6) / 0.4));
        const s = lerp(startScale, 1, easeOut(clamp01(p / 0.7)));
        const offX = lerp(-this.dims.W / 2, 0, open) * s;
        group.position.set(
          lerp(start.x, center.x, move) + offX,
          lerp(start.y, center.y, move),
          lerp(start.z, center.z, move),
        );
        group.scale.setScalar(s);
        group.rotation.y = lerp(PI / 2, 0, rot);
        if (this.coverHinge) this.coverHinge.rotation.y = -OPEN * open;
      },
      opts.duration,
      () => {
        this.onProgress?.(this.index, this.total);
        opts.onDone();
      },
    );
  }

  /** 페이지 넘김: dir=+1 다음 두 면, -1 이전. 한 장이 책등을 축으로 넘어간다. */
  turn(dir: 1 | -1) {
    if (this.busy || !this.group || !this.turnHinge) return;
    const nextIdx = this.index + dir;
    if (nextIdx < 0 || nextIdx >= this.total) return;
    this.busy = true;
    const leftOf = (s: number) => this.pages[2 * s] ?? this.pages[0];
    const rightOf = (s: number) => this.pages[2 * s + 1] ?? this.pages[0];
    const hinge = this.turnHinge;
    hinge.visible = true;

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
        },
      );
    } else {
      // 왼쪽 면(현재)이 오른쪽으로 넘어가 이전 오른쪽 면이 된다.
      this.turnFrontMat!.map = rightOf(nextIdx);
      this.turnBackMat!.map = leftOf(this.index);
      this.turnFrontMat!.needsUpdate = this.turnBackMat!.needsUpdate = true;
      this.coverBackMat!.map = leftOf(nextIdx); // 왼쪽에 이전 왼 면을 미리
      this.coverBackMat!.needsUpdate = true;
      let swapped = false;
      this.tween(
        (p) => {
          hinge.rotation.y = -PI * 0.985 * (1 - easeInOut(p));
          if (!swapped && p > 0.16) {
            swapped = true;
            this.bodyFrontMat!.map = rightOf(nextIdx);
            this.bodyFrontMat!.needsUpdate = true;
          }
        },
        620,
        () => {
          hinge.visible = false;
          hinge.rotation.y = 0;
          this.index = nextIdx;
          this.busy = false;
          this.render();
          this.onProgress?.(this.index, this.total);
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
    const center = this.toWorld(this.w / 2, this.h / 2);
    const end = this.toWorld(
      opts.spineRect.left + opts.spineRect.width / 2,
      opts.spineRect.top + opts.spineRect.height / 2,
    );
    const endScale = opts.spineRect.height / opts.coverH;
    const OPEN = PI * 0.985;
    const W = this.dims.W;
    // 넘겼던 표지를 첫 장으로 되돌린다(닫으려면 표지가 처음 상태여야 자연스럽다).
    if (this.coverBackMat) {
      this.coverBackMat.map = this.pages[0];
      this.coverBackMat.needsUpdate = true;
    }
    this.tween(
      (p) => {
        const close = easeInOut(clamp01(p / 0.4));
        const rot = easeInOut(clamp01((p - 0.3) / 0.34));
        const move = easeInOut(clamp01((p - 0.45) / 0.55));
        const s = lerp(1, endScale, easeInOut(p));
        const offX = lerp(0, -W / 2, close) * s;
        if (this.coverHinge) this.coverHinge.rotation.y = -OPEN * (1 - close);
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
      // 열려 있으면 가운데로 다시 맞춘다.
      const center = this.toWorld(this.w / 2, this.h / 2);
      this.group.position.set(center.x, center.y, center.z);
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
