// 設定ファイル（.env.local）の名前の引き継ぎ。
// 名前は「ジャービス」→「キーミス」→「ディミ（DIMY）」と変わり、設定の名前も JARVIS_ → KYMIS_ → DIMY_ と変わった。
// 古い名前で書かれた設定も、そのまま使えるようにする（新しい名前の値があればそちらを優先し、KYMIS_ は JARVIS_ より優先する）。

const LEGACY = ["KYMIS_", "JARVIS_"];

/**
 * KYMIS_〇〇 / JARVIS_〇〇 の値を、DIMY_〇〇 がなければ DIMY_〇〇 として使えるようにする。
 * @param {Record<string, string | undefined>} [env]
 */
export function aliasLegacyEnv(env = process.env) {
  for (const prefix of LEGACY) {
    for (const [k, v] of Object.entries(env)) {
      if (!k.startsWith(prefix)) continue;
      const key = "DIMY_" + k.slice(prefix.length);
      if (env[key] === undefined) env[key] = v;
    }
  }
  return env;
}
