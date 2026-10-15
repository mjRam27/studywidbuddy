import type { SkillCategory, SkillLevel } from '../enums';

export interface Skill {
  id: string;
  slug: string;
  name: string;
  category: SkillCategory;
}

export interface SetUserSkillRequest {
  skillId: string;
  level: SkillLevel;
}
