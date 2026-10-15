import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { InterviewView } from '@studywidbuddy/shared';
import { InterviewPage } from './interview.page';

const base = (patch: Partial<InterviewView>): InterviewView => ({
  id: 'iv1',
  applicationId: 'app1',
  status: 'SCHEDULED',
  failureMessage: null,
  project: { slug: 'p', title: 'Delivery Platform', difficulty: 'INTERMEDIATE' },
  role: { id: 'r1', title: 'Backend Developer' },
  scheduledFor: '2026-10-20T10:00:00.000Z',
  canJoin: false,
  turns: [],
  current: null,
  closingRemark: null,
  startedAt: null,
  submittedAt: null,
  evaluation: null,
  integrity: null,
  ...patch,
});

describe('InterviewPage (voice)', () => {
  let fixture: ComponentFixture<InterviewPage>;
  let http: HttpTestingController;

  async function render(view: InterviewView) {
    TestBed.configureTestingModule({
      imports: [InterviewPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(InterviewPage);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('id', 'app1');
    fixture.detectChanges();
    http.expectOne('/api/v1/applications/app1/interview').flush(view);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('never offers a text box to type answers', async () => {
    const el = await render(
      base({
        status: 'LIVE',
        canJoin: true,
        current: { position: 2, kind: 'TECHNICAL', focus: 'f', prompt: 'Q?', answer: null },
      }),
    );
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('input[type="text"]')).toBeNull();
    expect(el.textContent).toContain('Rejoin the call');
  });

  it('explains when a booked interview is not open yet', async () => {
    const el = await render(base({}));
    expect(el.textContent).toContain('Not open yet');
    expect(el.textContent).toContain('Back to application');
  });

  it('shows the score, feedback and transcript once evaluated', async () => {
    const el = await render(
      base({
        status: 'EVALUATED',
        turns: [
          {
            position: 1,
            kind: 'INTRODUCTION',
            focus: 'Introduction',
            prompt: 'Introduce yourself.',
            answer: 'I build APIs.',
          },
        ],
        evaluation: {
          technicalScore: 70,
          problemSolvingScore: 65,
          communicationScore: 80,
          projectFitScore: 75,
          overallScore: 71,
          recommendedRole: null,
          strengths: ['Clear structure'],
          areasToImprove: ['More depth on indexes'],
          summary: 'You explained your approach clearly.',
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      }),
    );
    expect(el.textContent).toContain('71');
    expect(el.textContent).toContain('You passed the interview');
    expect(el.textContent).toContain('Clear structure');
    expect(el.textContent).toContain('I build APIs.');
  });

  it('marks a score below 60 as not passing', async () => {
    const el = await render(
      base({
        status: 'EVALUATED',
        evaluation: {
          technicalScore: 40,
          problemSolvingScore: 40,
          communicationScore: 50,
          projectFitScore: 50,
          overallScore: 43,
          recommendedRole: null,
          strengths: ['Honest'],
          areasToImprove: ['Fundamentals'],
          summary: 'Keep practising the basics.',
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      }),
    );
    expect(el.textContent).toContain('Below the 60 needed for a seat');
  });
});
