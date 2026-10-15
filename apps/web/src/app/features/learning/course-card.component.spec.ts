import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EnrollmentView } from '@studywidbuddy/shared';
import { CourseCardComponent } from './course-card.component';

const enrollment: EnrollmentView = {
  id: 'e1',
  status: 'ACTIVE',
  level: 'INTERMEDIATE',
  startedAt: '2026-10-01T00:00:00Z',
  completedAt: null,
  progress: 62,
  completedLessonIds: [],
  course: { id: 'c1', slug: 'angular', title: 'Angular', category: 'FRONTEND' },
  currentModule: { position: 4, title: 'Dependency Injection' },
  nextLesson: { id: 'l1', label: '4.4', title: 'Injection tokens' },
};

describe('CourseCardComponent', () => {
  let fixture: ComponentFixture<CourseCardComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CourseCardComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(CourseCardComponent);
    fixture.componentRef.setInput('enrollment', enrollment);
    fixture.componentRef.setInput('slot', 1);
    fixture.componentRef.setInput('primary', true);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('shows the slot, course, progress and next lesson', () => {
    const text = el.textContent!;
    expect(text).toContain('SLOT 1 · FRONTEND');
    expect(text).toContain('Angular');
    expect(text).toContain('62%');
    expect(text).toContain('4.4 Injection tokens');
    expect(el.querySelector('.btn-continue')!.classList).toContain('btn-primary');
  });

  it('emits leave from the menu, and features that are not built yet are disabled', () => {
    let left = false;
    fixture.componentInstance.leave.subscribe(() => (left = true));
    (el.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('.menu button'));
    expect(items.find((b) => b.textContent!.includes('Schedule session'))!.disabled).toBeTrue();
    items.find((b) => b.textContent!.includes('Leave course'))!.click();
    expect(left).toBeTrue();
  });
});
