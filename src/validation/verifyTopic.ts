import { z } from "zod";
import { config } from "../config.js";
import { extractJsonObject } from "../llm/json.js";
import type { Topic } from "../schema/topic.js";
import { issue, type Issue } from "./issues.js";

/**
 * 内容チェック（LLM 判定）。GAME_SPEC.md 3.1 / 8.2.1。
 *
 * コードでは判定できない3点を別モデルに問う:
 *   - 各事実は事実として正しいか
 *   - 8つの事実どうしが矛盾しないか
 *   - 潜入者（ワードしか知らない側）が雑談に混ざれる題材か（playable）
 *
 * ※ 現状は判定モデルの知識に依存する。将来 web 検索ツールで裏取りする（GAME_SPEC.md 5章）。
 */

const VerdictSchema = z.object({
  facts: z.array(
    z.object({
      id: z.string(),
      accurate: z.boolean(),
      confidence: z.number().min(0).max(1),
      guessableFromWordAlone: z.boolean(),
      note: z.string(),
    }),
  ),
  contradictions: z.array(
    z.object({ between: z.array(z.string()), explanation: z.string() }),
  ),
  playable: z.boolean(),
  playabilityNote: z.string(),
  verdict: z.enum(["pass", "revise"]),
  summary: z.string(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

const SYSTEM = `
あなたはパーティーゲーム「天才を装うゲーム」のお題検証AIです。
渡されたお題（1ワード + 8つの事実）を厳しく検証し、JSON のみで判定を返します。

検証項目:
1. 各事実の事実性。実在の検証可能な事実か。俗説・年号違い・数値違いを疑う。自信がなければ confidence を下げ accurate=false 寄りに。
2. guessableFromWordAlone: 「そのワードを知っているだけの人」がこの事実を自力で言えるか。
   - surface の事実は true であるべき
   - specific / surprising の事実は false であるべき（false でないと潜入者が捕まらない）
3. contradictions: 8つの事実どうしの矛盾。あれば between に fact id を列挙。
4. playable: 潜入者（ワードしか知らない側）が、一般常識だけで会話に最低限混ざれる有名な題材か。
   マニアックすぎる人物・作品・専門用語なら false。

出力する JSON:
{
  "facts": [ { "id": "f1", "accurate": true, "confidence": 0.0-1.0, "guessableFromWordAlone": true, "note": "簡潔に" } ... 8個 ],
  "contradictions": [ { "between": ["f3","f6"], "explanation": "..." } ],
  "playable": true,
  "playabilityNote": "...",
  "verdict": "pass" または "revise",
  "summary": "全体所見を1〜3文で"
}
JSON 以外は出力しない。
`.trim();

export async function verifyTopic(topic: Topic): Promise<{ verdict: Verdict; issues: Issue[] }> {
  const { text } = await config.provider.complete({
    system: SYSTEM,
    model: config.verifyModel,
    maxTokens: 4000,
    messages: [
      {
        role: "user",
        content: "次のお題を検証してください:\n```json\n" + JSON.stringify(topic, null, 2) + "\n```",
      },
    ],
  });

  const verdict = VerdictSchema.parse(extractJsonObject(text));
  const issues: Issue[] = [];
  const factTier = new Map(topic.facts.map((f) => [f.id, f.tier]));

  for (const fv of verdict.facts) {
    if (!fv.accurate || fv.confidence < 0.5) {
      issues.push(
        issue(
          "FACT_INACCURACY",
          "error",
          fv.id,
          `事実性に疑い（confidence=${fv.confidence.toFixed(2)}）: ${fv.note}`,
          "この事実を、確実に正しい内容に差し替えるか修正する",
        ),
      );
    }
    const tier = factTier.get(fv.id);
    if ((tier === "specific" || tier === "surprising") && fv.guessableFromWordAlone) {
      issues.push(
        issue(
          "DEEP_FACT_GUESSABLE",
          "error",
          fv.id,
          `${tier} の事実だが、ワードを知るだけで言える内容: ${fv.note}`,
          "ワードだけの人には出てこない具体・裏事実に差し替える",
        ),
      );
    }
    if (tier === "surface" && !fv.guessableFromWordAlone) {
      issues.push(
        issue(
          "SURFACE_FACT_TOO_DEEP",
          "warn",
          fv.id,
          `surface の事実だが、一般人には言えない内容: ${fv.note}`,
          "もっと一般的な内容にするか、tier を specific に変える",
        ),
      );
    }
  }

  for (const c of verdict.contradictions) {
    issues.push(
      issue(
        "CONTRADICTION",
        "error",
        c.between.join(","),
        `事実どうしの矛盾: ${c.explanation}`,
        "矛盾する事実のどちらかを修正する",
      ),
    );
  }

  if (!verdict.playable) {
    issues.push(
      issue(
        "NOT_PLAYABLE",
        "error",
        "topic",
        `潜入者が会話に混ざれない題材: ${verdict.playabilityNote}`,
        "もっと有名で一般的な題材に変える",
      ),
    );
  }

  return { verdict, issues };
}
