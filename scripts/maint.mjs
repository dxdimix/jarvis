#!/usr/bin/env node
// クラウドの開発用セッションから、DIMY の記録を読む・PC の DIMY に再起動を頼む（supabase/migrations/20261115500000_maintenance.sql の窓口）。
// 使い方:
//   node scripts/maint.mjs read <messages|agent_logs|activity_log|pc_commands|pc_state> [件数]
//   node scripts/maint.mjs restart        … PC の DIMY に「再起動して最新にして」と頼み、結果を待つ
// 必要な環境変数（秘密ではない）: DIMY_MAINT_URL（Supabase の URL）、DIMY_MAINT_ANON（publishable キー）
// 合言葉（dimy-maint-key）は、この環境の通信の仕組み（ネットワークの秘密の保存）が自動で付ける。ここには書かない。

const url = (process.env.DIMY_MAINT_URL || "").replace(/\/+$/, "");
const anon = process.env.DIMY_MAINT_ANON || "";
if (!url || !anon) {
  console.error("DIMY_MAINT_URL と DIMY_MAINT_ANON を設定してください。");
  process.exit(1);
}
const headers = { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" };
const rpc = async (fn, body) => {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
};
const time = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });

const [cmd, what, n] = process.argv.slice(2);
try {
  if (cmd === "read") {
    const rows = await rpc("dimy_maint_read", { p_what: what, p_limit: Number(n) || 50 });
    for (const r of rows) {
      if (what === "messages") console.log(`[${time(r.created_at)}] ${r.role === "user" ? "あなた" : "DIMY"}（${r.status}）${r.error ? ` エラー: ${r.error}` : ""}\n  ${String(r.content).replace(/\n/g, "\n  ")}`);
      else if (what === "agent_logs") console.log(`[${time(r.created_at)}] ${r.level === "error" ? "エラー " : ""}${r.message}`);
      else if (what === "activity_log") console.log(`[${time(r.created_at)}] ${r.kind}: ${r.detail}（${r.device}）`);
      else if (what === "pc_commands") console.log(`[${time(r.created_at)}] ${r.kind} ${JSON.stringify(r.payload)} → ${r.status}${r.result ? `: ${r.result}` : ""}`);
      else console.log(JSON.stringify(r, null, 2));
    }
    if (!rows.length) console.log("（記録はありません）");
  } else if (cmd === "restart") {
    const id = await rpc("dimy_maint_command", { p_kind: "restart" });
    console.log(`再起動を頼みました（${id}）。返事を待っています…`);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const rows = await rpc("dimy_maint_read", { p_what: "pc_commands", p_limit: 20 });
      const row = rows.find((r) => r.id === id);
      if (row && row.status !== "pending") {
        console.log(`PC の DIMY: ${row.status}${row.result ? `（${row.result}）` : ""}`);
        process.exit(0);
      }
    }
    console.log("60 秒待ちましたが、PC の DIMY から返事がありません（PC が止まっているか、古い版の可能性）。");
  } else {
    console.log("使い方: node scripts/maint.mjs read <messages|agent_logs|activity_log|pc_commands|pc_state> [件数] / node scripts/maint.mjs restart");
  }
} catch (e) {
  console.error(`失敗しました: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
