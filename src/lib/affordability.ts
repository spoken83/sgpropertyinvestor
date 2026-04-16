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
};

export type AffordResult = {
  tenureYears: number;
  ratePct: number;
  maxPrice: number;
  minPrice: number;
  downpayment: number;
  cashRequired: number;
  cpfRequired: number;
  maxLoan: number;
  monthlyInstalment: number;
  notes: string[];
};

export function computeAffordability(input: AffordInput): AffordResult {
  const rate = input.annualRatePct ?? 3.5;
  const tenureYears = Math.max(0, Math.min(30, 65 - input.age));
  const notes: string[] = [];

  if (tenureYears <= 0) {
    return {
      tenureYears: 0,
      ratePct: rate,
      maxPrice: 0,
      minPrice: 0,
      downpayment: 0,
      cashRequired: 0,
      cpfRequired: 0,
      maxLoan: 0,
      monthlyInstalment: 0,
      notes: ["Age is at/above 65 — no loan tenure available."],
    };
  }

  // Under optimal split (5% cash + 20% CPF), binding constraints:
  //   price_by_cash = cash / 0.05
  //   price_by_cpf  = cpf  / 0.20
  const priceByCash = input.cash / 0.05;
  const priceByCpf = input.cpf / 0.2;
  const maxPrice = Math.min(priceByCash, priceByCpf);

  if (priceByCash < priceByCpf) {
    notes.push("Cash (5%) is the binding constraint. More cash unlocks higher price.");
  } else if (priceByCpf < priceByCash) {
    notes.push("CPF (20%) is the binding constraint. More CPF OA unlocks higher price.");
  }

  const downpayment = maxPrice * 0.25;
  const cashRequired = maxPrice * 0.05;
  const cpfRequired = maxPrice * 0.2;
  const maxLoan = maxPrice * 0.75;
  const monthlyInstalment = pmt(maxLoan, rate / 100 / 12, tenureYears * 12);

  // Min price: we floor at 500k for practicality (no meaningful SG private condo below that).
  const minPrice = Math.min(500_000, maxPrice);

  return {
    tenureYears,
    ratePct: rate,
    maxPrice,
    minPrice,
    downpayment,
    cashRequired,
    cpfRequired,
    maxLoan,
    monthlyInstalment,
    notes,
  };
}

function pmt(principal: number, monthlyRate: number, n: number) {
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}
