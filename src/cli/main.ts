import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { assertKeyPresent, config } from "../config.js";
import { runPipeline } from "../pipeline.js";
import { saveDraft } from "../store/topicStore.js";
import { printTopic, printValidation } from "./report.js";

/**
 * お題生成ツール（GAME_SPEC.md 7章）。開発時に使う。
 *   npm run gen
 *
 * 合格したお題は topics/out/ に保存される。中身を確認して topics/bank/ へ手動で移すと
 * 本番のお題バンクに入る（ランタイムはバンクから配るだけ、LLM を呼ばない）。
 */
async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    assertKeyPresent();
    console.log("=== 天才を装うゲーム / お題生成テスト ===");
    console.log(`provider: ${config.providerName}  生成: ${config.generationModel}  検証: ${config.verifyModel}\n`);

    for (;;) {
      const word = (
        await rl.question("お題のワード（空 Enter で AI におまかせ / 'q' で終了）\n> ")
      ).trim();
      if (word === "q" || word === "quit") break;

      console.log("\n生成中...\n");
      const outcome = await runPipeline(word || null, {
        onStep: (s) => {
          const tag = s.kind === "generate" ? "生成" : `修正${s.attempt}`;
          const r = s.result;
          const state = r.ok ? "合格" : `NG(err ${r.errors.length}/warn ${r.warnings.length})`;
          console.log(`[${tag}] 「${s.topic.word}」 → ${state}`);
          for (const e of r.errors) console.log(`   ❌ ${e.code} ${e.target}: ${e.message}`);
        },
      });

      console.log();
      printTopic(outcome.topic);
      printValidation(outcome.result);

      if (outcome.ok) {
        const file = await saveDraft(outcome.topic);
        console.log(`\n下書き保存: ${file}\n（確認して topics/bank/ に移すとお題バンクに入ります）`);
      } else {
        console.log(`\n未合格: ${outcome.giveUpReason ?? ""}`);
      }
      console.log();
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
