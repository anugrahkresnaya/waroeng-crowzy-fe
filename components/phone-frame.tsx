import type { ReactNode } from "react";

/** One column on phones; on larger screens the same column floats as a phone-sized card. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg lg:my-4 lg:h-[min(860px,calc(100dvh-2rem))] lg:rounded-[28px] lg:border-[3px] lg:border-ink lg:shadow-2xl">
      {children}
    </div>
  );
}
