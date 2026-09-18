# Phase B runbook — project.json → GitHub Project

実際に https://github.com/users/aiarranger/projects/3 を作ったときの手順。
API でできること／できないことが明確に分かれているので、その境界どおりに進める。

## 0. 前提確認

```bash
gh auth status                      # 対象 owner のアカウントに project スコープがあるか
gh api repos/<owner>/<repo> --jq '.permissions'   # push=true のアカウントを使う
```

複数アカウントがある場合は、明示的にトークンを渡す:

```bash
export GH_TOKEN=$(gh auth token -u <owner>)
```

## 1. API でやる部分（スクリプト）

リポジトリルートで:

```bash
node .agents/skills/issue-map/scripts/sync-project.mjs --owner <owner> --repo <repo> [--project-number <n>] [--dry-run]
```

- `project.json` を読み、`lib/project-state.mjs` で Status（Ready/Doing/Waiting/Blocked/Done）を算出する
- Project 作成（タイトル一致なら再利用）、リポジトリへのリンク、README、フィールド、アイテム、View 作成まで一括
- 冪等。既存 Project に対して再実行しても、UI で設定済みの Column by / Group by は壊れない
- 終了時に「残りの UI 作業」を列挙する

### API の仕様上の注意（ハマりどころ）

| 事象 | 対処 |
|---|---|
| カスタムフィールド名 `Milestone` は組み込みフィールドと衝突して作れない | `Phase` を使う。選択肢名に `M0 今日を決める` のように M 番号を含める |
| Status の選択肢を差し替えると既存アイテムの値が消える | `updateProjectV2Field` に既存オプションの `id` を含めて渡す（スクリプト対応済み） |
| `createProjectV2View` の入力は `name / layout / configuration.visibleFieldIds` のみ、`filter` は `updateProjectV2View` で設定 | Board の Column by、Swimlanes、Table の Group by、Sort、View の並び順は **API 非対応**（2026-09 時点） |
| Board を新規作成すると列は必ず Status | Map と Board｜Phase は UI で列フィールドを変える |
| 新規 Project には既定の `View 1` がある | スクリプトはこれを先頭の `Map｜Phase×Area` に転用する（並び替えの手間を減らす） |

## 2. ブラウザでやる部分（API 非対応）

GitHub の Web UI で、対象 owner としてログインした状態で行う。組み込みブラウザ／Chrome どちらでもよい。

### 2-1. View の表示設定

各 View を開き、右上の **「View」ボタン**（歯車アイコン。タブ名横の ▾ ではない）を押す。

| View | 設定 |
|---|---|
| Map｜Phase×Area | Column by → **Area**、Swimlanes → **Phase** |
| 全体｜Table | Group by → **Phase** |
| Board｜Phase | Column by → **Phase** |

設定を変えると「Unsaved changes」になるので、同じメニュー内の **Save view → Save** で保存する。
保存しないと他の人・次回アクセス時には反映されない。

### 2-2. View の並び順

タブ名横の **▾ → Move view** → ダイアログで `Move item before` と移動先を選び **Move**。
最終的な順番:

```
Map｜Phase×Area → Next｜着手できる → 全体｜Table → Board｜Status → Board｜Phase
```

先頭の View が Project を開いたときの既定になる。「全 Issue 管理」ではなく「まず地図を見る」Project にするため、Map を先頭にする。

### 2-3. 保存確認（API で読み取れる）

```bash
gh api graphql -f query='query{ node(id:"<PROJECT_ID>"){ ... on ProjectV2 { views(first:10){ nodes { name filter
  verticalGroupByFields(first:1){nodes{... on ProjectV2SingleSelectField{name}}}
  groupByFields(first:1){nodes{... on ProjectV2SingleSelectField{name}}} } } } } }'
```

期待値: `Map｜Phase×Area` が `verticalGroupBy=Area, groupBy=Phase`、`全体｜Table` が `groupBy=Phase`、`Board｜Phase` が `verticalGroupBy=Phase`。

## 3. Status の意味（レビューで確定した区別）

- `Waiting` = 前の Issue が終わっていないだけの **正常な待ち**
- `Blocked` = 問題が起きて止まっている **異常**（`manual_state: "blocked"` のときだけ）

依存待ちを Blocked にすると「問題が大量発生している」ように見えるので、必ず分ける。
初期状態の Map では Ready が 1 件、残りが Waiting になるのが正しい。

## 4. レビュー用スクリーンショット

Map｜Phase×Area を開いた 1 枚を渡すとレビューが速い。全 Phase × 全 Area が 1 画面に収まる幅（6 列なら約 2100px、5 行なら高さ約 1400px）で撮る。
Claude 組み込みブラウザの screenshot は 800px 幅に縮小されるため、必要なら Claude アプリのウィンドウだけを `screencapture -l <windowID>` で撮ってペイン部分を切り出す。**画面全体のキャプチャは他ディスプレイの私的な画面が写るので使わない。**

## 5. 完了条件

- [ ] `sync-project.mjs` が検証エラーなしで終了
- [ ] 5 View が存在し、2-1 の表示設定が保存済み（2-3 で確認）
- [ ] View の並び順が 2-2 のとおり
- [ ] Status の集計が「Ready ≥ 1、Blocked = 0（問題がなければ）」
- [ ] Map のスクリーンショットで Milestone 行 × Area 列が Issue Map（ダッシュボード issue）の表と一致
