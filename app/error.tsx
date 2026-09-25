"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <section className="panel dashboardEmpty">
        <h1>화면 처리 중 오류가 발생했습니다.</h1>
        <p>{error.message || "예상하지 못한 화면 오류입니다."}</p>
        <button onClick={reset}>현재 단계 다시 시도</button>
      </section>
    </main>
  );
}
