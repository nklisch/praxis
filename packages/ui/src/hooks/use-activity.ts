import type { ActivityItem } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseActivityResult {
  items: readonly ActivityItem[];
  dismiss: (id: string) => void;
}

/**
 * Subscribe to the activity stream for the lifetime of the component.
 * Returns a stable list of currently-visible items + a dismiss callback.
 *
 * Mount once at the root of the renderer (in <StatusStrip/>). Multiple
 * consumers are safe but waste IPC overhead — the strip is the only
 * intended consumer.
 */
export function useActivity(): UseActivityResult {
  const client = usePraxisClient();
  const [items, setItems] = useState<readonly ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const local = new Map<string, ActivityItem>();

    (async () => {
      try {
        for await (const event of client.activity.events()) {
          if (cancelled) break;
          switch (event.kind) {
            case "snapshot":
              local.clear();
              for (const it of event.items) local.set(it.id, it);
              break;
            case "added":
            case "updated":
              local.set(event.item.id, event.item);
              break;
            case "removed":
              local.delete(event.id);
              break;
          }
          setItems(Array.from(local.values()));
        }
      } catch {
        // stream errored — fall to empty until next mount
        if (!cancelled) setItems([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const dismiss = (id: string) => {
    void client.activity.dismiss(id);
  };

  return { items, dismiss };
}
