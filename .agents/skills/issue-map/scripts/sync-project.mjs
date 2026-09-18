#!/usr/bin/env node
// Phase B: project.json → GitHub Project (v2) を作成・同期する。
//
// 使い方（リポジトリルートで実行）:
//   GH_TOKEN=$(gh auth token -u <owner>) node .agents/skills/issue-map/scripts/sync-project.mjs --owner <user> --repo <repo>
//   オプション: --project-number <n>（既存Projectを更新）, --title "<title>", --dry-run
//
// やること（冪等）:
//   1. Project を作成 or 再利用（タイトル一致）し、リポジトリにリンク
//   2. Status を Ready/Doing/Waiting/Blocked/Done に変更（既存オプションIDを維持）
//   3. Phase / Area / Depends on フィールドを作成 or 再利用
//   4. project.json の全 Issue をアイテム追加し、4フィールドを設定
//   5. 5つの View を作成（name / layout / filter / 表示フィールドまで）
//
// やれないこと（GraphQL API 非対応。reference/phase-b-runbook.md の手順でブラウザから設定する）:
//   - Board の Column by / Swimlanes、Table の Group by、View の並び順
//
// Status の判定は lib/project-state.mjs（ダッシュボードと同じ規則）を使う。
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const args = parseArgs(process.argv.slice(2));
const OWNER = args.owner, REPO = args.repo;
if (!OWNER || !REPO) die("--owner と --repo は必須です");
const DRY = Boolean(args["dry-run"]);
const config = JSON.parse(readFileSync(resolve("project.json"), "utf8"));
const {calculateProjectState} = await import(pathToFileURL(resolve("lib/project-state.mjs")).href);

const TITLE = args.title || config.project?.title || `Issue Map｜${(config.goal || "").split("。")[0].slice(0, 30)}`;
const STATUS_OPTIONS = [
  {name: "Ready",   color: "GREEN",  description: "今着手できる"},
  {name: "Doing",   color: "YELLOW", description: "作業中"},
  {name: "Waiting", color: "GRAY",   description: "前のIssue待ち（正常な依存待ち）"},
  {name: "Blocked", color: "RED",    description: "問題が起きて止まっている"},
  {name: "Done",    color: "PURPLE", description: "完了（Issueをclose）"}
];
const STATE_TO_STATUS = {READY: "Ready", ACTIVE: "Doing", WAITING: "Waiting", BLOCKED: "Blocked", DONE: "Done"};
const AREA_COLORS = {UX: "PINK", App: "BLUE", Platform: "PURPLE", Data: "ORANGE", QA: "GREEN", Ops: "GRAY"};
const PHASE_COLORS = ["BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE", "GRAY"];

// ---- 1. owner / repo / issues -------------------------------------------------
const ownerInfo = gql(`query($login:String!){ repositoryOwner(login:$login){ id __typename } repository(owner:$login,name:"${REPO}"){ id } }`, {login: OWNER});
const ownerId = ownerInfo.repositoryOwner.id, repoId = ownerInfo.repository.id;

const issues = [];
let cursor = null;
do {
  const r = gql(`query($o:String!,$r:String!,$c:String){ repository(owner:$o,name:$r){ issues(first:100,after:$c,states:[OPEN,CLOSED]){ pageInfo{hasNextPage endCursor} nodes{ id number title state } } } }`, {o: OWNER, r: REPO, c: cursor});
  issues.push(...r.repository.issues.nodes);
  cursor = r.repository.issues.pageInfo.hasNextPage ? r.repository.issues.pageInfo.endCursor : null;
} while (cursor);
const issueById = new Map(issues.map((i) => [i.number, i]));

const state = calculateProjectState(config, issues.map((i) => ({number: i.number, title: i.title, github_state: i.state.toLowerCase()})));
if (state.errors.length) {
  console.error("project.json の検証エラー:\n" + state.errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

// ---- 2. project --------------------------------------------------------------
let project;
if (args["project-number"]) {
  const q = ownerInfo.repositoryOwner.__typename === "Organization" ? "organization" : "user";
  project = gql(`query($l:String!,$n:Int!){ ${q}(login:$l){ projectV2(number:$n){ id number url title } } }`, {l: OWNER, n: Number(args["project-number"])})[q].projectV2;
} else {
  const q = ownerInfo.repositoryOwner.__typename === "Organization" ? "organization" : "user";
  const list = gql(`query($l:String!){ ${q}(login:$l){ projectsV2(first:50){ nodes{ id number url title closed } } } }`, {l: OWNER})[q].projectsV2.nodes;
  project = list.find((p) => p.title === TITLE && !p.closed);
  if (!project) {
    log(`Project を作成: ${TITLE}`);
    project = DRY ? {id: "DRY", number: 0, url: "(dry-run)"} : gql(`mutation($o:ID!,$t:String!){ createProjectV2(input:{ownerId:$o,title:$t}){ projectV2{ id number url title } } }`, {o: ownerId, t: TITLE}).createProjectV2.projectV2;
  }
}
log(`Project: ${project.url}`);
mutate(`mutation($p:ID!,$r:ID!){ linkProjectV2ToRepository(input:{projectId:$p,repositoryId:$r}){ repository{ id } } }`, {p: project.id, r: repoId});
const readme = [
  `# ${TITLE}`, "", `**Goal:** ${config.goal || ""}`, "",
  `- 正本: \`project.json\`（${OWNER}/${REPO}）${config.dashboard_issue ? ` ／ ダッシュボード: #${config.dashboard_issue}` : ""}`,
  "- 完了 = GitHub Issue を close する",
  "- Status: Ready（今着手できる）/ Doing（作業中）/ Waiting（前のIssue待ち）/ Blocked（問題が起きて止まっている）/ Done",
  `- Phase: ${state.sortedMilestones.map((m) => `${m.id} ${m.label}`).join(" → ")}`,
  `- Area: ${config.categories.map((c) => c.label).join(" / ")}`,
  "- まず「Map｜Phase×Area」で地図を見る → 「Next｜着手できる」で今やるものを選ぶ"
].join("\n");
mutate(`mutation($p:ID!,$d:String!,$r:String!){ updateProjectV2(input:{projectId:$p,shortDescription:$d,readme:$r}){ projectV2{ id } } }`, {p: project.id, d: (config.goal || "").slice(0, 250), r: readme});

// ---- 3. fields ---------------------------------------------------------------
const fields = () => DRY ? {nodes: []} : gql(`query($p:ID!){ node(id:$p){ ... on ProjectV2 { fields(first:50){ nodes{ ... on ProjectV2Field{ id name dataType } ... on ProjectV2SingleSelectField{ id name dataType options{ id name } } } } } } }`, {p: project.id}).node.fields;
let fieldList = fields().nodes;
const field = (name) => fieldList.find((f) => f.name === name);

// Status: 既存オプションのIDを保ちつつ名前・色を揃える（Todo→Ready, In Progress→Doing の既定3つを再利用）
const statusField = field("Status");
if (statusField) {
  const legacy = {Todo: "Ready", "In Progress": "Doing", Active: "Doing"};
  const byName = new Map(statusField.options.map((o) => [legacy[o.name] || o.name, o.id]));
  const opts = STATUS_OPTIONS.map((o) => byName.has(o.name) ? {id: byName.get(o.name), ...o} : o);
  mutate(`mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:$o}){ projectV2Field{ ... on ProjectV2SingleSelectField{ id } } } }`, {f: statusField.id, o: opts});
}
// Phase（"Milestone" は組み込みフィールド名と衝突するため Phase）
ensureSingleSelect("Phase", state.sortedMilestones.map((m, i) => ({name: `${m.id} ${m.label}`, color: PHASE_COLORS[i % PHASE_COLORS.length], description: ""})));
ensureSingleSelect("Area", config.categories.map((c) => ({name: c.label, color: AREA_COLORS[c.label] || "GRAY", description: ""})));
if (!field("Depends on")) mutate(`mutation($p:ID!){ createProjectV2Field(input:{projectId:$p,dataType:TEXT,name:"Depends on"}){ projectV2Field{ ... on ProjectV2Field{ id } } } }`, {p: project.id});
fieldList = fields().nodes;

// ---- 4. items ----------------------------------------------------------------
const existingItems = DRY ? [] : gql(`query($p:ID!){ node(id:$p){ ... on ProjectV2 { items(first:100){ nodes{ id content{ ... on Issue{ number } } } } } } }`, {p: project.id}).node.items.nodes;
const itemByNumber = new Map(existingItems.filter((i) => i.content?.number).map((i) => [i.content.number, i.id]));
const catLabel = Object.fromEntries(config.categories.map((c) => [c.id, c.label]));
const fid = (n) => field(n)?.id || "DRY";
const optionId = (fname, oname) => {
  const o = field(fname)?.options.find((x) => x.name === oname);
  if (!o && !DRY) die(`${fname} に "${oname}" がありません`);
  return o?.id || "DRY";
};
for (const ex of state.executions) {
  const issue = issueById.get(ex.number);
  if (!issue) die(`Issue #${ex.number} が見つかりません`);
  let itemId = itemByNumber.get(ex.number);
  if (!itemId) itemId = DRY ? "DRY" : gql(`mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item{ id } } }`, {p: project.id, c: issue.id}).addProjectV2ItemById.item.id;
  const status = STATE_TO_STATUS[ex.status];
  const phase = `${ex.meta.milestone} ${state.sortedMilestones.find((m) => m.id === ex.meta.milestone).label}`;
  const area = catLabel[ex.meta.category];
  const dep = ex.meta.depends_on.map((d) => `#${d}`).join(", ") || "—";
  setSingle(itemId, "Status", status); setSingle(itemId, "Phase", phase); setSingle(itemId, "Area", area);
  mutate(`mutation($p:ID!,$i:ID!,$f:ID!,$t:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{text:$t}}){ projectV2Item{ id } } }`, {p: project.id, i: itemId, f: field("Depends on")?.id || "DRY", t: dep});
  log(`#${ex.number}\t${ex.meta.milestone}\t${area}\t${status}\t${dep}`);
}

// ---- 5. views ----------------------------------------------------------------
const F = {title: fid("Title"), status: fid("Status"), phase: fid("Phase"), area: fid("Area"), dep: fid("Depends on"), assignees: fid("Assignees")};
const VIEWS = [
  {name: "Map｜Phase×Area",  layout: "BOARD_LAYOUT", filter: "",                    fields: [F.title, F.status, F.dep],                              ui: "Column by = Area, Swimlanes = Phase"},
  {name: "Next｜着手できる",  layout: "TABLE_LAYOUT", filter: "status:Ready,Doing",  fields: [F.title, F.status, F.phase, F.area, F.dep, F.assignees], ui: null},
  {name: "全体｜Table",       layout: "TABLE_LAYOUT", filter: "",                    fields: [F.title, F.status, F.phase, F.area, F.dep, F.assignees], ui: "Group by = Phase"},
  {name: "Board｜Status",     layout: "BOARD_LAYOUT", filter: "",                    fields: [F.title, F.phase, F.area, F.dep],                       ui: null},
  {name: "Board｜Phase",      layout: "BOARD_LAYOUT", filter: "",                    fields: [F.title, F.status, F.area, F.dep],                      ui: "Column by = Phase"}
];
const existingViews = DRY ? [] : gql(`query($p:ID!){ node(id:$p){ ... on ProjectV2 { views(first:20){ nodes{ id name layout } } } } }`, {p: project.id}).node.views.nodes;
const todoUI = [];
VIEWS.forEach((v, idx) => {
  let view = existingViews.find((x) => x.name === v.name);
  if (!view && idx === 0 && existingViews.length === 1 && existingViews[0].name === "View 1") {
    // 新規Projectの既定 "View 1" は先頭の Map に転用（並び順の手作業を減らす）
    view = existingViews[0];
    mutate(`mutation($v:ID!,$n:String!,$l:ProjectV2ViewLayout!,$f:[ID!]!){ updateProjectV2View(input:{viewId:$v,name:$n,layout:$l,configuration:{visibleFieldIds:$f}}){ projectV2View{ id } } }`, {v: view.id, n: v.name, l: v.layout, f: v.fields});
  } else if (!view) {
    view = DRY ? {id: "DRY"} : gql(`mutation($p:ID!,$n:String!,$l:ProjectV2ViewLayout!,$f:[ID!]!){ createProjectV2View(input:{projectId:$p,name:$n,layout:$l,configuration:{visibleFieldIds:$f}}){ projectV2View{ id } } }`, {p: project.id, n: v.name, l: v.layout, f: v.fields}).createProjectV2View.projectV2View;
  }
  if (v.filter) mutate(`mutation($v:ID!,$f:String!){ updateProjectV2View(input:{viewId:$v,filter:$f}){ projectV2View{ id } } }`, {v: view.id, f: v.filter});
  if (v.ui) todoUI.push(`  - ${v.name}: ${v.ui}`);
});

console.log(`\n完了: ${project.url}`);
console.log(`残りはブラウザで設定（API非対応）。手順: .agents/skills/issue-map/reference/phase-b-runbook.md`);
console.log(todoUI.join("\n"));
console.log(`  - View の並び順: Map｜Phase×Area → Next｜着手できる → 全体｜Table → Board｜Status → Board｜Phase`);

// ---- helpers -----------------------------------------------------------------
function ensureSingleSelect(name, options) {
  const f = field(name);
  if (!f) {
    mutate(`mutation($p:ID!,$n:String!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ createProjectV2Field(input:{projectId:$p,dataType:SINGLE_SELECT,name:$n,singleSelectOptions:$o}){ projectV2Field{ ... on ProjectV2SingleSelectField{ id } } } }`, {p: project.id, n: name, o: options});
    return;
  }
  const missing = options.filter((o) => !f.options.some((x) => x.name === o.name));
  if (missing.length) {
    const merged = [...f.options.map((x) => ({id: x.id, name: x.name, color: (options.find((o) => o.name === x.name) || {}).color || "GRAY", description: ""})), ...missing];
    mutate(`mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:$o}){ projectV2Field{ ... on ProjectV2SingleSelectField{ id } } } }`, {f: f.id, o: merged});
  }
}
function setSingle(itemId, fname, oname) {
  mutate(`mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }`, {p: project.id, i: itemId, f: fid(fname), o: optionId(fname, oname)});
}
function mutate(query, variables) { if (!DRY) return gql(query, variables); }
function gql(query, variables = {}) {
  const input = JSON.stringify({query, variables});
  let out;
  try {
    out = execFileSync("gh", ["api", "graphql", "--input", "-"], {input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]});
  } catch (e) {
    die(`GraphQL 失敗:\n${e.stdout || ""}${e.stderr || ""}\n--- query ---\n${query}`);
  }
  const json = JSON.parse(out);
  if (json.errors) die(`GraphQL エラー: ${JSON.stringify(json.errors)}\n--- query ---\n${query}`);
  return json.data;
}
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) o[k] = true; else { o[k] = v; i++; }
  }
  return o;
}
function log(s) { console.log((DRY ? "[dry-run] " : "") + s); }
function die(msg) { console.error(msg); process.exit(1); }
