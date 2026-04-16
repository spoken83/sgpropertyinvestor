"use client";

// A money input with persistent "$" prefix and thousand separators.
// Stores its value as a number via `onChange(number)`, displays it formatted.

import { useEffect, useState } from "react";

const format = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "";

const parse = (s: string): number => Number(s.replace(/[^\d.-]/g, "")) || 0;

export default function MoneyInput({
  value,
  onChange,
  onCommit,
  className = "",
  placeholder,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  onCommit?: (n: number) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(format(value));

  // Re-sync when the external value changes (e.g., reset or URL sync).
  useEffect(() => {
    setText(format(value));
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none select-none">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          onChange(parse(raw));
        }}
        onBlur={() => {
          const n = parse(text);
          setText(format(n));
          onCommit?.(n);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full border rounded pl-6 pr-2 py-2 text-sm bg-white text-right tabular-nums"
      />
    </div>
  );
}
