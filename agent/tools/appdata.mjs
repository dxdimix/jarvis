#!/usr/bin/env node
// ジャービスが、利用者のアプリ（FX・株など）の Supabase のデータを読むための道具。
// - 読み取り（HTTP の GET / HEAD）しか送らない。書き換え・削除・注文などは、この道具ではできない。
// - キーは PC のジャービスの .env.local から自分で読む。画面にも Claude にもキーは出さない。
// - 使えるアプリは .env.local に書いたものだけ（JARVIS_APP_<名前>_URL と JARVIS_APP_<名前>_KEY）。
//
// 使い方: node ../tools/appdata.mjs help

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });

const MAX_ROWS = 200;
const MAX_TEXT = 300;
const NAME = /^[A-Za-z0-9_]+$/;

const HELP = `アプリのデータを読む道具（読み取り専用）
  node ../tools/appdata.mjs apps                         使えるアプリの一覧
  node ../tools/appdata.mjs tables <アプリ>              表の一覧
  node ../tools/appdata.mjs columns <アプリ> <表>        表の列と型
  node ../tools/appdata.mjs read <アプリ> <表> [オプション]   行を読む（新しい順に並べるなら --order created_at.desc）
  node ../tools/appdata.mjs count <アプリ> <表> [--where ...] 行の数
オプション:
  --select 列1,列2         読む列（省略で全部）
  --order 列.desc          並べ方（.asc / .desc）
  --limit N                最大の行数（既定 20、最大 ${MAX_ROWS}）
  --where 列=演算子.値     絞り込み。複数指定できる。例: --where status=eq.error --where created_at=gte.2026-11-13
                           演算子: eq neq gt gte lt lte like ilike is in`;

/**
 * .env.local に書かれたアプリの一覧
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, { url?: string, key?: string, label?: string }>}
 */
export function listApps(env = process.env) {
  /** @type {Record<string, { url?: string, key?: string, label?: string }>} */
  const apps = {};
  for (const [k, v] of Object.entries(env)) {
    const m = k.match(/^JARVIS_APP_([A-Z0-9_]+?)_(URL|KEY|LABEL)$/);
    if (!m || !v) continue;
    const name = m[1].toLowerCase();
    apps[name] ??= {};
    apps[name][/** @type {"url" | "key" | "label"} */ (m[2].toLowerCase())] = v.trim();
  }
  for (const [name, a] of Object.entries(apps)) if (!a.url || !a.key) delete apps[name];
  return apps;
}

/** コマンドの引数を読み取り用の問い合わせに直す。危ない値はここで止める。 */
export function buildQuery(args) {
  const params = new URLSearchParams();
  let limit = 20;
  for (let i = 0; i < args.length; i++) {
    const opt = args[i];
    const val = args[i + 1];
    if (val === undefined) throw new Error(`${opt} の値がありません`);
    i++;
    if (opt === "--select") {
      if (!val.split(",").every((c) => NAME.test(c.trim()) || c.trim() === "*")) throw new Error("--select の列名が正しくありません");
      params.set("select", val.replace(/\s/g, ""));
    } else if (opt === "--order") {
      if (!/^[A-Za-z0-9_]+(\.(asc|desc))?(\.nulls(first|last))?$/.test(val)) throw new Error("--order は 列.desc の形で指定してください");
      params.set("order", val);
    } else if (opt === "--limit") {
      limit = Math.min(MAX_ROWS, Math.max(1, Number.parseInt(val, 10) || 20));
    } else if (opt === "--where") {
      const m = val.match(/^([A-Za-z0-9_]+)=((?:eq|neq|gt|gte|lt|lte|like|ilike|is|in)\..*)$/);
      if (!m) throw new Error("--where は 列=演算子.値 の形で指定してください（例: status=eq.error）");
      params.append(m[1], m[2]);
    } else {
      throw new Error(`知らないオプションです: ${opt}`);
    }
  }
  params.set("limit", String(limit));
  return params;
}

function shorten(value) {
  if (typeof value === "string" && value.length > MAX_TEXT) return value.slice(0, MAX_TEXT) + `…（${value.length} 文字）`;
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v)]));
  return value;
}

function headers(key, extra = {}) {
  const h = { apikey: key, Accept: "application/json", ...extra };
  // 古い形式のキー（JWT）は Authorization にも入れる。新しい形式（sb_secret_）は apikey だけでよい。
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function request(app, pathAndQuery, method = "GET", extra = {}) {
  const base = new URL(app.url).origin;
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    method,
    headers: headers(app.key, extra),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase がエラーを返しました（${res.status}）: ${body.slice(0, 300)}`);
  }
  return res;
}

async function openapi(app) {
  const res = await request(app, "", "GET", { Accept: "application/openapi+json" });
  return res.json();
}

async function main(argv) {
  const [cmd, appName, table, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help") return console.log(HELP);

  const apps = listApps();
  if (cmd === "apps") {
    const names = Object.keys(apps);
    if (!names.length) return console.log("使えるアプリはありません（.env.local に JARVIS_APP_<名前>_URL / _KEY がない）。");
    return console.log(names.map((n) => `${n}${apps[n].label ? `（${apps[n].label}）` : ""}`).join("\n"));
  }

  const app = apps[(appName || "").toLowerCase()];
  if (!app) throw new Error(`アプリ「${appName ?? ""}」は使えません。使えるのは: ${Object.keys(apps).join(", ") || "なし"}`);

  if (cmd === "tables") {
    const spec = await openapi(app);
    return console.log(Object.keys(spec.definitions ?? {}).sort().join("\n"));
  }

  if (!table || !NAME.test(table)) throw new Error("表の名前を指定してください（英数字と _ だけ）");

  if (cmd === "columns") {
    const spec = await openapi(app);
    const def = spec.definitions?.[table];
    if (!def) throw new Error(`表「${table}」が見つかりません`);
    return console.log(
      Object.entries(def.properties ?? {})
        .map(([c, p]) => `${c}: ${p.format ?? p.type ?? "?"}${p.description ? `  — ${p.description.split("\n")[0]}` : ""}`)
        .join("\n"),
    );
  }

  if (cmd === "read") {
    const res = await request(app, `${table}?${buildQuery(rest)}`);
    const rows = await res.json();
    return console.log(JSON.stringify(shorten(rows), null, 1));
  }

  if (cmd === "count") {
    const q = buildQuery(rest);
    q.delete("limit");
    const res = await request(app, `${table}?${q}`, "HEAD", { Prefer: "count=exact" });
    const range = res.headers.get("content-range") ?? "";
    return console.log(range.split("/")[1] ?? "不明");
  }

  throw new Error(`知らないコマンドです: ${cmd}（help で使い方）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`エラー: ${e.message}`);
    process.exit(1);
  });
}
