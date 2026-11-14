# K.Y.M.I.S（キーミス）

PC の中に住む、個人用の AI アシスタントです。秘書として受け答えをし、自作のアプリやシステムの状況を取りまとめます。
名前は、家族 4 人の名前と姓「芝田」の頭文字から作ったオリジナルの名前です（由来は [docs/name.md](docs/name.md)）。

ブラウザやスマホの画面から話しかけると、自宅 PC の Claude Code が返事をします。
返事を作るのは PC の Claude Code（Claude の有料プランの範囲）なので、API の料金はかかりません。

## 仕組み

```
[画面: Next.js / Vercel] --発言を保存--> [Supabase: messages テーブル] --Realtime で通知--> [PC 常駐プログラム: agent/]
                         <--返事を表示--                                <--返事を保存--      （claude -p で返事を作る）
```

- 画面は Vercel に公開します。ログインした本人だけが使えます。
- 会話は Supabase の `messages` テーブルに保存します。
- 画面の右上に、PC の常駐プログラムが動いているか（PC: オンライン / オフライン）を表示します。
- PC 常駐プログラムは Supabase に外向きにつなぐだけです。PC のポートは開けないので、ルーターの設定は要りません。
- PC 常駐プログラムは Claude Code を起動したままにして使い回し、返事を書いた端から画面に表示します。話しかけてから 1〜2 秒ほどで返事が出始めます。
- PC 常駐プログラムが止まっている間に送った発言は、次に起動したときにまとめて返事をします。

## 最初の1回だけの準備

### 1. GitHub
1. https://github.com/new で `kymis` という名前のリポジトリを作ります。README などは追加せず、空のまま作ります。
2. このフォルダの中身を push します。

### 2. Supabase
1. https://supabase.com/dashboard で「New project」を押し、プロジェクトを作ります（Region は Tokyo がおすすめ）。
2. テーブルを作ります。PC のこのフォルダで、次を順に実行します。`<project-ref>` は管理画面の URL の `/project/` の後ろの文字列です。
   ```bash
   npx supabase login
   ```
   ```bash
   npm run db:link -- --project-ref <project-ref>
   ```
   ```bash
   npm run db:push
   ```
   コマンドを使わない場合は、管理画面の「SQL Editor」に `supabase/migrations/` の SQL を貼り付けて実行しても同じです。
3. 自分のアカウントを作ります。「Authentication」→「Users」→「Add user」→「Create new user」で、メールアドレスとパスワードを入れ、「Auto Confirm User」にチェックを入れて作ります。
4. 他人が登録できないようにします。「Authentication」→「Sign In / Providers」で「Allow new users to sign up」をオフにします。
5. 「Project Settings」→「API Keys」で、次の 2 つを控えます。
   - Publishable key（`sb_publishable_` で始まる）: 画面用。公開されてよいキーです。
   - Secret key（`sb_secret_` で始まる）: PC 常駐プログラム用。全データを操作できるキーなので、PC の `.env.local` 以外には置かないでください。
6. 「Project Settings」→「Data API」で Project URL（`https://xxxx.supabase.co`）を控えます。

### 3. Vercel
1. https://vercel.com/new で GitHub の `kymis` リポジトリを選んで「Import」します。
2. 「Environment Variables」に次の 2 つを入れて「Deploy」を押します。
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Publishable key
3. 以後は、main ブランチに push すると本番に、それ以外のブランチに push するとプレビュー用の URL に自動で公開されます。

### 4. PC（常駐プログラム、Windows）
スタートメニューで「PowerShell」と入力して開き、次の1行を貼り付けて Enter を押します。

```
irm https://raw.githubusercontent.com/dxdimix/kymis/main/setup-windows.ps1 | iex
```

次のことを自動で行います。

1. Node.js と Claude Code を確認し、入っていなければインストールする
2. キーミスをホームフォルダの `kymis` にダウンロードする
3. 設定ファイル `.env.local` をメモ帳で開く（Supabase の値を 4 か所に貼り付けて保存し、メモ帳を閉じる）
4. Claude Code にログインしているか確認する
5. PC の起動時に、画面なしで自動で動くように登録する（スタートアップ）
6. デスクトップに「キーミスを起動」「キーミスを停止」を作り、キーミスを起動する

ブラウザの画面の右上に「PC: オンライン」と出れば準備完了です。
一度セットアップすると、その後は**自動で最新版に更新されます**。常駐プログラムが 1 時間ごとに GitHub の main を確かめ、新しい版があれば、2 分以上会話していないときに入れ替えて起動し直します。設定ファイルはそのまま残ります。
手動で更新したいときや、うまく動かなくなったときは、同じ1行をもう一度実行します。

- 動きの記録は `kymis\agent\logs\agent.log` に残ります。
- 途中で止まった場合は、10 秒後に自動で起動し直します。
- 動いている様子を黒い画面で見たいときは、「キーミスを停止」の後に `start-windows.bat` をダブルクリックします。
- Mac / Linux は、`npm install` の後に `npm run agent` で起動します。

## 使い方
- 文字で送るか、マイクのボタンを押して話しかけます（Chrome / Edge / Safari）。マイクで話した声は、文字にするためにブラウザの提供元（Google や Apple など）のサーバーに送られます。
- 「読み上げ」がオンのとき、返事を 1 文ずつ声で読み上げます。声は選べます（Windows の Edge では「Microsoft Keita Online」などが自然です）。
- 「会話モード」をオンにすると、返事を聞き終えたあと自動でマイクがオンになり、手を使わずに会話を続けられます。
- スマホでは、ブラウザの「ホーム画面に追加」でアプリのように開けます。
- 「全画面表示」（`/hud`）は、デスクトップ PC の画面に出しっぱなしにする用の画面です。ブラウザで開き、右上の「全画面」を押します。
- 返事の下の GOOD / BAD で評価すると、キーミスが次の会話から参考にします。「覚えていること」（`/memory`）に話し方の好みなどを書くと、キーミスが守ります。会話の中でキーミスが気づいたことも、ここに追加されます。

## 開発

```bash
npm run dev
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 画面をローカルで起動（http://localhost:3000） |
| `npm run agent` | PC 常駐プログラムを起動（二重には起動しない） |
| `npm run lint` / `npm test` / `npm run build` | 確認（GitHub Actions でも同じものが動く） |
| `npm run db:new -- <名前>` | テーブル変更用の SQL ファイルを作る |
| `npm run db:push` | SQL ファイルの変更を Supabase に反映 |
| `npm run db:types` | Supabase のテーブル定義から TypeScript の型を作る |

ローカルで Supabase ごと動かす場合は、Docker を起動してから `npx supabase start` を実行し、表示された URL とキーを `.env.local` に入れます。

PC 常駐プログラムの設定（`.env.local`、省略可）:

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `CLAUDE_MODEL` | `sonnet` | Claude Code のモデル |
| `CLAUDE_BIN` | `claude` | Claude Code のコマンドの場所 |
| `KYMIS_TOOLS` | `WebSearch` | Claude Code に使わせる道具（カンマ区切り） |
| `KYMIS_TIMEOUT_MS` | `180000` | 1 回の返事の制限時間（ミリ秒） |
| `KYMIS_MAX_TURNS` | `40` | この回数だけ会話したら Claude Code を起動し直す |
| `KYMIS_AUTO_UPDATE` | `on` | `off` で自動更新を止める |
| `KYMIS_UPDATE_INTERVAL_MS` | `3600000` | 自動更新で新しい版を確かめる間隔（ミリ秒） |
