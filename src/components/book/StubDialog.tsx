'use client';

/**
 * T007 측정 전용 스텁 — 폐기 예정.
 *
 * 실제 책 창은 T023 에서 만든다. 이 컴포넌트의 목적은 오직 하나,
 * "클라이언트 컴포넌트가 하나 있는 페이지"의 번들 크기를 실제 구성에
 * 가깝게 재는 것이다. 최종 화면은 책 창 하나만 클라이언트 컴포넌트이므로
 * 이 스텁이 그 상태를 근사한다.
 *
 * 측정이 끝나면 이 파일은 삭제한다.
 */

import { useRef } from 'react';

export function StubDialog() {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}>
        스텁 열기
      </button>
      <dialog ref={ref}>
        <p>측정용 스텁</p>
        <button type="button" onClick={() => ref.current?.close()}>
          닫기
        </button>
      </dialog>
    </>
  );
}
