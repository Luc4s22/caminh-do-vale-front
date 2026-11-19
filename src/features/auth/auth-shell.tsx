import type { ReactNode } from "react";
import logo from "@/assets/brand/logo-horizontal-yellow-v.png";

/** Green background and white card shared by the login and the password screens. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "linear-gradient(145deg, #1a7a44 0%, #1F8A4D 30%, #16643A 70%, #124e2e 100%)" }}
    >
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #BFE3C8 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/4 left-1/4 h-64 w-64 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #F2C94C 0%, transparent 70%)" }}
      />
      <svg className="pointer-events-none absolute bottom-0 left-0 w-full" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
        <path fill="rgba(47, 168, 102, 0.18)" d="M0,110 C240,70 480,150 720,112 C960,74 1200,96 1440,84 L1440,200 L0,200Z" />
        <path fill="rgba(191, 227, 200, 0.08)" d="M0,150 C300,126 600,176 900,150 C1140,130 1300,142 1440,140 L1440,200 L0,200Z" />
      </svg>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <img src={logo} alt="Caminho do Vale" className="mx-auto h-20 w-auto object-contain" />
          {children}
        </div>

        <p className="mt-6 text-center text-xs uppercase tracking-wider text-[#BFE3C8]/60">
          Vale do São Francisco &bull; Petrolina &bull; Juazeiro
        </p>
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-[#B03A3A]" role="alert">
      {children}
    </p>
  );
}
