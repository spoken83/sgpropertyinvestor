"use client";

import { useEffect, useState } from "react";
import { Input } from "@heroui/react";
import { CurrencyDollar } from "@phosphor-icons/react/dist/ssr";

const format = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "";

const parse = (s: string): number => Number(s.replace(/[^\d.-]/g, "")) || 0;

export default function MoneyInput({
  value,
  onChange,
  onCommit,
  label,
  ariaLabel,
  size = "sm",
}: {
  value: number;
  onChange: (n: number) => void;
  onCommit?: (n: number) => void;
  label?: string;
  ariaLabel?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [text, setText] = useState(format(value));

  useEffect(() => {
    setText(format(value));
  }, [value]);

  return (
    <Input
      size={size}
      label={label}
      aria-label={ariaLabel}
      startContent={<CurrencyDollar className="w-3.5 h-3.5 text-default-400" weight="regular" />}
      value={text}
      onValueChange={(v) => {
        setText(v);
        onChange(parse(v));
      }}
      onBlur={() => {
        const n = parse(text);
        setText(format(n));
        onCommit?.(n);
      }}
      onFocus={(e) => (e.target as HTMLInputElement).select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      classNames={{ input: "text-right tabular-nums" }}
      inputMode="numeric"
    />
  );
}
