# 競馬（keiba-optimizer、KEIBA EDGE）のデータの読み方

ディミが競馬の状況を答えるときの手引き。株と同じプロジェクト（General）にあるので、道具ではアプリ名 `kabu` で読む。競馬の表はすべて `keiba_` で始まる。
コードは `C:\Users\sike1\dev\keiba-optimizer`。表の意味は `supabase/migrations/` の SQL のコメントに書いてある。
馬券は買わないアプリ（買い目の提案と、仮想購入での検証）。

## 利用者が複数いる（家族）
- 表 `keiba_members` に利用者が並ぶ。`role = admin` の人が管理者で、利用者本人（芝田圭佑さん）である可能性が高いが、表だけでは確かめられない。最初に `memory_list` で覚えていないか確かめ、覚えていなければ利用者に確かめて `memory_add` で覚える。
- 人ごとのデータ（`keiba_settings`、`keiba_bet_slips`）は `user_id` で絞る。

## 共有のデータ（家族みんなで共通）
- `keiba_races`: レース。`keiba_odds_snapshots`: オッズの記録。`keiba_race_results`: 結果。`keiba_weather`: 天気。
- `keiba_predictions`: 発走前の予想と、確定後の答え合わせ。
- `keiba_models`: 予想の重みの履歴。`status = active` が今使っている重み。
- `keiba_daily_reports`: 開催日ごとの日報（成績・反省点・考察）。
- `keiba_forward`: **フォワードテスト（仮想購入）**の買い目と精算結果。実際に買ったものではない。
- `keiba_proposals`: 分析からの改善の提案（管理者向け）。
- `keiba_personas`: 4 つの予想（単勝 3 点・的中率重視・バランス・期待値重視）の個性。

## 定期実行の状態
- 表 `keiba_jobs`: 定期実行（5 分ごと）の状態や順番待ち。`data` に中身、`updated_at` が最後に動いた時刻。
- 実行とエラーの履歴は、アプリの `/api/admin/scheduler` で見られる（ログインが必要なので、ディミの道具では読めない）。
- レースのない日は、取得する対象がないことがある。

## 人ごとのデータ（user_id で絞る）
- `keiba_bet_slips`: 購入記録（利用者が記録したもの）。`status` で状態が分かる。
- `keiba_settings`: 作戦の設定。

## 答えるときの注意
- General は無料枠の通信量を超えたことがある。聞かれたときだけ読み、件数は必要な分だけ（`limit` を小さく）にする。
- 表や列の意味が分からないときは、推測で言い切らず、`supabase/migrations/` のコメントを読んで確かめる。
