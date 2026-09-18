---
name: issue-map
description: Goal-first GitHub issue planning and Issue Map Project creation. Use when the user says "issueをつくって" or equivalent and wants a multi-issue project/feature plan. If the request is clearly one bug or one small change, create a normal single issue instead. Phase A creates Issues + project.json. Phase B creates/syncs a GitHub Project with a Phase×Area map.
metadata:
  short-description: Create GitHub issues and a visual Issue Map project
---

# Issue Map

Create GitHub Issues that stay understandable even after the issue count grows, then visualize them as a GitHub Project.

Reference Project:
https://github.com/users/aiarranger/projects/3

Use the reference for layout and naming style, not as a source of project requirements.

## Trigger

Use this skill when the user says **「issueをつくって」**, **「Issueを作って」**, or an equivalent request to create the issue structure for a project or feature.

If the user is clearly asking for one bug/fix/change only, do not expand it into an Issue Map. Create one issue normally.

## Operating model

There are two phases.

### Phase A — ChatGPT / browser / in-app
Create the Issue structure and `project.json`.

Expected environment:
- ChatGPT browser or in-app browser
- GitHub connector available
- No GitHub Projects write capability required

### Phase B — Codex / Claude / Cursor
Read `project.json`, create/update the GitHub Project, populate fields, create the views, and add deterministic status sync where possible.

If one agent can perform both phases, it may do both in one run.

---

# Core model

## 1. Milestone = human-verifiable outcome

A Milestone is **not a technical layer**.

Good:
- 今日やることを決められる
- 保存して戻っても残る
- 友だちと一緒に遊べる

Bad:
- DB完成
- API完成
- 認証実装
- CI整備

Create roughly **3–6 Milestones**.

Each Milestone should be expressible as a short user scenario:
1. start
2. perform a few actions
3. observe a result
4. decide whether the outcome works

The user should be able to verify it by looking at and operating the product.

## 2. Areas are fixed

Use these Areas unless the user explicitly changes them:

- `UX` — decide what the user does and what success looks like
- `App` — screens, interactions, product behavior
- `Platform` — persistence, auth, networking, runtime, backend/platform logic
- `Data` — seed data, schemas, content definitions, conversion/migration data
- `QA` — end-to-end or human-visible verification
- `Ops` — release, deployment, monitoring, rollback, pilot operation

Do not invent more Areas just because an issue feels unusual.

A user-facing Milestone should normally have:
- one UX issue near the start
- one QA issue as the final gate

Do not invent UX work for a purely internal technical project.

## 3. One Issue = one Milestone × one Area

An Issue must not cross Area boundaries.

Split by **completion responsibility**, not by files touched.

Example:
- "画面を作り、DBへ保存し、E2E確認する" is too broad.
- Split into App / Platform / QA.

Do not prefix titles with `[M0][APP]`.
Project fields carry that metadata.

## 4. Dependencies are only hard dependencies

Add `depends_on` only when an Issue truly cannot start before another finishes.

Do not serialize work merely because it feels orderly.

Prefer parallel work when possible.

## 5. Status semantics

Use exactly:

- `Ready` — can start now
- `Doing` — currently being worked on
- `Waiting` — normal dependency wait
- `Blocked` — abnormal problem requiring intervention
- `Done` — GitHub Issue is closed

**Waiting is not Blocked.**

Default deterministic rule:

1. closed Issue → Done
2. explicit manual blocker → Blocked
3. unfinished hard dependency → Waiting
4. explicit active state → Doing
5. otherwise → Ready

Do not calculate percentage progress.

---

# Phase A — create Issues

## Step 1. Inspect before creating

Read:
- existing Issues
- repository README / requirements
- existing `project.json`
- existing Issue Map skill/instructions if present

If an Issue Map already exists, update it instead of creating a second structure.

## Step 2. Clarify only what changes the structure

If the goal is too ambiguous to design Milestones correctly, ask the minimum necessary questions.

Usually the missing information is one of:
- who the user is
- what the first useful end-to-end outcome is
- what is explicitly out of scope

Do not ask implementation questions that can be decided later.

## Step 3. Design Milestones

Use short, human-readable outcome names.

Prefer:
- `M0 今日を決める`
- `M1 Doneを残す`
- `M2 毎日くり返す`

Avoid long explanatory labels.

## Step 4. Design Issues

Issue titles should be understandable without category prefixes.

Good:
- 入島〜歩行のUXを決める
- 今日の予定を閉じても残るようにする
- 4人で一緒に遊べるか確認する

Keep bodies compact.

Recommended body:

```md
## Goal
このIssueが終わると何が成立するか。

## Done
- 人間またはテストが確認できる完了条件
- 2〜5項目程度

## Out of scope
- このIssueではやらないこと
```

Do not duplicate the whole project specification into every Issue.

## Step 5. Create Issues

Create the actual GitHub Issues first.

Do not create draft-only placeholders if real repository Issues are available.

After creation, capture the real issue numbers.

## Step 6. Write project.json

Create or update repository-root `project.json`.

Use actual Issue numbers.

Minimum structure:

```json
{
  "schema_version": 1,
  "project": {
    "title": "Issue Map | <service>",
    "reference_project_url": "https://github.com/users/aiarranger/projects/3"
  },
  "goal": "<one sentence>",
  "categories": [
    {"id":"UX","label":"UX"},
    {"id":"APP","label":"App"},
    {"id":"PLATFORM","label":"Platform"},
    {"id":"DATA","label":"Data"},
    {"id":"VERIFY","label":"QA"},
    {"id":"OPS","label":"Ops"}
  ],
  "milestones": [
    {"id":"M0","label":"<outcome>","order":0}
  ],
  "issues": [
    {
      "number": 12,
      "milestone": "M0",
      "category": "UX",
      "required": true,
      "depends_on": [],
      "manual_state": null
    }
  ]
}
```

`manual_state` is normally null.
Only use:
- `"doing"`
- `"blocked"`

Waiting is derived from dependencies and should not be stored manually.

## Step 7. Handoff

After Phase A, tell the user:
- how many Milestones and Issues were created
- which Issue is Ready first
- that `project.json` is ready for Project creation

For Codex / Claude / Cursor, the next instruction can simply be:
**「projectを作って」**

---

# Phase B — create GitHub Project

Read `project.json` first.

Do not redesign the Issue structure unless it is invalid.

## Authentication

Prefer GitHub CLI when available.

GitHub Projects commands require the `project` token scope.

Check:
`gh auth status`

If needed and user authorization is available:
`gh auth refresh -s project`

Never invent credentials or silently expose a private Project.

## Project

Create or reuse:

`Issue Map | <service>`

If an equivalent Project already exists, update it rather than duplicating it.

Use the visibility requested by the user.
If the source repo is private, do not make the Project public without explicit approval.

## Fields

Create/use these fields:

### Phase
Single select.
Options are all Milestones in order:
- M0 <label>
- M1 <label>
- ...

### Area
Single select:
- UX
- App
- Platform
- Data
- QA
- Ops

### Status
Single select:
- Ready
- Doing
- Waiting
- Blocked
- Done

### Depends on
Text field.
Render dependencies as:
- `#12`
- `#12, #13`

Do not use this text as the logical source of truth; `project.json` is authoritative.

## Items

Add all execution Issues from `project.json`.

Exclude:
- duplicate Issues
- meta/debug Issues
- dashboard-only Issues
- Issues intentionally omitted from `project.json`

Populate Phase, Area, Status, and Depends on.

## Views

Create these views.

### 1. Map | Phase×Area
**This is the primary view and should be first.**

- layout: Board
- columns: Area
- group/rows: Phase
- cards show Status and Depends on where useful

The visual target is:
https://github.com/users/aiarranger/projects/3

### 2. Next | 着手できる
Show:
- Ready
- Doing

Hide:
- Waiting
- Done

This is the work queue.

### 3. 全体 | Table
Table view with:
- Title
- Status
- Phase
- Area
- Depends on
- Assignees

Group by Phase.

### 4. Board | Status
Board columns by Status.

### 5. Board | Phase
Board columns by Phase.

If the CLI/API cannot create the desired view configuration, use GitHub UI/browser automation for the view setup. Do not omit the primary Map view merely because field creation via CLI is easier.

---

# Deterministic sync

The runtime project state must not require an LLM.

When practical, add deterministic synchronization.

Inputs:
- GitHub Issue open/closed
- `project.json`
- explicit manual state

Rules:
- closed → Done
- manual blocked → Blocked
- dependency open → Waiting
- manual doing → Doing
- otherwise → Ready

Sync:
- Status
- Phase
- Area
- Depends on

Trigger on:
- Issue opened/edited/closed/reopened
- `project.json` changes

For a user-owned GitHub Project, Project field writes may require a token with `project` scope. If CI lacks that permission:
- do not fake successful sync
- leave setup instructions
- keep `project.json` valid so Codex/Claude/Cursor can complete the setup

---

# Validation

Before finishing, check:

- every execution Issue appears exactly once in `project.json`
- each Issue has exactly one Phase
- each Issue has exactly one Area
- no unknown dependency
- no dependency cycles
- each user-visible Milestone has one QA gate
- normal dependency waits appear as Waiting, not Blocked
- the first actionable Issue is Ready
- the primary Project view is Map | Phase×Area
- Issue titles are readable without internal codes
- no progress percentage is used

If the map is visually hard to scan, reduce Issue granularity or shorten titles before adding more views.
