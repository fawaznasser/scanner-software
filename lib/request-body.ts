import "server-only";

export async function readJsonObject(request: Request, limit = 16 * 1024): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > limit) throw new RangeError("JSON request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("A JSON object is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new RangeError("JSON request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SyntaxError("A JSON object is required.");
  return payload;
}
