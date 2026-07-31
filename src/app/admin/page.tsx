import type { Metadata } from 'next';
import { HeldInbox } from '@/components/admin/HeldInbox';

/**
 * 주인의 안전망 (T048).
 *
 * 이 파일이 서버 컴포넌트인 이유는 `metadata` 때문이다 — 클라이언트 컴포넌트에서는 내보낼
 * 수 없다. 검색에 잡힐 이유가 없는 화면이라 색인을 막는다. 막는다고 보호되는 것은 아니고,
 * 보호는 토큰이 한다.
 */
export const metadata: Metadata = {
  title: '보류함',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <HeldInbox />;
}
