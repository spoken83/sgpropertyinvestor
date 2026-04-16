"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import MoneyInput from "@/components/MoneyInput";
import OpFilter, { type Op } from "@/components/OpFilter";
import { useNav } from "./NavContext";

type Props = {
  defaults: {
    max: string;
    segment: string;
    tenure: string;
    mrtOp: string;
    mrtVal: string;
    unitsOp: string;
    unitsVal: string;
    psfOp: string;
    psfVal: string;
    ageOp: string;
    ageVal: string;
    q: string;
    type: string;
    minYield: string;
    positive: string;
  };
};

export default function FiltersBar({ defaults }: Props) {
  const { go } = useNav();
  const sp = useSearchParams();

  const [max, setMax] = useState(Number(defaults.max) || 0);
  const [q, setQ] = useState(defaults.q);
  const [minYield, setMinYield] = useState(defaults.minYield);

  useEffect(() => {
    setMax(Number(defaults.max) || 0);
    setQ(defaults.q);
    setMinYield(defaults.minYield);
  }, [defaults.max, defaults.q, defaults.minYield]);

  function navigate(overrides: Partial<typeof defaults>) {
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    const merged: Record<string, string> = {
      max: String(max),
      q,
      minYield,
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, String(v ?? "")])
      ),
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === "" || v === "0") params.delete(k);
      else params.set(k, v);
    }
    go(`/properties?${params.toString()}`);
  }

  const commit = () => navigate({});

  return (
    <div className="p-4 bg-gray-50 border rounded space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <TextInput label="Search project" value={q} onChange={setQ} onCommit={commit} placeholder="e.g. Interlace" />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600">Max price</span>
          <MoneyInput value={max} onChange={setMax} onCommit={commit} />
        </label>
        <SelectField
          label="Zone"
          value={defaults.segment}
          onChange={(v) => navigate({ segment: v })}
          options={[["", "Any"], ["CCR", "CCR"], ["RCR", "RCR"], ["OCR", "OCR"]]}
        />
        <SelectField
          label="Tenure"
          value={defaults.tenure}
          onChange={(v) => navigate({ tenure: v })}
          options={[["", "Any"], ["freehold", "Freehold / 999yr"], ["leasehold", "99-yr leasehold"]]}
        />
        <SelectField
          label="Unit type"
          value={defaults.type}
          onChange={(v) => navigate({ type: v })}
          options={[
            ["", "Any"],
            ["Studio", "Studio"],
            ["1BR", "1BR"],
            ["2BR", "2BR"],
            ["3BR", "3BR"],
            ["4BR+", "4BR+"],
          ]}
        />
        <TextInput
          label="Min gross yield (%)"
          value={minYield}
          onChange={setMinYield}
          onCommit={commit}
          placeholder="e.g. 3.5"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <OpFilter
          label="No. units"
          op={defaults.unitsOp as Op}
          value={defaults.unitsVal}
          onCommit={(op, v) => navigate({ unitsOp: op, unitsVal: v })}
          placeholder="e.g. 100"
        />
        <OpFilter
          label="MRT distance"
          op={defaults.mrtOp as Op}
          value={defaults.mrtVal}
          onCommit={(op, v) => navigate({ mrtOp: op, mrtVal: v })}
          placeholder="e.g. 500"
          unit="m"
        />
        <OpFilter
          label="PSF"
          op={defaults.psfOp as Op}
          value={defaults.psfVal}
          onCommit={(op, v) => navigate({ psfOp: op, psfVal: v })}
          placeholder="e.g. 1500"
          unit="$"
        />
        <OpFilter
          label="Age (yrs)"
          op={defaults.ageOp as Op}
          value={defaults.ageVal}
          onCommit={(op, v) => navigate({ ageOp: op, ageVal: v })}
          placeholder="e.g. 10"
          unit="yr"
        />
        <label className="flex items-center gap-2 text-xs text-gray-700 md:col-span-2 md:justify-self-start">
          <input
            type="checkbox"
            checked={defaults.positive === "1"}
            onChange={(e) => navigate({ positive: e.target.checked ? "1" : "" })}
            className="w-4 h-4"
          />
          <span>Exclude negative Cash ROI</span>
        </label>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-gray-600">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full border rounded px-2 py-2 text-sm bg-white"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded px-2 py-2 text-sm bg-white"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
