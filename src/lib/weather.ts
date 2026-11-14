// 天気（Open-Meteo。登録もキーも要らない無料のサービス）。
// 地域は画面で利用者が入力し、このブラウザに保存する（どの地域かを推測しない）。

export type Place = { name: string; latitude: number; longitude: number };
export type Weather = {
  temperature: number;
  code: number;
  max: number;
  min: number;
  rain: number | null; // 降水確率（%）
};

/** 天気の番号（WMO の天気コード）を日本語にする。 */
export function weatherLabel(code: number): string {
  if (code === 0) return "快晴";
  if (code === 1) return "晴れ";
  if (code === 2) return "晴れ時々くもり";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "にわか雨";
  if (code === 85 || code === 86) return "にわか雪";
  if (code >= 95) return "雷雨";
  return "不明";
}

/** 地名から緯度・経度を調べる。見つからなければ null。 */
export async function findPlace(name: string): Promise<Place | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&language=ja&count=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`地名を調べられませんでした（${res.status}）`);
  const json = await res.json();
  const r = json.results?.[0];
  if (!r) return null;
  const label = [r.admin1, r.name].filter((v: string | undefined, i: number, a: (string | undefined)[]) => v && a.indexOf(v) === i).join(" ");
  return { name: label || r.name, latitude: r.latitude, longitude: r.longitude };
}

/** 今の天気と、今日の最高・最低気温、降水確率。 */
export async function fetchWeather(place: Place): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FTokyo&forecast_days=1";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`天気を取得できませんでした（${res.status}）`);
  const j = await res.json();
  return {
    temperature: j.current.temperature_2m,
    code: j.current.weather_code,
    max: j.daily.temperature_2m_max[0],
    min: j.daily.temperature_2m_min[0],
    rain: j.daily.precipitation_probability_max?.[0] ?? null,
  };
}
