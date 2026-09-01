# 天才を装うゲーム（仮）

「知ったかぶりで天才のフリを続ける」オンライン対戦の正体隠匿ゲーム（パーティーゲーム）。
ルールの全文は [GAME_SPEC.md](GAME_SPEC.md)。

会話はアプリ外（通話や対面）。このアプリは進行・情報配布・投票・採点だけを担当する。
プレイ中に外部サービスは呼ばない。

---

## テストプレイ（このPCをサーバーにする）

必要: Node.js 20 以上。

```bash
npm install
npm run serve
```

起動すると接続先が表示される:

- **同じWi-Fiの友達** → 表示される `http://192.168.x.x:3000` をそのまま共有
- **離れた友達（オンライン）** → 下記いずれか

### オンラインで遊ぶ

**A. トンネル（一番早い・無料・アカウント不要）**
`npm run serve` を動かしたまま、別ターミナルで:
```
npx cloudflared tunnel --url http://localhost:3000
```
出てくる `https://xxxx.trycloudflare.com` を友達に共有。このPCを起動している間だけ有効。
URLは起動ごとに変わる。（初回はバイナリDLで少し待つ）

**B. どこかにデプロイ（URL固定・PCを閉じてOK）**
`npm start` で起動、`PORT` 環境変数を読む、ビルド不要。Render / Railway / Fly.io などの Node 無料枠で:
- Build command: `npm install`
- Start command: `npm start`
- お題バンク（`topics/bank/`）はリポジトリ同梱なので追加設定不要

### 遊び方

ブラウザで開く → 名前入力 →「新しい部屋を作る」→ 出た部屋コードを全員に伝える → 各自コードで参加 →
ホストが設定（記憶秒数・議論秒数・潜入者の枚数）して「開始」。3人から可（推奨5〜6人）。

流れ: 記憶（専門家は8事実だけ・お題の単語は知らされない／潜入者は単語＋数個の事実）→ 発言2周 →
自由議論 → 全員投票（潜入者の票は集計から除外）→ ［取り逃したら］単語当て（天才が正誤裁定）→
スコア → 次の試合。個人戦、配点は仮（[server/scoring.ts](server/scoring.ts) で調整）。

動作確認: 別ターミナルでサーバを起動して `node scripts/smoketest.mjs 3000`

---

## 中身

| 場所 | 役割 |
|---|---|
| [server/](server/) | WebSocketゲームサーバ。部屋・フェーズ状態機械・役割配布・タイマー・投票・単語当て・採点 |
| [public/](public/) | ブラウザクライアント（素のHTML/JS、ビルド不要） |
| [topics/bank/](topics/bank/) | お題バンク（ワード＋8事実）。サーバはここから配るだけ |
| [topics/TEMPLATES.md](topics/TEMPLATES.md) | ジャンル別のお題テンプレート（単語の伏せ方・型） |
| [src/schema/topic.ts](src/schema/topic.ts) | お題の型（Zod） |
| [src/game/impostorFacts.ts](src/game/impostorFacts.ts) | 潜入者に渡す事実を選ぶ（枚数 0〜3、標準2＝表層1＋具体1） |
| [src/validation/checkStructure.ts](src/validation/checkStructure.ts) | 手作りお題の構造チェック（階層配分・guessability・重複） |
| [src/store/topicStore.ts](src/store/topicStore.ts) | バンクの読み込み・ランダム配布 |

## お題バンク

`topics/bank/` に手作りのお題。テスト用の初期8件（エッフェル塔 / 万里の長城 / ギザの大ピラミッド /
ナポレオン / 寿司 / ブラックホール / オーロラ / ドードー）。各お題 = 表層2〜3 / 具体3〜4 / 意外1〜2 の8事実。
**8事実には単語を書かない**（専門家は単語を伏せられ、8事実から推測する）。書き方は [topics/TEMPLATES.md](topics/TEMPLATES.md)。

```bash
npm run demo        # バンク全お題の構造チェック
npm test            # ユニットテスト
npm run typecheck
```

お題を足すときは `topics/bank/` に JSON を1つ追加して `npm run demo` で配分を確認する。
形式は既存の8件を参照（型は [src/schema/topic.ts](src/schema/topic.ts)）。
