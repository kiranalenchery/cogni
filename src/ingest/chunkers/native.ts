// src/ingest/chunkers/naive.ts
import type { CodeChunk } from "./code";

const CHUNK_SIZE = 1000; // characters per chunk, simple fixed-size fallback

export function naiveChunk(sourceCode: string, filePath: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (let i = 0; i < sourceCode.length; i += CHUNK_SIZE) {
    const text = sourceCode.slice(i, i + CHUNK_SIZE);
    chunks.push({
      type: "NaiveChunk",
      name: `chunk_${chunks.length}`,
      text,
      startLine: 0, // naive chunking doesn't track real line numbers
      endLine: 0,
      filePath,
    });
  }

  return chunks;
}
