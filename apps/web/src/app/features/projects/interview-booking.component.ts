import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { InterviewSlots } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { ToastService } from '../../core/toast.service';

interface Day {
  key: string;
  label: string;
  slots: { iso: string; time: string }[];
}

/**
 * Booking card: "Start now", or an hourly slot over the next 5 days in the candidate's
 * timezone. Also shows an existing booking with its join window.
 */
@Component({
  selector: 'sb-interview-booking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ai-frame booking" aria-labelledby="book-h">
      <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI VOICE INTERVIEW</span>
      @if (scheduledFor() && !rebooking()) {
        <span class="booking-title" id="book-h">Booked for {{ fmt(scheduledFor()!) }}</span>
        <span class="muted sm"
          >About 15 minutes, spoken. You can join from 10 minutes before. Use Chrome or Edge with a microphone,
          somewhere quiet.</span
        >
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" [disabled]="!canJoin()" (click)="join()">
            <i class="ms" aria-hidden="true">call</i
            >{{ canJoin() ? 'Join interview' : 'Opens ' + rel(scheduledFor()!) }}
          </button>
          <button type="button" class="btn btn-ghost" (click)="openSlots()">Change time</button>
        </div>
      } @else {
        <span class="booking-title" id="book-h">Your CV passed. Book your voice interview</span>
        <span class="muted sm"
          >About 15 minutes with the AI interviewer: introduce yourself, then talk through a few questions about the
          role. Answers are spoken, not typed.</span
        >
        <div class="booking-now">
          <button type="button" class="btn btn-primary lg" [disabled]="busy()" (click)="book('now')">
            <i class="ms" aria-hidden="true">mic</i>Start now
          </button>
          <span class="faint sm">or pick a time in the next 5 days ({{ slots()?.timezone ?? '…' }})</span>
        </div>
        @if (!slots()) {
          <span class="faint sm">Loading times…</span>
        } @else {
          <div class="booking-days" role="tablist" aria-label="Day">
            @for (d of days(); track d.key) {
              <button
                type="button"
                role="tab"
                class="fchip"
                [class.on]="day() === d.key"
                [attr.aria-selected]="day() === d.key"
                (click)="day.set(d.key)"
              >
                {{ d.label }}
              </button>
            }
          </div>
          <div class="booking-slots">
            @for (s of currentDay()?.slots ?? []; track s.iso) {
              <button type="button" class="slot" [disabled]="busy()" (click)="book(s.iso)">{{ s.time }}</button>
            } @empty {
              <span class="faint sm">No times left on this day.</span>
            }
          </div>
        }
        @if (rebooking()) {
          <button type="button" class="btn btn-ghost xs" style="align-self:flex-start" (click)="rebooking.set(false)">
            Keep my current time
          </button>
        }
      }
    </section>
  `,
})
export class InterviewBookingComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly interviewId = input.required<string>();
  readonly applicationId = input.required<string>();
  readonly scheduledFor = input<string | null>(null);
  readonly canJoin = input(false);
  readonly changed = output<void>();

  readonly slots = signal<InterviewSlots | null>(null);
  readonly day = signal<string | null>(null);
  readonly busy = signal(false);
  readonly rebooking = signal(false);

  readonly days = computed<Day[]>(() => {
    const s = this.slots();
    if (!s) return [];
    const byDay = new Map<string, Day>();
    for (const iso of s.slots) {
      const d = new Date(iso);
      const key = d.toLocaleDateString('en-CA', { timeZone: s.timezone });
      const day = byDay.get(key) ?? {
        key,
        label: d.toLocaleDateString(undefined, {
          timeZone: s.timezone,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        slots: [],
      };
      day.slots.push({
        iso,
        time: d.toLocaleTimeString(undefined, { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' }),
      });
      byDay.set(key, day);
    }
    return [...byDay.values()];
  });
  readonly currentDay = computed<Day | undefined>(
    () => this.days().find((d) => d.key === this.day()) ?? this.days()[0],
  );

  ngOnInit() {
    if (!this.scheduledFor()) void this.loadSlots();
  }

  openSlots() {
    this.rebooking.set(true);
    if (!this.slots()) void this.loadSlots();
  }

  private async loadSlots() {
    try {
      const s = await this.api.interviewSlots(this.interviewId());
      this.slots.set(s);
      this.day.set(this.days()[0]?.key ?? null);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  async book(at: string) {
    this.busy.set(true);
    try {
      await this.api.scheduleInterview(this.interviewId(), at);
      if (at === 'now') {
        await this.router.navigate(['/applications', this.applicationId(), 'interview']);
        return;
      }
      this.toast.ok(`Booked for ${this.fmt(at)}. We’ve emailed you the details.`);
      this.rebooking.set(false);
      this.changed.emit();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  join() {
    void this.router.navigate(['/applications', this.applicationId(), 'interview']);
  }

  fmt(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  rel(iso: string) {
    const min = Math.round((new Date(iso).getTime() - 10 * 60_000 - Date.now()) / 60_000);
    if (min <= 0) return 'soon';
    if (min < 60) return `in ${min} min`;
    if (min < 48 * 60) return `in ${Math.round(min / 60)} h`;
    return this.fmt(iso);
  }
}
