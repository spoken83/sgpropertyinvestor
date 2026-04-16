"use client";

import { Button } from "@heroui/react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";

const LAST_LIST_URL_KEY = "sgp_last_list_url";

export default function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  const onClick = () => {
    // If falling back to /properties, prefer the last list URL the user was on
    // (preserves filters/sort/page). Otherwise use the given fallback.
    let target = fallback;
    if (fallback === "/properties" && typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem(LAST_LIST_URL_KEY);
      if (saved && saved.startsWith("/properties")) target = saved;
    }
    // push with nav-back transition type so the view slides back down.
    (router.push as (href: string, options?: { transitionTypes?: string[] }) => void)(target, {
      transitionTypes: ["nav-back"],
    });
  };

  return (
    <Button
      isIconOnly
      variant="flat"
      size="sm"
      radius="full"
      aria-label="Go back"
      onPress={onClick}
      className="flex-shrink-0 mt-1"
    >
      <ArrowLeft className="w-4 h-4" weight="bold" />
    </Button>
  );
}

export { LAST_LIST_URL_KEY };
