export type BuyerProfile = {
  cash: number;
  cpf: number;
  age: number;
  rate: number;             // loan rate %
  includeTax: boolean;      // apply rental income tax in ROI
  taxRate: number;          // % effective
  vacancyMonths: number;    // months/year assumed vacant
  // TDSR (Total Debt Servicing Ratio) — optional income-based loan cap
  includeTdsr: boolean;
  salary: number;           // monthly gross salary
  monthlyDebts: number;     // existing monthly debt commitments
  tdsrPct: number;          // MAS TDSR ceiling (currently 55%)
  stressRate: number;       // stress-test rate % p.a. used by banks for TDSR assessment
};

export const DEFAULT_PROFILE: BuyerProfile = {
  cash: 300_000,
  cpf: 200_000,
  age: 35,
  rate: 3.5,
  includeTax: true,
  taxRate: 15,
  vacancyMonths: 0.5,
  includeTdsr: false,
  salary: 10_000,
  monthlyDebts: 0,
  tdsrPct: 55,
  stressRate: 4.0,
};

export const PROFILE_COOKIE = "sgp_profile";
