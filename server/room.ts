import { randomUUID } from "node:crypto";
import { dealImpostorFacts } from "../src/game/impostorFacts.js";
import { isAcceptableGuess } from "../src/game/wordGuess.js";
import type { Fact, Topic } from "../src/schema/topic.js";
import type { ClientMsg, Phase, PlayerView, Role, Settings, StateMsg, Title } from "./protocol.js";
import { scoreRound } from "./scoring.js";

const DEFAULT_SETTINGS: Settings = {
  memorySec: 40,
  discussionSec: 240,
  impostorFactCount: 2,
};
const MIN_PLAYERS = 3; // 最小人数（専門家2・潜入者1）。GAME_SPEC 2章

interface Player {
  id: string;
  name: string;
  connected: boolean;
  score: number;
  send: (msg: unknown) => void;
}

interface RoundState {
  topic: Topic;
  roleOf: Map<string, Role>;
  impostorIds: string[];
  expertFacts: Fact[];
  /** 潜入者ごとに独立して配る（相方が誰かは知らせない） */
  impostorBriefs: Map<string, { word: string; neutralGloss: string; facts: Fact[] }>;
  order: string[]; // speaking順（playerId）。2周とも同じ
  speakIndex: number; // 0..2N
  votes: Map<string, string>;
  caught: boolean;
  misvoters: string[];
  geniusId: string | null; // 生存潜入者（結果宣告の演出役）。露見時は null
  wordGuesses: Map<string, string>; // expertId -> 回答
  wordVerdicts: Map<string, boolean>; // expertId -> 正解か（acceptable配列で自動判定）
  announced: boolean; // 天才が結果発表を宣言したか（演出のみ）
  deltas: Record<string, number>;
  log: string[];
  titles: Record<string, Title>;
}

export class Room {
  readonly code: string;
  private players = new Map<string, Player>();
  private hostId = "";
  private phase: Phase = "lobby";
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private round: RoundState | null = null;
  private deadline: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private usedTopicIds = new Set<string>();
  private notice: string | undefined;

  constructor(
    code: string,
    private readonly pickTopic: (exclude: string[]) => Promise<Topic>,
  ) {
    this.code = code;
  }

  get isEmpty(): boolean {
    return [...this.players.values()].every((p) => !p.connected);
  }

  /** 参加（同名の切断プレイヤーがいれば再接続） */
  join(name: string, send: (msg: unknown) => void): string {
    const existing = [...this.players.values()].find((p) => p.name === name);
    if (existing) {
      existing.connected = true;
      existing.send = send;
      this.broadcast(`${name} が再接続しました`);
      return existing.id;
    }
    const id = randomUUID().slice(0, 8);
    this.players.set(id, { id, name, connected: true, score: 0, send });
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = id;
    this.broadcast(`${name} が参加しました`);
    return id;
  }

  leave(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
    if (this.phase === "lobby") this.players.delete(playerId);
    if (this.hostId === playerId) {
      const next = [...this.players.values()].find((x) => x.connected);
      this.hostId = next?.id ?? "";
    }
    this.broadcast(p.connected ? undefined : `${p.name} が離脱しました`);
  }

  handle(playerId: string, msg: ClientMsg): void {
    const isHost = playerId === this.hostId;
    switch (msg.t) {
      case "config":
        if (isHost && this.phase === "lobby") {
          this.settings = {
            memorySec: clamp(msg.settings.memorySec ?? this.settings.memorySec, 10, 180),
            discussionSec: clamp(msg.settings.discussionSec ?? this.settings.discussionSec, 30, 900),
            impostorFactCount: clamp(
              msg.settings.impostorFactCount ?? this.settings.impostorFactCount,
              0,
              3,
            ),
          };
          this.broadcast();
        }
        break;
      case "start":
        if (isHost && this.phase === "lobby") void this.startRound();
        break;
      case "advance":
        this.advanceSpeaking(playerId, isHost);
        break;
      case "toVote":
        if (isHost && this.phase === "discussion") this.toVoting();
        break;
      case "vote":
        this.castVote(playerId, msg.target);
        break;
      case "wordGuess":
        if (this.phase === "wordGuess" && this.round && this.round.roleOf.get(playerId) === "expert") {
          const text = msg.text.slice(0, 60);
          this.round.wordGuesses.set(playerId, text);
          // 正誤は acceptable 配列でサーバが自動判定する（3.1・3.6.1）。人間の裁定者は不要
          this.round.wordVerdicts.set(playerId, isAcceptableGuess(text, this.round.topic));
          this.broadcast();
        }
        break;
      case "announceWordGuess":
        // 天才は判定に関与せず、結果発表の演出役として残る（3.6.1）
        if (this.phase === "wordGuess" && this.round && playerId === this.round.geniusId) {
          this.round.announced = true;
          this.broadcast(`天才の${this.players.get(playerId)?.name ?? ""}「頭のいいあなたなら分かりますよね？」`);
        }
        break;
      case "finishWordGuess":
        if (isHost && this.phase === "wordGuess") this.finishRound();
        break;
      case "nextRound":
        if (isHost && this.phase === "scoreboard") {
          this.phase = "lobby";
          this.round = null;
          this.broadcast();
        }
        break;
      case "ping":
        break;
    }
  }

  // ---- フェーズ遷移 ----

  private async startRound(): Promise<void> {
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length < MIN_PLAYERS) {
      this.notice = `開始には${MIN_PLAYERS}人以上必要です`;
      this.broadcast();
      return;
    }

    let topic: Topic;
    try {
      topic = await this.pickTopic([...this.usedTopicIds]);
    } catch {
      this.usedTopicIds.clear();
      topic = await this.pickTopic([]);
    }
    this.usedTopicIds.add(topic.id);

    const ids = shuffle(active.map((p) => p.id));
    const impostorCount = active.length >= 7 ? 2 : 1;
    const impostorIds = ids.slice(0, impostorCount);
    const roleOf = new Map<string, Role>();
    for (const id of ids) roleOf.set(id, impostorIds.includes(id) ? "impostor" : "expert");

    const impostorBriefs = new Map(
      impostorIds.map((id) => [id, dealImpostorFacts(topic, this.settings.impostorFactCount)]),
    );

    this.round = {
      topic,
      roleOf,
      impostorIds,
      expertFacts: topic.facts,
      impostorBriefs,
      order: shuffle([...ids]),
      speakIndex: 0,
      votes: new Map(),
      caught: false,
      misvoters: [],
      geniusId: null,
      wordGuesses: new Map(),
      wordVerdicts: new Map(),
      announced: false,
      deltas: {},
      log: [],
      titles: {},
    };

    this.phase = "memory";
    this.setDeadline(this.settings.memorySec, () => this.toSpeaking());
    this.notice = undefined;
    this.broadcast();
  }

  private toSpeaking(): void {
    this.clearTimer();
    this.phase = "speaking";
    this.broadcast();
  }

  private advanceSpeaking(playerId: string, isHost: boolean): void {
    if (this.phase !== "speaking" || !this.round) return;
    const r = this.round;
    const n = r.order.length;
    const currentSpeaker = r.order[r.speakIndex % n];
    if (playerId !== currentSpeaker && !isHost) return;
    r.speakIndex += 1;
    if (r.speakIndex >= n * 2) this.toDiscussion();
    else this.broadcast();
  }

  private toDiscussion(): void {
    this.phase = "discussion";
    this.setDeadline(this.settings.discussionSec, () => this.toVoting());
    this.broadcast();
  }

  private toVoting(): void {
    this.clearTimer();
    if (!this.round) return;
    this.round.votes.clear();
    this.phase = "voting";
    this.broadcast();
  }

  private castVote(playerId: string, target: string): void {
    if (this.phase !== "voting" || !this.round) return;
    if (!this.players.get(target)) return;
    if (target === playerId) return;
    this.round.votes.set(playerId, target);

    const voters = [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
    if (voters.every((id) => this.round!.votes.has(id))) this.resolveVote();
    else this.broadcast();
  }

  private resolveVote(): void {
    const r = this.round!;
    // 集計（潜入者の票は除外。3.6）
    const tally = new Map<string, number>();
    for (const [voter, target] of r.votes.entries()) {
      if (r.impostorIds.includes(voter)) continue;
      tally.set(target, (tally.get(target) ?? 0) + 1);
    }
    const max = Math.max(0, ...tally.values());
    const topTargets = [...tally.entries()].filter(([, c]) => c === max).map(([id]) => id);

    // 潜入者が単独最多 → 特定成功。同率のときの扱いは保留（試遊で判断・8.3）。
    const impInTop = topTargets.some((id) => r.impostorIds.includes(id));
    r.caught = impInTop && topTargets.length === 1 && max > 0;

    r.misvoters = [...r.votes.entries()]
      .filter(([voter, target]) => !r.impostorIds.includes(voter) && !r.impostorIds.includes(target))
      .map(([voter]) => voter);

    r.geniusId = r.caught ? null : (r.impostorIds[0] ?? null);

    if (r.caught || !r.geniusId) {
      this.finishRound(); // 特定成功、または裁定できる天才がいない → そのままスコアへ
    } else {
      this.phase = "wordGuess"; // 取り逃し → 敗者復活戦（3.6.1）
      this.broadcast();
    }
  }

  private expertIds(): string[] {
    const r = this.round!;
    return [...r.roleOf.entries()].filter(([, ro]) => ro === "expert").map(([id]) => id);
  }

  private finishRound(): void {
    const r = this.round!;
    const wordVerdicts: Record<string, boolean> = {};
    if (!r.caught) {
      // 未裁定の専門家は「外した」扱い
      for (const id of this.expertIds()) wordVerdicts[id] = r.wordVerdicts.get(id) ?? false;
    }

    const { deltas, log } = scoreRound({
      impostorIds: r.impostorIds,
      caught: r.caught,
      votes: Object.fromEntries(r.votes),
      wordVerdicts,
      nameOf: (id) => this.players.get(id)?.name ?? id,
    });
    for (const [id, d] of Object.entries(deltas)) {
      const p = this.players.get(id);
      if (p) p.score += d;
    }

    // 称号（4章）。1人1試合につき1つだけ表示する（誤認より単語当ての結果を優先）
    const titles: Record<string, Title> = {};
    for (const impId of r.impostorIds) if (!r.caught) titles[impId] = "genius";
    if (r.caught) {
      for (const id of r.misvoters) titles[id] = "misread";
    } else {
      for (const id of this.expertIds()) {
        titles[id] = wordVerdicts[id] ? "prodigy" : "know-it-all-fool";
      }
    }

    r.deltas = deltas;
    r.log = log;
    r.titles = titles;
    this.phase = "scoreboard";
    this.broadcast();
  }

  // ---- タイマー ----

  private setDeadline(sec: number, onExpire: () => void): void {
    this.clearTimer();
    this.deadline = Date.now() + sec * 1000;
    this.timer = setTimeout(onExpire, sec * 1000);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.deadline = undefined;
  }

  dispose(): void {
    this.clearTimer();
  }

  // ---- 配信 ----

  private broadcast(notice?: string): void {
    if (notice) this.notice = notice;
    for (const p of this.players.values()) {
      if (p.connected) p.send(this.viewFor(p.id));
    }
    this.notice = undefined;
  }

  private playerViews(): PlayerView[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.id === this.hostId,
      score: p.score,
    }));
  }

  viewFor(playerId: string): StateMsg {
    const base: StateMsg = {
      t: "state",
      you: playerId,
      code: this.code,
      phase: this.phase,
      players: this.playerViews(),
      settings: this.settings,
      hostId: this.hostId,
      deadline: this.deadline,
      notice: this.notice,
    };
    const r = this.round;
    if (!r) return base;

    const role = r.roleOf.get(playerId);
    if (this.phase !== "lobby") base.role = role;

    // お題の単語: 潜入者には常に、専門家には scoreboard でのみ見せる（3.3）
    if (role === "impostor" || this.phase === "scoreboard") base.topicWord = r.topic.word;

    // 詳細情報（brief）は記憶フェーズ限定。専門家は単語を含めない（3.3）。
    // 出典（source）はどちらにも送らない（単語が漏れないよう）
    if (this.phase === "memory") {
      if (role === "impostor") {
        const b = r.impostorBriefs.get(playerId);
        if (b) base.brief = { ...b, facts: b.facts.map(stripSource) };
      } else if (role === "expert") {
        base.brief = { facts: r.expertFacts.map(stripSource) };
      }
    }

    if (this.phase === "speaking") {
      base.speaking = {
        order: r.order,
        index: r.speakIndex,
        round: r.speakIndex < r.order.length ? 1 : 2,
        total: r.order.length * 2,
      };
    }

    if (this.phase === "voting") {
      base.voting = { voted: [...r.votes.keys()], yourVote: r.votes.get(playerId) };
    }

    if (this.phase === "wordGuess" || this.phase === "scoreboard") {
      base.reveal = {
        impostorIds: r.impostorIds,
        votes: Object.fromEntries(r.votes),
        caught: r.caught,
        misvoters: r.misvoters,
      };
    }

    if (this.phase === "wordGuess") {
      // 正誤は判定済みだが、天才が「宣告」するまでは本人と天才以外には伏せる（結果宣告の演出・3.6.1）
      const isGenius = playerId === r.geniusId;
      const verdicts: Record<string, boolean> = {};
      for (const [id, v] of r.wordVerdicts) {
        if (isGenius || r.announced || id === playerId) verdicts[id] = v;
      }
      base.wordGuess = {
        geniusId: r.geniusId ?? "",
        expertIds: this.expertIds(),
        guesses: Object.fromEntries(r.wordGuesses),
        verdicts,
        announced: r.announced,
      };
    }

    if (this.phase === "scoreboard") {
      base.scoreboard = { deltas: r.deltas, log: r.log, titles: r.titles };
    }

    return base;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function stripSource({ source: _source, ...rest }: Fact): Omit<Fact, "source"> {
  return rest;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
