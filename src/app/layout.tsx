import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { CsrfFetch } from "@/components/csrf-fetch";
import { SiteNav } from "@/components/site-nav";
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
        <CsrfFetch />
        <header className="border-b border-line bg-card">
          <Suspense fallback={<div className="mx-auto max-w-xl px-3 py-3 text-2xl font-bold">North</div>}>
            <SiteNav />
          </Suspense>
        </header>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
