# 天才を装うゲーム（仮）

「知ったかぶりで天才のフリを続ける」オンライン対戦の正体隠匿ゲーム（パーティーゲーム）。
ルールの全文は [GAME_SPEC.md](GAME_SPEC.md)。

---

## テストプレイ（このPCをサーバーにする）

必要: Node.js 20 以上。音声は Discord など別で用意（このアプリは進行と情報配布だけ）。

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
URLは起動ごとに変わる。（`cloudflared` の初回はバイナリDLで少し待つ）

**B. どこかにデプロイ（URL固定・PCを閉じてOK）**
このサーバはそのままデプロイできる（`npm start` で起動、`PORT` 環境変数を読む、ビルド不要）。
Render / Railway / Fly.io など Node が動く無料枠で:
- Build command: `npm install`
- Start command: `npm start`
- お題バンク（`topics/bank/`）はリポジトリに入っているので追加設定不要

ブラウザで開く → 名前を入れて「新しい部屋を作る」→ 出た部屋コードを全員に伝える → 各自コードで参加 →
ホストが「開始」。3人から可（推奨5〜6人）。

### 遊びの流れ

記憶（お題＋8事実を暗記／潜入者は数個だけ）→ 発言2周 → 自由議論 → 全員投票 → 監査（答え合わせ＋バカ判定）→ スコア → 次の試合

進行の細部は [GAME_SPEC.md](GAME_SPEC.md)。配点は仮（[server/scoring.ts](server/scoring.ts) で調整）。

動作確認: 別ターミナルでサーバを起動して `node scripts/smoketest.mjs 3000`

---

## 中身

| 場所 | 役割 |
|---|---|
| [server/](server/) | WebSocketゲームサーバ。部屋・フェーズ状態機械・役割配布・タイマー・投票・監査・採点 |
| [public/](public/) | ブラウザクライアント（素のHTML/JS、ビルド不要） |
| [topics/bank/](topics/bank/) | お題バンク（ワード＋8事実）。本番はここから配るだけ、ランタイムで LLM は呼ばない |
| [src/schema/topic.ts](src/schema/topic.ts) | お題の型（Zod） |
| [src/game/impostorFacts.ts](src/game/impostorFacts.ts) | 潜入者に渡す事実を選ぶ（枚数 0〜3、標準2＝表層1＋具体1） |
| [src/validation/](src/validation/) | お題の構造チェック（コード）＋内容チェック（LLM、開発時のみ） |
| [src/generation/](src/generation/) + [src/pipeline.ts](src/pipeline.ts) | お題生成AI（開発時の著作ツール） |

## お題バンク

`topics/bank/` に vetted なお題。テスト用の初期8件（エッフェル塔 / 万里の長城 / ギザの大ピラミッド /
ナポレオン / 寿司 / ブラックホール / オーロラ / ドードー）。各お題 = 表層2〜3 / 具体3〜4 / 意外1〜2 の8事実。

```bash
npm run demo        # APIキー不要。バンク全お題の構造チェック
npm test            # ユニットテスト
npm run typecheck

# お題を追加（要 ANTHROPIC_API_KEY を .env に）
npm run gen         # 生成 → 検証。合格すると topics/out/ に下書き。確認して topics/bank/ へ
```
