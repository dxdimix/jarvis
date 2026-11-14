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
  - Windows: `setup-windows.ps1`（irm | iex の 1 行で準備と更新）、`windows/start-hidden.vbs`（画面なしで起動、止まったら 10 秒後に再起動、ログは agent/logs/）、`windows/stop-dimy.ps1`（停止。UTF-8 BOM 付きで保存する）、`windows/restart-dimy.ps1`（再起動。BOM 付き。起動後すぐに新しい版を確かめて更新する `DIMY_UPDATE_NOW=1`）。画面の設定の「再起動」タブからも再起動できる（確認してから、`pc_commands` の `restart` を送る。常駐プログラムは印 `agent/.update-now` を書いて終了コード 4 で起動し直し、次の起動ですぐ新しい版を確かめる。PC が戻ったら画面も読み込み直す）。デスクトップのショートカットは「ディミを再起動」1 つ（更新を反映させるときに使う。常駐プログラムが起動のたびに作り、以前の「起動」「停止」を片付ける。`agent/lib/shortcuts.mjs`）。.bat と .vbs は CRLF（.gitattributes）。
  - 自動更新: `agent/lib/updater.mjs`。PC のフォルダの `.version`（setup-windows.ps1 が書く）と GitHub の main を比べ、2 分以上会話がなければ tar.gz を取って上書きし、終了コード 4 で起動し直す。.version がない開発用フォルダでは動かない。main の番号は git の窓口（info/refs）から調べる（API は回数制限があるため）。**main に push したものは、利用者の PC に 1 時間以内に届く**ので、main には動くものだけを入れる。
  - Claude Code に使わせる道具: Web 検索、claude.ai の Google のコネクタ、開発用フォルダ（`--add-dir`）のコードを読む Read / Glob / Grep、ディミの道具（MCP サーバー `agent/tools/mcp-server.mjs`。中身は `agent/tools/appdata.mjs` で、アプリの Supabase を読み取り専用で読む）だけ。Bash・Edit・Write は渡さない（Windows では Bash の許可のルールが効かなかったため、道具は MCP で渡す）。`.env*` などは Read の禁止で読ませない。Claude Code に渡す環境変数からキーを外す（`safeEnv`）。決まりは `docs/monitoring.md`。
  - Realtime の通知は取りこぼすことがあるので、30 秒ごとに返事待ちの発言を確かめる。
  - Realtime につながらない・切れたときは、10 秒後に通信の土台（ソケット）ごと作り直してつなぎ直す（チャンネルだけ作り直しても、壊れたソケットのままではつながらない）。
- 音声: ブラウザの機能だけを使う（無料）。聞き取りは Web Speech API（`src/hooks/useSpeechRecognition.ts`）、読み上げは speechSynthesis（`src/hooks/useSpeaker.ts`）。返事は最初の 1 文をすぐ、そのあとは 40 文字ほどまとめて読み上げる（`src/lib/speech.ts`。読み方の直しは `src/lib/wake.ts` の `toSpeech`）。
- 呼びかけ（`src/hooks/useWakeWord.ts`）: 端末ごとの切り替え（最初はオフ、ブラウザに `dimy.wake`）。「ディミ」と呼ぶと合図の音と「はい」→ 話す。聞き取り途中の文字が「ディミ」になった時点で応える（早く反応するため）。返事を言い終えたあと 8 秒は呼びかけなしで続けて話せる。「終わり」「ありがとう」で待機、「聞かないで」で切り替えをオフ、「違う」で取り消し。待機中に聞こえた周りの会話は画面に出さない。
- 右 Ctrl を 2 回（どの画面が前にあっても）: 常駐プログラムが `windows/hotkey.ps1`（キーボードの見張り。右 Ctrl かどうかだけを見て、キーの中身は記録しない）を画面なしで起動し（`agent/lib/hotkey.mjs`）、Realtime の Broadcast（チャンネル `dimy-control`、event `hotkey`）で画面に知らせる。画面はマイクのボタンと同じ動き（話し始め / 話し終わって送る）。スマホでは反応しない。`DIMY_HOTKEY=off` で止める。
- メイン画面 `/`（`src/components/hud/`）: 声が中心。中央に光る球体と 4 区切りのリング（`Ring.tsx`、名前の 4 文字 D・I・M・Y にちなむオリジナルのデザイン。映画などの既存の画面を真似ない）、周りを流れるデータ（`DataField.tsx`、canvas）。文字は最小限で、操作はアイコン（`Icons.tsx`）。文字入力と会話の履歴は右上のアイコンで開くパネル（`Chat` の `embedded`）。左下に日時、右下に天気（Open-Meteo）、左上に PC の状態。右上はボタンだけ（会話・ブックマーク・覚えていること・設定・全画面）。設定はすべて設定の画面（`Settings.tsx`）に集め、カテゴリーごとのタブに分ける（音声: 読み上げ・声・話す速さ・声の高さ / 呼びかけ: 「ディミ」・続けて話せる時間・右 Ctrl / 表示: 天気の地域・字幕の時間）。設定は端末ごとにブラウザに保存（`dimy.〇〇`）。新しい設定もここに足す。`/hud` は同じ画面、`/chat` は文字だけの画面。
- アプリを開く（`src/lib/apps.ts` の一覧、`src/components/hud/AppWindows.tsx`）: 左端のアイコン、Alt + 数字、声（「FX を開いて」は Claude に渡さず画面で開く、`detectOpenCommand`）。基本はディミの画面の中の小窓（iframe。動かせる・大きさを変えられる・Chrome で開くボタンあり）。ログインが必要で dxdimix.com 以外のドメインのアプリは、中ではログインできない（SameSite の Cookie が送られない）ので、小さな別ウィンドウで開く（`canEmbed`）。そのアプリに 〇〇.dxdimix.com の URL を足して一覧の url を書き換えれば、中で開ける。医療機器管理は表示を禁止しているので別ウィンドウだけ。
- 固定ウィンドウ（`src/components/pins/`、保存は `src/lib/pins.ts`）: ページや映像を好きな場所に置いておく。Chrome / Edge のアドレス欄の左端のアイコンやリンクを画面にドラッグ、または右上のピンのボタン（URL・アプリ・画面を映す）。四辺と四隅で大きさを自由に変える。鍵で固定。置き場所（メイン画面 `hud` / パレット `palette-<モニター番号>`）ごとにブラウザに保存し、「送る」で別の置き場所へ移す（storage の知らせで相手の画面が読み直す）。中への表示を禁止しているページは `/api/frame-check`（ログインした利用者だけ。見出しを見て「表示できるか」だけを返す）で見分け、「映像で映す」（getDisplayMedia。見るだけで操作はできない。開き直したら選び直す）を案内する。Chrome / Edge 以外のアプリも映像で映す。
- 縮尺: パレットの背景で Ctrl + ホイール = パレット全体の縮尺（カーソルの位置を中心に。背景のドラッグで全体を動かす。右上の % で元に戻す。`dimy.pinview.<置き場所>` に保存）。ウィンドウの上で Ctrl + ホイール = そのウィンドウの中身だけの縮尺（`Pin.zoom`。映像はカーソルの位置を中心に拡大）。ページの中（iframe）にはホイールが届かないので、Ctrl を押している間だけ透明な板をかぶせて受け取る（ページの中をクリックしたあとは Ctrl が見えないため、帯の上で操作する）。
- 画面が複数開いているとき（Chrome と Edge、PC とノートなど）: 最後に操作した画面だけが読み上げ・呼びかけ・右 Ctrl に反応する（`src/hooks/useActiveDevice.ts`、Presence のチャンネル `dimy-voice`）。2 つの声で同じ返事を読んでいたため。
- 中心のリングの動き（`Ring.tsx`）: 聞き取り中 = 外から吸い込まれる波紋と中心へ集まる細い輪、考え中 = 球体が暗くなり周りを光の粒が回る、話し中 = 外へ広がる波紋と流れる細い波形、呼びかけ待ち = 縁を回る点。球体の下に状態を英語で出す（LISTENING / THINKING / SPEAKING）。
- 呼びかけの確かめ方: 設定の「呼びかけ」タブに、聞き取りの状態と最後に聞こえた言葉を出す。聞き間違いの言葉は `src/lib/wake.ts` の WAKE に足す。読み上げが「終わった」の知らせを取りこぼすと聞き取りが止まったままになるので、`useSpeaker` が 1 秒ごとに見張って戻す。
- 強制停止（マイクの左のボタン・Esc・声の「ストップ」「止めて」「終わり」など）: 読み上げ・聞き取り・続けて話せる時間をやめ、Broadcast（`dimy-control` の `stop`）で常駐プログラムに返事作りをやめさせる（`ClaudeSession.cancel()`。そこまでの返事は「（ここで止めました）」を付けて残し、返事待ちの発言は error「止めました」にする）。止めた発言への返事は、あとから届いても読まない。
- 自分の声を拾わない（`useWakeWord`）: 返事を作っている・読み上げている間（と読み終えて 1.2 秒）は止める言葉だけを受け付ける。最近読み上げた文とほぼ同じ言葉は自分の声とみなして捨てる（`isEcho`）。続けて話せる状態にするときは、聞き取り途中のものを捨てて聞き直す。
- 話し終わりを待つ時間（設定の「聞き取り」、0.5〜3 秒、既定 1.5 秒）: ブラウザに任せず聞き続け、無音がこの時間続いたら送る。マイクのボタン・右 Ctrl で終えたときはすぐ送る。
- ディミの中で開くのは、利用者が作ったアプリだけ。それ以外（YouTube・Google の検索、ブックマーク、Claude）は PC のディミが Chrome で開く（利用者の決まり）。画面が表 `pc_commands` に命令を入れ（本人だけが入れられる RLS）、常駐プログラムが本人の命令か・2 分以内かを確かめて実行する（`agent/lib/pc.mjs`）。PC がオフラインなら、このブラウザで開く。
  - アカウント = Chrome のプロフィール（Chrome の並び順で 1, 2, …）。「アカウント2で〇〇」やプロフィールの名前で指定。いつものアカウントは設定の「アカウント」タブ（`dimy.account`）。
  - 声の命令（`src/lib/commands.ts`）: 「YouTube / Google で〇〇と検索」、「Claude の〇〇というセッションを開いて」（PC の Claude Code のセッションを題名で探し、新しいコマンドプロンプトで `claude --resume`。claude.ai のチャットと Code のセッションは名前で探す手段がないので一覧の画面を開く）、「モニター4のパレットに移して」「パレット4をメインに戻して」（固定ウィンドウをまとめて移す）。
  - 表 `pc_state`: Chrome のプロフィールと PC の Claude Code のセッションの一覧（常駐プログラムが 5 分ごとに、変わったら書く）。
- ウィンドウをディミの画面どうしでドラッグして移す: 帯をつかんで自分の画面の外で離すと、その場所にあるディミの画面（パレットなど）へ移る（BroadcastChannel `dimy-boards` で、各画面がモニター上の位置を 1 秒ごとに知らせ合う。同じブラウザの中だけ）。パレットが開いていないモニターで離したときは、そのモニターにパレットを開いて移す（モニターの位置は `src/lib/screens.ts`。「ウィンドウの管理」の許可が済んでいるときだけ。だめなら元の場所に戻す）。画面の外に出てしまったウィンドウは、開いたとき・画面の大きさが変わったときに見える場所へ戻す。
- パレットの画面分割（右上のボタン。左右 2 分割・上下 2 分割・4 分割、`dimy.paletteLayout.<番号>`）: 枠を出し、ウィンドウを離した枠いっぱいにする。新しく来たウィンドウは空いている枠に入れる。
- 「Chrome で」「ブラウザで」が付いた頼みは Chrome で開く（自作のアプリでも）。「YouTube を開いて」などよく使うサイト（`SITES`）は画面がすぐ Chrome で開く。それ以外の言い方でも開けるよう、Claude にも道具を渡している（MCP の `open_in_chrome`・`chrome_accounts`・`claude_sessions`・`open_claude_session`。中身は `agent/lib/pc.mjs`）。
- 2 回しゃべらないための決まり: 同じブラウザでは最後に操作したタブだけが話す（`dimy.voiceTab`）。ディミの画面の中（小窓）にディミ自身は開かない。同じ文は 5 秒以内に 2 回読まない。返事の文章で、道具の前後に同じ文を繰り返した塊は出さない（`joinBlocks`）。人格にも「道具の前後で同じ文を繰り返さない」と書いてある。
- 字幕（球体の下）は省かずに、枠の中でスクロールして全文を出す。書き足されたら下へ送る（上へ戻して読んでいる間は送らない）。
- 小窓を大きくしたときは、右上のボタン・左端のアイコン・下のマイクの分を空ける（`maxBox`）。
- パレット `/palette?n=<モニター番号>`: 固定ウィンドウだけを並べる画面。メイン画面の右上のボタンからモニターを選んで開く（getScreenDetails。初回は「ウィンドウの管理」の許可）。
- メイン画面の計器（`HudChrome.tsx`）: 四隅の枠、時刻の目盛り、球体の周りの角度のリングと走査線、右の SYSTEM（PC との接続・返事までの時間・今日の会話数・固定ウィンドウの数・状態）と LOG。SVG の座標は丸める（サーバーとブラウザで小数の端が変わると表示が食い違うため）。
- 声の大きさ（設定の音声のタブ）: 読み上げの volume。PC 全体の音量とは別（PC の音量より大きくはできない）。
- Chrome のブックマーク: PC のディミが、Chrome の「Local State」から利用者のメールアドレスのプロフィールを探し、その「Bookmarks」（JSON）を 5 分ごとに確かめて、変わったら表 `bookmarks` に写す（`agent/lib/bookmarks.mjs`。画面からは読むだけ）。画面は「〇〇を開いて」でアプリの一覧になければブックマークから探して別のタブで開く（`src/lib/bookmarks.ts`）。ブラウザに止められたら、押して開くボタンを出す。右上のブックマークのアイコンで一覧も見られる。
- Google（ドキュメント・スプレッドシート・カレンダー・Gmail・ドライブ）: 利用者は、探す・読む・作る・書き換える・消すのすべてを任せると決めた。ただし消す前は必ず利用者に確かめる。claude.ai のコネクタを使う（利用者の PC の Claude Code で Google Drive・Google Sheets がつながっていることを確認済み。Gmail・Google Calendar は利用者が claude.ai で追加する）。常駐プログラムは `--strict-mcp-config` を外してコネクタを読み込み、使ってよい道具を allowedTools で `mcp__claude_ai_<名前>` に絞る（`DIMY_CONNECTORS`、`connectorToolPrefix`）。起動の知らせ（init）で、つながっているコネクタと道具の数を記録に残す。決まりは人格の「Google」の節。
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

## ディミの不具合を調べるとき（Claude Code への決まり）
- 利用者からディミの動き・返事・読み上げなどについて相談されたら、答える前に、まず `npm run history` を実行して、直近の会話（あなた / ディミの発言と status・エラー）、PC への命令、常駐プログラムの記録を確かめる。推測で答えない。
- `npm run history` は .env.local の secret キーで本番のデータベースを読むので、利用者のデスクトップ PC（`dev\dimy`、Remote Control のセッションを含む）で動く。クラウドのセッションからは本番に届かないので、そのときは「PC のセッションで確かめる必要がある」と伝える。
- 表示する件数は `npm run history -- --n 50 --logs 200` で増やせる。

## 守ること
- secret キー（`SUPABASE_SECRET_KEY`）は PC の `.env.local` にだけ置く。画面のコード、Vercel、リポジトリに入れない。
- 画面から使うのは publishable キーだけ。データの保護は RLS で行う。テーブルを足したら必ず RLS とポリシーを書く。
- 画面からの新規登録はしない。アカウントは Supabase の管理画面で作る（`supabase/config.toml` でも enable_signup = false）。
- テーブルの変更は `npm run db:new -- <名前>` で SQL ファイルを作って行い、管理画面で直接変えない。

## コマンド
- npm run dev / npm run build / npm run lint / npm test
- npm run agent（PC 常駐プログラム。Windows は start-windows.bat）
- npm run history（ディミの直近の会話・PC への命令・常駐プログラムの記録を見る）
- npm run db:push（マイグレーションを Supabase に反映）/ npm run db:types
