"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Input, Select, SelectItem, Checkbox, Button } from "@heroui/react";
import { MagnifyingGlass, CurrencyDollar, FunnelSimple, CaretDown, X } from "@phosphor-icons/react/dist/ssr";
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
    minCa: string;
    positive: string;
  };
};

export default function FiltersBar({ defaults }: Props) {
  const { go } = useNav();
  const sp = useSearchParams();

  const [max, setMax] = useState(defaults.max);
  const [q, setQ] = useState(defaults.q);
  const [minYield, setMinYield] = useState(defaults.minYield);
  const [minCa, setMinCa] = useState(defaults.minCa);
  const [openOnMobile, setOpenOnMobile] = useState(false);

  // Count active filters (excluding always-present max price).
  const activeCount =
    (defaults.q ? 1 : 0) +
    (defaults.segment ? 1 : 0) +
    (defaults.tenure ? 1 : 0) +
    (defaults.type ? 1 : 0) +
    (defaults.minYield ? 1 : 0) +
    (defaults.minCa ? 1 : 0) +
    (defaults.mrtOp && defaults.mrtVal ? 1 : 0) +
    (defaults.unitsOp && defaults.unitsVal ? 1 : 0) +
    (defaults.psfOp && defaults.psfVal ? 1 : 0) +
    (defaults.ageOp && defaults.ageVal ? 1 : 0) +
    (defaults.positive === "1" ? 1 : 0);

  const clearAll = () => {
    const params = new URLSearchParams();
    const sortVal = sp.get("sort");
    const dirVal = sp.get("dir");
    if (sortVal) params.set("sort", sortVal);
    if (dirVal) params.set("dir", dirVal);
    go(`/properties?${params.toString()}`);
  };

  useEffect(() => {
    setMax(defaults.max);
    setQ(defaults.q);
    setMinYield(defaults.minYield);
    setMinCa(defaults.minCa);
  }, [defaults.max, defaults.q, defaults.minYield, defaults.minCa]);

  function navigate(overrides: Partial<typeof defaults>) {
    const params = new URLSearchParams(sp.toString());
    // Start from every known filter's current value, then apply local text-input
    // state (user may have typed but not committed), then apply caller overrides.
    // This prevents filters from being silently dropped when a different filter
    // is changed — e.g. the "Exclude negative Cash ROI" checkbox used to clear
    // itself whenever another filter was updated.
    const merged: Record<string, string> = {
      ...defaults,
      max: String(max),
      q,
      minYield,
      minCa,
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, String(v ?? "")])
      ),
    };
    // Start from a clean slate to detect no-op correctly.
    const next = new URLSearchParams();
    // Preserve sort + dir (filter changes reset page).
    for (const k of ["sort", "dir"]) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v !== "" && v !== "0") next.set(k, v);
    }
    // No-op: nothing changed vs current URL.
    const curNorm = new URLSearchParams(params);
    curNorm.delete("page");
    if (next.toString() === curNorm.toString()) return;
    go(`/properties?${next.toString()}`);
  }

  const commit = () => navigate({});

  const fmtMoney = (s: string) => {
    const n = Number(s.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n.toLocaleString("en-US") : "";
  };

  return (
    <div className="bg-content1 border border-default-200 rounded-large shadow-sm overflow-hidden">
      {/* Mobile-only toggle header */}
      <button
        type="button"
        onClick={() => setOpenOnMobile((v) => !v)}
        className="md:hidden w-full flex items-center justify-between gap-2 px-3 py-3 text-left border-b border-default-100 hover:bg-default-50 transition-colors"
        aria-expanded={openOnMobile}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <FunnelSimple className="w-4 h-4 text-primary-600" weight="bold" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-semibold rounded-full bg-primary-600 text-white">
              {activeCount}
            </span>
          )}
        </span>
        <CaretDown className={`w-4 h-4 text-default-500 transition-transform ${openOnMobile ? "rotate-180" : ""}`} weight="bold" />
      </button>

      {/* Filter body: hidden on mobile when closed, always shown on md+ */}
      <div className={`${openOnMobile ? "block" : "hidden"} md:block p-3 sm:p-4 space-y-3`}>
        {activeCount > 0 && (
          <div className="flex justify-end md:hidden">
            <Button
              size="sm"
              variant="light"
              color="danger"
              startContent={<X className="w-3 h-3" weight="bold" />}
              onPress={clearAll}
              className="text-tiny"
            >
              Clear all
            </Button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <Input
          size="sm"
          label="Search project"
          placeholder="e.g. Interlace"
          startContent={<MagnifyingGlass className="w-3.5 h-3.5 text-default-400" />}
          value={q}
          onValueChange={setQ}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          type="search"
        />
        <Input
          size="sm"
          label="Max price"
          placeholder="0"
          startContent={<CurrencyDollar className="w-3.5 h-3.5 text-default-400" />}
          value={fmtMoney(max)}
          onValueChange={(v) => setMax(v.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          classNames={{ input: "text-right tabular-nums" }}
          inputMode="numeric"
        />
        <Select
          size="sm"
          label="Zone"
          selectedKeys={defaults.segment ? [defaults.segment] : []}
          onChange={(e) => navigate({ segment: e.target.value })}
        >
          <SelectItem key="">Any</SelectItem>
          <SelectItem key="CCR">CCR</SelectItem>
          <SelectItem key="RCR">RCR</SelectItem>
          <SelectItem key="OCR">OCR</SelectItem>
        </Select>
        <Select
          size="sm"
          label="Tenure"
          selectedKeys={defaults.tenure ? [defaults.tenure] : []}
          onChange={(e) => navigate({ tenure: e.target.value })}
        >
          <SelectItem key="">Any</SelectItem>
          <SelectItem key="freehold">Freehold / 999yr</SelectItem>
          <SelectItem key="leasehold">99-yr leasehold</SelectItem>
        </Select>
        <Select
          size="sm"
          label="Unit type"
          selectedKeys={defaults.type ? [defaults.type] : []}
          onChange={(e) => navigate({ type: e.target.value })}
        >
          <SelectItem key="">Any</SelectItem>
          <SelectItem key="Studio">Studio</SelectItem>
          <SelectItem key="1BR">1BR</SelectItem>
          <SelectItem key="2BR">2BR</SelectItem>
          <SelectItem key="3BR">3BR</SelectItem>
          <SelectItem key="4BR+">4BR+</SelectItem>
        </Select>
        <Input
          size="sm"
          label="Min gross yield (%)"
          placeholder="e.g. 3.5"
          value={minYield}
          onValueChange={setMinYield}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          endContent={<span className="text-xs text-default-400">%</span>}
          inputMode="decimal"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
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
        <Input
          size="sm"
          label="Min CA Score"
          placeholder="e.g. 60"
          value={minCa}
          onValueChange={setMinCa}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          endContent={<span className="text-xs text-default-400">/100</span>}
          inputMode="numeric"
        />
        <div className="flex items-end h-full pb-1">
          <Checkbox
            size="sm"
            isSelected={defaults.positive === "1"}
            onValueChange={(v) => navigate({ positive: v ? "1" : "" })}
          >
            Exclude negative Cash ROI
          </Checkbox>
        </div>
      </div>
      </div>
    </div>
  );
}
