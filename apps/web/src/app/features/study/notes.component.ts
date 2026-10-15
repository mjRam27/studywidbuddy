import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NOTE_MAX } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { StudyStore } from './study.store';

/** Notes tab: a private note per lesson, saved automatically. Shared notes need a Study Buddy. */
@Component({
  selector: 'sb-study-notes',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.lesson(); as l) {
      <div class="study-notes">
        <div class="study-notes-bar">
          <div class="seg" role="group" aria-label="Note type">
            <button type="button" class="on" aria-pressed="true">
              <i class="ms" aria-hidden="true">lock</i>Private
            </button>
            <button type="button" disabled title="Shared notes arrive with Study Buddies">
              <i class="ms" aria-hidden="true">group</i>Shared<span class="soon">SOON</span>
            </button>
          </div>
          <span class="faint" style="margin-left:auto;font-size:11.5px" aria-live="polite">{{ status() }}</span>
        </div>
        <div class="study-notes-body">
          <div class="chips">
            <span class="ctx-chip"
              ><i class="ms" aria-hidden="true">school</i>{{ store.course()?.title }} › Module
              {{ l.label.split('.')[0] }}</span
            >
            <span class="ctx-chip"><i class="ms" aria-hidden="true">play_circle</i>Lesson {{ l.label }}</span>
          </div>
          <h2 class="display" style="font-size:28px">{{ l.title }}</h2>
          <label class="sr-only" for="note-body">Your note on lesson {{ l.label }}</label>
          <textarea
            id="note-body"
            class="study-note-input"
            [ngModel]="body()"
            (ngModelChange)="edit($event)"
            [maxlength]="max"
            placeholder="Write what clicked, what didn’t, and what to ask. The AI Buddy reads this note when you ask about this lesson."
          ></textarea>
          <span class="faint" style="font-size:12px;display:flex;align-items:center;gap:6px"
            ><i class="ms" aria-hidden="true" style="font-size:15px">lock</i>Only you can see private notes</span
          >
        </div>
      </div>
    }
  `,
  styles: [':host{flex:1;display:flex;min-width:0;min-height:0}'],
})
export class NotesComponent {
  readonly store = inject(StudyStore);
  private readonly api = inject(Api);
  readonly max = NOTE_MAX;
  readonly body = signal('');
  readonly status = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { lessonId: string; body: string } | null = null;
  /** Reload the text only when a different lesson opens, never after our own save. */
  private readonly lessonId = computed(() => this.store.lesson()?.id);

  constructor() {
    effect(() => {
      this.lessonId();
      untracked(() => {
        const l = this.store.lesson();
        void this.flush();
        this.body.set(l?.note?.body ?? '');
        this.status.set(l?.note ? 'Saved' : '');
      });
    });
    inject(DestroyRef).onDestroy(() => void this.flush());
  }

  edit(v: string) {
    const l = this.store.lesson();
    if (!l) return;
    this.body.set(v);
    this.status.set('Editing…');
    this.pending = { lessonId: l.id, body: v };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 800);
  }

  private async flush() {
    clearTimeout(this.timer);
    const p = this.pending;
    const e = this.store.enrollment();
    this.pending = null;
    if (!p || !e) return;
    this.status.set('Saving…');
    try {
      const saved = await this.api.saveNote(e.id, p.lessonId, p.body);
      const l = this.store.lesson();
      if (l?.id === p.lessonId) {
        this.store.lesson.set({ ...l, note: saved.body ? saved : null });
      }
      this.status.set('Saved');
    } catch (err) {
      this.status.set(`Not saved: ${toApiError(err).message}`);
    }
  }
}
