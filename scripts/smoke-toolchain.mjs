import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { realpathSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootRequire = createRequire(join(root, "package.json"));
const vpRequire = createRequire(import.meta.resolve("vite-plus"));
const callers = {
  root: rootRequire,
  "vite-plus": vpRequire,
  "@cloudflare/vite-plugin": createRequire(import.meta.resolve("@cloudflare/vite-plugin")),
  vitest: createRequire(vpRequire.resolve("vitest")),
};
const resolved = [];
for (const [caller, require] of Object.entries(callers)) {
  const entry = realpathSync(require.resolve("vite"));
  const vite = await import(pathToFileURL(entry));
  assert.equal(vite.version, "8.3.5", `${caller}: embedded Vite version`);
  for (const api of ["DevEnvironment", "BuildEnvironment", "createRunnableDevEnvironment"]) {
    assert.equal(typeof vite[api], "function", `${caller}: ${api}`);
  }
  resolved.push({ caller, entry, version: vite.version });
}
assert.equal(new Set(resolved.map((item) => item.entry)).size, 1, "one shared Vite core");
console.log(JSON.stringify({ toolchain: resolved }));

const scratch = await mkdtemp(join(tmpdir(), "lan-toolchain-smoke-"));
const project = join(scratch, "project");
const vp = fileURLToPath(new URL("../bin/vp", import.meta.resolve("vite-plus")));
const wrangler = fileURLToPath(import.meta.resolve("wrangler"));
const env = {
  PATH: process.env.PATH,
  HOME: join(scratch, "home"),
  TMPDIR: scratch,
  XDG_CONFIG_HOME: join(scratch, "config"),
  XDG_CACHE_HOME: join(scratch, "cache"),
  XDG_DATA_HOME: join(scratch, "data"),
  XDG_STATE_HOME: join(scratch, "state"),
  WRANGLER_LOG_PATH: join(scratch, "logs"),
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  CLOUDFLARE_CF_FETCH_ENABLED: "false",
  VP_NO_UPDATE_CHECK: "1",
  CI: "1",
  NO_COLOR: "1",
};
const children = new Set();

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: project,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const result = { child, output: "", exited: false };
  children.add(result);
  child.on("error", (error) => {
    result.error = error;
  });
  child.on("exit", (code) => {
    result.exited = true;
    result.code = code;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (data) => {
      result.output += data;
    });
  }
  return result;
}

async function stop(result) {
  const pid = result.child.pid;
  if (pid) {
    // The leader may exit while workerd still owns the process group.
    const target = process.platform === "win32" ? pid : -pid;
    const signal = (name) => {
      try {
        process.kill(target, name);
        return true;
      } catch (error) {
        if (error.code === "ESRCH") return false;
        throw error;
      }
    };
    if (signal("SIGTERM")) {
      const deadline = Date.now() + 5000;
      while (signal(0) && Date.now() < deadline) await delay(50);
      // A surviving group, including descendants of an exited leader, must stop.
      if (signal(0)) signal("SIGKILL");
    }
    const deadline = Date.now() + 5000;
    while (!result.exited && Date.now() < deadline) await delay(50);
    assert.ok(result.exited, `child ${pid} did not exit after termination`);
  }
  children.delete(result);
  assert.doesNotMatch(
    result.output ?? "",
    /\b(?:EPERM|EACCES)\b|authenticate|remote proxy session|Request\.cf|workers\.cloudflare\.com/i,
    "local child logs must not show permission/auth/remote setup or Request.cf network initialization",
  );
}

async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = server.address().port;
  await new Promise((done) => server.close(done));
  return value;
}

async function request(base, path, options = {}, timeout = 5000) {
  const url = new URL(path, base);
  assert.equal(url.origin, base, "all smoke requests stay on the loopback origin");
  return fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(timeout) });
}

async function ready(result, base) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (result.error) throw result.error;
    assert.ok(!result.exited, `server exited (${result.code}): ${result.output}`);
    assert.ok(
      !/\b(?:EPERM|EACCES)\b|authenticate|remote proxy session|Unable to fetch the `Request.cf`/i.test(
        result.output,
      ),
      result.output,
    );
    try {
      const response = await request(
        base,
        "/api/clips",
        {},
        Math.max(1, Math.min(1000, deadline - Date.now())),
      );
      if (response.ok) return;
    } catch {
      // Poll only the server we just started; this never restarts a failed process.
    }
    await delay(250);
  }
  throw new Error(`local server did not become ready: ${result.output}`);
}

async function kvKeys(config, state) {
  const result = start([
    wrangler,
    "kv",
    "key",
    "list",
    "--local",
    "--binding",
    "CLIPS_KV",
    "--config",
    config,
    "--persist-to",
    state,
  ]);
  await Promise.race([
    once(result.child, "exit"),
    delay(30000, undefined, { ref: false }).then(() => {
      throw new Error("local KV inspection timed out");
    }),
  ]);
  assert.equal(result.code, 0, result.output);
  await stop(result);
  return JSON.parse(result.output);
}

async function smoke(base, config, state, label) {
  const home = await request(base, "/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<title>LAN Clipboard<\/title>/);
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:css|[cm]?js|ts)(?:\?[^" ]*)?)"/g)];
  assert.ok(assets.length >= 2, `${label}: scripts and styles`);
  for (const [, asset] of assets) {
    const url = new URL(asset, `${base}/`);
    assert.equal(url.origin, base, `${asset}: asset must stay on the loopback origin`);
    const css = url.pathname.endsWith(".css");
    const response = await request(base, `${url.pathname}${url.search}`, {
      headers: { Accept: css ? "text/css" : "text/javascript" },
    });
    assert.equal(response.status, 200, asset);
    const mime = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    if (css) assert.equal(mime, "text/css", asset);
    else assert.match(mime ?? "", /^(?:text|application)\/(?:javascript|ecmascript)$/, asset);
    const body = await response.text();
    assert.ok(body.length > 20, asset);
    assert.doesNotMatch(body, /^\s*(?:<!doctype html|<html)\b/i, `${asset}: not SPA fallback HTML`);
  }
  const list = async () => {
    const response = await request(base, "/api/clips");
    assert.equal(response.status, 200);
    return (await response.json()).clips;
  };
  assert.deepEqual(await list(), []);
  const createdAt = Math.floor(Date.now() / 1000);
  const created = await request(base, "/api/clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "  synthetic toolchain smoke  " }),
  });
  assert.equal(created.status, 201);
  const { clip } = await created.json();
  assert.equal(clip.text, "synthetic toolchain smoke");
  assert.equal(clip.type, "text");
  assert.ok((await list()).some((item) => item.id === clip.id));
  const keys = await kvKeys(config, state);
  const key = keys.find((item) => item.name === `clip:${clip.id}`);
  assert.ok(key, "the local KV contains the created clip");
  assert.ok(
    key.expiration >= createdAt + 3600 && key.expiration <= Math.floor(Date.now() / 1000) + 3600,
    `persisted KV expiration is one hour: ${JSON.stringify(key)}`,
  );
  const rejected = await request(base, "/api/clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: " " }),
  });
  assert.equal(rejected.status, 400);
  const missingFile = await request(base, "/api/clips/upload", {
    method: "POST",
    body: new FormData(),
  });
  assert.equal(missingFile.status, 400);
  for (const action of ["claim", "delete"]) {
    const form = new FormData();
    const contents = `synthetic ${label} ${action}`;
    form.set("file", new File([contents], "smoke.txt", { type: "text/plain" }));
    const upload = await request(base, "/api/clips/upload", { method: "POST", body: form });
    assert.equal(upload.status, 201);
    const { clip: file } = await upload.json();
    assert.equal(file.fileName, "smoke.txt");
    assert.equal(file.fileSize, Buffer.byteLength(contents));
    const media = await request(base, `/api/media/${file.id}`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("Content-Type"), "text/plain");
    assert.equal(await media.text(), contents);
    const path = `/api/clips/${file.id}${action === "claim" ? "/claim" : ""}`;
    const options = { method: action === "claim" ? "POST" : "DELETE" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const removed = await request(base, path, options);
      assert.equal(removed.status, 200);
      assert.deepEqual(await removed.json(), { ok: true });
    }
    assert.equal((await request(base, `/api/media/${file.id}`)).status, 404);
    assert.ok(!(await list()).some((item) => item.id === file.id));
  }
  assert.equal((await request(base, `/api/clips/${clip.id}`, { method: "DELETE" })).status, 200);
  assert.deepEqual(await list(), []);
  assert.deepEqual(await kvKeys(config, state), []);
  console.log(
    `${label}: SPA/assets, synthetic CRUD, persisted one-hour TTL, repeated claim/delete passed`,
  );
}

const failures = [];
try {
  await mkdir(project);
  await mkdir(env.HOME);
  for (const path of ["src", "worker", "index.html", "package.json", "dist"]) {
    await cp(join(root, path), join(project, path), { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(project, "node_modules"), "junction");
  const built = JSON.parse(await readFile(join(project, "dist/lan_p/wrangler.json"), "utf8"));
  assert.equal(built.main, "index.js");
  assert.equal(built.assets.directory, "../client");
  assert.deepEqual(
    built.kv_namespaces.map((item) => item.binding),
    ["CLIPS_KV"],
  );
  assert.deepEqual(
    built.r2_buckets.map((item) => item.binding),
    ["MEDIA_BUCKET"],
  );
  const local = {
    name: "lan-p-smoke",
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags,
    assets: built.assets,
    send_metrics: false,
    kv_namespaces: [{ binding: "CLIPS_KV", id: "00000000000000000000000000000001", remote: false }],
    r2_buckets: [{ binding: "MEDIA_BUCKET", bucket_name: "lan-p-smoke-only", remote: false }],
    dev: { ip: "127.0.0.1", enable_containers: false },
  };
  const devConfig = join(project, "smoke-dev.json");
  const devState = join(scratch, "dev-state");
  await writeFile(
    devConfig,
    JSON.stringify({
      ...local,
      main: "worker/index.ts",
      assets: {
        not_found_handling: built.assets.not_found_handling,
        run_worker_first: built.assets.run_worker_first,
      },
    }),
  );
  await writeFile(
    join(project, "vite.config.ts"),
    `
import { defineConfig } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
  plugins: [cloudflare({ configPath: ${JSON.stringify(devConfig)}, remoteBindings: false,
    persistState: { path: ${JSON.stringify(devState)} }, inspectorPort: false })],
  server: { host: "127.0.0.1", strictPort: true },
});\n`,
  );
  const devPort = await port();
  const devBase = `http://127.0.0.1:${devPort}`;
  const devArgs = [vp, "dev", "--host", "127.0.0.1", "--port", String(devPort), "--strictPort"];
  let dev = start(devArgs);
  await ready(dev, devBase);
  await smoke(devBase, devConfig, devState, "vp dev");
  const main = join(project, "src/main.ts");
  const original = await readFile(main, "utf8");
  const marker = "lan-toolchain-module-invalidation";
  await writeFile(main, `${original}\nconsole.info(${JSON.stringify(marker)});\n`);
  const invalidationDeadline = Date.now() + 10000;
  let invalidated = false;
  while (Date.now() < invalidationDeadline) {
    const response = await request(
      devBase,
      "/src/main.ts",
      {},
      Math.max(1, Math.min(1000, invalidationDeadline - Date.now())),
    );
    assert.equal(response.status, 200);
    if ((await response.text()).includes(marker)) {
      invalidated = true;
      break;
    }
    await delay(100);
  }
  assert.ok(invalidated, "changed source module becomes visible before the deadline");
  await writeFile(main, original);
  await stop(dev);
  dev = start(devArgs);
  await ready(dev, devBase);
  assert.equal((await request(devBase, "/")).status, 200);
  await stop(dev);
  console.log("vp dev: source-module invalidation and clean restart passed (not browser HMR)");
  const previewConfig = join(project, "dist/lan_p/smoke-preview.json");
  const previewState = join(scratch, "preview-state");
  await writeFile(
    previewConfig,
    JSON.stringify({ ...local, main: built.main, rules: built.rules, no_bundle: true }),
  );
  const previewPort = await port();
  const previewBase = `http://127.0.0.1:${previewPort}`;
  const preview = start([
    wrangler,
    "dev",
    "--local",
    "--no-latest",
    "--ip",
    "127.0.0.1",
    "--port",
    String(previewPort),
    "--inspector-ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
    "--config",
    previewConfig,
    "--persist-to",
    previewState,
  ]);
  await ready(preview, previewBase);
  await smoke(previewBase, previewConfig, previewState, "built Worker local preview");
  await stop(preview);
} catch (error) {
  for (const result of children) console.error(result.output);
  failures.push(error);
} finally {
  for (const result of children) {
    try {
      await stop(result);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await rm(scratch, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
}
if (failures.length) throw new AggregateError(failures, "toolchain smoke or cleanup failed");
console.log(
  "All child logs checked: no remote/auth setup or Request.cf network initialization reported.",
);
