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
  title: "Money Management",
  description: "Kelola keuangan Anda dengan mudah",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
          <JotaiProvider>{children}</JotaiProvider>
        </body>
    </html>
  );
}
