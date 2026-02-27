export const STANFORD_NAVIGATOR_URL = (code: string) =>
  `https://navigator.stanford.edu/classes?classes%5BrefinementList%5D%5BtermOffered%5D%5B0%5D=Spring%202026&classes%5Bquery%5D=${encodeURIComponent(code)}`;
