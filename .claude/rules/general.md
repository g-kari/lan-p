# Claude Code 作業ルール

## このプロジェクトでの作業方針

### データ安全性

- クリップデータは**即時破棄**が原則。コピー/DL後に `POST /api/clips/:id/claim` で即削除する動作を絶対に変えないこと
- KVのTTLは1時間。これを延ばす変更は行わないこと
- R2に不要なファイルが残留しないよう、KV削除時は必ずR2も連動削除すること

### 構造上の制約

- `index.html` はプロジェクトルートに必ず置くこと（`@cloudflare/vite-plugin` の要件）
- `src/` ディレクトリにはフロントエンドのTS/CSSのみ置くこと
- `worker/` ディレクトリにはWorkersランタイムで動くコードのみ置くこと
- フロントエンドコードでは `@cloudflare/workers-types` をインポートしないこと（DOM型と競合する）

### API設計

- すべてのAPIエンドポイントは `/api/` プレフィックスを持つこと（Workersの `run_worker_first` 設定のため）
- ファイルサイズ制限は10MB。これを引き上げる場合はWorkers無料プランの制限（100MB）を確認すること

### ビルド

- ビルドには必ず `npm run build`（= `vp build`）を使うこと
- ビルド成功時は `dist/client/`（SPA）と `dist/lan_p/`（Worker）の両方が生成される

### デプロイ

- `wrangler.jsonc` の `REPLACE_WITH_KV_ID` は初回デプロイ前に実際のIDに置き換えること
- デプロイは `main` ブランチへのpushで自動実行（Cloudflare Git連携）
- 手動デプロイが必要な場合: `npm run deploy`
