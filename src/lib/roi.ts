// Per-property ROI for investment buyers.
// Inputs come from the affordability page + the chosen property's medians.
// All money in SGD, monthly unless stated.

import { estimateMcstMonthly } from "./mcst";

export type RoiInput = {
  price: number;
  monthlyRent: number;
  sqft: number;
  segment: "CCR" | "RCR" | "OCR" | null | undefined;
  tenure?: string | null;
  propertyType?: string | null;
  totalUnits?: number | null;
  completionYear?: number | null;

  // Buyer profile
  cash: number;
  cpf: number;
  age: number;
  loanRatePct: number;               // annual %
  extraCashDownpayment?: number;     // cash beyond 5% floor committed to downpayment (default 0)
  vacancyMonthsPerYear?: number;     // default 1 (~8% vacancy)
  rentalIncomeTaxPct?: number;       // default 15% effective on net rental income
  maintenanceBufferPct?: number;     // default 2% of annual rent for wear & repairs
};

export type RoiResult = {
  // capital
  downpayment: number;
  cashUsed: number;
  cpfUsed: number;
  cashOnHand: number;         // total cash − cash committed
  loan: number;
  ltvPct: number;             // actual LTV achieved
  tenureYears: number;
  monthlyInstalment: number;
  affordable: boolean;
  affordabilityNote?: string;

  // income & outgoings (annual)
  annualGrossRent: number;
  mcstAnnual: number;
  propertyTaxAnnual: number;  // non-owner-occupier 12% of AV (we approximate AV as annual rent)
  maintenanceAnnual: number;
  vacancyLossAnnual: number;
  incomeTaxAnnual: number;

  annualNetRent: number;
  annualDebtService: number;
  annualCashFlow: number;         // net rent − debt service (pre-tax)
  monthlyCashFlow: number;

  grossYieldPct: number;
  netYieldPct: number;            // net rent / price
  cashOnCashPct: number;          // annualCashFlow / cashUsed
  breakEvenMonths: number | null; // cash invested / monthly cashflow (null if negative)
};

const pmt = (p: number, r: number, n: number) =>
  r === 0 ? p / n : (p * r) / (1 - Math.pow(1 + r, -n));

export function computeRoi(input: RoiInput): RoiResult {
  const tenureYears = Math.max(0, Math.min(30, 65 - input.age));
  const { price } = input;
  const extraCash = Math.max(0, input.extraCashDownpayment ?? 0);

  // Regulatory constraints (first private residential loan):
  //   - Min 5% cash floor
  //   - Max 75% LTV
  // Policy: always max CPF. Cash commits the 5% floor + any user-chosen extra.
  const cashFloor = price * 0.05;
  const maxLoan = price * 0.75;
  const minDownpayment = price * 0.25;

  // Max CPF: use everything available, up to what's needed to cover (price − cash committed).
  // Start by assuming cash = floor + extra. If that + CPF doesn't hit 25%, cash has to top up.
  let cashUsed = cashFloor + extraCash;
  let cpfUsed = Math.min(input.cpf, Math.max(0, price - cashUsed));

  // If CPF too thin to meet 25% downpayment, force cash to top up past the 5% floor.
  if (cashUsed + cpfUsed < minDownpayment) {
    cashUsed = minDownpayment - cpfUsed;
  }

  // Can't spend more cash than the user has.
  const cashShortfall = Math.max(0, cashUsed - input.cash);
  const cashCapped = Math.min(cashUsed, input.cash);
  // If capped, CPF fills any remaining gap up to its balance.
  if (cashCapped < cashUsed) {
    cpfUsed = Math.min(input.cpf, price - cashCapped - (maxLoan)); // at least the 25% floor
    cpfUsed = Math.max(cpfUsed, minDownpayment - cashCapped);
    cpfUsed = Math.min(cpfUsed, input.cpf);
  }
  cashUsed = cashCapped;

  let loan = Math.max(0, price - cashUsed - cpfUsed);
  // Loan must not exceed 75% LTV (regulatory); if it would, user doesn't have enough total funds.
  let affordable = true;
  let affordabilityNote: string | undefined;
  if (loan > maxLoan + 0.5) {
    affordable = false;
    affordabilityNote = `Total funds short. Need ${Math.round(minDownpayment).toLocaleString()} down, have ${Math.round(cashUsed + cpfUsed).toLocaleString()}.`;
    loan = maxLoan; // clamp for downstream math so UI doesn't blow up
  } else if (cashShortfall > 0) {
    affordable = false;
    affordabilityNote = `Short by $${Math.round(cashShortfall).toLocaleString()} cash (min 5% floor).`;
  } else if (input.cash < cashFloor) {
    affordable = false;
    affordabilityNote = `Need at least $${Math.round(cashFloor).toLocaleString()} cash (5% floor).`;
  }

  const downpayment = cashUsed + cpfUsed;
  const cashOnHand = Math.max(0, input.cash - cashUsed);
  const ltvPct = (loan / price) * 100;

  const monthlyInstalment =
    tenureYears > 0 && loan > 0 ? pmt(loan, input.loanRatePct / 100 / 12, tenureYears * 12) : 0;
  const annualDebtService = monthlyInstalment * 12;

  const annualGrossRent = input.monthlyRent * 12;

  const vacancyMonths = input.vacancyMonthsPerYear ?? 1;
  const vacancyLossAnnual = input.monthlyRent * vacancyMonths;
  const mcstAnnual =
    estimateMcstMonthly({
      sqft: input.sqft,
      segment: input.segment,
      tenure: input.tenure,
      propertyType: input.propertyType,
      completionYear: input.completionYear,
      totalUnits: input.totalUnits,
    }) * 12;

  // SG property tax for non-owner-occupied: progressive on Annual Value.
  // Approx AV = annual market rent (IRAS's own rule of thumb).
  // Use a blended ~12% effective rate for investment properties (conservative).
  const propertyTaxAnnual = annualGrossRent * 0.12;

  const maintenancePct = input.maintenanceBufferPct ?? 2;
  const maintenanceAnnual = annualGrossRent * (maintenancePct / 100);

  // Rental income is taxable. Effective rate ~15% on net (after deductible expenses)
  // for most investors at mid brackets. User-adjustable.
  const incomeTaxPct = input.rentalIncomeTaxPct ?? 15;
  const netBeforeTax =
    annualGrossRent - vacancyLossAnnual - mcstAnnual - propertyTaxAnnual - maintenanceAnnual;
  const incomeTaxAnnual = Math.max(0, netBeforeTax) * (incomeTaxPct / 100);

  const annualNetRent = netBeforeTax - incomeTaxAnnual;
  const annualCashFlow = annualNetRent - annualDebtService;
  const monthlyCashFlow = annualCashFlow / 12;

  const grossYieldPct = (annualGrossRent / input.price) * 100;
  const netYieldPct = (annualNetRent / input.price) * 100;
  const cashOnCashPct = cashUsed > 0 ? (annualCashFlow / cashUsed) * 100 : 0;
  const breakEvenMonths =
    monthlyCashFlow > 0 ? Math.round(cashUsed / monthlyCashFlow) : null;

  return {
    downpayment,
    cashUsed,
    cpfUsed,
    cashOnHand,
    loan,
    ltvPct,
    tenureYears,
    monthlyInstalment,
    affordable,
    affordabilityNote,
    annualGrossRent,
    mcstAnnual,
    propertyTaxAnnual,
    maintenanceAnnual,
    vacancyLossAnnual,
    incomeTaxAnnual,
    annualNetRent,
    annualDebtService,
    annualCashFlow,
    monthlyCashFlow,
    grossYieldPct,
    netYieldPct,
    cashOnCashPct,
    breakEvenMonths,
  };
}
