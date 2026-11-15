export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function streamChat(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  numCtx: number,
  onChunk: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch (`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ model, stream: true, messages, options: { num_ctx: numCtx } }),
  });
  if (!res.ok || !res.body) { throw new Error(`HTTP ${res.status}`); }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (line: string) => {
    if (!line.trim()) { return; }
    const json = JSON.parse(line);
    if (json.message?.content) { onChunk(json.message.content); }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) { break; }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    lines.forEach(handle);
  }
  handle(buffer);
}