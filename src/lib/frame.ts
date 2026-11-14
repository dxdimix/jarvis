// 固定ウィンドウ（ディミの中に開いておくページ）のための判定。

/**
 * そのページが、ほかのサイトの中（iframe）への表示を許しているか。
 * X-Frame-Options と Content-Security-Policy の frame-ancestors を見る。
 * @param embedderHost ディミの画面のホスト名（例: dimy.dxdimix.com）
 */
export function frameAllowed(h: { xfo?: string | null; csp?: string | null }, targetUrl: string, embedderHost: string): boolean {
  const target = new URL(targetUrl);
  const csp = h.csp ?? "";
  const fa = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith("frame-ancestors"));
  // frame-ancestors があれば、そちらが優先される（X-Frame-Options は無視される）
  if (fa) {
    const sources = fa.split(/\s+/).slice(1);
    return sources.some((src) => {
      const s = src.replace(/^'|'$/g, "").toLowerCase();
      if (s === "none") return false;
      if (s === "*") return true;
      if (s === "self") return target.hostname === embedderHost;
      const host = s.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
      if (host.startsWith("*.")) return embedderHost.endsWith(host.slice(1));
      return host === embedderHost;
    });
  }
  const xfo = (h.xfo ?? "").trim().toLowerCase();
  if (xfo === "deny") return false;
  if (xfo === "sameorigin") return target.hostname === embedderHost;
  return true;
}

/**
 * ドラッグで落とされたものから URL を取り出す（Chrome / Edge のアドレス欄の左のアイコンやリンクをドラッグしたとき）。
 * getData はブラウザの DataTransfer.getData。
 */
export function droppedUrl(getData: (type: string) => string): string | null {
  const list = getData("text/uri-list")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  const candidates = [list, getData("text/plain").trim()];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const u = new URL(c);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {}
  }
  return null;
}

/** 入力された文字を URL にする（「example.com」のように https:// を省いても受け付ける） */
export function toUrl(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}
