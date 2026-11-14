import { describe, expect, it } from "vitest";
import { weatherLabel } from "../src/lib/weather";

describe("weatherLabel", () => {
  it("天気の番号を日本語にする", () => {
    expect(weatherLabel(0)).toBe("快晴");
    expect(weatherLabel(3)).toBe("くもり");
    expect(weatherLabel(63)).toBe("雨");
    expect(weatherLabel(73)).toBe("雪");
    expect(weatherLabel(95)).toBe("雷雨");
    expect(weatherLabel(999)).toBe("雷雨");
    expect(weatherLabel(20)).toBe("不明");
  });
});
