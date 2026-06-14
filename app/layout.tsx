import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { JotaiProvider } from "@/components/jotai-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TONAS — Money Management",
  description: "Semua berawal dari pengelolaan yang tepat. Kelola keuangan kamu dengan TONAS.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
          <JotaiProvider>{children}</JotaiProvider>
        </body>
    </html>
  );
}
