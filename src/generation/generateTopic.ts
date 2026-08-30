import { z } from "zod";
import { config } from "../config.js";
import { extractJsonObject } from "../llm/json.js";
import { parseTopic, type Topic } from "../schema/topic.js";
import { buildGenerationPrompt, buildRegenPrompt } from "./prompt.js";
import type { Issue } from "../validation/issues.js";

async function requestTopic(system: string, user: string, shapeRetries = 2): Promise<Topic> {
  let lastErr: unknown;
  for (let i = 0; i <= shapeRetries; i++) {
    const { text } = await config.provider.complete({
      system,
      model: config.generationModel,
      maxTokens: 6000,
      messages: [
        {
          role: "user",
          content:
            i === 0
              ? user
              : `${user}\n\n(前回の出力は不正でした。JSON スキーマに厳密に従ってください: ${String(lastErr)})`,
        },
      ],
    });
    try {
      return parseTopic(extractJsonObject(text));
    } catch (err) {
      lastErr =
        err instanceof z.ZodError
          ? err.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")
          : err;
    }
  }
  throw new Error(`お題生成AIの出力がスキーマに準拠しませんでした: ${String(lastErr)}`);
}

/** ワードからお題を1件生成（word=null なら題材もAIに選ばせる）。 */
export function generateTopic(word: string | null): Promise<Topic> {
  const { system, user } = buildGenerationPrompt(word);
  return requestTopic(system, user);
}

/** 検証の指摘をもとに部分修正（GAME_SPEC.md 3.1 の再生成ルール）。 */
export function regenerateTopic(previous: Topic, issues: Issue[], attempt: number): Promise<Topic> {
  const { system, user } = buildRegenPrompt(previous, issues, attempt);
  return requestTopic(system, user, 1);
}
