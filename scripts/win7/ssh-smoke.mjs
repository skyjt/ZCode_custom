import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ssh2 from "ssh2";

// 真正使用安装包中的客户端连接一次性回环服务；不读取用户 SSH 配置、密钥或目标服务器。
const execute = promisify(execFile);
const tools = resolve(process.argv[2]);
const temp = await mkdtemp(join(tmpdir(), "zcode ssh "));
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const publicKey = ssh2.utils.parseKey(privateKey).getPublicSSH();
const fingerprint = `SHA256:${createHash("sha256").update(publicKey).digest("base64").replace(/=+$/, "")}`;
const password = randomBytes(24).toString("hex");
const clients = new Set();
const files = new Map();
const status = ssh2.utils.sftp.STATUS_CODE;
const attr = (path) => ({
  mode: path === "/" ? 0o40755 : 0o100644,
  uid: 0,
  gid: 0,
  size: files.get(path)?.length || 0,
  atime: 0,
  mtime: 0,
});
const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
  clients.add(client);
  client.on("error", () => {});
  client.on("close", () => clients.delete(client));
  client.on("authentication", (ctx) => {
    if (ctx.method === "password" && ctx.username === "fixture" && ctx.password === password)
      ctx.accept();
    else ctx.reject(["password"]);
  });
  client.on("ready", () =>
    client.on("session", (accept) => {
      const session = accept();
      session.on("exec", (accept, reject, info) => {
        if (info.command !== "offline-smoke") return reject();
        const stream = accept();
        stream.write("SSH_EXEC_PASS\n");
        stream.exit(0);
        stream.end();
      });
      session.on("sftp", (accept) => {
        const sftp = accept();
        const handles = new Map();
        let next = 0;
        sftp.on("REALPATH", (id, path) =>
          sftp.name(id, [
            { filename: path === "." ? "/" : path, longname: path, attrs: attr(path) },
          ]),
        );
        for (const op of ["STAT", "LSTAT"])
          sftp.on(op, (id, path) => {
            if (path === "/" || files.has(path)) sftp.attrs(id, attr(path));
            else sftp.status(id, status.NO_SUCH_FILE);
          });
        sftp.on("OPEN", (id, path, flags) => {
          if (flags & ssh2.utils.sftp.OPEN_MODE.WRITE) files.set(path, Buffer.alloc(0));
          if (!files.has(path)) return sftp.status(id, status.NO_SUCH_FILE);
          const handle = Buffer.alloc(4);
          handle.writeUInt32BE(++next);
          handles.set(handle.toString("hex"), path);
          sftp.handle(id, handle);
        });
        sftp.on("WRITE", (id, handle, offset, data) => {
          const path = handles.get(handle.toString("hex"));
          if (!path) return sftp.status(id, status.FAILURE);
          const before = files.get(path);
          const output = Buffer.alloc(Math.max(before.length, offset + data.length));
          before.copy(output);
          data.copy(output, offset);
          files.set(path, output);
          sftp.status(id, status.OK);
        });
        sftp.on("READ", (id, handle, offset, length) => {
          const value = files.get(handles.get(handle.toString("hex")));
          if (!value) return sftp.status(id, status.FAILURE);
          if (offset >= value.length) return sftp.status(id, status.EOF);
          sftp.data(id, value.subarray(offset, offset + length));
        });
        sftp.on("FSTAT", (id, handle) => sftp.attrs(id, attr(handles.get(handle.toString("hex")))));
        sftp.on("CLOSE", (id, handle) => {
          handles.delete(handle.toString("hex"));
          sftp.status(id, status.OK);
        });
      });
    }),
  );
});

try {
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const common = [
    "-batch",
    "-P",
    String(server.address().port),
    "-l",
    "fixture",
    "-pwfile",
    join(temp, "password.txt"),
  ];
  await writeFile(join(temp, "password.txt"), password, { mode: 0o600 });
  const result = await execute(
    join(tools, "putty/PLINK.EXE"),
    ["-ssh", ...common, "-hostkey", fingerprint, "127.0.0.1", "offline-smoke"],
    { timeout: 20000 },
  );
  assert.match(result.stdout, /SSH_EXEC_PASS/);
  await assert.rejects(
    execute(
      join(tools, "putty/PLINK.EXE"),
      [
        "-ssh",
        ...common,
        "-hostkey",
        `SHA256:${Buffer.alloc(32).toString("base64").replace(/=+$/, "")}`,
        "127.0.0.1",
        "offline-smoke",
      ],
      { timeout: 20000 },
    ),
    (error) => {
      assert.match(error.stderr, /host key|fingerprint/i);
      return true;
    },
  );
  const payload = Buffer.from("离线 SFTP 往返验证\n".repeat(10000));
  await writeFile(join(temp, "source.txt"), payload);
  await writeFile(
    join(temp, "batch.txt"),
    'put "source.txt" /roundtrip.txt\nget /roundtrip.txt "received.txt"\nquit\n',
  );
  await execute(
    join(tools, "putty/PSFTP.EXE"),
    [...common, "-hostkey", fingerprint, "-b", join(temp, "batch.txt"), "127.0.0.1"],
    { cwd: temp, timeout: 20000 },
  );
  assert.deepEqual(await readFile(join(temp, "received.txt")), payload);
  console.log("PASS packaged SSH exec, incorrect host key rejection, SFTP upload/download bytes");
} finally {
  for (const client of clients) client.destroy();
  await new Promise((done) => server.close(done));
  await rm(temp, { recursive: true, force: true });
}
