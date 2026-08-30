import { config } from "./config.js";
import { generateTopic, regenerateTopic } from "./generation/generateTopic.js";
import type { Topic } from "./schema/topic.js";
import { validateTopic, type ValidationResult } from "./validation/validate.js";

export interface PipelineStep {
  attempt: number;
  kind: "generate" | "regenerate";
  topic: Topic;
  result: ValidationResult;
}

export interface PipelineOutcome {
  ok: boolean;
  topic: Topic;
  result: ValidationResult;
  steps: PipelineStep[];
  giveUpReason?: string;
}

/** 生成 → 検証 →（NGなら）部分修正 → 再検証 のループ（GAME_SPEC.md 3.1 / 7章）。 */
export async function runPipeline(
  word: string | null,
  hooks: { onStep?: (s: PipelineStep) => void } = {},
): Promise<PipelineOutcome> {
  const steps: PipelineStep[] = [];

  let topic = await generateTopic(word);
  let result = await validateTopic(topic);
  const first: PipelineStep = { attempt: 0, kind: "generate", topic, result };
  steps.push(first);
  hooks.onStep?.(first);

  let attempt = 0;
  while (!result.ok && attempt < config.maxRegenAttempts) {
    attempt += 1;
    try {
      topic = await regenerateTopic(topic, result.errors, attempt);
    } catch (err) {
      return { ok: false, topic, result, steps, giveUpReason: String(err) };
    }
    result = await validateTopic(topic);
    const step: PipelineStep = { attempt, kind: "regenerate", topic, result };
    steps.push(step);
    hooks.onStep?.(step);
  }

  if (result.ok) return { ok: true, topic, result, steps };

  const codes = [...new Set(result.errors.map((e) => e.code))];
  return {
    ok: false,
    topic,
    result,
    steps,
    giveUpReason:
      `${config.maxRegenAttempts}回の修正でも合格しませんでした。未解決: ${codes.join(", ")}\n` +
      `別のワードで試してください。`,
  };
}
