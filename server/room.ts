import { randomUUID } from "node:crypto";
import { dealImpostorFacts } from "../src/game/impostorFacts.js";
import type { Fact, Topic } from "../src/schema/topic.js";
import type {
  ClientMsg,
  Judgement,
  Phase,
  PlayerView,
  Role,
  Settings,
  StateMsg,
} from "./protocol.js";
import { scoreRound } from "./scoring.js";

const DEFAULT_SETTINGS: Settings = { memorySec: 40, discussionSec: 240, impostorFactCount: 2 };
const MIN_PLAYERS = 3; // テスト用に緩め（本番は4）

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
  impostorBrief: { word: string; neutralGloss: string; facts: Fact[] };
  order: string[]; // speaking順（playerId）。2周とも同じ
  speakIndex: number; // 0..2N
  votes: Map<string, string>;
  caught: boolean;
  misvoters: string[];
  recalls: Map<string, string>;
  judgements: Map<string, Judgement>;
  accusations: Set<string>;
  geniusId: string | null;
  judgeId: string;
  deltas: Record<string, number>;
  log: string[];
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
      case "recall":
        if (this.phase === "audit" && this.round) this.round.recalls.set(playerId, msg.text);
        this.broadcast();
        break;
      case "judge":
        if (this.phase === "audit" && this.round && playerId === this.round.judgeId) {
          this.round.judgements.set(msg.player, msg.verdict);
          this.broadcast();
        }
        break;
      case "accuse":
        if (this.phase === "audit" && this.round && playerId === this.round.geniusId) {
          const s = this.round.accusations;
          s.has(msg.player) ? s.delete(msg.player) : s.add(msg.player);
          this.broadcast();
        }
        break;
      case "finishAudit":
        if (isHost && this.phase === "audit") this.finishAudit();
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

    this.round = {
      topic,
      roleOf,
      impostorIds,
      expertFacts: topic.facts,
      impostorBrief: dealImpostorFacts(topic, this.settings.impostorFactCount),
      order: shuffle([...ids]),
      speakIndex: 0,
      votes: new Map(),
      caught: false,
      misvoters: [],
      recalls: new Map(),
      judgements: new Map(),
      accusations: new Set(),
      geniusId: null,
      judgeId: "",
      deltas: {},
      log: [],
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
    if (voters.every((id) => this.round!.votes.has(id))) this.toReveal();
    else this.broadcast();
  }

  private toReveal(): void {
    const r = this.round!;
    // 集計
    const tally = new Map<string, number>();
    for (const target of r.votes.values()) tally.set(target, (tally.get(target) ?? 0) + 1);
    const max = Math.max(0, ...tally.values());
    const topTargets = [...tally.entries()].filter(([, c]) => c === max).map(([id]) => id);

    // 潜入者が単独最多 → 露見。同数最多に潜入者が入っていれば潜入者の勝ち（生存）
    const impInTop = topTargets.some((id) => r.impostorIds.includes(id));
    r.caught = impInTop && topTargets.length === 1;

    r.misvoters = [...r.votes.entries()]
      .filter(([voter, target]) => !r.impostorIds.includes(voter) && !r.impostorIds.includes(target))
      .map(([voter]) => voter);

    r.geniusId = r.caught ? null : (r.impostorIds[0] ?? null);
    // 判定者は host。host が潜入者なら最初の専門家に回す
    const host = this.hostId;
    r.judgeId =
      r.roleOf.get(host) === "expert"
        ? host
        : ([...r.roleOf.entries()].find(([, role]) => role === "expert")?.[0] ?? host);

    this.phase = "audit";
    this.broadcast();
  }

  private finishAudit(): void {
    const r = this.round!;
    const { deltas, log } = scoreRound({
      impostorIds: r.impostorIds,
      caught: r.caught,
      votes: Object.fromEntries(r.votes),
      misvoters: r.misvoters,
      judgements: Object.fromEntries(r.judgements) as Record<string, Judgement>,
      geniusId: r.geniusId,
      geniusAccusations: [...r.accusations],
      nameOf: (id) => this.players.get(id)?.name ?? id,
    });
    for (const [id, d] of Object.entries(deltas)) {
      const p = this.players.get(id);
      if (p) p.score += d;
    }
    r.deltas = deltas;
    r.log = log;
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
    if (this.phase === "memory" || this.phase === "speaking") {
      base.role = role;
      base.brief =
        role === "impostor"
          ? r.impostorBrief
          : role === "expert"
            ? { word: r.topic.word, neutralGloss: r.topic.neutralGloss, facts: r.expertFacts }
            : undefined;
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

    if (this.phase === "audit" || this.phase === "scoreboard") {
      base.role = role;
      base.reveal = {
        impostorIds: r.impostorIds,
        votes: Object.fromEntries(r.votes),
        caught: r.caught,
        misvoters: r.misvoters,
      };
    }

    if (this.phase === "audit") {
      base.audit = {
        facts: r.topic.facts,
        recalls: Object.fromEntries(r.recalls),
        judgements: Object.fromEntries(r.judgements) as Record<string, Judgement>,
        judgeId: r.judgeId,
        geniusId: r.geniusId ?? undefined,
        accusations: [...r.accusations],
        expertIds: [...r.roleOf.entries()].filter(([, ro]) => ro === "expert").map(([id]) => id),
      };
    }

    if (this.phase === "scoreboard") {
      base.scoreboard = { deltas: r.deltas, log: r.log };
    }

    return base;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
