import type { UpdateCheckResult } from "@praxis/core/services";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

const DISMISS_KEY = "praxis.update.dismissedVersion";

export interface UseUpdateCheckResult {
  /** Null while the check is in flight; settled `UpdateCheckResult` otherwise. */
  result: UpdateCheckResult | null;
  /** Persist a per-version dismissal in localStorage and clear the visible state. */
  dismiss: () => void;
  /** True when the latest available version has been dismissed for this user. */
  dismissed: boolean;
}

/**
 * Run the update check on mount, surface the result, and expose a per-version
 * dismissal toggle backed by localStorage. Idempotent and side-effect-free in
 * the absence of `PRAXIS_UPDATE_FEED_URL` — the underlying service returns
 * `{ status: "disabled" }` and the banner stays hidden.
 *
 * The renderer doesn't pass a current version — the IPC handler reads
 * `app.getVersion()` in the main process and threads it through to the
 * service.
 */
export function useUpdateCheck(): UseUpdateCheckResult {
  const client = usePraxisClient();
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.update
      .checkLatest()
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled)
          setResult({ status: "error", message: "ipc-failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const dismiss = () => {
    if (result?.status === "available") {
      try {
        window.localStorage.setItem(DISMISS_KEY, result.latest.version);
      } catch {
        // localStorage unavailable (private browsing, quota): silent no-op.
      }
      setResult({ status: "up-to-date", current: result.current });
    }
  };

  const dismissed = (() => {
    if (result?.status !== "available") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === result.latest.version;
    } catch {
      return false;
    }
  })();

  return { result, dismiss, dismissed };
}
