import * as vscode from 'vscode';
import { ExplainPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
	const cmd = vscode.commands.registerCommand('exp.explainSelection', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.selection.isEmpty) {
			vscode.window.showInformationMessage('Select some code first.');
			return;
		}
		ExplainPanel.show().start(
			editor.document.languageId,
			editor.document.getText(editor.selection)
		);
	});

	context.subscriptions.push(cmd);
}

export function deactivate() {}
