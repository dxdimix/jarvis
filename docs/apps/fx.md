# FX（fx-signal-monitor）のデータの読み方

キーミスが FX の状況を答えるときの手引き。道具では、アプリ名 `fx` で読む。
コードは `C:\Users\sike1\dev\fx-signal-monitor`。表の意味は `supabase/migrations/` の SQL のコメントに書いてある。

## 最初に必ずすること：利用者の行だけに絞る
- このアプリには、利用者（親、`admin`）のほかに、子のアカウント（`member`）がいる。表には全員の行が混ざっている。
- 利用者本人の `user_id` は、表 `app_users` で `role = admin` の行の `user_id`。
  例: `app_read`（app=fx, table=app_users, where=["role=eq.admin"]）
- ほかの表を読むときは、必ず `where` に `user_id=eq.<その user_id>` を付ける。付けないと、子のアカウントのデータを利用者のものとして答えてしまう。

## 実際の取引（GMO コインで決済した取引）
- 表 `jfx_state` の、`key = gmo-history` の行の `value` にある。
  例: `app_read`（app=fx, table=jfx_state, where=["user_id=eq.<id>", "key=eq.gmo-history"]）
- `value.fills` が、決済した取引（確定損益）の一覧。項目の意味:
  - `t`: 決済した時刻（エポックミリ秒。日本時間に直して伝える）
  - `symbol`: 通貨ペア（例 USD_JPY）
  - `side`: **決済の注文の向き**。持っていた向きはその逆（`SELL` なら「買い」を持っていた、`BUY` なら「売り」を持っていた）
  - `size`: 数量（通貨）、`price`: 決済価格、`pnl`: 損益（円）、`swap`: スワップ（円）、`fee`: 手数料
- アプリの画面の「損益の履歴」は、これと同じもの。新しい順に並べて答える。
- 記録は 30 分ごとなので、直近 30 分の決済はまだ入っていないことがある。

## 実際の取引ではないもの（取り違えないこと）
- 表 `jfx_trades` は「JFX での**手動の約定の記録**」。利用者が手で記録したもので、GMO コインの実際の取引とは別。「実際の決済」として答えない。
- 表 `paper_trades` は**ペーパートレード（練習用の仮の取引）**。
- 表 `backtest_trades` は**バックテスト（過去の値での試算）**の結果。

## 判定の記録
- 表 `jfx_runs` が、定期分析（約 15 分ごと）の実行の記録（30 日で消える）。これも `user_id` で絞る。
- 時刻の列（`created_at` など）は、`jfx_` で始まる表ではエポックミリ秒（数字）。

## 分からないとき
- 表や列の意味が分からないときは、推測で答えず、コードの `supabase/migrations/` のコメントを読んで確かめる。それでも分からなければ「分からない」と伝える。
