import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function sourceLocation(value) {
  const url = String(value || "").replaceAll("\\", "/");
  if (/heap-probe|heap-summary|heap-bootstrap/.test(url)) return "<diagnostic>";
  for (const marker of ["/app.asar/", "/glm/", "/node_modules/"]) {
    const index = url.indexOf(marker);
    if (index >= 0) return url.slice(index + 1);
  }
  return url.startsWith("node:") ? url : url ? "<runtime-or-anonymous>" : "";
}
function safeName(type, value) {
  if (["string", "concatenated string", "sliced string"].includes(type)) return "<string>";
  return /^[A-Za-z0-9_ .:$<>+()[\]/*=-]{1,120}$/.test(value) ? value : "<name-redacted>";
}
export function summarizeAllocation(profile) {
  const rows = new Map();
  let total = 0;
  const visit = (node, stack) => {
    const frame = node.callFrame || {};
    const location = {
      functionName: safeName("closure", frame.functionName || "(anonymous)"),
      url: sourceLocation(frame.url),
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
    };
    const next = [...stack.slice(-9), location];
    if (node.selfSize) {
      const key = JSON.stringify(next);
      const row = rows.get(key) || { sampledBytes: 0, stack: next };
      row.sampledBytes += node.selfSize;
      rows.set(key, row);
      total += node.selfSize;
    }
    for (const child of node.children || []) visit(child, next);
  };
  visit(profile.head, []);
  return {
    scope:
      "Estimated sampling weights, not RSS or exact allocation bytes; includes collected objects when supported",
    sampledBytes: total,
    sampleCount: profile.samples?.length ?? null,
    topStacks: [...rows.values()].sort((a, b) => b.sampledBytes - a.sampledBytes).slice(0, 80),
  };
}

// Strong-edge dominators using reverse postorder and iterative intersection.
// Weak edges are excluded. Retained sizes overlap and must not be summed across rows.
export function summarizeSnapshot(snapshot) {
  const meta = snapshot.snapshot.meta;
  const fields = meta.node_fields,
    ef = meta.edge_fields;
  const stride = fields.length,
    edgeStride = ef.length;
  const ni = Object.fromEntries(fields.map((name, i) => [name, i]));
  const ei = Object.fromEntries(ef.map((name, i) => [name, i]));
  const nodes = snapshot.nodes,
    edges = snapshot.edges,
    strings = snapshot.strings;
  const count = nodes.length / stride;
  assert.ok(Number.isSafeInteger(count) && count > 0);
  const types = meta.node_types[ni.type],
    edgeTypes = meta.edge_types[ei.type];
  const weak = edgeTypes.indexOf("weak");
  const starts = new Uint32Array(count + 1);
  const incoming = new Uint32Array(count);
  let cursor = 0;
  for (let n = 0; n < count; n++) {
    starts[n] = cursor;
    const limit = cursor + nodes[n * stride + ni.edge_count] * edgeStride;
    for (; cursor < limit; cursor += edgeStride) {
      const target = edges[cursor + ei.to_node] / stride;
      assert.ok(Number.isSafeInteger(target) && target >= 0 && target < count);
      if (edges[cursor + ei.type] !== weak) incoming[target]++;
    }
  }
  starts[count] = cursor;
  assert.equal(cursor, edges.length);
  const predStarts = new Uint32Array(count + 1);
  for (let n = 0; n < count; n++) predStarts[n + 1] = predStarts[n] + incoming[n];
  const pred = new Uint32Array(predStarts[count]);
  const nextPred = predStarts.slice(0, count);
  for (let n = 0; n < count; n++)
    for (let e = starts[n]; e < starts[n + 1]; e += edgeStride)
      if (edges[e + ei.type] !== weak) pred[nextPred[edges[e + ei.to_node] / stride]++] = n;
  const seen = new Uint8Array(count);
  const dfsNodes = [0],
    dfsEdges = [starts[0]],
    post = [];
  seen[0] = 1;
  while (dfsNodes.length) {
    const top = dfsNodes.length - 1,
      n = dfsNodes[top];
    let e = dfsEdges[top],
      pushed = false;
    while (e < starts[n + 1]) {
      dfsEdges[top] = e + edgeStride;
      const t = edges[e + ei.to_node] / stride,
        isWeak = edges[e + ei.type] === weak;
      e += edgeStride;
      if (!isWeak && !seen[t]) {
        seen[t] = 1;
        dfsNodes.push(t);
        dfsEdges.push(starts[t]);
        pushed = true;
        break;
      }
    }
    if (!pushed) {
      post.push(n);
      dfsNodes.pop();
      dfsEdges.pop();
    }
  }
  const order = post.reverse(),
    rank = new Int32Array(count),
    idom = new Int32Array(count);
  rank.fill(-1);
  idom.fill(-1);
  order.forEach((n, i) => {
    rank[n] = i;
  });
  idom[0] = 0;
  const intersect = (a, b) => {
    while (a !== b) {
      while (rank[a] > rank[b]) a = idom[a];
      while (rank[b] > rank[a]) b = idom[b];
    }
    return a;
  };
  let changed = true,
    passes = 0;
  while (changed) {
    changed = false;
    passes++;
    assert.ok(passes <= 1000, "Dominator computation did not converge");
    for (let i = 1; i < order.length; i++) {
      const n = order[i];
      let parent = -1;
      for (let p = predStarts[n]; p < predStarts[n + 1]; p++) {
        const predecessor = pred[p];
        if (idom[predecessor] < 0) continue;
        parent = parent < 0 ? predecessor : intersect(parent, predecessor);
      }
      assert.ok(parent >= 0);
      if (idom[n] !== parent) {
        idom[n] = parent;
        changed = true;
      }
    }
  }
  const retained = new Float64Array(count);
  const groups = new Map();
  for (const n of order) {
    const offset = n * stride,
      type = types[nodes[offset + ni.type]];
    const name = safeName(type, strings[nodes[offset + ni.name]]);
    retained[n] = nodes[offset + ni.self_size];
    const key = type + ":" + name;
    const g = groups.get(key) || { type, name, count: 0, shallowBytes: 0 };
    g.count++;
    g.shallowBytes += retained[n];
    groups.set(key, g);
  }
  for (let i = order.length - 1; i > 0; i--) retained[idom[order[i]]] += retained[order[i]];
  const describe = (n) => {
    const offset = n * stride,
      type = types[nodes[offset + ni.type]];
    return {
      id: nodes[offset + ni.id],
      type,
      name: safeName(type, strings[nodes[offset + ni.name]]),
      shallowBytes: nodes[offset + ni.self_size],
      retainedBytes: retained[n],
    };
  };
  const top = order
    .filter((n) => n !== 0)
    .sort((a, b) => retained[b] - retained[a])
    .slice(0, 60);
  return {
    scope:
      "Strong-edge retained heap after snapshot GC; diagnostic run only. Retained rows overlap.",
    totalNodes: count,
    stronglyReachableNodes: order.length,
    strongSelfBytes: retained[0],
    dominatorPasses: passes,
    topGroups: [...groups.values()].sort((a, b) => b.shallowBytes - a.shallowBytes).slice(0, 80),
    topRetainers: top.map((n) => {
      const chain = [];
      let current = n;
      while (current !== 0 && chain.length < 14) {
        current = idom[current];
        chain.push(describe(current));
      }
      return { ...describe(n), dominatorChain: chain };
    }),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [snapshotFile, profileFile, output] = process.argv.slice(2);
  const allocation = summarizeAllocation(JSON.parse(await readFile(profileFile, "utf8")));
  const heap = summarizeSnapshot(JSON.parse(await readFile(snapshotFile, "utf8")));
  await writeFile(output, JSON.stringify({ allocation, heap }, null, 2));
}
