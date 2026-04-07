// frontend\app\types\pricing.ts
export type SeasonType = "weekday" | "weekend" | "high" | "top";
export type CarClass = "A" | "B" | "C" | "D";

export type PriceRow = {
  day: number;
  hour: number;
  wide: number;
};

export type PriceTable = Record<CarClass, Record<SeasonType, PriceRow>>;

export type PriceBreakdownRow = {
  label: string;
  amount: number;
};

export type PricingResult = {
  carClass: CarClass;
  basePrice: number;
  optionPrice: number;
  insurancePrice: number;
  discountAmount: number;
  total: number;
  deposit: number;
  hoursTotal: number;
  chargeDays: number;
  extraHours: number;
  isWidePlanApplied: boolean;
  breakdown: PriceBreakdownRow[];
};
