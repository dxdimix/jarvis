"use client";

// 管理の画面（右上の「管理」）。大きな画面で、記録を日時つきで見る・コピーする。
// - 会話: あなたと DIMY のやり取り（表 messages）。エラーになったものは理由も出す
// - システム: PC の DIMY（常駐プログラム）の記録（表 agent_logs）
// - 動作: 画面での動作（表 activity_log）と、PC への命令（表 pc_commands。Chrome で開く・再起動など）
// どのタブも、言葉で絞り込み、表示している分をまとめてコピー、1 行ずつのコピーができる。開いている間は 10 秒ごとに読み直せる。

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVITY_LABEL } from "@/lib/activity";
import { CloseIcon, ReloadIcon } from "./Icons";

type Tab = "chat" | "system" | "activity";
const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "会話" },
  { id: "system", label: "システム" },
  { id: "activity", label: "動作" },
];

/** 1 行の記録（表示とコピーに使う） */
type Row = { id: string; at: string; kind: string; text: string; bad?: boolean };

/** 日時を「2026-11-14 21:05:33」の形にする（日本時間） */
export function stamp(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** コピーする文（1 行 1 件。本文の改行は字下げして続ける） */
export function rowsToText(rows: Row[]) {
  return rows.map((r) => `[${stamp(r.at)}] ${r.kind}: ${r.text.replace(/\n/g, "\n    ")}`).join("\n");
}

const MISSING = /relation|does not exist|schema cache|Could not find/i;

async function loadRows(supabase: SupabaseClient, tab: Tab, limit: number): Promise<{ rows: Row[]; error?: string }> {
  if (tab === "chat") {
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, status, content, error, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], error: error.message };
    return {
      rows: [...(data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({
        id: m.id,
        at: m.created_at,
        kind: m.role === "user" ? "あなた" : `DIMY${m.status !== "done" ? `（${m.status}）` : ""}`,
        text: (m.content || "") + (m.error ? `\n（エラー: ${m.error}）` : ""),
        bad: m.status === "error",
      })),
    };
  }
  if (tab === "system") {
    const { data, error } = await supabase.from("agent_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(limit);
    if (error) return { rows: [], error: MISSING.test(error.message) ? "記録の表がまだありません。Supabase の SQL Editor で 20261115300000_logs.sql を実行してください。" : error.message };
    return {
      rows: [...(data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((l) => ({ id: String(l.id), at: l.created_at, kind: l.level === "error" ? "エラー" : "記録", text: l.message, bad: l.level === "error" })),
    };
  }
  const [act, cmd] = await Promise.all([
    supabase.from("activity_log").select("id, kind, detail, device, created_at").order("created_at", { ascending: false }).limit(limit),
    supabase.from("pc_commands").select("id, kind, payload, status, result, created_at").order("created_at", { ascending: false }).limit(limit),
  ]);
  const rows: Row[] = [];
  for (const a of act.data ?? [])
    rows.push({ id: `a${a.id}`, at: a.created_at, kind: ACTIVITY_LABEL[a.kind] ?? a.kind, text: `${a.detail}${a.device ? `（${a.device}）` : ""}`, bad: a.kind === "error" });
  for (const c of cmd.data ?? []) {
    const what = c.kind === "open_url" ? `Chrome で開く ${c.payload?.url ?? ""}${c.payload?.account ? `（アカウント${c.payload.account}）` : ""}` : c.kind === "restart" ? "再起動" : `${c.kind} ${JSON.stringify(c.payload)}`;
    rows.push({ id: `c${c.id}`, at: c.created_at, kind: "PC への命令", text: `${what} → ${c.status}${c.result ? `: ${c.result}` : ""}`, bad: c.status === "error" });
  }
  rows.sort((x, y) => x.at.localeCompare(y.at));
  const err = act.error && MISSING.test(act.error.message) ? "動作の記録の表がまだありません。Supabase の SQL Editor で 20261115300000_logs.sql を実行してください。" : act.error?.message;
  return { rows: rows.slice(-limit), error: err };
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function AdminPanel({ supabase, onClose }: { supabase: SupabaseClient; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [limit, setLimit] = useState(200);
  const [query, setQuery] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  const [auto, setAuto] = useState(true);
  const [data, setData] = useState<{ rows: Row[]; error?: string } | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(() => {
    loadRows(supabase, tab, limit).then(setData);
  }, [supabase, tab, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    load();
  }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [auto, load]);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => (!onlyBad || r.bad) && (!q || `${r.kind} ${r.text}`.toLowerCase().includes(q)));
  }, [data, query, onlyBad]);

  const flash = (label: string) => {
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <div className="absolute inset-0 z-[960] bg-slate-950/70 p-3 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-label="管理"
        onClick={(e) => e.stopPropagation()}
        className="dimy-fade-in mx-auto flex h-full max-w-6xl flex-col rounded-lg border border-cyan-400/35 bg-slate-950/[0.97] text-sm shadow-[0_0_40px_rgba(34,211,238,0.15)]"
      >
        {/* 見出しとタブ */}
        <div className="flex items-center justify-between border-b border-cyan-400/20 px-5 py-3">
          <h2 className="font-mono text-xs tracking-[0.3em] text-cyan-300">ADMIN · LOGS</h2>
          <button onClick={onClose} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div role="tablist" className="flex gap-1 border-b border-cyan-400/20 px-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={"-mb-px border-b-2 px-5 py-2.5 transition " + (tab === t.id ? "border-cyan-300 text-cyan-100" : "border-transparent text-slate-400 hover:text-cyan-200")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 操作 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-cyan-400/10 px-5 py-2.5 text-xs">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="言葉で絞り込む"
            className="w-56 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1.5"
          />
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} className="accent-rose-400" />
            エラーだけ
          </label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded border border-cyan-700/60 bg-slate-900 px-1.5 py-1.5" aria-label="読む件数">
            {[100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                最新 {n} 件
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-cyan-400" />
            10 秒ごとに更新
          </label>
          <button onClick={load} className="flex items-center gap-1 rounded border border-cyan-500/40 px-2 py-1.5 text-cyan-200 hover:bg-cyan-400/10" title="読み直す">
            <ReloadIcon className="h-3.5 w-3.5" />
            更新
          </button>
          <span className="ml-auto text-slate-400">{rows.length} 件</span>
          <button
            onClick={async () => flash((await copy(rowsToText(rows))) ? `${rows.length} 件をコピーしました` : "コピーできませんでした")}
            className="rounded border border-cyan-400/70 bg-cyan-500/15 px-3 py-1.5 text-cyan-50 hover:bg-cyan-500/25"
          >
            表示中をすべてコピー
          </button>
          {copied && <span className="text-emerald-300">{copied}</span>}
        </div>

        {/* 記録 */}
        <div className="dimy-caption min-h-0 flex-1 overflow-y-auto px-5 py-3 font-mono text-[12px] leading-relaxed">
          {!data && <p className="text-slate-400">読み込んでいます…</p>}
          {data?.error && <p className="mb-2 text-amber-300">{data.error}</p>}
          {data && !rows.length && !data.error && <p className="text-slate-500">記録はありません。</p>}
          {rows.map((r) => (
            <div key={r.id} className={"group flex gap-3 border-b border-slate-800/70 py-1.5 " + (r.bad ? "bg-rose-500/5" : "")}>
              <span className="shrink-0 text-slate-500">{stamp(r.at)}</span>
              <span className={"w-28 shrink-0 truncate " + (r.bad ? "text-rose-300" : r.kind === "あなた" ? "text-amber-200" : "text-cyan-300")}>{r.kind}</span>
              <span className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words text-slate-200">{r.text}</span>
              <button
                onClick={async () => flash((await copy(rowsToText([r]))) ? "1 件をコピーしました" : "コピーできませんでした")}
                className="h-fit shrink-0 rounded px-1.5 text-[11px] text-cyan-400/0 transition group-hover:text-cyan-300 hover:bg-cyan-400/10"
                title="この行をコピー"
              >
                コピー
              </button>
            </div>
          ))}
        </div>
        <p className="border-t border-cyan-400/10 px-5 py-2 text-[11px] text-slate-500">
          日時は日本時間。システムの記録は PC の DIMY が 3 秒ごとに書き足し、30 日で消えます。文字は選んで普通にコピーすることもできます。
        </p>
      </div>
    </div>
  );
}
