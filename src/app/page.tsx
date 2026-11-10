import { Suspense } from "react";
import { practiceLogin } from "@/lib/demo/practice";
import { isSignedIn } from "@/lib/auth/viewer";
import { Landing } from "./_landing/landing";
import { Home } from "./home";

// "/" is the public front page for someone who is not signed in, and Home for someone who is. This only chooses what to draw:
// Home's data comes from login-checked routes, and the landing page holds nothing private.
async function Front() {
  if (await isSignedIn()) return <Home />;
  return <Landing practice={practiceLogin()} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Front />
    </Suspense>
  );
}
