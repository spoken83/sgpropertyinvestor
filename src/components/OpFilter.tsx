"use client";

import { useEffect, useState } from "react";

export type Op = "" | "gte" | "lte" | "eq";

export const OP_LABEL: Record<Op, string> = { "": "Any", gte: "≥", lte: "≤", eq: "=" };

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
    if (nextOp === "" || nextVal === "") onCommit("", "");
    else onCommit(nextOp, nextVal);
  };

  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-gray-600">{label}</span>
      <div className="flex gap-1">
        <select
          value={localOp}
          onChange={(e) => {
            const next = e.target.value as Op;
            setLocalOp(next);
            commit(next, localVal);
          }}
          className="border rounded px-2 py-2 text-sm bg-white"
        >
          <option value="">Any</option>
          <option value="gte">≥</option>
          <option value="lte">≤</option>
          <option value="eq">=</option>
        </select>
        <div className="relative flex-1">
          <input
            type="number"
            value={localVal}
            placeholder={placeholder}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={() => commit(localOp, localVal)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={localOp === ""}
            className="w-full border rounded px-2 py-2 text-sm bg-white disabled:bg-gray-100 text-right tabular-nums pr-7"
          />
          {unit && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{unit}</span>
          )}
        </div>
      </div>
    </label>
  );
}
