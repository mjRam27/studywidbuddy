import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ConnectGithubResponse,
  GithubStatus,
  ProjectRepoView,
  AgentRunSummary,
  AgentRunView,
  AgentToolCallView,
  ChatMessageView,
  ChatPage,
  MeetingKind,
  MeetingView,
  PmOverview,
  AssessmentSummary,
  AssessmentView,
  CourseContentView,
  LessonContentUpdate,
  StudyLessonView,
  TutorAskRequest,
  TutorAskResponse,
  TutorMessageView,
  ActivityItem,
  CreateTaskRequest,
  PlanProposalView,
  SprintView,
  TaskCard,
  TaskDetail,
  TaskStatus,
  UpdateTaskRequest,
  WorkspaceOverview,
  MyMembershipView,
  SelectionRunView,
  TeamView,
  AiStatus,
  InterviewView,
  InterviewSlots,
  InterviewTurnRequest,
  InterviewTurnResponse,
  ApplicationView,
  CourseDetail,
  CourseRecommendation,
  CourseSummary,
  CreateApplicationRequest,
  EnrollmentView,
  LearningStats,
  MyLearningResponse,
  Page,
  Profile,
  ProfileSkill,
  ProjectDetail,
  ProjectListQuery,
  ProjectSummary,
  Skill,
  SkillLevel,
  UpdateProfileRequest,
} from '@studywidbuddy/shared';
import { firstValueFrom } from 'rxjs';
import { API } from './api-error';

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  return p;
};

/** Typed REST client. One method per endpoint; components never build URLs. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private get<T>(path: string, query: object = {}) {
    return firstValueFrom(this.http.get<T>(API + path, { params: params(query) }));
  }
  private post<T>(path: string, body: unknown = null) {
    return firstValueFrom(this.http.post<T>(API + path, body));
  }
  private put<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.put<T>(API + path, body));
  }
  private patch<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.patch<T>(API + path, body));
  }
  private delete<T>(path: string) {
    return firstValueFrom(this.http.delete<T>(API + path));
  }

  // Auth extras
  verifyEmail = (token: string) => this.post<void>('/auth/verify-email', { token });
  resendVerification = () => this.post<void>('/auth/resend-verification');
  forgotPassword = (email: string) => this.post<void>('/auth/forgot-password', { email });
  resetPassword = (token: string, password: string) => this.post<void>('/auth/reset-password', { token, password });

  // Profiles & skills
  myProfile = () => this.get<Profile>('/me/profile');
  updateProfile = (body: UpdateProfileRequest) => this.patch<Profile>('/me/profile', body);
  completeOnboarding = () => this.post<Profile>('/me/onboarding/complete');
  profile = (username: string) => this.get<Profile>(`/profiles/${encodeURIComponent(username)}`);
  searchSkills = (q: string, limit = 20) => this.get<Skill[]>('/skills', { q, limit });
  mySkills = () => this.get<ProfileSkill[]>('/me/skills');
  setSkill = (skillId: string, level: SkillLevel) => this.put<ProfileSkill[]>(`/me/skills/${skillId}`, { level });
  removeSkill = (skillId: string) => this.delete<ProfileSkill[]>(`/me/skills/${skillId}`);

  // Learning
  courses = (q: { q?: string; level?: SkillLevel; category?: string } = {}) => this.get<CourseSummary[]>('/courses', q);
  course = (slug: string) => this.get<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
  myLearning = () => this.get<MyLearningResponse>('/me/learning');
  learningStats = () => this.get<LearningStats>('/me/learning/stats');
  courseRecommendations = () => this.get<CourseRecommendation[]>('/me/learning/recommendations');
  enroll = (courseId: string, level: SkillLevel) => this.post<EnrollmentView>('/enrollments', { courseId, level });
  enrollment = (id: string) => this.get<EnrollmentView>(`/enrollments/${id}`);
  deregister = (id: string) => this.post<void>(`/enrollments/${id}/deregister`);
  completeLesson = (id: string, lessonId: string) =>
    this.post<EnrollmentView>(`/enrollments/${id}/lessons/${lessonId}/complete`);
  completeCourse = (id: string) => this.post<EnrollmentView>(`/enrollments/${id}/complete`);

  // Projects
  projects = (q: ProjectListQuery = {}) => this.get<Page<ProjectSummary>>('/projects', q);
  project = (slug: string) => this.get<ProjectDetail>(`/projects/${encodeURIComponent(slug)}`);
  /** Multipart: the form fields plus the CV (PDF). */
  apply = (projectId: string, body: CreateApplicationRequest, cv: File | null) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
    if (cv) form.append('cv', cv, cv.name);
    return this.post<ApplicationView>(`/projects/${projectId}/applications`, form);
  };
  /** Same-origin link to download the CV (the auth interceptor doesn't apply to plain links). */
  downloadCv = (id: string) => firstValueFrom(this.http.get(`${API}/applications/${id}/cv`, { responseType: 'blob' }));
  retryScreening = (id: string) => this.post<ApplicationView>(`/applications/${id}/screening/retry`);
  myApplications = () => this.get<ApplicationView[]>('/me/applications');
  application = (id: string) => this.get<ApplicationView>(`/applications/${id}`);
  withdrawApplication = (id: string) => this.post<ApplicationView>(`/applications/${id}/withdraw`);

  // AI interview
  aiStatus = () => this.get<AiStatus>('/ai/status');
  interviewForApplication = (applicationId: string) =>
    this.get<InterviewView>(`/applications/${applicationId}/interview`);
  interviewSlots = (id: string) => this.get<InterviewSlots>(`/interviews/${id}/slots`);
  scheduleInterview = (id: string, at: string) => this.post<InterviewView>(`/interviews/${id}/schedule`, { at });
  startInterview = (id: string) => this.post<InterviewView>(`/interviews/${id}/start`);
  interviewTurn = (id: string, body: InterviewTurnRequest) =>
    this.post<InterviewTurnResponse>(`/interviews/${id}/turns`, body);
  retryInterview = (interviewId: string) => this.post<InterviewView>(`/interviews/${interviewId}/retry`);

  // Teams
  proposeSelection = (projectId: string) => this.post<SelectionRunView>(`/admin/projects/${projectId}/selection-runs`);
  latestSelection = (projectId: string) =>
    this.get<SelectionRunView>(`/admin/projects/${projectId}/selection-runs/latest`);
  applySelection = (runId: string) => this.post<SelectionRunView>(`/admin/selection-runs/${runId}/apply`);
  myTeams = () => this.get<MyMembershipView[]>('/me/teams');
  acceptInvite = (memberId: string) => this.post<MyMembershipView>(`/team-members/${memberId}/accept`);
  declineInvite = (memberId: string) => this.post<MyMembershipView>(`/team-members/${memberId}/decline`);
  projectTeam = (slug: string) => this.get<TeamView>(`/projects/${encodeURIComponent(slug)}/team`);

  // Project workspace
  workspace = (slug: string) => this.get<WorkspaceOverview>(`/projects/${encodeURIComponent(slug)}/workspace`);
  tasks = (slug: string, q: { sprintId?: string; mine?: boolean } = {}) =>
    this.get<TaskCard[]>(`/projects/${encodeURIComponent(slug)}/tasks`, q);
  createTask = (slug: string, body: CreateTaskRequest) =>
    this.post<TaskDetail>(`/projects/${encodeURIComponent(slug)}/tasks`, body);
  task = (id: string) => this.get<TaskDetail>(`/tasks/${id}`);
  updateTask = (id: string, body: UpdateTaskRequest) => this.patch<TaskDetail>(`/tasks/${id}`, body);
  moveTask = (id: string, status: TaskStatus, beforeTaskId?: string | null) =>
    this.post<TaskDetail>(`/tasks/${id}/move`, { status, beforeTaskId: beforeTaskId ?? null });
  setDependencies = (id: string, dependsOn: string[]) =>
    this.put<TaskDetail>(`/tasks/${id}/dependencies`, { dependsOn });
  commentTask = (id: string, body: string) => this.post<TaskDetail>(`/tasks/${id}/comments`, { body });
  projectActivity = (slug: string, cursor?: string) =>
    this.get<Page<ActivityItem>>(`/projects/${encodeURIComponent(slug)}/activity`, { cursor, limit: 30 });
  createSprint = (slug: string, body: { goal: string; startsAt: string; endsAt: string }) =>
    this.post<SprintView>(`/projects/${encodeURIComponent(slug)}/sprints`, body);
  startSprint = (id: string) => this.post<SprintView>(`/sprints/${id}/start`);
  completeSprint = (id: string) => this.post<SprintView>(`/sprints/${id}/complete`);
  requestPlan = (slug: string) => this.post<PlanProposalView>(`/projects/${encodeURIComponent(slug)}/plans`);
  latestPlan = (slug: string) => this.get<PlanProposalView>(`/projects/${encodeURIComponent(slug)}/plans/latest`);
  applyPlan = (id: string) => this.post<PlanProposalView>(`/plans/${id}/apply`);
  discardPlan = (id: string) => this.post<PlanProposalView>(`/plans/${id}/discard`);

  // Study workspace
  studyLesson = (enrollmentId: string, lessonId: string) =>
    this.get<StudyLessonView>(`/enrollments/${enrollmentId}/lessons/${lessonId}`);
  saveNote = (enrollmentId: string, lessonId: string, body: string) =>
    this.put<{ body: string; updatedAt: string }>(`/enrollments/${enrollmentId}/lessons/${lessonId}/note`, { body });
  tutorHistory = (enrollmentId: string) => this.get<TutorMessageView[]>(`/enrollments/${enrollmentId}/tutor`);
  askTutor = (enrollmentId: string, body: TutorAskRequest) =>
    this.post<TutorAskResponse>(`/enrollments/${enrollmentId}/tutor`, body);
  assessments = (enrollmentId: string) => this.get<AssessmentSummary[]>(`/enrollments/${enrollmentId}/assessments`);
  startAssessment = (enrollmentId: string) => this.post<AssessmentView>(`/enrollments/${enrollmentId}/assessments`);
  assessment = (id: string) => this.get<AssessmentView>(`/assessments/${id}`);
  answerAssessment = (id: string, position: number, answer: string, viaVoice: boolean) =>
    this.put<AssessmentView>(`/assessments/${id}/questions/${position}/answer`, { answer, viaVoice });
  submitAssessment = (id: string) => this.post<AssessmentView>(`/assessments/${id}/submit`);
  retryAssessment = (id: string) => this.post<AssessmentView>(`/assessments/${id}/retry`);
  discardAssessment = (id: string) => this.delete<void>(`/assessments/${id}`);
  courseContent = (slug: string) => this.get<CourseContentView>(`/admin/courses/${encodeURIComponent(slug)}/content`);
  updateLessonContent = (lessonId: string, body: LessonContentUpdate) =>
    this.patch<void>(`/admin/lessons/${lessonId}`, body);
  generateTranscript = (lessonId: string) => this.post<void>(`/admin/lessons/${lessonId}/transcript/generate`);
  generateCourseTranscripts = (slug: string) =>
    this.post<{ queued: number }>(`/admin/courses/${encodeURIComponent(slug)}/transcripts/generate`);

  // Team chat
  chat = (slug: string, before?: string) =>
    this.get<ChatPage>(`/projects/${encodeURIComponent(slug)}/chat`, { before });
  sendChat = (slug: string, body: string) =>
    this.post<ChatMessageView>(`/projects/${encodeURIComponent(slug)}/chat`, { body });
  markChatRead = (slug: string) => this.post<void>(`/projects/${encodeURIComponent(slug)}/chat/read`);
  chatUnread = (slug: string) => this.get<{ count: number }>(`/projects/${encodeURIComponent(slug)}/chat/unread`);

  // AI project manager
  pm = (slug: string) => this.get<PmOverview>(`/projects/${encodeURIComponent(slug)}/pm`);
  startPmRun = (slug: string, goal?: string) =>
    this.post<AgentRunSummary>(`/projects/${encodeURIComponent(slug)}/pm/runs`, goal ? { goal } : {});
  pmRun = (id: string) => this.get<AgentRunView>(`/pm/runs/${id}`);
  approveProposal = (id: string) => this.post<AgentToolCallView>(`/pm/proposals/${id}/approve`);
  rejectProposal = (id: string) => this.post<AgentToolCallView>(`/pm/proposals/${id}/reject`);
  forgetMemory = (slug: string, id: string) =>
    this.delete<void>(`/projects/${encodeURIComponent(slug)}/pm/memory/${id}`);
  pmSettings = (slug: string, body: { enabled?: boolean; meetingIntervalDays?: number }) =>
    this.patch<void>(`/projects/${encodeURIComponent(slug)}/pm/settings`, body);
  startMeeting = (slug: string, kind: MeetingKind) =>
    this.post<MeetingView>(`/projects/${encodeURIComponent(slug)}/meetings`, { kind });
  meeting = (id: string) => this.get<MeetingView>(`/meetings/${id}`);
  answerMeeting = (id: string, position: number, answer: string, viaVoice: boolean) =>
    this.put<MeetingView>(`/meetings/${id}/questions/${position}/answer`, { answer, viaVoice });
  retryMeeting = (id: string) => this.post<MeetingView>(`/meetings/${id}/retry`);

  // GitHub
  githubStatus = () => this.get<GithubStatus>('/github/status');
  connectGithub = () => this.post<ConnectGithubResponse>('/github/connect');
  unlinkGithub = () => this.delete<void>('/github/account');
  projectGithub = (slug: string) => this.get<ProjectRepoView>(`/projects/${encodeURIComponent(slug)}/github`);
  createProjectRepo = (slug: string) => this.post<ProjectRepoView>(`/projects/${encodeURIComponent(slug)}/github/repo`);
  syncProjectRepo = (slug: string) =>
    this.post<{ added: number; pending: number }>(`/projects/${encodeURIComponent(slug)}/github/sync`);
}
