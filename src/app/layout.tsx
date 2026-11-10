import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { CsrfFetch } from "@/components/csrf-fetch";
import { RateLimitWatch } from "@/components/rate-limit-watch";
import { AppearanceProvider } from "@/components/shell/appearance";
import { AppShell } from "@/components/shell/app-shell";
import { TraceProvider } from "@/components/shell/trace";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "North", template: "%s · North" },
  description: "You set the rules. You can override them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="bloom" data-mode="light" suppressHydrationWarning>
      <body>
        {/* Runs before the first paint: puts the saved theme and the light/dark choice on <html>, so the page never flashes the wrong look.
            It only reads the display choices saved by Appearance. */}
        <Script id="north-appearance-init" strategy="beforeInteractive">
          {`(function(){try{var p=JSON.parse(localStorage.getItem("north-appearance")||"{}");var t=["tide","dune","grove","opal","bloom"].indexOf(p.theme)>-1?p.theme:"bloom";var d=p.mode==="dark"||(p.mode!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=t;r.dataset.mode=d?"dark":"light";}catch(e){}})();`}
        </Script>
        <CsrfFetch />
        <RateLimitWatch />
        <AppearanceProvider forceVideoSafe={process.env.VIDEO_SAFE === "1"}>
          <TraceProvider>
            {/* The shell reads the current address (to mark the tab and the login page), which Next only knows per request. */}
            <Suspense fallback={null}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </TraceProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
