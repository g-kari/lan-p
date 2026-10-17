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

既存ツールチェーンの Node.js 要件（`^20.19.0 || >=22.12.0`）を使用します。
pnpm は `package.json` の `packageManager` に指定した **10.32.1** に固定しています。
初回は [pnpm の公式手順](https://pnpm.io/10.x/installation)で同じ版を導入してください。

```bash
npm install --global pnpm@10.32.1
pnpm --version
```

依存のインストールと開発サーバーの起動:

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

検証とビルド:

```bash
pnpm run typecheck
pnpm run check
pnpm test --run
pnpm run build
```

`check` は整形と lint、`typecheck` はフロントエンドと Worker の型を検証します。
GitHub Actions でも Node.js 22.16.0（既存 Cloudflare ビルドで使用した版）で
frozen install とこれらの検証を実行します。
単体テストはメモリ内の KV / R2 を使い、Cloudflare の実リソースへ接続しません。
ビルドでは従来どおり `vp build` を使い、`dist/client/` と `dist/lan_p/` を生成します。

依存を変更する場合は `pnpm add` / `pnpm update` を使い、`package.json` と
`pnpm-lock.yaml` を一緒にコミットします。CI や再現用インストールでは
`--frozen-lockfile` を使用します。ネイティブ依存の install script は
`pnpm-workspace.yaml` に列挙した既存ツールチェーンの3件だけを許可しています。

## デプロイ

GitHubリポジトリをCloudflareに接続することで、`main`ブランチへのpushで自動デプロイされます。

詳細は [CLAUDE.md](./CLAUDE.md) を参照してください。
