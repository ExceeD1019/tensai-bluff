import {
  TIER_LABEL,
  TIER_RANGE,
  tierCounts,
  type Tier,
  type Topic,
} from "../schema/topic.js";
import { issue, type Issue } from "./issues.js";

/**
 * 手作りしたお題の構造チェック（GAME_SPEC.md 3.1 / 7章）。
 *
 * 「解けるお題か」の一次フィルタ。事実性は人が確認するが、
 *   - 8点の階層配分
 *   - guessability と tier の食い違い（＝一般知識との差分が作れているか）
 *   - 事実の重複
 * はここで機械的に弾ける。
 */
export function checkStructure(topic: Topic): Issue[] {
  const issues: Issue[] = [];

  // --- 階層配分 ---
  const counts = tierCounts(topic);
  for (const tier of ["surface", "specific", "surprising"] as Tier[]) {
    const [min, max] = TIER_RANGE[tier];
    const n = counts[tier];
    if (n < min || n > max) {
      issues.push(
        issue(
          "TIER_COUNT",
          "error",
          "structure",
          `${TIER_LABEL[tier]}(${tier})の事実が ${n} 個。許容は ${min}〜${max} 個`,
          `${TIER_LABEL[tier]}の事実を ${min}〜${max} 個に調整（合計は8個のまま）`,
        ),
      );
    }
  }

  // --- guessability と tier の整合 ---
  for (const f of topic.facts) {
    if (f.tier === "surface" && f.guessability <= 2) {
      issues.push(
        issue(
          "SURFACE_TOO_HARD",
          "warn",
          f.id,
          `表層の事実なのに guessability=${f.guessability}（低すぎ）。表層は誰でも言える内容のはず`,
          `この事実を specific/surprising に変えるか、もっと一般的な内容に差し替える`,
        ),
      );
    }
    if ((f.tier === "specific" || f.tier === "surprising") && f.guessability >= 4) {
      issues.push(
        issue(
          "DEEP_TOO_EASY",
          "error",
          f.id,
          `${TIER_LABEL[f.tier]}の事実なのに guessability=${f.guessability}（高すぎ）。ワードを知るだけで言えてしまう`,
          `ワードだけの人には出てこない、数字・年号・固有名・裏事実に差し替える`,
        ),
      );
    }
  }

  // --- 「差分」がそもそも存在するか ---
  const deepFacts = topic.facts.filter((f) => f.tier !== "surface");
  const hardEnough = deepFacts.filter((f) => f.guessability <= 2).length;
  if (hardEnough < 3) {
    issues.push(
      issue(
        "WEAK_GAP",
        "error",
        "topic",
        `ワードだけでは言えない事実（guessability<=2 の specific/surprising）が ${hardEnough} 個しかない。潜入者が永遠に捕まらない`,
        `踏み込んだ具体・意外な事実を増やし、少なくとも3個は guessability 1〜2 にする`,
      ),
    );
  }

  // --- 事実の重複 ---
  for (let i = 0; i < topic.facts.length; i++) {
    for (let j = i + 1; j < topic.facts.length; j++) {
      const a = topic.facts[i]!;
      const b = topic.facts[j]!;
      if (jaccard(tokenize(a.text), tokenize(b.text)) > 0.6) {
        issues.push(
          issue(
            "DUPLICATE_FACT",
            "warn",
            `${a.id},${b.id}`,
            `事実 ${a.id} と ${b.id} の内容がほぼ重複`,
            `片方を別の観点の事実に差し替える`,
          ),
        );
      }
    }
  }

  // --- 題材の一般性 ---
  if (topic.generalFamiliarity <= 2) {
    issues.push(
      issue(
        "OBSCURE_TOPIC",
        "error",
        "topic",
        `generalFamiliarity=${topic.generalFamiliarity}。題材がマニアックすぎて潜入者が何も話せない`,
        `もっと有名な題材に変える（generalFamiliarity 4 以上）`,
      ),
    );
  }

  // --- neutralGloss が具体を漏らしていないか（簡易チェック） ---
  const glossLeak = /\d{3,}|\d+年|\d+メートル|\d+トン|\d+%/.test(topic.neutralGloss);
  if (glossLeak) {
    issues.push(
      issue(
        "GLOSS_LEAK",
        "warn",
        "topic",
        `neutralGloss に数値・年号が含まれている（潜入者に具体を渡してしまう）`,
        `neutralGloss は語釈レベルに留め、数字・年号・固有の裏事実を除く`,
      ),
    );
  }

  return issues;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .replace(/[、。・（）「」\s]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
