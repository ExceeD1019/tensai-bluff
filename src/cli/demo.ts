import { loadAllBank, listBank } from "../store/topicStore.js";
import { checkStructure } from "../validation/checkStructure.js";
import { tierCounts } from "../schema/topic.js";

/**
 * お題バンクの構造チェック。
 *   npm run demo
 *
 * bank/ の全お題に checkStructure をかけ、階層配分・guessability などが
 * 配れる状態か一覧で確認する。事実性は人が確認する。
 */
async function main() {
  const ids = await listBank();
  if (ids.length === 0) {
    console.log("topics/bank/ にお題がありません。");
    return;
  }

  const topics = await loadAllBank();
  let ng = 0;

  for (const t of topics) {
    const issues = checkStructure(t);
    const errors = issues.filter((i) => i.severity === "error");
    const warns = issues.filter((i) => i.severity === "warn");
    const c = tierCounts(t);
    const mark = errors.length === 0 ? "✅" : "❌";
    if (errors.length) ng++;
    console.log(
      `${mark} ${t.id.padEnd(16)} ${t.word.padEnd(14)} 表${c.surface}/具${c.specific}/意${c.surprising}  一般性${t.generalFamiliarity}` +
        (errors.length || warns.length ? `  (err ${errors.length} / warn ${warns.length})` : ""),
    );
    for (const e of errors) console.log(`     ❌ ${e.code} ${e.target}: ${e.message}`);
    for (const w of warns) console.log(`     ⚠ ${w.code} ${w.target}: ${w.message}`);
  }

  console.log(`\n${topics.length} 件中 ${topics.length - ng} 件が構造チェック合格。`);
  process.exitCode = ng === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
