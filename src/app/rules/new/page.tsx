import { Suspense } from "react";
import { NewRule } from "./new-rule";

// "?said=..." fills the box with what the person already typed in Ask North. Nothing is saved until they read the rule back and say yes.
async function Inner({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const { said } = await searchParams;
  return <NewRule initialWords={(said ?? "").slice(0, 300)} />;
}

export default function NewRulePage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="text-xl">Loading…</p>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}
