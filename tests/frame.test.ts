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

import { clampZoom, wheelZoom, zoomAt } from "../src/lib/pins";

describe("縮尺（Ctrl + ホイール）", () => {
  it("ホイールを手前に回すと縮み、奥へ回すと大きくなる。範囲は 25%〜400%", () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(0.01)).toBe(0.25);
  });
  it("カーソルの下の点は動かない", () => {
    const v = zoomAt({ z: 1, x: 0, y: 0 }, 2, 100, 50);
    // 縮尺を変える前に (100,50) にあった点は、変えたあとも (100,50) に見える
    expect(100 * v.z + v.x).toBe(100);
    expect(50 * v.z + v.y).toBe(50);
  });
});
