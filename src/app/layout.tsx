import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "North",
  description: "You set the rules. You can override them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="absolute left-2 top-2 -translate-y-20 rounded-lg bg-accent px-4 py-2 text-accent-ink focus:translate-y-0"
        >
          Skip to the page
        </a>
        <header className="border-b border-line bg-card">
          <nav aria-label="Main" className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-1 px-3 py-1">
            <Link href="/" className="rounded-lg px-2 py-2 text-2xl font-bold">
              North
            </Link>
            <div className="flex flex-wrap text-base font-semibold">
              <Link href="/" className="whitespace-nowrap rounded-lg px-2.5 py-3">
                My money
              </Link>
              <Link href="/shop" className="whitespace-nowrap rounded-lg px-2.5 py-3">
                Shop
              </Link>
              <Link href="/check" className="whitespace-nowrap rounded-lg px-2.5 py-3">
                Check a deal
              </Link>
              <Link href="/rules" className="whitespace-nowrap rounded-lg px-2.5 py-3">
                My rules
              </Link>
            </div>
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
