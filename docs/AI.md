# AI architecture

How StudywidBuddy uses LLMs, and the rules that keep that safe, bounded and observable. Agent-specific design (AI PM, tools, approvals, meetings) is in `docs/AGENTS.md`.

## Provider abstraction

`apps/api/src/ai/ai-provider.ts` defines `AiProvider` with four operations:

| Method               | Use                                                                          |
| -------------------- | ---------------------------------------------------------------------------- |
| `generate`           | Plain text (summaries, explanations)                                         |
| `generateStructured` | Output that changes application state: always validated against a zod schema |
| `stream`             | Long, user-visible answers (AI Buddy)                                        |
| `toolCall`           | One model turn with tools available; the caller owns the loop (agents)       |

Domain modules inject `AiProvider` and never import a vendor SDK. Two adapters exist:

- `AnthropicProvider`: Claude via the official `@anthropic-ai/sdk`. Default model `claude-opus-5-5` (`AI_MODEL`). Uses `output_config.effort` (medium for question writing, high for evaluation) and structured outputs (`messages.parse` + zod). The server-side refusal fallback (`fallbacks: "default"`) is enabled, so a safety-classifier decline is retried on a fallback model inside the same call.
- `DisabledAiProvider`: selected when `AI_PROVIDER=none` (the default). Every call fails with `NOT_CONFIGURED`; the API returns `503 AI_NOT_CONFIGURED`, and the UI says AI isn't available. **Nothing is ever faked in production code.** The scripted provider used by e2e tests lives under `apps/api/test/fakes/` only.

Configuration (`apps/api/.env`): `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=…`, optional `AI_MODEL` and `AI_MODEL_FAST`. The API refuses to boot with `AI_PROVIDER=anthropic` and no key.

### Two model tiers (cost)

Each request names a tier (`AiRequest.tier`):

| Tier              | Model (default)                      | Used for                                                                                                                       |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `fast`            | `claude-haiku-5-5` (`AI_MODEL_FAST`) | AI Buddy chat and voice answers, voice-check questions, check-in questions                                                     |
| `smart` (default) | `claude-opus-5-5` (`AI_MODEL`)       | Interview questions and evaluation, voice-check reports, meeting summaries, final-review questions, agent runs, plan proposals |

The rule: high volume and conversational goes to `fast`; anything that judges a person or changes project state goes to `smart`. `effort` only applies to the smart tier.

## LLM output is untrusted input

1. **Schema first.** Anything that affects state goes through `generateStructured` with a zod schema; the adapter re-validates after the SDK does.
2. **Clamp and recompute.** Interview sub-scores are clamped to 0–100 and the overall score is computed by our code from fixed weights (`interviews/scoring.ts`). The model's arithmetic is never stored.
3. **Allow-lists, not free text.** A recommended role must be one of the project's real role keys, or it is dropped.
4. **Database constraints back it up.** `CHECK` constraints reject out-of-range scores whatever produced them.
5. **Prompt injection.** Everything a user wrote is placed inside `<candidate_*>` tags with `<`/`>` escaped (so it can't close its block), and system prompts say to treat it as data. Injection attempts are reported as feedback, not obeyed. Tests cover the escaping.

## Background work

AI calls that can take more than a moment run in BullMQ jobs (`queue/queue.module.ts`, Redis) so no HTTP request waits on a model:

- Deterministic job ids (`interview.evaluate-<sessionId>-initial`) collapse double submits.
- Handlers are idempotent: they check the session status and claim the transition with a conditional update, so duplicate or late jobs do nothing.
- Transient failures (`UNAVAILABLE`, `INVALID_OUTPUT`) retry 3× with exponential backoff; permanent ones (`FATAL`, `REFUSED`) fail immediately. When a job gives up, the interview becomes `FAILED` with a plain-language message and a Retry button. Provider error details stay in server logs.
- Workers run inside the API process today. They only touch Postgres and the queue, so they can move to a separate process without code changes.

## Cost and observability

Every request is recorded in `AiCall` (purpose, model, input/output tokens, duration, success, error kind, user). Prompts and outputs are not stored. AI endpoints are rate-limited to 5 requests/minute per IP, and applying (which leads to an interview) requires a verified email.

## AI interview flow (milestone 2)

```
Application SUBMITTED
  └─ POST /applications/:id/interview ──► InterviewSession GENERATING, application INTERVIEW_PENDING
        └─ job interview.questions ──► 6 validated questions, session READY, application INTERVIEW_IN_PROGRESS
              └─ candidate answers (autosaved; no scores shown)
                    └─ POST /interviews/:id/submit ──► session SUBMITTED, application UNDER_REVIEW
                          └─ job interview.evaluate ──► CandidateEvaluation stored, session EVALUATED
```

The interview and the evaluation are separate records: the session holds questions and answers; `CandidateEvaluation` holds the structured result. The candidate sees written feedback only after evaluation. Team selection (milestone 3) reads evaluations as one input among several.

Voice interviews can be added later by feeding transcribed answers into the same `InterviewResponse` rows; nothing downstream depends on the answer being typed.

## AI Buddy and voice (Study Workspace)

- **Chat**: `POST /enrollments/:id/tutor` on the fast tier. The system prompt carries the course outline (lessons marked done/not yet), lesson summaries, the current lesson's video transcript, and the learner's private note (escaped, treated as data). Last 12 turns of history; turns are merged so roles always alternate. "Hint first" unless the learner asks for the answer. 20 requests/min.
- **Voice**: speech-to-text and text-to-speech run in the browser (Web Speech API: free and keyless; Chrome/Edge/Safari for recognition). With `viaVoice: true` the model answers in 2–5 short spoken sentences with no formatting. A voice conversation loops listen → answer → speak until the learner ends it, or after three silent turns. A server-side speech API (e.g. for Firefox or better accuracy) can be added later behind the same endpoints.
- **Voice check**: `POST /enrollments/:id/assessments` needs at least 2 finished lessons. A job writes 5 questions about finished lessons only (fast tier). The learner answers aloud or types; answers are flagged `speech-to-text` so the evaluator ignores transcription noise. A second job evaluates on the smart tier: per-question 0–10 score, feedback and a model answer, then strengths, gaps and lessons to revisit (only real lesson labels survive). **The overall 0–100 score is computed by code.** The report is shown immediately and kept under the course; one check can be open per enrollment (partial unique index).

- **Following the video**: the lesson player talks to the YouTube embed over its postMessage protocol (`features/study/youtube-bridge.ts`, `enablejsapi=1`, origin-checked) to read the current time and seek. Questions send `atSec`; the prompt then gets the transcript from 2½ minutes before to 45 s after that point in full, plus the whole lesson (capped) for context, and the video title/channel. The tutor is told to cite timestamps, explain simply (analogy → precise idea), end with a check-in, and to say plainly when there's no transcript instead of guessing. Messages store `atSec`; the chat shows an "at 4:12" chip that seeks the video. The Transcript tab highlights the line being spoken; clicking a line seeks.
- **Where transcripts come from** (`Lesson.transcriptSegments`, `transcriptSource`): an admin pastes one on "Manage lesson videos" (YouTube's "Show transcript" copy or `[mm:ss] text` lines are parsed into timed segments; text without timestamps is kept as one block), or generates it with **Gemini**, which accepts a public YouTube URL as input (`study/video-transcriber.ts`, `GEMINI_API_KEY`, `GEMINI_MODEL`). Generation is a queued job (`lesson.transcribe` on the assessments queue), per lesson or for every video in a course that has none; it only stores the result if the video wasn't changed meanwhile. Changing a lesson's video drops its old transcript. We don't scrape YouTube's caption endpoints.

## CV screening and the voice interview (replaces the written interview)

```
Apply + CV (PDF ≤ 5 MB, checked by magic bytes, stored in Postgres)
  └─ job cv.screen (smart model reads the PDF directly) ──► 5 sub-scores → ATS score computed by code (weights in interviews/scoring.ts)
        ├─ ATS < 80 ──► REJECTED (CV_BELOW_THRESHOLD) + feedback + catalogue courses for missing role skills
        └─ ATS ≥ 80 ──► INTERVIEW_PENDING, interview AWAITING_SCHEDULE
              └─ candidate books "now" or an on-the-hour slot (09:00–20:00 local, next 5 days; joinable −10 min … +3 h)
                    └─ start: smart model writes a plan (opening + 4–6 topics from role and CV digest)
                          └─ live turns (fast model): FOLLOW_UP / NEXT_TOPIC / CLOSE, normalised by interview-flow.ts
                                (≤ 1 follow-up in a row, can't close early, closes at 9 answers or 30 min; plan carries the call if the AI fails)
                                └─ job interview.evaluate (smart) ──► overall computed by code
                                      ├─ ≥ 60 ──► seat (row-locked, first come first served); full role closes → others ROLE_FILLED + similar projects
                                      └─ < 60 ──► REJECTED (INTERVIEW_BELOW_THRESHOLD) + feedback + courses
```

- **Entry-level (BEGINNER) projects skip CV matching**: the CV is optional, the application goes straight to INTERVIEW_PENDING and the candidate books the interview. The ≥ 60 interview rule and seat assignment are unchanged (`cvRequiredFor` in shared contracts).
- **Voice only.** Answers come from browser speech recognition; the page has no text input. Think time, speaking time and tab switches are recorded and shown to admins as integrity signals; scores judge content only.
- **Structured output limits.** The API enforces a schema's shape, but limits (max length/items, min/max numbers) only reach the model as hints. `ai/coerce.ts` truncates/clamps to those limits before strict zod validation; anything else invalid is `INVALID_OUTPUT` and retried.
