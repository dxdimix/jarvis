#!/usr/bin/env node
// キーミスの道具を、Claude Code に「MCP の道具」として渡すための小さなサーバー。
// - Claude Code が子プロセスとして起動し、標準入出力で JSON-RPC（1 行に 1 つ）をやり取りする。
// - コマンドを実行する機能（Bash）を Claude Code に渡さずに済むので、OS の違いに左右されず、安全。
// - 中身は appdata.mjs と同じ（読み取り専用）。キーは appdata.mjs が .env.local から自分で読む。

import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { run } from "./appdata.mjs";
import { addNote, listNotes } from "./memory.mjs";

const SERVER = { name: "kymis", version: "1.0.0" };

const appTable = {
  app: { type: "string", description: "アプリの名前（apps で出る名前。例: fx, kabu）" },
  table: { type: "string", description: "表の名前（tables で出る名前）" },
};
const where = {
  type: "array",
  items: { type: "string" },
  description: "絞り込み。「列=演算子.値」の形。例: [\"status=eq.error\", \"created_at=gte.2026-11-13\"]。演算子: eq neq gt gte lt lte like ilike is in",
};

export const TOOLS = [
  {
    name: "app_list",
    description: "データを読めるアプリの一覧と、その説明（括弧の中）を返す。最初にこれを使う。",
    inputSchema: { type: "object", properties: {} },
    argv: () => ["apps"],
  },
  {
    name: "app_tables",
    description: "アプリのデータベースにある表の一覧を返す。",
    inputSchema: { type: "object", properties: { app: appTable.app }, required: ["app"] },
    argv: (a) => ["tables", a.app],
  },
  {
    name: "app_columns",
    description: "表の列の名前と型を返す。",
    inputSchema: { type: "object", properties: appTable, required: ["app", "table"] },
    argv: (a) => ["columns", a.app, a.table],
  },
  {
    name: "app_read",
    description: "表の行を読む（読み取り専用。最大 200 行）。新しい順に並べるなら order に「created_at.desc」などを指定する。",
    inputSchema: {
      type: "object",
      properties: {
        ...appTable,
        select: { type: "string", description: "読む列（カンマ区切り）。省略で全部" },
        order: { type: "string", description: "並べ方。「列.desc」または「列.asc」" },
        limit: { type: "integer", description: "最大の行数（既定 20、最大 200）" },
        where,
      },
      required: ["app", "table"],
    },
    argv: (a) => [
      "read",
      a.app,
      a.table,
      ...(a.select ? ["--select", a.select] : []),
      ...(a.order ? ["--order", a.order] : []),
      ...(a.limit ? ["--limit", String(a.limit)] : []),
      ...(a.where ?? []).flatMap((w) => ["--where", w]),
    ],
  },
  {
    name: "app_count",
    description: "表の行の数を返す（絞り込みもできる）。",
    inputSchema: { type: "object", properties: { ...appTable, where }, required: ["app", "table"] },
    argv: (a) => ["count", a.app, a.table, ...(a.where ?? []).flatMap((w) => ["--where", w])],
  },
  {
    name: "memory_list",
    description: "キーミスが覚えていること（利用者の話し方の好み、利用者についての事実、決まり）の一覧を返す。書き留める前に、同じことがないか確かめるのに使う。",
    inputSchema: { type: "object", properties: {} },
    call: () => listNotes(),
  },
  {
    name: "memory_add",
    description:
      "利用者について、はっきり分かった好みや事実を 1 つ書き留める（次の会話からも守られる）。推測、一度きりの話、秘密の値は書かない。",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["style", "fact", "rule"], description: "style: 話し方・答え方の好み / fact: 利用者についての事実 / rule: 守ってほしい決まり" },
        content: { type: "string", description: "覚えること（短い 1 文。例: 結論を先に、2 文以内で答えると喜ぶ）" },
      },
      required: ["kind", "content"],
    },
    call: (a) => addNote(a),
  },
];

/** 1 つの要求に答える。通知（id がないもの）には何も返さない。 */
export async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) return null;

  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER,
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, `知らない道具です: ${params?.name}`);
      try {
        const args = params?.arguments ?? {};
        const text = tool.call ? await tool.call(args) : await run(tool.argv(args));
        return reply({ content: [{ type: "text", text }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: `エラー: ${e.message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `対応していない要求です: ${method}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const res = await handle(msg);
    if (res) process.stdout.write(JSON.stringify(res) + "\n");
  });
}
