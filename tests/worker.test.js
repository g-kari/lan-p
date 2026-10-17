import { describe, expect, it, vi } from "vite-plus/test";
import app from "../worker/index.ts";

function bindings() {
  const entries = new Map();
  return {
    CLIPS_KV: {
      get: vi.fn(async (key) => entries.get(key) ?? null),
      put: vi.fn(async (key, value) => entries.set(key, JSON.parse(value))),
      delete: vi.fn(async (key) => entries.delete(key)),
      list: vi.fn(async () => ({ keys: [...entries.keys()].map((name) => ({ name })) })),
    },
    MEDIA_BUCKET: { delete: vi.fn(async () => {}) },
  };
}

describe("clipboard API with in-memory bindings", () => {
  it("creates a trimmed text clip with a one-hour TTL and returns it in the list", async () => {
    const env = bindings();
    const response = await app.request(
      "/api/clips",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "  hello  " }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const { clip } = await response.json();
    expect(clip.text).toBe("hello");
    expect(env.CLIPS_KV.put).toHaveBeenCalledWith(`clip:${clip.id}`, JSON.stringify(clip), {
      expirationTtl: 3600,
    });
    const listed = await app.request("/api/clips", {}, env);
    expect(await listed.json()).toEqual({ clips: [clip] });
  });

  it("rejects empty text without storing a clip", async () => {
    const env = bindings();
    const response = await app.request(
      "/api/clips",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "  " }),
      },
      env,
    );
    expect(response.status).toBe(400);
    expect(env.CLIPS_KV.put).not.toHaveBeenCalled();
  });

  it.each(["claim", "delete"])(
    "%s removes both metadata and the associated file",
    async (action) => {
      const env = bindings();
      await env.CLIPS_KV.put(
        "clip:example",
        JSON.stringify({ id: "example", type: "file", fileName: "example.txt" }),
      );
      const path = action === "claim" ? "/api/clips/example/claim" : "/api/clips/example";
      const response = await app.request(
        path,
        { method: action === "claim" ? "POST" : "DELETE" },
        env,
      );
      expect(response.status).toBe(200);
      expect(env.CLIPS_KV.delete).toHaveBeenCalledWith("clip:example");
      expect(env.MEDIA_BUCKET.delete).toHaveBeenCalledWith("media/example/example.txt");
      expect(await env.CLIPS_KV.get("clip:example")).toBeNull();
    },
  );
});
