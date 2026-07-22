/** @type {import('next').NextConfig} */
const nextConfig = {
  // 정적 산출물만 뽑는다. 런타임 Node 서버 없이 nginx 로 서빙한다.
  // 헌장 원칙 I(Static by Default) 와 라즈베리파이 arm64 클러스터의
  // 메모리 사정 양쪽에서 나온 결정. plan.md 배포 구성 절 참조.
  output: 'export',

  // 정적 export 에서는 next/image 의 런타임 최적화를 쓸 수 없다.
  // 이미지는 빌드 시점에 미리 적절한 크기로 준비한다.
  images: { unoptimized: true },

  // 기본값(false)을 유지해 /books/<slug> 형태의 주소를 쓴다.
  // nginx 쪽에서 try_files 로 .html 을 붙여 찾게 한다 (T041).
  trailingSlash: false,

  reactStrictMode: true,
};

export default nextConfig;
