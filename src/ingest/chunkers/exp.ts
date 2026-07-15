// src/ingest/chunkers/exp.ts
import { ingestCodeFolders } from "../ingest";

const rootDirs = [
  "/Users/kiranalenchery/Desktop/Kiran",
  // add more project paths here as you want to test multi-project scope
];

const chunks = await ingestCodeFolders(rootDirs);

console.log(`\nTotal chunks: ${chunks.length}\n`);

const byType = chunks.reduce<Record<string, number>>((acc, c) => {
  acc[c.type] = (acc[c.type] ?? 0) + 1;
  return acc;
}, {});

console.log("Breakdown by type:", byType);