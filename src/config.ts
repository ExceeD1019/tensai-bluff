import "dotenv/config";
import { AnthropicProvider } from "./llm/anthropic.js";
import { OpenAIProvider } from "./llm/openai.js";
import type { LLMProvider } from "./llm/provider.js";

const providerName = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();

function makeProvider(): LLMProvider {
  if (providerName === "openai") return new OpenAIProvider(process.env.OPENAI_API_KEY);
  return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
}

const defaults =
  providerName === "openai"
    ? { generation: "gpt-5", verify: "gpt-5" }
    : { generation: "claude-opus-5", verify: "claude-opus-5" };

export const config = {
  providerName,
  maxRegenAttempts: Number(process.env.MAX_REGEN_ATTEMPTS ?? 3),
  generationModel: process.env.GENERATION_MODEL ?? defaults.generation,
  verifyModel: process.env.VERIFY_MODEL ?? defaults.verify,
  provider: makeProvider(),
};

export function assertKeyPresent(): void {
  const key = providerName === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[key]) {
    throw new Error(
      `${key} が未設定です。\n.env.example を .env にコピーして値を入れてください` +
        `（別プロバイダを使うなら .env の LLM_PROVIDER を変更）。`,
    );
  }
}
