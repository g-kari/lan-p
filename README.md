# lan-p — LAN Clipboard

スマホ↔PC間でテキスト・画像・ファイルを共有するクリップボードWebアプリ。

**URL**: https://lan.0g0.xyz

## 機能

- テキストの即時共有（ペースト→送信）
- 画像の共有（ペースト / ファイル選択 / ドラッグ&ドロップ）
- ファイルの共有（最大10MB）
- **コピー/ダウンロード後にサーバーから即削除**（プライバシー保護）
- 3秒ポーリングによる自動同期
- QRコード表示（PCで表示してスマホで読み取り）
- スマホ最優先のレスポンシブUI

## 技術スタック

- Cloudflare Workers + Hono（API）
- Cloudflare KV（メタデータ、TTL: 1時間）
- Cloudflare R2（ファイルストレージ）
- Cloudflare Access（アクセス制限）
- Vanilla TypeScript + Vite + vite-plus

## 開発

```bash
npm install
npm run dev
```

## デプロイ

GitHubリポジトリをCloudflareに接続することで、`main`ブランチへのpushで自動デプロイされます。

詳細は [CLAUDE.md](./CLAUDE.md) を参照してください。
