/**
 * サーバの1試合を通しで叩くスモークテスト（4クライアント）。
 * 別ターミナルで `npm run serve` を起動してから:
 *   node scripts/smoketest.mjs [port]
 */
import WebSocket from "ws";

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const NAMES = ["ホスト", "あお", "みどり", "きい"];
const clients = [];
let code = null;

function mk(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, state: null };
  ws.on("open", () => ws.send(JSON.stringify({ t: "join", name, code: code || undefined })));
  ws.on("message", (d) => {
    const m = JSON.parse(String(d));
    if (m.t === "error") return console.log(`[${name}] ERROR ${m.msg}`);
    c.state = m;
    if (name === "ホスト" && !code) { code = m.code; console.log("room code:", code); }
  });
  clients.push(c);
  return c;
}
const send = (c, o) => c.ws.send(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = () => clients[0];
const phase = () => host().state?.phase;
async function waitPhase(p, timeout = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (phase() === p) return; await sleep(100); }
  throw new Error(`phase ${p} not reached (now ${phase()})`);
}

async function main() {
  mk(NAMES[0]);
  await sleep(400);
  for (let i = 1; i < NAMES.length; i++) { mk(NAMES[i]); await sleep(200); }
  await sleep(500);
  console.log("players:", host().state.players.map((p) => p.name).join(", "));

  send(host(), { t: "config", settings: { memorySec: 10, discussionSec: 30, impostorFactCount: 2 } });
  await sleep(300);
  send(host(), { t: "start" });

  await waitPhase("memory");
  for (const c of clients) console.log(`  [${c.name}] role=${c.state.role} word=${c.state.brief?.word} facts=${c.state.brief?.facts.length}`);
  const impostor = clients.find((c) => c.state.role === "impostor");
  console.log("impostor:", impostor.name);

  await waitPhase("speaking");
  console.log("speaking...");
  for (let g = 0; g < 40 && phase() === "speaking"; g++) {
    const sp = host().state.speaking;
    const cur = clients.find((c) => c.state.you === sp.order[sp.index % sp.order.length]);
    send(cur, { t: "advance" });
    await sleep(120);
  }

  await waitPhase("discussion");
  console.log("discussion...");
  await waitPhase("voting");
  console.log("voting...");
  const impId = impostor.state.you;
  for (const c of clients) {
    const target = c === impostor
      ? clients.find((x) => x !== impostor).state.you
      : c.name === "きい"
        ? clients.find((x) => x !== impostor && x !== c).state.you
        : impId;
    send(c, { t: "vote", target });
    await sleep(100);
  }

  await waitPhase("audit");
  const rv = host().state.reveal;
  console.log(`reveal: caught=${rv.caught} misvoters=${rv.misvoters.map((id) => host().state.players.find((p) => p.id === id)?.name)}`);
  const a = host().state.audit;
  for (const c of clients) { if (c.state.role === "expert") send(c, { t: "recall", text: `${c.name}の記憶` }); await sleep(60); }
  const judge = clients.find((c) => c.state.you === a.judgeId);
  a.expertIds.forEach((id, i) => send(judge, { t: "judge", player: id, verdict: i === 0 ? "fool" : "pass" }));
  await sleep(300);
  if (host().state.audit.geniusId) {
    const genius = clients.find((c) => c.state.you === host().state.audit.geniusId);
    send(genius, { t: "accuse", player: host().state.audit.expertIds[0] });
    await sleep(200);
  }
  send(host(), { t: "finishAudit" });

  await waitPhase("scoreboard");
  const sb = host().state.scoreboard;
  console.log("SCORE:");
  for (const p of host().state.players) console.log(`  ${p.name}: ${p.score} (Δ${sb.deltas[p.id] ?? 0})`);
  sb.log.forEach((l) => console.log("  " + l));

  send(host(), { t: "nextRound" });
  await waitPhase("lobby");
  console.log("\n✅ full round smoke test passed");
  clients.forEach((c) => c.ws.close());
  process.exit(0);
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
