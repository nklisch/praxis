import { RouteHeader } from "../components/route-header.js";

/**
 * Concept maps surface — top-level route stub.
 *
 * This is a placeholder registered so the top-nav "Concept maps" link resolves
 * as a valid typed route. Full implementation follows in the concept-maps
 * surface story. Navigate to a course's concept maps via
 * `/courses/$courseId/concept-maps`.
 */
export function ConceptMapsRoute() {
  return (
    <RouteHeader
      ornament="‡"
      kicker="CONCEPT MAPS"
      title="concept maps"
      deck="Visual representations of your knowledge."
    />
  );
}
