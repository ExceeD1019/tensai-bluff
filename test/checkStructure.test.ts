import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TopicSchema, type Topic } from "../src/schema/topic.js";
import { checkStructure } from "../src/validation/checkStructure.js";

const bankDir = fileURLToPath(new URL("../topics/bank/", import.meta.url));

function loadBank(): Topic[] {
  return readdirSync(bankDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => TopicSchema.parse(JSON.parse(readFileSync(bankDir + f, "utf8"))));
}

const bank = loadBank();
const fixture = bank.find((t) => t.id === "statue-of-liberty")!;

function codes(t: Topic): string[] {
  return checkStructure(t).map((i) => i.code);
}

describe("お題バンク", () => {
  it("1件以上ある", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it.each(bank.map((t) => [t.id, t] as const))("%s が構造チェックにエラー無しで通る", (_id, topic) => {
    const errs = checkStructure(topic).filter((i) => i.severity === "error");
    expect(errs).toEqual([]);
  });
});

describe("checkStructure()", () => {
  it("階層配分が崩れると TIER_COUNT", () => {
    const t = structuredClone(fixture);
    t.facts[0]!.tier = "specific";
    t.facts[1]!.tier = "specific";
    expect(codes(t)).toContain("TIER_COUNT");
  });

  it("具体/意外なのに guessability が高いと DEEP_TOO_EASY", () => {
    const t = structuredClone(fixture);
    t.facts[2]!.guessability = 5;
    expect(codes(t)).toContain("DEEP_TOO_EASY");
  });

  it("踏み込んだ事実が乏しいと WEAK_GAP", () => {
    const t = structuredClone(fixture);
    for (const f of t.facts) if (f.tier !== "surface") f.guessability = 3;
    expect(codes(t)).toContain("WEAK_GAP");
  });

  it("マニアックな題材だと OBSCURE_TOPIC", () => {
    const t = structuredClone(fixture);
    t.generalFamiliarity = 1;
    expect(codes(t)).toContain("OBSCURE_TOPIC");
  });

  it("neutralGloss に年号が混じると GLOSS_LEAK", () => {
    const t = structuredClone(fixture);
    t.neutralGloss = "1889年にパリに建てられた鉄の塔。";
    expect(codes(t)).toContain("GLOSS_LEAK");
  });
});
