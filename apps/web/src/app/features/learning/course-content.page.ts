import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { parseYoutubeId, type CourseContentView, type LessonContentView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

interface Draft {
  url: string;
  summary: string;
  /** Pasted transcript; empty means "leave the current one". */
  transcript: string;
  showTranscript: boolean;
  saving: boolean;
}

const POLL_MS = 5000;

/**
 * Admin: attach YouTube videos, plus the summaries and transcripts the AI Buddy and voice
 * checks use. Transcripts are pasted (e.g. from YouTube's "Show transcript") or generated
 * from the video with Gemini when GEMINI_API_KEY is set.
 * Only YouTube links are accepted; the id is extracted and the player uses the
 * privacy-enhanced embed.
 */
@Component({
  selector: 'sb-course-content-page',
  imports: [FormsModule, RouterLink, TopbarComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/learn/discover">Courses</a><i class="ms" aria-hidden="true">chevron_right</i>
        <a [routerLink]="['/learn/courses', slug()]">{{ data()?.course?.title ?? 'Course' }}</a
        ><i class="ms" aria-hidden="true">chevron_right</i>
        <b>Lesson videos</b>
      </nav>
    </sb-topbar>
    <div class="page">
      @if (error()) {
        <sb-error-state [error]="error()" title="Course content didn’t load" (retry)="load()" />
      } @else if (!data()) {
        <sb-skeleton [rows]="6" [height]="22" />
      } @else {
        <div class="page-head">
          <h1 class="display" style="font-size:28px">Lesson videos</h1>
          <p class="muted sm">
            Paste a YouTube link per lesson (watch, youtu.be, shorts or embed links all work). When you save, we check
            with YouTube that the video exists and that its owner allows embedding, and record its title and channel for
            attribution. The summary is what the AI Buddy and voice checks use to understand the lesson.
          </p>
          <p class="muted sm">
            A <b>transcript</b> lets the AI Buddy follow the video minute by minute (“what did he say at 4:10?”). Paste
            one copied from YouTube’s “Show transcript” panel (timestamps included), or generate it from the video.
          </p>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button
              type="button"
              class="ai-btn"
              [disabled]="!data()!.autoTranscripts || generatingAll()"
              (click)="generateAll()"
            >
              <span class="ai-diamond" aria-hidden="true"></span
              >{{ generatingAll() ? 'Queuing…' : 'Generate missing transcripts' }}
            </button>
            @if (!data()!.autoTranscripts) {
              <span class="faint sm"
                ><i class="ms" aria-hidden="true" style="font-size:15px;vertical-align:-3px">info</i> Automatic
                transcripts need GEMINI_API_KEY on the server. Pasting works now.</span
              >
            } @else if (pending()) {
              <span class="faint sm"
                ><span class="spinner" aria-hidden="true"></span> Transcribing {{ pending() }}
                {{ pending() === 1 ? 'lesson' : 'lessons' }}…</span
              >
            }
          </div>
        </div>
        @for (m of data()!.modules; track m.id) {
          <section class="panel pad-lg" style="gap:12px" [attr.aria-labelledby]="'m-' + m.id">
            <span class="panel-title" [id]="'m-' + m.id">Module {{ m.position }} · {{ m.title }}</span>
            @for (l of m.lessons; track l.id) {
              @let d = drafts()[l.id];
              <div class="content-row">
                <div class="thumb" aria-hidden="true">
                  @if (preview(d.url); as id) {
                    <img [src]="'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'" alt="" loading="lazy" />
                  } @else {
                    <i class="ms">smart_display</i>
                  }
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;min-width:0;flex:1">
                  <span style="font-size:13.5px;font-weight:600">{{ l.label }} {{ l.title }}</span>
                  <div class="field">
                    <label [for]="'yt-' + l.id">YouTube link</label>
                    <input
                      [id]="'yt-' + l.id"
                      class="input"
                      [ngModel]="d.url"
                      (ngModelChange)="patch(l.id, { url: $event })"
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                    @if (d.url.trim() && !preview(d.url)) {
                      <span class="field-error">That isn’t a YouTube video link.</span>
                    }
                  </div>
                  <div class="field">
                    <label [for]="'sum-' + l.id">What this lesson covers</label>
                    <textarea
                      [id]="'sum-' + l.id"
                      class="input"
                      rows="2"
                      maxlength="2000"
                      [ngModel]="d.summary"
                      (ngModelChange)="patch(l.id, { summary: $event })"
                      placeholder="Two or three sentences. The AI Buddy grounds its answers in this."
                    ></textarea>
                  </div>
                  @if (d.showTranscript) {
                    <div class="field">
                      <label [for]="'tx-' + l.id">Transcript</label>
                      <textarea
                        [id]="'tx-' + l.id"
                        class="input mono-sm"
                        rows="6"
                        maxlength="150000"
                        [ngModel]="d.transcript"
                        (ngModelChange)="patch(l.id, { transcript: $event })"
                        placeholder="0:00&#10;Welcome to this lesson…&#10;0:12&#10;First, …"
                      ></textarea>
                      <span class="faint" style="font-size:11.5px"
                        >Timestamps like 0:12 or [01:05] are kept so the AI can follow the video. Saving replaces the
                        current transcript.</span
                      >
                    </div>
                  }
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <button
                      type="button"
                      class="btn btn-secondary xs"
                      [disabled]="d.saving || !dirty(l) || (!!d.url.trim() && !preview(d.url))"
                      (click)="save(l)"
                    >
                      {{ d.saving ? 'Saving…' : 'Save' }}
                    </button>
                    @if (l.youtubeId) {
                      <span class="status ok"><i class="ms" aria-hidden="true">smart_display</i>Video attached</span>
                      @if (l.videoTitle) {
                        <span class="faint ellipsis" style="font-size:12px"
                          >{{ l.videoTitle }} · {{ l.videoChannel }}</span
                        >
                      }
                    }
                    @switch (l.transcriptStatus) {
                      @case ('PENDING') {
                        <span class="status neutral"
                          ><span class="spinner" aria-hidden="true"></span>Transcribing…</span
                        >
                      }
                      @case ('FAILED') {
                        <span class="status bad"
                          ><i class="ms" aria-hidden="true">error</i>Transcript failed: retry or paste one</span
                        >
                      }
                      @case ('NONE') {
                        <span class="status neutral"
                          ><i class="ms" aria-hidden="true">subtitles_off</i>No transcript</span
                        >
                      }
                      @default {
                        <span class="status ok"
                          ><i class="ms" aria-hidden="true">subtitles</i>Transcript ·
                          {{ l.transcriptSegments ? l.transcriptSegments + ' timed lines' : 'no timestamps' }}
                          · {{ l.transcriptStatus === 'GEMINI' ? 'generated' : 'pasted' }}</span
                        >
                      }
                    }
                    <button
                      type="button"
                      class="btn btn-ghost xs"
                      [attr.aria-expanded]="d.showTranscript"
                      (click)="patch(l.id, { showTranscript: !d.showTranscript })"
                    >
                      <i class="ms" aria-hidden="true">edit_note</i>Paste transcript
                    </button>
                    @if (l.youtubeId && l.transcriptStatus !== 'PENDING') {
                      <button
                        type="button"
                        class="btn btn-ghost xs"
                        [disabled]="!data()!.autoTranscripts"
                        [title]="
                          data()!.autoTranscripts ? 'Generate the transcript from the video' : 'Needs GEMINI_API_KEY'
                        "
                        (click)="generate(l)"
                      >
                        <i class="ms" aria-hidden="true">auto_awesome</i
                        >{{ l.transcriptStatus === 'NONE' ? 'Generate' : 'Regenerate' }}
                      </button>
                    }
                    @if (l.hasTranscript) {
                      <button
                        type="button"
                        class="btn btn-ghost xs"
                        [disabled]="d.saving"
                        (click)="removeTranscript(l)"
                      >
                        <i class="ms" aria-hidden="true">delete</i>Remove transcript
                      </button>
                    }
                  </div>
                </div>
              </div>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [
    `
      .content-row {
        display: flex;
        gap: 14px;
        padding: 12px 0;
        border-top: 1px solid var(--line);
      }
      .thumb {
        width: 160px;
        aspect-ratio: 16/9;
        flex-shrink: 0;
        border-radius: 8px;
        background: var(--surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        color: var(--ink-3);
      }
      .mono-sm {
        font-family: var(--f-mono);
        font-size: 12px;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      @media (max-width: 640px) {
        .content-row {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class CourseContentPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  readonly slug = input.required<string>();
  readonly data = signal<CourseContentView | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly drafts = signal<Record<string, Draft>>({});
  readonly preview = (url: string) => (url.trim() ? parseYoutubeId(url) : null);
  readonly generatingAll = signal(false);
  readonly pending = computed(
    () =>
      this.data()
        ?.modules.flatMap((m) => m.lessons)
        .filter((l) => l.transcriptStatus === 'PENDING').length ?? 0,
  );
  private poll: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.slug();
      untracked(() => void this.load());
    });
    // While transcripts are being generated, refresh their status.
    effect(() => {
      const n = this.pending();
      untracked(() => {
        if (this.poll) clearTimeout(this.poll);
        this.poll = n ? setTimeout(() => void this.refreshStatus(), POLL_MS) : null;
      });
    });
    inject(DestroyRef).onDestroy(() => this.poll && clearTimeout(this.poll));
  }

  /** Updates lesson rows without touching unsaved drafts. */
  private async refreshStatus() {
    try {
      const d = await this.api.courseContent(this.slug());
      this.drafts.update((drafts) => {
        const next = { ...drafts };
        for (const m of d.modules) for (const l of m.lessons) next[l.id] ??= this.draftFor(l);
        return next;
      });
      this.data.set(d);
    } catch {
      this.poll = setTimeout(() => void this.refreshStatus(), POLL_MS * 2);
    }
  }

  private draftFor(l: LessonContentView): Draft {
    return {
      url: l.youtubeId ? `https://youtu.be/${l.youtubeId}` : '',
      summary: l.summary ?? '',
      transcript: '',
      showTranscript: false,
      saving: false,
    };
  }

  async generate(l: LessonContentView) {
    try {
      await this.api.generateTranscript(l.id);
      this.toast.ok(`Transcribing ${l.label}. This can take a minute or two.`);
      await this.refreshStatus();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  async generateAll() {
    this.generatingAll.set(true);
    try {
      const { queued } = await this.api.generateCourseTranscripts(this.slug());
      this.toast.ok(
        queued
          ? `Transcribing ${queued} lesson${queued === 1 ? '' : 's'}.`
          : 'Every lesson video already has a transcript.',
      );
      await this.refreshStatus();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.generatingAll.set(false);
    }
  }

  async removeTranscript(l: LessonContentView) {
    this.patch(l.id, { saving: true });
    try {
      await this.api.updateLessonContent(l.id, { transcript: null });
      this.toast.ok(`Transcript removed from ${l.label}.`);
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
      this.patch(l.id, { saving: false });
    }
  }

  async load() {
    this.error.set(null);
    try {
      const d = await this.api.courseContent(this.slug());
      const drafts: Record<string, Draft> = {};
      for (const m of d.modules) for (const l of m.lessons) drafts[l.id] = this.draftFor(l);
      this.drafts.set(drafts);
      this.data.set(d);
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  patch(id: string, p: Partial<Draft>) {
    this.drafts.update((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  }

  dirty(l: LessonContentView) {
    const d = this.drafts()[l.id];
    return (
      (this.preview(d.url) ?? null) !== l.youtubeId || d.summary.trim() !== (l.summary ?? '') || !!d.transcript.trim()
    );
  }

  async save(l: LessonContentView) {
    const d = this.drafts()[l.id];
    this.patch(l.id, { saving: true });
    try {
      await this.api.updateLessonContent(l.id, {
        youtubeUrl: d.url.trim() ? d.url.trim() : null,
        summary: d.summary.trim() ? d.summary.trim() : null,
        ...(d.transcript.trim() ? { transcript: d.transcript } : {}),
      });
      this.toast.ok(`${l.label} saved.`);
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
      this.patch(l.id, { saving: false });
    }
  }
}
