import type { Metadata } from "next";
import { Suspense } from "react";
import { CsrfFetch } from "@/components/csrf-fetch";
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
    <html lang="en">
      <body>
        <CsrfFetch />
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
