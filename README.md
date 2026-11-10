# J.A.R.V.I.S.

PC に常駐する個人用 AI エージェントです。
ブラウザやスマホの画面から話しかけると、自宅 PC の Claude Code が返事をします。
返事を作るのは PC の Claude Code（Claude の有料プランの範囲）なので、API の料金はかかりません。

## 仕組み

```
[画面: Next.js / Vercel] --発言を保存--> [Supabase: messages テーブル] --Realtime で通知--> [PC 常駐プログラム: agent/]
                         <--返事を表示--                                <--返事を保存--      （claude -p で返事を作る）
```

- 画面は Vercel に公開します。ログインした本人だけが使えます。
- 会話は Supabase の `messages` テーブルに保存します。
- PC 常駐プログラムは Supabase に外向きにつなぐだけです。PC のポートは開けないので、ルーターの設定は要りません。
- PC 常駐プログラムは Claude Code を起動したままにして使い回し、返事を書いた端から画面に表示します。話しかけてから 1〜2 秒ほどで返事が出始めます。
- PC 常駐プログラムが止まっている間に送った発言は、次に起動したときにまとめて返事をします。

## 最初の1回だけの準備

### 1. GitHub
1. https://github.com/new で `jarvis` という名前のリポジトリを作ります。README などは追加せず、空のまま作ります。
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
1. https://vercel.com/new で GitHub の `jarvis` リポジトリを選んで「Import」します。
2. 「Environment Variables」に次の 2 つを入れて「Deploy」を押します。
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Publishable key
3. 以後は、main ブランチに push すると本番に、それ以外のブランチに push するとプレビュー用の URL に自動で公開されます。

### 4. PC（常駐プログラム）
1. Node.js 22 以上と Claude Code を入れ、`claude` コマンドでログインしておきます。
2. このリポジトリを PC に置き、`.env.example` を `.env.local` にコピーして、Supabase の値を入れます。
3. Windows は `start-windows.bat` をダブルクリック、Mac / Linux は `npm install` の後に `npm run agent` で起動します。
   「ジャービス、起動しました。」と出れば準備完了です。

## 開発

```bash
npm run dev
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 画面をローカルで起動（http://localhost:3000） |
| `npm run agent` | PC 常駐プログラムを起動 |
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
| `JARVIS_TOOLS` | `WebSearch` | Claude Code に使わせる道具（カンマ区切り） |
| `JARVIS_TIMEOUT_MS` | `180000` | 1 回の返事の制限時間（ミリ秒） |
| `JARVIS_MAX_TURNS` | `40` | この回数だけ会話したら Claude Code を起動し直す |
