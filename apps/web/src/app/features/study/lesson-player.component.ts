import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { SkeletonComponent } from '../../ui/states.component';
import { StudyStore } from './study.store';
import { fmtTime, YoutubeBridge } from './youtube-bridge';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Learn tab: the lesson video (YouTube, privacy-enhanced embed), what the lesson covers,
 * the transcript, and progress. The video id is validated server-side and again here before
 * embedding. The player reports its position, so the AI Buddy knows which minute you're on.
 */
@Component({
  selector: 'sb-lesson-player',
  imports: [SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.lesson(); as l) {
      <div class="study-scroll">
        <div class="study-video">
          @if (embed(); as src) {
            <iframe
              #player
              (load)="playerLoaded()"
              [src]="src"
              [title]="'Lesson video: ' + l.label + ' ' + l.title"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            ></iframe>
          } @else {
            <div class="study-video-empty">
              <span class="mono">LESSON VIDEO · {{ l.label }} {{ l.title.toUpperCase() }}</span>
              <span>No video is attached to this lesson yet.</span>
              @if (isAdmin()) {
                <span class="faint" style="font-size:12px"
                  >You can add one from “Manage lesson videos” on the course page.</span
                >
              }
            </div>
          }
        </div>

        @if (l.video && l.youtubeId) {
          <span class="video-credit">
            <i class="ms" aria-hidden="true">smart_display</i>
            <span class="ellipsis">{{ l.video.title }}</span>
            <span class="faint">· {{ l.video.channel }}</span>
            <a [href]="'https://www.youtube.com/watch?v=' + l.youtubeId" target="_blank" rel="noopener"
              >Watch on YouTube</a
            >
          </span>
          <div class="video-moment">
            <span class="mono faint" style="font-size:11px">
              @if (store.videoSec() !== null) {
                AT {{ fmt(store.videoSec()!) }}
              } @else {
                PLAY THE VIDEO
              }
            </span>
            <button type="button" class="ai-btn sm" (click)="askMoment()">
              <span class="ai-diamond" aria-hidden="true"></span>
              {{ store.videoSec() !== null ? 'Explain this moment' : 'Ask AI about the video' }}
            </button>
            <span class="faint" style="font-size:11.5px;margin-left:auto">
              @if (l.transcriptTimed) {
                <i class="ms" aria-hidden="true" style="font-size:14px;vertical-align:-3px">subtitles</i> The AI Buddy
                follows the video transcript
              } @else if (l.transcript) {
                <i class="ms" aria-hidden="true" style="font-size:14px;vertical-align:-3px">subtitles</i> Transcript
                without timestamps
              } @else {
                <i class="ms" aria-hidden="true" style="font-size:14px;vertical-align:-3px">subtitles_off</i> No
                transcript yet: the AI explains from the lesson outline
              }
            </span>
          </div>
        }

        <div class="study-lesson-head">
          <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
            <span class="t">{{ l.label }} {{ l.title }}</span>
            <span class="s">{{ l.moduleTitle }} · {{ minutes(l.durationSec) }}</span>
          </div>
          <div class="study-lesson-actions">
            <button
              type="button"
              class="ai-btn"
              (click)="ask.emit('Explain the key idea of lesson ' + l.label + ' simply.')"
            >
              <span class="ai-diamond" aria-hidden="true"></span>Ask AI about this lesson
            </button>
            @if (l.completed) {
              <span class="status ok"><i class="ms" aria-hidden="true">check_circle</i>Done</span>
            } @else if (store.isActive()) {
              <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="markDone()">
                <i class="ms" aria-hidden="true">check</i>Mark done
              </button>
            }
          </div>
        </div>

        <div class="study-subtabs" role="tablist" aria-label="Lesson">
          <button
            type="button"
            role="tab"
            [class.on]="sub() === 'about'"
            [attr.aria-selected]="sub() === 'about'"
            (click)="sub.set('about')"
          >
            About
          </button>
          <button
            type="button"
            role="tab"
            [class.on]="sub() === 'transcript'"
            [attr.aria-selected]="sub() === 'transcript'"
            [disabled]="!l.transcript"
            (click)="sub.set('transcript')"
          >
            Transcript
          </button>
        </div>
        @if (sub() === 'about') {
          <p class="study-about">
            {{
              l.summary ??
                'The course author hasn’t written a summary for this lesson yet. The AI Buddy will use the lesson title and course outline.'
            }}
          </p>
        } @else if (l.transcript && l.transcriptTimed) {
          <div class="transcript" #transcript>
            @for (seg of l.transcript; track seg.start; let i = $index) {
              <button
                type="button"
                class="transcript-line"
                [class.now]="i === currentLine()"
                [attr.aria-current]="i === currentLine() ? 'true' : null"
                [title]="'Play from ' + fmt(seg.start)"
                (click)="store.seek(seg.start)"
              >
                <span class="mono">{{ fmt(seg.start) }}</span
                ><span>{{ seg.text }}</span>
              </button>
            }
          </div>
        } @else {
          <p class="study-about" style="white-space:pre-line">{{ l.transcript?.[0]?.text }}</p>
        }

        @if (l.next; as n) {
          <button type="button" class="study-next" (click)="go.emit(n.id)">
            <span class="mono faint" style="font-size:10.5px">NEXT</span>
            <span style="font-size:13.5px;font-weight:600">{{ n.label }} {{ n.title }}</span>
            <i class="ms" aria-hidden="true" style="margin-left:auto">arrow_forward</i>
          </button>
        } @else {
          <div class="study-next" style="cursor:default">
            <span class="mono faint" style="font-size:10.5px">LAST LESSON</span>
            <span style="font-size:13px;color:var(--ink-2)"
              >Finish the course from the course page once every lesson is done.</span
            >
          </div>
        }
      </div>
    } @else {
      <div class="study-scroll"><sb-skeleton [rows]="5" [height]="22" /></div>
    }
  `,
  styles: [':host{flex:1;display:flex;min-width:0;min-height:0}'],
})
export class LessonPlayerComponent {
  readonly store = inject(StudyStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly go = output<string>();
  readonly ask = output<string>();
  readonly sub = signal<'about' | 'transcript'>('about');
  readonly busy = signal(false);
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  readonly fmt = fmtTime;
  private readonly zone = inject(NgZone);
  private readonly player = viewChild<ElementRef<HTMLIFrameElement>>('player');
  private readonly transcriptEl = viewChild<ElementRef<HTMLElement>>('transcript');
  private bridge: YoutubeBridge | null = null;

  /** The transcript line being spoken now. */
  readonly currentLine = computed(() => {
    const segs = this.store.lesson()?.transcript;
    const at = this.store.videoSec();
    if (!segs || at === null) return -1;
    let i = -1;
    for (let k = 0; k < segs.length && segs[k].start <= at; k++) i = k;
    return i;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.bridge?.destroy());
    // Jump the video when something asks for it (transcript lines, "at 4:12" chips).
    effect(() => {
      const req = this.store.seekRequest();
      if (req) untracked(() => this.bridge?.seek(req.sec));
    });
    // Keep the spoken line in view while the transcript is open.
    effect(() => {
      const i = this.currentLine();
      const box = this.transcriptEl()?.nativeElement;
      const line = box?.querySelectorAll<HTMLElement>('.transcript-line')[i];
      if (line && box) box.scrollTo({ top: line.offsetTop - box.offsetTop - 40, behavior: 'smooth' });
    });
  }

  playerLoaded() {
    const el = this.player()?.nativeElement;
    if (!el) return;
    this.bridge?.destroy();
    // Position updates arrive several times a second; handle them outside Angular's zone and
    // only touch the signal when the whole second changes.
    this.zone.runOutsideAngular(() => {
      this.bridge = new YoutubeBridge(el, (sec) => this.store.videoSec.set(sec));
      this.bridge.listen();
    });
  }

  askMoment() {
    const l = this.store.lesson();
    if (!l) return;
    const at = this.store.videoSec();
    this.ask.emit(
      at !== null
        ? `I'm at ${fmtTime(at)} in the video. Explain what's being said here in simple words.`
        : `Walk me through what this lesson's video (${l.label}) covers, step by step.`,
    );
  }

  /** Only the id: the lesson object changes (e.g. marked done) without the video changing. */
  private readonly videoId = computed(() => this.store.lesson()?.youtubeId ?? null);
  readonly embed = computed<SafeResourceUrl | null>(() => {
    const id = this.videoId();
    if (!id || !YOUTUBE_ID.test(id)) return null;
    // Safe: the id matches the strict YouTube id pattern, and the host is fixed.
    // enablejsapi + origin let the player report its position to this page only.
    const origin = encodeURIComponent(window.location.origin);
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1&origin=${origin}`,
    );
  });

  minutes(sec: number) {
    return `${Math.max(1, Math.round(sec / 60))} min`;
  }

  async markDone() {
    const l = this.store.lesson();
    if (!l) return;
    this.busy.set(true);
    try {
      await this.store.completeLesson(l.id);
      this.toast.ok(`${l.label} marked done.`);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
