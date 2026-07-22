// Deterministic property finance calculators (India). Exact math — never AI-guessed.
// Stamp-duty / registration percentages are typical defaults and are clearly labelled as
// indicative; actual rates vary by state and should be confirmed before registration.

export interface EmiResult {
  emi: number;
  totalPayment: number;
  totalInterest: number;
}

/** Monthly EMI. principal in ₹, annualRatePct e.g. 8.5, months e.g. 240. */
export function emi(principal: number, annualRatePct: number, months: number): EmiResult {
  if (principal <= 0 || months <= 0) return { emi: 0, totalPayment: 0, totalInterest: 0 };
  const r = annualRatePct / 12 / 100;
  let e: number;
  if (r === 0) e = principal / months;
  else e = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const total = e * months;
  return {
    emi: Math.round(e),
    totalPayment: Math.round(total),
    totalInterest: Math.round(total - principal),
  };
}

/** Rough max loan you can service given a monthly EMI budget. */
export function loanEligibility(monthlyEmiBudget: number, annualRatePct: number, months: number): number {
  if (monthlyEmiBudget <= 0 || months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return Math.round(monthlyEmiBudget * months);
  const p = (monthlyEmiBudget * (Math.pow(1 + r, months) - 1)) / (r * Math.pow(1 + r, months));
  return Math.round(p);
}

export interface PurchaseCosts {
  price: number;
  stampDuty: number;
  registration: number;
  legal: number;
  total: number;
  downPayment: number;
  loanAmount: number;
}

/** Total purchase cost breakdown. Percentages are indicative defaults (confirm per state). */
export function purchaseCosts(
  price: number,
  opts: { stampDutyPct?: number; registrationPct?: number; legalPct?: number; downPaymentPct?: number } = {}
): PurchaseCosts {
  const stampDutyPct = opts.stampDutyPct ?? 7; // typical ~5–7%
  const registrationPct = opts.registrationPct ?? 1; // typical ~1%
  const legalPct = opts.legalPct ?? 0.5;
  const downPaymentPct = opts.downPaymentPct ?? 20;
  const stampDuty = Math.round((price * stampDutyPct) / 100);
  const registration = Math.round((price * registrationPct) / 100);
  const legal = Math.round((price * legalPct) / 100);
  const total = price + stampDuty + registration + legal;
  const downPayment = Math.round((price * downPaymentPct) / 100);
  return { price, stampDuty, registration, legal, total, downPayment, loanAmount: price - downPayment };
}

/** Simple ROI over years given purchase and expected sale value (user-supplied). */
export function roi(purchase: number, saleValue: number): { profit: number; roiPct: number } {
  if (purchase <= 0) return { profit: 0, roiPct: 0 };
  const profit = saleValue - purchase;
  return { profit: Math.round(profit), roiPct: Math.round((profit / purchase) * 1000) / 10 };
}

/** Annual rental yield %. */
export function rentalYield(annualRent: number, propertyValue: number): number {
  if (propertyValue <= 0) return 0;
  return Math.round((annualRent / propertyValue) * 1000) / 10;
}

export const CALCULATORS = [
  { key: "emi", label: "EMI Calculator", icon: "calculator" },
  { key: "eligibility", label: "Loan Eligibility", icon: "cash" },
  { key: "costs", label: "Total Purchase Cost", icon: "receipt" },
  { key: "yield", label: "Rental Yield", icon: "trending-up" },
] as const;
