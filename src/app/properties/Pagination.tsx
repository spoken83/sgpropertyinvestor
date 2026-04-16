"use client";

import { useNav } from "./NavContext";

export default function Pagination({
  currentPage,
  totalPages,
  prevUrl,
  nextUrl,
}: {
  currentPage: number;
  totalPages: number;
  prevUrl: string | null;
  nextUrl: string | null;
}) {
  const { go } = useNav();
  const btn = "px-3 py-1.5 border rounded text-sm hover:bg-gray-50";
  const btnDisabled = "px-3 py-1.5 border rounded text-sm text-gray-300";
  return (
    <nav className="flex items-center justify-between py-2">
      <div className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex gap-2">
        {prevUrl ? (
          <button type="button" onClick={() => go(prevUrl)} className={btn}>← Prev</button>
        ) : (
          <span className={btnDisabled}>← Prev</span>
        )}
        {nextUrl ? (
          <button type="button" onClick={() => go(nextUrl)} className={btn}>Next →</button>
        ) : (
          <span className={btnDisabled}>Next →</span>
        )}
      </div>
    </nav>
  );
}
