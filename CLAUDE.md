@AGENTS.md

# J.A.R.V.I.S.

PC に常駐する個人用 AI エージェント。利用者は本人のみ。
画面から話しかけると、自宅 PC の Claude Code（`claude -p`、利用者の有料プラン）が返事をする。

## 仕組み（API 費用ゼロ）
- 画面: Next.js（App Router, TypeScript, Tailwind）。Vercel に公開。GitHub の main = 本番、他のブランチ = プレビュー。
- データ: Supabase。`messages` テーブルに発言と返事を保存する。定義は `supabase/migrations/`。
- PC 常駐プログラム: `agent/index.mjs`。Realtime で `status = 'pending'` の発言を受け取り、`claude -p` に返事を作らせて書き込む。
  - pending → processing → done / error の順に status を変える。pending から processing に変えられたときだけ処理する（二重処理の防止）。
  - 依頼文は `agent/lib/prompt.mjs`。システムプロンプトも含めて標準入力で渡す（Windows のコマンド引数で日本語が崩れるため）。
  - Claude Code に使わせる道具は `JARVIS_TOOLS`（既定 WebSearch）。PC 操作の機能はここを広げて足していく。
- Claude API は使わない（利用者の希望：費用をかけない）。claude.ai などのブラウザ画面の自動操作もしない（規約違反）。

## 守ること
- secret キー（`SUPABASE_SECRET_KEY`）は PC の `.env.local` にだけ置く。画面のコード、Vercel、リポジトリに入れない。
- 画面から使うのは publishable キーだけ。データの保護は RLS で行う。テーブルを足したら必ず RLS とポリシーを書く。
- 画面からの新規登録はしない。アカウントは Supabase の管理画面で作る（`supabase/config.toml` でも enable_signup = false）。
- テーブルの変更は `npm run db:new -- <名前>` で SQL ファイルを作って行い、管理画面で直接変えない。

## コマンド
- npm run dev / npm run build / npm run lint / npm test
- npm run agent（PC 常駐プログラム。Windows は start-windows.bat）
- npm run db:push（マイグレーションを Supabase に反映）/ npm run db:types
