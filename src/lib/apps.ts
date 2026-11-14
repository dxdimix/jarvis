// ディミの画面から開ける、利用者のアプリの一覧。
// - 基本はディミの画面の中の小窓（iframe）で開く。
// - ただし、ログインが必要で、ドメインが dxdimix.com でないアプリは、中ではログインできない
//   （ブラウザの安全の仕組みで、違うサイトの中ではログインの情報が送られない）ため、小さな別ウィンドウで開く。
//   そのアプリに 〇〇.dxdimix.com の URL を足して、ここの url を書き換えれば、中で開けるようになる。
// - アプリの側が「ほかの画面の中に表示されること」を禁止している場合（frameBlocked）も、別ウィンドウで開く。

export type AppId = "fx" | "kabu" | "umsheet" | "keiba" | "medical" | "nencho";

export type AppEntry = {
  id: AppId;
  name: string;
  url: string;
  /** ログインが必要か */
  login: boolean;
  /** アプリ側が、ほかの画面の中への表示を禁止しているか */
  frameBlocked?: boolean;
  /** 声で呼ぶときの言い方 */
  words: string[];
};

export const APPS: AppEntry[] = [
  { id: "fx", name: "FX", url: "https://fx-signal-monitor-web.vercel.app", login: true, words: ["fx", "エフエックス", "為替"] },
  { id: "kabu", name: "株", url: "https://kabu-signal-monitor.vercel.app", login: true, words: ["株", "かぶ", "カブ", "株式"] },
  { id: "umsheet", name: "UMSheet", url: "https://umsheet.dxdimix.com", login: true, words: ["umsheet", "ユーエムシート", "umシート", "せどり"] },
  { id: "keiba", name: "競馬", url: "https://keiba-optimizer.vercel.app", login: true, words: ["競馬", "けいば", "ケイバ"] },
  {
    id: "medical",
    name: "ノーティス（医療機器管理）",
    url: "https://medical-equipment-manager.shibata-k.workers.dev",
    login: true,
    frameBlocked: true,
    words: ["ノーティス", "医療機器", "notyce"],
  },
  { id: "nencho", name: "年末調整", url: "https://dxdimix.github.io/nencho-helper/", login: false, words: ["年末調整", "ねんちょう", "年調"] },
];

/** ディミの画面の中（小窓）で開けるか */
export function canEmbed(app: AppEntry, ownHost = "dimy.dxdimix.com"): boolean {
  if (app.frameBlocked) return false;
  if (!app.login) return true;
  const site = (host: string) => host.split(".").slice(-2).join(".");
  return site(new URL(app.url).hostname) === site(ownHost);
}

const OPEN_WORDS = /(開いて|ひらいて|開けて|表示して|見せて|出して|起動して|開く|を表示)/;

/** 「FX を開いて」のような言葉なら、そのアプリを返す。違えば null。 */
export function detectOpenCommand(text: string): AppEntry | null {
  const t = text.toLowerCase().replace(/\s+/g, "");
  if (!OPEN_WORDS.test(t)) return null;
  // 長い言い方から順に探す（「株式」と「株」など）
  const hits = APPS.flatMap((a) => a.words.map((w) => ({ a, w: w.toLowerCase() }))).sort((x, y) => y.w.length - x.w.length);
  return hits.find(({ w }) => t.includes(w))?.a ?? null;
}
