"use client";

import { useRouter } from "next/navigation";

export default function BackLink({
  fallback,
  children,
  className = "text-sm text-blue-600",
}: {
  fallback: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      className={className}
      onClick={(e) => {
        // Only intercept plain left-clicks; let modifier-clicks open a new tab.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        // If there's history from within our app, go back to preserve list state.
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
    >
      {children}
    </a>
  );
}
