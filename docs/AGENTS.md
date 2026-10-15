# AI project manager (agents)

Every project team has an AI project manager. It reads the board, runs team meetings, remembers what happened, and proposes work. **It never changes tasks on its own.** Creating or changing a task is a proposal that a team member approves, and the change then runs as that member.

Code: `apps/api/src/pm/`. UI: the **AI PM**, **Meetings** and **Chat** tabs of the project workspace.

## Pieces

| Piece               | File                          | What it does                                                                                          |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Project snapshot    | `project-snapshot.service.ts` | One project-scoped read of brief, team, sprint and tasks, rendered as prompt text                     |
| Memory              | `memory.service.ts`           | `ProjectMemory` rows (FACT, DECISION, RISK, MEMBER_NOTE, SUMMARY). Every query filters by `projectId` |
| Tool registry       | `tool-registry.ts`            | Tool definitions: zod schema, risk level, human label, executor                                       |
| Agent loop          | `agent.service.ts`            | Bounded tool-use loop with persisted steps, calls and results, plus approvals                         |
| Meetings            | `meetings.service.ts`         | Scheduler tick, question prep, answers, summaries, follow-up runs                                     |
| Prompts and schemas | `pm-ai.ts`                    | Meeting questions, meeting summary, agent system prompt, limits                                       |
| Worker              | `pm.processor.ts`             | BullMQ queue `pm`: `pm.tick` (every 5 min), `meeting.prepare`, `meeting.summarize`, `agent.run`       |

## Tools

| Tool                                                                     | Risk           | Effect                                                                                         |
| ------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------- |
| `get_board`, `get_team`, `get_task`, `get_recent_activity`, `get_memory` | READ           | Read this project only                                                                         |
| `remember`                                                               | WRITE_LOW      | Adds to this project's memory                                                                  |
| `post_message`                                                           | WRITE_LOW      | Posts to the team chat as the AI PM                                                            |
| `comment_on_task`                                                        | WRITE_LOW      | Adds an AI PM note to the task's timeline                                                      |
| `create_task`                                                            | NEEDS_APPROVAL | Proposal; on approval, created through `TasksService` as the approver and marked `aiSuggested` |
| `update_task`                                                            | NEEDS_APPROVAL | Proposal: reassign, priority, due date, move into the active sprint. Needs a `reason`          |

There is deliberately no delete tool and no status change: the AI PM can't close, move or remove anyone's work.

## A run

```
AgentRun QUEUED ──job agent.run──► RUNNING
  loop (≤ 8 steps):
    model turn (toolCall) ──► AgentStep(text)
    for each tool call:
      unknown tool / invalid input / over a limit ──► AgentToolCall FAILED + AgentToolResult(error) ──► error fed back to the model
      READ or WRITE_LOW ──► execute ──► EXECUTED + result ──► result fed back (capped at 12k chars)
      NEEDS_APPROVAL ──► PROPOSED ──► "waiting for approval, has NOT happened" fed back
  no tool calls ──► final text = run summary ──► COMPLETED
```

Runs start in two ways. A member clicks **Ask the AI PM** (up to 10 per project per day, optional goal), or a meeting summary has follow-ups.

**Approvals.** `POST /pm/proposals/:id/approve` claims the proposal with a conditional update (double clicks get a 409). It re-validates the stored input and executes it with the approver's identity, so the normal workspace rules apply (assignees must be active members, and so on). Success becomes `EXECUTED`; a rule violation becomes `FAILED` with the reason. Both are logged on the project timeline. Rejecting just records who rejected it.

## Guardrails

- Limits per run: 8 model turns, 20 tool calls, 5 proposals.
- Every reference (task key, username, role key) is resolved inside the run's project; anything else is a tool error.
- Inputs are validated with zod before anything runs (enum priorities, Fibonacci estimates, key formats, lengths).
- Member-written text (meeting answers, notes) is passed inside tags with `<`/`>` escaped and treated as data.
- Memory is project-scoped by construction and visible to the team, who can remove wrong entries (archived for audit).
- With no AI configured, nothing is scheduled and the endpoints return `503 AI_NOT_CONFIGURED`.

## Meetings

- **Check-in**: every `meetingIntervalDays` (default 3; admins can set 1–14 or pause the AI PM) while the project is `IN_PROGRESS` with active members. The first is due that many days after the project starts. Three personal questions per member: progress on their task keys, next step or blocker, and one "explain how it works" question. Questions are written on the fast model. Window: 24 h.
- **Final review**: once, when the planned end (`startsAt + durationWeeks`) is 3 days away. Five in-depth questions per member: what they built, decisions, integration, hardest problem, improvements. Written on the smart model. Window: 48 h. Admins can call it early.
- Members answer **by voice** (the AI reads each question aloud, then listens) **or by typing**. Teammates' answers stay hidden until the summary.
- When everyone has answered, or the window closes, the summary is written on the smart model. It stores the summary, highlights and risks, a note per member, and new memory entries. It posts to the team chat, marks non-answerers `MISSED`, and starts a follow-up run if there are follow-ups.
- Only one meeting can be in progress per project (partial unique index). The model can't skip anyone: a member it leaves out gets the standard questions.

## What's not built yet

- Live group calls with the AI speaking in real time. Today's meetings are asynchronous voice/text stand-ups. A live call needs an SFU (LiveKit) and a realtime voice model.
- Notifications outside the app (email reminders for open check-ins).
- GitHub-aware tools (PR status, CI results) arrive with the GitHub integration.
