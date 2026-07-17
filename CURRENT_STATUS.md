# Current Status

_Snapshot generated 2026-07-17 from a full scan of the repository (branch `feature/ui-setup`)._

## What Cogni does today

Cogni is a local-first CLI that turns a codebase into a searchable, question-answerable
knowledge index:

1. **`cogni ingest <folder1> <folder2> ... [--verbose]`**
   Walks each folder, chunks code (`.py .js .jsx .ts .tsx`) and markdown (`.md`) into
   structural units, embeds every chunk locally via Ollama, and persists the result to
   `~/.cogni/index.json`.
2. **`cogni ask "<question>"`**
   Loads the saved index, embeds the question, retrieves the top-5 most similar chunks
   (cosine similarity), and — if the top match clears a similarity threshold — asks a
   local Ollama model to synthesize an answer from those chunks, printing the answer plus
   its sources.
3. **`cogni` (no args)**
   Interactive REPL: loads the index once, then repeatedly takes a question, runs the same
   retrieve-then-generate pipeline, and prints answers until `exit`/`quit`.

This is further along than the checked-in `CLAUDE.md` currently describes (see
[Documentation drift](#documentation-drift-claudemd-vs-code) below) — `ask` and the
answer-generation step are implemented and wired in, and interactive mode is a working
Q&A loop, not a stub.

## End-to-end pipeline

```
ingest:
  cli.ts (runIngest)
    -> ingest/ingest.ts (ingestCodeFolders / walkDirectory, skips SKIP_DIRS)
       -> ingest/chunkers/code.ts      (chunkCodeFile, tree-sitter structural chunks)
       -> ingest/chunkers/markdown.ts  (chunkMarkdownFile, heading-based sections)
       -> ingest/chunkers/native.ts    (naiveChunk, 1000-char fallback for both)
    -> embed/embed.ts (embedDocument, Ollama /api/embed, nomic-embed-text)
    -> store/vectorStore.ts (addChunk, then saveStore -> ~/.cogni/index.json)

ask / interactive:
  cli.ts (runAsk / runInteractive -> answerQuestion)
    -> store/vectorStore.ts (loadStore)
    -> embed/embed.ts (embedQuery)
    -> store/vectorStore.ts (search, cosine similarity, top 5)
    -> [if best score >= SIMILARITY_THRESHOLD (0.55)]
       generate/generate.ts (generateAnswer, Ollama /api/generate, llama3.2:3b)
    -> prints answer + "sources_" list (file:line ranges + score)
```

## Module-by-module state

| Module | State |
|---|---|
| `src/cli.ts` | Fully wired: dispatches `ingest` / `ask` / interactive; shared `answerQuestion()` drives both `ask` and the REPL, including the similarity-threshold gate and error handling around generation failures. |
| `src/ingest/ingest.ts` | Recursively walks folders, skips a fixed `SKIP_DIRS` set, routes `.md` through the markdown chunker and code extensions through the code chunker, degrades to warnings rather than throwing. |
| `src/ingest/chunkers/code.ts` | Detects language via `@kreuzberg/tree-sitter-language-pack`, flattens structural spans into `CodeChunk[]`, falls back to `naiveChunk`. |
| `src/ingest/chunkers/markdown.ts` | Tree-sitter markdown grammar, walks nested `section` nodes into `DocChunk[]` with a `headingPath`, falls back to `naiveChunk`. |
| `src/ingest/chunkers/native.ts` | Fixed 1000-char fallback chunker; `startLine`/`endLine` are always `0` (not tracked). |
| `src/embed/embed.ts` | Calls local Ollama `/api/embed` with `nomic-embed-text`, prefixing `search_document:` / `search_query:`. Hardcoded URL, no cloud fallback. |
| `src/store/vectorStore.ts` | In-memory `StoredChunk[]`, JSON-persisted to `~/.cogni/index.json`. `search()` does brute-force cosine similarity over the whole store (no ANN index — fine at current scale, won't scale to large indices). |
| `src/generate/generate.ts` | **Implemented and wired in** — builds a source-grounded prompt from `SearchResult[]` and calls Ollama `/api/generate` with `llama3.2:3b`. |
| `src/ui/banner.ts` | Figlet banner + phosphor-green `chalk` status line helpers, reused across commands. |
| `src/ingest/chunkers/exp.ts`, `src/embed/exp2.ts` | Throwaway experiment scripts with hardcoded paths/values, not part of the main flow. |

## Documentation drift (`CLAUDE.md` vs. code)

The working copy of `CLAUDE.md` has uncommitted edits that bring it closer to reality, but
it's worth flagging that the previously-committed version was significantly stale — it
described `generate.ts` as non-functional with a misspelled, non-existent import and
called interactive mode "just echoes the question back." Neither is true of the current
code: generation is implemented and interactive mode is a full retrieve-and-generate loop.
The staged edit in the working tree brings the doc up to date; it just hasn't been
committed yet.

## Issues found while scanning

- **Case-sensitive import bug (latent):** `src/ingest/ingest.ts:6` imports
  `"./chunkers/markDown"` but the file on disk is `src/ingest/chunkers/markdown.ts`
  (lowercase). This works today because macOS's default filesystem is case-insensitive,
  but it will fail to resolve on a case-sensitive filesystem (most Linux CI runners,
  Docker images). Worth fixing before this ships anywhere but a Mac.
- **No test suite** — `CLAUDE.md` and `package.json` both note this; nothing under
  `bun test` exists yet despite several non-trivial chunking/parsing code paths.
- **No `package.json` scripts** — everything is invoked as `bun src/cli.ts ...` directly.
- **Hard runtime dependency on Ollama** for both embedding (`nomic-embed-text`) and
  generation (`llama3.2:3b`), with no fallback or health check — `ingest`/`ask` fail
  outright if Ollama isn't running locally.
- **`SIMILARITY_THRESHOLD` (0.55) is a magic number** hardcoded in `cli.ts`, not
  configurable.
- Naive chunking fallback never tracks real line numbers (`startLine`/`endLine` are
  always `0`), which weakens the "sources_" citations whenever a file falls back to it.

## Git state

- Branch: `feature/ui-setup`, up to date with `origin/feature/ui-setup`.
- Uncommitted: `CLAUDE.md` and `src/cli.ts` modified; `src/generate/` untracked (new,
  functional module not yet added to git).
- Other branches exist both locally and on `origin`: `main`, `dev`, `qa`, `prod`.
- Recent history is a steady build-out: ingest refactors → markdown chunking → embedding
  wired into ingest → (uncommitted) `ask` + generation wired into the CLI.

## Dependencies

`@kreuzberg/tree-sitter-language-pack`, `tree-sitter` (+ `tree-sitter-javascript`,
`tree-sitter-typescript`), `chalk`, `figlet`, `ora`. Bun-only; no Node/npm equivalents in use.
