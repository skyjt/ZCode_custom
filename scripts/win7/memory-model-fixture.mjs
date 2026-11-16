import { createServer } from "node:http";

export const MEMORY_MODEL_REPLY = "AIBUDDY7SE_MEMORY_FIRST_SEND_OK";

// 仅监听 loopback 的虚构 OpenAI 模型，用来验收懒启动首发；不接触真实模型或密钥。
export async function startMemoryModelFixture() {
  const requests = [];
  const toolRuns = [];
  const issuedTools = new Map();
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
      let message = { role: "assistant", content: MEMORY_MODEL_REPLY };
      let finishReason = "stop";
      const userIndex = (body.messages ?? []).findLastIndex((item) => item.role === "user");
      const userContent = body.messages?.[userIndex]?.content;
      const prompt =
        typeof userContent === "string"
          ? userContent
          : (userContent ?? []).map((item) => item.text ?? "").join("\n");
      const probe = /\bAIBUDDY7SE_TOOL_PROBE_(\d+)\b/.exec(prompt);
      if (probe && body.tools?.some((tool) => tool.function?.name === "Bash")) {
        const number = Number(probe[1]);
        const id = `memory-tool-${number}`;
        const marker = `AIBUDDY7SE_TOOL_OUTPUT_${number}`;
        const result = body.messages
          .slice(userIndex + 1)
          .find((item) => item.role === "tool" && item.tool_call_id === id);
        if (result) {
          const output =
            typeof result.content === "string"
              ? result.content
              : (result.content ?? []).map((item) => item.text ?? "").join("\n");
          // Bash 成功正文是 stdout；错误里复述 echo 命令不能冒充执行成功。
          if (output.trim() !== marker || !issuedTools.has(id))
            throw new Error("Missing real fixture tool output");
          if (!toolRuns.some((run) => run.number === number))
            toolRuns.push({
              number,
              tool: "Bash",
              elapsedMs: performance.now() - issuedTools.get(id),
              verified: true,
            });
          message = { role: "assistant", content: `AIBUDDY7SE_TOOL_DONE_${number}` };
        } else {
          issuedTools.set(id, performance.now());
          message = {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id,
                type: "function",
                function: {
                  name: "Bash",
                  arguments: JSON.stringify({ command: `echo ${marker}` }),
                },
              },
            ],
          };
          finishReason = "tool_calls";
        }
      }
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        for (const choice of [
          {
            index: 0,
            delta: message.tool_calls
              ? {
                  role: "assistant",
                  tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })),
                }
              : message,
            finish_reason: null,
          },
          { index: 0, delta: {}, finish_reason: finishReason },
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
                message,
                finish_reason: finishReason,
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
    toolRuns,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
