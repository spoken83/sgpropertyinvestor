// URA PMI API client.
// Docs: https://www.ura.gov.sg/maps/api/
// Flow: (1) GET token with AccessKey header → (2) call data endpoints with Token + AccessKey headers.

const BASE = process.env.URA_API_BASE ?? "https://eservice.ura.gov.sg/uraDataService";

export async function getToken(): Promise<string> {
  const key = process.env.URA_ACCESS_KEY;
  if (!key) throw new Error("URA_ACCESS_KEY not set");
  const res = await fetch(`${BASE}/insertNewToken/v1`, {
    headers: { AccessKey: key },
  });
  const json = (await res.json()) as { Status: string; Result: string };
  if (json.Status !== "Success") throw new Error(`URA token failed: ${JSON.stringify(json)}`);
  return json.Result;
}

async function call<T>(service: string, token: string, query: Record<string, string> = {}): Promise<T> {
  const key = process.env.URA_ACCESS_KEY!;
  const qs = new URLSearchParams({ service, ...query }).toString();
  const res = await fetch(`${BASE}/invokeUraDS/v1?${qs}`, {
    headers: { AccessKey: key, Token: token },
  });
  return (await res.json()) as T;
}

// Batches 1-4 cover last ~5 years of private residential transactions
export type UraTxn = {
  project: string;
  street: string;
  transaction: Array<{
    contractDate: string; // MMYY
    price: string;
    area: string; // sqm
    floorRange: string;
    typeOfSale: string;
    propertyType: string;
    district: string;
    typeOfArea: string;
    tenure: string;
    noOfUnits: string;
    nettPrice?: string;
    marketSegment?: string;
  }>;
};

export async function fetchTransactions(token: string, batch: 1 | 2 | 3 | 4) {
  const json = await call<{ Status: string; Result: UraTxn[] }>(
    "PMI_Resi_Transaction",
    token,
    { batch: String(batch) }
  );
  if (json.Status !== "Success") throw new Error(`URA txn failed: ${JSON.stringify(json).slice(0, 300)}`);
  return json.Result;
}

// Rentals: refPeriod like "24q1" for Q1 2024
export type UraRent = {
  project: string;
  street: string;
  x?: string;
  y?: string;
  rental: Array<{
    leaseDate: string; // MMYY
    areaSqm: string;
    areaSqft: string;
    rent: number;
    noOfBedRoom: string; // "NA" or number string
    propertyType: string;
    district: string;
  }>;
};

export async function fetchRentals(token: string, refPeriod: string) {
  const json = await call<{ Status: string; Result: UraRent[] }>(
    "PMI_Resi_Rental",
    token,
    { refPeriod }
  );
  if (json.Status !== "Success") return [];
  return json.Result;
}

// URA contract date "0124" → "2024-01-01". Assumes 20xx.
export function parseUraDate(mmyy: string): string {
  const mm = mmyy.slice(0, 2);
  const yy = mmyy.slice(2, 4);
  return `20${yy}-${mm}-01`;
}
