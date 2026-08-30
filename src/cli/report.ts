import { TIER_LABEL, tierCounts, type Topic } from "../schema/topic.js";
import type { Issue } from "../validation/issues.js";
import type { ValidationResult } from "../validation/validate.js";

const line = "─".repeat(64);

export function printTopic(topic: Topic): void {
  console.log(line);
  console.log(`お題: ${topic.word}   [${topic.category}]   id: ${topic.id}`);
  console.log(`潜入者に渡す説明: ${topic.neutralGloss}`);
  console.log(`題材の一般性: ${topic.generalFamiliarity}/5`);
  const c = tierCounts(topic);
  console.log(`配分: 表層 ${c.surface} / 具体 ${c.specific} / 意外 ${c.surprising}`);
  console.log(line);
  for (const f of topic.facts) {
    console.log(`  ${f.id} [${TIER_LABEL[f.tier]} g${f.guessability}] ${f.text}`);
    console.log(`       └ 出典: ${f.source}`);
  }
  console.log(line);
}

export function printValidation(r: ValidationResult): void {
  console.log(line);
  const status = r.ok ? "✅ 合格" : r.verdict || r.errors.length ? "❌ 要修正" : "⚠ 構造のみ確認（LLM未実行）";
  console.log(`検証: ${status}`);
  if (r.verdict) {
    console.log(`  LLM所見: ${r.verdict.summary}`);
    console.log(`  playable: ${r.verdict.playable ? "○" : "×"} — ${r.verdict.playabilityNote}`);
  }
  printIssues("エラー", r.errors);
  printIssues("警告", r.warnings);
  console.log(line);
}

function printIssues(label: string, issues: Issue[]): void {
  if (issues.length === 0) return;
  console.log(`\n${label}:`);
  for (const i of issues) {
    console.log(`  ${i.severity === "error" ? "❌" : "⚠"} [${i.code}] ${i.target}`);
    console.log(`     ${i.message}`);
    console.log(`     → ${i.fixHint}`);
  }
}
