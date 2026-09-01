"use strict";

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const roomcodeEl = document.getElementById("roomcode");

let ws = null;
let state = null;
let me = null; // { name }

// ---- utils ----
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "onclick") e.onclick = v;
    else if (k === "html") e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
let toastT;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove("show"), 2600);
}
function nameOf(id) {
  const p = (state?.players || []).find((x) => x.id === id);
  return p ? p.name : "?";
}
const isHost = () => state && state.you === state.hostId;
const meP = () => (state?.players || []).find((p) => p.id === state.you);

// ---- connection ----
function connect(name, code) {
  me = { name };
  localStorage.setItem("tb_name", name);
  if (code) localStorage.setItem("tb_code", code);
  else localStorage.removeItem("tb_code");

  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
  ws.onopen = () => send({ t: "join", name, code: code || undefined });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === "error") {
      toast(msg.msg);
      if (!state) renderJoin();
      return;
    }
    if (msg.t === "state") {
      state = msg;
      if (msg.notice) toast(msg.notice);
      localStorage.setItem("tb_code", msg.code);
      render();
    }
  };
  ws.onclose = () => {
    toast("接続が切れました。再接続します…");
    setTimeout(() => connect(me.name, localStorage.getItem("tb_code") || ""), 1500);
  };
}

// ---- timer ----
let timerInt;
function startTimerTick() {
  clearInterval(timerInt);
  timerInt = setInterval(() => {
    const els = document.querySelectorAll("[data-deadline]");
    els.forEach((e) => {
      const left = Math.max(0, Math.ceil((+e.dataset.deadline - Date.now()) / 1000));
      e.textContent = left + "秒";
    });
  }, 250);
}

// ---- screens ----
function renderJoin() {
  roomcodeEl.textContent = "";
  const name = h("input", { id: "j-name", placeholder: "名前", value: localStorage.getItem("tb_name") || "", maxlength: 20 });
  const code = h("input", { id: "j-code", placeholder: "部屋コード（参加する場合）", value: "", maxlength: 4, style: "text-transform:uppercase" });
  app.replaceChildren(
    h("div", { class: "panel" },
      h("h2", {}, "はじめる"),
      h("label", {}, "名前"), name,
      h("label", {}, "部屋コード"), code,
      h("div", { class: "row", style: "margin-top:14px" },
        h("button", { class: "primary", onclick: () => {
          const n = name.value.trim(); if (!n) return toast("名前を入れてください");
          connect(n, code.value.trim().toUpperCase());
        } }, code.value.trim() ? "参加" : "新しい部屋を作る"),
      ),
      h("p", { class: "hint", style: "margin-top:12px" }, "ボイスは Discord など別で繋いでください。このアプリは進行と情報配布だけ担当します。"),
    ),
  );
  code.oninput = () => {
    app.querySelector("button.primary").textContent = code.value.trim() ? "参加" : "新しい部屋を作る";
  };
}

function render() {
  roomcodeEl.textContent = state.code || "";
  startTimerTick();
  const fn = ({
    lobby: renderLobby, memory: renderMemory, speaking: renderSpeaking,
    discussion: renderDiscussion, voting: renderVoting, wordGuess: renderWordGuess,
    scoreboard: renderScoreboard,
  })[state.phase] || renderLobby;
  fn();
}

function playerList(extra) {
  return h("ul", { class: "plist" }, state.players.map((p) =>
    h("li", { class: p.connected ? "" : "off" },
      h("span", {}, p.name, p.id === state.hostId ? h("span", { class: "tag" }, " ホスト") : null, p.id === state.you ? h("span", { class: "tag" }, " (あなた)") : null),
      h("span", { class: "tag" }, extra ? extra(p) : (p.connected ? "" : "切断")),
    ),
  ));
}

function renderLobby() {
  const s = state.settings;
  const host = isHost();
  const num = (id, val, min, max, step) => h("input", { id, type: "number", value: val, min, max, step: step || 1, disabled: !host });
  app.replaceChildren(
    h("div", { class: "panel" },
      h("h2", {}, "ロビー"),
      h("p", {}, "部屋コード ", h("span", { class: "mono", style: "color:var(--accent);font-size:1.2rem" }, state.code), " を友達に伝えてください。"),
      playerList((p) => "得点 " + p.score),
    ),
    h("div", { class: "panel" },
      h("h3", {}, "設定" + (host ? "" : "（ホストのみ変更可）")),
      h("label", {}, "記憶時間（秒）"), num("st-mem", s.memorySec, 10, 180),
      h("label", {}, "自由議論（秒）"), num("st-dis", s.discussionSec, 30, 900, 30),
      h("label", {}, "潜入者に渡す事実の枚数（0〜3）"), num("st-imp", s.impostorFactCount, 0, 3),
      host ? h("div", { class: "row", style: "margin-top:12px" },
        h("button", { class: "sm", onclick: () => send({ t: "config", settings: {
          memorySec: +document.getElementById("st-mem").value,
          discussionSec: +document.getElementById("st-dis").value,
          impostorFactCount: +document.getElementById("st-imp").value,
        } }) }, "設定を保存"),
      ) : null,
    ),
    host ? h("div", { class: "row end" },
      h("button", { class: "primary", onclick: () => send({ t: "start" }) }, "この面子で開始"),
    ) : h("p", { class: "hint" }, "ホストの開始を待っています…"),
  );
}

function renderMemory() {
  const b = state.brief || { facts: [] };
  const imp = state.role === "impostor";
  app.replaceChildren(
    h("div", { class: "panel" },
      h("div", { class: "row", style: "justify-content:space-between" },
        h("span", { class: "role-badge " + (imp ? "role-impostor" : "role-expert") }, imp ? "潜入者" : "専門家"),
        h("span", { class: "big-timer", "data-deadline": state.deadline }, "…"),
      ),
      imp
        ? h("h2", { style: "margin-top:10px" }, "お題：" + (state.topicWord || b.word || "?"))
        : h("h2", { style: "margin-top:10px" }, "お題：？（あなたは知らされません）"),
      imp && b.neutralGloss ? h("p", { class: "hint" }, b.neutralGloss) : null,
      imp
        ? h("p", {}, "あなたはこの単語を知っています。手元の事実は下の" + b.facts.length + "個だけ。バレないように話を合わせてください。")
        : h("p", {}, "単語は伏せられています。下の" + b.facts.length + "個の情報から「何のお題か」を推測して覚えてください。時間が来たら消えます。"),
      b.facts.map((f) => h("div", { class: "fact" },
        !imp ? h("div", { class: "t" }, ({ surface: "表層", specific: "具体", surprising: "意外" })[f.tier] + " ／ g" + f.guessability) : null,
        f.text,
      )),
    ),
    h("p", { class: "hint" }, "時間切れで自動的に発言フェーズへ進みます。"),
  );
}

function renderSpeaking() {
  const sp = state.speaking;
  const curId = sp.order[sp.index % sp.order.length];
  const myTurn = curId === state.you;
  const rows = sp.order.map((id, i) => {
    const spokenR1 = sp.index > i;
    const spokenR2 = sp.index > i + sp.order.length;
    const now = id === curId;
    return h("div", { class: "turn " + (now ? "now" : (spokenR1 && (sp.round === 1 || spokenR2) ? "done" : "")) },
      h("span", {}, (i + 1) + ". " + nameOf(id)),
      h("span", { class: "tag" }, now ? "発言中" : ""),
    );
  });
  app.replaceChildren(
    h("div", { class: "panel" },
      h("h2", {}, (sp.round) + "周目 / 2"),
      state.topicWord
        ? h("p", {}, "お題：", h("strong", {}, state.topicWord), h("span", { class: "hint" }, "（潜入者のあなただけが知っています）"))
        : h("p", { class: "hint" }, "お題の単語は分かりません。情報から推測して話してください。"),
      h("p", { class: "hint" }, "詳細情報はもう見られません。自分の番になったらお題について1つだけ話す。質問・追及は次の自由議論で。"),
      rows,
    ),
    h("div", { class: "row end" },
      myTurn ? h("button", { class: "primary", onclick: () => send({ t: "advance" }) }, "話し終えた（次へ）") : null,
      isHost() && !myTurn ? h("button", { class: "sm", onclick: () => send({ t: "advance" }) }, "次へ（ホスト）") : null,
    ),
    myTurn ? h("p", { class: "banner good" }, "あなたの番です") : null,
  );
}

function renderDiscussion() {
  app.replaceChildren(
    h("div", { class: "panel" },
      h("h2", {}, "自由議論"),
      h("div", { class: "big-timer", "data-deadline": state.deadline }, "…"),
      h("p", { class: "hint", style: "margin-top:8px" }, "声で自由に質問・追及。時間切れ、またはホストの操作で投票へ。"),
    ),
    isHost() ? h("div", { class: "row end" }, h("button", { class: "primary", onclick: () => send({ t: "toVote" }) }, "投票へ")) : null,
  );
}

function renderVoting() {
  const v = state.voting;
  app.replaceChildren(
    h("div", { class: "panel" },
      h("h2", {}, "投票：潜入者だと思う人を1人"),
      h("p", { class: "hint" }, "全員が入れたら結果を公開。潜入者以外を指すと誤認（称号のみ・減点なし）。"),
      state.players.filter((p) => p.id !== state.you).map((p) =>
        h("button", { class: "pick" + (v.yourVote === p.id ? " sel" : ""), onclick: () => send({ t: "vote", target: p.id }) },
          p.name + (v.voted.includes(p.id) ? "  ✔投票済" : ""),
        ),
      ),
    ),
    h("p", { class: "hint" }, v.voted.length + " / " + state.players.filter((p) => p.connected).length + " 人が投票"),
  );
}

function renderWordGuess() {
  const wg = state.wordGuess, r = state.reveal;
  const amGenius = state.you === wg.geniusId;
  const amExpert = state.role === "expert";
  const impNames = r.impostorIds.map(nameOf).join("、");
  const myGuess = wg.guesses[state.you] || "";

  app.replaceChildren(
    h("div", { class: "banner bad" }, "潜入者 " + impNames + " は逃げ切った（天才）"),
    r.misvoters.length ? h("p", { class: "hint" }, "誤認：" + r.misvoters.map(nameOf).join("、")) : null,

    h("div", { class: "panel" },
      h("h3", {}, "敗者復活：単語当て"),
      h("p", { class: "hint" }, "お題の単語を当てれば「秀才」。外すと「知ったかぶりバカ」（減点）。正誤はシステムが自動判定します。"),
    ),

    amExpert ? h("div", { class: "panel" },
      h("h3", {}, "あなたの回答"),
      h("input", { id: "wg", type: "text", maxlength: 60, value: myGuess, placeholder: "お題だと思う単語" }),
      h("div", { class: "row end", style: "margin-top:8px" },
        h("button", { class: "sm", onclick: () => send({ t: "wordGuess", text: document.getElementById("wg").value }) }, "提出"),
      ),
    ) : null,

    amGenius ? h("div", { class: "panel" },
      h("h3", {}, "あなたは天才"),
      h("p", { class: "hint" }, "正誤の判定はシステムが自動で行います。全員の回答が出そろったら宣告してください。「頭のいいあなたなら分かりますよね？」"),
      h("div", { class: "row end" },
        h("button", { class: "sm" + (wg.announced ? " sel" : ""), onclick: () => send({ t: "announceWordGuess" }) },
          wg.announced ? "宣告済み" : "結果を宣告する"),
      ),
    ) : null,

    h("div", { class: "panel" },
      h("h3", {}, "専門家の回答"),
      wg.expertIds.map((id) => {
        const g = wg.guesses[id];
        const v = wg.verdicts[id];
        const label = v === true ? "秀才" : v === false ? "知ったかぶりバカ" : "天才の発表待ち";
        return h("div", { style: "margin-bottom:10px" },
          h("div", { class: "row", style: "justify-content:space-between" },
            h("strong", {}, nameOf(id)),
            h("span", { class: "tag" }, g == null ? "未提出" : label),
          ),
          h("p", { class: "hint" }, g == null ? "（未提出）" : "「" + g + "」"),
        );
      }),
    ),

    isHost() ? h("div", { class: "row end" },
      h("button", { class: "primary", onclick: () => send({ t: "finishWordGuess" }) }, "締めて結果へ"),
    ) : h("p", { class: "hint" }, "ホストの操作を待っています…"),
  );
}

const TITLE_LABEL = { genius: "天才", prodigy: "秀才", "know-it-all-fool": "知ったかぶりバカ", misread: "誤認" };

function renderScoreboard() {
  const sb = state.scoreboard;
  const r = state.reveal;
  const titles = sb.titles || {};
  const sorted = [...state.players].sort((x, y) => y.score - x.score);
  const impNames = r ? r.impostorIds.map(nameOf).join("、") : "";
  app.replaceChildren(
    r ? h("div", { class: "banner " + (r.caught ? "good" : "bad") },
      r.caught ? "潜入者 " + impNames + " を特定！" : "潜入者 " + impNames + " は逃げ切った（天才）",
    ) : null,
    state.topicWord ? h("p", { class: "hint" }, "お題は「" + state.topicWord + "」でした。") : null,
    h("div", { class: "panel" },
      h("h2", {}, "スコア"),
      h("ul", { class: "plist" }, sorted.map((p) => {
        const d = sb.deltas[p.id] || 0;
        const t = titles[p.id];
        return h("li", {},
          h("span", {}, p.name, t ? h("span", { class: "tag" }, " " + (TITLE_LABEL[t] || t)) : null),
          h("span", {}, h("span", { class: "delta " + (d >= 0 ? "pos" : "neg") }, (d >= 0 ? "+" : "") + d), "  ", h("strong", {}, p.score)),
        );
      })),
    ),
    h("div", { class: "panel log" },
      h("h3", {}, "内訳"),
      sb.log.length ? sb.log.map((l) => h("div", {}, l)) : h("div", {}, "増減なし"),
    ),
    isHost() ? h("div", { class: "row end" }, h("button", { class: "primary", onclick: () => send({ t: "nextRound" }) }, "次の試合へ")) : h("p", { class: "hint" }, "ホストの操作待ち…"),
  );
}

// ---- boot ----
if (localStorage.getItem("tb_name") && localStorage.getItem("tb_code")) {
  connect(localStorage.getItem("tb_name"), localStorage.getItem("tb_code"));
  app.replaceChildren(h("p", { class: "hint" }, "接続中…"));
} else {
  renderJoin();
}
