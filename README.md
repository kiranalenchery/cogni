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
