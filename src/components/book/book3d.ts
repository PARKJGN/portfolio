/**
 * 3D 책 등장/펼침/퇴장 연출 (Three.js).
 *
 * 헌장 원칙 I·성능 때문에 이 모듈은 **책을 처음 누를 때만 동적 import** 된다.
 * 초기 로딩에는 들어가지 않는다. 내용(읽기)은 여전히 HTML 모달이 담당하고,
 * 여기서는 "책장에서 뽑아 회전시켜 세우고, 표지를 열어 두 면을 펼치는" 입체
 * 연출만 그린다. 다 펼치면 HTML 모달로 크로스페이드한다.
 *
 * 좌표계: z=0 평면이 화면 픽셀과 1:1 이 되도록 원근 카메라를 배치한다.
 * world.x = 화면 x, world.y = (뷰포트 높이 - 화면 y) — 위가 +y.
 *
 * 책 모델(그룹 원점 = 책등):
 *  - pagesBlock: 오른쪽 면(닫혔을 땐 표지 아래). x in [0, W].
 *  - coverHinge: 책등(x=0)을 경첩으로 앞표지가 달린 그룹. 열리면 -pi 회전해
 *    x in [-W, 0] 으로 눕고, 그 안쪽 면이 왼쪽 페이지가 된다.
 */
import type * as THREE_NS from 'three';

type THREE = typeof THREE_NS;

export interface BookVisual {
  cover: string;
  ink: string;
  pages: string;
  title: string;
  year?: string;
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

function coverTexture(THREE: THREE, v: BookVisual, w: number, h: number) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.cover;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = v.pages;
  g.fillRect(0, 0, c.width, Math.max(2, c.height * 0.012));
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
  return tex(THREE, c);
}

function spineTexture(THREE: THREE, v: BookVisual, w: number, h: number) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.cover;
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(Math.PI / 2);
  g.fillStyle = v.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(c.width * 0.5)}px "Noto Serif KR Subset", serif`;
  g.fillText(v.title, 0, 0);
  g.restore();
  return tex(THREE, c);
}

/** 페이지 면(크림 + 낱장 결). side: 왼/오른쪽에 따라 안쪽(책등)에 옅은 그늘. */
function pageTexture(THREE: THREE, v: BookVisual, w: number, h: number, gutter: 'left' | 'right') {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.pages;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(90,70,40,0.10)';
  g.lineWidth = 1;
  for (let i = Math.round(c.height * 0.16); i < c.height * 0.9; i += Math.round(c.height * 0.05)) {
    g.beginPath();
    g.moveTo(c.width * 0.12, i);
    g.lineTo(c.width * 0.88, i);
    g.stroke();
  }
  // 책등 쪽 그늘(페이지가 골로 말려 드는 느낌)
  const gx = gutter === 'left' ? c.width : 0;
  const grad = g.createLinearGradient(gx, 0, gutter === 'left' ? c.width * 0.7 : c.width * 0.3, 0);
  grad.addColorStop(0, 'rgba(40,26,10,0.30)');
  grad.addColorStop(1, 'rgba(40,26,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
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

export class Book3D {
  private THREE: THREE;
  private renderer: THREE_NS.WebGLRenderer;
  private scene: THREE_NS.Scene;
  private camera: THREE_NS.PerspectiveCamera;
  private book?: THREE_NS.Group;
  private hinge?: THREE_NS.Group;
  private raf = 0;
  private w = 0;
  private h = 0;
  readonly canvas: HTMLCanvasElement;

  constructor(THREE: THREE) {
    this.THREE = THREE;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.canvas = this.renderer.domElement;
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60;opacity:0;transition:opacity 240ms ease;';
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
    const dist = this.h / 2 / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    this.camera.position.set(this.w / 2, this.h / 2, dist);
    this.camera.lookAt(new T.Vector3(this.w / 2, this.h / 2, 0));
    this.camera.updateProjectionMatrix();
  }

  private toWorld(px: number, py: number) {
    return new this.THREE.Vector3(px, this.h - py, 0);
  }

  /** 경첩 표지가 달린 책. 그룹 원점 = 책등(x=0). 오른쪽 면은 x in [0,W]. */
  buildBook(v: BookVisual, W: number, H: number, thickness: number) {
    const T = this.THREE;
    if (this.book) this.disposeBook();
    const group = new T.Group();

    const ratio = (a: number, b: number) => Math.max(8, Math.round((a * 96) / b));
    const coverTex = coverTexture(T, v, 512, Math.round((512 * H) / W));
    const spineTex = spineTexture(T, v, 96, ratio(H, thickness));
    const pageR = pageTexture(T, v, 512, Math.round((512 * H) / W), 'left'); // 오른쪽 면(골이 왼쪽)
    const pageL = pageTexture(T, v, 512, Math.round((512 * H) / W), 'right'); // 왼쪽 면(골이 오른쪽)
    const headTail = edgeTexture(T, v, 512, 96, false);
    const foreEdge = edgeTexture(T, v, 96, ratio(H, thickness), true);
    const backTex = coverTexture(T, { ...v, title: '' }, 512, Math.round((512 * H) / W));

    const mat = (map: THREE_NS.Texture, rough = 0.62) =>
      new T.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });

    // 페이지 블록(오른쪽 면). 면 순서 [+x,-x,+y,-y,+z,-z].
    // +x 책배, -x 책등, +y/-y 머리·꼬리, +z 오른쪽 페이지(표지 아래), -z 뒤표지.
    const block = new T.Mesh(new T.BoxGeometry(W, H, thickness), [
      mat(foreEdge),
      mat(spineTex),
      mat(headTail),
      mat(headTail),
      mat(pageR),
      mat(backTex, 0.5),
    ]);
    block.position.set(W / 2, 0, 0);
    group.add(block);

    // 앞표지 — 책등(x=0)을 경첩으로. hinge 를 회전시키면 표지가 열린다.
    const hinge = new T.Group();
    hinge.position.set(0, 0, thickness / 2 + 0.6);
    const ct = Math.max(6, thickness * 0.16);
    const cover = new T.Mesh(new T.BoxGeometry(W, H, ct), [
      mat(foreEdge),
      mat(spineTex),
      mat(headTail),
      mat(headTail),
      mat(coverTex, 0.5), // +z 바깥(표지)
      mat(pageL, 0.66), // -z 안쪽(열리면 왼쪽 페이지)
    ]);
    cover.position.set(W / 2, 0, 0); // 왼쪽 모서리가 경첩(x=0)에
    hinge.add(cover);
    group.add(hinge);

    this.scene.add(group);
    this.book = group;
    this.hinge = hinge;
    return { group, hinge, W };
  }

  private disposeBook() {
    if (!this.book) return;
    this.book.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of mats) {
        const sm = mm as THREE_NS.MeshStandardMaterial;
        sm.map?.dispose();
        sm.dispose();
      }
    });
    this.scene.remove(this.book);
    this.book = undefined;
    this.hinge = undefined;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 등장+펼침: 책장 책등에서 뽑혀 나와(1) 책등→표지로 회전(2)하고, 표지가 열려
   * 두 면으로 펼쳐진다(3). onDone 은 다 펼친 뒤 — HTML 모달로 넘길 타이밍.
   */
  playOpen(opts: {
    spineRect: Rect;
    v: BookVisual;
    coverW: number;
    coverH: number;
    thickness: number;
    duration: number;
    onFacing?: () => void;
    onDone: () => void;
  }) {
    const { group, hinge, W } = this.buildBook(opts.v, opts.coverW, opts.coverH, opts.thickness);
    const { spineRect } = opts;

    const start = this.toWorld(
      spineRect.left + spineRect.width / 2,
      spineRect.top + spineRect.height / 2,
    );
    const center = this.toWorld(this.w / 2, this.h / 2);
    const startScale = spineRect.height / opts.coverH;
    const OPEN = Math.PI * 0.985;

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = clamp01((now - t0) / opts.duration);
      const move = easeInOut(clamp01(p / 0.42)); // 뽑혀 나오기
      const rot = easeInOut(clamp01((p - 0.24) / 0.36)); // 책등→표지 회전
      const open = easeInOut(clamp01((p - 0.6) / 0.4)); // 표지 열기
      const s = lerp(startScale, 1, easeOut(clamp01(p / 0.7)));

      // 닫혔을 땐 오른쪽 면만 있어 책 중심이 W/2 오른쪽 → 왼쪽으로 당겨 가운데.
      // 열리면 두 면이 되어 중심이 책등(원점)이므로 offset 을 0 으로.
      const offX = lerp(-W / 2, 0, open) * s;
      group.position.set(
        lerp(start.x, center.x, move) + offX,
        lerp(start.y, center.y, move),
        lerp(start.z, center.z, move),
      );
      group.scale.setScalar(s);
      group.rotation.y = lerp(Math.PI / 2, 0, rot);
      if (hinge) hinge.rotation.y = -OPEN * open;
      this.render();
      if (p < 1) this.raf = requestAnimationFrame(tick);
      else opts.onDone();
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** 퇴장: 표지를 덮고(1) 표지→책등 회전(2)하며 책장으로 작아져 들어간다(3). */
  playClose(opts: {
    spineRect: Rect;
    v: BookVisual;
    coverW: number;
    coverH: number;
    thickness: number;
    duration: number;
    onDone: () => void;
  }) {
    const built =
      this.book && this.hinge
        ? { group: this.book, hinge: this.hinge, W: opts.coverW }
        : this.buildBook(opts.v, opts.coverW, opts.coverH, opts.thickness);
    const { group, hinge, W } = built;
    const { spineRect } = opts;
    const center = this.toWorld(this.w / 2, this.h / 2);
    const end = this.toWorld(
      spineRect.left + spineRect.width / 2,
      spineRect.top + spineRect.height / 2,
    );
    const endScale = spineRect.height / opts.coverH;
    const OPEN = Math.PI * 0.985;

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = clamp01((now - t0) / opts.duration);
      const close = easeInOut(clamp01(p / 0.4)); // 표지 덮기
      const rot = easeInOut(clamp01((p - 0.3) / 0.34)); // 표지→책등
      const move = easeInOut(clamp01((p - 0.45) / 0.55)); // 책장으로
      const s = lerp(1, endScale, easeInOut(p));
      const offX = lerp(0, -W / 2, close) * s;
      if (hinge) hinge.rotation.y = -OPEN * (1 - close);
      group.rotation.y = lerp(0, Math.PI / 2, rot);
      group.position.set(
        lerp(center.x, end.x, move) + offX,
        lerp(center.y, end.y, move),
        lerp(center.z, end.z, move),
      );
      group.scale.setScalar(s);
      this.render();
      if (p < 1) this.raf = requestAnimationFrame(tick);
      else opts.onDone();
    };
    this.raf = requestAnimationFrame(tick);
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
  dispose() {
    this.cancel();
    this.disposeBook();
    this.renderer.dispose();
    this.canvas.remove();
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
