import type { Fact, Tier, Topic } from "../schema/topic.js";

/**
 * 潜入者に渡す事実を選ぶ（GAME_SPEC.md 3.3）。
 *
 * 枚数は部屋設定（0〜3、標準2）。内訳は確率分析（GAME_SPEC.md 8.4）を踏まえ、
 * 「表層に寄せない」構成にする:
 *   0枚 → なし
 *   1枚 → 表層1
 *   2枚 → 表層1 ＋ 具体1   （標準）
 *   3枚 → 表層1 ＋ 具体1 ＋ 具体または意外1
 *
 * 潜入者には tier ラベルは見せず、事実テキストと中立説明だけ渡す。
 */

export const DEFAULT_IMPOSTOR_FACT_COUNT = 2;
export const MAX_IMPOSTOR_FACT_COUNT = 3;

export interface ImpostorBriefing {
  word: string;
  neutralGloss: string;
  /** 潜入者に開示する事実（tier は含めるが UI では出さない想定） */
  facts: Fact[];
}

function recipe(n: number, rng: () => number): Tier[] {
  switch (n) {
    case 0:
      return [];
    case 1:
      return ["surface"];
    case 2:
      return ["surface", "specific"];
    default:
      return ["surface", "specific", rng() < 0.5 ? "specific" : "surprising"];
  }
}

function drawOne(pool: Fact[], preferTier: Tier, rng: () => number): Fact | undefined {
  const inTier = pool.filter((f) => f.tier === preferTier);
  const from = inTier.length > 0 ? inTier : pool; // その tier が尽きたら何でも
  if (from.length === 0) return undefined;
  return from[Math.floor(rng() * from.length)];
}

export function dealImpostorFacts(
  topic: Topic,
  count: number = DEFAULT_IMPOSTOR_FACT_COUNT,
  rng: () => number = Math.random,
): ImpostorBriefing {
  const n = Math.max(0, Math.min(MAX_IMPOSTOR_FACT_COUNT, Math.floor(count)));
  const pool = [...topic.facts];
  const picked: Fact[] = [];

  for (const tier of recipe(n, rng)) {
    const f = drawOne(pool, tier, rng);
    if (!f) break;
    picked.push(f);
    pool.splice(pool.indexOf(f), 1);
  }

  return { word: topic.word, neutralGloss: topic.neutralGloss, facts: picked };
}
