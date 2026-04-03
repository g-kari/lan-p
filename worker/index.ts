import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  CLIPS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
};

export interface ClipEntry {
  id: string;
  type: "text" | "image" | "file";
  text?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  createdAt: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const KV_TTL = 3600; // 1時間（安全網）

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", cors());

// クリップ一覧取得
app.get("/api/clips", async (c) => {
  const list = await c.env.CLIPS_KV.list({ prefix: "clip:", limit: 50 });
  const clips: ClipEntry[] = [];

  for (const key of list.keys) {
    const value = await c.env.CLIPS_KV.get(key.name, "json");
    if (value) clips.push(value as ClipEntry);
  }

  clips.sort((a, b) => b.createdAt - a.createdAt);
  return c.json({ clips });
});

// テキストクリップ作成
app.post("/api/clips", async (c) => {
  const body = await c.req.json<{ text: string }>();
  if (!body.text?.trim()) {
    return c.json({ error: "Text is required" }, 400);
  }

  const id = crypto.randomUUID();
  const entry: ClipEntry = {
    id,
    type: "text",
    text: body.text.trim(),
    createdAt: Date.now(),
  };

  await c.env.CLIPS_KV.put(`clip:${id}`, JSON.stringify(entry), {
    expirationTtl: KV_TTL,
  });

  return c.json({ clip: entry }, 201);
});

// ファイル/画像アップロード
app.post("/api/clips/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "File is required" }, 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "File too large (max 10MB)" }, 413);
  }

  const id = crypto.randomUUID();
  const mimeType = file.type || "application/octet-stream";
  const isImage = mimeType.startsWith("image/");
  const r2Key = `media/${id}/${file.name}`;

  // R2 にファイルを保存
  await c.env.MEDIA_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: mimeType },
  });

  const entry: ClipEntry = {
    id,
    type: isImage ? "image" : "file",
    fileName: file.name,
    mimeType,
    fileSize: file.size,
    createdAt: Date.now(),
  };

  await c.env.CLIPS_KV.put(`clip:${id}`, JSON.stringify(entry), {
    expirationTtl: KV_TTL,
  });

  return c.json({ clip: entry }, 201);
});

// メディアファイル取得
app.get("/api/media/:id", async (c) => {
  const id = c.req.param("id");
  const meta = await c.env.CLIPS_KV.get(`clip:${id}`, "json") as ClipEntry | null;

  if (!meta || !meta.fileName) {
    return c.json({ error: "Not found" }, 404);
  }

  const r2Key = `media/${id}/${meta.fileName}`;
  const object = await c.env.MEDIA_BUCKET.get(r2Key);

  if (!object) {
    return c.json({ error: "Media not found" }, 404);
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": meta.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${meta.fileName}"`,
    },
  });
});

// コピー/ダウンロード完了 → 即時削除
app.post("/api/clips/:id/claim", async (c) => {
  const id = c.req.param("id");
  await deleteClip(c.env, id);
  return c.json({ ok: true });
});

// 手動削除
app.delete("/api/clips/:id", async (c) => {
  const id = c.req.param("id");
  await deleteClip(c.env, id);
  return c.json({ ok: true });
});

async function deleteClip(env: Bindings, id: string): Promise<void> {
  const meta = await env.CLIPS_KV.get(`clip:${id}`, "json") as ClipEntry | null;

  // KV から削除
  await env.CLIPS_KV.delete(`clip:${id}`);

  // R2 からも削除（メディアの場合）
  if (meta?.fileName) {
    const r2Key = `media/${id}/${meta.fileName}`;
    await env.MEDIA_BUCKET.delete(r2Key);
  }
}

export default app;
