import type { PriceTable, CarClass } from "../types/pricing";

export const CAR_CLASS_MAP: Record<string, CarClass> = {
  レジストロアウル: "A",
  レジストロアウル4WD: "B",

  ジープニーエボライト: "C",
  モビーDC: "C",
  ジョリビーエボライト: "C",
  レジストロトゥカノ: "C",

  "コルドバンクス※車両重量3.5t超": "D",
  "クレソンジャーニーエボライト※車両重量3.5t超": "D",
  ヴォーンR2B: "D",
};

export const PRICE_TABLE: PriceTable = {
  A: {
    weekday: { day: 17600, hour: 1760, wide: 13200 },
    weekend: { day: 23100, hour: 2310, wide: 13200 },
    high: { day: 28600, hour: 2860, wide: 19800 },
    top: { day: 35200, hour: 3520, wide: 19800 },
  },
  B: {
    weekday: { day: 20900, hour: 2090, wide: 15400 },
    weekend: { day: 27500, hour: 2750, wide: 15400 },
    high: { day: 33000, hour: 3300, wide: 22000 },
    top: { day: 38500, hour: 3850, wide: 22000 },
  },
  C: {
    weekday: { day: 23100, hour: 2310, wide: 17600 },
    weekend: { day: 29700, hour: 2970, wide: 17600 },
    high: { day: 35200, hour: 3520, wide: 24200 },
    top: { day: 40700, hour: 4070, wide: 24200 },
  },
  D: {
    weekday: { day: 25300, hour: 2530, wide: 19800 },
    weekend: { day: 31900, hour: 3190, wide: 19800 },
    high: { day: 37400, hour: 3740, wide: 26400 },
    top: { day: 42900, hour: 4290, wide: 26400 },
  },
};
