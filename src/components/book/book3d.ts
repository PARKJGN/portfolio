/**
 * 3D 책 등장/퇴장 연출 (Three.js).
 *
 * 헌장 원칙 I·성능 때문에 이 모듈은 **책을 처음 누를 때만 동적 import** 된다.
 * 초기 로딩에는 들어가지 않는다. 내용(읽기)은 여전히 HTML 모달이 담당하고,
 * 여기서는 "책장에서 뽑아 회전시켜 세우는" 입체 연출만 그린다.
 *
 * 좌표계: z=0 평면이 화면 픽셀과 1:1 이 되도록 원근 카메라를 배치한다.
 * world.x = 화면 x, world.y = (뷰포트 높이 - 화면 y) — 위가 +y.
 */
import type * as THREE_NS from 'three';

type THREE = typeof THREE_NS;

export interface BookVisual {
  cover: string; // 표지 배경색 (CSS color)
  ink: string; // 표지 글자색
  pages: string; // 페이지 단면색 (크림)
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 표지·책등·페이지 면 텍스처를 2D 캔버스로 그린다. */
function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

function coverTexture(THREE: THREE, v: BookVisual, w: number, h: number) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.cover;
  g.fillRect(0, 0, c.width, c.height);
  // 위 크림 단면(책 머리) 느낌의 얇은 띠
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
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function spineTexture(THREE: THREE, v: BookVisual, w: number, h: number) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.cover;
  g.fillRect(0, 0, c.width, c.height);
  // 세로 제목
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(Math.PI / 2);
  g.fillStyle = v.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(c.width * 0.5)}px "Noto Serif KR Subset", serif`;
  g.fillText(v.title, 0, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pagesTexture(THREE: THREE, v: BookVisual, w: number, h: number, vertical: boolean) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = v.pages;
  g.fillRect(0, 0, c.width, c.height);
  // 낱장 결(얇은 선)
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
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Book3D {
  private THREE: THREE;
  private renderer: THREE_NS.WebGLRenderer;
  private scene: THREE_NS.Scene;
  private camera: THREE_NS.PerspectiveCamera;
  private book?: THREE_NS.Group;
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

    const key = new THREE.DirectionalLight(0xfff4e2, 2.1);
    key.position.set(-0.4, 0.7, 1).multiplyScalar(1000);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.5);
    fill.position.set(0.8, 0.2, 0.6).multiplyScalar(1000);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  }

  private resize() {
    const T = this.THREE;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    // z=0 평면이 화면 픽셀과 1:1 이 되도록 카메라 거리 계산.
    const dist = this.h / 2 / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    this.camera.position.set(this.w / 2, this.h / 2, dist);
    this.camera.lookAt(new T.Vector3(this.w / 2, this.h / 2, 0));
    this.camera.updateProjectionMatrix();
  }

  /** 화면 좌표 → world(z=0). y 뒤집기. */
  private toWorld(px: number, py: number) {
    return new this.THREE.Vector3(px, this.h - py, 0);
  }

  /** 표지/책등/페이지 텍스처를 입힌 책 메시를 만든다. size 는 표지 크기(px 기준). */
  buildBook(v: BookVisual, coverW: number, coverH: number, thickness: number) {
    const T = this.THREE;
    if (this.book) this.disposeBook();
    const group = new T.Group();

    const cover = coverTexture(T, v, 512, Math.round((512 * coverH) / coverW));
    const spine = spineTexture(T, v, 96, Math.round((96 * coverH) / thickness));
    const headTail = pagesTexture(T, v, 512, 96, false);
    const foreEdge = pagesTexture(T, v, 96, Math.round((96 * coverH) / thickness), true);
    const back = coverTexture(T, { ...v, title: '' }, 512, Math.round((512 * coverH) / coverW));

    const mat = (map: THREE_NS.Texture, rough = 0.62) =>
      new T.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });

    // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z
    // +x = 앞쪽 책배(fore-edge, 페이지), -x = 책등, +y = 머리(페이지), -y = 꼬리(페이지),
    // +z = 앞표지, -z = 뒤표지
    const materials = [
      mat(foreEdge),
      mat(spine),
      mat(headTail),
      mat(headTail),
      mat(cover, 0.5),
      mat(back, 0.5),
    ];
    const geo = new T.BoxGeometry(coverW, coverH, thickness);
    const mesh = new T.Mesh(geo, materials);
    // 모서리를 살짝 둥글려 딱딱함을 줄이는 대신, 얇은 테두리 그림자용 별도 처리는 생략.
    group.add(mesh);
    this.scene.add(group);
    this.book = group;
    return group;
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
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 등장: 책장 책등(spineRect)에서 뽑혀 가운데로 오며, 책등→표지로 회전하고 커진다.
   * onFacing: 표지가 정면을 향한 순간(HTML 모달로 넘길 타이밍) 콜백.
   */
  playOpen(opts: {
    spineRect: Rect;
    v: BookVisual;
    coverW: number;
    coverH: number;
    thickness: number;
    duration: number;
    onFacing: () => void;
    onDone: () => void;
  }) {
    const T = this.THREE;
    const group = this.buildBook(opts.v, opts.coverW, opts.coverH, opts.thickness);
    const { spineRect } = opts;

    // 시작: 책등 위치·크기, 책등이 정면(rotY = +90°)을 향함.
    const startCenter = this.toWorld(
      spineRect.left + spineRect.width / 2,
      spineRect.top + spineRect.height / 2,
    );
    const startScale = spineRect.height / opts.coverH; // 높이 기준
    const endCenter = this.toWorld(this.w / 2, this.h / 2);

    const start = performance.now();
    let facingFired = false;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / opts.duration);
      // 1단계(0~0.5): 뽑혀 가운데로 오며 책등 유지. 2단계(0.5~1): 회전+확대 마무리.
      const move = easeInOut(Math.min(1, p / 0.62));
      const rot = easeInOut(Math.max(0, (p - 0.32) / 0.68));
      group.position.set(
        lerp(startCenter.x, endCenter.x, move),
        lerp(startCenter.y, endCenter.y, move),
        lerp(startCenter.z, endCenter.z, move),
      );
      const s = lerp(startScale, 1, easeOut(p));
      group.scale.setScalar(s);
      group.rotation.y = lerp(Math.PI / 2, 0, rot);
      this.render();
      if (!facingFired && rot > 0.92) {
        facingFired = true;
        opts.onFacing();
      }
      if (p < 1) this.raf = requestAnimationFrame(tick);
      else opts.onDone();
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** 퇴장: 표지→책등으로 회전하고 책장으로 작아지며 들어간다. */
  playClose(opts: {
    spineRect: Rect;
    v: BookVisual;
    coverW: number;
    coverH: number;
    thickness: number;
    duration: number;
    onDone: () => void;
  }) {
    const T = this.THREE;
    const group = this.book ?? this.buildBook(opts.v, opts.coverW, opts.coverH, opts.thickness);
    const { spineRect } = opts;
    const endCenter = this.toWorld(
      spineRect.left + spineRect.width / 2,
      spineRect.top + spineRect.height / 2,
    );
    const endScale = spineRect.height / opts.coverH;
    const startCenter = this.toWorld(this.w / 2, this.h / 2);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / opts.duration);
      const rot = easeInOut(Math.min(1, p / 0.5)); // 먼저 회전
      const move = easeInOut(Math.max(0, (p - 0.4) / 0.6));
      group.rotation.y = lerp(0, Math.PI / 2, rot);
      group.position.set(
        lerp(startCenter.x, endCenter.x, move),
        lerp(startCenter.y, endCenter.y, move),
        lerp(startCenter.z, endCenter.z, move),
      );
      group.scale.setScalar(lerp(1, endScale, easeInOut(p)));
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

/** 지연 로드: 처음 호출 때만 three 를 가져와 엔진을 만든다. */
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
