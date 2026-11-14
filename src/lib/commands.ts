// 声の命令のうち、PC の Claude に渡さず画面だけで済ませるもの。
// - 「YouTube で〇〇と検索」「Google で〇〇を検索」→ 検索結果を開く（「アカウント2で」と付けると、その Google アカウントで開く）
// - 「モニター4のパレットに移して」「パレット1からパレット4に全部移して」「パレット4をメインに戻して」→ 固定ウィンドウを移す

const KANJI: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 「4」「４」「四」を数にする */
export function toNumber(t: string): number | null {
  const half = t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(half)) return Number(half);
  return KANJI[t] ?? null;
}

const NUM = "([0-9０-９一二三四五六七八九])";

export type SearchCommand = { site: "google" | "youtube"; query: string; account: number | null };

/**
 * 「YouTube で猫の動画と検索」→ { site: "youtube", query: "猫の動画" }
 * accountNames: 設定で付けた名前（例: { 2: "仕事用" }）。「仕事用で」でもアカウント 2 になる
 */
export function parseSearchCommand(text: string, accountNames: Record<number, string> = {}): SearchCommand | null {
  let t = text.trim().replace(/[。.!！?？]+$/, "");
  // アカウントの指定（「アカウント2で」「仕事用のアカウントで」など）
  const ex = extractAccount(t, accountNames);
  const account = ex.account;
  t = ex.rest;
  t = t.replace(/\s+/g, " ").trim();
  const m = t.match(/^(?:(ユーチューブ|youtube|you tube|ようつべ|グーグル|google|ググって)\s*(?:で|の)?\s*)(.+?)\s*(?:と|って|を)?\s*(?:検索して|検索|けんさく|調べて|探して|さがして|ググって)?$/i);
  const m2 = !m ? t.match(/^(.+?)\s*(?:を|と|って)?\s*(ユーチューブ|youtube|グーグル|google)\s*(?:で)?\s*(?:検索して|検索|調べて|探して)$/i) : null;
  let site: string;
  let query: string;
  if (m) {
    // 「YouTube で〇〇」だけで、検索の言葉がないものは命令とみなさない（「YouTube で何が人気？」などは Claude に任せる）
    if (!/(検索(して)?|けんさく(して)?|調べて|探して|さがして|ググって)$/.test(t)) return null;
    site = m[1];
    query = m[2];
  } else if (m2) {
    site = m2[2];
    query = m2[1];
  } else return null;
  query = query.replace(/(と|を|って)$/, "").trim();
  if (!query) return null;
  return { site: /ユーチューブ|youtube|ようつべ/i.test(site) ? "youtube" : "google", query, account };
}

/** 検索結果の URL。account は 1 から（1 = いつものアカウント） */
export function searchUrl(c: SearchCommand, embed = false): string {
  const q = encodeURIComponent(c.query);
  const auth = c.account && c.account > 1 ? `&authuser=${c.account - 1}` : "";
  if (c.site === "youtube") return `https://www.youtube.com/results?search_query=${q}${auth}`;
  // igu=1 を付けると、Google の検索結果をディミの中（小窓）に表示できる（ログインなしの表示になる）
  return `https://www.google.com/search?q=${q}${embed ? "&igu=1" : auth}`;
}

export type MoveCommand = { from: string; to: string };

/**
 * 「モニター4のパレットに移して」→ { from: "hud", to: "palette-4" }
 * 「パレット1からパレット4に全部移して」→ { from: "palette-1", to: "palette-4" }
 * 「パレット4をメインに戻して」→ { from: "palette-4", to: "hud" }
 */
export function parseMoveCommand(text: string): MoveCommand | null {
  const t = text.replace(/[\s、。]/g, "");
  if (!/(移して|うつして|移動して|移動|送って|動かして|戻して|もどして)/.test(t)) return null;
  const board = (s: string | undefined) => {
    if (!s) return null;
    if (/^(メイン|メイン画面|ディミ|ホーム)/.test(s)) return "hud";
    const m = s.match(new RegExp(`(?:モニター|モニタ|画面|パレット)${NUM}`));
    const n = m ? toNumber(m[1]) : null;
    return n ? `palette-${n}` : null;
  };
  const parts = t.match(/^(?:(.+?)(?:の(?:ウィンドウ|窓)(?:を)?)?(?:から|を))?(?:ウィンドウを)?(?:全部|ぜんぶ|すべて)?(.+?)(?:のパレット)?(?:に|へ)(?:全部|ぜんぶ|すべて)?(?:移して|うつして|移動して|移動|送って|動かして|戻して|もどして)$/);
  if (!parts) return null;
  const to = board(parts[2]);
  if (!to) return null;
  const from = board(parts[1]) ?? (to === "hud" ? null : "hud");
  if (!from || from === to) return null;
  return { from, to };
}

/**
 * 「アカウント2で」「仕事用で」などのアカウントの指定を取り出す。
 * names: アカウントの番号と名前（Chrome のプロフィールの名前）
 * @returns account: 番号（指定がなければ null）、rest: 指定を取り除いた言葉
 */
export function extractAccount(text: string, names: Record<number, string> = {}): { account: number | null; rest: string } {
  const am = text.match(new RegExp(`アカウント\\s*${NUM}\\s*(で|の|から)?`));
  if (am) return { account: toNumber(am[1]), rest: text.replace(am[0], " ").replace(/\s+/g, " ").trim() };
  for (const [n, name] of Object.entries(names)) {
    if (!name) continue;
    const m = text.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(のアカウント|のプロフィール)\\s*(で|の|から)?`));
    if (m) return { account: Number(n), rest: text.replace(m[0], " ").replace(/\s+/g, " ").trim() };
  }
  return { account: null, rest: text };
}

export type SessionCommand = { kind: "code" | "chat" | "any"; query: string };

/**
 * 「Claude の株の集計というセッションを開いて」→ { kind: "any", query: "株の集計" }
 * 「Claude のチャットを開いて」→ { kind: "chat", query: "" }
 */
export function parseSessionCommand(text: string): SessionCommand | null {
  const t = text.replace(/[。.!！?？]+$/, "").trim();
  const m = t.match(/^(?:claude|クロード|クロウド)\s*(コード|code)?\s*(?:の|で)?\s*(.*?)\s*(?:という|って|っていう)?\s*(セッション|チャット|会話)\s*(?:を)?\s*(?:開いて|ひらいて|出して|見せて|開く)$/i);
  if (!m) return null;
  const kind = m[3] === "チャット" ? "chat" : m[1] ? "code" : "any";
  return { kind, query: m[2].replace(/(の|という|って)$/, "").trim() };
}

/** セッションの題名から、言われた言葉にいちばん合うものを探す（言葉が題名に含まれるもの → 2 文字ずつの一致が多いもの） */
export function matchSession<T extends { title: string }>(list: T[], query: string): T | null {
  const norm = (x: string) => x.replace(/[\s、。「」・]/g, "").toLowerCase();
  const q = norm(query);
  if (!q) return null;
  const exact = list.find((s) => norm(s.title).includes(q));
  if (exact) return exact;
  let best: T | null = null;
  let bestScore = 0;
  for (const s of list) {
    const t = norm(s.title);
    let hit = 0;
    for (let i = 0; i < q.length - 1; i++) if (t.includes(q.slice(i, i + 2))) hit++;
    const score = q.length > 1 ? hit / (q.length - 1) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.6 ? best : null;
}
