@AGENTS.md

# DIMY（ディミ）

PC の中に住む個人用 AI アシスタント。コンセプトは「いつも、そばに。」。役割は「気づく・覚える・支える」。利用者は本人のみ。秘書として受け答えをし、利用者のアプリ全体の状況を取りまとめる（OS のような立ち位置）。

## 名前（必ず守る）
- 正式名称は「DIMY」（英字はすべて大文字）、日本語は「ディミ」。読み方は「ディミ」で統一。画面、自己紹介、ドキュメントではこの名前を使う。由来は `docs/name.md`（会社名 DimiX と家族の名前から作った名前。英単語の略称など別の由来を付けない）。
- 名前の移り変わり: 「ジャービス（J.A.R.V.I.S.）」（商標の心配で 2026-11-13 に変更）→「キーミス（K.Y.M.I.S）」→「DIMY（ディミ）」（2026-11-14）。新しく書くものに以前の名前を使わない。
- 古い名前との互換のために残しているもの（移行が終わったら消してよい）: 設定の `KYMIS_〇〇` / `JARVIS_〇〇`（`agent/lib/env.mjs` が `DIMY_〇〇` として読む）、Presence の `kymis-presence` / `jarvis-presence`（画面が 3 つとも見る）、自動更新の `dxdimix/kymis` / `dxdimix/jarvis`（`dxdimix/dimy` の次に試す）、ブラウザ保存の `kymis.〇〇` / `jarvis.〇〇`、`setup-windows.ps1` / `setup-dev-windows.ps1` の古いフォルダ・ショートカット・印の片付け。
- データベースの中の名前は、作り替えを避けるため以前の名前のまま: 表 `kymis_notes`、`kymis_notes.source` の値 `kymis`（ディミが書き留めたもの）。画面には出ない。
- 利用者は芝田圭佑（しばた けいすけ）さん本人だけ。呼び方は「あなた」（名前や「ボス」では呼ばない）。家族の名前の漢字は教わっていないので、推測して書かない。姓は「芝田」（「柴田」ではない）。
- できないことや不確かなことは率直に伝え、実行していないことを完了したように話さない（人格にも書いてある）。
画面から話しかけると、自宅 PC の Claude Code（`claude -p`、利用者の有料プラン）が返事をする。

## 仕組み（API 費用ゼロ）
- 画面: Next.js（App Router, TypeScript, Tailwind）。Vercel に公開。GitHub の main = 本番、他のブランチ = プレビュー。
- データ: Supabase。`messages` テーブルに発言と返事を保存する。定義は `supabase/migrations/`。
- PC 常駐プログラム: `agent/index.mjs`。Realtime で `status = 'pending'` の発言を受け取り、Claude Code に返事を作らせて書き込む。
  - pending → processing → done / error の順に status を変える。pending から processing に変えられたときだけ処理する（二重処理の防止）。
  - Claude Code は起動したままにして使い回す（`agent/lib/claude-session.mjs`、stream-json の入出力）。毎回起動すると最初の文字まで約 7.5 秒、使い回すと約 1.5 秒。
  - 返事は書いた端から assistant の行（status = processing）を更新し、書き終えたら done にする。画面は Realtime で少しずつ表示する。
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` を付けて起動する（付けないと書き終えてから完了まで約 3 秒余計にかかる）。
  - Claude Code を起動した直後の最初の発言にだけ、Supabase の会話履歴を添える。`DIMY_MAX_TURNS`（既定 40）回で起動し直す。
  - 人格は `agent/lib/prompt.mjs` の PERSONA。`--append-system-prompt-file` で渡す（コマンド引数に日本語を直接書くと Windows で崩れるため）。
  - 二重起動の防止は `agent/lib/single-instance.mjs`（名前付きパイプ / Unix ソケット）。終了コード 3 は「起動し直さなくてよい」の合図。
  - Realtime の Presence（チャンネル `dimy-presence`）で、画面に PC のオンライン / オフラインを知らせる。
  - Windows: `setup-windows.ps1`（irm | iex の 1 行で準備と更新）、`windows/start-hidden.vbs`（画面なしで起動、止まったら 10 秒後に再起動、ログは agent/logs/）、`windows/stop-dimy.ps1`（停止。UTF-8 BOM 付きで保存する）。.bat と .vbs は CRLF（.gitattributes）。
  - 自動更新: `agent/lib/updater.mjs`。PC のフォルダの `.version`（setup-windows.ps1 が書く）と GitHub の main を比べ、2 分以上会話がなければ tar.gz を取って上書きし、終了コード 4 で起動し直す。.version がない開発用フォルダでは動かない。main の番号は git の窓口（info/refs）から調べる（API は回数制限があるため）。**main に push したものは、利用者の PC に 1 時間以内に届く**ので、main には動くものだけを入れる。
  - Claude Code に使わせる道具: Web 検索、開発用フォルダ（`--add-dir`）のコードを読む Read / Glob / Grep、ディミの道具（MCP サーバー `agent/tools/mcp-server.mjs`。中身は `agent/tools/appdata.mjs` で、アプリの Supabase を読み取り専用で読む）だけ。Bash・Edit・Write は渡さない（Windows では Bash の許可のルールが効かなかったため、道具は MCP で渡す）。`.env*` などは Read の禁止で読ませない。Claude Code に渡す環境変数からキーを外す（`safeEnv`）。決まりは `docs/monitoring.md`。
  - Realtime の通知は取りこぼすことがあるので、30 秒ごとに返事待ちの発言を確かめる。
  - Realtime につながらない・切れたときは、10 秒後に通信の土台（ソケット）ごと作り直してつなぎ直す（チャンネルだけ作り直しても、壊れたソケットのままではつながらない）。
- 音声: ブラウザの機能だけを使う（無料）。聞き取りは Web Speech API（`src/hooks/useSpeechRecognition.ts`）、読み上げは speechSynthesis（`src/hooks/useSpeaker.ts`）。返事は 1 文書き終わるごとに読み上げる（`src/lib/speech.ts`）。
- メイン画面 `/`（`src/components/hud/`）: 声が中心。中央に光る球体と 4 区切りのリング（`Ring.tsx`、名前の 4 文字 D・I・M・Y にちなむオリジナルのデザイン。映画などの既存の画面を真似ない）、周りを流れるデータ（`DataField.tsx`、canvas）。文字は最小限で、操作はアイコン（`Icons.tsx`）。文字入力と会話の履歴は右上のアイコンで開くパネル（`Chat` の `embedded`）。左下に日時、右下に天気（Open-Meteo。地域は設定で入力し、ブラウザに保存）、左上に PC の状態。`/hud` は同じ画面、`/chat` は文字だけの画面。
- アプリを開く（`src/lib/apps.ts` の一覧、`src/components/hud/AppWindows.tsx`）: 左端のアイコン、Alt + 数字、声（「FX を開いて」は Claude に渡さず画面で開く、`detectOpenCommand`）。基本はディミの画面の中の小窓（iframe。動かせる・大きさを変えられる・Chrome で開くボタンあり）。ログインが必要で dxdimix.com 以外のドメインのアプリは、中ではログインできない（SameSite の Cookie が送られない）ので、小さな別ウィンドウで開く（`canEmbed`）。そのアプリに 〇〇.dxdimix.com の URL を足して一覧の url を書き換えれば、中で開ける。医療機器管理は表示を禁止しているので別ウィンドウだけ。
- Chrome のブックマーク: PC のディミが、Chrome の「Local State」から利用者のメールアドレスのプロフィールを探し、その「Bookmarks」（JSON）を 5 分ごとに確かめて、変わったら表 `bookmarks` に写す（`agent/lib/bookmarks.mjs`。画面からは読むだけ）。画面は「〇〇を開いて」でアプリの一覧になければブックマークから探して別のタブで開く（`src/lib/bookmarks.ts`）。ブラウザに止められたら、押して開くボタンを出す。右上のブックマークのアイコンで一覧も見られる。
- Google（ドキュメント・スプレッドシート・カレンダー・Gmail・ドライブ）: 利用者は、探す・読む・作る・書き換える・消すのすべてを任せると決めた。ただし消す前は必ず利用者に確かめる。連携の方法は検討中（Claude のコネクタが Claude Code から使えるかを確かめる）。
- 成長の仕組み: 返事ごとの評価（`feedback`、会話の GOOD / BAD）と、覚えていること（`kymis_notes`、`/memory` で見る・足す・消す）。常駐プログラムは、Claude Code を起動した最初の発言に「覚えていること」と最新 10 件の評価を添える（`buildMemoryBlock`）。どちらかが変わったら次の発言で Claude Code を起動し直す。ディミは MCP の `memory_add` で自分で書き留められる（ディミ自身の表だけ。利用者の ID は起動時に Supabase の利用者一覧から決める）。
- 返事は短く（要点を 1〜3 文）。詳しくは聞かれたら話す（人格 `agent/lib/prompt.mjs`）。
- スマホのホーム画面に追加できる（`src/app/manifest.ts`、アイコンは `src/app/icon.svg` から作った PNG）。
- Claude API は使わない（利用者の希望：費用をかけない）。claude.ai などのブラウザ画面の自動操作もしない（規約違反）。

## 開発用フォルダ（利用者の決まり）
- 利用者のアプリ・システムは、デスクトップ PC の `C:\Users\sike1\dev\<アプリ名>` にすべて置く。新しく作るときも必ずここ。このフォルダは Remote Control に登録してあり、ノート・iPhone からも作業できる。
- ディミはこの dev フォルダの直下を見て、アプリの一覧と状況を把握する（固定の一覧に頼らない）。各アプリの CLAUDE.md に「何をするか・どこで動くか・記録の場所」を書いてもらう。
- 利用者の決まり: これから作るアプリは、すべて DIMY と連携する前提で作る（URL は 〇〇.dxdimix.com、DIMY の中への表示を禁止しない、DIMY のアプリ一覧に追加など）。詳しくは `windows/dev-CLAUDE.md` の「DIMY との連携」。
- 見張りの対象と「何を見てよいか」の決まりは `docs/monitoring.md`（利用者に確認したことだけを書く）。
- 決まりの文章は `windows/dev-CLAUDE.md`。`setup-dev-windows.ps1` が `dev\CLAUDE.md` に置き、`~\.claude\CLAUDE.md` に短い決まりを足す（印で囲んだ部分だけを入れ替える）。
- `C:\Users\sike1\dimy` は自動更新される本体。ディミの開発は `dev\dimy` で行う。

## 守ること
- secret キー（`SUPABASE_SECRET_KEY`）は PC の `.env.local` にだけ置く。画面のコード、Vercel、リポジトリに入れない。
- 画面から使うのは publishable キーだけ。データの保護は RLS で行う。テーブルを足したら必ず RLS とポリシーを書く。
- 画面からの新規登録はしない。アカウントは Supabase の管理画面で作る（`supabase/config.toml` でも enable_signup = false）。
- テーブルの変更は `npm run db:new -- <名前>` で SQL ファイルを作って行い、管理画面で直接変えない。

## コマンド
- npm run dev / npm run build / npm run lint / npm test
- npm run agent（PC 常駐プログラム。Windows は start-windows.bat）
- npm run db:push（マイグレーションを Supabase に反映）/ npm run db:types
