import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseTopic, type Topic } from "../schema/topic.js";

/**
 * お題バンク。
 *
 * お題は手作りで `topics/bank/*.json` に置く。サーバはそこから配るだけ。
 */

const BANK_DIR = path.resolve(process.cwd(), "topics/bank");

export async function listBank(): Promise<string[]> {
  try {
    const files = await readdir(BANK_DIR);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  } catch {
    return [];
  }
}

export async function loadBankTopic(id: string): Promise<Topic> {
  const raw = await readFile(path.join(BANK_DIR, `${id}.json`), "utf8");
  return parseTopic(JSON.parse(raw));
}

export async function loadAllBank(): Promise<Topic[]> {
  const ids = await listBank();
  return Promise.all(ids.map(loadBankTopic));
}

/** ランタイムのお題選択。使用済みIDを除いてランダムに1件。 */
export async function pickRandomTopic(exclude: string[] = []): Promise<Topic> {
  const ids = (await listBank()).filter((id) => !exclude.includes(id));
  if (ids.length === 0) throw new Error("配れるお題がバンクにありません");
  const id = ids[Math.floor(Math.random() * ids.length)]!;
  return loadBankTopic(id);
}
