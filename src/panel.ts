import * as vscode from 'vscode';
import * as crypto from 'crypto';
import MarkdownIt from 'markdown-it';

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
  private text = '';
  private abort?: AbortController;
  private timer?: NodeJS.Timeout;
  private disposed = false;

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.html = getHtml();
    panel.onDidDispose(() => {
      this.disposed = true;
      this.abort?.abort();
      clearTimeout(this.timer);
      ExplainPanel.current = undefined;
    });
  }

  begin(lang: string, code: string): AbortController {
    this.abort?.abort();
    this.abort = new AbortController();
    this.text = '';

    const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((s) => s.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    this.header = `${fence}${lang}\n${code}\n${fence}\n\n---\n\n`;


    this.render();
    return this.abort;
  }

  append(chunk: string) {
    if (this.disposed) { return; }
    this.text += chunk;

    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.render();
    }, 50);
  }

  showError(message: string) {
    this.text += `\n\n**Error:** ${message}`;
  }

  finish() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.render();
  }

  private render() {
    if (this.disposed) { return; }
    this.panel.webview.postMessage({
      type: 'update',
      html: md.render(this.header + this.text),
    });
  }
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
  hr { border: none; border-top: 1px solid var(--vscode-panel--border); }
  a { color: var(--vscode-textLink-foreground); }
</style>
<body>
  <div id="content"></div>
  <script nonce="${nonce}">
    const el = document.getElementById('content');
    window.addEventListener('message', (e) => {
      if (e.data.type === 'update') el.innerHTML = e.data.html;
    });
  </script>
</body>
</html>`;
}