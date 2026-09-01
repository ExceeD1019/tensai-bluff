import { describe, expect, it } from "vitest";
import { isAcceptableGuess, normalizeAnswer } from "../src/game/wordGuess.js";

describe("normalizeAnswer()", () => {
  it("カタカナをひらがなに変換する", () => {
    expect(normalizeAnswer("オーロラ")).toBe("おーろら");
  });

  it("全角/半角を統一する", () => {
    expect(normalizeAnswer("ｽｼ")).toBe(normalizeAnswer("スシ"));
  });

  it("記号・空白を取り除く", () => {
    expect(normalizeAnswer("エッフェル・塔　")).toBe(normalizeAnswer("エッフェル塔"));
  });

  it("英字は小文字化する", () => {
    expect(normalizeAnswer("Black Hole")).toBe(normalizeAnswer("blackhole"));
  });
});

describe("isAcceptableGuess()", () => {
  const topic = { word: "エッフェル塔", acceptable: ["エッフェルとう", "エッフェルタワー"] };

  it("word と完全一致すれば正解", () => {
    expect(isAcceptableGuess("エッフェル塔", topic)).toBe(true);
  });

  it("acceptable のバリエーションでも正解", () => {
    expect(isAcceptableGuess("エッフェルタワー", topic)).toBe(true);
  });

  it("表記ゆれ（全角/半角・空白）は吸収する", () => {
    expect(isAcceptableGuess(" えっふぇるとう ", topic)).toBe(true);
  });

  it("意味は合っていても名称そのものでなければ不正解", () => {
    expect(isAcceptableGuess("パリのあの鉄の塔", topic)).toBe(false);
  });

  it("空文字や無関係な回答は不正解", () => {
    expect(isAcceptableGuess("", topic)).toBe(false);
    expect(isAcceptableGuess("ピラミッド", topic)).toBe(false);
  });
});
