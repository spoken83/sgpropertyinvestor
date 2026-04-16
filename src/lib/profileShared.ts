export type BuyerProfile = {
  cash: number;
  cpf: number;
  age: number;
  rate: number;             // loan rate %
  includeTax: boolean;      // apply rental income tax in ROI
  taxRate: number;          // % effective
  vacancyMonths: number;    // months/year assumed vacant
};

export const DEFAULT_PROFILE: BuyerProfile = {
  cash: 300_000,
  cpf: 200_000,
  age: 35,
  rate: 3.5,
  includeTax: true,
  taxRate: 15,
  vacancyMonths: 0.5,
};

export const PROFILE_COOKIE = "sgp_profile";
