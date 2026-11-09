import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isDemoMode } from "@/lib/ledger/server";
import { DemoTools } from "./demo-tools";

export const metadata = { title: "Demo tools" };

// Demo only (practice account, demo mode). Everything here is for showing North, and none of it can loosen a rule.
async function Gate() {
  await connection();
  if (!isDemoMode()) notFound();
  return <DemoTools />;
}

export default function Page() {
  return (
    <Suspense fallback={<p role="status" className="n-note n-note-quiet">One moment.</p>}>
      <Gate />
    </Suspense>
  );
}
