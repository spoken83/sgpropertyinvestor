"use client";

import { useNav } from "./NavContext";
import Spinner from "@/components/Spinner";
import type { ReactNode } from "react";

export default function ResultsOverlay({ children }: { children: ReactNode }) {
  const { pending } = useNav();
  return (
    <div className="relative">
      <div className={pending ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
        {children}
      </div>
      {pending && (
        <div className="absolute inset-0 flex items-start justify-center pt-24 pointer-events-none">
          <div className="flex items-center gap-3 text-sm text-gray-700 bg-white/90 border border-gray-200 rounded-full shadow px-4 py-2 backdrop-blur">
            <Spinner className="w-4 h-4" />
            <span>Updating…</span>
          </div>
        </div>
      )}
    </div>
  );
}
