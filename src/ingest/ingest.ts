import { readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { chunkCodeFile, type CodeChunk } from "./chunkers/code";
import { naiveChunk } from "./chunkers/native";
import { chunkMarkdownFile } from "./chunkers/markdown";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "venv",
  ".venv",
  "__pycache__",
  "dist",
  "build",
  ".next",
  "out",
  "migrations",
  "coverage",
  "playwright-report",
  "test-results",
  "chrome-profile",
  ".vscode",
  ".gemini",
  ".opencode",
  ".idea",
  "target",
  ".cache",
]);

const CODE_EXTENSIONS = new Set([".py", ".js", ".jsx", ".ts", ".tsx"]);
const DOC_EXTENSIONS = new Set([".md"]);
const MAX_LINE_LENGTH = 500;

export interface IngestResult {
  chunks: CodeChunk[];
  warnings: string[];
  filesScanned: number;
}

export async function ingestCodeFolder(rootDir: string): Promise<IngestResult> {
  const chunks: CodeChunk[] = [];
  const warnings: string[] = [];
  const filePaths = await walkDirectory(rootDir);

  for (const filePath of filePaths) {
    try {
      const sourceCode = readFileSync(filePath, "utf-8");
      const ext = extname(filePath);

      if (DOC_EXTENSIONS.has(ext)) {
        const docChunks = await chunkMarkdownFile(filePath, sourceCode);
        chunks.push(...docChunks);
        continue;
      }
      if (looksMinified(sourceCode)) {
        warnings.push(`Skipped likely minified/generated file: ${filePath}`);
        continue;
      }

      const fileChunks = await chunkCodeFile(filePath, sourceCode);
      if (fileChunks.length === 0) {
        warnings.push(
          `No structural items found in ${filePath}, used naive chunking`,
        );
      }
      chunks.push(...fileChunks);
    } catch (err) {
      warnings.push(`Skipped ${filePath}: ${(err as Error).message}`);
    }
  }

  return { chunks, warnings, filesScanned: filePaths.length };
}

export async function ingestCodeFolders(
  rootDirs: string[],
): Promise<IngestResult> {
  const allChunks: CodeChunk[] = [];
  const allWarnings: string[] = [];
  let totalScanned = 0;

  for (const rootDir of rootDirs) {
    const result = await ingestCodeFolder(rootDir);
    allChunks.push(...result.chunks);
    allWarnings.push(...result.warnings);
    totalScanned += result.filesScanned;
  }

  return {
    chunks: allChunks,
    warnings: allWarnings,
    filesScanned: totalScanned,
  };
}

function looksMinified(sourceCode: string): boolean {
  return sourceCode.split("\n").some((line) => line.length > MAX_LINE_LENGTH);
}

async function walkDirectory(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
    } else if (
      entry.isFile() &&
      (CODE_EXTENSIONS.has(extname(entry.name)) ||
        DOC_EXTENSIONS.has(extname(entry.name)))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}
