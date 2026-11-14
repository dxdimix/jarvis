// 端末をまたいで使う設定（表 user_settings）を読む（DIMY の道具から使う）。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { aliasLegacyEnv } from "../lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: path.join(ROOT, ".env.local"), quiet: true });
aliasLegacyEnv();

/** 設定の値（読めなければ null） */
export async function readUserSetting(key) {
  const raw = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const owner = process.env.DIMY_OWNER_ID;
  if (!raw || !secret || !owner) return null;
  try {
    const sb = createClient(new URL(raw).origin, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await sb.from("user_settings").select("value").eq("user_id", owner).eq("key", key).maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}
