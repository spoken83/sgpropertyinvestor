"use client";

import { useEffect, useMemo, useState } from "react";
import { computeRoi } from "@/lib/roi";
import { PROFILE_COOKIE, DEFAULT_PROFILE } from "@/lib/profileShared";
import MoneyInput from "@/components/MoneyInput";

const fmt = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

type Props = {
  price: number;
  monthlyRent: number;
  sqft: number;
  segment: "CCR" | "RCR" | "OCR" | null;
  tenure: string | null;
  propertyType?: string | null;
  initialIncludeTdsr?: boolean;
  initialSalary?: number;
  initialMonthlyDebts?: number;
  initialTdsrPct?: number;
  initialStressRate?: number;
};

function pmtCalc(principal: number, monthlyRate: number, n: number) {
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

export default function RoiCalculator(p: Props) {
  const [cash, setCash] = useState(DEFAULT_PROFILE.cash);
  const [cpf, setCpf] = useState(DEFAULT_PROFILE.cpf);
  const [age, setAge] = useState(DEFAULT_PROFILE.age);
  const [rate, setRate] = useState(DEFAULT_PROFILE.rate);
  const [cashDown, setCashDown] = useState<number | null>(null);
  const [vacancy, setVacancy] = useState(DEFAULT_PROFILE.vacancyMonths);
  const [includeTax, setIncludeTax] = useState(DEFAULT_PROFILE.includeTax);
  const [incomeTax, setIncomeTax] = useState(DEFAULT_PROFILE.taxRate);
  const [includeTdsr, setIncludeTdsr] = useState(p.initialIncludeTdsr ?? DEFAULT_PROFILE.includeTdsr);
  const [salary, setSalary] = useState(p.initialSalary ?? DEFAULT_PROFILE.salary);
  const [monthlyDebts, setMonthlyDebts] = useState(p.initialMonthlyDebts ?? DEFAULT_PROFILE.monthlyDebts);
  const [tdsrPct, setTdsrPct] = useState(p.initialTdsrPct ?? DEFAULT_PROFILE.tdsrPct);
  const [stressRate, setStressRate] = useState(p.initialStressRate ?? DEFAULT_PROFILE.stressRate);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`${PROFILE_COOKIE}=([^;]+)`));
    if (m) {
      try {
        const pr = JSON.parse(decodeURIComponent(m[1]));
        if (typeof pr.cash === "number") setCash(pr.cash);
        if (typeof pr.cpf === "number") setCpf(pr.cpf);
        if (typeof pr.age === "number") setAge(pr.age);
        if (typeof pr.rate === "number") setRate(pr.rate);
        if (typeof pr.vacancyMonths === "number") setVacancy(pr.vacancyMonths);
        if (typeof pr.includeTax === "boolean") setIncludeTax(pr.includeTax);
        if (typeof pr.taxRate === "number") setIncomeTax(pr.taxRate);
        if (typeof pr.includeTdsr === "boolean") setIncludeTdsr(pr.includeTdsr);
        if (typeof pr.salary === "number") setSalary(pr.salary);
        if (typeof pr.monthlyDebts === "number") setMonthlyDebts(pr.monthlyDebts);
        if (typeof pr.tdsrPct === "number") setTdsrPct(pr.tdsrPct);
        if (typeof pr.stressRate === "number") setStressRate(pr.stressRate);
      } catch {}
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload = encodeURIComponent(
      JSON.stringify({ cash, cpf, age, rate, includeTax, taxRate: incomeTax, vacancyMonths: vacancy, includeTdsr, salary, monthlyDebts, tdsrPct, stressRate })
    );
    document.cookie = `${PROFILE_COOKIE}=${payload}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [hydrated, cash, cpf, age, rate, includeTax, incomeTax, vacancy, includeTdsr, salary, monthlyDebts, tdsrPct, stressRate]);

  // Min cash down = max(5% floor, gap to reach 25% if CPF is insufficient)
  const minDownpayment = p.price * 0.25;
  const cashFloor = p.price * 0.05;
  const minCashDown = Math.max(cashFloor, minDownpayment - Math.min(cpf, p.price));
  const maxCashDown = Math.min(cash, p.price);

  const effectiveCashDown = cashDown == null
    ? minCashDown
    : Math.max(minCashDown, Math.min(maxCashDown, cashDown));
  const extraCash = Math.max(0, effectiveCashDown - cashFloor);

  const roi = useMemo(
    () =>
      computeRoi({
        price: p.price,
        monthlyRent: p.monthlyRent,
        sqft: p.sqft,
        segment: p.segment,
        tenure: p.tenure,
        propertyType: p.propertyType,
        cash,
        cpf,
        age,
        loanRatePct: rate,
        extraCashDownpayment: extraCash,
        vacancyMonthsPerYear: vacancy,
        rentalIncomeTaxPct: includeTax ? incomeTax : 0,
      }),
    [p, cash, cpf, age, rate, extraCash, vacancy, includeTax, incomeTax]
  );

  // TDSR check: does the current instalment exceed what the bank allows?
  const tdsrCheck = useMemo(() => {
    if (!includeTdsr) return null;
    const tdsrCeiling = salary * (tdsrPct / 100);
    const available = Math.max(0, tdsrCeiling - monthlyDebts);
    // Banks assess at stress rate
    const stressMonthly = stressRate / 100 / 12;
    const tenureYears = Math.max(0, Math.min(30, 65 - age));
    const nMonths = tenureYears * 12;
    // Instalment at stress rate for current loan
    const instalmentAtStress = nMonths > 0
      ? pmtCalc(roi.loan, stressMonthly, nMonths)
      : 0;
    const exceeded = instalmentAtStress > available;
    // Minimum cash down to bring instalment within TDSR: solve for loan
    // where PMT(loan, stressRate, tenure) = available.
    // maxLoanTdsr = PV(available, stressMonthly, nMonths)
    let minCashForTdsr: number | null = null;
    if (exceeded && nMonths > 0) {
      const maxLoanTdsr = stressMonthly > 0
        ? available * (1 - Math.pow(1 + stressMonthly, -nMonths)) / stressMonthly
        : available * nMonths;
      const minLoanReduction = roi.loan - maxLoanTdsr;
      if (minLoanReduction > 0) {
        // This much extra cash is needed beyond current effective down
        minCashForTdsr = Math.max(0, minLoanReduction);
      }
    }
    return {
      tdsrCeiling,
      available,
      instalmentAtStress,
      exceeded,
      minCashForTdsr,
      stressRateUsed: stressRate,
    };
  }, [includeTdsr, salary, monthlyDebts, tdsrPct, stressRate, age, roi.loan]);

  return (
    <section className="border rounded-lg p-6 space-y-4 bg-gray-50">
      <h2 className="text-xl font-semibold">Investment analysis</h2>
      <p className="text-xs text-gray-500">
        Uses median price {fmt(p.price)} and median rent {fmt(p.monthlyRent)}. Adjust buyer profile below.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <MoneyField label="Cash on hand" value={cash} set={(n) => { setCash(n); setCashDown(null); }} />
        <MoneyField label="CPF OA" value={cpf} set={(n) => { setCpf(n); setCashDown(null); }} />
        <Num label="Age" value={age} set={setAge} />
        <Num label="Rate %" value={rate} set={setRate} step={0.1} />
        <Num label="Vacancy (mo)" value={vacancy} set={setVacancy} step={0.5} />
        <Num label="Income tax %" value={incomeTax} set={setIncomeTax} step={1} />
      </div>

      <div className="bg-white border rounded p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <label className="text-sm font-medium">How much of your cash goes to downpayment?</label>
          <div className="flex gap-1">
            <QuickSet label="Min" onPress={() => setCashDown(null)} />
            <QuickSet
              label="50%"
              onPress={() => setCashDown(minCashDown + (maxCashDown - minCashDown) * 0.5)}
            />
            <QuickSet label="100%" onPress={() => setCashDown(maxCashDown)} />
          </div>
        </div>
        <input
          type="range"
          min={minCashDown}
          max={maxCashDown}
          step={1000}
          value={effectiveCashDown}
          onChange={(e) => setCashDown(Number(e.target.value))}
          className="w-full"
          disabled={maxCashDown <= minCashDown}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Min {fmt(minCashDown)}<span className="text-gray-400"> · keep {fmt(cash - minCashDown)} liquid</span></span>
          <span>All {fmt(maxCashDown)}<span className="text-gray-400"> · keep $0 liquid</span></span>
        </div>
        <div className="text-sm pt-2 border-t">
          <span className="text-gray-600">Downpayment from cash: </span>
          <span className="font-semibold">{fmt(effectiveCashDown)}</span>
          <span className="text-gray-500"> · kept liquid: </span>
          <span className="font-semibold text-green-700">{fmt(Math.max(0, cash - effectiveCashDown))}</span>
        </div>
      </div>
      {!roi.affordable && roi.affordabilityNote && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          Not affordable: {roi.affordabilityNote}
        </div>
      )}
      {tdsrCheck && tdsrCheck.exceeded && (
        <div className="text-xs border border-red-200 rounded p-3 bg-red-50 text-red-800 space-y-2">
          <div className="font-semibold flex items-center gap-1.5">
            <span className="text-red-600 text-sm">&#9888;</span>
            This property exceeds your TDSR limit
          </div>
          <div className="text-red-700">
            Your monthly instalment would be {fmt(tdsrCheck.instalmentAtStress)}, but the bank only allows up to {fmt(tdsrCheck.available)} based on your salary and existing debts.
          </div>
          {tdsrCheck.minCashForTdsr != null && tdsrCheck.minCashForTdsr + effectiveCashDown <= cash && (
            <div className="flex items-center gap-2 pt-1 border-t border-red-200">
              <span>Deploy more cash to reduce the loan:</span>
              <button
                type="button"
                className="font-semibold text-red-800 underline"
                onClick={() => setCashDown(effectiveCashDown + tdsrCheck.minCashForTdsr!)}
              >
                Set cash to {fmt(effectiveCashDown + tdsrCheck.minCashForTdsr)}
              </button>
            </div>
          )}
          {tdsrCheck.minCashForTdsr != null && tdsrCheck.minCashForTdsr + effectiveCashDown > cash && (
            <div className="pt-1 border-t border-red-200 font-medium">
              You would need {fmt(tdsrCheck.minCashForTdsr)} more cash than your current downpayment to afford this property within TDSR.
            </div>
          )}
        </div>
      )}
      {tdsrCheck && !tdsrCheck.exceeded && (
        <div className="text-xs border border-green-200 rounded p-3 bg-green-50 text-green-800">
          <span className="font-semibold">&#10003; TDSR OK</span> — instalment {fmt(tdsrCheck.instalmentAtStress)} is within your {fmt(tdsrCheck.available)}/mo limit.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row label={`Loan / tenure (${roi.ltvPct.toFixed(0)}% LTV)`} value={`${fmt(roi.loan)} · ${roi.tenureYears}y`} />
        <Row label="Monthly instalment" value={fmt(roi.monthlyInstalment)} emphasize />
        <Row label="Cash used" value={fmt(roi.cashUsed)} />
        <Row label="CPF used" value={fmt(roi.cpfUsed)} />
        <Row label="Cash kept on hand" value={fmt(roi.cashOnHand)} tone={roi.cashOnHand > 0 ? "good" : undefined} />

        <Divider label="Annual P&L" />

        <Row label="Gross rent" value={fmt(roi.annualGrossRent)} />
        <Row label="− Vacancy" value={`−${fmt(roi.vacancyLossAnnual)}`} />
        <Row label="− MCST (est)" value={`−${fmt(roi.mcstAnnual)}`} />
        <Row label="− Property tax (~12% AV)" value={`−${fmt(roi.propertyTaxAnnual)}`} />
        <Row label="− Maintenance (2%)" value={`−${fmt(roi.maintenanceAnnual)}`} />
        <Row label="− Income tax (rental)" value={`−${fmt(roi.incomeTaxAnnual)}`} />
        <Row label="Net rental income" value={fmt(roi.annualNetRent)} emphasize />
        <Row label="− Mortgage repayment" value={`−${fmt(roi.annualDebtService)}`} tip="Annual loan repayment (principal + interest) = 12 × monthly instalment." />
        <Row
          label="Annual cash flow"
          value={fmt(roi.annualCashFlow)}
          emphasize
          tone={roi.annualCashFlow >= 0 ? "good" : "bad"}
        />

        <Divider label="Returns" />

        <Row
          label="Gross yield"
          value={`${roi.grossYieldPct.toFixed(2)}%`}
          tip="Annual rent ÷ price. Ignores all costs and financing."
        />
        <Row
          label="Net yield"
          value={`${roi.netYieldPct.toFixed(2)}%`}
          emphasize
          tip="(Annual rent − vacancy − MCST − property tax − maintenance − income tax) ÷ price."
        />
        <Row
          label="Cash-on-cash ROI"
          value={`${roi.cashOnCashPct.toFixed(2)}%`}
          tone={roi.cashOnCashPct >= 0 ? "good" : "bad"}
          tip="Annual cash flow ÷ cash you put down. The return on your own cash; CPF doesn't count here."
        />
        {tdsrCheck && (
          <Row
            label={`TDSR instalment (${tdsrCheck.stressRateUsed}%)`}
            value={`${fmt(tdsrCheck.instalmentAtStress)} / ${fmt(tdsrCheck.available)}`}
            tone={tdsrCheck.exceeded ? "bad" : "good"}
            tip="Monthly instalment at bank stress-test rate vs your available TDSR headroom. Must be within limit for bank approval."
          />
        )}
      </div>
    </section>
  );
}

function MoneyField({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-gray-600">{label}</span>
      <MoneyInput value={value} onChange={set} />
    </label>
  );
}

function QuickSet({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="px-2 py-1 text-tiny font-medium text-default-600 hover:text-foreground hover:bg-default-100 rounded-md border border-default-200 transition-colors"
    >
      {label}
    </button>
  );
}

function Num({ label, value, set, step = 1 }: { label: string; value: number; set: (n: number) => void; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-gray-600">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="border rounded px-2 py-1 text-sm bg-white"
      />
    </label>
  );
}

function Row({
  label,
  value,
  emphasize,
  tone,
  tip,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "good" | "bad";
  tip?: string;
}) {
  const color = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="flex justify-between">
      <span className="text-gray-600 flex items-center gap-1">
        {label}
        {tip && (
          <span
            title={tip}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] text-gray-500 cursor-help"
          >
            ?
          </span>
        )}
      </span>
      <span className={`${emphasize ? "font-semibold" : ""} ${color}`}>{value}</span>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="md:col-span-2 border-b pb-1 pt-2 text-xs uppercase tracking-wider text-gray-500">
      {label}
    </div>
  );
}
