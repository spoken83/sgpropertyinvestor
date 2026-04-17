"use client";

import { useEffect, useMemo, useState } from "react";
import { computeAffordability } from "@/lib/affordability";
import { PROFILE_COOKIE, DEFAULT_PROFILE } from "@/lib/profileShared";
import MoneyInput from "@/components/MoneyInput";
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Input,
} from "@heroui/react";
import { Buildings, Wallet } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";

const fmt = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

export default function Home() {
  const router = useRouter();
  const [cash, setCash] = useState(DEFAULT_PROFILE.cash);
  const [cpf, setCpf] = useState(DEFAULT_PROFILE.cpf);
  const [age, setAge] = useState(DEFAULT_PROFILE.age);
  const [rate, setRate] = useState(DEFAULT_PROFILE.rate);
  const [includeTax, setIncludeTax] = useState(DEFAULT_PROFILE.includeTax);
  const [taxRate, setTaxRate] = useState(DEFAULT_PROFILE.taxRate);
  const [vacancyMonths, setVacancyMonths] = useState(DEFAULT_PROFILE.vacancyMonths);
  const [includeTdsr, setIncludeTdsr] = useState(DEFAULT_PROFILE.includeTdsr);
  const [salary, setSalary] = useState(DEFAULT_PROFILE.salary);
  const [monthlyDebts, setMonthlyDebts] = useState(DEFAULT_PROFILE.monthlyDebts);
  const [tdsrPct, setTdsrPct] = useState(DEFAULT_PROFILE.tdsrPct);
  const [stressRate, setStressRate] = useState(DEFAULT_PROFILE.stressRate);
  const [extraCashDown, setExtraCashDown] = useState(0);

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
        if (typeof p.includeTdsr === "boolean") setIncludeTdsr(p.includeTdsr);
        if (typeof p.salary === "number") setSalary(p.salary);
        if (typeof p.monthlyDebts === "number") setMonthlyDebts(p.monthlyDebts);
        if (typeof p.tdsrPct === "number") setTdsrPct(p.tdsrPct);
        if (typeof p.stressRate === "number") setStressRate(p.stressRate);
      } catch {}
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload = encodeURIComponent(
      JSON.stringify({ cash, cpf, age, rate, includeTax, taxRate, vacancyMonths, includeTdsr, salary, monthlyDebts, tdsrPct, stressRate })
    );
    document.cookie = `${PROFILE_COOKIE}=${payload}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [hydrated, cash, cpf, age, rate, includeTax, taxRate, vacancyMonths, includeTdsr, salary, monthlyDebts, tdsrPct, stressRate]);

  // Max useful extra cash: the point where deploying more cash starts reducing
  // the max price (because the 5% cash floor eats into remaining cash faster
  // than the loan shrinks). Solve analytically per binding constraint.
  //
  // When TDSR binding: maxExtra = (19*cash − maxLoanTdsr − cpf) / 20
  //   derived from: cashFloor + extra = cash AND price = (tdsr + extra + cpf) / 0.95
  // When LTV binding:  maxExtra = (4*cash − cpf) / 5
  //   derived from: cashFloor + extra = cash AND price = (extra + cpf) / 0.20
  const tdsrCeilingCalc = includeTdsr ? salary * (tdsrPct / 100) : 0;
  const tdsrAvailCalc = Math.max(0, tdsrCeilingCalc - monthlyDebts);
  const stressM = stressRate / 100 / 12;
  const tenureCalc = Math.max(0, Math.min(30, 65 - age));
  const nCalc = tenureCalc * 12;
  const maxLoanTdsrCalc = nCalc > 0 && stressM > 0
    ? tdsrAvailCalc * (1 - Math.pow(1 + stressM, -nCalc)) / stressM
    : tdsrAvailCalc * nCalc;
  // When TDSR is active and binding, the optimal max extra cash is where
  // cashFloor meets the TDSR constraint. When TDSR is off (or not binding),
  // it's where cashFloor meets the LTV constraint.
  const optimalExtraTdsr = Math.max(0, (19 * cash - maxLoanTdsrCalc - cpf) / 20);
  const optimalExtraLtv = Math.max(0, (4 * cash - cpf) / 5);
  // Use TDSR formula when TDSR is active and tighter than LTV at zero extra cash.
  const tdsrTighter = includeTdsr && (maxLoanTdsrCalc + cpf) / 0.95 < cpf / 0.20;
  const maxExtraCash = Math.max(0, Math.min(
    tdsrTighter ? optimalExtraTdsr : optimalExtraLtv,
    cash * 0.95
  ));
  const effectiveExtra = Math.min(extraCashDown, maxExtraCash);

  const result = useMemo(
    () => computeAffordability({
      cash, cpf, age, annualRatePct: rate,
      extraCashDown: effectiveExtra,
      includeTdsr, salary, monthlyDebts, tdsrPct, stressRate,
    }),
    [cash, cpf, age, rate, effectiveExtra, includeTdsr, salary, monthlyDebts, tdsrPct, stressRate]
  );

  const go = () =>
    router.push(`/properties?max=${Math.round(result.maxPrice)}`);

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-tiny text-primary-600 uppercase tracking-wider font-semibold">
          <Buildings className="w-3.5 h-3.5" weight="duotone" />
          Singapore Residential · Investment Finder
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Find your next property investment</h1>
        <p className="text-default-600">
          Enter your funds to see the property price range you can afford (private residential, first loan).
        </p>
      </div>

      <Card shadow="sm" className="border border-default-200">
        <CardHeader className="flex gap-2 items-center">
          <Wallet className="w-5 h-5 text-primary-600" weight="duotone" />
          <div className="font-semibold">Your funds</div>
        </CardHeader>
        <CardBody className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <MoneyInput value={cash} onChange={setCash} label="Cash" />
            <MoneyInput value={cpf} onChange={setCpf} label="CPF OA" />
            <Input
              size="md"
              type="number"
              label="Age"
              value={String(age)}
              onValueChange={(v) => setAge(Number(v))}
            />
            <Input
              size="md"
              type="number"
              label="Loan rate (% p.a.)"
              step={0.1}
              value={String(rate)}
              onValueChange={(v) => setRate(Number(v))}
              endContent={<span className="text-tiny text-default-400">%</span>}
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-default-100">
            <Checkbox isSelected={includeTdsr} onValueChange={setIncludeTdsr}>
              <span className="text-sm font-medium">Include TDSR constraint</span>
              <span className="text-tiny text-default-500 ml-1">(income-based loan cap)</span>
            </Checkbox>
            {includeTdsr && (
              <div className="grid grid-cols-2 gap-4">
                <MoneyInput value={salary} onChange={setSalary} label="Monthly gross salary" />
                <MoneyInput value={monthlyDebts} onChange={setMonthlyDebts} label="Existing monthly debts" />
                <Input
                  size="md"
                  type="number"
                  label="TDSR ceiling"
                  step={1}
                  value={String(tdsrPct)}
                  onValueChange={(v) => setTdsrPct(Number(v))}
                  endContent={<span className="text-tiny text-default-400">%</span>}
                />
                <Input
                  size="md"
                  type="number"
                  label="Bank stress-test rate"
                  step={0.1}
                  value={String(stressRate)}
                  onValueChange={(v) => setStressRate(Number(v))}
                  endContent={<span className="text-tiny text-default-400">% p.a.</span>}
                />
              </div>
            )}
          </div>

          <Accordion
            variant="light"
            className="px-0"
            itemClasses={{
              title: "text-sm font-medium",
              subtitle: "text-tiny text-default-500",
            }}
          >
            <AccordionItem
              key="adv"
              aria-label="Advanced"
              title="Advanced assumptions"
              subtitle={`tax: ${includeTax ? `${taxRate}%` : "off"} · vacancy: ${vacancyMonths} mo/yr`}
            >
              <div className="space-y-4 pb-2">
                <Checkbox isSelected={includeTax} onValueChange={setIncludeTax}>
                  Apply rental income tax in analysis
                </Checkbox>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    size="sm"
                    type="number"
                    label="Effective rental tax rate"
                    value={String(taxRate)}
                    onValueChange={(v) => setTaxRate(Number(v))}
                    isDisabled={!includeTax}
                    endContent={<span className="text-tiny text-default-400">%</span>}
                  />
                  <Input
                    size="sm"
                    type="number"
                    label="Vacancy"
                    step={0.5}
                    value={String(vacancyMonths)}
                    onValueChange={(v) => setVacancyMonths(Number(v))}
                    endContent={<span className="text-tiny text-default-400">mo/yr</span>}
                  />
                </div>
                <p className="text-tiny text-default-500">
                  These defaults flow into every property&apos;s investment analysis. You can still override them per-property.
                </p>
              </div>
            </AccordionItem>
          </Accordion>
        </CardBody>
      </Card>

      <Card shadow="sm" className="border border-default-200">
        <CardHeader className="font-semibold">Affordability</CardHeader>
        <CardBody className="gap-2">
          <Row label="Loan tenure" value={`${result.tenureYears} years`} />
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-default-600">Max property price</span>
            <span className="font-bold text-2xl text-primary-700 tabular-nums">{fmt(result.maxPrice)}</span>
          </div>
          {result.tdsrBinding && (
            <div className="flex justify-between text-sm">
              <span className="text-default-400">Max price (LTV only, without TDSR)</span>
              <span className="tabular-nums text-default-400 line-through">{fmt(result.maxPriceLtvOnly)}</span>
            </div>
          )}

          {/* Cash deployment slider */}
          <div className="bg-default-50 border border-default-200 rounded-lg p-4 space-y-2 mt-1">
            <div className="flex items-baseline justify-between gap-3">
              <label className="text-sm font-medium">Cash to deploy as downpayment</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setExtraCashDown(0)}
                  className="px-2 py-1 text-tiny font-medium text-default-600 hover:text-foreground hover:bg-default-100 rounded-md border border-default-200 transition-colors">
                  Min
                </button>
                <button type="button" onClick={() => setExtraCashDown(Math.round(maxExtraCash / 2))}
                  className="px-2 py-1 text-tiny font-medium text-default-600 hover:text-foreground hover:bg-default-100 rounded-md border border-default-200 transition-colors">
                  50%
                </button>
                <button type="button" onClick={() => setExtraCashDown(maxExtraCash)}
                  className="px-2 py-1 text-tiny font-medium text-default-600 hover:text-foreground hover:bg-default-100 rounded-md border border-default-200 transition-colors">
                  Max
                </button>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={maxExtraCash}
              step={1000}
              value={effectiveExtra}
              onChange={(e) => setExtraCashDown(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-default-500">
              <span>Min {fmt(result.maxPrice * 0.05)} (5% only)</span>
              <span>All {fmt(cash)}</span>
            </div>
            <div className="flex justify-between text-sm pt-1 border-t border-default-100">
              <span className="text-default-600">Cash used</span>
              <span className="font-semibold tabular-nums">{fmt(result.cashRequired)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-default-600">Cash kept liquid</span>
              <span className="font-semibold text-green-700 tabular-nums">{fmt(result.cashKeptLiquid)}</span>
            </div>
          </div>

          <Row label="Downpayment (cash + CPF)" value={fmt(result.downpayment)} />
          <Row label="  – CPF deployed" value={fmt(result.cpfRequired)} />
          <Row label="Loan needed" value={fmt(result.maxLoan)} />
          <Row label="Monthly instalment" value={fmt(result.monthlyInstalment)} />
          {result.tdsrActive && (
            <>
              <div className="border-t border-default-100 pt-2 mt-1" />
              <Row label={`TDSR ceiling (${result.stressRateUsed}% stress)`} value={fmt(result.tdsrCeiling)} />
              <Row label="Available for mortgage" value={fmt(result.tdsrAvailable)} />
              <Row label="Max loan (TDSR allows)" value={fmt(result.maxLoanTdsr)} />
            </>
          )}
          {result.notes.map((n, i) => (
            <p key={i} className="text-tiny text-warning-600 mt-1">{n}</p>
          ))}
        </CardBody>
      </Card>

      <div className="pt-2 space-y-2">
        <Button
          color="primary"
          size="lg"
          fullWidth
          onPress={go}
          className="font-semibold text-base h-14"
        >
          Find my best ROI matches
        </Button>
        <p className="text-tiny text-default-500 text-center">
          Every private condo ranked by gross yield, Cash ROI, rental activity and more — split per unit type to surface hidden gems.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-default-600">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
