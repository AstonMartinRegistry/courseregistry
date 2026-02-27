export interface CourseResult {
  id: number;
  course_codes: string;
  course_title: string | null;
  course_descr: string | null;
  instructors?: string | null;
  similarity: number;
  explanation?: string | null;
}
