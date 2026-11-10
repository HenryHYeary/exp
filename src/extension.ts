import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel("Expository");

	const cmd = vscode.commands.registerCommand("exp.explainSelection", async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.selection.isEmpty) {
			vscode.window.showInformationMessage("Select some code first.");
			return;
		}

		const code = editor.document.getText(editor.selection);
		const lang = editor.document.languageId;
		const cfg = vscode.workspace.getConfiguration("exp");

		output.clear();
		output.show(true);

		const controller = new AbortController();

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Explaining selection...",
				cancellable: true,
			},
			async (_progress, token) => {
				token.onCancellationRequested(() => controller.abort());
				try {
					await streamExplanation(
						cfg.get<string>("endpoint", "http://localhost:11434"),
						cfg.get<string>("model", "llama3.1"),
						lang,
						code,
						(chunk) => output.append(chunk),
						controller.signal
					);
				} catch (err: any) {
					if (err.name !== "AbortError") {
						vscode.window.showErrorMessage(`Local LLM call failed: ${err.message}`);
					}
				}
			}
		);
	});

	context.subscriptions.push(cmd, output);
}

async function streamExplanation(
	endpoint: string,
	model: string,
	lang: string,
	code: string,
	onChunk: (text: string) => void,
	signal: AbortSignal	
) {
	const res = await fetch(`${endpoint}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		signal,
		body: JSON.stringify({
			model,
			stream: true,
			messages: [
				{ 
					role: "system",
					content: "You are a concise code explainer. Explain what the code does, step by step, and note any pitfalls. Only focus on explaining the code."
				},
				{
					role: "user",
					content: `Explain this ${lang} code:\n\n${code}`
				}
			]
		})
	});

	if (!res.ok || !res.body) {
		throw new Error(`HTTP ${res.status}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) { break; }
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop()!;
		for (const line of lines) {
			if (!line.trim()) { continue; }
			const json = JSON.parse(line);
			if (json.message?.content) { onChunk(json.message.content); }
		}
	}
} 
