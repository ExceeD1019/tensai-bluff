import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { pickRandomTopic } from "../src/store/topicStore.js";
import type { ClientMsg } from "./protocol.js";
import { Room } from "./room.js";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

const rooms = new Map<string, Room>();

function newRoomCode(): string {
  let code: string;
  do {
    code = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

// ---- 静的ファイル ----
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const httpServer = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0]!;
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

// ---- WebSocket ----
const wss = new WebSocketServer({ server: httpServer });

interface Conn {
  ws: WebSocket;
  room?: Room;
  playerId?: string;
}

wss.on("connection", (ws) => {
  const conn: Conn = { ws };
  const send = (msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.on("message", (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (msg.t === "join") {
      const name = String(msg.name ?? "").trim().slice(0, 20) || "名無し";
      let room: Room;
      if (msg.code) {
        const found = rooms.get(msg.code.toUpperCase());
        if (!found) {
          send({ t: "error", msg: "その部屋は存在しません" });
          return;
        }
        room = found;
      } else {
        const code = newRoomCode();
        room = new Room(code, (exclude) => pickRandomTopic(exclude));
        rooms.set(code, room);
      }
      conn.room = room;
      conn.playerId = room.join(name, send);
      return;
    }

    if (conn.room && conn.playerId) conn.room.handle(conn.playerId, msg);
  });

  ws.on("close", () => {
    if (conn.room && conn.playerId) {
      conn.room.leave(conn.playerId);
      if (conn.room.isEmpty) {
        conn.room.dispose();
        rooms.delete(conn.room.code);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => `http://${n!.address}:${PORT}`);
  console.log("天才を装うゲーム — テストサーバ起動\n");
  console.log(`  このPC:      http://localhost:${PORT}`);
  for (const u of lan) console.log(`  同じWi-Fi:   ${u}`);
  console.log(`\n  外部の友達を呼ぶ:  npx cloudflared tunnel --url http://localhost:${PORT}`);
  console.log("  （表示される https://... のURLを共有）\n");
});
