import { Spinner as HeroSpinner } from "@heroui/react";

export default function Spinner({ className = "" }: { className?: string }) {
  // Keep className API for existing callers; size based on className (w-4/w-5).
  const size: "sm" | "md" = /w-5|h-5/.test(className) ? "md" : "sm";
  return <HeroSpinner size={size} color="primary" />;
}
