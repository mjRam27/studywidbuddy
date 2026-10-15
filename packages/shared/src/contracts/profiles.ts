import type { SkillLevel, SkillSource, Visibility } from '../enums';

export interface ProfileSkill {
  skillId: string;
  slug: string;
  name: string;
  level: SkillLevel;
  source: SkillSource;
}

export interface Profile {
  userId: string;
  username: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  languages: string[];
  avatarUrl: string | null;
  visibility: Visibility;
  skills: ProfileSkill[];
  /** True when the caller is looking at their own profile. */
  isSelf: boolean;
  memberSince: string;
  learning: {
    active: { courseSlug: string; title: string; level: SkillLevel; progress: number }[];
    completed: { courseSlug: string; title: string; level: SkillLevel; completedAt: string }[];
  };
}

export interface UpdateProfileRequest {
  displayName?: string;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  timezone?: string | null;
  languages?: string[];
  visibility?: Visibility;
}
