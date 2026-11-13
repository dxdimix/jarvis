// 設定ファイル（.env.local）の名前の引き継ぎ。
// 以前の名前「ジャービス」のころは設定の名前が JARVIS_ で始まっていた。今の名前は KYMIS_ で始まる。
// 古い名前で書かれた設定も、そのまま使えるようにする（KYMIS_ の値があればそちらを優先する）。

/**
 * JARVIS_〇〇 の値を、KYMIS_〇〇 がなければ KYMIS_〇〇 として使えるようにする。
 * @param {Record<string, string | undefined>} [env]
 */
export function aliasLegacyEnv(env = process.env) {
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith("JARVIS_")) continue;
    const key = "KYMIS_" + k.slice("JARVIS_".length);
    if (env[key] === undefined) env[key] = v;
  }
  return env;
}
