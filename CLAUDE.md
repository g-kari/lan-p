# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code への指針を提供します。

## プロジェクト概要

**lan-p** は、同一LAN内のスマホ↔PC間でテキスト・画像・ファイルを共有するクリップボードWebアプリです。

- **デプロイ先**: Cloudflare Workers
- **ドメイン**: lan.0g0.xyz
- **アクセス制限**: Cloudflare Access（Zero Trust）

## 技術スタック

| 役割 | 技術 |
|------|------|
| APIフレームワーク | Hono |
| フロントエンド | Vanilla TypeScript SPA |
| ビルドツール | vite-plus (`vp`) + `@cloudflare/vite-plugin` |
| メタデータDB | Cloudflare KV（TTL: 1時間） |
| ファイルストレージ | Cloudflare R2 |
| 認証 | Cloudflare Access（ダッシュボード設定のみ） |

## プロジェクト構造

```
lan-p/
├── index.html               # SPAエントリHTML（プロジェクトルート必須）
├── vite.config.ts           # Vite + @cloudflare/vite-plugin 設定
├── wrangler.jsonc           # Worker設定（KV・R2バインディング・カスタムドメイン）
├── package.json
├── tsconfig.json            # プロジェクト参照（appとworkerを分離）
├── tsconfig.app.json        # フロントエンド用TS設定
├── tsconfig.worker.json     # Worker用TS設定（@cloudflare/workers-types使用）
├── worker/
│   └── index.ts             # Hono API実装
└── src/
    ├── main.ts              # フロントエンドエントリ
    ├── clipboard.ts         # APIクライアント
    ├── qr.ts                # QRコード生成
    └── style.css            # スタイル
```

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev        # vp dev（Vite + Cloudflare Workers ローカル実行）

# ビルド
npm run build      # vp build → dist/client/ + dist/lan_p/

# デプロイ
npm run deploy     # wrangler deploy
```

## データ設計

### データ方針: 即時破棄

クリップはコピー/ダウンロード時に **サーバーから即座に削除** されます。
KVのTTL（1時間）は誰にもコピーされなかった場合の安全網です。

### KVキー設計

```
clip:<uuid>  →  ClipEntry (JSON, TTL: 3600秒)
```

### R2キー設計

```
media/<uuid>/<filename>  →  バイナリデータ
```

## API エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/clips` | クリップ一覧（最大50件、新しい順） |
| POST | `/api/clips` | テキストクリップ作成 |
| POST | `/api/clips/upload` | ファイル/画像アップロード（最大10MB） |
| GET | `/api/media/:id` | R2からファイル取得 |
| POST | `/api/clips/:id/claim` | コピー完了→即時削除 |
| DELETE | `/api/clips/:id` | 手動削除 |

## 初回デプロイ手順

```bash
# 1. KV名前空間作成
npx wrangler kv namespace create CLIPS_KV
npx wrangler kv namespace create CLIPS_KV --preview

# 2. R2バケット作成
npx wrangler r2 bucket create lan-p-media

# 3. wrangler.jsonc の REPLACE_WITH_KV_ID を実際のIDに置き換える

# 4. ビルド & デプロイ
npm run build && npm run deploy
```

## Cloudflare Access 設定（デプロイ後）

1. Cloudflare ダッシュボード → Zero Trust → Access → Applications
2. 「Add an application」→ Self-hosted
3. ドメイン: `lan.0g0.xyz`
4. Policy で許可するメールアドレスまたはIPレンジを設定

## 注意事項

- `index.html` はプロジェクトルートに置くこと（`@cloudflare/vite-plugin` の要件）
- Worker側の型は `@cloudflare/workers-types` を使用（`tsconfig.worker.json` 参照）
- フロントエンド側ではDOM型を使用（`tsconfig.app.json` 参照）
- ビルド後のアセット: `dist/client/`（SPA）、`dist/lan_p/`（Worker）
