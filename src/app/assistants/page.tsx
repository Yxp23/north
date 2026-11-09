import { Assistants } from "./assistants";

export const metadata = { title: "Assistants" };

export default function Page() {
  return (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">My money · Assistants</div>
        <h1>Assistants<br />you connected.</h1>
        <p>An AI assistant can ask North to buy things. North checks every ask against your rules.</p>
      </div>
      <Assistants />
    </div>
  );
}
