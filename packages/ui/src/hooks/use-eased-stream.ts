import { useEffect, useRef, useState } from "react";

export interface UseEasedStreamOptions {
  /**
   * Target characters-per-second for steady-state release. The hook adapts
   * upward when the buffer grows large (the model is well ahead) so total
   * stream time stays close to raw — the easing only affects perceived rhythm.
   * Default: 80 cps (~comfortable reading rate for streamed prose).
   */
  charsPerSecond?: number;
  /**
   * If buffer exceeds this many characters, accelerate release linearly so the
   * displayed text catches up. Prevents permanent lag for long messages.
   * Default: 400 chars.
   */
  catchUpAt?: number;
  /**
   * If true, eases off (returns raw immediately). Use in tests or low-end
   * environments where the rAF loop overhead is not wanted. Default: false.
   */
  disabled?: boolean;
}

/**
 * Returns a paced version of `raw` whose displayed length grows toward
 * `raw.length` at ~`charsPerSecond` characters per second, accelerating when
 * the gap exceeds `catchUpAt`.
 *
 * Implementation: rAF-driven release loop. Internal state holds `displayedLen`;
 * each frame computes how many chars to release based on time delta and current
 * lag. When `raw` resets (raw.length < displayedLen), `displayedLen` resets too.
 *
 * Total effective stream time stays close to the raw stream — this changes
 * rhythm, not duration.
 */
export function useEasedStream(raw: string, options?: UseEasedStreamOptions): string {
  const { charsPerSecond = 80, catchUpAt = 400, disabled = false } = options ?? {};

  // Counter to force re-renders from inside the rAF loop without storing
  // displayed text in state (storing it would cause double-renders).
  const [, setTick] = useState(0);

  const displayedLen = useRef(0);
  const rafHandle = useRef<number | null>(null);
  const lastTimestamp = useRef<number | null>(null);
  const isLoopRunning = useRef(false);

  useEffect(() => {
    if (disabled) return;

    // Reset when raw shrinks (e.g. a new message stream started).
    if (raw.length < displayedLen.current) {
      displayedLen.current = 0;
      lastTimestamp.current = null;
      setTick((t) => t + 1);
    }

    // If there's nothing to display yet, don't start the loop.
    if (raw.length === 0) return;

    // If the loop is already running, it will pick up the new raw length
    // on its next frame — no need to schedule another one.
    if (isLoopRunning.current) return;

    // Start the rAF loop.
    isLoopRunning.current = true;

    const tick = (timestamp: number) => {
      if (lastTimestamp.current === null) {
        lastTimestamp.current = timestamp;
      }

      const elapsed = (timestamp - lastTimestamp.current) / 1000; // seconds
      lastTimestamp.current = timestamp;

      const lag = raw.length - displayedLen.current;
      const base = charsPerSecond * elapsed;
      const multiplier = 1 + Math.max(0, lag - catchUpAt) / catchUpAt;
      const release = base * multiplier;

      displayedLen.current = Math.min(raw.length, displayedLen.current + release);

      // Force a re-render so the consumer sees the new slice.
      setTick((t) => t + 1);

      if (displayedLen.current < raw.length) {
        rafHandle.current = requestAnimationFrame(tick);
      } else {
        // Caught up — stop the loop.
        rafHandle.current = null;
        isLoopRunning.current = false;
        lastTimestamp.current = null;
      }
    };

    rafHandle.current = requestAnimationFrame(tick);

    return () => {
      // Cleanup: cancel any pending frame on unmount or deps change.
      if (rafHandle.current !== null) {
        cancelAnimationFrame(rafHandle.current);
        rafHandle.current = null;
      }
      isLoopRunning.current = false;
      lastTimestamp.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw.length, disabled, charsPerSecond, catchUpAt]);

  if (disabled) return raw;

  return raw.slice(0, Math.floor(displayedLen.current));
}
