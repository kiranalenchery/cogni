import { readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { chunkCodeFile, type CodeChunk } from "./chunkers/code";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "venv", ".venv", "__pycache__",
  "dist", "build", ".next", "out", "migrations",
  "coverage", "playwright-report", "test-results",
  "chrome-profile", ".vscode", ".gemini", ".opencode",
  ".idea", "target", ".cache",
]);

const CODE_EXTENSIONS = new Set([".py", ".js", ".jsx", ".ts", ".tsx"]);

const MAX_LINE_LENGTH = 500; // heuristic: longer lines suggest minified/generated code

export async function ingestCodeFolder(rootDir: string): Promise<CodeChunk[]> {
  const allChunks: CodeChunk[] = [];
  const filePaths = await walkDirectory(rootDir);

  console.log(`Found ${filePaths.length} candidate files under ${rootDir}`);

  for (const filePath of filePaths) {
    try {
      const sourceCode = readFileSync(filePath, "utf-8");

      if (looksMinified(sourceCode)) {
        console.warn(`Skipping likely minified/generated file: ${filePath}`);
        continue;
      }

      const chunks = await chunkCodeFile(filePath, sourceCode);
      allChunks.push(...chunks);
    } catch (err) {
      console.warn(`Skipping ${filePath}: ${(err as Error).message}`);
    }
  }

  return allChunks;
}

export async function ingestCodeFolders(rootDirs: string[]): Promise<CodeChunk[]> {
  const allChunks: CodeChunk[] = [];
  for (const rootDir of rootDirs) {
    const chunks = await ingestCodeFolder(rootDir);
    allChunks.push(...chunks);
  }
  return allChunks;
}

function looksMinified(sourceCode: string): boolean {
  const lines = sourceCode.split("\n");
  return lines.some(line => line.length > MAX_LINE_LENGTH);
}

async function walkDirectory(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
    } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}