import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isDemoMode } from "@/lib/ledger/server";
import { AssistantChat } from "./assistant-chat";

// Demo only: "Any AI assistant", a stand-in for an outside AI that connects to North through MCP.
async function Gate() {
  await connection();
  if (!isDemoMode()) notFound();
  return <AssistantChat />;
}

export default function AssistantDemoPage() {
  return (
    <Suspense fallback={<p role="status" className="n-t-xl">Loading…</p>}>
      <Gate />
    </Suspense>
  );
}
