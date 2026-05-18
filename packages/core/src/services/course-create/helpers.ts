/** Normalize a concept name for case-insensitive set/map membership checks. */
export const normalizeConceptName = (name: string): string => name.trim().toLowerCase();
