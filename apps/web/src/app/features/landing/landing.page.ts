import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CourseSummary } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { asyncState } from '../../core/resource';
import { BrandComponent } from '../../ui/brand.component';

type Hero = 'learn' | 'build' | 'grow';

const HERO_TABS: { id: Hero; label: string; color: string; shape: string; url: string; caption: string }[] = [
  {
    id: 'learn',
    label: 'Learn together',
    color: 'var(--brand)',
    shape: '50%',
    url: 'studywidbuddy/learn/angular/workspace',
    caption:
      'The Study Workspace: a shared lesson, shared notes, your buddy beside you, and an AI that knows where you are.',
  },
  {
    id: 'build',
    label: 'Build together',
    color: 'var(--ai)',
    shape: '2px',
    url: 'studywidbuddy/projects/delivery-platform/board',
    caption: 'The Project Workspace: a real team and a real sprint, with an AI PM whose every action you can see.',
  },
  {
    id: 'grow',
    label: 'Grow together',
    color: 'var(--grow)',
    shape: '0',
    url: 'studywidbuddy/u/you',
    caption: 'Your profile shows the courses and projects you finished. Jobs are matched to what you can prove.',
  },
];

const PILLARS = [
  { k: '01', n: 'People', d: 'A partner at your level' },
  { k: '02', n: 'Learning', d: 'Structured courses' },
  { k: '03', n: 'AI', d: 'That knows your context' },
  { k: '04', n: 'Building', d: 'Code, together' },
  { k: '05', n: 'Experience', d: 'Team projects' },
  { k: '06', n: 'Career', d: 'Jobs from proof' },
];

const BENEFITS = [
  {
    i: 'group',
    c: 'var(--brand)',
    t: 'Study together',
    d: 'A partner who has the same course, the same level and the same deadline as you. Streaks you keep together are harder to break.',
  },
  {
    i: 'psychology',
    c: 'var(--ai)',
    t: 'AI learning companion',
    d: 'Ask about the exact moment in a video, a line in your code or a note. You get hints first, so you still do the thinking.',
  },
  {
    i: 'code_blocks',
    c: 'var(--brand)',
    t: 'Collaborative practice',
    d: 'Exercises run in a shared editor with a real terminal and tests. Follow your buddy’s cursor whenever you want to.',
  },
  {
    i: 'deployed_code',
    c: 'var(--ai)',
    t: 'Build real projects',
    d: 'Teams of 4–8 people with defined roles, sprints, GitHub repos and code review, modelled on how software teams actually work.',
  },
  {
    i: 'workspace_premium',
    c: 'var(--warn)',
    t: 'Turn skills into experience',
    d: 'Every course and project ends with an evaluation and a certificate anyone can verify.',
  },
  {
    i: 'work',
    c: 'var(--warn)',
    t: 'Find opportunities',
    d: 'Jobs are matched to what you’ve actually shown, and each match explains why it fits and where you have gaps.',
  },
];

const FLOW = [
  { n: '01', i: 'description', t: 'Apply', d: 'Your profile fills most of the form', ai: false },
  { n: '02', i: 'record_voice_over', t: 'AI Interview', d: 'Role-specific questions, about 25 min', ai: true },
  { n: '03', i: 'groups', t: 'Join Team', d: 'Picked for balanced skill coverage', ai: false },
  { n: '04', i: 'code', t: 'Build', d: 'Sprints, tasks, branches', ai: false },
  { n: '05', i: 'timeline', t: 'AI PM', d: 'Plans, unblocks and asks before it acts', ai: true },
  { n: '06', i: 'rate_review', t: 'Review', d: 'AI and peer code review', ai: true },
  { n: '07', i: 'verified', t: 'Complete', d: 'Evaluation, certificate, profile', ai: false },
];

@Component({
  selector: 'sb-landing-page',
  imports: [RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="landing">
      <header class="public-header">
        <div class="public-header-inner">
          <sb-brand link="/" />
          <nav class="public-nav" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#learn">Learn</a>
            <a href="#projects">Projects</a>
          </nav>
          <div class="public-header-end">
            @if (auth.user()) {
              <a class="btn btn-ink" routerLink="/home">Open StudywidBuddy</a>
            } @else {
              <a class="plain" routerLink="/login">Log in</a>
              <a class="btn btn-ink" routerLink="/register">Start Learning</a>
            }
          </div>
        </div>
      </header>

      <main>
        <section class="l-section l-hero">
          <div class="l-hero-grid">
            <div style="display:flex;flex-direction:column;gap:24px">
              <div class="l-pill">
                <span class="dots" aria-hidden="true"
                  ><span style="background:#DDE3FF"></span><span style="background:#FDE9D6"></span
                  ><span style="background:#D7F1F6"></span
                ></span>
                Study partners at every level
              </div>
              <h1 class="l-h1">Don’t learn<br />alone.</h1>
            </div>
            <div style="display:flex;flex-direction:column;gap:20px;padding-bottom:8px">
              <p class="l-lead">
                Get matched with someone learning the same thing at your level. Study together in a shared workspace
                with an AI that knows what you’re working on. Then turn what you’ve learned into real project
                experience.
              </p>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <a class="btn btn-primary xl" [routerLink]="auth.user() ? '/learn' : '/register'"
                  >Start Learning<i class="ms" aria-hidden="true">arrow_forward</i></a
                >
                <a class="btn btn-secondary xl" [routerLink]="auth.user() ? '/projects' : '/register'"
                  >Explore Projects</a
                >
              </div>
              <div class="l-tagline">LEARN TOGETHER · BUILD TOGETHER · GROW TOGETHER</div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="hero-tabs" role="tablist" aria-label="Product preview">
              @for (t of heroTabs; track t.id) {
                <button
                  type="button"
                  role="tab"
                  [class.on]="hero() === t.id"
                  [attr.aria-selected]="hero() === t.id"
                  (click)="hero.set(t.id)"
                >
                  <span
                    class="shape"
                    aria-hidden="true"
                    [style.border-radius]="t.shape"
                    [style.background]="t.color"
                  ></span
                  >{{ t.label }}
                </button>
              }
            </div>
            <div class="browser" role="img" [attr.aria-label]="'Product preview: ' + current().label">
              <div class="browser-bar" aria-hidden="true">
                <span></span><span></span><span></span>
                <span class="url">{{ current().url }}</span>
                <span class="sample">SAMPLE</span>
              </div>
              @switch (hero()) {
                @case ('learn') {
                  <div
                    class="mock"
                    style="display:grid;grid-template-columns:200px minmax(0,1fr) 300px"
                    aria-hidden="true"
                  >
                    <div
                      class="mock-hide-md"
                      style="background:#10131B;border-right:1px solid #232838;padding:14px;display:flex;flex-direction:column;gap:12px"
                    >
                      <div style="display:flex;flex-direction:column;gap:2px">
                        <span style="font-size:14px;font-weight:600">Angular</span
                        ><span style="font-size:11.5px;color:#A3AABB">Intermediate · 62%</span>
                      </div>
                      <div style="height:4px;border-radius:2px;background:#232838">
                        <div style="width:62%;height:100%;border-radius:2px;background:#8186FF"></div>
                      </div>
                      <div class="mono-label" style="color:#7C8497;margin-top:6px">MODULE 4 · DI</div>
                      @for (l of mockLessons; track l.t) {
                        <div
                          style="display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:6px"
                          [style.background]="l.on ? '#1C2130' : 'transparent'"
                          [style.color]="l.on ? '#E6E9F0' : '#A3AABB'"
                          [style.font-weight]="l.on ? 600 : 400"
                        >
                          <i class="ms" style="font-size:15px" [style.color]="l.c">{{ l.i }}</i
                          >{{ l.t }}
                        </div>
                      }
                    </div>
                    <div style="background:#0A0C12;display:flex;flex-direction:column">
                      <div
                        style="position:relative;flex:1;margin:14px;border-radius:8px;background:repeating-linear-gradient(135deg,#131722 0 10px,#161A26 10px 20px);display:flex;align-items:center;justify-content:center"
                      >
                        <span class="mono-label" style="color:#7C8497">LESSON VIDEO · PROVIDERS &amp; INJECTORS</span>
                        <div
                          style="position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:8px;background:rgba(10,12,18,.8);border:1px solid #2E3446;border-radius:16px;padding:4px 10px 4px 4px;font-size:12px"
                        >
                          <span
                            style="width:22px;height:22px;border-radius:50%;background:#4A3218;color:#FBC98A;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center"
                            >AM</span
                          >Your buddy is watching with you
                        </div>
                        <div
                          style="position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-direction:column;gap:8px"
                        >
                          <div style="height:4px;border-radius:2px;background:rgba(255,255,255,.15)">
                            <div style="width:58%;height:100%;border-radius:2px;background:#8186FF"></div>
                          </div>
                          <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:#A3AABB">
                            <i class="ms" style="color:#E6E9F0">pause</i><span class="mono">14:32 / 24:10</span
                            ><span class="mono" style="margin-left:auto">1.25×</span><i class="ms">closed_caption</i
                            ><i class="ms">fullscreen</i>
                          </div>
                        </div>
                      </div>
                      <div style="display:flex;gap:10px;padding:0 14px 14px">
                        <div
                          style="flex:1;border:1px solid #232838;border-radius:8px;padding:10px 12px;background:#10131B;display:flex;flex-direction:column;gap:4px"
                        >
                          <span class="mono-label" style="font-size:10px;color:#7C8497">SHARED NOTE · 14:32</span
                          ><span style="line-height:1.4"
                            >providedIn: 'root' creates one app-wide instance. When do we want one per component?</span
                          >
                        </div>
                        <div
                          class="mock-hide-md"
                          style="flex:1;border:1px solid #232838;border-radius:8px;padding:10px 12px;background:#10131B;display:flex;flex-direction:column;gap:4px"
                        >
                          <span class="mono-label" style="font-size:10px;color:#7C8497">BUDDY · CHAT</span
                          ><span style="line-height:1.4"
                            >Want to finish Module 4 tonight? I’ll do the cart exercise after this.</span
                          >
                        </div>
                      </div>
                    </div>
                    <div
                      class="mock-hide-md"
                      style="background:#10131B;border-left:1px solid #232838;padding:14px;display:flex;flex-direction:column;gap:12px"
                    >
                      <span class="ai-label" style="color:#4CC9E6"
                        ><span class="ai-diamond" style="background:#4CC9E6"></span>AI BUDDY</span
                      >
                      <div style="display:flex;flex-wrap:wrap;gap:4px;font-size:11px;color:#A3AABB;align-items:center">
                        <i class="ms" style="font-size:13px;color:#4CC9E6">my_location</i>Using
                        <span style="padding:1px 6px;border:1px solid #2E3446;border-radius:4px">Module 4 › 4.3</span
                        ><span style="padding:1px 6px;border:1px solid #2E3446;border-radius:4px">14:32</span>
                      </div>
                      <div
                        style="align-self:flex-end;background:#1C2130;border-radius:10px 10px 2px 10px;padding:8px 10px;max-width:85%"
                      >
                        Why not just call new UserService()?
                      </div>
                      <div
                        style="border:1px dashed rgba(76,201,230,.45);border-radius:10px;padding:10px 12px;line-height:1.5"
                      >
                        Good question to sit with. At 14:32 the instructor swaps the service in a test. What would you
                        have to change if every component called
                        <span class="mono" style="color:#4CC9E6">new</span> itself?
                      </div>
                      <div
                        style="margin-top:auto;height:36px;border:1px solid #2E3446;border-radius:8px;display:flex;align-items:center;padding:0 10px;color:#7C8497"
                      >
                        Ask about this moment…
                      </div>
                    </div>
                  </div>
                }
                @case ('build') {
                  <div
                    class="mock"
                    style="display:grid;grid-template-columns:minmax(0,1fr) 320px;background:#0A0C12"
                    aria-hidden="true"
                  >
                    <div style="display:flex;flex-direction:column;min-width:0">
                      <div
                        style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #232838"
                      >
                        <span style="font-size:14px;font-weight:600">Real-Time Delivery Platform</span
                        ><span style="color:#A3AABB">Sprint 2 · 42%</span
                        ><span
                          style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#FBBF24;font-weight:600"
                          ><i class="ms" style="font-size:14px">warning</i>At risk</span
                        >
                      </div>
                      <div
                        style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px;flex:1"
                      >
                        @for (col of mockBoard; track col.h) {
                          <div style="display:flex;flex-direction:column;gap:8px">
                            <div class="mono-label" style="color:#7C8497">{{ col.h }}</div>
                            @for (c of col.cards; track c.id) {
                              <div
                                style="background:#10131B;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px"
                                [style.border]="'1px solid ' + c.b"
                              >
                                <span class="mono" style="font-size:10px;color:#7C8497">{{ c.id }}</span>
                                <span style="font-weight:500;line-height:1.35">{{ c.t }}</span>
                                <span style="font-size:11px" [style.color]="c.tc">{{ c.tag }}</span>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    </div>
                    <div
                      class="mock-hide-md"
                      style="background:#10131B;border-left:1px solid #232838;padding:14px;display:flex;flex-direction:column;gap:10px"
                    >
                      <span class="ai-label" style="color:#4CC9E6"
                        ><span class="ai-diamond" style="background:#4CC9E6"></span>AI PROJECT MANAGER</span
                      >
                      @for (v of mockVerbs; track v.t) {
                        <div style="display:flex;gap:10px;font-size:12px">
                          <span class="mono" style="color:#7C8497;width:38px">{{ v.t }}</span>
                          <div>
                            <span class="mono" style="font-size:10px" [style.color]="v.c">{{ v.v }}</span
                            ><br />{{ v.x }}
                          </div>
                        </div>
                      }
                      <div
                        style="border:1px dashed rgba(76,201,230,.45);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;margin-top:4px"
                      >
                        <span style="font-weight:600">Reassign TASK-31?</span>
                        <span style="font-size:11.5px;color:#A3AABB;line-height:1.45"
                          >TASK-28 is done and a teammate has matching backend skills.</span
                        >
                        <div style="display:flex;gap:6px">
                          <span
                            style="font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:5px;background:#5B5FEF"
                            >Approve</span
                          ><span style="font-size:11.5px;padding:5px 10px;border-radius:5px;border:1px solid #2E3446"
                            >Modify</span
                          ><span style="font-size:11.5px;padding:5px 10px;color:#A3AABB">Reject</span>
                        </div>
                      </div>
                    </div>
                  </div>
                }
                @case ('grow') {
                  <div
                    class="mock"
                    style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:#F5F6F8;color:var(--ink)"
                    aria-hidden="true"
                  >
                    <div
                      style="padding:28px;display:flex;flex-direction:column;gap:16px;border-right:1px solid var(--line);background:#fff"
                    >
                      <div style="display:flex;gap:14px;align-items:center">
                        <span
                          style="width:56px;height:56px;border-radius:50%;background:#DDE3FF;color:#3236B3;font-size:19px;font-weight:700;display:flex;align-items:center;justify-content:center"
                          >YOU</span
                        >
                        <div>
                          <div style="font-size:18px;font-weight:600">Your name</div>
                          <div style="font-size:13px;color:var(--ink-2)">Backend developer</div>
                        </div>
                      </div>
                      <div class="eyebrow">PROJECT EXPERIENCE</div>
                      <div
                        style="border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;gap:12px;align-items:center"
                      >
                        <span style="width:10px;height:10px;border-radius:2px;background:var(--ai)"></span>
                        <div style="flex:1">
                          <div style="font-size:14px;font-weight:600">Real-Time Delivery Platform</div>
                          <div style="font-size:12.5px;color:var(--ink-2)">
                            Backend Developer · 6 weeks · tasks · PRs
                          </div>
                        </div>
                        <i class="ms" style="color:var(--success)">verified</i>
                      </div>
                      <div class="eyebrow">COMPLETED</div>
                      <div class="chips">
                        <span class="chip"
                          ><span style="width:7px;height:7px;border-radius:50%;background:var(--brand)"></span>Angular
                          Intermediate</span
                        ><span class="chip"
                          ><span style="width:7px;height:7px;border-radius:50%;background:var(--brand)"></span>System
                          Design</span
                        >
                      </div>
                    </div>
                    <div class="mock-hide-md" style="padding:28px;display:flex;flex-direction:column;gap:12px">
                      <div class="eyebrow">JOBS FOR YOUR SKILLS</div>
                      @for (j of mockJobs; track j.t) {
                        <div
                          style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px"
                        >
                          <div style="display:flex;align-items:baseline;gap:8px">
                            <span style="font-size:14px;font-weight:600">{{ j.t }}</span
                            ><span
                              class="mono"
                              style="margin-left:auto;font-size:12px;font-weight:600;color:var(--success)"
                              >{{ j.m }}</span
                            >
                          </div>
                          <span style="font-size:12px;color:var(--ink-2)">{{ j.s }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              }
            </div>
            <div class="l-caption">{{ current().caption }}</div>
          </div>
        </section>

        <section class="l-section" style="padding-top:40px;padding-bottom:40px" id="learn">
          <div class="pillars">
            @for (p of pillars; track p.k) {
              <div>
                <span class="mono faint" style="font-size:11px">{{ p.k }}</span
                ><span class="n">{{ p.n }}</span
                ><span class="muted" style="font-size:12.5px;line-height:1.45">{{ p.d }}</span>
              </div>
            }
          </div>
          <p class="muted" style="margin-top:20px;font-size:14px;text-align:center">
            Not just a course site, an AI tutor, a social network or a job board. StudywidBuddy is what you get when
            those work together.
          </p>
        </section>

        <section class="l-section how" id="how">
          <div class="how-left">
            <span class="mono" style="font-size:12px;letter-spacing:.06em;color:var(--brand)">HOW IT WORKS</span>
            <h2 class="l-h2">From “I want to learn this” to “I built this.”</h2>
            <div role="tablist" aria-label="Steps">
              @for (s of steps(); track s.t; let i = $index) {
                <button
                  type="button"
                  role="tab"
                  class="how-step"
                  [class.on]="step() === i"
                  [attr.aria-selected]="step() === i"
                  (click)="step.set(i)"
                >
                  <span class="n">0{{ i + 1 }}</span
                  ><span class="t">{{ s.t }}</span
                  ><i class="ms" aria-hidden="true">{{ step() === i ? 'arrow_forward' : 'add' }}</i>
                </button>
              }
            </div>
          </div>
          @let cur = steps()[step()];
          <div class="how-card" role="tabpanel">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="mono" style="font-size:12px;color:var(--brand)">STEP 0{{ step() + 1 }}</span
              ><span class="faint" style="font-size:13px">{{ cur.k }}</span>
            </div>
            <div class="display" style="font-size:30px">{{ cur.t }}</div>
            <p class="muted" style="font-size:15px;line-height:1.6">{{ cur.d }}</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              @for (c of cur.chips; track c; let first = $first) {
                <span class="how-chip" [class.on]="first">{{ c }}</span>
              }
            </div>
            <div
              style="margin-top:auto;border-top:1px solid var(--line);padding-top:16px;font-size:13px;color:var(--ink-2);display:flex;gap:8px;align-items:center"
            >
              <i class="ms" aria-hidden="true" style="font-size:17px;color:var(--brand)">info</i>{{ cur.note }}
            </div>
          </div>
        </section>

        <section
          class="l-section"
          style="padding-top:24px;padding-bottom:72px;display:flex;flex-direction:column;gap:28px"
        >
          <h2 class="display" style="font-size:40px;letter-spacing:-0.03em">
            Everything a study group gives you, minus the scheduling chaos.
          </h2>
          <div class="benefits">
            @for (b of benefits; track b.t) {
              <div>
                <i class="ms" aria-hidden="true" [style.color]="b.c">{{ b.i }}</i
                ><span class="t">{{ b.t }}</span
                ><span class="d">{{ b.d }}</span>
              </div>
            }
          </div>
        </section>

        <section class="dark-band" id="projects">
          <div class="l-section inner">
            <div class="l-hero-grid">
              <div style="display:flex;flex-direction:column;gap:16px">
                <span class="build-eyebrow" style="color:#4CC9E6"
                  ><span class="sq" style="background:#4CC9E6"></span>SIMULATED PROFESSIONAL EXPERIENCE</span
                >
                <h2 class="l-h2" style="font-size:56px">Join a team.<br />Ship a real project.</h2>
              </div>
              <p style="font-size:16px;line-height:1.6;color:#A3AABB">
                Apply for a role, do a short AI interview, and get picked for a team. You’ll work in sprints with real
                GitHub repos, code reviews and tests. An AI Project Manager keeps the work moving, and you approve its
                decisions.
              </p>
            </div>
            <div class="flow">
              @for (f of flow; track f.n) {
                <div [class.ai]="f.ai">
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <span class="mono" style="font-size:11px;color:#7C8497">{{ f.n }}</span
                    ><i class="ms" aria-hidden="true" [style.color]="f.ai ? '#4CC9E6' : '#A3AABB'">{{ f.i }}</i>
                  </div>
                  <span class="t">{{ f.t }}</span
                  ><span class="d">{{ f.d }}</span>
                </div>
              }
            </div>
            <div>
              <a
                class="btn xl"
                style="background:#E6E9F0;color:#0A0C12"
                [routerLink]="auth.user() ? '/projects' : '/register'"
                >Explore Projects<i class="ms" aria-hidden="true">arrow_forward</i></a
              >
            </div>
          </div>
        </section>

        <section class="l-section final-cta">
          <div style="display:flex;align-items:center" aria-hidden="true">
            <span
              style="width:52px;height:52px;border-radius:50%;background:#DDE3FF;color:#3236B3;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;border:3px solid var(--canvas)"
              >You</span
            >
            <span
              style="width:52px;height:52px;border-radius:50%;background:#FDE9D6;color:#9A4A0A;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;border:3px solid var(--brand);margin-left:-14px"
              >?</span
            >
          </div>
          <h2 class="l-h2" style="font-size:64px;letter-spacing:-0.04em">
            Someone at your level<br />is starting today.
          </h2>
          <p class="muted" style="font-size:17px">
            Pick a topic and we’ll find them. It’s free to start, and you can have up to 4 courses running at once.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            <a class="btn btn-primary xl" [routerLink]="auth.user() ? '/learn' : '/register'">Start Learning</a>
            <a class="btn btn-secondary xl" [routerLink]="auth.user() ? '/projects' : '/register'">Explore Projects</a>
          </div>
        </section>
      </main>

      <footer class="l-footer">
        <div class="l-section grid">
          <div class="col">
            <sb-brand link="/" />
            <span class="muted" style="font-size:13px">Learn together. Build together. Grow together.</span>
          </div>
          <div class="col">
            <span class="eyebrow">PRODUCT</span>
            <a routerLink="/register">Study Buddy</a><a href="#projects">Projects</a><a href="#how">How it works</a>
          </div>
          <div class="col">
            <span class="eyebrow">LEARN</span>
            @for (c of courses.value()?.slice(0, 5) ?? []; track c.id) {
              <a routerLink="/register">{{ c.title }}</a>
            }
          </div>
          <div class="col">
            <span class="eyebrow">ACCOUNT</span>
            <a routerLink="/login">Log in</a><a routerLink="/register">Create account</a
            ><a routerLink="/forgot-password">Reset password</a>
          </div>
        </div>
        <div
          class="l-section"
          style="padding-top:16px;padding-bottom:32px;display:flex;gap:16px;font-size:12.5px;color:var(--ink-3)"
        >
          <span>© 2026 StudywidBuddy</span>
        </div>
      </footer>
    </div>
  `,
})
export class LandingPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);

  readonly heroTabs = HERO_TABS;
  readonly pillars = PILLARS;
  readonly benefits = BENEFITS;
  readonly flow = FLOW;
  readonly hero = signal<Hero>('learn');
  readonly step = signal(2);
  readonly current = computed(() => HERO_TABS.find((t) => t.id === this.hero())!);

  /** Real catalogue, so "choose what to learn" lists courses that actually exist. */
  readonly courses = asyncState<CourseSummary[]>(() => this.api.courses());

  readonly steps = computed(() => {
    const titles = this.courses.value()?.map((c) => c.title) ?? ['Angular', 'System Design', 'German'];
    const count = this.courses.value()?.length;
    return [
      {
        t: 'Choose what you want to learn',
        k: count ? `${count} courses to start with` : 'Pick a topic',
        d: 'Programming, AI, system design, cloud or languages. Start with one. You can have up to four running at the same time.',
        chips: titles.slice(0, 6),
        note: 'Four active courses at most, so you finish what you start.',
      },
      {
        t: 'Select your current level',
        k: 'Honest, not a test',
        d: 'Tell us where you’re starting from. We use this to match you with a partner, not to grade you, and you can change it whenever you like.',
        chips: ['Intermediate', 'Beginner', 'Advanced'],
        note: 'Intermediate means you can build small things but get stuck on structure.',
      },
      {
        t: 'Find your Study Buddy',
        k: 'Matched on 6 signals',
        d: 'We look for someone on the same course at a similar level, with compatible goals, a shared language, overlapping timezone and the same kind of availability. You see why you were matched before you send a request.',
        chips: ['Same course', 'Same level', 'Shared language', 'Compatible schedule', 'Nearby timezone'],
        note: 'Study partners, not a dating app. Requests are about the course and nothing else.',
      },
      {
        t: 'Learn and practice together',
        k: 'One private workspace per pair',
        d: 'Watch lessons in sync, write shared notes pinned to timestamps, code in the same editor, send voice notes, and call when you get stuck.',
        chips: ['Watch together', 'Shared notes', 'Pair coding', 'Voice notes', 'Video session'],
        note: 'Your buddy shows up in the workspace in small ways, never as a distraction.',
      },
      {
        t: 'Get AI assistance',
        k: 'Context-aware, hint-first',
        d: 'AI Buddy knows your lesson, the video timestamp, your notes, your code and your level. It starts with hints and gives you the answer when you ask for it.',
        chips: ['Quiz me', 'Explain simply', 'Help with my code', 'Give a hint'],
        note: 'You can always see what context the AI is using, and change it.',
      },
      {
        t: 'Build real projects',
        k: 'Learning becomes experience',
        d: 'When you finish a course, we suggest projects that fit your new skills. Apply for a role, join a team and ship something you can show.',
        chips: ['Team project', 'Defined role', '4–8 weeks'],
        note: 'Finished projects appear on your profile and help match you to jobs.',
      },
    ];
  });

  // Static illustrations for the product preview (labelled SAMPLE in the browser frame).
  readonly mockLessons = [
    { t: '4.1 Why DI', i: 'check_circle', c: '#4ADE80', on: false },
    { t: '4.2 Services', i: 'check_circle', c: '#4ADE80', on: false },
    { t: '4.3 Providers', i: 'play_circle', c: '#8186FF', on: true },
    { t: '4.4 Injection tokens', i: 'radio_button_unchecked', c: '#A3AABB', on: false },
    { t: 'Exercise: Cart service', i: 'code', c: '#A3AABB', on: false },
  ];
  readonly mockBoard = [
    {
      h: 'TODO',
      cards: [
        { id: 'TASK-31', t: 'Order status webhooks', tag: 'Backend', tc: '#A3AABB', b: '#232838' },
        { id: 'TASK-33', t: 'Idempotency keys on POST /orders', tag: '◆ AI suggested', tc: '#4CC9E6', b: '#232838' },
      ],
    },
    {
      h: 'IN PROGRESS',
      cards: [
        {
          id: 'TASK-24',
          t: 'Refresh token rotation',
          tag: 'Blocked by TASK-18',
          tc: '#F87171',
          b: 'rgba(248,113,113,.4)',
        },
        { id: 'TASK-27', t: 'Driver location stream', tag: 'Frontend', tc: '#A3AABB', b: '#232838' },
      ],
    },
    {
      h: 'REVIEW',
      cards: [
        { id: 'TASK-22', t: 'Auth refresh endpoint', tag: 'PR #42 · checks passed', tc: '#4ADE80', b: '#232838' },
      ],
    },
    {
      h: 'DONE',
      cards: [
        { id: 'TASK-28', t: 'Order schema v2', tag: 'Backend', tc: '#A3AABB', b: '#232838' },
        { id: 'TASK-19', t: 'CI pipeline', tag: 'DevOps', tc: '#A3AABB', b: '#232838' },
      ],
    },
  ];
  readonly mockVerbs = [
    { t: '09:32', v: 'OBSERVED', c: '#A3AABB', x: 'TASK-18 is blocking TASK-24' },
    { t: '09:33', v: 'REQUESTED', c: '#FBBF24', x: 'Status from the task owner' },
    { t: '09:41', v: 'RECOMMENDED', c: '#8186FF', x: 'Split TASK-18' },
  ];
  readonly mockJobs = [
    { t: 'Backend Software Engineer', m: 'match', s: '✓ TypeScript  ✓ Node.js  ✓ PostgreSQL  · gap: Kubernetes' },
    { t: 'Junior Platform Engineer', m: 'match', s: '✓ Docker  ✓ PostgreSQL  · gap: Terraform' },
    { t: 'API Developer (Graduate)', m: 'match', s: '✓ NestJS  ✓ REST  · gap: GraphQL' },
  ];
}
