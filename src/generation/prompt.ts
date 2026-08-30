import type { Topic } from "../schema/topic.js";
import type { Issue } from "../validation/issues.js";

/** お題生成AI / 再生成AI のプロンプト（GAME_SPEC.md 3.1）。 */

const SCHEMA_GUIDE = `
出力は次の構造の JSON オブジェクト **のみ**。前後に説明文やコードフェンスを付けない。

{
  "id": "英数字スラッグ（例: eiffel-tower）",
  "word": "お題のワード1語（例: エッフェル塔）",
  "neutralGloss": "潜入者に渡す1行の中立説明。辞書の語釈レベル。誰でも推測できる範囲に留め、下の8点の具体（数字・年号・裏事実）は絶対に含めない",
  "generalFamiliarity": 1-5 の整数（平均的な大人がこのワードについて最低限語れるか。1=ほぼ無理 / 5=常識）,
  "category": "人物 / 建造物 / 自然 / 歴史 / 科学 / 文化 / 生物 など",
  "createdAt": "ISO8601 の日時文字列",
  "facts": [
    {
      "id": "f1",
      "text": "事実の記述（1〜2文、日本語）",
      "tier": "surface | specific | surprising",
      "source": "根拠（例: 'Wikipedia: エッフェル塔' 程度でよい）",
      "guessability": 1-5 の整数（ワードだけ知る人がこの事実を自力で言える度合い。1=まず無理 / 5=誰でも言える）
    }
    // 合計ちょうど8個
  ]
}
`.trim();

const RULES = `
## 8つの事実の階層と配分（厳守）

| tier | 個数 | 中身 | guessability の目安 |
|---|---|---|---|
| surface（表層） | 2〜3 | ワードから誰でも推測できる一般的な事柄 | 4〜5 |
| specific（具体） | 3〜4 | 数字・年号・固有名・仕組みなど、踏み込むと間違えやすい事柄 | 1〜2 |
| surprising（意外） | 1〜2 | 反直感的な裏事実。知らないと絶対に出てこない | 1〜2 |

合計は必ず8個。

## 成立条件（これが崩れるとゲームにならない）

1. **一般知識との差分**: specific と surprising は「ワードを知っているだけの人」には言えない内容にする。
   逆に surface は、その人でも自然に口にできる内容にする。この差がゲームの肝。
2. **事実性**: すべて実在の検証可能な事実。俗説・諸説あるものは避けるか、事実として確実な範囲に絞る。
3. **相互整合**: 8つの事実どうしが矛盾しない。
4. **題材の一般性**: 潜入者（ワードしか知らない側）が最低限、雑談に混ざれる程度に有名な題材にする。
   マニアックすぎる人物・作品・専門用語は避ける（generalFamiliarity 4 以上が望ましい）。
5. 人身事件・実在の存命人物の私生活・センシティブな話題は避ける。
`.trim();

export function buildGenerationPrompt(word: string | null): {
  system: string;
  user: string;
} {
  return {
    system: [
      "あなたはパーティーゲーム「天才を装うゲーム」のお題生成AIです。",
      "1つのワードと、それに関する8つの事実（3階層）から成るお題を生成します。",
      RULES,
      SCHEMA_GUIDE,
    ].join("\n\n"),
    user: word
      ? `お題のワードは「${word}」。このワードでお題JSONを生成してください。`
      : "遊びやすい有名な題材を1つ選び、お題JSONを生成してください（generalFamiliarity 4以上）。",
  };
}

export function buildRegenPrompt(
  previous: Topic,
  issues: Issue[],
  attempt: number,
): { system: string; user: string } {
  const granularity =
    attempt <= 1
      ? "根本原因まで遡って修正してよい。関連する事実もまとめて見直してよい。"
      : attempt === 2
        ? "指摘された事実と、それに直接関係する部分のみ修正する。他は変えない。"
        : "指摘された事実だけを最小限修正する。それ以外は一切変更しない。";

  const issueLines = issues
    .map(
      (x, i) =>
        `${i + 1}. [${x.severity}] ${x.code} 対象:${x.target}\n   ${x.message}\n   → ${x.fixHint}`,
    )
    .join("\n");

  return {
    system: [
      "あなたはパーティーゲーム「天才を装うゲーム」のお題生成AIです。",
      "既存のお題に検証で問題が見つかりました。問題を解消した完全なお題JSONを再出力してください。",
      `修正粒度（${attempt}回目）: ${granularity}`,
      RULES,
      SCHEMA_GUIDE,
    ].join("\n\n"),
    user: [
      "## 検証の指摘",
      issueLines,
      "",
      "## 現在のお題",
      "```json",
      JSON.stringify(previous, null, 2),
      "```",
      "",
      "指摘をすべて解消したお題JSONを出力してください。",
    ].join("\n"),
  };
}
