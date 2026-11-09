// Plain-language states, the same everywhere: loading, empty and "that did not work". No timers, nothing moves on its own.
import { CircleAlert, Hourglass, Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function Loading({ what = "this" }: { what?: string }) {
  return (
    <p role="status" className="n-note n-note-quiet">
      <Hourglass aria-hidden="true" />
      <span>Getting {what}. One moment.</span>
    </p>
  );
}

/** `touched` says what is safe to know: "Nothing was charged." / "Nothing was changed." */
export function ErrorNote({ what = "that", touched = "Nothing was changed.", onRetry }: { what?: string; touched?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="n-note n-note-stop">
      <CircleAlert aria-hidden="true" />
      <div className="n-stack" style={{ gap: 10 }}>
        <p>{`I could not get ${what}. ${touched} Try again.`}</p>
        {onRetry && <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="n-note n-note-quiet">
      <Inbox aria-hidden="true" />
      <div className="n-stack" style={{ gap: 10 }}>
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}
