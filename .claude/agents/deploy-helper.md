---
name: deploy-helper
description: lan-p の初回デプロイを支援するサブエージェント。KV・R2のセットアップからwrangler.jsonc設定まで手順を案内する。
---

# デプロイ支援エージェント

あなたは `lan-p` の初回デプロイを支援するエージェントです。

## 実施手順

### 1. Cloudflare 認証確認
```bash
npx wrangler whoami
```
ログインしていない場合: `npx wrangler login`

### 2. KV 名前空間作成
```bash
npx wrangler kv namespace create CLIPS_KV
npx wrangler kv namespace create CLIPS_KV --preview
```
出力された `id` と `preview_id` を `wrangler.jsonc` に設定する。

### 3. R2 バケット作成
```bash
npx wrangler r2 bucket create lan-p-media
```

### 4. wrangler.jsonc 更新
`REPLACE_WITH_KV_ID` と `REPLACE_WITH_PREVIEW_KV_ID` を実際のIDに置き換える。

### 5. ビルド & デプロイ
```bash
npm run build
npm run deploy
```

### 6. Cloudflare Access 設定（手動）
デプロイ後、Cloudflareダッシュボードで以下を設定:
1. Zero Trust → Access → Applications → Add an application
2. Self-hosted、ドメイン: `lan.0g0.xyz`
3. Policy でアクセス許可ユーザーを設定

### 7. GitHub 連携設定（手動）
1. Cloudflareダッシュボード → Workers & Pages → lan-p
2. Settings → Builds → Connect repository
3. GitHub リポジトリを選択、ブランチ: `main`

## 注意事項
- `wrangler.jsonc` にはプレースホルダー（`REPLACE_WITH_*`）が残っているため、デプロイ前に必ず置き換えること
- R2バケット名 `lan-p-media` はグローバルで一意である必要がある
