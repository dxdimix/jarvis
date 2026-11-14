@AGENTS.md

# K.Y.M.I.S（キーミス）

PC の中に住む個人用 AI アシスタント。利用者は本人のみ。秘書として受け答えをし、利用者のアプリ全体の状況を取りまとめる（OS のような立ち位置）。

## 名前（必ず守る）
- 正式名称は「K.Y.M.I.S」、日本語は「キーミス」。画面、自己紹介、ドキュメントではこの名前を使う。由来は `docs/name.md`（家族の名前と姓から作った名前。英単語の略称など別の由来を付けない）。
- 以前の仮の名前は「ジャービス（J.A.R.V.I.S.）」。商標の心配があるため 2026-11-13 に変えた。新しく書くものに以前の名前を使わない。
- 古い名前との互換のために残しているもの（移行が終わったら消してよい）: 設定の `JARVIS_〇〇`（`agent/lib/env.mjs` が `KYMIS_〇〇` として読む）、Presence の `jarvis-presence`（画面が両方を見る）、自動更新の `dxdimix/jarvis`（`dxdimix/kymis` の次に試す）、ブラウザ保存の `jarvis.〇〇`、`setup-windows.ps1` / `setup-dev-windows.ps1` の古いフォルダ・ショートカット・印の片付け。
- 利用者は芝田圭佑（しばた けいすけ）さん本人だけ。呼び方は「あなた」（名前や「ボス」では呼ばない）。家族の名前の漢字は教わっていないので、推測して書かない。姓は「芝田」（「柴田」ではない）。
画面から話しかけると、自宅 PC の Claude Code（`claude -p`、利用者の有料プラン）が返事をする。

## 仕組み（API 費用ゼロ）
- 画面: Next.js（App Router, TypeScript, Tailwind）。Vercel に公開。GitHub の main = 本番、他のブランチ = プレビュー。
- データ: Supabase。`messages` テーブルに発言と返事を保存する。定義は `supabase/migrations/`。
- PC 常駐プログラム: `agent/index.mjs`。Realtime で `status = 'pending'` の発言を受け取り、Claude Code に返事を作らせて書き込む。
  - pending → processing → done / error の順に status を変える。pending から processing に変えられたときだけ処理する（二重処理の防止）。
  - Claude Code は起動したままにして使い回す（`agent/lib/claude-session.mjs`、stream-json の入出力）。毎回起動すると最初の文字まで約 7.5 秒、使い回すと約 1.5 秒。
  - 返事は書いた端から assistant の行（status = processing）を更新し、書き終えたら done にする。画面は Realtime で少しずつ表示する。
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` を付けて起動する（付けないと書き終えてから完了まで約 3 秒余計にかかる）。
  - Claude Code を起動した直後の最初の発言にだけ、Supabase の会話履歴を添える。`KYMIS_MAX_TURNS`（既定 40）回で起動し直す。
  - 人格は `agent/lib/prompt.mjs` の PERSONA。`--append-system-prompt-file` で渡す（コマンド引数に日本語を直接書くと Windows で崩れるため）。
  - 二重起動の防止は `agent/lib/single-instance.mjs`（名前付きパイプ / Unix ソケット）。終了コード 3 は「起動し直さなくてよい」の合図。
  - Realtime の Presence（チャンネル `kymis-presence`）で、画面に PC のオンライン / オフラインを知らせる。
  - Windows: `setup-windows.ps1`（irm | iex の 1 行で準備と更新）、`windows/start-hidden.vbs`（画面なしで起動、止まったら 10 秒後に再起動、ログは agent/logs/）、`windows/stop-kymis.ps1`（停止。UTF-8 BOM 付きで保存する）。.bat と .vbs は CRLF（.gitattributes）。
  - 自動更新: `agent/lib/updater.mjs`。PC のフォルダの `.version`（setup-windows.ps1 が書く）と GitHub の main を比べ、2 分以上会話がなければ tar.gz を取って上書きし、終了コード 4 で起動し直す。.version がない開発用フォルダでは動かない。main の番号は git の窓口（info/refs）から調べる（API は回数制限があるため）。**main に push したものは、利用者の PC に 1 時間以内に届く**ので、main には動くものだけを入れる。
  - Claude Code に使わせる道具: Web 検索、開発用フォルダ（`--add-dir`）のコードを読む Read / Glob / Grep、キーミスの道具（MCP サーバー `agent/tools/mcp-server.mjs`。中身は `agent/tools/appdata.mjs` で、アプリの Supabase を読み取り専用で読む）だけ。Bash・Edit・Write は渡さない（Windows では Bash の許可のルールが効かなかったため、道具は MCP で渡す）。`.env*` などは Read の禁止で読ませない。Claude Code に渡す環境変数からキーを外す（`safeEnv`）。決まりは `docs/monitoring.md`。
  - Realtime の通知は取りこぼすことがあるので、30 秒ごとに返事待ちの発言を確かめる。
  - Realtime につながらない・切れたときは、10 秒後に通信の土台（ソケット）ごと作り直してつなぎ直す（チャンネルだけ作り直しても、壊れたソケットのままではつながらない）。
- 音声: ブラウザの機能だけを使う（無料）。聞き取りは Web Speech API（`src/hooks/useSpeechRecognition.ts`）、読み上げは speechSynthesis（`src/hooks/useSpeaker.ts`）。返事は 1 文書き終わるごとに読み上げる（`src/lib/speech.ts`）。
- 全画面表示 `/hud`（`src/components/hud/`）: デスクトップ PC の画面に出しっぱなしにする用。中心のリング（`Ring.tsx`、名前の 5 文字にちなんだ 5 区切りのオリジナルのデザイン。映画などの既存の画面を真似ない）、アプリの状況（準備中）、日時、天気（Open-Meteo。地域は画面で入力し、ブラウザに保存）、PC の状態。声で話しかけられる。
- 成長の仕組み: 返事ごとの評価（`feedback`、チャットの 👍 👎）と、覚えていること（`kymis_notes`、`/memory` で見る・足す・消す）。常駐プログラムは、Claude Code を起動した最初の発言に「覚えていること」と最新 10 件の評価を添える（`buildMemoryBlock`）。どちらかが変わったら次の発言で Claude Code を起動し直す。キーミスは MCP の `memory_add` で自分で書き留められる（キーミス自身の表だけ。利用者の ID は起動時に Supabase の利用者一覧から決める）。
- 返事は短く（要点を 1〜3 文）。詳しくは聞かれたら話す（人格 `agent/lib/prompt.mjs`）。
- スマホのホーム画面に追加できる（`src/app/manifest.ts`、アイコンは `src/app/icon.svg` から作った PNG）。
- Claude API は使わない（利用者の希望：費用をかけない）。claude.ai などのブラウザ画面の自動操作もしない（規約違反）。

## 開発用フォルダ（利用者の決まり）
- 利用者のアプリ・システムは、デスクトップ PC の `C:\Users\sike1\dev\<アプリ名>` にすべて置く。新しく作るときも必ずここ。このフォルダは Remote Control に登録してあり、ノート・iPhone からも作業できる。
- キーミスはこの dev フォルダの直下を見て、アプリの一覧と状況を把握する（固定の一覧に頼らない）。各アプリの CLAUDE.md に「何をするか・どこで動くか・記録の場所」を書いてもらう。
- 見張りの対象と「何を見てよいか」の決まりは `docs/monitoring.md`（利用者に確認したことだけを書く）。
- 決まりの文章は `windows/dev-CLAUDE.md`。`setup-dev-windows.ps1` が `dev\CLAUDE.md` に置き、`~\.claude\CLAUDE.md` に短い決まりを足す（印で囲んだ部分だけを入れ替える）。
- `C:\Users\sike1\kymis` は自動更新される本体。キーミスの開発は `dev\kymis` で行う。

## 守ること
- secret キー（`SUPABASE_SECRET_KEY`）は PC の `.env.local` にだけ置く。画面のコード、Vercel、リポジトリに入れない。
- 画面から使うのは publishable キーだけ。データの保護は RLS で行う。テーブルを足したら必ず RLS とポリシーを書く。
- 画面からの新規登録はしない。アカウントは Supabase の管理画面で作る（`supabase/config.toml` でも enable_signup = false）。
- テーブルの変更は `npm run db:new -- <名前>` で SQL ファイルを作って行い、管理画面で直接変えない。

## コマンド
- npm run dev / npm run build / npm run lint / npm test
- npm run agent（PC 常駐プログラム。Windows は start-windows.bat）
- npm run db:push（マイグレーションを Supabase に反映）/ npm run db:types
