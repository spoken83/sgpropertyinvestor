"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LAST_LIST_URL_KEY } from "@/components/BackButton";

export default function RememberListUrl() {
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (pathname !== "/properties") return;
    const qs = sp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    try {
      window.sessionStorage.setItem(LAST_LIST_URL_KEY, url);
    } catch {}
  }, [pathname, sp]);

  return null;
}
