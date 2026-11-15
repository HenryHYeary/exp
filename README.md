# Explain Selection (Local LLM)

A VS Code extension that explains highlighted code using a model running on your own machine through [Ollama](https://ollama.com). Nothing leaves your computer, and you can ask follow-up questions about the code in the same panel.

## Features

- **Explain any selection.** Highlight code, right-click, and choose **Explain Selection (Local LLM)**. The explanation streams into a side panel as the model writes it.
- **Follow-up questions.** Ask about a specific line, why something was written a certain way, or how to change it. The conversation keeps the full context of the code you selected.
- **Markdown rendering.** Responses show formatted text, lists, and code blocks, themed to match your editor.
- **Stop at any time.** Cancel a long response mid-stream. The partial answer stays in the conversation.
- **Fully local and configurable.** Point it at any Ollama model and any endpoint.

## Requirements

1. [Install Ollama](https://ollama.com/download) and make sure it is running.
2. Pull a model. A coding model works well, for example:

   ```bash
   ollama pull qwen2.5-coder:7b
   ```

3. Set `exp.model` to the model you pulled (see Settings below). The default is `llama3.1`.

## Usage

1. Open a file and highlight some code.
2. Right-click and select **Explain Selection (Local LLM)**, or run it from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`). The default keybinding is `Ctrl+Alt+E`.
3. Read the explanation in the panel beside your editor.
4. Type a follow-up in the box at the bottom. `Enter` sends, `Shift+Enter` adds a new line.

Selecting new code and running the command again starts a fresh conversation.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `exp.endpoint` | `http://localhost:11434` | Base URL of your Ollama server. |
| `exp.model` | `llama3.1` | Name of the Ollama model to use. Run `ollama list` to see what you have installed. |
| `exp.contextLength` | `8192` | Context window, in tokens, requested from Ollama. Larger values allow longer conversations but use more memory. |

## Troubleshooting

- **"Couldn't reach http://localhost:11434. Is Ollama turned on?"** Start Ollama and try again. If it runs on another machine or port, update `exp.endpoint`.
- **`HTTP 404` error.** The model in `exp.model` isn't installed. Run `ollama pull <model>` or change the setting to a model from `ollama list`.
- **Follow-ups seem to forget the code.** Long conversations can exceed the context window, and the oldest follow-ups are dropped first. Raise `exp.contextLength`, or select the code again to start fresh.
- **Slow responses.** Try a smaller model. Around 7B parameters is a good balance on a laptop.

## Privacy

Your code is sent only to the endpoint you configure, which is `localhost` by default. The extension makes no other network requests and collects no telemetry.

## Known limitations

- Only one conversation is kept at a time.
- A single selection larger than the model's context window is not split up.
- Only Ollama's chat API is supported.

## License

MIT