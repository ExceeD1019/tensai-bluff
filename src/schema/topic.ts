import { z } from "zod";

/**
 * お題データのスキーマ（GAME_SPEC.md 3.1）。
 *
 * お題 = 1ワード + それに関する8つの事実。事実は3階層に分かれる:
 *   surface    表層  : ワードから推測できる。潜入者が安全にオウム返しできる
 *   specific   具体  : 数字・年号・固有名・仕組み。踏み込むと矛盾する
 *   surprising 意外  : 反直感的な裏事実。議論がここに来たら潜入者は詰み
 *
 * 配分: surface 2〜3 / specific 3〜4 / surprising 1〜2 （合計8）
 */

export const Tier = z.enum(["surface", "specific", "surprising"]);
export type Tier = z.infer<typeof Tier>;

export const TIER_LABEL: Record<Tier, string> = {
  surface: "表層",
  specific: "具体",
  surprising: "意外",
};

/** 各階層の許容個数 [min, max] */
export const TIER_RANGE: Record<Tier, [number, number]> = {
  surface: [2, 3],
  specific: [3, 4],
  surprising: [1, 2],
};

export const FactSchema = z.object({
  id: z.string().min(1), // f1..f8
  /** 事実の記述（1〜2文） */
  text: z.string().min(1),
  tier: Tier,
  /** 根拠。プロトタイプでは "Wikipedia: エッフェル塔" 程度でよい（出典の厳密化は後） */
  source: z.string().min(1),
  /**
   * お題作成時の見積もり。「ワードだけ知っている人がこの事実を自力で言える度合い」
   * 1 = まず無理 / 3 = 知っていれば言えそう / 5 = 誰でも言える
   * surface は高め、specific / surprising は低くあるべき（この差がゲームの肝）
   */
  guessability: z.number().int().min(1).max(5),
});
export type Fact = z.infer<typeof FactSchema>;

export const TopicSchema = z.object({
  id: z.string().min(1),
  word: z.string().min(1),
  /** 潜入者に渡す1行の中立説明（誰でも推測できるレベル。8点の具体は含めない） */
  neutralGloss: z.string().min(1),
  /** 題材の一般性。平均的な大人がこのワードについて最低限語れるか（1=ほぼ無理 .. 5=常識） */
  generalFamiliarity: z.number().int().min(1).max(5),
  /** 人物 / 建造物 / 自然 / 歴史 / 科学 / 文化 / 生物 など */
  category: z.string().min(1),
  facts: z.array(FactSchema).length(8),
  createdAt: z.string(),
});
export type Topic = z.infer<typeof TopicSchema>;

export function parseTopic(data: unknown): Topic {
  return TopicSchema.parse(data);
}

export function tierCounts(topic: Topic): Record<Tier, number> {
  const counts: Record<Tier, number> = { surface: 0, specific: 0, surprising: 0 };
  for (const f of topic.facts) counts[f.tier] += 1;
  return counts;
}
