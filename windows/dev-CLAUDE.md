# 開発用フォルダ（C:\Users\sike1\dev）の決まり

このファイルは、ディミ（DIMY）の開発用フォルダのセットアップ（github.com/dxdimix/dimy の `setup-dev-windows.ps1`）が置いたものです。
直接書き換えると次のセットアップで上書きされるため、変えたいときは dimy リポジトリの `windows/dev-CLAUDE.md` を直してください。

## 置き場所
- 利用者のアプリ・システムは、すべてこのフォルダの直下に 1 つずつフォルダを作って置く（例: `C:\Users\sike1\dev\<アプリ名>`）。
- 新しくアプリやシステムを作るときも、必ずここに作る。デスクトップ、ドキュメント、ホームフォルダの直下など、別の場所には作らない。
- 理由: デスクトップ PC に常駐する AI アシスタント「ディミ（DIMY）」が、このフォルダの中を見て、すべてのアプリの状況を把握するため。また、このフォルダは Remote Control に登録してあり、ノートパソコンや iPhone からも作業を続けられるため。

## 各アプリのフォルダに必要なもの
- Git で管理し、GitHub の `dxdimix` アカウントに同じ名前のリポジトリを作って push する。
- フォルダの直下に `CLAUDE.md` を置き、少なくとも次を書く。ディミはこれを読んで状況を把握する。
  - 何をするアプリか（1〜2 文）
  - どこで動くか（Vercel、GitHub Pages、GitHub Actions の定期実行、Supabase、この PC の常駐プログラムなど）
  - 定期的に動く部分があれば、その頻度
  - 動きの記録（ログ）を残す場所と、エラーが起きたときに何を見ればよいか

## DIMY（ディミ）との連携（新しく作るアプリは、すべてこの前提で作る）
DIMY は、利用者の PC に住む AI アシスタント（https://dimy.dxdimix.com）。アプリを DIMY の画面の中の小窓で開き、声でも呼び出せるようにするため、次を守る。
- 公開する URL は `https://<アプリ名>.dxdimix.com` にする（Vercel の「Settings」→「Domains」に追加し、Squarespace の DNS に `<アプリ名>` の CNAME を足す）。同じ dxdimix.com でないと、DIMY の中の小窓ではログインできない。
- DIMY の画面の中への表示を禁止しない。`X-Frame-Options: DENY` や `Content-Security-Policy: frame-ancestors 'none'` を付けない（付ける必要があるときは `frame-ancestors 'self' https://dimy.dxdimix.com`）。
- ログインの Cookie は `SameSite=Lax`（Supabase の既定）のままにする。`Strict` にしない。
- Supabase の「Authentication」→「URL Configuration」の「Redirect URLs」に `https://<アプリ名>.dxdimix.com/**` を足す（Site URL は、プロジェクトを共用している場合は変えない）。
- DIMY のアプリ一覧に追加する: `C:\Users\sike1\dev\dimy` の `src/lib/apps.ts` に 1 行足し、`src/components/hud/Icons.tsx` の `AppIcon` にアイコンを足して push する（DIMY 本体は 1 時間以内に自動で更新される）。
- DIMY にアプリのデータを読ませる場合は、手引き `C:\Users\sike1\dev\dimy\docs\apps\<アプリ名>.md` を作る（表の意味、利用者本人の行の絞り方、取り違えやすい表）。キーは利用者が PC の `C:\Users\sike1\dimy\.env.local` に `DIMY_APP_<名前>_URL` / `_KEY` として入れる。
- アプリの `CLAUDE.md` に「DIMY 連携」の節を作り、上のどれが済んでいるかを書く。

## してはいけないこと
- `C:\Users\sike1\dimy` はディミの本体で、自動更新で中身が上書きされる。ここでは開発しない。ディミの開発は `C:\Users\sike1\dev\dimy` で行う。
- 秘密の値（API キー、パスワード、Supabase の secret キーなど）をリポジトリに入れない。`.env.local` などの、Git に入らないファイルに置く。

## ディミ（DIMY）についての相談
- ディミの動きや返事について相談されたら、`dev\dimy` で `npm run history` を実行して、直近の会話と常駐プログラムの記録を確かめてから答える（推測で答えない）。
