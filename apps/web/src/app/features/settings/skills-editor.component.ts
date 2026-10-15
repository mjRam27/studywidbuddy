import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SkillLevel, type ProfileSkill, type Skill } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { levelLabel } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { SkeletonComponent } from '../../ui/states.component';

/** Claimed skills with levels. Proven (DEMONSTRATED) skills are read-only: courses and projects earn them. */
@Component({
  selector: 'sb-skills-editor',
  imports: [FormsModule, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field">
      <label for="skill-search">Add a skill</label>
      <div class="search-box" style="width:100%;height:38px;background:var(--surface)">
        <i class="ms" aria-hidden="true">search</i>
        <input
          id="skill-search"
          placeholder="Search skills"
          autocomplete="off"
          [ngModel]="query()"
          (ngModelChange)="search($event)"
        />
      </div>
    </div>
    @if (results().length) {
      <div class="chips">
        @for (s of results(); track s.id) {
          @if (!claimed(s.id)) {
            <button type="button" class="choice-chip" (click)="add(s)">
              <i class="ms" aria-hidden="true" style="font-size:16px">add</i>{{ s.name }}
            </button>
          }
        }
      </div>
    }
    @if (loading()) {
      <sb-skeleton [rows]="3" />
    } @else {
      <div style="display:flex;flex-direction:column">
        @for (s of skills(); track s.skillId + s.source) {
          <div
            style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line-soft);flex-wrap:wrap"
          >
            <span class="grow" style="font-weight:500">{{ s.name }}</span>
            @if (s.source === 'DEMONSTRATED') {
              <span class="status ok"
                ><i class="ms" aria-hidden="true">verified</i>Proven · {{ levelLabel(s.level) }}</span
              >
            } @else {
              <div class="segmented" role="radiogroup" [attr.aria-label]="s.name + ' level'">
                @for (l of levels; track l) {
                  <button
                    type="button"
                    role="radio"
                    [attr.aria-checked]="s.level === l"
                    [class.on]="s.level === l"
                    (click)="setLevel(s.skillId, l)"
                  >
                    {{ levelLabel(l) }}
                  </button>
                }
              </div>
              <button
                type="button"
                class="icon-btn sm"
                [attr.aria-label]="'Remove ' + s.name"
                (click)="remove(s.skillId)"
              >
                <i class="ms" aria-hidden="true">close</i>
              </button>
            }
          </div>
        } @empty {
          <span class="faint sm" style="padding:8px 0">No skills yet.</span>
        }
      </div>
    }
  `,
  styles: [':host{display:flex;flex-direction:column;gap:12px}'],
})
export class SkillsEditorComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly levels = [SkillLevel.BEGINNER, SkillLevel.INTERMEDIATE, SkillLevel.ADVANCED];
  readonly levelLabel = levelLabel;
  readonly skills = signal<ProfileSkill[]>([]);
  readonly results = signal<Skill[]>([]);
  readonly query = signal('');
  readonly loading = signal(true);
  private timer: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit() {
    try {
      this.skills.set(await this.api.mySkills());
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  claimed(id: string) {
    return this.skills().some((s) => s.skillId === id && s.source === 'CLAIMED');
  }

  search(q: string) {
    this.query.set(q);
    clearTimeout(this.timer);
    if (!q.trim()) {
      this.results.set([]);
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        this.results.set(await this.api.searchSkills(q.trim(), 12));
      } catch {
        /* keep previous results */
      }
    }, 200);
  }

  add(s: Skill) {
    return this.run(() => this.api.setSkill(s.id, SkillLevel.BEGINNER));
  }
  setLevel(id: string, l: SkillLevel) {
    return this.run(() => this.api.setSkill(id, l));
  }
  remove(id: string) {
    return this.run(() => this.api.removeSkill(id));
  }

  private async run(op: () => Promise<ProfileSkill[]>) {
    try {
      this.skills.set(await op());
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }
}
