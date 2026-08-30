import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTopic, type Topic } from "../schema/topic.js";

/**
 * お題バンク。
 *
 * 設計方針（ユーザー確認済み）: 本番ではランタイムで LLM を呼ばない。
 * 開発時に お題生成AI + 検証AI（または人手・Claude）で作った vetted なお題を
 *   topics/bank/*.json
 * に置き、サーバはそこから配るだけ。
 *
 * npm run gen（お題生成ツール）の出力は topics/out/ に置き、レビュー後に手動で bank/ へ移す。
 */

const BANK_DIR = path.resolve(process.cwd(), "topics/bank");
const OUT_DIR = path.resolve(process.cwd(), "topics/out");

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

/** ランタイムのお題選択のイメージ。使用済みIDを除いてランダムに1件。 */
export async function pickRandomTopic(exclude: string[] = []): Promise<Topic> {
  const ids = (await listBank()).filter((id) => !exclude.includes(id));
  if (ids.length === 0) throw new Error("配れるお題がバンクにありません");
  const id = ids[Math.floor(Math.random() * ids.length)]!;
  return loadBankTopic(id);
}

/** お題生成ツールの下書き出力先。 */
export async function saveDraft(topic: Topic): Promise<string> {
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${topic.id}.json`);
  await writeFile(file, JSON.stringify(topic, null, 2), "utf8");
  return file;
}
