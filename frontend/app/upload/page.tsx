// frontend\app\upload\page.tsx
"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { parseReservationRow } from "../lib/parseReservationCsv";
import { calculatePrice } from "../lib/calculatePrice";
import type { CsvRow, Reservation } from "../types/reservation";
import type { PriceBreakdownRow } from "../types/pricing";

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
      carClass: string;
      message: string;
      breakdown: PriceBreakdownRow[];
      summary: BreakdownSummary;
      hoursTotal: number;
    }
  | {
      kind: "error";
      row: Reservation;
      total: null;
      deposit: null;
      carClass: null;
      message: string;
      breakdown: PriceBreakdownRow[];
      summary: BreakdownSummary;
      hoursTotal: null;
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
    const value = record[key];
    if (
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && value.trim() === "")
    ) {
      return typeof value === "string" || typeof value === "number"
        ? value
        : String(value);
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

  const breakdownLines =
    item.breakdown.length > 0
      ? item.breakdown.map((line) => {
          const amountText =
            line.amount < 0
              ? `-¥${formatCurrency(Math.abs(line.amount))}`
              : `¥${formatCurrency(line.amount)}`;
          return `　　　　${line.label}＝${amountText}`;
        })
      : [];

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
    item.total !== null
      ? `基本料金　　　　　　：${formatCurrency(item.total)}円${usageHoursText}`
      : "基本料金　　　　　　：-";

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

●ご利用料金(税込表記)

${basePriceLine}

${breakdownLines.length > 0 ? breakdownLines.join("\n") : "料金内訳：-"}


合計：${item.total !== null ? `${formatCurrency(item.total)}円` : "-"}

予約金：${item.deposit !== null ? `${formatCurrency(item.deposit)}円` : "-"}`;

  const handleCopyMailBody = async () => {
    try {
      await navigator.clipboard.writeText(mailBody);
      alert("メール本文をコピーしました");
    } catch (error) {
      console.error(error);
      alert("コピーに失敗しました");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{row.name}</h2>
            <div className="mt-2">
              <span className={getStatusBadgeClass(item.kind)}>
                {item.kind === "success" ? "計算OK" : "計算エラー"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>

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

        <div className="grid gap-6 md:grid-cols-2">
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
                  {getField(row, ["nameKana", "kana", "ご契約者様　氏名_カナ"])}
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

          <section className="rounded-lg border p-4">
            <h3 className="mb-3 text-lg font-semibold">金額情報</h3>
            <dl className="space-y-2 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">平日料金</dt>
                <dd className="font-semibold">
                  {item.summary.weekdayFee !== null
                    ? `¥${formatCurrency(item.summary.weekdayFee)}`
                    : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">休日料金</dt>
                <dd className="font-semibold">
                  {item.summary.holidayFee !== null
                    ? `¥${formatCurrency(item.summary.holidayFee)}`
                    : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">ハイシーズン加算</dt>
                <dd className="font-semibold">
                  {item.summary.highSeasonFee !== null
                    ? `¥${formatCurrency(item.summary.highSeasonFee)}`
                    : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">割引内容</dt>
                <dd>{item.summary.discountText || "-"}</dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">最終金額</dt>
                <dd className="font-semibold">
                  {item.summary.finalAmount !== null
                    ? `¥${formatCurrency(item.summary.finalAmount)}`
                    : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">合計</dt>
                <dd className="font-semibold">
                  {item.total !== null ? `¥${formatCurrency(item.total)}` : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">予約金</dt>
                <dd className="font-semibold">
                  {item.deposit !== null
                    ? `¥${formatCurrency(item.deposit)}`
                    : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">残金</dt>
                <dd className="font-semibold">
                  {item.total !== null && item.deposit !== null
                    ? `¥${formatCurrency(item.total - item.deposit)}`
                    : "-"}
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">状態</dt>
                <dd>
                  <span className={getStatusBadgeClass(item.kind)}>
                    {item.kind === "success" ? "計算OK" : "計算エラー"}
                  </span>
                </dd>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-gray-500">内容</dt>
                <dd
                  className={
                    item.kind === "success"
                      ? "text-green-700"
                      : "whitespace-pre-wrap font-medium text-red-700"
                  }
                >
                  {item.message}
                </dd>
              </div>
            </dl>
          </section>

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
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-lg border p-4 md:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">メール送信用</h3>
              <button
                type="button"
                onClick={handleCopyMailBody}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                コピー
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
  );
}

export default function UploadPage() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedItem, setSelectedItem] = useState<RowView | null>(null);

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
          const parsed = results.data.map((row, index) =>
            parseReservationRow(row, index),
          );
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
          carClass: result.carClass,
          message: "計算OK",
          breakdown: result.breakdown,
          hoursTotal: result.hoursTotal,
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
          carClass: null,
          message,
          breakdown: [],
          hoursTotal: null,
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
    <main className="mx-auto max-w-7xl p-8">
      <h1 className="mb-6 text-2xl font-bold">CSVアップロード</h1>

      <div className="mb-6 rounded-lg border p-4">
        <label className="mb-2 block font-medium">CSVファイルを選択</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        {fileName && (
          <p className="mt-2 text-sm text-gray-600">選択中: {fileName}</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-xl font-semibold">
          読み込み結果 {rowViews.length}件
        </h2>

        {rowViews.length === 0 ? (
          <p className="text-gray-600">まだCSVが読み込まれていません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-3 py-2">氏名</th>
                  <th className="px-3 py-2">希望車種</th>
                  <th className="px-3 py-2">貸出日時</th>
                  <th className="px-3 py-2">返却日時</th>
                  <th className="px-3 py-2">合計</th>
                  <th className="px-3 py-2">予約金</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">詳細</th>
                </tr>
              </thead>
              <tbody>
                {rowViews.map((item) => {
                  const row = item.row;

                  return (
                    <tr key={row.id} className={getRowClass(item.kind)}>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">
                        {row.carType}
                        <div className="text-xs text-gray-500">
                          クラス: {item.carClass ?? "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row.pickupDate} {row.pickupTime}
                      </td>
                      <td className="px-3 py-2">
                        {row.returnDate} {row.returnTime}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {item.total !== null
                          ? `¥${formatCurrency(item.total)}`
                          : "-"}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {item.deposit !== null
                          ? `¥${formatCurrency(item.deposit)}`
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div
                          className={
                            item.kind === "success"
                              ? "text-green-700"
                              : "text-red-700"
                          }
                        >
                          <div className={getStatusBadgeClass(item.kind)}>
                            {item.kind === "success" ? "計算OK" : "計算エラー"}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-xs">
                            {item.message}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
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
      </div>

      {selectedItem && (
        <DetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </main>
  );
}
