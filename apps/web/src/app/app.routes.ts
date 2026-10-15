import { type Routes } from '@angular/router';
import { adminGuard, appGuard, guestGuard, signedInGuard } from './core/guards';
import { AppShellComponent } from './layout/app-shell.component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage),
    title: 'StudywidBuddy — Don’t learn alone',
  },

  // Auth
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
    title: 'Log in · StudywidBuddy',
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
    title: 'Create your account · StudywidBuddy',
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
    title: 'Reset password · StudywidBuddy',
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
    title: 'Choose a new password · StudywidBuddy',
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/auth/verify-email.page').then((m) => m.VerifyEmailPage),
    title: 'Confirm your email · StudywidBuddy',
  },
  {
    path: 'onboarding',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage),
    title: 'Get started · StudywidBuddy',
  },

  // Project workspace: full-screen dark layout with its own rail (outside the sidebar shell).
  {
    path: 'projects/:slug/workspace',
    canActivate: [appGuard],
    loadComponent: () => import('./features/workspace/workspace.page').then((m) => m.WorkspacePage),
    title: 'Workspace · StudywidBuddy',
  },

  // Study workspace: same full-screen dark layout.
  {
    path: 'learn/courses/:slug/study',
    canActivate: [appGuard],
    loadComponent: () => import('./features/study/study.page').then((m) => m.StudyPage),
    title: 'Study · StudywidBuddy',
  },

  // Signed-in app
  {
    path: '',
    component: AppShellComponent,
    canActivate: [appGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
        title: 'Home · StudywidBuddy',
      },
      {
        path: 'learn',
        loadComponent: () => import('./features/learning/my-learning.page').then((m) => m.MyLearningPage),
        title: 'My Learning · StudywidBuddy',
      },
      {
        path: 'learn/discover',
        loadComponent: () => import('./features/learning/discover-courses.page').then((m) => m.DiscoverCoursesPage),
        title: 'Discover courses · StudywidBuddy',
      },
      {
        path: 'learn/courses/:slug',
        loadComponent: () => import('./features/learning/course-detail.page').then((m) => m.CourseDetailPage),
        title: 'Course · StudywidBuddy',
      },
      {
        path: 'learn/courses/:slug/manage',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/learning/course-content.page').then((m) => m.CourseContentPage),
        title: 'Lesson videos · StudywidBuddy',
      },
      {
        path: 'projects',
        loadComponent: () => import('./features/projects/project-discovery.page').then((m) => m.ProjectDiscoveryPage),
        title: 'Projects · StudywidBuddy',
      },
      {
        path: 'projects/:slug',
        loadComponent: () => import('./features/projects/project-detail.page').then((m) => m.ProjectDetailPage),
        title: 'Project · StudywidBuddy',
      },
      {
        path: 'projects/:slug/selection',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/projects/team-selection.page').then((m) => m.TeamSelectionPage),
        title: 'Team selection · StudywidBuddy',
      },
      {
        path: 'projects/:slug/apply',
        loadComponent: () => import('./features/projects/apply.page').then((m) => m.ApplyPage),
        title: 'Apply · StudywidBuddy',
      },
      {
        path: 'applications/:id/interview',
        loadComponent: () => import('./features/projects/interview.page').then((m) => m.InterviewPage),
        title: 'AI interview · StudywidBuddy',
      },
      {
        path: 'applications/:id',
        loadComponent: () => import('./features/projects/application-detail.page').then((m) => m.ApplicationDetailPage),
        title: 'Application · StudywidBuddy',
      },
      {
        path: 'u/:username',
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
        title: 'Profile · StudywidBuddy',
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
        title: 'Settings · StudywidBuddy',
      },
      {
        path: 'people',
        loadComponent: () => import('./features/coming-soon.page').then((m) => m.ComingSoonPage),
        data: {
          title: 'People',
          icon: 'group',
          milestone: 'Social & career (M10)',
          text: 'Discover people by skills, field and what they’re learning, and connect with them.',
        },
        title: 'People · StudywidBuddy',
      },
      {
        path: 'messages',
        loadComponent: () => import('./features/coming-soon.page').then((m) => m.ComingSoonPage),
        data: {
          title: 'Messages',
          icon: 'forum',
          milestone: 'Realtime collaboration (M9)',
          text: 'Direct, Study Buddy and project conversations, each with its own context.',
        },
        title: 'Messages · StudywidBuddy',
      },
      {
        path: 'jobs',
        loadComponent: () => import('./features/coming-soon.page').then((m) => m.ComingSoonPage),
        data: {
          title: 'Jobs for your skills',
          icon: 'work',
          milestone: 'Social & career (M10)',
          text: 'Jobs matched to the skills your courses and projects prove, with an explanation for every match.',
        },
        title: 'Jobs · StudywidBuddy',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
    title: 'Not found · StudywidBuddy',
  },
];
