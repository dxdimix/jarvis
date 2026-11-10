@AGENTS.md

# J.A.R.V.I.S.

PC に常駐する個人用 AI エージェント。利用者は本人のみ。
画面から話しかけると、自宅 PC の Claude Code（`claude -p`、利用者の有料プラン）が返事をする。

## 仕組み（API 費用ゼロ）
- 画面: Next.js（App Router, TypeScript, Tailwind）。Vercel に公開。GitHub の main = 本番、他のブランチ = プレビュー。
- データ: Supabase。`messages` テーブルに発言と返事を保存する。定義は `supabase/migrations/`。
- PC 常駐プログラム: `agent/index.mjs`。Realtime で `status = 'pending'` の発言を受け取り、Claude Code に返事を作らせて書き込む。
  - pending → processing → done / error の順に status を変える。pending から processing に変えられたときだけ処理する（二重処理の防止）。
  - Claude Code は起動したままにして使い回す（`agent/lib/claude-session.mjs`、stream-json の入出力）。毎回起動すると最初の文字まで約 7.5 秒、使い回すと約 1.5 秒。
  - 返事は書いた端から assistant の行（status = processing）を更新し、書き終えたら done にする。画面は Realtime で少しずつ表示する。
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` を付けて起動する（付けないと書き終えてから完了まで約 3 秒余計にかかる）。
  - Claude Code を起動した直後の最初の発言にだけ、Supabase の会話履歴を添える。`JARVIS_MAX_TURNS`（既定 40）回で起動し直す。
  - 人格は `agent/lib/prompt.mjs` の PERSONA。`--append-system-prompt-file` で渡す（コマンド引数に日本語を直接書くと Windows で崩れるため）。
  - 二重起動の防止は `agent/lib/single-instance.mjs`（名前付きパイプ / Unix ソケット）。終了コード 3 は「起動し直さなくてよい」の合図。
  - Realtime の Presence（チャンネル `jarvis-presence`）で、画面に PC のオンライン / オフラインを知らせる。
  - Windows: `setup-windows.ps1`（irm | iex の 1 行で準備と更新）、`windows/start-hidden.vbs`（画面なしで起動、止まったら 10 秒後に再起動、ログは agent/logs/）、`windows/stop-jarvis.ps1`（停止。UTF-8 BOM 付きで保存する）。.bat と .vbs は CRLF（.gitattributes）。
  - 自動更新: `agent/lib/updater.mjs`。PC のフォルダの `.version`（setup-windows.ps1 が書く）と GitHub の main を比べ、2 分以上会話がなければ tar.gz を取って上書きし、終了コード 4 で起動し直す。.version がない開発用フォルダでは動かない。main の番号は git の窓口（info/refs）から調べる（API は回数制限があるため）。**main に push したものは、利用者の PC に 1 時間以内に届く**ので、main には動くものだけを入れる。
  - Claude Code に使わせる道具は `JARVIS_TOOLS`（既定 WebSearch）。PC 操作の機能はここを広げて足していく。
- 音声: ブラウザの機能だけを使う（無料）。聞き取りは Web Speech API（`src/hooks/useSpeechRecognition.ts`）、読み上げは speechSynthesis（`src/hooks/useSpeaker.ts`）。返事は 1 文書き終わるごとに読み上げる（`src/lib/speech.ts`）。
- スマホのホーム画面に追加できる（`src/app/manifest.ts`、アイコンは `src/app/icon.svg` から作った PNG）。
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
