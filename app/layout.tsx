import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "에이스 정산 계산기",
  description: "카톡 작업 내역으로 선수 지급액을 계산하고, 내 계정에 정산 기록을 보관하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
