import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChangeRule } from "./change-rule";

// Next 16 wants request data (params) read inside <Suspense>.
async function Inner({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "big_buy" && kind !== "late_night") notFound();
  return <ChangeRule kind={kind} />;
}

export default function ChangeRulePage({ params }: { params: Promise<{ kind: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="text-xl">Loading…</p>}>
      <Inner params={params} />
    </Suspense>
  );
}
