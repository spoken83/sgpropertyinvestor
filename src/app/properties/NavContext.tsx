"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type NavCtx = { pending: boolean; go: (url: string) => void };

const Ctx = createContext<NavCtx>({ pending: false, go: () => {} });

export function NavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (url: string) => {
    startTransition(() => router.push(url));
  };
  return <Ctx.Provider value={{ pending, go }}>{children}</Ctx.Provider>;
}

export function useNav() {
  return useContext(Ctx);
}
