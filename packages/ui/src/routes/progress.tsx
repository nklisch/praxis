import { RouteHeader } from "../components/route-header.js";

/**
 * Progress surface — top-level route stub.
 *
 * Placeholder registered so the top-nav "Progress" link resolves as a valid
 * typed route. Full implementation follows in the progress-map surface story.
 */
export function ProgressRoute() {
  return (
    <RouteHeader
      ornament="‖"
      kicker="PROGRESS"
      title="progress"
      deck="Your mastery map — where you've been, where to go next."
    />
  );
}
