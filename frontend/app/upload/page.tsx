// frontend\app\upload\page.tsx
"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { parseReservationRow } from "../lib/parseReservationCsv";
import { calculatePrice } from "../lib/calculatePrice";
import type { CsvRow, Reservation } from "../types/reservation";
import type { PriceBreakdownRow } from "../types/pricing";
import { toast } from "sonner";

type BreakdownSummary = {
  weekdayFee: number | null;
  holidayFee: number | null;
  highSeasonFee: number | null;
  discountText: string;
  finalAmount: number | null;
};

type RowView =
  | {
      kind: "success";
      row: Reservation;
      total: number;
      deposit: number;
      basePrice: number;
      carClass: string;
      message: string;
      breakdown: PriceBreakdownRow[];
      summary: BreakdownSummary;
      hoursTotal: number;
      chargeDays: number;
    }
  | {
      kind: "error";
      row: Reservation;
      total: null;
      deposit: null;
      basePrice: null;
      carClass: null;
      message: string;
      breakdown: PriceBreakdownRow[];
      summary: BreakdownSummary;
      hoursTotal: null;
      chargeDays: number;
    };

function formatCurrency(value: number): string {
  return value.toLocaleString("ja-JP");
}

function getField(
  row: Reservation,
  keys: string[],
  fallback = "-",
): string | number {
  const record = row as Record<string, unknown>;

  for (const key of keys) {
    // 完全一致
    if (record[key] !== undefined) {
      const value = record[key];
      if (
        value !== null &&
        !(typeof value === "string" && value.trim() === "")
      ) {
        return typeof value === "string" || typeof value === "number"
          ? value
          : String(value);
      }
    }

    // 👇 ここ追加：trimして比較
    const matchedKey = Object.keys(record).find((k) => k.trim() === key.trim());

    if (matchedKey) {
      const value = record[matchedKey];
      if (
        value !== null &&
        !(typeof value === "string" && value.trim() === "")
      ) {
        return typeof value === "string" || typeof value === "number"
          ? value
          : String(value);
      }
    }
  }

  return fallback;
}

function getStatusBadgeClass(kind: "success" | "error") {
  return kind === "success"
    ? "inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700"
    : "inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700";
}

function getRowClass(kind: "success" | "error") {
  return kind === "success" ? "border-b bg-white" : "border-b bg-red-50";
}

function formatDateToSlash(dateStr: string): string {
  if (!dateStr) return "";

  // 例: "2026 年 4 月 11 日"
  const match = dateStr.match(/(\d{4}).*?(\d{1,2}).*?(\d{1,2})/);

  if (!match) return dateStr;

  const [, year, month, day] = match;

  return `${year}/${Number(month)}/${Number(day)}`;
}

// 税込 → 税抜の変換関数（Math.floor は小数点以下切り捨て、四捨五入なら Math.round に変える）
function toTaxExcluded(amount: number): number {
  return Math.round(amount / 1.1);
}
// 税込 → 税抜の変換関数②
function calcTaxFromIncluded(amount: number): number {
  return amount - toTaxExcluded(amount);
}

function DetailModal({
  item,
  onClose,
}: {
  item: RowView;
  onClose: () => void;
}) {
  const row = item.row;

  const address = [
    getField(row, ["postalCode", "住所：郵便番号"], ""),
    getField(row, ["prefecture", "住所：都道府県"], ""),
    getField(row, ["city", "住所：市区町村"], ""),
    getField(row, ["address1", "住所：番地"], ""),
    getField(row, ["building", "住所：マンション・ビル名"], ""),
  ]
    .filter((v) => String(v).trim() !== "")
    .join(" ");

  const email = getField(row, ["email", "メールアドレス"]);
  const phone = getField(row, ["phone", "mobilePhone", "携帯電話番号"]);
  const birthDate = getField(row, ["birthDate", "生年月日"]);
  const pickupLocation = getField(row, [
    "pickupReturnPlace",
    "pickupLocation",
    "貸出・返却場所",
  ]);

  const shopAddressMap: Record<string, string> = {
    横浜店: "〒221-0045 横浜市神奈川区神奈川1-17-7",
    相模原店: "相模原市中央区富士見3-8-1",
  };

  const pickupLocationText = String(pickupLocation);

  const pickupLocationWithAddress = pickupLocationText.includes("横浜店")
    ? `横浜店　${shopAddressMap["横浜店"]}`
    : pickupLocationText.includes("相模原店")
      ? `相模原店　${shopAddressMap["相模原店"]}`
      : pickupLocationText;

  const rawInsurance = getField(row, [
    "insurance",
    "安心補償サービス　2,200円/日（税込）",
  ]);

  const insuranceValue = ["true", "1", "はい", "加入", "加入する"].includes(
    String(rawInsurance).trim().toLowerCase(),
  )
    ? "加入する"
    : "加入しない";

  const childSeatValue = getField(row, [
    "childSeat",
    "チャイルドシート　550円/日（税込）",
  ]);
  const juniorSeatValue = getField(row, [
    "juniorSeat",
    "ジュニアシート　550円/日（税込）",
  ]);
  const tarpValue = getField(row, [
    "tarp",
    "ワンタッチタープ　1,100円/日（税込）",
  ]);
  const tableSetValue = getField(row, [
    "tableSet",
    "テーブル・イスセット　550円/日（税込）",
  ]);
  const myCarStorageValue = getField(row, [
    "myCarStorage",
    "マイカーお預かりサービス",
  ]);
  const otherRequestValue = getField(row, ["otherRequest", "その他ご要望"]);

  const optionLines = [
    ["安心補償サービス　2,200円/日（税込）", insuranceValue],
    ["チャイルドシート　550円/日（税込）", childSeatValue],
    ["ジュニアシート　550円/日（税込）", juniorSeatValue],
    ["ワンタッチタープ　1,100円/日（税込）", tarpValue],
    ["テーブル・イスセット　550円/日（税込）", tableSetValue],
    ["マイカーお預かりサービス", myCarStorageValue],
  ]
    .filter(([, value]) => {
      const text = String(value).trim();
      return text !== "" && text !== "-";
    })
    .map(([label, value]) => `${label}：${value}`);

  const baseBreakdownLines =
    item.breakdown.length > 0
      ? item.breakdown
          .filter((line) => {
            const label = line.label;
            return (
              !label.includes("割引") &&
              !label.includes("安心補償サービス") &&
              !label.includes("チャイルドシート") &&
              !label.includes("ジュニアシート") &&
              !label.includes("ワンタッチタープ") &&
              !label.includes("テーブル・イスセット") &&
              !label.includes("マイカーお預かりサービス")
            );
          })
          .map((line) => {
            const amountText =
              line.amount < 0
                ? `-¥${formatCurrency(Math.abs(line.amount))}`
                : `¥${formatCurrency(line.amount)}`;
            return `　　　　${line.label}＝${amountText}`;
          })
      : [];

  const discountLine =
    item.breakdown.find((line) => line.label.includes("割引")) ?? null;

  const optionBreakdownLines =
    item.breakdown.length > 0
      ? item.breakdown
          .filter((line) =>
            [
              "チャイルドシート",
              "ジュニアシート",
              "ワンタッチタープ",
              "テーブル・イスセット",
            ].some((keyword) => line.label.includes(keyword)),
          )
          .map((line) => {
            const amountText =
              line.amount < 0
                ? `-¥${formatCurrency(Math.abs(line.amount))}`
                : `¥${formatCurrency(line.amount)}`;

            // 例：
            // 「チャイルドシート 550円/日 1台 × 2日」
            // ↓
            // 「チャイルドシート 550円 1台×2日」
            const simplifiedLabel = line.label
              .replace("/日", "") // /日削除
              .replace(/\s*×\s*/, "×") // ×の前後の空白整理
              .replace(/\s+/g, " ") // 全体の空白整理
              .trim();

            return `${simplifiedLabel}＝${amountText}`;
          })
      : [];

  const insuranceBreakdownLine =
    item.breakdown.find((line) => line.label.includes("安心補償サービス")) ??
    null;

  const discountAmountText =
    discountLine !== null
      ? `-¥${formatCurrency(Math.abs(discountLine.amount))}`
      : "-";

  const insuranceAmountText =
    insuranceBreakdownLine !== null
      ? `¥${formatCurrency(insuranceBreakdownLine.amount)}`
      : "-";

  const optionSummaryLines =
    item.breakdown.length > 0
      ? item.breakdown
          .filter((line) =>
            [
              "安心補償サービス",
              "チャイルドシート",
              "ジュニアシート",
              "ワンタッチタープ",
              "テーブル・イスセット",
              "マイカーお預かりサービス",
            ].some((keyword) => line.label.includes(keyword)),
          )
          .map((line) => {
            if (line.label.includes("安心補償サービス")) {
              return "安心補償サービス　2,200円/日（税込）：加入する";
            }
            if (line.label.includes("チャイルドシート")) {
              return "チャイルドシート　550円/日（税込）：1台";
            }
            if (line.label.includes("ジュニアシート")) {
              return "ジュニアシート　550円/日（税込）：1台";
            }
            if (line.label.includes("ワンタッチタープ")) {
              return "ワンタッチタープ　1,100円/日（税込）：1台";
            }
            if (line.label.includes("テーブル・イスセット")) {
              return "テーブル・イスセット　550円/日（税込）：1台";
            }
            if (line.label.includes("マイカーお預かりサービス")) {
              return "マイカーお預かりサービス：あり";
            }
            return line.label;
          })
      : [];

  const usageHoursText =
    item.hoursTotal !== null ? `（計${item.hoursTotal}時間ご利用）` : "";

  const basePriceLine =
    item.basePrice !== null
      ? `基本料金　　　　　　：${formatCurrency(item.basePrice)}円${usageHoursText}`
      : "基本料金　　　　　　：-";

  const discountText = row.discountPlan || "-";

  const mailBody = `●ご予約内容

希望車種：${row.carType || "-"}

貸出・返却場所：${pickupLocationWithAddress}

貸出希望日時：${row.pickupDate} ${row.pickupTime}

返却希望日時：${row.returnDate} ${row.returnTime}

${optionSummaryLines.length > 0 ? optionSummaryLines.join("\n\n") : "オプション：なし"}
${
  String(otherRequestValue).trim() !== "" &&
  String(otherRequestValue).trim() !== "-"
    ? `\nその他ご要望：${otherRequestValue}\n`
    : ""
}
${
  discountText !== "-" && discountText !== "ご利用なし"
    ? `割引プラン　　　　　：${discountText}\n`
    : ""
}

●ご利用料金(税込表記)

${basePriceLine}
${baseBreakdownLines.length > 0 ? `\n${baseBreakdownLines.join("\n")}` : ""}

${optionBreakdownLines.length > 0 ? `\n${optionBreakdownLines.join("\n")}` : ""}
${
  discountLine
    ? `割引プラン　　　　　：${discountLine.label}＝${discountAmountText}`
    : ""
}
${
  insuranceBreakdownLine
    ? `\n安心補償サービス　　：2,200円×${item.chargeDays}日間＝${insuranceAmountText}`
    : ""
}

合計：${item.total !== null ? `${formatCurrency(item.total)}円` : "-"}

予約金：${item.deposit !== null ? `${formatCurrency(item.deposit)}円` : "-"}`;

  // ===== Excel貼り付け用 =====

  // オプション金額
  const optionAmount = item.breakdown
    .filter((line) =>
      [
        "チャイルドシート",
        "ジュニアシート",
        "ワンタッチタープ",
        "テーブル・イスセット",
        "マイカーお預かりサービス",
      ].some((keyword) => line.label.includes(keyword)),
    )
    .reduce((sum, line) => sum + line.amount, 0);

  // 安心補償
  const insuranceAmount = item.breakdown
    .filter((line) => line.label.includes("安心補償サービス"))
    .reduce((sum, line) => sum + line.amount, 0);

  // 割引（正の数にする）
  const discountAmount = item.breakdown
    .filter((line) => line.label.includes("割引"))
    .reduce((sum, line) => sum + Math.abs(line.amount), 0);

  const basePriceExcluded =
    item.basePrice !== null ? toTaxExcluded(item.basePrice) : "";

  // 基本料金・オプション・安心補償・割引を税抜で出す
  const optionAmountExcluded =
    optionAmount > 0 ? toTaxExcluded(optionAmount) : 0;

  const insuranceAmountExcluded =
    insuranceAmount > 0 ? toTaxExcluded(insuranceAmount) : "";

  const discountAmountExcluded =
    discountAmount > 0 ? toTaxExcluded(discountAmount) : 0;

  // 消費税合計（基本料金 + オプション + 安心補償 + 割引）
  const taxTotal =
    (item.basePrice !== null ? calcTaxFromIncluded(item.basePrice) : 0) +
    (optionAmount > 0 ? calcTaxFromIncluded(optionAmount) : 0) +
    (insuranceAmount > 0 ? calcTaxFromIncluded(insuranceAmount) : 0) +
    (discountAmount > 0 ? calcTaxFromIncluded(discountAmount) : 0);

  // 消費税
  const taxAmount = item.breakdown
    .filter((line) => line.label.includes("消費税"))
    .reduce((sum, line) => sum + line.amount, 0);

  // 店頭精算額
  const storeSettlementAmount =
    item.total !== null && item.deposit !== null
      ? item.total - item.deposit
      : "";

  // 貸出地区
  const area = pickupLocationText.includes("横浜")
    ? "横浜"
    : pickupLocationText.includes("相模原")
      ? "相模原"
      : "";

  const discountDisplay =
    discountAmountExcluded !== 0 ? `-${discountAmountExcluded}` : 0;

  const excelOptionDiscountText = [
    ...item.breakdown
      .filter((line) =>
        [
          "ワンタッチタープ",
          "テーブル・イスセット",
          "チャイルドシート",
          "ジュニアシート",
          "安心補償サービス",
          "マイカーお預かりサービス",
        ].some((keyword) => line.label.includes(keyword)),
      )
      .map((line) => {
        if (line.label.includes("安心補償サービス")) {
          return "安心補償サービス　2,200円/日：加入する";
        }

        const simplifiedLabel = line.label
          .replace("/日", "")
          .replace(/\s*×\s*/, "×")
          .replace(/\s+/g, " ")
          .trim();

        return simplifiedLabel;
      }),

    ...item.breakdown
      .filter((line) => line.label.includes("割引"))
      .map((line) => line.label),
  ].join(" / ");

  // Excel1行（タブ区切り）
  const excelRow = [
    row.name ? (row.name.endsWith("様") ? row.name : `${row.name}　様`) : "", // お客様名
    "", // 担当
    area, // 貸出地区

    // 👇 3列 → 1列に統合
    `${row.carType || ""}`, // 貸出車 車種 ナンバー

    "", // 車両所属
    "", // 用途
    "", // 請求先

    formatDateToSlash(row.pickupDate), // 貸出日
    row.pickupTime || "", // 貸出時刻
    formatDateToSlash(row.returnDate), // 返却予定日
    row.returnTime || "", // 返却時刻

    "", // 利用時間
    basePriceExcluded, // 基本料金（税抜）
    optionAmountExcluded, // オプション（税抜）
    insuranceAmountExcluded, // 安心補償（税抜）
    discountDisplay, // 割引（税抜）
    taxTotal || "", // 消費税（合計）

    item.total ?? "", // 合計額税込
    item.deposit ?? "", // 申込金税込
    storeSettlementAmount, // 店頭精算額

    "", // 支払方法
    excelOptionDiscountText, // オプション・割引プラン

    "", // 👈 ★ここ追加（空欄列）

    address || "", // 住所
    phone !== "-" ? phone : "", // TEL
    email !== "-" ? email : "", // メールアドレス
  ];

  // タブ区切りにする（←これが超重要）
  const excelText = excelRow.join("\t");

  // コピー処理
  const handleCopyExcel = async () => {
    try {
      await navigator.clipboard.writeText(excelText);
      toast.success("Excel用テキストをコピーしました");
    } catch (error) {
      console.error(error);
      toast.error("Excel用テキストのコピーに失敗しました");
    }
  };

  const handleCopyMailBody = async () => {
    try {
      await navigator.clipboard.writeText(mailBody);
      toast.success("メール本文をコピーしました");
    } catch (error) {
      console.error(error);
      toast.error("メール本文のコピーに失敗しました");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose} // 背景クリックで閉じる
    >
      {/* ===== モーダル本体 ===== */}
      <div
        // max-h-[90vh] : 画面高さの90%までに制限
        // w-full max-w-5xl : 横幅制限
        // overflow-y-auto : この箱の中だけスクロールさせる
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()} // モーダル内クリックで閉じないようにする
      >
        {/* ===== ヘッダー（スクロールしても固定される部分） ===== */}
        <div
          // sticky top-0 : スクロールしても上に張り付く
          // z-10 : 本文より前面に出す
          // bg-white : 下の内容が透けないようにする
          className="sticky top-0 z-10 border-b bg-white px-6 py-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            {/* 左側：タイトル・ステータス */}
            <div>
              <h2 className="text-2xl font-bold">{row.name}　様</h2>

              <div className="mt-2">
                <span className={getStatusBadgeClass(item.kind)}>
                  {item.kind === "success" ? "計算OK" : "計算エラー"}
                </span>
              </div>
            </div>

            {/* 右側：閉じるボタン（常に見える） */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        </div>

        {/* ===== 本文エリア（ここだけスクロールする） ===== */}
        <div className="p-6">
          {/* --- エラー表示 --- */}
          {item.kind === "error" && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-1 text-sm font-semibold text-red-700">
                エラー理由
              </p>
              <p className="whitespace-pre-wrap text-sm text-red-700">
                {item.message}
              </p>
            </div>
          )}

          {/* ===== ここをまとめる ===== */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* --- 予約情報 --- */}
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 text-lg font-semibold">予約情報</h3>
              <dl className="space-y-2 text-sm">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">氏名</dt>
                  <dd>{row.name}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">氏名カナ</dt>
                  <dd>
                    {getField(row, [
                      "nameKana",
                      "kana",
                      "ご契約者様　氏名_カナ",
                    ])}
                  </dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">希望車種</dt>
                  <dd>{row.carType}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">車両クラス</dt>
                  <dd>{item.carClass ?? "-"}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">利用人数</dt>
                  <dd>
                    {getField(row, [
                      "passengerCount",
                      "rideCount",
                      "ご乗車予定人数",
                    ])}
                  </dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">貸出・返却場所</dt>
                  <dd>{pickupLocation}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">貸出日時</dt>
                  <dd>
                    {row.pickupDate} {row.pickupTime}
                  </dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">返却日時</dt>
                  <dd>
                    {row.returnDate} {row.returnTime}
                  </dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">メール</dt>
                  <dd>{email}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">電話番号</dt>
                  <dd>{phone}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">生年月日</dt>
                  <dd>{birthDate}</dd>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-gray-500">住所</dt>
                  <dd>{address || "-"}</dd>
                </div>
              </dl>
            </section>
            {/* --- その他ご要望欄 --- */}
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 text-lg font-semibold">その他ご要望</h3>

              <div className="rounded-md bg-gray-50 p-3 text-sm leading-7 whitespace-pre-wrap">
                {row.note || "-"}
              </div>
            </section>
            {/* --- 料金内訳 --- */}
            {item.breakdown.length > 0 && (
              <section className="rounded-lg border p-4 md:col-span-2">
                <h3 className="mb-3 text-lg font-semibold">料金内訳</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left">
                        <th className="px-3 py-2">項目</th>
                        <th className="px-3 py-2">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.breakdown.map((line, index) => (
                        <tr key={`${line.label}-${index}`} className="border-b">
                          <td className="px-3 py-2">{line.label}</td>
                          <td className="px-3 py-2 font-semibold">
                            {line.amount < 0
                              ? `-¥${formatCurrency(Math.abs(line.amount))}`
                              : `¥${formatCurrency(line.amount)}`}
                          </td>
                        </tr>
                      ))}
                      {/* 👇 区切り線 */}
                      <tr>
                        <td colSpan={2} className="pt-2"></td>
                      </tr>

                      {/* 👇 合計 */}
                      <tr className="border-t">
                        <td className="px-3 py-2 font-semibold">合計</td>
                        <td className="px-3 py-2 font-bold">
                          {item.total !== null
                            ? `¥${formatCurrency(item.total)}`
                            : "-"}
                        </td>
                      </tr>

                      {/* 👇 予約金 */}
                      <tr>
                        <td className="px-3 py-2">予約金</td>
                        <td className="px-3 py-2 font-semibold">
                          {item.deposit !== null
                            ? `¥${formatCurrency(item.deposit)}`
                            : "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {/* --- メール --- */}
            <section className="rounded-lg border p-4 md:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">メール送信用</h3>
                <button
                  type="button"
                  onClick={handleCopyExcel}
                  className="rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-950 active:scale-95"
                >
                  Excel用コピー
                </button>

                <button
                  type="button"
                  onClick={handleCopyMailBody}
                  className="rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-950 active:scale-95"
                >
                  メール用コピー
                </button>
              </div>

              <textarea
                readOnly
                value={mailBody}
                className="min-h-[420px] w-full rounded-md border p-3 text-sm leading-7"
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedItem, setSelectedItem] = useState<RowView | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");

  const handleFileChange = (file: File | null) => {
    if (!file) return;

    setError("");
    setFileName(file.name);
    setSelectedItem(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsed = results.data.map((row, index) => {
            const normalizedRow = Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                String(key).trim(),
                value,
              ]),
            ) as CsvRow;

            return parseReservationRow(normalizedRow, index);
          });
          setRows(parsed);
        } catch (e) {
          console.error(e);
          setError("CSVの読み込みに失敗しました。列名を確認してください。");
        }
      },
      error: (err) => {
        console.error(err);
        setError("CSVの解析に失敗しました。");
      },
    });
  };

  // ドラッグ用の関数を追加
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0] ?? null;
    handleFileChange(file);
  };

  const rowViews = useMemo<RowView[]>(() => {
    return rows.map((row) => {
      try {
        const result = calculatePrice(row);

        const weekdayFee = result.breakdown
          .filter((b) => b.label.includes("weekday"))
          .reduce((sum, b) => sum + b.amount, 0);

        const holidayFee = result.breakdown
          .filter((b) => b.label.includes("weekend"))
          .reduce((sum, b) => sum + b.amount, 0);

        const highSeasonFee = result.breakdown
          .filter((b) => b.label.includes("high") || b.label.includes("top"))
          .reduce((sum, b) => sum + b.amount, 0);

        const discountRows = result.breakdown.filter((b) => b.amount < 0);
        const discountText =
          discountRows.length > 0
            ? discountRows.map((b) => b.label).join(" / ")
            : row.discountPlan || "-";

        return {
          kind: "success",
          row,
          total: result.total,
          deposit: result.deposit,
          basePrice: result.basePrice,
          carClass: result.carClass,
          message: "計算OK",
          breakdown: result.breakdown,
          hoursTotal: result.hoursTotal,
          chargeDays: result.chargeDays,
          summary: {
            weekdayFee,
            holidayFee,
            highSeasonFee,
            discountText,
            finalAmount: result.total,
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "計算エラー";

        return {
          kind: "error",
          row,
          total: null,
          deposit: null,
          basePrice: null,
          carClass: null,
          message,
          breakdown: [],
          hoursTotal: null,
          chargeDays: 0,
          summary: {
            weekdayFee: null,
            holidayFee: null,
            highSeasonFee: null,
            discountText: row.discountPlan || "-",
            finalAmount: null,
          },
        };
      }
    });
  }, [rows]);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm font-extrabold tracking-wide text-slate-700">
          RENTACAR CALCULATOR
        </p>

        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-blue-900">
          CSVをアップロードする
        </h1>

        <p className="mb-10 text-lg text-slate-500">
          CSVファイルを選択して、料金計算結果を一覧で確認できます。
        </p>

        <section className="rounded-[32px] bg-white p-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)] sm:p-10">
          <div className="mx-auto max-w-3xl">
            <label className="mb-4 block text-2xl font-bold text-blue-900">
              CSVファイル
            </label>

            <label
              className="block cursor-pointer"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="hidden"
              />

              <div className="mx-auto max-w-md">
                <div
                  className={`flex min-h-[100px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-6 text-center transition ${
                    isDragging
                      ? "border-slate-800 bg-blue-100"
                      : "border-slate-300 bg-slate-50"
                  }`}
                >
                  <p className="text-xl font-bold text-blue-900">
                    {isDragging ? "ここにドロップ" : "CSVをドラッグ＆ドロップ"}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    またはクリックして選択
                  </p>
                </div>
              </div>
            </label>
          </div>
        </section>

        <section className="mt-8 rounded-[32px] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <h2 className="mb-4 text-xl font-bold text-slate-500">
            読み込み結果 {rowViews.length}件
          </h2>

          {rowViews.length === 0 ? (
            <p className="text-slate-500">まだCSVが読み込まれていません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                    <th className="px-3 py-3">氏名</th>
                    <th className="px-3 py-3">希望車種</th>
                    <th className="px-3 py-3">貸出日時</th>
                    <th className="px-3 py-3">返却日時</th>
                    <th className="px-3 py-3">合計</th>
                    <th className="px-3 py-3">予約金</th>
                    <th className="px-3 py-3">状態</th>
                    <th className="px-3 py-3">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {rowViews.map((item) => {
                    const row = item.row;

                    return (
                      <tr key={row.id} className={getRowClass(item.kind)}>
                        <td className="px-3 py-3">{row.name}</td>
                        <td className="px-3 py-3">
                          {row.carType}
                          <div className="text-xs text-slate-500">
                            クラス: {item.carClass ?? "-"}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {row.pickupDate} {row.pickupTime}
                        </td>
                        <td className="px-3 py-3">
                          {row.returnDate} {row.returnTime}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {item.total !== null
                            ? `¥${formatCurrency(item.total)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {item.deposit !== null
                            ? `¥${formatCurrency(item.deposit)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-3">
                          <div
                            className={
                              item.kind === "success"
                                ? "text-green-700"
                                : "text-red-700"
                            }
                          >
                            <div className={getStatusBadgeClass(item.kind)}>
                              {item.kind === "success"
                                ? "計算OK"
                                : "計算エラー"}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-xs">
                              {item.message}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            詳細
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedItem && (
          <DetailModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </main>
  );
}
