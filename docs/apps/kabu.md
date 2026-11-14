# 株（kabu-signal-monitor）のデータの読み方

ディミが株の状況を答えるときの手引き。道具では、アプリ名 `kabu` で読む。
コードは `C:\Users\sike1\dev\kabu-signal-monitor`。表の意味は `supabase/migrations/` の SQL のコメントに書いてある。
このプロジェクト（General）には、競馬（`keiba_` で始まる表）も入っている。競馬は `docs/apps/keiba.md` を読む。

## 利用者が複数いる
- 表 `profiles` に利用者が並ぶ（3 人ほど）。`signals`、`paper_trades`、`trade_journal`、`stock_actions` などは人ごとのデータで、`user_id` で分かれている。
- どれが利用者本人の `user_id` かは、表だけでは分からない（アプリは「管理者のメールアドレス」で判断していて、メールアドレスは表にない）。
- 人ごとのデータを答えるときは、`memory_list` で「株アプリの自分の user_id」を覚えていないか確かめる。覚えていなければ、どのアカウントのデータか分からないことを伝え、利用者に確かめる。分かったら `memory_add` で覚える。
- 全員で共有のデータ（下の「取り込みと健全性」）は、人に関係なく答えてよい。

## 取り込みと健全性（共有のデータ）
- 表 `ingestion_runs`: 処理の記録。`run_type` の意味:
  - `backfill`: 株価の取り込み。`target_date` は**取り込んだ期間の終わりの日（実行した日）**で、「何日分の株価か」ではない。夕方に実行すると、その日の日付が入る。`stats` に取得件数・欠け・異常の数、`status` に success / partial / running / failed。
  - `evening`: 夜の処理（シグナルの計算と通知）が最後まで終わった印。`target_date` はその営業日。
  - `morning`: 朝の確認が終わった印。
  - `evening-user`: その夜に、人ごとに知らせた買い候補の記録（人数分ある）。
- 表 `data_status`: 銘柄ごとのデータの状態（`state`: ok / checking / stale、`last_ok_date`: 最後に正常だった日）。
- 土日と祝日は、株式市場が休みなので取り込みがない。休みの日に記録がないのは正常。

## 人ごとのデータ（user_id で絞る）
- `signals`: 買い候補（シグナル）。`signal_date` がシグナルの日。
- `paper_trades`: **ペーパートレード（練習用の仮の取引）**。実際の売買ではない。
- `trade_journal`: 利用者が記録した売買の控え。`deleted_at` が入っている行は、記録から消したもの。
- `stock_actions`: 銘柄ごとの売買・見送りの履歴。
- `choruko_forward`: 「ルールどおりに全部買っていたら」の成績（試算）。実際の成績ではない。

## 答えるときの注意
- 実際の売買の記録はこのアプリにはない（証券会社の口座とはつながっていない）。「実際に損益がいくら」とは言わない。
- 表や列の意味が分からないときは、推測で言い切らず、`supabase/migrations/` のコメントを読んで確かめる。
