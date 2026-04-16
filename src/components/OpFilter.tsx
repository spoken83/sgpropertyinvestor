"use client";

import { useEffect, useState } from "react";
import { Input, Select, SelectItem } from "@heroui/react";

export type Op = "" | "gte" | "lte" | "eq";

export default function OpFilter({
  label,
  op,
  value,
  onCommit,
  placeholder,
  unit,
}: {
  label: string;
  op: Op;
  value: string;
  onCommit: (op: Op, value: string) => void;
  placeholder?: string;
  unit?: string;
}) {
  const [localOp, setLocalOp] = useState<Op>(op);
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalOp(op);
    setLocalVal(value);
  }, [op, value]);

  const commit = (nextOp: Op, nextVal: string) => {
    // Normalize to the canonical "off" state for noop comparison.
    const effOp: Op = (nextOp === "" || nextVal === "") ? "" : nextOp;
    const effVal = effOp === "" ? "" : nextVal;
    const curOp: Op = (op === "" || value === "") ? "" : op;
    const curVal = curOp === "" ? "" : value;
    if (effOp === curOp && effVal === curVal) return; // no-op
    onCommit(effOp, effVal);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-tiny text-default-600 px-0.5">{label}</span>
      <div className="flex gap-1">
        <Select
          size="sm"
          aria-label={`${label} operator`}
          selectedKeys={localOp ? [localOp] : []}
          onChange={(e) => {
            const next = (e.target.value as Op) || "";
            setLocalOp(next);
            commit(next, localVal);
          }}
          className="w-20 flex-shrink-0"
          items={[
            { key: "", label: "Any" },
            { key: "gte", label: "≥" },
            { key: "lte", label: "≤" },
            { key: "eq", label: "=" },
          ]}
        >
          {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
        </Select>
        <Input
          size="sm"
          aria-label={label}
          value={localVal}
          placeholder={placeholder}
          isDisabled={localOp === ""}
          onValueChange={setLocalVal}
          onBlur={() => commit(localOp, localVal)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          endContent={unit && <span className="text-tiny text-default-400">{unit}</span>}
          classNames={{ input: "text-right tabular-nums" }}
          inputMode="numeric"
        />
      </div>
    </div>
  );
}
