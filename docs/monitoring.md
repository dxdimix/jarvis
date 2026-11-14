# 見張りの対象と方針

ディミが状況を把握するアプリの一覧と、それぞれで「何を見てよいか」の決まり。
利用者に確認して決めたことだけを書く。分からないことは「未確認」と書き、推測で埋めない。

最終更新: 2026-11-13（棚卸しはコードを読んだだけ。本番の状態はまだ見ていない）

## 共通の方針
- 普段の見張りは、ふつうのプログラムで行う（Claude の利用枠を使わない）。Claude Code は、異常を調べるときと、利用者に聞かれたときだけ使う。
- エラーが出たときは、原因を調べて修正案を別ブランチ（プルリクエスト）に用意するところまで。本番への反映は利用者の承認後。
- アプリはすべてデスクトップ PC の `C:\Users\sike1\dev\<アプリ名>` にある。一覧はこのフォルダの直下から作る。

## アプリごとの決まり

| アプリ | 動く場所 | 見てよい範囲 | 備考 |
| --- | --- | --- | --- |
| fx-signal-monitor | Vercel ＋ Supabase。定期実行は cron-job.org（毎時 / 15 分ごと） | **読むのはすべて**（利用者の指示: 状況をよく聞くので、フルアクセス可） | GMO で本物の注文を出す。**注文・取引・設定の変更はしない**（利用者が「A: 見るのは全部、操作はしない」を選んだ） |
| kabu-signal-monitor | Vercel ＋ Supabase（プロジェクト「General」、競馬と共用）＋ GitHub Actions（5 分ごと、場中 15 分ごと） | **読むのはすべて**、操作はしない（同上） | Windows のタスクスケジューラ「KabuSignalDaily」はもう使っていない（説明書きに残っているだけ） |
| umsheet-web | Vercel（umsheet.dxdimix.com）＋ Supabase | 外からの確認、データ点検の結果 | **UMSheet の本命**。会員の個人データがあるので、データの中身は読まない |
| sedori-system | Vercel（umsheet.vercel.app） | 外からの確認 | UMSheet の古い版（本命は umsheet-web） |
| medical-equipment-manager | Cloudflare ＋ Supabase | **外からの確認だけ**（GitHub Actions の結果、公開 URL が開けるか） | 病院の業務データ。データベースの中は読まない |
| keiba-optimizer | Vercel ＋ Supabase（共通プロジェクト「General」。株と共用） | **読むのはすべて**、操作はしない（利用者の指示） | 株のキー（General）で読める。General は無料枠の通信量を超えたことがあるので、聞かれたときだけ読み、定期的には読まない |
| nencho-helper | 利用者の PC（使うときだけ起動） | ほぼなし | わざと記録を残さない作り |
| dimy（DIMY 本体） | Vercel ＋ デスクトップ PC | すべて | — |

## 読み方の仕組み
- アプリのデータは `agent/tools/appdata.mjs` で読む。HTTP の GET / HEAD しか送らないので、書き換えはできない。Claude Code には MCP の道具（`agent/tools/mcp-server.mjs`）として渡す。
- 読めるアプリは PC の `.env.local` に `DIMY_APP_<名前>_URL` と `_KEY` を書いたものだけ。medical-equipment-manager などのキーは書かない。
- ディミの Claude Code に許可しているのは、Web 検索、コードを読む（Read / Glob / Grep、開発用フォルダ）、ディミの道具（MCP）だけ。コマンドの実行（Bash）はできない。.env などの秘密のファイルは読めない設定にしてあり、Claude Code にはキーを環境変数でも渡さない。

## アプリごとの手引き（docs/apps/）
- ディミがデータを読む前に読む手引き。表の意味、利用者本人の行の絞り方、取り違えやすい表を書く。
- 今あるもの: `fx.md`（FX）、`kabu.md`（株）、`keiba.md`（競馬。株と同じプロジェクト）。
- 新しいアプリのデータを読めるようにしたときは、手引きも作る。表の意味はアプリの `supabase/migrations/` のコメントで確かめてから書く。
