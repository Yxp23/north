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
        <p className="n-note n-note-quiet" style={{ marginBottom: 16 }}>
          <strong>This is a practice version.</strong> The practice account is filled in for you. It only has practice money.
        </p>
      )}
      <LoginForm practice={practice} />
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="n-col" style={{ maxWidth: 480, margin: "40px auto 0" }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Welcome</div>
        <h1>Log in<br />to North.</h1>
      </div>
      <Suspense fallback={<p role="status" className="n-note n-note-quiet">One moment.</p>}>
        <Form />
      </Suspense>
    </div>
  );
}
