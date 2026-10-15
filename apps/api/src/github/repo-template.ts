/**
 * Files every team repository starts with. The README teaches the conventions that link
 * code to tasks; the CI workflow runs the team's own tests on every push and pull request.
 * (The platform's hidden acceptance tests run separately, in the sandbox.)
 */

export interface TemplateContext {
  title: string;
  summary: string;
  problem: string;
  slug: string;
  roles: { title: string }[];
  stack: string[];
  webUrl: string;
}

export function readme(c: TemplateContext): string {
  return `# ${c.title}

${c.summary}

**The problem:** ${c.problem}

Built by a StudywidBuddy project team (${c.roles.map((r) => r.title).join(', ')}).${
    c.stack.length ? `\nStack: ${c.stack.join(', ')}.` : ''
  }

Workspace, board and AI PM: ${c.webUrl}/projects/${c.slug}/workspace

## How we work

Every change starts from a task on the board.

1. **Branch per task.** Name it after the task key: \`task-24-refresh-tokens\`.
2. **Pull request per task.** Start the title with the key: \`TASK-24: Rotate refresh tokens\`.
   The platform links the PR to the task, moves the task to *Review*, and shows CI status on it.
3. **Tests.** Write tests for your change. CI runs them on every push. Before a task can be
   marked done, the platform also runs its own acceptance tests in a sandbox. Both must pass.
4. **Review.** At least one teammate reviews before merging. Squash-merge into \`main\`.

## CI

\`.github/workflows/ci.yml\` detects the project type and runs:

- Node.js (\`package.json\`): \`npm ci\`, \`npm run lint --if-present\`, \`npm test\`, \`npm run build --if-present\`
- Python (\`requirements.txt\` / \`pyproject.toml\`): \`pip install\` and \`pytest\`

Change it as the project grows: it's yours.
`;
}

export const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Detect project type
        id: detect
        run: |
          if [ -f package.json ]; then echo "node=true" >> "$GITHUB_OUTPUT"; fi
          if [ -f requirements.txt ] || [ -f pyproject.toml ]; then echo "python=true" >> "$GITHUB_OUTPUT"; fi

      - if: steps.detect.outputs.node == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - if: steps.detect.outputs.node == 'true'
        run: |
          npm ci
          npm run lint --if-present
          npm test
          npm run build --if-present

      - if: steps.detect.outputs.python == 'true'
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - if: steps.detect.outputs.python == 'true'
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install -e .; fi
          pip install pytest
          pytest

      - if: steps.detect.outputs.node != 'true' && steps.detect.outputs.python != 'true'
        run: echo "No package.json or requirements.txt yet. Add your project files and tests."
`;

export const PR_TEMPLATE = `## Task

TASK-

## What changed

-

## How I tested it

- [ ] Added or updated tests
- [ ] CI is green

## Notes for the reviewer
`;

export const GITIGNORE = `node_modules/
dist/
build/
coverage/
.env
.env.*
!.env.example
__pycache__/
*.pyc
.venv/
.DS_Store
*.pem
`;
