import type { ProjectStatus } from '../enums';

export type SelectionRunStatus = 'PROPOSED' | 'APPLIED' | 'DISCARDED';
export type TeamMemberStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'LEFT';

export interface PersonRef {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SelectionCandidateView {
  applicationId: string;
  user: PersonRef;
  appliedRole: { id: string; title: string };
  hoursPerWeek: number;
  evaluation: {
    overall: number;
    technical: number;
    problemSolving: number;
    communication: number;
    projectFit: number;
    recommendedRoleTitle: string | null;
  } | null;
  decision: { selected: boolean; role: { id: string; title: string } | null; fit: number; reasons: string[] };
}

export interface SelectionRunView {
  id: string;
  projectId: string;
  status: SelectionRunStatus;
  summary: string;
  createdAt: string;
  appliedAt: string | null;
  roles: { id: string; title: string; seats: number; selected: number }[];
  candidates: SelectionCandidateView[];
}

export interface TeamMemberView {
  id: string;
  user: PersonRef;
  role: { id: string; title: string };
  status: TeamMemberStatus;
}

export interface TeamView {
  id: string;
  project: { id: string; slug: string; title: string; status: ProjectStatus };
  formedAt: string;
  members: TeamMemberView[];
}

/** The signed-in user's own memberships (for invitations and the sidebar). */
export interface MyMembershipView {
  memberId: string;
  status: TeamMemberStatus;
  role: { id: string; title: string };
  team: { id: string };
  project: { id: string; slug: string; title: string; status: ProjectStatus };
}
