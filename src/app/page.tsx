"use client";

import { useEffect, useMemo, useState } from "react";
import { computeAffordability } from "@/lib/affordability";
import Link from "next/link";
import { PROFILE_COOKIE, DEFAULT_PROFILE } from "@/lib/profileShared";
import MoneyInput from "@/components/MoneyInput";

const fmt = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

export default function Home() {
  const [cash, setCash] = useState(DEFAULT_PROFILE.cash);
  const [cpf, setCpf] = useState(DEFAULT_PROFILE.cpf);
  const [age, setAge] = useState(DEFAULT_PROFILE.age);
  const [rate, setRate] = useState(DEFAULT_PROFILE.rate);
  const [includeTax, setIncludeTax] = useState(DEFAULT_PROFILE.includeTax);
  const [taxRate, setTaxRate] = useState(DEFAULT_PROFILE.taxRate);
  const [vacancyMonths, setVacancyMonths] = useState(DEFAULT_PROFILE.vacancyMonths);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`${PROFILE_COOKIE}=([^;]+)`));
    if (m) {
      try {
        const p = JSON.parse(decodeURIComponent(m[1]));
        if (typeof p.cash === "number") setCash(p.cash);
        if (typeof p.cpf === "number") setCpf(p.cpf);
        if (typeof p.age === "number") setAge(p.age);
        if (typeof p.rate === "number") setRate(p.rate);
        if (typeof p.includeTax === "boolean") setIncludeTax(p.includeTax);
        if (typeof p.taxRate === "number") setTaxRate(p.taxRate);
        if (typeof p.vacancyMonths === "number") setVacancyMonths(p.vacancyMonths);
      } catch {}
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload = encodeURIComponent(
      JSON.stringify({ cash, cpf, age, rate, includeTax, taxRate, vacancyMonths })
    );
    document.cookie = `${PROFILE_COOKIE}=${payload}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [hydrated, cash, cpf, age, rate, includeTax, taxRate, vacancyMonths]);

  const result = useMemo(
    () => computeAffordability({ cash, cpf, age, annualRatePct: rate }),
    [cash, cpf, age, rate]
  );

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-semibold">SG Property Investment Finder</h1>
      <p className="text-sm text-gray-600">
        Enter your funds to see the property price range you can afford (private residential, first loan).
      </p>

      <section className="grid grid-cols-2 gap-4">
        <MoneyField label="Cash" value={cash} onChange={setCash} />
        <MoneyField label="CPF OA" value={cpf} onChange={setCpf} />
        <Field label="Age" value={age} onChange={setAge} />
        <Field label="Loan rate (% p.a.)" value={rate} onChange={setRate} step={0.1} />
      </section>

      <details
        className="border rounded-lg bg-white"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
          Advanced assumptions
          <span className="ml-2 text-xs text-gray-500 font-normal">
            (tax: {includeTax ? `${taxRate}%` : "off"} · vacancy: {vacancyMonths} mo/yr)
          </span>
        </summary>
        <div className="px-4 pb-4 pt-2 space-y-4 border-t">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={includeTax}
              onChange={(e) => setIncludeTax(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Apply rental income tax in analysis</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Effective rental tax rate (%)"
              value={taxRate}
              onChange={setTaxRate}
              step={1}
              disabled={!includeTax}
            />
            <Field
              label="Vacancy (months / year)"
              value={vacancyMonths}
              onChange={setVacancyMonths}
              step={0.5}
            />
          </div>
          <p className="text-xs text-gray-500">
            These defaults flow into every property&apos;s investment analysis. You can still override them per-property.
          </p>
        </div>
      </details>

      <section className="border rounded-lg p-6 space-y-3 bg-gray-50">
        <h2 className="text-xl font-semibold">Affordability</h2>
        <Row label="Loan tenure" value={`${result.tenureYears} years`} />
        <Row label="Max property price" value={fmt(result.maxPrice)} emphasize />
        <Row label="Downpayment (25%)" value={fmt(result.downpayment)} />
        <Row label="  – Cash (5%)" value={fmt(result.cashRequired)} />
        <Row label="  – CPF (20%)" value={fmt(result.cpfRequired)} />
        <Row label="Max loan (75%)" value={fmt(result.maxLoan)} />
        <Row label="Monthly instalment" value={fmt(result.monthlyInstalment)} />
        {result.notes.map((n, i) => (
          <p key={i} className="text-xs text-amber-700">{n}</p>
        ))}
      </section>

      <Link
        href={`/properties?max=${Math.round(result.maxPrice)}&min=${Math.round(result.minPrice)}`}
        className="inline-block bg-black text-white px-6 py-3 rounded-lg"
      >
        Find properties in this range →
      </Link>
    </main>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-700">{label}</span>
      <MoneyInput value={value} onChange={onChange} />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${disabled ? "opacity-50" : ""}`}>
      <span className="text-gray-700">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="border rounded px-3 py-2 disabled:bg-gray-100"
      />
    </label>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={emphasize ? "font-semibold text-lg" : ""}>{value}</span>
    </div>
  );
}
