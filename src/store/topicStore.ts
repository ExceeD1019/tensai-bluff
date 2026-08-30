import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTopic, type Topic } from "../schema/topic.js";

const DIR = path.resolve(process.cwd(), "topics");

export async function saveTopic(topic: Topic): Promise<string> {
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${topic.id}.json`);
  await writeFile(file, JSON.stringify(topic, null, 2), "utf8");
  return file;
}

export async function loadTopic(idOrPath: string): Promise<Topic> {
  const file = idOrPath.endsWith(".json")
    ? path.resolve(idOrPath)
    : path.join(DIR, `${idOrPath}.json`);
  return parseTopic(JSON.parse(await readFile(file, "utf8")));
}
