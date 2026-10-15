import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProjectDetail, SelectionRunView } from '@studywidbuddy/shared';
import { TeamSelectionPage } from './team-selection.page';

const project = { id: 'p1', slug: 'p', title: 'Delivery', status: 'OPEN', roles: [] } as unknown as ProjectDetail;
const run: SelectionRunView = {
  id: 'run1',
  projectId: 'p1',
  status: 'PROPOSED',
  summary: '1 of 1 seats filled from 2 applicants (2 eligible). Every role is covered.',
  createdAt: '2026-10-14T00:00:00Z',
  appliedAt: null,
  roles: [{ id: 'r1', title: 'Backend', seats: 1, selected: 1 }],
  candidates: [
    {
      applicationId: 'a1',
      user: { id: 'u1', username: 'a', displayName: 'Ada', avatarUrl: null },
      appliedRole: { id: 'r1', title: 'Backend' },
      hoursPerWeek: 10,
      evaluation: {
        overall: 80,
        technical: 80,
        problemSolving: 80,
        communication: 80,
        projectFit: 80,
        recommendedRoleTitle: null,
      },
      decision: {
        selected: true,
        role: { id: 'r1', title: 'Backend' },
        fit: 0.81,
        reasons: ['Selected as Backend (fit 81%).'],
      },
    },
    {
      applicationId: 'a2',
      user: { id: 'u2', username: 'b', displayName: 'Ben', avatarUrl: null },
      appliedRole: { id: 'r1', title: 'Backend' },
      hoursPerWeek: 5,
      evaluation: null,
      decision: { selected: false, role: null, fit: 0, reasons: ['No completed interview evaluation.'] },
    },
  ],
};

describe('TeamSelectionPage', () => {
  let fixture: ComponentFixture<TeamSelectionPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TeamSelectionPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(TeamSelectionPage);
    fixture.componentRef.setInput('slug', 'p');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/v1/projects/p').flush(project);
    await fixture.whenStable();
    http.expectOne('/api/v1/admin/projects/p1/selection-runs/latest').flush(run);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows the proposal as needing approval, with its impact and reasons', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('NEEDS APPROVAL');
    expect(el.textContent).toContain('1 people are invited');
    expect(el.textContent).toContain('No completed interview evaluation.');
  });

  it('applies only after the admin confirms', async () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    const approve = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent!.includes('Approve and form team'),
    )!;
    approve.click();
    expect(confirmSpy).toHaveBeenCalled();
    http.expectNone('/api/v1/admin/selection-runs/run1/apply');

    confirmSpy.and.returnValue(true);
    approve.click();
    http
      .expectOne('/api/v1/admin/selection-runs/run1/apply')
      .flush({ ...run, status: 'APPLIED', appliedAt: '2026-10-14T01:00:00Z' });
  });
});
