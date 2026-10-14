import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { initialCourses, type Course } from './data/courses';

type CoursesState = { active: Course[]; leaveCourse: (id: string) => void };

const CoursesContext = createContext<CoursesState | null>(null);

export function CoursesProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(initialCourses);
  const value = useMemo<CoursesState>(
    () => ({ active, leaveCourse: (id) => setActive((cs) => cs.filter((c) => c.id !== id)) }),
    [active],
  );
  return <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>;
}

export function useCourses() {
  const ctx = useContext(CoursesContext);
  if (!ctx) throw new Error('useCourses must be used inside CoursesProvider');
  return ctx;
}
