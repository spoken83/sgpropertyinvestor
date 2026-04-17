// Singapore private residential affordability.
// Rules:
//   - Max LTV 75% of property price (first loan, private).
//   - Tenure: min(30 years, 65 - age). If result <=0, loan not viable.
//   - Cash floor: 5% of price must be cash; CPF can fund up to 20%; remainder of 25% downpayment is cash or CPF.
//     For v1 we assume optimal = 5% cash + 20% CPF.
//   - Input: cash, cpf, age, annualRatePct (default 3.5).
//   - Output: min/max property price the user can purchase.
//
// Min price is the lowest meaningful buy (we use 0 floor — user decides).
// Max price is bounded by whichever limit binds first:
//   (a) cash >= 0.05 * price                          → price <= cash / 0.05
//   (b) cpf  >= 0.20 * price (if cpf < 20%, cash fills gap; but we keep simple by enforcing optimal split)
//   (c) loan <= 0.75 * price  AND  loan serviceable by TDSR (deferred; v1 ignores income)
//   (d) user has enough total funds for 25% down: cash+cpf >= 0.25 * price

export type AffordInput = {
  cash: number;
  cpf: number;
  age: number;
  annualRatePct?: number; // default 3.5
  // Extra cash deployed beyond the mandatory 5% floor. Reduces the loan,
  // which raises max price when TDSR is the binding constraint.
  extraCashDown?: number;
  // Optional TDSR constraint
  includeTdsr?: boolean;
  salary?: number;          // monthly gross
  monthlyDebts?: number;    // existing commitments
  tdsrPct?: number;         // MAS ceiling, default 55
  stressRate?: number;      // bank stress-test rate % p.a.
};

export type AffordResult = {
  tenureYears: number;
  ratePct: number;
  maxPrice: number;
  maxPriceLtvOnly: number;  // max price before TDSR cap (always >= maxPrice)
  minPrice: number;
  downpayment: number;
  cashRequired: number;     // 5% floor + extraCashDown
  cpfRequired: number;
  maxLoan: number;
  monthlyInstalment: number;
  extraCashDown: number;    // extra cash deployed beyond 5% floor
  cashKeptLiquid: number;   // cash - cashRequired
  // TDSR outputs (populated when includeTdsr is true)
  tdsrActive: boolean;
  tdsrBinding: boolean;     // true when TDSR is the tighter constraint
  tdsrCeiling: number;      // max monthly for all debts
  tdsrAvailable: number;    // ceiling − existing debts
  maxLoanTdsr: number;      // PV of tdsrAvailable at stress rate
  stressRateUsed: number;
  notes: string[];
};

export function computeAffordability(input: AffordInput): AffordResult {
  const rate = input.annualRatePct ?? 3.5;
  const tenureYears = Math.max(0, Math.min(30, 65 - input.age));
  const notes: string[] = [];

  const extraCashDown = input.extraCashDown ?? 0;

  const empty: AffordResult = {
    tenureYears: 0,
    ratePct: rate,
    maxPrice: 0,
    maxPriceLtvOnly: 0,
    minPrice: 0,
    downpayment: 0,
    cashRequired: 0,
    cpfRequired: 0,
    maxLoan: 0,
    monthlyInstalment: 0,
    extraCashDown: 0,
    cashKeptLiquid: input.cash,
    tdsrActive: false,
    tdsrBinding: false,
    tdsrCeiling: 0,
    tdsrAvailable: 0,
    maxLoanTdsr: 0,
    stressRateUsed: 0,
    notes: [],
  };

  if (tenureYears <= 0) {
    return { ...empty, notes: ["Age is at/above 65 — no loan tenure available."] };
  }

  // ─── Funding model ──────────────────────────────────────────
  // CPF OA is fully deployed to the property (downpayment + loan reduction).
  // Only constraint: 5% of price must come from cash (MAS rule).
  //
  //   cashFloor = 0.05 × price             (mandatory cash)
  //   cpfUsed   = min(cpf, price − cashFloor − extraCashDown)
  //   loan      = price − cashFloor − extraCashDown − cpfUsed
  //
  // Constraints on max price:
  //   (a) cash ≥ cashFloor + extraCashDown  → price ≤ (cash − extraCashDown) / 0.05
  //   (b) loan ≤ 0.75 × price (LTV cap)    → price ≤ (extraCashDown + cpf) / 0.20
  //   (c) loan ≤ maxLoanTdsr (if TDSR on)  → price ≤ (maxLoanTdsr + extraCashDown + cpf) / 0.95

  const maxPriceCashFloor = (input.cash - extraCashDown) / 0.05; // (a)
  const maxPriceLtv = (extraCashDown + input.cpf) / 0.20;        // (b)
  const maxPriceFunds = Math.min(maxPriceCashFloor, maxPriceLtv);

  if (maxPriceCashFloor < maxPriceLtv) {
    notes.push("Cash (5% floor) is the binding constraint. More cash unlocks higher price.");
  } else if (maxPriceLtv < maxPriceCashFloor) {
    notes.push("LTV (75% max loan) is the binding constraint. More CPF OA or extra cash unlocks higher price.");
  }

  // ─── TDSR ──────────────────────────────────────────────────
  const tdsrActive = input.includeTdsr === true;
  const salary = input.salary ?? 0;
  const monthlyDebts = input.monthlyDebts ?? 0;
  const tdsrPct = input.tdsrPct ?? 55;
  const stressRateAnnual = input.stressRate ?? 4;

  const tdsrCeiling = salary * (tdsrPct / 100);
  const tdsrAvailable = Math.max(0, tdsrCeiling - monthlyDebts);

  const stressMonthly = stressRateAnnual / 100 / 12;
  const nMonths = tenureYears * 12;
  const maxLoanTdsr = tdsrAvailable > 0 ? pv(tdsrAvailable, stressMonthly, nMonths) : 0;

  let tdsrBinding = false;
  let maxPrice: number;

  if (tdsrActive) {
    const maxPriceTdsr = (maxLoanTdsr + extraCashDown + input.cpf) / 0.95; // (c)
    maxPrice = Math.min(maxPriceFunds, maxPriceTdsr);
    if (maxPriceTdsr < maxPriceFunds) {
      tdsrBinding = true;
      notes.push(
        `TDSR limits your max instalment to ${fmtShort(tdsrAvailable)}/mo (${tdsrPct}% of ${fmtShort(salary)} − ${fmtShort(monthlyDebts)} debts) at ${stressRateAnnual}% stress rate.${
          extraCashDown > 0 ? "" : " Slide cash deployment to raise max price."
        }`
      );
    }
  } else {
    maxPrice = maxPriceFunds;
  }

  maxPrice = Math.max(0, maxPrice);
  const cashFloor = maxPrice * 0.05;
  const cashRequired = cashFloor + extraCashDown;
  // CPF covers everything between cash and loan, up to balance available.
  const cpfRequired = Math.min(input.cpf, Math.max(0, maxPrice - cashRequired));
  const maxLoan = Math.max(0, maxPrice - cashRequired - cpfRequired);
  const downpayment = maxPrice - maxLoan;
  const monthlyInstalment = nMonths > 0 && maxLoan > 0 ? pmt(maxLoan, rate / 100 / 12, nMonths) : 0;
  const minPrice = Math.min(500_000, maxPrice);

  return {
    tenureYears,
    ratePct: rate,
    maxPrice,
    maxPriceLtvOnly: maxPriceLtv,
    minPrice,
    downpayment,
    cashRequired,
    cpfRequired,
    maxLoan,
    monthlyInstalment,
    extraCashDown,
    cashKeptLiquid: Math.max(0, input.cash - cashRequired),
    tdsrActive,
    tdsrBinding,
    tdsrCeiling,
    tdsrAvailable,
    maxLoanTdsr,
    stressRateUsed: stressRateAnnual,
    notes,
  };
}

function pmt(principal: number, monthlyRate: number, n: number) {
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

// Present value of an annuity (how much loan a given monthly payment can support).
function pv(monthlyPayment: number, monthlyRate: number, n: number) {
  if (monthlyRate === 0) return monthlyPayment * n;
  return monthlyPayment * (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate;
}

function fmtShort(n: number): string {
  return n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
}
