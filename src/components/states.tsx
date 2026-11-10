// Plain-language states, the same everywhere: loading, empty and "that did not work". No timers, nothing moves on its own.
import { CircleAlert, Clock, Hourglass, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { isRateLimitMessage, RATE_LIMIT_MESSAGE } from "@/lib/ui/rate-limit";
import { useRateLimited } from "@/lib/ui/rate-limit-client";

export function Loading({ what = "this" }: { what?: string }) {
  return (
    <p role="status" className="n-note n-note-quiet">
      <Hourglass aria-hidden="true" />
      <span>Getting {what}. One moment.</span>
    </p>
  );
}

/** The calm answer to "too many": a quiet, amber-toned note (never red), with the plain sentence and, if the screen has one, a Try again button. */
function CalmWait({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="status" className="n-note n-note-wait">
      <Clock aria-hidden="true" />
      <div className="n-stack n-gap-2">
        <p>{RATE_LIMIT_MESSAGE}</p>
        {onRetry && <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

/** `touched` says what is safe to know: "Nothing was charged." / "Nothing was changed." */
export function ErrorNote({ what = "that", touched = "Nothing was changed.", onRetry }: { what?: string; touched?: string; onRetry?: () => void }) {
  const busy = useRateLimited();
  if (busy) return <CalmWait onRetry={onRetry} />;
  return (
    <div role="alert" className="n-note n-note-stop">
      <CircleAlert aria-hidden="true" />
      <div className="n-stack n-gap-2">
        <p>{`I could not get ${what}. ${touched} Try again.`}</p>
        {onRetry && <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

/** A message that came back from a step (the server's own plain words). "Too many" is shown calmly, never as a red error. */
export function ProblemNote({ children, message, style }: { children?: ReactNode; message?: string; style?: React.CSSProperties }) {
  const busy = useRateLimited();
  if (busy || isRateLimitMessage(message)) return <CalmWait />;
  return (
    <p role="alert" className="n-note n-note-stop" style={style}>
      <span>{message ?? children}</span>
    </p>
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
