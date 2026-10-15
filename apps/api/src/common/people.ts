import type { Prisma } from '@prisma/client';
import type { PersonRef } from '@studywidbuddy/shared';

/** The public bits of a user, for embedding in other views. Never includes email. */
export const personSelect = {
  id: true,
  profile: { select: { username: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;

export type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;

export const toPerson = (u: PersonRow): PersonRef => ({
  id: u.id,
  username: u.profile?.username ?? '',
  displayName: u.profile?.displayName ?? '',
  avatarUrl: u.profile?.avatarUrl ?? null,
});
