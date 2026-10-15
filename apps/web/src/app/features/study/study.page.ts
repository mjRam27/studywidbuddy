import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { levelLabel } from '../../core/format';
import { AvatarComponent } from '../../ui/avatar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { AiBuddyComponent } from './ai-buddy.component';
import { LessonPlayerComponent } from './lesson-player.component';
import { NotesComponent } from './notes.component';
import { StudyStore } from './study.store';
import { VoiceCheckComponent } from './voice-check.component';

type Tab = 'overview' | 'learn' | 'notes' | 'check';
const TABS: { id: Tab | string; label: string; ai?: boolean; soon?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'learn', label: 'Learn' },
  { id: 'notes', label: 'Notes' },
  { id: 'check', label: 'Voice check', ai: true },
  { id: 'code', label: 'Code', soon: 'Needs the code sandbox' },
  { id: 'chat', label: 'Chat', soon: 'Arrives with Study Buddies' },
];

/**
 * Screen 29 · Study Workspace (dark, edge-to-edge). Works solo: the Study Buddy parts of the
 * design (watch together, shared notes, partner chat, sessions) are labelled until matching lands.
 */
@Component({
  selector: 'sb-study-page',
  imports: [
    RouterLink,
    AvatarComponent,
    ErrorStateComponent,
    SkeletonComponent,
    LessonPlayerComponent,
    NotesComponent,
    VoiceCheckComponent,
    AiBuddyComponent,
  ],
  providers: [StudyStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-theme': 'dark', style: 'display:block' },
  template: `
    <div class="ws">
      <nav class="ws-rail" aria-label="Main">
        <a
          routerLink="/home"
          class="brand-mark"
          aria-label="StudywidBuddy home"
          style="display:block;position:relative;width:24px;height:16px;margin-bottom:14px;background:none"
          ><span></span><span></span
        ></a>
        @for (r of rail; track r.path) {
          <a [routerLink]="r.path" [title]="r.label" [class.on]="r.path === '/learn'" [attr.aria-label]="r.label"
            ><i class="ms" aria-hidden="true">{{ r.icon }}</i></a
          >
        }
        @if (auth.user(); as u) {
          <a class="me" [routerLink]="['/u', u.username]" aria-label="Your profile"
            ><sb-avatar [name]="u.displayName" [self]="true" [size]="30"
          /></a>
        }
      </nav>

      <div class="ws-main">
        @if (store.error()) {
          <div class="ws-scroll">
            <sb-error-state
              [error]="store.error()"
              [title]="store.error()!.status === 404 ? 'Course not found' : 'The study workspace didn’t load'"
              (retry)="store.load(slug())"
            />
          </div>
        } @else if (store.notEnrolled()) {
          <div class="ws-scroll">
            <div class="ws-card" style="max-width:520px">
              <span class="ws-card-title">Start {{ store.course()?.title }} first</span>
              <p class="sm muted">The Study Workspace opens once the course is in one of your slots.</p>
              <a class="btn btn-primary" style="align-self:flex-start" [routerLink]="['/learn/courses', slug()]"
                >Go to the course</a
              >
            </div>
          </div>
        } @else if (!store.enrollment()) {
          <div class="ws-scroll"><sb-skeleton [rows]="8" [height]="22" /></div>
        } @else {
          @let c = store.course()!;
          @let e = store.enrollment()!;
          <header class="ws-header study-header">
            <div class="ws-title-row">
              <span class="dot" aria-hidden="true"></span>
              <a class="ws-title study-title" [routerLink]="['/learn/courses', c.slug]">{{ c.title }}</a>
              <span class="faint" style="font-size:12.5px">{{ levelLabel(e.level) }}</span>
              <span class="ws-bar"
                ><span class="track"><div [style.width.%]="e.progress"></div></span
                ><span class="mono faint" style="font-size:11.5px">{{ e.progress }}%</span></span
              >
              <nav class="ws-tabs inline" role="tablist" aria-label="Study workspace">
                @for (t of tabs; track t.id) {
                  <button
                    type="button"
                    role="tab"
                    class="ws-tab"
                    [class.on]="activeTab() === t.id"
                    [attr.aria-selected]="activeTab() === t.id"
                    [disabled]="!!t.soon"
                    [title]="t.soon ?? ''"
                    (click)="setTab(t.id)"
                  >
                    @if (t.ai) {
                      <span class="ai-diamond" style="width:6px;height:6px" aria-hidden="true"></span>
                    }
                    {{ t.label }}
                    @if (t.soon) {
                      <span class="soon">SOON</span>
                    }
                  </button>
                }
              </nav>
              <div class="ws-head-end">
                <span class="solo-chip" title="Study Buddy matching is coming; you can study solo meanwhile">
                  <i class="ms" aria-hidden="true">person</i>Studying solo
                </span>
                <button
                  type="button"
                  class="btn btn-primary xs"
                  disabled
                  title="Study sessions with video arrive with realtime collaboration"
                >
                  <i class="ms" aria-hidden="true">videocam</i>Start Study Session<span class="soon">SOON</span>
                </button>
              </div>
            </div>
          </header>

          <div class="study-body">
            @if (leftOpen()) {
              <aside class="study-left" aria-label="Course outline">
                <div class="study-left-head">
                  <span class="mono faint" style="font-size:10.5px;letter-spacing:.06em">MODULES</span>
                  <button
                    type="button"
                    class="icon-btn"
                    style="margin-left:auto"
                    title="Collapse outline"
                    (click)="leftOpen.set(false)"
                  >
                    <i class="ms" aria-hidden="true">left_panel_close</i>
                  </button>
                </div>
                <div class="study-outline">
                  @for (m of c.modules; track m.id) {
                    <div class="om">
                      <span class="mono faint n">{{ m.position }}</span
                      ><span class="grow">{{ m.title }}</span>
                    </div>
                    @for (l of m.lessons; track l.id) {
                      <button
                        type="button"
                        class="ol"
                        [class.on]="store.lesson()?.id === l.id"
                        [attr.aria-current]="store.lesson()?.id === l.id ? 'true' : null"
                        (click)="openLesson(l.id)"
                      >
                        <i class="ms" aria-hidden="true" [class.ok-ic]="store.done().has(l.id)">{{
                          store.done().has(l.id)
                            ? 'check_circle'
                            : l.hasVideo
                              ? 'play_circle'
                              : 'radio_button_unchecked'
                        }}</i>
                        <span class="grow ellipsis">{{ l.title }}</span>
                        <span class="mono faint d">{{ m.position }}.{{ l.position }}</span>
                      </button>
                    }
                  }
                </div>
              </aside>
            } @else {
              <button type="button" class="study-left-closed" title="Show course outline" (click)="leftOpen.set(true)">
                <i class="ms" aria-hidden="true">left_panel_open</i>
              </button>
            }

            <main class="study-main">
              @switch (activeTab()) {
                @case ('overview') {
                  <div class="study-scroll">
                    <div class="study-ov-grid">
                      <div class="ws-card">
                        @if (e.nextLesson; as n) {
                          <span class="mono faint" style="font-size:10.5px;letter-spacing:.06em"
                            >UP NEXT · MODULE {{ n.label.split('.')[0]
                            }}{{ e.currentModule ? ' · ' + e.currentModule.title.toUpperCase() : '' }}</span
                          >
                          <span class="display" style="font-size:28px">{{ n.label }} {{ n.title }}</span>
                        } @else {
                          <span class="mono faint" style="font-size:10.5px;letter-spacing:.06em">ALL LESSONS DONE</span>
                          <span class="display" style="font-size:26px"
                            >Nice work. Check what stuck with a voice check.</span
                          >
                        }
                        <div class="seg-bar" aria-hidden="true">
                          @for (l of store.outline(); track l.id) {
                            <span [class.done]="store.done().has(l.id)"></span>
                          }
                        </div>
                        <span class="faint" style="font-size:12px"
                          >{{ store.doneCount() }} of {{ store.outline().length }} lessons done</span
                        >
                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                          @if (e.nextLesson) {
                            <button type="button" class="btn btn-primary" (click)="openLesson(e.nextLesson.id)">
                              <i class="ms" aria-hidden="true">play_arrow</i>Continue Learning
                            </button>
                          }
                          <button type="button" class="btn btn-secondary" (click)="setTab('check')">
                            <i class="ms" aria-hidden="true">record_voice_over</i>Voice check
                          </button>
                        </div>
                      </div>
                      <div class="ws-card">
                        <span class="mono faint" style="font-size:10.5px;letter-spacing:.06em">STUDY BUDDY</span>
                        <div style="display:flex;gap:12px;align-items:center">
                          <span class="solo-ic" aria-hidden="true"><i class="ms">person</i></span>
                          <div style="display:flex;flex-direction:column;gap:2px">
                            <span style="font-size:15px;font-weight:600">Studying solo</span>
                            <span class="faint" style="font-size:12.5px"
                              >The AI Buddy is here whenever you’re stuck.</span
                            >
                          </div>
                        </div>
                        <span class="faint" style="font-size:12px"
                          >Matching with a Study Buddy at your level is coming soon. It’ll always be optional.</span
                        >
                        <button type="button" class="btn btn-secondary xs" style="align-self:flex-start" disabled>
                          Find a Study Buddy<span class="soon">SOON</span>
                        </button>
                      </div>
                    </div>
                    <div class="ws-card">
                      <div style="display:flex;align-items:center">
                        <span class="ws-card-title">Voice check reports</span>
                        <button type="button" class="link-btn" style="margin-left:auto" (click)="setTab('check')">
                          Open voice check
                        </button>
                      </div>
                      @for (r of store.reports().slice(0, 4); track r.id) {
                        <button
                          type="button"
                          class="ws-row"
                          style="background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left"
                          (click)="openCheck(r.id)"
                        >
                          <span class="key">{{ r.overallScore ?? '–' }}</span>
                          <span class="grow"
                            >{{ r.status === 'EVALUATED' ? 'Report' : 'In progress' }} ·
                            {{ r.lessonsCovered }} lessons</span
                          >
                          <span class="faint" style="font-size:11.5px">{{ shortDate(r.createdAt) }}</span>
                        </button>
                      } @empty {
                        <span class="faint sm"
                          >No voice checks yet. After a few lessons, explain what you learnt out loud and get a
                          report.</span
                        >
                      }
                    </div>
                  </div>
                }
                @case ('learn') {
                  <sb-lesson-player (go)="openLesson($event)" (ask)="askBuddy($event)" />
                }
                @case ('notes') {
                  <sb-study-notes />
                }
                @case ('check') {
                  <sb-voice-check
                    [checkId]="check() ?? null"
                    (open)="openCheck($event)"
                    (review)="reviewLesson($event)"
                  />
                }
              }
            </main>

            @if (rightOpen()) {
              <aside class="study-right" aria-label="AI Buddy">
                <sb-ai-buddy (collapse)="rightOpen.set(false)" />
              </aside>
            } @else {
              <button type="button" class="study-right-closed" title="Open AI Buddy" (click)="rightOpen.set(true)">
                <span class="ai-diamond" aria-hidden="true"></span><span class="v">AI BUDDY</span>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class StudyPage {
  readonly store = inject(StudyStore);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();
  readonly tab = input<string | undefined>();
  readonly lesson = input<string | undefined>();
  readonly check = input<string | undefined>();

  readonly tabs = TABS;
  readonly levelLabel = levelLabel;
  readonly leftOpen = signal(true);
  readonly rightOpen = signal(typeof window === 'undefined' || window.innerWidth >= 1100);
  readonly activeTab = computed<Tab>(() =>
    ['overview', 'learn', 'notes', 'check'].includes(this.tab() ?? '') ? (this.tab() as Tab) : 'learn',
  );
  /** Changes only when a different enrollment loads, not on every progress update. */
  private readonly enrollmentId = computed(() => this.store.enrollment()?.id);
  readonly rail = [
    { path: '/home', label: 'Home', icon: 'home' },
    { path: '/learn', label: 'Learn', icon: 'school' },
    { path: '/projects', label: 'Projects', icon: 'deployed_code' },
    { path: '/messages', label: 'Messages', icon: 'forum' },
    { path: '/people', label: 'People', icon: 'group' },
  ];

  constructor() {
    effect(() => {
      const slug = this.slug();
      untracked(() => void this.store.load(slug));
    });
    // Open the lesson from the URL, or the next one once the enrollment is known.
    effect(() => {
      const wanted = this.lesson();
      if (!this.enrollmentId()) return;
      untracked(() => {
        const id = wanted && this.store.outline().some((l) => l.id === wanted) ? wanted : this.store.defaultLessonId();
        if (id) void this.store.openLesson(id);
      });
    });
  }

  setTab(t: string) {
    void this.router.navigate([], { queryParams: { tab: t, check: null }, queryParamsHandling: 'merge' });
  }

  openLesson(id: string) {
    void this.router.navigate([], {
      queryParams: { lesson: id, tab: this.activeTab() === 'notes' ? 'notes' : 'learn', check: null },
      queryParamsHandling: 'merge',
    });
  }

  openCheck(id: string | null) {
    void this.router.navigate([], { queryParams: { tab: 'check', check: id }, queryParamsHandling: 'merge' });
  }

  reviewLesson(label: string) {
    const l = this.store.outline().find((x) => x.label === label);
    if (l) this.openLesson(l.id);
  }

  askBuddy(prompt: string) {
    this.rightOpen.set(true);
    this.store.buddyPrompt.set(prompt);
  }

  shortDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
