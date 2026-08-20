"use client";

import dynamic from "next/dynamic";

const Workbench = dynamic(() => import("./workbench"), {
  ssr: false,
  loading: () => (
    <main className="loading-shell" aria-busy="true">
      <span className="loading-mark">NR</span>
      <p>Đang khởi tạo mặt bằng…</p>
    </main>
  ),
});

export function ClientShell() {
  return <Workbench />;
}
