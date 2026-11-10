import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import { Api } from '../../core/api';
import { StudyStore } from './study.store';

const BEAT_MS = 60_000;
/** No input and no video progress for this long means the learner stepped away. */
const IDLE_MS = 3 * 60_000;
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'mousemove', 'touchstart'] as const;

/**
 * Tells the API about once a minute that the learner is studying: the tab is visible and
 * they interacted recently or a lesson video is playing. Feeds the "30 minutes of study"
 * rule on the profile's activity graph. Best effort: a failed beat is simply skipped.
 */
@Injectable()
export class StudyHeartbeat {
  private readonly api = inject(Api);
  private readonly store = inject(StudyStore);
  private lastActive = Date.now();

  constructor() {
    const mark = () => (this.lastActive = Date.now());
    for (const e of ACTIVITY) document.addEventListener(e, mark, { passive: true });
    // Video progress counts as activity even without touching the mouse.
    effect(() => {
      if (this.store.videoSec() !== null) mark();
    });
    const timer = setInterval(() => void this.beat(), BEAT_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      for (const e of ACTIVITY) document.removeEventListener(e, mark);
    });
  }

  private async beat() {
    const enrollment = this.store.enrollment();
    const idle = Date.now() - this.lastActive > IDLE_MS;
    if (!enrollment || enrollment.status !== 'ACTIVE' || document.visibilityState !== 'visible' || idle) return;
    try {
      await this.api.studyBeat(enrollment.id);
    } catch {
      // Best effort: the next beat will count.
    }
  }
}
