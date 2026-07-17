import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SerialProvider } from "@/components/SerialProvider";
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
  title: "Fingerstyrkemåler",
  description: "Kalibrering og treningsøkter for HX711-basert fingerstyrkemåler",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="no"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SerialProvider>
          <nav
            className="flex gap-4 border-b px-4 py-3 text-sm font-medium"
            style={{ borderColor: "var(--viz-border)" }}
          >
            <Link href="/">Kalibrering</Link>
            <Link href="/trening">Treningsøkter</Link>
          </nav>
          {children}
        </SerialProvider>
      </body>
    </html>
  );
}
