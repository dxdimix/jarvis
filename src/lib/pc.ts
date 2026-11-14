// PC のディミへの命令（Chrome で開く・Claude Code のセッションを開く）と、PC の情報（表 pc_state）。
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChromeProfile = { dir: string; name: string; email: string };
export type PcSession = { id: string; title: string; project: string; updated_at: string };
export type PcState = { chrome_profiles: ChromeProfile[]; claude_sessions: PcSession[] };

export async function loadPcState(supabase: SupabaseClient): Promise<PcState | null> {
  const { data, error } = await supabase.from("pc_state").select("chrome_profiles, claude_sessions").maybeSingle();
  if (error || !data) return null;
  return data as PcState;
}

/**
 * PC のディミに命令を送り、結果を待つ（最大 timeoutMs）。
 * @returns ok: 実行できたか、result: PC からの結果の文（届かなければ空）
 */
export async function sendPcCommand(
  supabase: SupabaseClient,
  kind: "open_url" | "open_session",
  payload: Record<string, unknown>,
  timeoutMs = 8000,
): Promise<{ ok: boolean; result: string; sent: boolean }> {
  const { data, error } = await supabase.from("pc_commands").insert({ kind, payload }).select("id").single();
  if (error || !data) return { ok: false, result: error?.message ?? "", sent: false };
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 400));
    const { data: row } = await supabase.from("pc_commands").select("status, result").eq("id", data.id).maybeSingle();
    if (row && row.status !== "pending") return { ok: row.status === "done", result: row.result ?? "", sent: true };
  }
  return { ok: false, result: "PC から返事がありません。", sent: true };
}
