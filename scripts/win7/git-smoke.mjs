import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer } from "node:https";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import ssh2 from "ssh2";
import { configureOfflineTools } from "./win7-environment.mjs";
import { probeJavaEnvironment, probeMavenEnvironment } from "./system-self-test.cjs";

// 所有仓库、主机密钥、TLS 证书和凭据都是一次性 fixture；只让客户端连接回环服务。
const app = resolve(process.argv[2]);
const resources = join(app, "resources");
const git = join(resources, "offline-tools/git/cmd/git.exe");
const wincred = join(resources, "offline-tools/git/mingw64/bin/git-credential-wincred.exe");
const root = await mkdtemp(join(tmpdir(), "aibuddy git 中文 "));
const tlsRoot = await mkdtemp(join(tmpdir(), "aibuddy-git-tls-"));
const execute = promisify(execFile);
const env = {
  ...process.env,
  HOME: join(root, "home"),
  USERPROFILE: join(root, "home"),
  GIT_TERMINAL_PROMPT: "0",
};
for (const key of Object.keys(env)) {
  if (
    /^(ZCODE_GIT_BINARY|AIBUDDY7SE_GIT_BINARY|GIT_CONFIG|GIT_CONFIG_COUNT|GIT_CONFIG_PARAMETERS|GIT_CONFIG_SYSTEM|GIT_CONFIG_NOSYSTEM|GIT_SSH|GIT_SSH_COMMAND|GIT_ASKPASS|SSH_ASKPASS)$/i.test(
      key,
    )
  )
    delete env[key];
}
env.GIT_CONFIG_GLOBAL = join(env.HOME, ".gitconfig");
configureOfflineTools(resources, env);
const run = async (file, args, options = {}) => {
  const { input, ...rest } = options;
  const promise = execute(file, args, {
    cwd: root,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    ...rest,
  });
  promise.child.stdin.end(input);
  return (await promise).stdout.trim();
};
const g = (args, options) => run(git, args, options);
const repository = join(root, "项目 one");
const remoteRoot = join(root, "remotes");
const remote = join(remoteRoot, "fixture.git");
const host = `aibuddy-${randomUUID()}.invalid`;
let credential;
let https;
let ssh;
const sshClients = new Set();
const backendChildren = new Set();
const checks = [];

try {
  await mkdir(env.HOME);
  await writeFile(env.GIT_CONFIG_GLOBAL, "");
  assert.equal(await g(["--version"]), "git version 2.46.2.windows.1");
  assert.equal(await g(["config", "--system", "--get-all", "credential.helper"]), "wincred");
  await g(["init", "-b", "main", repository]);
  const local = (args, options) => g(["-C", repository, ...args], options);
  await local(["config", "user.name", "Fixture"]);
  await local(["config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(repository, "中文 文件.txt"), "first\n", "utf8");
  await writeFile(
    join(repository, ".git/hooks/pre-commit"),
    '#!/bin/sh\nprintf "HOOK_OK" > .git/hook-result\n',
    { mode: 0o755 },
  );
  await local(["add", "."]);
  await local(["commit", "-m", "fixture initial"]);
  assert.equal(await readFile(join(repository, ".git/hook-result"), "utf8"), "HOOK_OK");
  await local(["switch", "-c", "feature"]);
  await writeFile(join(repository, "中文 文件.txt"), "first\nsecond\n", "utf8");
  assert.equal(await local(["-c", "core.quotePath=false", "diff", "--name-only"]), "中文 文件.txt");
  await local(["commit", "-am", "fixture change"]);
  await local(["switch", "main"]);
  await local(["merge", "--ff-only", "feature"]);
  await mkdir(remoteRoot);
  await g(["clone", "--bare", repository, remote]);
  await local(["remote", "add", "origin", remote]);
  await local(["push", "origin", "main"]);
  const checkout = join(root, "worktree 中文");
  await local(["worktree", "add", "-b", "worktree-fixture", checkout]);
  assert.match(await readFile(join(checkout, "中文 文件.txt"), "utf8"), /second/);
  await local(["worktree", "remove", checkout]);
  const bundle = join(root, "备份.bundle");
  await local(["bundle", "create", bundle, "--all"]);
  await g(["clone", bundle, join(root, "bundle-clone")]);
  assert.match(await readFile(join(root, "bundle-clone/中文 文件.txt"), "utf8"), /second/);
  checks.push("bundled Git init/commit/branch/diff/clone/push/worktree/bundle/Unicode/sh hook");

  // 实际服务 provider 通过应用环境解析 Git，不能用 runner 的 Git 冒充产品。
  Object.assign(process.env, env);
  delete process.env.ZCODE_GIT_BINARY;
  delete process.env.AIBUDDY7SE_GIT_BINARY;
  const { createGitCommandProvider } = createRequire(import.meta.url)(resolve(process.argv[3]));
  const provider = createGitCommandProvider();
  const providerResult = await provider.run({ cwd: repository, args: ["--version"] });
  assert.equal(providerResult.exitCode, 0, providerResult.stderr);
  assert.equal(providerResult.stdout.trim(), "git version 2.46.2.windows.1");
  const execPath = await provider.run({ cwd: repository, args: ["--exec-path"] });
  assert.ok(
    execPath.stdout.replaceAll("\\", "/").toLowerCase().includes("/resources/offline-tools/git/"),
  );
  checks.push("original GitCommandProvider resolves bundled Git");

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const key = ssh2.utils.parseKey(privateKey).getPublicSSH().toString("base64");
  ssh = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    sshClients.add(client);
    client.on("error", () => {});
    client.on("close", () => sshClients.delete(client));
    client.on("authentication", (ctx) =>
      ctx.username === "fixture" && ctx.method === "none" ? ctx.accept() : ctx.reject(),
    );
    client.on("ready", () =>
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (accept, reject, info) => {
          const match = /^git-(upload-pack|receive-pack) '\/fixture\.git'$/.exec(info.command);
          if (!match) return reject();
          const stream = accept();
          const child = spawn(git, [match[1], remote], { env, windowsHide: true });
          backendChildren.add(child);
          child.stdin.on("error", () => {});
          stream.pipe(child.stdin);
          child.stdout.pipe(stream, { end: false });
          child.stderr.pipe(stream.stderr, { end: false });
          child.on("close", (code) => {
            backendChildren.delete(child);
            stream.exit(code ?? 1);
            stream.end();
          });
          child.on("error", () => {
            stream.exit(1);
            stream.end();
          });
        });
      }),
    );
  });
  await new Promise((done, fail) => {
    ssh.once("error", fail);
    ssh.listen(0, "127.0.0.1", done);
  });
  const port = ssh.address().port;
  const knownHosts = join(root, "known hosts");
  const quote = (value) => `'${value.replaceAll("\\", "/").replaceAll("'", `'"'"'`)}'`;
  await writeFile(knownHosts, `[127.0.0.1]:${port} ssh-rsa ${key}\n`);
  const sshEnv = {
    ...env,
    GIT_SSH_VARIANT: "ssh",
    GIT_SSH_COMMAND: `${quote(join(resources, "offline-tools/git/usr/bin/ssh.exe"))} -F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes -o ${quote(`UserKnownHostsFile=${knownHosts}`)}`,
  };
  const sshUrl = `ssh://fixture@127.0.0.1:${port}/fixture.git`;
  await g(["clone", sshUrl, join(root, "ssh-clone")], { env: sshEnv });
  await g(["-C", join(root, "ssh-clone"), "push", "origin", "main"], { env: sshEnv });
  await writeFile(knownHosts, "");
  await assert.rejects(g(["ls-remote", sshUrl], { env: sshEnv }), /Host key verification failed/);
  checks.push(
    "bundled SSH Git clone/push and untrusted host rejection (fixture anonymous authentication)",
  );

  // runner 的 OpenSSL 和 Git 仅充当回环 HTTPS 服务器 fixture；客户端始终是随包 Git。
  const hostGitRoot = join(process.env.ProgramFiles, "Git");
  const certificate = join(tlsRoot, "ca.pem");
  const privateKeyPath = join(tlsRoot, "key.pem");
  await run(join(hostGitRoot, "usr/bin/openssl.exe"), [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    privateKeyPath,
    "-out",
    certificate,
    "-days",
    "1",
    "-subj",
    `/CN=${host}`,
    "-addext",
    `subjectAltName=DNS:${host}`,
  ]);
  const username = "fixture";
  const password = randomUUID();
  let authenticated = 0;
  https = createServer(
    { key: await readFile(privateKeyPath), cert: await readFile(certificate) },
    (request, response) => {
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
      ) {
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' });
        response.end();
        return;
      }
      authenticated++;
      const url = new URL(request.url, "https://fixture.invalid");
      if (!/^\/fixture\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(url.pathname)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const child = spawn(join(hostGitRoot, "cmd/git.exe"), ["http-backend"], {
        env: {
          ...env,
          GIT_PROJECT_ROOT: remoteRoot,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: request.method,
          CONTENT_TYPE: request.headers["content-type"] || "",
          CONTENT_LENGTH: request.headers["content-length"] || "",
          REMOTE_USER: username,
        },
        windowsHide: true,
      });
      backendChildren.add(child);
      const chunks = [];
      child.stdin.on("error", () => {});
      request.pipe(child.stdin);
      child.stdout.on("data", (data) => chunks.push(data));
      child.stderr.resume();
      child.on("error", () => {
        response.writeHead(500);
        response.end();
      });
      child.on("close", (code) => {
        backendChildren.delete(child);
        if (response.writableEnded) return;
        if (code !== 0) {
          response.writeHead(500);
          response.end();
          return;
        }
        const content = Buffer.concat(chunks);
        const boundary = content.indexOf("\r\n\r\n");
        if (boundary < 0) {
          response.writeHead(500);
          response.end();
          return;
        }
        for (const line of content.subarray(0, boundary).toString("utf8").split("\r\n")) {
          const colon = line.indexOf(":");
          if (colon < 0) continue;
          if (line.slice(0, colon).toLowerCase() === "status")
            response.statusCode = Number.parseInt(line.slice(colon + 1), 10);
          else response.setHeader(line.slice(0, colon), line.slice(colon + 1).trim());
        }
        response.end(content.subarray(boundary + 4));
      });
    },
  );
  await new Promise((done, fail) => {
    https.once("error", fail);
    https.listen(0, "127.0.0.1", done);
  });
  const tlsPort = https.address().port;
  const url = `https://${host}:${tlsPort}/fixture.git`;
  const httpOptions = [
    "-c",
    "http.proxy=",
    "-c",
    "http.sslVerify=true",
    "-c",
    "http.sslBackend=openssl",
    "-c",
    `http.curloptResolve=${host}:${tlsPort}:127.0.0.1`,
  ];
  await assert.rejects(g([...httpOptions, "ls-remote", url]), /certificate|SSL/i);
  assert.equal(authenticated, 0);
  credential = `protocol=https\nhost=${host}:${tlsPort}\nusername=${username}\npassword=${password}\n\n`;
  await run(wincred, ["store"], { input: credential });
  assert.match(
    await run(wincred, ["get"], { input: `protocol=https\nhost=${host}:${tlsPort}\n\n` }),
    /password=/,
  );
  const trustedOptions = [...httpOptions, "-c", `http.sslCAInfo=${certificate}`];
  await g([...trustedOptions, "clone", url, join(root, "https-clone")]);
  await g(["-C", join(root, "https-clone"), ...trustedOptions, "push", "origin", "main"]);
  assert.ok(authenticated > 0);
  checks.push("native wincred; HTTPS clone/push with explicit CA; untrusted TLS rejected");

  const java = await probeJavaEnvironment(root, env);
  const maven = await probeMavenEnvironment(root, env);
  assert.equal(java.status, "pass", java.detail);
  assert.equal(maven.status, "pass", maven.detail);
  checks.push("inherited JDK 8 compile/run and Maven version; no project dependencies downloaded");
  await writeFile(
    resolve(".cache/win7-acceptance/developer-tools.json"),
    JSON.stringify(
      {
        result: "PASS",
        git: "2.46.2.windows.1",
        checks,
        java,
        maven,
        scope:
          "Windows Server 2022; fictional repositories/servers/credentials only; real Win7, internal Git/Maven, LFS and production Java builds untested",
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${checks.join("; ")}`);
} finally {
  if (credential) await run(wincred, ["erase"], { input: credential });
  for (const client of sshClients) client.destroy();
  for (const child of backendChildren) child.kill();
  if (ssh) await new Promise((done) => ssh.close(done));
  if (https) {
    https.closeAllConnections();
    await new Promise((done) => https.close(done));
  }
  await rm(root, { recursive: true, force: true });
  await rm(tlsRoot, { recursive: true, force: true });
}
