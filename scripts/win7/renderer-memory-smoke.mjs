import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { resolve } from "node:path";

// 浏览器验收：挂载真实 service hook，RPC 边界使用虚构快照；不需要模型或用户会话。
// Linux: node scripts/win7/renderer-memory-smoke.mjs /usr/bin/chromium
const source = `
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceProvider } from './packages/ui/src/hooks/useServices.js';
import { useZCodeTaskService } from './packages/ui/src/hooks/useZCodeTaskService.js';
import { highlightCode } from './packages/ui/src/lib/shikiHighlighter.js';
import { uiMemoryDiagnosticsRegistry as registry } from './packages/ui/src/lib/memoryDiagnostics.js';
import { useDraftSessionPrewarm } from './packages/ui/src/v4/composer/useDraftSessionPrewarm.js';
const check = (value, message) => { if (!value) throw new Error(message); };
const calls = [];
let releaseHeld;
const raw = {
  async getTaskSnapshotWithEtag(params) {
    calls.push(params);
    if (params.taskId === 'held' && params.ifNoneMatch) {
      await new Promise(resolve => { releaseHeld = resolve; });
    }
    const etag = [params.taskId, params.workspaceIdentity, params.clientMode].join(':');
    if (params.ifNoneMatch === etag) return { etag, snapshot: null, notModified: true };
    const size = params.taskId === 'huge' ? 3 * 1024 * 1024 : 512 * 1024;
    return { etag, notModified: false, snapshot: { taskId: params.taskId, messages: [{ text: '测'.repeat(size / 3) }] } };
  }
};
const params = taskId => ({ workspacePath: '/fictional', taskId, clientMode: 'desktop-continuous' });
const tokenize = code => new Promise(resolve => highlightCode(code, 'javascript', 'github-dark', resolve));
async function verifyDraftLifecycle() {
  const node = document.createElement('div'); document.body.append(node);
  let root = createRoot(node);
  const commands = [];
  let holdCreate = false, releaseCreate;
  const dispatch = async (type, payload, sessionId) => {
    commands.push({ type, sessionId });
    if (type === 'createSession') {
      const id = 'fixture-' + commands.length;
      if (holdCreate) await new Promise(resolve => { releaseCreate = resolve; });
      return { status: 'accepted', result: { type: 'createSession', sessionId: id } };
    }
    return { status: 'accepted' };
  };
  function DraftProbe({ options, ready }) {
    const api = useDraftSessionPrewarm({ enabled: true, paneId: 'main', workspaceKey: 'fixture', transportIdentity: dispatch, dispatchCommand: dispatch, ...options });
    useEffect(() => { ready(api); }, [api.waitForSession, ready]);
    return <div>Draft fixture</div>;
  }
  const mount = options => new Promise(resolve => root.render(<DraftProbe options={options} ready={resolve} />));
  const settle = () => new Promise(resolve => setTimeout(resolve, 10));
  const lazy = await mount({ eager: false });
  await settle();
  check(commands.length === 0, 'lazy draft spawned before demand');
  const [one, two] = await Promise.all([lazy.waitForSession(), lazy.waitForSession()]);
  check(one === two && commands.length === 1, 'first demand did not share owner');
  root.unmount(); await settle();
  check(commands.filter(c => c.type === 'deleteSession').length === 1, 'unpromoted draft not cleaned');
  root = createRoot(node);
  holdCreate = true;
  const staleApi = await mount({ eager: false, workspaceKey: 'old' });
  const stale = staleApi.waitForSession().then(() => false, () => true);
  const nextApi = await mount({ eager: false, workspaceKey: 'new' });
  await settle(); holdCreate = false; releaseCreate();
  check(await stale, 'stale demand continued into another workspace');
  await settle();
  check(commands.filter(c => c.type === 'createSession').length === 2, 'new lazy owner started automatically');
  const next = await nextApi.waitForSession();
  check(next.beginPromotion(), 'live binding could not be promoted'); next.promote();
  const deletes = commands.filter(c => c.type === 'deleteSession').length;
  root.unmount(); await settle();
  check(commands.filter(c => c.type === 'deleteSession').length === deletes, 'promoted task was deleted');
  root = createRoot(node);
  const before = commands.length;
  const eager = await mount({ workspaceKey: 'modern' });
  await settle();
  check(commands.length === before + 1, 'default eager behavior changed');
  await eager.waitForSession(); root.unmount(); await settle(); node.remove();
}
async function verify(service) {
  window.progress = 'snapshot'; console.log('Memory acceptance: snapshot');
  const first = service.getTaskSnapshot(params('concurrent'));
  const second = service.getTaskSnapshot(params('concurrent'));
  check(first === second, 'same request must share in-flight promise');
  await first;
  check(calls.length === 1, 'duplicate snapshot RPC');
  const heldSnapshot = await service.getTaskSnapshot(params('held'));
  const held = service.getTaskSnapshot(params('held'));
  check(typeof releaseHeld === 'function', 'warm cache must send ETag');
  for (let i = 0; i < 25; i++) await service.getTaskSnapshot(params('task-' + i));
  let counts = registry.collect();
  check(counts['taskSnapshotCache.entries'] <= 20, 'snapshot count exceeds budget');
  check(counts['taskSnapshotCache.serializedBytes'] <= 8 * 1024 * 1024, 'snapshot bytes exceed budget');
  releaseHeld();
  check(await held === heldSnapshot, 'in-flight notModified lost evicted snapshot');
  await service.getTaskSnapshot(params('concurrent'));
  check(!calls.at(-1).ifNoneMatch, 'evicted snapshot must be fetched without ETag');
  const huge = await service.getTaskSnapshot(params('huge'));
  check(huge.messages[0].text.length >= 1024 * 1024, 'oversized result was truncated');
  await service.getTaskSnapshot(params('huge'));
  check(!calls.at(-1).ifNoneMatch, 'oversized snapshot must not be retained');
  await service.getTaskSnapshot({ ...params('mode'), workspaceIdentity: 'one' });
  await service.getTaskSnapshot({ ...params('mode'), workspaceIdentity: 'two' });
  check(!calls.at(-1).ifNoneMatch, 'workspace identities shared cache');
  await service.getTaskSnapshot({ ...params('mode'), workspaceIdentity: 'two', clientMode: 'web-remote-replayable' });
  check(!calls.at(-1).ifNoneMatch, 'desktop and remote recovery shared cache');
  window.progress = 'tokens'; console.log('Memory acceptance: tokens');
  const prefix = '// ' + '前'.repeat(110) + '\\nconst value = "';
  const suffix = '";\\n// ' + '后'.repeat(110);
  const a = await tokenize(prefix + 'alpha' + suffix);
  const b = await tokenize(prefix + 'bravo' + suffix);
  check(b.tokens.flat().map(token => token.content).join('').includes('bravo'), 'same-length middle edit reused stale tokens');
  check(a !== b, 'different code reused token object');
  for (let i = 0; i < 110; i++) await tokenize('const item' + i + ' = "中文";');
  window.progress = 'large tokens'; console.log('Memory acceptance: large tokens');
  counts = registry.collect();
  check(counts['shiki.tokensCache'] <= 100, 'token entry count exceeds budget');
  for (let i = 0; i < 30; i++) await tokenize('// sample ' + i + '\\n' + 'const item = "中文缓存预算";\\n'.repeat(600));
  counts = registry.collect();
  check(counts['shiki.tokensCacheEstimatedBytes'] <= 4 * 1024 * 1024, 'token bytes exceed budget');
  // 淘汰后仍能完整重算并回调，不能因限额让高亮一直停留在 loading。
  const again = await tokenize(prefix + 'alpha' + suffix);
  check(again.tokens.flat().map(token => token.content).join('').includes('alpha'), 'evicted code could not be highlighted again');
  await verifyDraftLifecycle();
  window.acceptance = { status: 'PASS', counts: registry.collect(), rpcCalls: calls.length };
}
function Probe() {
  const service = useZCodeTaskService();
  useEffect(() => { verify(service).catch(error => { window.acceptance = { status: 'FAIL', error: String(error) }; }); }, [service]);
  return <main>Fictional renderer memory acceptance</main>;
}
createRoot(document.getElementById('root')).render(<ServiceProvider services={{ zcodeTaskService: raw }}><Probe /></ServiceProvider>);
`;
const bundle = await build({
  stdin: { contents: source, resolveDir: resolve(import.meta.dirname, "../.."), loader: "tsx" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  tsconfig: "packages/ui/tsconfig.json",
  define: {
    "process.env.NODE_ENV": '"production"',
    __ZCODE_WIN7_EDITION__: "true",
    "import.meta.env": "{}",
  },
});
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html");
  res.end(
    req.url === "/bundle.js"
      ? bundle.outputFiles[0].contents
      : '<div id="root"></div><script src="/bundle.js"></script>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.argv[2], headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => console.log(message.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.acceptance, undefined, { timeout: 120000 });
  const result = await page.evaluate(() => window.acceptance);
  assert.equal(result.status, "PASS", JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
