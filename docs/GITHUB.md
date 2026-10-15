# GitHub integration

Each project team gets a **private repository** in the platform's GitHub organization (`GITHUB_ORG`). The platform links pull requests to tasks, shows CI results on the board, and won't let a task be marked done while its pull request's checks are failing.

Code: `apps/api/src/github/`. UI: **Settings → Connected accounts**, and the **GitHub** tab of the project workspace.

## How it works

| Step                                         | What happens                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student connects GitHub                      | OAuth through the GitHub App. We store only the GitHub user id and login; the OAuth token is discarded straight away. The `state` is a 10-minute signed token naming the user. One GitHub account per StudywidBuddy account.                                                                                                      |
| Admin creates the team repo                  | Workspace → GitHub → **Create team repository**. Creates a GitHub team `<slug>-team` with write access, a private repo `<slug>` (squash merges only, branches deleted after merge), and the starter files: README with conventions, `.github/workflows/ci.yml`, PR template, `.gitignore`. Safe to retry after a partial failure. |
| Access                                       | Every active member with a linked account is put on the GitHub team. This happens when the repo is created, when someone links GitHub, and when someone joins the team. **Sync access** repeats it. People who aren't in the org yet get a GitHub invitation email.                                                               |
| Pull request opened                          | The `TASK-n` in the title (or `task-n-…` in the branch) links it to the task. The task's branch and PR link are set. A ready (non-draft) PR moves an _In progress_ task to _Review_. A system message goes to the team chat.                                                                                                      |
| New commits                                  | The PR's checks go back to _Pending_ until CI reports on the new head commit. Results for older commits are ignored.                                                                                                                                                                                                              |
| CI finishes (`workflow_run` / `check_suite`) | The PR's checks become _Passed_ or _Failed_ and are logged on the timeline.                                                                                                                                                                                                                                                       |
| Merged                                       | If CI passed, the task moves to _Done_ automatically. Otherwise it stays in _Review_, with a note saying why.                                                                                                                                                                                                                     |
| Moving a task to Done by hand                | Blocked (`409 CHECKS_NOT_PASSING`) while any linked open or merged PR has failing or running checks. Tasks without a PR (docs, design) aren't gated.                                                                                                                                                                              |
| Push                                         | Logged as "pushed N commits to branch".                                                                                                                                                                                                                                                                                           |

## Webhooks

- Endpoint `POST /api/v1/github/webhook`. Every request must carry a valid `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with `GITHUB_WEBHOOK_SECRET`). Anything else gets a 401.
- Each `X-GitHub-Delivery` is stored once (`GithubDelivery`), so GitHub's retries do nothing the second time.
- Events for repos that aren't platform team repos are acknowledged and ignored.
- **Local development:** GitHub can't reach `localhost`, so the app's webhook URL is a smee.io channel. When `NODE_ENV=development` and `GITHUB_WEBHOOK_PROXY_URL` is set, the API relays that channel to its own webhook endpoint (`github/smee-relay.ts`). **In production**, set the app's webhook URL to `https://<api-domain>/api/v1/github/webhook` and leave `GITHUB_WEBHOOK_PROXY_URL` empty.

## Configuration (`apps/api/.env`)

```
GITHUB_ORG=studywidbuddy-projects
GITHUB_APP_ID=…
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
GITHUB_APP_PRIVATE_KEY_PATH=C:\path\outside\the\repo\app.pem   # or GITHUB_APP_PRIVATE_KEY="-----BEGIN…" when hosting
GITHUB_WEBHOOK_SECRET=…
GITHUB_WEBHOOK_PROXY_URL=https://smee.io/…                    # development only
```

All empty means GitHub features are off, and the UI says so. Half-configured stops the API at boot with a list of what's missing.

**The GitHub App** (owned by the organization):

- **Repository permissions:** Administration, Checks, Commit statuses, Contents, Pull requests and Workflows set to read & write; Actions read-only.
- **Organization permissions:** Members set to read & write.
- **Events:** Check run, Check suite, Member, Pull request, Pull request review, Push, Repository, Workflow run.
- **Callback URL:** `<API_PUBLIC_URL>/api/v1/github/callback`.
- **Installation:** on the organization with access to all repositories. Organization base permission: _No permission_. Members can't create repositories.

## Plan notes

On GitHub's free organization plan, branch protection isn't available for private repos. The platform enforces the review and CI rules itself (task gating above). Moving to GitHub Team would add enforcement on GitHub's side too.

## Next

- AI code review on each pull request (the AI PM comments on the PR and on the task).
- Platform acceptance tests that run in the sandbox and report as a check run; they must pass alongside the team's CI.
- Publishing a repository (private → public) at the end of a project, with every member's consent.
