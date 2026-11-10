import type { ExerciseDef } from '../exercise';
import { EASY } from './easy';
import { HARD } from './hard';
import { INTERMEDIATE } from './intermediate';

/** Every Debug exercise, in display order. Content lives in code, reviewed like code. */
export const CATALOGUE: ExerciseDef[] = [...EASY, ...INTERMEDIATE, ...HARD];
