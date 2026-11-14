import { describe, expect, it } from "vitest";
import { TOOLS, handle as rawHandle } from "../agent/tools/mcp-server.mjs";

type Res = { result?: { serverInfo?: { name: string }; tools?: { name: string }[] }; error?: { message: string } } | null;
const handle = async (msg: object) => (await rawHandle(msg)) as Res;

describe("ディミの道具（MCP サーバー）", () => {
  it("初期化と道具の一覧に答える", async () => {
    const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(init?.result?.serverInfo?.name).toBe("dimy");
    const list = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list?.result?.tools?.map((t) => t.name)).toEqual([
      "chrome_accounts",
      "open_in_chrome",
      "claude_sessions",
      "open_claude_session",
      "app_list",
      "app_tables",
      "app_columns",
      "app_read",
      "app_count",
      "memory_list",
      "memory_add",
    ]);
  });

  it("通知には返事をしない", async () => {
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });

  it("app_read の引数を、読み取りのコマンドに直す", () => {
    const read = TOOLS.find((t) => t.name === "app_read")!;
    expect(
      read.argv!({ app: "fx", table: "jfx_runs", order: "started_at.desc", limit: 5, where: ["status=eq.error"] }),
    ).toEqual(["read", "fx", "jfx_runs", "--order", "started_at.desc", "--limit", "5", "--where", "status=eq.error"]);
  });

  it("知らない道具はエラーにする", async () => {
    const res = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "delete_rows", arguments: {} } });
    expect(res?.error?.message).toContain("知らない道具");
  });
});
