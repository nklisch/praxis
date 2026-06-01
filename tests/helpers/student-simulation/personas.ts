import type { StudentPersona } from "@praxis/core/types";

export const HESITANT_NURSING_STUDENT: StudentPersona = {
  id: "hesitant-nursing-student",
  label: "Hesitant nursing student",
  gradeBand: "undergrad",
  traits: ["asks for confirmation", "may choose plausible distractors"],
  wrongAnswerStyle: "partial",
};

export const CONFIDENT_PRACTICE_STUDENT: StudentPersona = {
  id: "confident-practice-student",
  label: "Confident practice student",
  gradeBand: "undergrad",
  traits: ["answers quickly", "accepts short feedback loops"],
  wrongAnswerStyle: "guess",
};

export const STUDENT_SIMULATION_PERSONAS = [
  HESITANT_NURSING_STUDENT,
  CONFIDENT_PRACTICE_STUDENT,
] as const;
