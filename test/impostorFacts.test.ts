import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TopicSchema } from "../src/schema/topic.js";
import { dealImpostorFacts } from "../src/game/impostorFacts.js";

const eiffel = TopicSchema.parse(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../topics/bank/eiffel-tower.json", import.meta.url)), "utf8"),
  ),
);

describe("dealImpostorFacts()", () => {
  it("0枚なら事実なし、中立説明は渡す", () => {
    const b = dealImpostorFacts(eiffel, 0);
    expect(b.facts).toHaveLength(0);
    expect(b.neutralGloss).toBe(eiffel.neutralGloss);
    expect(b.word).toBe("エッフェル塔");
  });

  it("1枚なら表層1つ", () => {
    const b = dealImpostorFacts(eiffel, 1);
    expect(b.facts).toHaveLength(1);
    expect(b.facts[0]!.tier).toBe("surface");
  });

  it("標準2枚は 表層1 ＋ 具体1（表層に寄せない）", () => {
    for (let i = 0; i < 50; i++) {
      const tiers = dealImpostorFacts(eiffel, 2).facts.map((f) => f.tier).sort();
      expect(tiers).toEqual(["specific", "surface"]);
    }
  });

  it("3枚は 表層1 ＋ 具体1 ＋ (具体 or 意外)1、重複なし", () => {
    for (let i = 0; i < 50; i++) {
      const facts = dealImpostorFacts(eiffel, 3).facts;
      expect(facts).toHaveLength(3);
      expect(new Set(facts.map((f) => f.id)).size).toBe(3);
      expect(facts.filter((f) => f.tier === "surface")).toHaveLength(1);
      expect(facts.filter((f) => f.tier === "specific").length).toBeGreaterThanOrEqual(1);
    }
  });

  it("範囲外の枚数はクランプされる", () => {
    expect(dealImpostorFacts(eiffel, 9).facts).toHaveLength(3);
    expect(dealImpostorFacts(eiffel, -1).facts).toHaveLength(0);
  });

  it("rng を差し込めば決定的", () => {
    const fixed = () => 0.42;
    const a = dealImpostorFacts(eiffel, 3, fixed).facts.map((f) => f.id);
    const b = dealImpostorFacts(eiffel, 3, fixed).facts.map((f) => f.id);
    expect(a).toEqual(b);
  });
});
