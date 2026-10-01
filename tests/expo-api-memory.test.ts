import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo"));
const cliPath = expoRequire.resolve("@expo/cli/package.json");
const serverPath = join(
  dirname(cliPath),
  "build/src/start/server/metro/MetroBundlerDevServer.js",
);

it("bounds API evaluation memory while preserving request handling, source maps, and reloads", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      "--max-old-space-size=256",
      "-e",
      `
const assert = require('node:assert/strict');
const { findSourceMap } = require('node:module');
const { join } = require('node:path');
const { MetroBundlerDevServer } = require(${JSON.stringify(serverPath)});
const root = ${JSON.stringify(process.cwd())};
const filename = join(root, 'src/app/api/terminal-memory-fixture.cjs');
const server = new MetroBundlerDevServer(root, { ios: 'metro' }, { devToolsPluginManager: {} });
let evaluations = 0;
globalThis.__codaloudMemoryFixture = () => evaluations++;
const makeBundle = (version, mappings = 'AAAA') => ({
  filename,
  src: 'globalThis.__codaloudMemoryFixture(); module.exports = { version: ' + version + ', GET: async request => Response.json({ user: request.headers.get("x-test-user"), version: module.exports.version }) };',
  map: JSON.stringify({ version: 3, file: filename, sources: ['original.ts'], sourcesContent: ['x'.repeat(1024 * 1024)], names: [], mappings }),
});
let bundle = makeBundle(1);
server.ssrLoadModuleContents = async () => bundle;
const load = () => server.ssrImportApiRoute(filename, { platform: 'ios' });
(async () => {
  const first = await load();
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 100; i++) {
    const route = await load();
    const response = await route.GET(new Request('https://example.invalid', { headers: { 'x-test-user': String(i) } }));
    assert.deepEqual(await response.json(), { user: String(i), version: 1 });
    await new Promise(setImmediate);
    if (i % 10 === 0) global.gc();
  }
  global.gc();
  const growth = process.memoryUsage().heapUsed - before;
  console.log(JSON.stringify({ requests: 100, evaluations, heapGrowthMiB: growth / 1048576 }));
  assert.ok(growth < 12 * 1024 * 1024, 'API evaluation retained ' + growth + ' bytes');
  assert.equal(evaluations, 1, 'Unchanged API bundles must only be evaluated once');
  assert.equal(await load(), first);
  assert.equal(findSourceMap(filename).findEntry(0, 0).originalLine, 0);

  bundle = makeBundle(2, 'AAEA');
  server.invalidateApiRouteCache();
  const routes = await Promise.all(Array.from({ length: 20 }, load));
  assert.equal(new Set(routes).size, 1, 'Concurrent requests must share the same evaluated bundle');
  assert.notEqual(routes[0], first);
  assert.equal(evaluations, 2, 'A changed bundle must be evaluated exactly once');
  assert.deepEqual(await (await routes[0].GET(new Request('https://example.invalid'))).json(), { user: null, version: 2 });
  assert.equal(findSourceMap(filename).findEntry(0, 0).originalLine, 2);

  bundle = makeBundle(3);
  server.invalidateApiRouteCache();
  const reloaded = await load();
  assert.notEqual(reloaded, routes[0]);
  assert.equal(evaluations, 3);
  assert.deepEqual(await (await reloaded.GET(new Request('https://example.invalid'))).json(), { user: null, version: 3 });
  console.log('API reload and request isolation checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
      `,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
