// Test-copy instrumentation only. Never shipped or loaded by the normal application.
const { Session } = require("node:inspector");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const v8 = require("node:v8");
const { threadId, isMainThread } = require("node:worker_threads");

exports.start = function start({ directory, role }) {
  if (globalThis[Symbol.for("aibuddy7se.heap-probe")]) throw new Error("Duplicate heap probe");
  if (!path.isAbsolute(directory) || !/^[a-z-]+$/.test(role))
    throw new Error("Invalid probe configuration");
  globalThis[Symbol.for("aibuddy7se.heap-probe")] = true;
  const token = randomUUID();
  const id = role + "-" + process.pid + "-" + threadId + "-" + token;
  const session = new Session();
  session.connect(); // In-process inspector session: no TCP port, no extra IPC protocol.
  const post = (method, args = {}) =>
    new Promise((resolve, reject) =>
      session.post(method, args, (error, result) => (error ? reject(error) : resolve(result))),
    );
  const targetDir = path.join(directory, "private", id);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(path.join(directory, "targets"), { recursive: true });
  fs.mkdirSync(path.join(directory, "requests"), { recursive: true });
  fs.mkdirSync(path.join(directory, "acks"), { recursive: true });
  fs.mkdirSync(path.join(directory, "heartbeats"), { recursive: true });
  const atomic = (file, value) => {
    fs.writeFileSync(file + ".next", JSON.stringify(value));
    fs.renameSync(file + ".next", file);
  };
  let lastHeartbeat = 0;
  const heartbeat = () => {
    lastHeartbeat = Date.now();
    atomic(path.join(directory, "heartbeats", id + ".json"), { token, sampledAt: lastHeartbeat });
  };
  let busy = true;
  let lastSequence = 0;
  const samplingOptions = {
    samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  };
  const enabled = post("HeapProfiler.enable");
  const started = post("HeapProfiler.startSampling", samplingOptions);
  const samplingReady = Promise.all([enabled, started])
    .then(() => {
      // Fail explicitly if this pinned runtime does not support cumulative sampling options.
      const moduleRole =
        role === "plugin-host"
          ? (
              process.argv.find((arg) => /[\\/]packages[\\/][a-z-]+-plugin[\\/]/.test(arg)) || ""
            ).match(/[\\/]packages[\\/]([a-z-]+-plugin)[\\/]/)?.[1]
          : undefined;
      atomic(path.join(directory, "targets", id + ".json"), {
        id,
        token,
        role,
        moduleRole,
        pid: process.pid,
        threadId,
        isMainThread,
        rssIsProcessWide: true,
        parentPid: process.ppid,
        createdAt: new Date().toISOString(),
        versions: process.versions,
        samplingOptions,
        memory: process.memoryUsage(),
      });
      heartbeat();
      busy = false;
    })
    .catch((error) => {
      atomic(path.join(directory, "targets", id + ".error.json"), {
        role,
        pid: process.pid,
        threadId,
        isMainThread,
        rssIsProcessWide: true,
        error: String(error),
      });
    });
  void samplingReady;
  const timer = setInterval(async () => {
    if (busy) return;
    if (Date.now() - lastHeartbeat > 1000) heartbeat();
    const requestFile = path.join(directory, "requests", id + ".json");
    let request;
    try {
      request = JSON.parse(fs.readFileSync(requestFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (
      request.token !== token ||
      !Number.isSafeInteger(request.sequence) ||
      request.sequence <= lastSequence ||
      !/^[a-z0-9-]+$/.test(request.phase)
    )
      return;
    busy = true;
    lastSequence = request.sequence;
    const prefix = path.join(targetDir, request.phase);
    const startedAt = new Date().toISOString();
    const before = { memory: process.memoryUsage(), spaces: v8.getHeapSpaceStatistics() };
    try {
      // Write and release the sampling result before snapshot GC; do not retain its object graph.
      await post("HeapProfiler.getSamplingProfile").then((result) =>
        fs.writeFileSync(prefix + ".heapprofile", JSON.stringify(result.profile)),
      );
      let fd = fs.openSync(prefix + ".heapsnapshot", "wx");
      let streamError;
      const chunk = ({ params }) => {
        if (streamError) return;
        try {
          fs.writeSync(fd, params.chunk);
        } catch (error) {
          streamError = error;
        }
      };
      session.on("HeapProfiler.addHeapSnapshotChunk", chunk);
      try {
        await post("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
      } finally {
        session.off("HeapProfiler.addHeapSnapshotChunk", chunk);
        fs.closeSync(fd);
        fd = undefined;
      }
      if (streamError) throw streamError;
      atomic(path.join(directory, "acks", id + ".json"), {
        id,
        token,
        sequence: request.sequence,
        phase: request.phase,
        role,
        pid: process.pid,
        threadId,
        isMainThread,
        rssIsProcessWide: true,
        startedAt,
        completedAt: new Date().toISOString(),
        before,
        after: { memory: process.memoryUsage(), spaces: v8.getHeapSpaceStatistics() },
        profile: prefix + ".heapprofile",
        snapshot: prefix + ".heapsnapshot",
        diagnosticOnly: true,
        snapshotMayCollectGarbage: true,
      });
    } catch (error) {
      atomic(path.join(directory, "acks", id + ".json"), {
        id,
        token,
        sequence: request.sequence,
        phase: request.phase,
        error: String(error),
      });
    } finally {
      busy = false;
    }
  }, 250);
  timer.unref();
  return samplingReady;
};
