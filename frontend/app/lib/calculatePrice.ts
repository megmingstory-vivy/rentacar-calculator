// calculatePrice.ts

import type { Reservation } from "../types/reservation";
import type {
  CarClass,
  PricingResult,
  PriceBreakdownRow,
  SeasonType,
} from "../types/pricing";
import { CAR_CLASS_MAP, PRICE_TABLE } from "../lib/pricingTable";

function formatCurrency(value: number): string {
  return value.toLocaleString("ja-JP");
}

const INSURANCE_PER_DAY = 2200;
const CHILD_SEAT_PER_DAY = 550;
const JUNIOR_SEAT_PER_DAY = 550;
const TARP_PER_DAY = 1100;
const TABLE_SET_PER_DAY = 550;

function toHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ");
}

function normalizeDateText(dateText: string): {
  year: number;
  month: number;
  day: number;
} {
  const text = toHalfWidth(dateText).trim();

  const cleaned = text
    .replace(/\(.+?\)/g, "")
    .replace(/（.+?）/g, "")
    .replace(/日/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(
    /(\d{4})\s*(?:\/|-|年)\s*(\d{1,2})\s*(?:\/|-|月)\s*(\d{1,2})/,
  );

  if (!match) {
    throw new Error(`日付の形式が不正です: ${dateText}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function normalizeTimeText(timeText: string): {
  hour: number;
  minute: number;
} {
  const text = toHalfWidth(timeText).trim();

  const cleaned = text
    .replace(/頃/g, "")
    .replace(/ごろ/g, "")
    .replace(/\s+/g, "")
    .trim();

  const hmssMatch = cleaned.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (hmssMatch) {
    return {
      hour: Number(hmssMatch[1]),
      minute: Number(hmssMatch[2]),
    };
  }

  const jpHmMatch = cleaned.match(/^(\d{1,2})時(?:(\d{1,2})分?)?$/);
  if (jpHmMatch) {
    return {
      hour: Number(jpHmMatch[1]),
      minute: jpHmMatch[2] ? Number(jpHmMatch[2]) : 0,
    };
  }

  const hourOnlyMatch = cleaned.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    return {
      hour: Number(hourOnlyMatch[1]),
      minute: 0,
    };
  }

  throw new Error(`時間の形式が不正です: ${timeText}`);
}

function parseJapaneseDateTime(dateText: string, timeText: string): Date {
  const { year, month, day } = normalizeDateText(dateText);
  const { hour, minute } = normalizeTimeText(timeText);

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`日時の変換に失敗しました: ${dateText} ${timeText}`);
  }

  return date;
}

function ceilHours(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new Error("貸出日時または返却日時が不正です。");
  }

  const diffMs = endMs - startMs;
  return Math.ceil(diffMs / (1000 * 60 * 60));
}

function normalizeCarType(carType: string): string {
  return carType.replace(/\s+/g, "").trim();
}

function getCarClass(carType: string): CarClass {
  const normalized = normalizeCarType(carType);

  for (const [key, value] of Object.entries(CAR_CLASS_MAP)) {
    if (normalizeCarType(key) === normalized) {
      return value;
    }
  }

  throw new Error(`未対応の車種です: ${carType}`);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isInRange(date: Date, start: string, end: string): boolean {
  const ymd = formatYmd(date);
  return ymd >= start && ymd <= end;
}

function getSeason(date: Date): SeasonType {
  const topRanges = [
    ["2026-05-01", "2026-05-06"],
    ["2026-08-07", "2026-08-16"],
  ] as const;

  const highRanges = [
    ["2025-12-27", "2026-01-04"],
    ["2026-03-20", "2026-04-05"],
    ["2026-04-25", "2026-04-30"],
    ["2026-07-11", "2026-08-06"],
    ["2026-08-17", "2026-08-31"],
    ["2026-09-11", "2026-09-13"],
    ["2026-09-19", "2026-09-23"],
    ["2026-10-09", "2026-10-12"],
    ["2026-12-26", "2027-01-03"],
  ] as const;

  for (const [start, end] of topRanges) {
    if (isInRange(date, start, end)) return "top";
  }

  for (const [start, end] of highRanges) {
    if (isInRange(date, start, end)) return "high";
  }

  return isWeekend(date) ? "weekend" : "weekday";
}

// 24時間ブロック内の曜日別時間を集計する関数
function getDominantSeasonIn24hBlock(blockStart: Date): SeasonType {
  const counts: Record<SeasonType, number> = {
    weekday: 0,
    weekend: 0,
    high: 0,
    top: 0,
  };

  for (let h = 0; h < 24; h++) {
    const d = new Date(blockStart.getTime() + h * 60 * 60 * 1000);
    const season = getSeason(d);
    counts[season] += 1;
  }

  // 最も長いseasonを取得
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as SeasonType;
}

function includesTopSeasonOrNewYearRestriction(
  start: Date,
  hoursTotal: number,
): boolean {
  const dayCount = Math.ceil(hoursTotal / 24);

  for (let i = 0; i < dayCount; i += 1) {
    const blockStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const ymd = formatYmd(blockStart);

    if (getSeason(blockStart) === "top") return true;
    if (ymd >= "2025-12-31" && ymd <= "2026-01-02") return true;
    if (ymd >= "2026-12-31" && ymd <= "2027-01-02") return true;
  }

  return false;
}

function isWidePlanApplicable(
  start: Date,
  end: Date,
  hoursTotal: number,
): boolean {
  const startHour = start.getHours();
  const endHour = end.getHours();

  const pickupOk = startHour >= 17 && startHour <= 19;
  const returnOk = endHour >= 9 && endHour <= 12;

  return pickupOk && returnOk && hoursTotal >= 24;
}

function getLongDiscountRate(hoursTotal: number): number {
  if (hoursTotal >= 490) return 0.3;
  if (hoursTotal >= 322) return 0.2;
  if (hoursTotal >= 154) return 0.15;
  if (hoursTotal >= 82) return 0.1;
  return 0;
}

function isRepeatDiscount(reservation: Reservation): boolean {
  return reservation.discountPlan.includes("リピート");
}

function buildOptionBreakdown(
  chargeDays: number,
  reservation: Reservation,
): PriceBreakdownRow[] {
  const rows: PriceBreakdownRow[] = [];

  if (reservation.childSeatCount > 0) {
    rows.push({
      label: `チャイルドシート 550円/日 ${reservation.childSeatCount}台 × ${chargeDays}日`,
      amount: reservation.childSeatCount * CHILD_SEAT_PER_DAY * chargeDays,
    });
  }

  if (reservation.juniorSeatCount > 0) {
    rows.push({
      label: `ジュニアシート 550円/日 ${reservation.juniorSeatCount}台 × ${chargeDays}日`,
      amount: reservation.juniorSeatCount * JUNIOR_SEAT_PER_DAY * chargeDays,
    });
  }

  if (reservation.tarpCount > 0) {
    rows.push({
      label: `ワンタッチタープ 1,100円/日 ${reservation.tarpCount}台 × ${chargeDays}日`,
      amount: reservation.tarpCount * TARP_PER_DAY * chargeDays,
    });
  }

  if (reservation.tableSetCount > 0) {
    rows.push({
      label: `テーブル・イスセット 550円/日 ${reservation.tableSetCount}台 × ${chargeDays}日`,
      amount: reservation.tableSetCount * TABLE_SET_PER_DAY * chargeDays,
    });
  }

  return rows;
}

export function calculatePrice(reservation: Reservation): PricingResult {
  const start = parseJapaneseDateTime(
    reservation.pickupDate,
    reservation.pickupTime,
  );
  const end = parseJapaneseDateTime(
    reservation.returnDate,
    reservation.returnTime,
  );

  if (end <= start) {
    throw new Error("返却日時は貸出日時より後にしてください。");
  }

  const hoursTotal = ceilHours(start, end);

  if (
    includesTopSeasonOrNewYearRestriction(start, hoursTotal) &&
    hoursTotal < 72
  ) {
    throw new Error(
      "トップシーズンまたは年末年始対象のため、72時間以上の利用が必要です。",
    );
  }

  const carClass = getCarClass(reservation.carType);
  const priceRows = PRICE_TABLE[carClass];
  const breakdown: PriceBreakdownRow[] = [];

  const fullDays = Math.floor(hoursTotal / 24);
  const extraHours = hoursTotal % 24;
  const chargeDays = Math.ceil(hoursTotal / 24);

  let basePrice = 0;
  const isWidePlanApplied = isWidePlanApplicable(start, end, hoursTotal);

  const seasonLabelMap: Record<SeasonType, string> = {
    weekday: "平日料金",
    weekend: "土日祝料金",
    high: "ハイシーズン料金",
    top: "トップシーズン料金",
  };

  if (isWidePlanApplied) {
    const seasonDayCounts: Record<SeasonType, number> = {
      weekday: 0,
      weekend: 0,
      high: 0,
      top: 0,
    };
    for (let i = 0; i < fullDays; i += 1) {
      const blockStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const season = getDominantSeasonIn24hBlock(blockStart);
      const dayPrice = priceRows[season].day;

      basePrice += dayPrice;
      seasonDayCounts[season] += 1;
    }

    (Object.keys(seasonDayCounts) as SeasonType[]).forEach((season) => {
      const count = seasonDayCounts[season];
      if (count === 0) return;

      const dayPrice = priceRows[season].day;
      breakdown.push({
        label: `${seasonLabelMap[season]}　${formatCurrency(dayPrice)}円×${count}日間`,
        amount: dayPrice * count,
      });
    });

    const wideSeason =
      fullDays > 0
        ? getDominantSeasonIn24hBlock(
            new Date(start.getTime() + (fullDays - 1) * 24 * 60 * 60 * 1000),
          )
        : getDominantSeasonIn24hBlock(start);

    const widePrice = priceRows[wideSeason].wide;
    basePrice += widePrice;

    breakdown.push({
      label: `ワイドプラン料金　${formatCurrency(widePrice)}円×1回`,
      amount: widePrice,
    });
  } else {
    const seasonDayCounts: Record<SeasonType, number> = {
      weekday: 0,
      weekend: 0,
      high: 0,
      top: 0,
    };
    for (let i = 0; i < fullDays; i += 1) {
      const blockStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const season = getDominantSeasonIn24hBlock(blockStart);
      const dayPrice = priceRows[season].day;

      basePrice += dayPrice;
      seasonDayCounts[season] += 1;
    }

    (Object.keys(seasonDayCounts) as SeasonType[]).forEach((season) => {
      const count = seasonDayCounts[season];
      if (count === 0) return;

      const dayPrice = priceRows[season].day;
      breakdown.push({
        label: `${seasonLabelMap[season]}　${formatCurrency(dayPrice)}円×${count}日間`,
        amount: dayPrice * count,
      });
    });

    if (extraHours > 0) {
      const season = fullDays === 0 ? getSeason(start) : getSeason(end);
      const hourPrice = priceRows[season].hour;
      const dayPrice = priceRows[season].day;

      const hourlyAmount = hourPrice * extraHours;

      if (hourlyAmount > dayPrice) {
        basePrice += dayPrice;

        breakdown.push({
          label: `${seasonLabelMap[season]}　1日料金適用（時間料金より安いため）`,
          amount: dayPrice,
        });
      } else {
        basePrice += hourlyAmount;

        breakdown.push({
          label: `${seasonLabelMap[season]}　${formatCurrency(hourPrice)}円×${extraHours}時間`,
          amount: hourlyAmount,
        });
      }
    }
  }

  const originalBasePrice = basePrice;
  let discountedPrice = basePrice;

  const longDiscountRate = reservation.discountPlan.includes("長期")
    ? getLongDiscountRate(hoursTotal)
    : 0;

  if (longDiscountRate > 0) {
    const amount = Math.round(discountedPrice * longDiscountRate);
    discountedPrice -= amount;

    breakdown.push({
      label: `長期割引　${longDiscountRate * 100}%`,
      amount: -amount,
    });
  }

  if (isRepeatDiscount(reservation)) {
    const amount = Math.round(discountedPrice * 0.05);
    discountedPrice -= amount;

    breakdown.push({
      label: "リピート割引　5%",
      amount: -amount,
    });
  }

  const optionBreakdown = buildOptionBreakdown(chargeDays, reservation);
  const optionPrice = optionBreakdown.reduce((sum, row) => sum + row.amount, 0);
  breakdown.push(...optionBreakdown);

  const insurancePrice = reservation.insurance
    ? INSURANCE_PER_DAY * chargeDays
    : 0;

  if (insurancePrice > 0) {
    breakdown.push({
      label: `安心補償サービス　${formatCurrency(INSURANCE_PER_DAY)}円×${chargeDays}日間`,
      amount: insurancePrice,
    });
  }

  const total = discountedPrice + optionPrice + insurancePrice;
  const deposit = Math.round(total * 0.5);
  const discountAmount = originalBasePrice - discountedPrice;

  if (
    Number.isNaN(basePrice) ||
    Number.isNaN(optionPrice) ||
    Number.isNaN(insurancePrice) ||
    Number.isNaN(total) ||
    Number.isNaN(deposit)
  ) {
    throw new Error(
      "料金計算に失敗しました。日時または料金データを確認してください。",
    );
  }

  return {
    carClass,
    basePrice,
    optionPrice,
    insurancePrice,
    discountAmount,
    total,
    deposit,
    hoursTotal,
    chargeDays,
    extraHours,
    isWidePlanApplied,
    breakdown,
  };
}
