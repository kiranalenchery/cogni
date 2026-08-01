# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Please go through this file first and accordingly only do stuff here....

## What this is

Cogni is a CLI (`bin: cogni` → `src/cli.ts`) that walks one or more project folders, chunks their source code and markdown docs into structural units, embeds them locally via Ollama, and answers questions against that index using local retrieval-augmented generation. Three commands: `ingest` (chunk + embed + persist), `ask` (classify the question, then either generate directly or retrieve the top-5 matching chunks and — if the best match clears a similarity threshold — generate a source-grounded answer), and a bare interactive mode that runs the same classify-then-retrieve-then-generate loop as a readline REPL with short conversation history (type `exit`/`quit` to leave). `src/generate/generate.ts` builds the prompt and calls a local Ollama model to produce the answer — it's implemented and wired into both `ask` and interactive mode, not a stub. On every invocation, `src/config.ts` (`ensureConfig`) runs first and interactively prompts for Ollama connection settings on first run, persisting them to `~/.cogni/config.json`.

## Commands

There are no `scripts` defined in `package.json` yet — run things directly with Bun:

- Install deps: `bun install`
- Ingest folders (chunks, embeds, and saves the index): `bun src/cli.ts ingest <folder1> <folder2> ... [--verbose]`
- Ask a question against the saved index: `bun src/cli.ts ask "<your question>"`
- Run in interactive mode: `bun src/cli.ts` (no args)
- Any command accepts `--reconfigure` to re-run the first-time Ollama setup prompt (base URL, embed model, generate model) and overwrite `~/.cogni/config.json`.
- Embedding requires a local Ollama server running the configured embed model (`nomic-embed-text` by default). Answer generation additionally requires the configured generate model (`llama3.2:3b` by default) pulled in the same Ollama instance. Both endpoints and models are resolved at runtime by `src/config.ts` (`getEmbedUrl`/`getGenerateUrl`/`getConfig`) from `~/.cogni/config.json`, overridable via the `OLLAMA_BASE_URL`, `OLLAMA_EMBED_MODEL`, and `OLLAMA_GENERATE_MODEL` env vars — there are no more hardcoded URLs in `embed.ts`/`generate.ts`.
- Ad-hoc experiments live in `src/ingest/chunkers/exp.ts` and `src/embed/exp2.ts` (hardcoded local paths/values — edit the file before running, e.g. `bun src/embed/exp2.ts`)
- No test suite exists yet; use `bun test` once tests are added

## Architecture

**Ingest flow:** `cli.ts` (`runIngest`) → `ingest/ingest.ts` → `ingest/chunkers/code.ts` (code) or `ingest/chunkers/markdown.ts` (`.md` docs), each falling back to `ingest/chunkers/native.ts` → `embed/embed.ts` (`embedDocument`) → `store/vectorStore.ts` (`addChunk` + `saveStore`)

**Ask / interactive flow:** `cli.ts` (`runAsk` or `runInteractive`, both funnel through the shared `answerQuestion()`) → `route/router.ts` (`classifyQuestion`) → if category is `CODE`, skip straight to `generate/generate.ts` (`generateAnswer`) with no retrieval and no sources printed; otherwise → `store/vectorStore.ts` (`loadStore`) → `embed/embed.ts` (`embedQuery`) → `store/vectorStore.ts` (`search`, cosine similarity + exact-name boost, top 5) → if the best score clears `SIMILARITY_THRESHOLD` (0.55, defined in `cli.ts`) → `generate/generate.ts` (`generateAnswer`, Ollama `/api/generate`) → prints the answer plus a `sources_` list (file:line ranges + score). Below the threshold, it prints a "nothing relevant found" message and skips generation entirely.

- `src/cli.ts` — entry point. Runs `ensureConfig()` before dispatching on `argv[2]`: `ingest <folders...>` runs chunking + embedding + persists the index; `ask "<question>"` and the bare `runInteractive()` REPL both call the shared `answerQuestion()`, which classifies the question via `classifyQuestion()`, generates directly for `CODE` category, otherwise searches, gates on `SIMILARITY_THRESHOLD`, calls `generateAnswer`, and prints the answer + sources. Interactive mode keeps a bounded `ConversationTurn[]` history (`MAX_HISTORY_TURNS` = 3); `buildSearchQuery()` appends the last two questions to the current one before embedding, so follow-ups like "what about X" retrieve relevant chunks even without an explicit subject.
- `src/config.ts` — `ensureConfig(forceReconfigure?)` runs on every CLI startup; if `~/.cogni/config.json` doesn't exist (or `--reconfigure`/`forceReconfigure` is passed), it interactively prompts for `ollamaBaseUrl`, `embedModel`, and `generateModel` (defaults: `http://localhost:11434`, `nomic-embed-text`, `llama3.2:3b`) and persists the result. `getConfig()` returns the effective config (file values overridden by `OLLAMA_BASE_URL`/`OLLAMA_EMBED_MODEL`/`OLLAMA_GENERATE_MODEL` env vars if set, cached after first read); `getEmbedUrl()`/`getGenerateUrl()` derive the Ollama `/api/embed` and `/api/generate` URLs from it.
- `src/route/router.ts` — `classifyQuestion()` sorts a question into `CODE | HOWTO | FACT | DEFAULT`. It first tries `heuristicClassify()` (regex patterns: a "write/create/generate a function" pattern gated by *not* also referencing "this codebase"/"our project" → `CODE`; incident/outage/root-cause wording → `FACT`; "how do I/how does" wording → `HOWTO`); if none match, it falls back to `classifyWithModel()`, which asks the configured generate model to pick a category label directly. `preferredTypesForCategory()` maps `HOWTO`→`{Function, Class, Method}` and `FACT`→`{Section}` (a hint for which chunk types should rank higher for that category; `CODE`/`DEFAULT` return `null`). Note: `cli.ts` passes this result as a 4th argument to `store/vectorStore.ts`'s `search()`, but that function's current signature only accepts `(queryEmbedding, topK, queryText?)` — the extra argument is silently ignored at runtime, so type-based preference isn't actually applied to ranking yet.
- `src/ingest/ingest.ts` — recursively walks each root dir (`walkDirectory`), skipping a fixed `SKIP_DIRS` set (`node_modules`, `.git`, build output dirs, etc.). Routes files by extension: `DOC_EXTENSIONS` (`.md`) go through `chunkMarkdownFile`; `CODE_EXTENSIONS` (`.py .js .jsx .ts .tsx`) are checked for likely-minified content (any line > `MAX_LINE_LENGTH` chars, skipped with a warning) and otherwise go through `chunkCodeFile`. Returns an `IngestResult` (`chunks`, `warnings`, `filesScanned`) — errors and edge cases (minified, no structure found) become warnings rather than throwing, so one bad file doesn't abort a whole ingest run. Note: the import of the markdown chunker (`./chunkers/markDown`) doesn't match the file's actual casing (`markdown.ts`) — harmless on case-insensitive filesystems (macOS default) but will fail to resolve on case-sensitive ones (most Linux/CI).
- `src/ingest/chunkers/code.ts` — `chunkCodeFile` detects the language via `@kreuzberg/tree-sitter-language-pack` and asks it for structural spans (functions/classes/etc. as `StructureItem[]`), then flattens that tree into a flat `CodeChunk[]` (recursing into `item.children`). Falls back to `naiveChunk` when the language isn't supported or tree-sitter finds no structure. `resolveChunk()` improves on tree-sitter's name when it's missing or a generic placeholder (`anonymous`/`part`/`untitled`), using `matchPrecedingDeclarator()`/`recoverNameFromText()` to pull a real identifier (and, for arrow/function expressions, the preceding `const x = ` declarator text) out of the chunk. Also exports `splitChunkInHalf()` (recursively bisects an oversized chunk by line, falling back to char-midpoint for single-line chunks) — this was wired into a retry-on-context-length-error path in `cli.ts`'s embed loop at one point, but that caller was removed during the config refactor, so `splitChunkInHalf` is currently unused dead code.
- `src/ingest/chunkers/markdown.ts` — `chunkMarkdownFile` parses markdown with the tree-sitter markdown grammar and walks `section` nodes recursively, turning each heading's section into a `DocChunk` (a `CodeChunk` plus `headingPath: string[]` tracking the nested heading trail). Falls back to `naiveChunk` if parsing fails or no sections are found.
- `src/ingest/chunkers/native.ts` — dumb fixed-size (1000 char) chunking fallback (`naiveChunk`, renamed from `naive.ts`); doesn't track real line numbers (`startLine`/`endLine` are always `0`).
- `src/embed/embed.ts` — `embedDocument`/`embedQuery` both call `config.ts`'s `getEmbedUrl()` (a local Ollama `/api/embed` endpoint) with `getConfig().embedModel`, prefixing text with `search_document:` or `search_query:` per that model's convention.
- `src/store/vectorStore.ts` — an in-memory array of `StoredChunk` (a `CodeChunk` plus `id` and `embedding`), persisted as JSON to `~/.cogni/index.json` (`saveStore`/`loadStore`). `search(queryEmbedding, topK, queryText?)` scores every stored chunk by cosine similarity and returns the top-K as `SearchResult[]`; when `queryText` is passed and literally contains a chunk's `name` (and that name isn't a generic placeholder), the score gets a flat `NAME_MATCH_BOOST` (0.2, capped at 1) so exact identifier mentions in the question outrank pure embedding similarity.
- `src/generate/generate.ts` — implemented and wired into both `ask` and interactive mode via `answerQuestion()` in `cli.ts`. `generateAnswer(question, results, history, category)` branches on `QuestionCategory` (from `route/router.ts`): for `CODE` it calls `buildCodePrompt()`, which asks the model to write general-purpose code from its own knowledge with no SOURCE blocks and no "sources" framing; for every other category it calls `buildGroundedPrompt()`, which assembles the question, the retrieved `SearchResult[]` as labeled `SOURCE` blocks, and (if present) a recent-conversation block from `ConversationTurn[]` history — instructing the model to answer only from the sources, cite them inline (e.g. "(Source 2)"), write a two-part answer with an explicit "In this codebase:" section for design/how-it's-done questions, and copy existing code verbatim rather than inventing names/logic. Either prompt is posted to `getGenerateUrl()` with `getConfig().generateModel` (`temperature: 0.3`, `stream: false`); the trimmed response text is returned.
- `src/ui/banner.ts` — all terminal output styling lives here (figlet ASCII banner + phosphor-green `chalk` status lines). Reuse `renderBanner`/`renderStatusLine` for new CLI output rather than styling inline in `cli.ts`.

**Key data shapes:**
- `CodeChunk { type, name, text, startLine, endLine, filePath }` — the unit that flows out of ingestion.
- `DocChunk` — `CodeChunk` + `headingPath: string[]`, produced by the markdown chunker.
- `StoredChunk` — `CodeChunk` + `id` + `embedding: number[]`, the persisted/searchable unit in the vector store.
- `SearchResult { chunk: StoredChunk, score: number }` — a single ranked hit returned by `search()`.
- `ConversationTurn { question: string, answer: string }` — one REPL exchange, kept in a bounded history array and fed back into `buildSearchQuery()` and `generateAnswer()` to resolve follow-up references.
- `QuestionCategory` — `"CODE" | "HOWTO" | "FACT" | "DEFAULT"`, produced by `classifyQuestion()` and used by both `answerQuestion()` (to decide whether to retrieve at all) and `generateAnswer()` (to pick a prompt template).
- `CogniConfig { ollamaBaseUrl, embedModel, generateModel }` — persisted to `~/.cogni/config.json`, managed by `src/config.ts`.

## Conventions

- Bun-only (see below) — no Node/npm/vite equivalents.
- Ingestion is designed to degrade gracefully: prefer adding a warning over throwing when handling a single file/folder fails, so `ingestCodeFolders` can keep going across many files.
- Embedding/search/generation commands (`ingest`, `ask`, interactive mode) have a hard runtime dependency on a local Ollama instance — there's no cloud fallback for either the embed or generate model. Connection details live in `~/.cogni/config.json` (see `src/config.ts`), not hardcoded constants; run any command with `--reconfigure` to change them.
- `ask` and interactive mode share one `answerQuestion()` helper in `cli.ts` rather than duplicating the classify/search/threshold/generate/print logic — extend that function (or its call sites) for new question-answering behavior rather than forking it.
- No automated tests yet, and no `package.json` scripts — everything is invoked directly as `bun src/cli.ts ...`.

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
