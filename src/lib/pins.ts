// 固定ウィンドウ（ディミの中に置いておくページや映像）の保存。
// 置き場所（board）ごとに、この端末のブラウザに保存する。
// - "hud": メイン画面
// - "palette-1" など: パレット（2 枚目以降のモニター用の画面）。番号はモニターの番号
// 別の置き場所へ送るときは、相手の置き場所の保存に書き足す（開いている画面は storage の知らせで読み直す）。

export type PinKind = "web" | "capture";

export type Pin = {
  id: string;
  kind: PinKind;
  /** web: 開くページ */
  url?: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** 動かしたり大きさを変えたりできないようにする */
  locked?: boolean;
  /** そのページが、中への表示を禁止している */
  blocked?: boolean;
  /** 読み込み直した回数（変わるとページを読み込み直す） */
  rev?: number;
  /** ウィンドウの中身の縮尺（1 = 100%）。Ctrl + ホイールで変える */
  zoom?: number;
  /** 映像を拡大するときの中心（中身の左上からの割合、0〜100） */
  zoomOrigin?: { x: number; y: number };
};

/** 置き場所全体の縮尺と位置（パレットで Ctrl + ホイール・背景のドラッグ） */
export type BoardView = { z: number; x: number; y: number };
export const DEFAULT_VIEW: BoardView = { z: 1, x: 0, y: 0 };

export function loadView(board: string): BoardView {
  try {
    const v = JSON.parse(localStorage.getItem("dimy.pinview." + board) ?? "null") as BoardView | null;
    if (v && [v.z, v.x, v.y].every(Number.isFinite)) return v;
  } catch {}
  return DEFAULT_VIEW;
}
export function saveView(board: string, v: BoardView) {
  try {
    localStorage.setItem("dimy.pinview." + board, JSON.stringify(v));
  } catch {}
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

/** ホイールの回し具合から、新しい縮尺を出す */
export function wheelZoom(z: number, deltaY: number) {
  return clampZoom(z * Math.exp(-deltaY * 0.0015));
}

/** 縮尺を変えるとき、カーソルの下の点が動かないように、置き場所の位置を直す */
export function zoomAt(v: BoardView, z: number, cx: number, cy: number): BoardView {
  const k = z / v.z;
  return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

const PREFIX = "dimy.pins.";

export function boardKey(board: string) {
  return PREFIX + board;
}

export function loadPins(board: string): Pin[] {
  try {
    const raw = localStorage.getItem(boardKey(board));
    const list = raw ? (JSON.parse(raw) as Pin[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}

export function savePins(board: string, pins: Pin[]) {
  try {
    localStorage.setItem(boardKey(board), JSON.stringify(pins));
  } catch {}
}

/** 保存のある置き場所の一覧（メイン画面と、使ったことのあるパレット） */
export function knownBoards(): string[] {
  const set = new Set(["hud", "palette-1"]);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) set.add(k.slice(PREFIX.length));
    }
  } catch {}
  return [...set].sort((a, b) => (a === "hud" ? -1 : b === "hud" ? 1 : a.localeCompare(b, "ja", { numeric: true })));
}

export function boardLabel(board: string) {
  if (board === "hud") return "メイン画面";
  const m = board.match(/^palette-(\d+)$/);
  return m ? `パレット ${m[1]}` : board;
}

/** 別の置き場所へ送る（映像は送れない。映像はその画面でしか映せないため） */
export function sendPin(pin: Pin, to: string) {
  const list = loadPins(to);
  const z = Math.max(10, ...list.map((p) => p.z)) + 1;
  savePins(to, [...list.filter((p) => p.id !== pin.id), { ...pin, z }]);
}

export function newPinId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** URL から、ウィンドウの見出しにする短い名前を作る */
export function titleFromUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : "");
  } catch {
    return url;
  }
}
