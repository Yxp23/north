import { Suspense } from "react";
import { connection } from "next/server";
import { isDemoDeployment } from "@/lib/demo/mode";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · North" };

// In the judges' demo deployment, the practice account is shown here (it holds practice money only). Nowhere else.
async function Form() {
  await connection(); // read the settings when the page is asked for, not when it is built
  const practice = isDemoDeployment() && process.env.DEMO_LOGIN_EMAIL && process.env.DEMO_LOGIN_PASSWORD
    ? { email: process.env.DEMO_LOGIN_EMAIL, password: process.env.DEMO_LOGIN_PASSWORD }
    : null;
  return (
    <>
      {practice && (
        <p className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-base">
          <strong>This is a practice version.</strong> The practice account is filled in for you. It only has practice money.
        </p>
      )}
      <LoginForm practice={practice} />
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Log in to North</h1>
      <p className="text-lg">You set the rules. You can override them.</p>
      <Suspense fallback={<p className="text-lg">One moment…</p>}>
        <Form />
      </Suspense>
    </div>
  );
}
