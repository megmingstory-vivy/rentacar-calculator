import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Rentacar Calculator",
  description: "CSVからレンタカー料金を計算するツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-slate-100 text-slate-900">
        {children}

        {/* トースト表示 */}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            classNames: {
              toast: "rounded-xl shadow-md",
              title: "text-sm font-semibold",
            },
          }}
        />
      </body>
    </html>
  );
}
