import { Assistants } from "./assistants";

export const metadata = { title: "Assistants" };

export default function Page() {
  return (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Menu · Assistants (advanced)</div>
        <h1>Your<br />assistants.</h1>
        <p>Connect an outside AI assistant, then choose what it may do. North checks every ask against your rules, and it never gets your PayPal.</p>
      </div>
      <Assistants />
    </div>
  );
}
