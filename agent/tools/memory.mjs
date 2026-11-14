// キーミスが「覚えていること」（kymis_notes）を読み書きする道具。
// - 書けるのはキーミス自身のデータベースの kymis_notes だけ。利用者のアプリのデータには触らない。
// - 消す・書き換えるのは利用者が画面で行う（キーミスは追加と一覧だけ）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { aliasLegacyEnv } from "../lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });
aliasLegacyEnv();

const KINDS = ["style", "fact", "rule"];
const MAX_NOTES = 200;

function client() {
  const raw = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!raw || !key) throw new Error("キーミスのデータベースの設定（.env.local）がありません");
  return createClient(new URL(raw).origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function owner() {
  const id = process.env.KYMIS_OWNER_ID;
  if (!id) throw new Error("利用者を確かめられていないため、覚える道具は使えません");
  return id;
}

/** 覚えていることの一覧（使っているものだけ） */
export async function listNotes() {
  const { data, error } = await client()
    .from("kymis_notes")
    .select("kind, content, source, created_at")
    .eq("user_id", owner())
    .eq("active", true)
    .order("created_at");
  if (error) throw new Error(`読めませんでした: ${error.message}`);
  if (!data.length) return "覚えていることは、まだありません。";
  return data.map((n) => `[${n.kind}] ${n.content}（${n.source === "user" ? "利用者が書いた" : "キーミスが書いた"}）`).join("\n");
}

/** 覚えていることを 1 つ足す。同じ内容がすでにあれば足さない。 */
export async function addNote({ kind, content }) {
  const text = String(content ?? "").trim();
  if (!text) throw new Error("内容が空です");
  if (text.length > 500) throw new Error("内容が長すぎます（500 文字まで）");
  if (/sb_secret_|sb_publishable_|eyJhbGci|password|パスワード/i.test(text)) throw new Error("秘密の値らしきものは書き留めません");
  const k = KINDS.includes(kind) ? kind : "style";
  const sb = client();
  const uid = owner();
  const { data: existing, error: e1 } = await sb.from("kymis_notes").select("content").eq("user_id", uid).eq("active", true);
  if (e1) throw new Error(`読めませんでした: ${e1.message}`);
  if (existing.some((n) => n.content.trim() === text)) return "同じことを、すでに覚えています。";
  if (existing.length >= MAX_NOTES) throw new Error(`覚えていることが ${MAX_NOTES} 件に達しています。画面で整理してもらってください`);
  const { error } = await sb.from("kymis_notes").insert({ user_id: uid, kind: k, content: text, source: "kymis" });
  if (error) throw new Error(`書き留められませんでした: ${error.message}`);
  return `覚えました: [${k}] ${text}`;
}
