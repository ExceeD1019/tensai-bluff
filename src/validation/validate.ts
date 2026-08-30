import type { Topic } from "../schema/topic.js";
import { checkStructure } from "./checkStructure.js";
import type { Issue } from "./issues.js";
import { verifyTopic, type Verdict } from "./verifyTopic.js";

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  verdict?: Verdict;
}

/**
 * 構造チェック（コード）→ 内容チェック（LLM）の順で検証。
 * 構造にエラーがある間は LLM を呼ばない（無駄打ち防止）。
 */
export async function validateTopic(
  topic: Topic,
  opts: { skipLLM?: boolean } = {},
): Promise<ValidationResult> {
  const structural = checkStructure(topic);
  const structuralErrors = structural.filter((i) => i.severity === "error");

  if (structuralErrors.length > 0 || opts.skipLLM) {
    return split(structural, undefined, structuralErrors.length === 0 && !opts.skipLLM);
  }

  const { verdict, issues } = await verifyTopic(topic);
  return split([...structural, ...issues], verdict, true);
}

function split(all: Issue[], verdict: Verdict | undefined, llmRan: boolean): ValidationResult {
  const errors = all.filter((i) => i.severity === "error");
  const warnings = all.filter((i) => i.severity === "warn");
  // LLM を通っていない場合、構造チェックだけでは「合格」と断言しない
  return { ok: errors.length === 0 && llmRan, errors, warnings, verdict };
}
