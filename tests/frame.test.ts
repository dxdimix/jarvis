import { describe, expect, it } from "vitest";
import { droppedUrl, frameAllowed, toUrl } from "../src/lib/frame";

const H = "dimy.dxdimix.com";

describe("frameAllowed", () => {
  it("見出しがなければ表示できる", () => {
    expect(frameAllowed({}, "https://example.com", H)).toBe(true);
  });
  it("X-Frame-Options", () => {
    expect(frameAllowed({ xfo: "DENY" }, "https://example.com", H)).toBe(false);
    expect(frameAllowed({ xfo: "SAMEORIGIN" }, "https://example.com", H)).toBe(false);
  });
  it("frame-ancestors が優先される", () => {
    expect(frameAllowed({ xfo: "DENY", csp: "frame-ancestors https://*.dxdimix.com" }, "https://fx.dxdimix.com", H)).toBe(true);
    expect(frameAllowed({ csp: "default-src 'self'; frame-ancestors 'none'" }, "https://example.com", H)).toBe(false);
    expect(frameAllowed({ csp: "frame-ancestors 'self'" }, "https://example.com", H)).toBe(false);
    expect(frameAllowed({ csp: "frame-ancestors *" }, "https://example.com", H)).toBe(true);
  });
});

describe("droppedUrl / toUrl", () => {
  it("uri-list のコメント行を飛ばし、http(s) だけを受け付ける", () => {
    const data: Record<string, string> = { "text/uri-list": "# title\r\nhttps://example.com/a", "text/plain": "" };
    expect(droppedUrl((t) => data[t] ?? "")).toBe("https://example.com/a");
    expect(droppedUrl((t) => ({ "text/plain": "javascript:alert(1)" })[t] ?? "")).toBeNull();
  });
  it("https:// を省いた入力も URL にする", () => {
    expect(toUrl("example.com/x")).toBe("https://example.com/x");
    expect(toUrl("こんにちは")).toBeNull();
  });
});
