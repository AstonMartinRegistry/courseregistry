export type CourseTerm = "autumn26" | "spring26";

export const TERM_LABELS: Record<CourseTerm, string> = {
  autumn26: "Autumn 2026",
  spring26: "Spring 2026",
};

export const STANFORD_NAVIGATOR_URL = (code: string, term: CourseTerm = "spring26") =>
  `https://navigator.stanford.edu/classes?classes%5BrefinementList%5D%5BtermOffered%5D%5B0%5D=${encodeURIComponent(TERM_LABELS[term])}&classes%5Bquery%5D=${encodeURIComponent(code)}`;
