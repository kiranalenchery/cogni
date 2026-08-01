# cogni

A local-first CLI that chunks a codebase (code + markdown), embeds it via a local Ollama model, and answers questions against that index with retrieval-augmented generation.

To install dependencies:

```bash
bun install
```

Requires a local Ollama server with the `nomic-embed-text` and `llama3.2:3b` models pulled.

To index one or more project folders:

```bash
bun src/cli.ts ingest <folder1> <folder2> ... [--verbose]
```

To ask a question against the saved index:

```bash
bun src/cli.ts ask "<your question>"
```

To run an interactive Q&A session:

```bash
bun src/cli.ts
```

See `CLAUDE.md` for architecture and module details. This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Setup

Cogni runs entirely locally — there's no cloud dependency, but that means it needs a local [Ollama](https://ollama.com) instance to embed and generate answers.

### 1. Install and start Ollama

Install Ollama for your platform from [ollama.com/download](https://ollama.com/download), then make sure it's running:

```bash
ollama serve
```

### 2. Pull the required models

Cogni uses one model for embeddings and one for generation:

```bash
ollama pull nomic-embed-text
ollama pull llama3.2:3b
```

### 3. First run

The first time you run any Cogni command (`ingest`, `ask`, or interactive mode), you'll be prompted to confirm your Ollama setup:

```bash
bun src/cli.ts ingest ./my-project
```

```
No config found. Let's set up Cogni.

Ollama base URL (default: http://localhost:11434):
Embed model (default: nomic-embed-text):
Generate model (default: llama3.2:3b):

Saved config to ~/.cogni/config.json
```

Press enter on any prompt to accept the default. These values are saved to `~/.cogni/config.json` and reused on every future run — you won't be asked again.

### Changing your configuration later

To update your settings (for example, if Ollama is running on a different host, or you want to switch models), either:

- Edit `~/.cogni/config.json` directly, or
- Re-run any Cogni command with `--reconfigure` to go through the setup prompts again:

```bash
bun src/cli.ts --reconfigure
```

### Overriding with environment variables

For CI, scripting, or temporary overrides without touching the saved config, set any of the following — these take precedence over `~/.cogni/config.json`:

| Variable | Default |
|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |
| `OLLAMA_GENERATE_MODEL` | `llama3.2:3b` |

### Requirements

Cogni needs Ollama running and reachable at the configured URL for all core commands (`ingest`, `ask`, interactive mode) — there is currently no hosted/cloud model fallback.
