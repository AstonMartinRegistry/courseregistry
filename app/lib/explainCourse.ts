import type { Dispatch, SetStateAction } from "react";
import type { CourseResult } from "./types";

function withPrerequisiteLine(text: string) {
  if (!text || /\bprerequisites?:/i.test(text)) return text;
  return `${text}\n\nPrerequisites: None mentioned`;
}

export async function fetchCourseExplanation({
  query,
  courseTitle,
  courseDescr,
}: {
  query: string;
  courseTitle: string | null;
  courseDescr: string | null;
}): Promise<string> {
  const response = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, courseTitle, courseDescr }),
  });
  if (!response.ok) throw new Error("Explain failed");
  return (await response.text()).trim();
}

async function revealExplanation(
  courseId: number,
  text: string,
  setExplanations: Dispatch<SetStateAction<Record<number, string>>>,
) {
  const words = text.match(/\S+\s*/g) ?? [];
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || words.length === 0) {
    setExplanations((prev) => ({ ...prev, [courseId]: text }));
    return;
  }

  let visibleText = "";
  const wordsPerFrame = 2;
  for (let index = 0; index < words.length; index += wordsPerFrame) {
    visibleText += words.slice(index, index + wordsPerFrame).join("");
    const nextText = visibleText;
    setExplanations((prev) => ({ ...prev, [courseId]: nextText }));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
}

export async function explainCourses(
  courses: CourseResult[],
  query: string,
  setExplanations: Dispatch<SetStateAction<Record<number, string>>>,
  options: { animateReveal?: boolean } = {},
) {
  await Promise.all(
    courses.map(async (course) => {
      try {
        const text = await fetchCourseExplanation({
          query,
          courseTitle: course.course_title ?? null,
          courseDescr: course.course_descr ?? null,
        });
        const explanation = text || course.course_descr || "";
        if (options.animateReveal) {
          await revealExplanation(
            course.id,
            withPrerequisiteLine(explanation),
            setExplanations,
          );
        } else {
          setExplanations((prev) => ({ ...prev, [course.id]: explanation }));
        }
      } catch (err) {
        console.warn("Explain failed for course", course.id, err);
        setExplanations((prev) => ({
          ...prev,
          [course.id]: course.course_descr || "",
        }));
      }
    }),
  );
}
