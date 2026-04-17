// frontend\app\lib\parseReservationCsv.ts

import type { CsvRow, Reservation } from "../types/reservation";

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toCount(value: unknown): number {
  const text = toSafeString(value);
  if (!text) return 0;

  // 全角→半角変換
  const normalized = text.replace(/[\uFF10-\uFF19]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0),
  );

  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function toInsurance(value: unknown): boolean {
  const text = toSafeString(value);
  return text.includes("加入") || text.includes("有");
}

export function parseReservationRow(row: CsvRow, index: number): Reservation {
  return {
    id: `${index + 1}`,
    submittedAt: toSafeString(row["送信日時"]),
    pickupReturnPlace: toSafeString(row["貸出・返却場所"]),
    name: toSafeString(row["ご契約者様　氏名"]),
    nameKana: toSafeString(row["ご契約者様　氏名_カナ"]),
    email: toSafeString(row["メールアドレス"]),
    phone: toSafeString(row["携帯電話番号"]),
    postalCode: toSafeString(row["住所：郵便番号"]),
    prefecture: toSafeString(row["住所：都道府県"]),
    city: toSafeString(row["住所：市区町村"]),
    address1: toSafeString(row["住所：番地"]),
    building: toSafeString(row["住所：マンション・ビル名"]),
    pickupDate: toSafeString(row["貸出希望日"]),
    pickupTime: toSafeString(row["貸出時間"]),
    returnDate: toSafeString(row["返却希望日"]),
    returnTime: toSafeString(row["返却時間"]),
    carType: toSafeString(row["希望車種"]),
    passengerCount: toSafeString(row["ご乗車予定人数"]),
    discountPlan: toSafeString(row["割引プラン"]),
    insurance: toInsurance(row["安心補償サービス　2,200円/日（税込）"]),
    childSeatCount: toCount(row["チャイルドシート　550円/日（税込）"]),
    juniorSeatCount: toCount(row["ジュニアシート　550円/日（税込）"]),
    tarpCount: toCount(row["ワンタッチタープ　1,100円/日（税込）"]),
    tableSetCount: toCount(row["テーブル・イスセット　550円/日（税込）"]),
    myCarParking: toSafeString(row["マイカーお預かりサービス"]),
    note: toSafeString(row["その他ご要望"]),
  };
}
