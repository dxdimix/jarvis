// モニターの一覧と位置（Chrome / Edge の「ウィンドウの配置」の機能 getScreenDetails）。
// 許可（「ウィンドウの管理」）がまだのときに、ドラッグの途中で許可を求める画面を出さないよう、許可済みのときだけ読む。

export type ScreenInfo = { label: string; availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary: boolean };
type ScreenDetails = { screens: ScreenInfo[]; currentScreen: ScreenInfo };

let cache: ScreenDetails | null = null;

/** モニターの一覧（許可がない・使えないときは null）。ask = true なら、許可を求めてもよい */
export async function getScreens(ask = false): Promise<ScreenInfo[] | null> {
  if (typeof window === "undefined" || !("getScreenDetails" in window)) return null;
  if (cache) return cache.screens;
  if (!ask) {
    try {
      const st = await navigator.permissions.query({ name: "window-management" as PermissionName });
      if (st.state !== "granted") return null;
    } catch {
      return null;
    }
  }
  try {
    cache = await (window as unknown as { getScreenDetails: () => Promise<ScreenDetails> }).getScreenDetails();
    return cache.screens;
  } catch {
    return null;
  }
}

/** モニター上の点（screenX, screenY）があるモニターの番号（0 から）。なければ -1 */
export function screenIndexAt(screens: ScreenInfo[], x: number, y: number) {
  return screens.findIndex((s) => x >= s.availLeft && x < s.availLeft + s.availWidth && y >= s.availTop && y < s.availTop + s.availHeight);
}

/** パレットを開く。screen を省くと、普通の新しいウィンドウで開く */
export function openPalette(n: number, screen?: ScreenInfo) {
  const f = screen
    ? `popup=yes,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
    : "popup=yes,width=1280,height=800";
  return window.open(`/palette?n=${n}`, `dimy-palette-${n}`, f) !== null;
}
