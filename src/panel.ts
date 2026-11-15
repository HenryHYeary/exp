import * as vscode from 'vscode';
import * as crypto from 'crypto';
import MarkdownIt from 'markdown-it';
import { ChatMessage, streamChat } from './llm';

const SYSTEM_PROMPT =
  'You are a concise code explainer. Explain what the code does, step by step, and note any pitfalls. ' +
  'If the user asks follow-up questions, answer them using the code from this conversation.';

const md = new MarkdownIt({ html: false, linkify: true });

export class ExplainPanel {
  private static current: ExplainPanel | undefined;

  static show(): ExplainPanel {
    if (ExplainPanel.current) {
      ExplainPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      return ExplainPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'exp',
      'Explain (Local LLM)',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true }
    );
    ExplainPanel.current = new ExplainPanel(panel);
    return ExplainPanel.current;
  }

  private header = '';
  private messages: ChatMessage[] = [];
  private pending =  '';
  private notice = '';
  private busy = false;
  private abort?: AbortController;
  private timer?: NodeJS.Timeout;
  private disposed = false;

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.html = getHtml();
    panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'ready':
          this.render();
          this.postBusy();
          break;
        case 'ask':
          void this.ask(String(msg.text ?? ''));
          break;
        case 'stop':
          this.abort?.abort();
          break;
      }
    });
    panel.onDidDispose(() => {
      this.disposed = true;
      this.abort?.abort();
      clearTimeout(this.timer);
      ExplainPanel.current = undefined;
    });
  }

  start(lang: string, code: string) {
    this.abort?.abort();

    const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((s) => s.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    this.header = `${fence}${lang}\n${code}\n${fence}\n\n---\n\n`;

    this.messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Explain this ${lang} code \n\n${code}` },
    ];
    this.notice = '';
    void this.run();
  }

  private async ask(text: string) {
    text = text.trim();
    if (!text || this.busy || this.messages.length === 0) { return; }

    const last = this.messages[this.messages.length - 1];
    if (this.messages.length > 2 && last.role === 'user') { this.messages.pop(); }

    this.messages.push({ role: 'user', content: text });
    await this.run();
  }

  private async run() {
    const controller = new AbortController();
    this.abort = controller;
    this.pending = '';
    this.notice = '';
    this.setBusy(true);
    this.render();

    const cfg = vscode.workspace.getConfiguration('exp');
    const endpoint = cfg.get<string>('endpoint', 'http://localhost:11434');
    const model = cfg.get<string>('model', 'llama3.1');
    const numCtx = cfg.get<number>('contextLength', 8192);

    let error: string | undefined;
    try {
      await streamChat(
        endpoint,
        model,
        trimHistory(this.messages, numCtx * 3),
        numCtx,
        (chunk) => {
          if (this.abort === controller) { this.append(chunk); }
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') { err = describeError(err, endpoint); }
    }
    
    if (this.abort !== controller) { return; }
    
    clearTimeout(this.timer);
    this.timer = undefined;

    if (this.pending) {
      this.messages.push({ role: 'assistant', content: this.pending });
    }

    this.pending = '';
    this.notice = error ?? '';
    this.setBusy(false);
    this.render();
  }

  append(chunk: string) {
    if (this.disposed) { return; }
    this.pending += chunk;
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.render();
    }, 50);
  }

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.postBusy();
  }

  private postBusy() {
    if (!this.disposed) { this.panel.webview.postMessage({ type: 'busy', busy: this.busy }); } 
  }

  private render() {
    if (this.disposed) { return; }
    let text = this.header;

    const turns = this.messages.filter((m) => m.role !== 'system').slice(1);
    for (const m of turns) {
      text += m.role === 'user' ? quote(m.content) : `${m.content}\n\n`;
    }
    text += this.pending;
    if (this.notice) { text += `\n\n**Error:** ${this.notice}`; }
    
    this.panel.webview.postMessage({ type: 'update', html: md.render(text) });
  }
}

function quote(text: string): string {
  const lines = text.split('\n').map((l, i) => (i === 0 ? `> **You**: ${l}` : `> ${l}`));
  return `\n\n${lines.join('\n')}\n\n`;
}

function trimHistory(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  const [system, first, ...rest] = messages;
  let total =
    system.content.length + first.content.length + rest.reduce((n, m) => n + m.content.length, 0);
  while (rest.length > 2 && total > maxChars) {
    const dropped = rest.splice(1, 2);
    total -= dropped.reduce((n, m) => n + m.content.length, 0);
  }

  return [system, first, ...rest];
}

function describeError(err: any, endpoint: string): string {
  if (err?.cause?.code === 'ECONNREFUSED') { return `Couldn't reach ${endpoint}. Is Ollama turned on?`; }
  return err.message || String(err);
}



function getHtml(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce=${nonce}>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 0 16px 32px;
      line-height: 1.55;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px 12px;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
    :not(pre) > code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
    }
    blockquote {
      margin: 16px 0 8px;
      padding: 2px 12px;
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      background: var(--vscode-textBlockQuote-background); 
    }
    hr { border: none; border-top: 1px solid var(--vscode-panel--border); }
    a { color: var(--vscode-textLink-foreground); }

    #form {
      position: sticky;
      bottom: 0;
      display: flex;
      gap: 8px;
      padding: 8px 0 12px;
      background: var(--vscode-editor-background);
    }
    #input {
      flex: 1;
      resize: none;
      padding: 6px 8px;
      font-family: inherit;
      font-size: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
    }
    #input:focus { outline: 1px solid var(--vscode-focusBorder); }
    button {
      padding: 0 14px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #stop {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button[hidden] { display: none; }
    </style>
</head>
<body>
  <div id="content"></div>
  <form id="form">
    <textarea id="input" rows="2" placeholder="Ask a follow-up (Enter to send, Shift+Enter for a new line)"></textarea>
    <button id="send" type="submit">Send</button>
    <button id="stop" type="button" hidden>Stop</button>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const stop = document.getElementById('stop');
    let busy = false;

    const nearBottom = () => 
      window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'update') {
        const stick = nearBottom();
        content.innerHTML = msg.html;
        if (stick) { window.scrollTo(0, document.body.scrollHeight); }
      } else if (msg.type === 'busy') {
        busy = msg.busy;
        send.hidden = busy;
        stop.hidden = !busy;
      }
    });

    function submit() {
      const text = input.value.trim();
      if (!text || busy) { return; }
      vscode.postMessage({ type: 'ask', text });
      input.value = '';
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    stop.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}