import { createServer } from "node:http";

export const MEMORY_MODEL_REPLY = "AIBUDDY7SE_MEMORY_FIRST_SEND_OK";

// 仅监听 loopback 的虚构 OpenAI 模型，用来验收懒启动首发；不接触真实模型或密钥。
export async function startMemoryModelFixture() {
  const requests = [];
  const server = createServer((req, res) => {
    void (async () => {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) throw new Error("Fixture request too large");
        chunks.push(chunk);
      }
      const path = new URL(req.url, "http://127.0.0.1").pathname;
      requests.push({ method: req.method, path });
      if (req.method !== "POST" || path !== "/v1/chat/completions") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Unsupported fixture route" } }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const envelope = { id: "memory-fixture", created: 1, model: body.model };
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        for (const choice of [
          {
            index: 0,
            delta: { role: "assistant", content: MEMORY_MODEL_REPLY },
            finish_reason: null,
          },
          { index: 0, delta: {}, finish_reason: "stop" },
        ])
          res.write(
            `data: ${JSON.stringify({ ...envelope, object: "chat.completion.chunk", choices: [choice] })}\n\n`,
          );
        res.end("data: [DONE]\n\n");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ...envelope,
            object: "chat.completion",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: MEMORY_MODEL_REPLY },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      }
    })().catch((error) => {
      res.writeHead(500);
      res.end(String(error));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
