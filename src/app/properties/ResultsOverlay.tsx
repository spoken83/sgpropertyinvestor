"use client";

import { useNav } from "./NavContext";
import Spinner from "@/components/Spinner";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

export default function ResultsOverlay({ children }: { children: ReactNode }) {
  const { pending } = useNav();
  return (
    <div className="relative">
      <motion.div
        animate={{ opacity: pending ? 0.5 : 1, filter: pending ? "blur(1px)" : "blur(0px)" }}
        transition={{ duration: 0.2 }}
        className={pending ? "pointer-events-none" : ""}
      >
        {children}
      </motion.div>
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 flex items-start justify-center pt-24 pointer-events-none"
          >
            <div className="flex items-center gap-3 text-sm text-default-700 bg-white/95 border border-default-200 rounded-full shadow-medium px-4 py-2 backdrop-blur">
              <Spinner className="w-4 h-4" />
              <span>Updating…</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
