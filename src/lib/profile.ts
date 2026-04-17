import { cookies } from "next/headers";
import { DEFAULT_PROFILE, PROFILE_COOKIE, type BuyerProfile } from "./profileShared";

export async function getProfile(): Promise<BuyerProfile> {
  const store = await cookies();
  const raw = store.get(PROFILE_COOKIE)?.value;
  if (!raw) return DEFAULT_PROFILE;
  try {
    const p = JSON.parse(decodeURIComponent(raw));
    return {
      cash: Number(p.cash) || DEFAULT_PROFILE.cash,
      cpf: Number(p.cpf) || DEFAULT_PROFILE.cpf,
      age: Number(p.age) || DEFAULT_PROFILE.age,
      rate: Number(p.rate) || DEFAULT_PROFILE.rate,
      includeTax: typeof p.includeTax === "boolean" ? p.includeTax : DEFAULT_PROFILE.includeTax,
      taxRate: typeof p.taxRate === "number" ? p.taxRate : DEFAULT_PROFILE.taxRate,
      vacancyMonths: typeof p.vacancyMonths === "number" ? p.vacancyMonths : DEFAULT_PROFILE.vacancyMonths,
      includeTdsr: typeof p.includeTdsr === "boolean" ? p.includeTdsr : DEFAULT_PROFILE.includeTdsr,
      salary: typeof p.salary === "number" ? p.salary : DEFAULT_PROFILE.salary,
      monthlyDebts: typeof p.monthlyDebts === "number" ? p.monthlyDebts : DEFAULT_PROFILE.monthlyDebts,
      tdsrPct: typeof p.tdsrPct === "number" ? p.tdsrPct : DEFAULT_PROFILE.tdsrPct,
      stressRate: typeof p.stressRate === "number" ? p.stressRate : DEFAULT_PROFILE.stressRate,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}
