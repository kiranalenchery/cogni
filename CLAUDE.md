# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cogni is a CLI (`bin: cogni` → `src/cli.ts`) that walks one or more project folders, chunks their source code and markdown docs into structural units, embeds them locally via Ollama, and answers questions against that index. Three commands: `ingest` (chunk + embed + persist), `ask` (embed a query and return the top-K matching chunks), and a bare interactive mode that's still a stub (just echoes the question back). There's a `src/generate/` module scaffolded for turning search results into a generated answer, but it isn't wired into the CLI yet.

## Commands

There are no `scripts` defined in `package.json` yet — run things directly with Bun:

- Install deps: `bun install`
- Ingest folders (chunks, embeds, and saves the index): `bun src/cli.ts ingest <folder1> <folder2> ... [--verbose]`
- Ask a question against the saved index: `bun src/cli.ts ask "<your question>"`
- Run in interactive mode: `bun src/cli.ts` (no args)
- Embedding requires a local Ollama server running the `nomic-embed-text` model (`OLLAMA_API_URL` is hardcoded to `http://localhost:11434/api/embed` in `src/embed/embed.ts`) — start it before running `ingest` or `ask`.
- Ad-hoc experiments live in `src/ingest/chunkers/exp.ts` and `src/embed/exp2.ts` (hardcoded local paths/values — edit the file before running, e.g. `bun src/embed/exp2.ts`)
- No test suite exists yet; use `bun test` once tests are added

## Architecture

**Ingest flow:** `cli.ts` (`runIngest`) → `ingest/ingest.ts` → `ingest/chunkers/code.ts` (code) or `ingest/chunkers/markdown.ts` (`.md` docs), each falling back to `ingest/chunkers/native.ts` → `embed/embed.ts` (`embedDocument`) → `store/vectorStore.ts` (`addChunk` + `saveStore`)

**Ask flow:** `cli.ts` (`runAsk`) → `store/vectorStore.ts` (`loadStore`) → `embed/embed.ts` (`embedQuery`) → `store/vectorStore.ts` (`search`, cosine similarity)

- `src/cli.ts` — entry point. Dispatches on `argv[2]`: `ingest <folders...>` runs chunking + embedding + persists the index; `ask "<question>"` loads the persisted index, embeds the question, and prints the top-5 matches; anything else drops into `runInteractive()`, a readline-based prompt loop (currently a stub).
- `src/ingest/ingest.ts` — recursively walks each root dir (`walkDirectory`), skipping a fixed `SKIP_DIRS` set (`node_modules`, `.git`, build output dirs, etc.). Routes files by extension: `DOC_EXTENSIONS` (`.md`) go through `chunkMarkdownFile`; `CODE_EXTENSIONS` (`.py .js .jsx .ts .tsx`) are checked for likely-minified content (any line > `MAX_LINE_LENGTH` chars, skipped with a warning) and otherwise go through `chunkCodeFile`. Returns an `IngestResult` (`chunks`, `warnings`, `filesScanned`) — errors and edge cases (minified, no structure found) become warnings rather than throwing, so one bad file doesn't abort a whole ingest run.
- `src/ingest/chunkers/code.ts` — `chunkCodeFile` detects the language via `@kreuzberg/tree-sitter-language-pack` and asks it for structural spans (functions/classes/etc. as `StructureItem[]`), then flattens that tree into a flat `CodeChunk[]` (recursing into `item.children`). Falls back to `naiveChunk` when the language isn't supported or tree-sitter finds no structure.
- `src/ingest/chunkers/markdown.ts` — `chunkMarkdownFile` parses markdown with the tree-sitter markdown grammar and walks `section` nodes recursively, turning each heading's section into a `DocChunk` (a `CodeChunk` plus `headingPath: string[]` tracking the nested heading trail). Falls back to `naiveChunk` if parsing fails or no sections are found.
- `src/ingest/chunkers/native.ts` — dumb fixed-size (1000 char) chunking fallback (`naiveChunk`, renamed from `naive.ts`); doesn't track real line numbers.
- `src/embed/embed.ts` — `embedDocument`/`embedQuery` both call a local Ollama `/api/embed` endpoint with the `nomic-embed-text` model, prefixing text with `search_document:` or `search_query:` per that model's convention.
- `src/store/vectorStore.ts` — an in-memory array of `StoredChunk` (a `CodeChunk` plus `id` and `embedding`), persisted as JSON to `~/.cogni/index.json` (`saveStore`/`loadStore`). `search(queryEmbedding, topK)` scores every stored chunk by cosine similarity and returns the top-K as `SearchResult[]`.
- `src/generate/generate.ts` — new, not yet functional or wired into `cli.ts`; intended to consume `search()` results and generate an answer. Currently only has a single import (`SrearchResult` — misspelled, no such export exists in `vectorStore.ts`) and won't type-check as-is.
- `src/ui/banner.ts` — all terminal output styling lives here (figlet ASCII banner + phosphor-green `chalk` status lines). Reuse `renderBanner`/`renderStatusLine` for new CLI output rather than styling inline in `cli.ts`.

**Key data shapes:**
- `CodeChunk { type, name, text, startLine, endLine, filePath }` — the unit that flows out of ingestion.
- `DocChunk` — `CodeChunk` + `headingPath: string[]`, produced by the markdown chunker.
- `StoredChunk` — `CodeChunk` + `id` + `embedding: number[]`, the persisted/searchable unit in the vector store.

## Conventions

- Bun-only (see below) — no Node/npm/vite equivalents.
- Ingestion is designed to degrade gracefully: prefer adding a warning over throwing when handling a single file/folder fails, so `ingestCodeFolders` can keep going across many files.
- Embedding/search commands (`ingest`, `ask`) have a hard runtime dependency on a local Ollama instance serving `nomic-embed-text` — there's no cloud embedding fallback.

## Bun usage

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- `Bun.$\`ls\`` instead of execa.

### Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

### Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
