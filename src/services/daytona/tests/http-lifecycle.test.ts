import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve("@daytona/sdk"));
const axiosPath = sdkRequire.resolve("axios");
const cliRequire = createRequire(require.resolve("expo"));
const expoRequire = createRequire(cliRequire.resolve("@expo/cli"));
const evaluatorPath = expoRequire.resolve("@expo/require-utils");

// API reloads evaluate bundles with cache:false. Use Expo's actual evaluator
// and a real TLS socket; the transport supplies responses without network access.
describe.each(["commonjs", "source"])(
  "Daytona HTTP lifecycle: %s",
  (format) => {
    it("does not retain a new socket listener or ownership slot per API evaluation", async () => {
      const source =
        format === "commonjs"
          ? readFileSync(axiosPath, "utf8")
          : (
              await build({
                entryPoints: [join(dirname(axiosPath), "../../index.js")],
                platform: "node",
                format: "cjs",
                bundle: true,
                write: false,
              })
            ).outputFiles[0].text;
      const result = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          "--max-old-space-size=256",
          "-e",
          `
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { TLSSocket } = require('node:tls');
const { Socket } = require('node:net');
const { evalModule } = require(${JSON.stringify(evaluatorPath)});
const source = require('node:fs').readFileSync(0, 'utf8');
const filename = ${JSON.stringify(axiosPath)};
const socket = new TLSSocket(new Socket());
const initialListeners = socket.listenerCount('error');
let request;
let holdResponse = false;
const transport = { request(_options, reply) {
  const req = request = new EventEmitter();
  req.destroyed = false;
  req.setTimeout = () => req;
  req.destroy = error => {
    req.destroyed = true;
    if (error) req.emit('error', error);
    req.emit('close');
  };
  req.end = () => process.nextTick(() => {
    req.emit('socket', socket);
    if (holdResponse) return;
    const response = Readable.from(['{}']);
    Object.assign(response, { statusCode: 200, headers: {}, req });
    reply(response);
  });
  return req;
}};
(async () => {
  let firstListener;
  let startHeap;
  for (let i = 0; i < ${format === "commonjs" ? 200 : 40}; i++) {
    const module = evalModule(source, filename, { cache: false });
    const axios = module.default || module;
    await axios.get('https://example.invalid', { adapter: 'http', proxy: false, transport });
    request.emit('close');
    assert.equal(socket.listenerCount('error'), initialListeners + 1);
    const listener = socket.listeners('error').at(-1);
    if (i === 0) firstListener = listener;
    assert.equal(listener, firstListener);
    const slots = Object.getOwnPropertySymbols(socket).filter(key => String(key).includes('axios.http'));
    assert.equal(slots.length, 2);
    const ownerKey = slots.find(key => String(key).includes('currentReq'));
    assert.equal(socket[ownerKey], null);
    if (i % 25 === 0) global.gc();
    if (i === 24) { global.gc(); startHeap = process.memoryUsage().heapUsed; }
  }
  global.gc();
  const growth = process.memoryUsage().heapUsed - startHeap;
  assert.ok(growth < 16 * 1024 * 1024, 'retained heap grew by ' + growth);

  const loadAxios = () => {
    const module = evalModule(source, filename, { cache: false });
    return module.default || module;
  };
  await loadAxios().get('https://example.invalid', { adapter: 'http', proxy: false, transport });
  const previous = request;
  holdResponse = true;
  const failed = loadAxios().get('https://example.invalid', { adapter: 'http', proxy: false, transport })
    .then(() => null, error => error);
  await new Promise(resolve => setImmediate(resolve));
  const active = request;
  previous.emit('close');
  socket.emit('error', new Error('test transport failed'));
  assert.equal((await failed).message, 'test transport failed');
  assert.equal(active.destroyed, true);
  assert.equal(previous.destroyed, false);
  assert.equal(socket[Symbol.for('axios.http.currentReq')], null);
  socket.emit('error', new Error('idle socket error'));
  assert.equal(socket.listenerCount('error'), initialListeners + 1);
  console.log(JSON.stringify({ evaluations: ${format === "commonjs" ? 200 : 40}, errorListeners: socket.listenerCount('error'), heapGrowthBytes: growth }));
  socket.destroy();
})().catch(error => { console.error(error); socket.destroy(); process.exitCode = 1; });
        `,
        ],
        // Hundreds of fresh evaluations can exceed 25s under parallel test load.
        { input: source, encoding: "utf8", timeout: 60_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).not.toContain("MaxListenersExceededWarning");
      expect(result.status, result.stderr).toBe(0);
    }, 70_000);
  },
);
