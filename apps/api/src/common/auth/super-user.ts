/**
 * Admins double as test accounts: they skip entry gates (deadlines, CV thresholds, reapply
 * cooldowns, course and seat limits, join windows, daily AI PM runs) so every flow can be
 * exercised end to end. Scores are still computed honestly; only the gates move.
 */
export const isSuperUser = (user: { role: string } | null | undefined): boolean => user?.role === 'ADMIN';
