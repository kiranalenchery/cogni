# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cogni is a CLI (`bin: cogni` → `src/cli.ts`) that walks one or more project folders, chunks their source code into structural units (functions, classes, etc.), and is meant to become a retrieval engine over code/docs/incidents (see the "retrieval engine online" interactive mode). It's early-stage: interactive mode currently just echoes the question back, and there's no persistence/embedding/search layer yet.

## Commands

There are no `scripts` defined in `package.json` yet — run things directly with Bun:

- Install deps: `bun install`
- Run the CLI: `bun src/cli.ts ingest <folder1> <folder2> ... [--verbose]`
- Run in interactive mode: `bun src/cli.ts` (no args)
- Ad-hoc experiments live in `src/ingest/chunkers/exp.ts` (hardcoded local paths — run with `bun src/ingest/chunkers/exp.ts`, edit the `rootDirs` array first)
- No test suite exists yet; use `bun test` once tests are added

## Architecture

**Flow:** `cli.ts` → `ingest/ingest.ts` → `ingest/chunkers/code.ts` → `ingest/chunkers/naive.ts`

- `src/cli.ts` — entry point. Dispatches on `argv[2]`: `ingest <folders...>` runs the batch ingestion path; anything else drops into `runInteractive()`, a readline-based prompt loop (currently a stub).
- `src/ingest/ingest.ts` — recursively walks each root dir (`walkDirectory`), skipping a fixed `SKIP_DIRS` set (`node_modules`, `.git`, build output dirs, etc.) and filtering to `CODE_EXTENSIONS` (`.py .js .jsx .ts .tsx`). For each file it skips likely-minified files (any line > `MAX_LINE_LENGTH` chars) and otherwise calls `chunkCodeFile`. Returns an `IngestResult` (`chunks`, `warnings`, `filesScanned`) — errors and edge cases (minified, no structure found) become warnings rather than throwing, so one bad file doesn't abort a whole ingest run.
- `src/ingest/chunkers/code.ts` — `chunkCodeFile` detects the language via `@kreuzberg/tree-sitter-language-pack` and asks it for structural spans (functions/classes/etc. as `StructureItem[]`), then flattens that tree into a flat `CodeChunk[]` (recursing into `item.children`). Falls back to `naiveChunk` when the language isn't supported or tree-sitter finds no structure.
- `src/ingest/chunkers/naive.ts` — dumb fixed-size (1000 char) chunking fallback; doesn't track real line numbers.
- `src/ui/banner.ts` — all terminal output styling lives here (figlet ASCII banner + phosphor-green `chalk` status lines). Reuse `renderBanner`/`renderStatusLine` for new CLI output rather than styling inline in `cli.ts`.

**Key data shape:** `CodeChunk { type, name, text, startLine, endLine, filePath }` — this is the unit that flows out of ingestion; anything built on top of ingestion (embedding, indexing, retrieval) will consume this shape.

## Conventions

- Bun-only (see below) — no Node/npm/vite equivalents.
- Ingestion is designed to degrade gracefully: prefer adding a warning over throwing when handling a single file/folder fails, so `ingestCodeFolders` can keep going across many files.

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
