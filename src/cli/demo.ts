import { loadTopic } from "../store/topicStore.js";
import { checkStructure } from "../validation/checkStructure.js";
import { printTopic, printValidation } from "./report.js";

/**
 * オフラインデモ（API キー不要）。同梱サンプルお題に構造チェックだけをかける。
 *   npm run demo
 */
async function main() {
  const topic = await loadTopic("sample-topic");
  printTopic(topic);

  const issues = checkStructure(topic);
  printValidation({
    ok: issues.filter((i) => i.severity === "error").length === 0 && false, // LLM未実行なので ok にはしない
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warn"),
  });

  console.log("※ これは構造チェックのみ。事実性・矛盾・playable の判定は npm run gen（要APIキー）で。");

  console.log("\n--- わざと配分を壊した版 ---");
  const broken = structuredClone(topic);
  broken.facts[0]!.tier = "specific"; // 表層を1つ減らして具体を増やす
  broken.facts[1]!.tier = "specific";
  broken.facts[6]!.guessability = 5; // 意外なのに誰でも言える
  const brokenIssues = checkStructure(broken);
  printValidation({
    ok: false,
    errors: brokenIssues.filter((i) => i.severity === "error"),
    warnings: brokenIssues.filter((i) => i.severity === "warn"),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
