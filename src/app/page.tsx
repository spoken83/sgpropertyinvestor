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
          <Row label="Downpayment (25%)" value={fmt(result.downpayment)} />
          <Row label="  – Cash (5%)" value={fmt(result.cashRequired)} />
          <Row label="  – CPF (20%)" value={fmt(result.cpfRequired)} />
          <Row label="Max loan (75%)" value={fmt(result.maxLoan)} />
          <Row label="Monthly instalment" value={fmt(result.monthlyInstalment)} />
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
