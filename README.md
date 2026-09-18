# Personal Service Issue Map

一般的な個人向けサービスを題材にした Issue Map のサンプル兼、Issue Mapスキルのリファレンス実装です。

テーマは「今日やること・習慣を管理する小さなWebサービス」。

## Skill

Canonical skill:

`.agents/skills/issue-map/SKILL.md`

Trigger:
- 「issueをつくって」→ Issue構成 + `project.json`
- 「projectを作って」→ GitHub Projectの Issue Map を構築

Reference Project:
https://github.com/users/aiarranger/projects/3

## Source of truth

- `project.json`: Milestone / Area / dependency / manual state
- GitHub Issue open/closed: 完了状態
- GitHub Project: 人間が見る主画面
- Issue #25: CIで生成する補助Issue Map

## Areas

- UX: 人が何をして何が起きれば成功か
- App: 画面・操作
- Platform: 保存・日付処理などの基盤
- Data: 定義データ・ルール
- QA: 人が操作してゴール達成を確認
- Ops: 公開・運用

## Status

- Ready: 今着手できる
- Doing: 作業中
- Waiting: 正常な依存待ち
- Blocked: 問題が起きて停止
- Done: Issue closed

Waiting と Blocked は分けます。進捗率は使いません。
