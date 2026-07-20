// src/embed/exp7.ts
import { getStore, loadStore } from "../store/vectorStore";

loadStore();
const store = getStore();

const anonymousCount = store.filter(c => c.name === "anonymous").length;
const total = store.length;

console.log(`Anonymous chunks: ${anonymousCount} / ${total} (${((anonymousCount / total) * 100).toFixed(1)}%)`);

// Break down by file extension, to see which languages/patterns are most affected
const byExt: Record<string, { total: number; anonymous: number }> = {};
for (const chunk of store) {
  const ext = chunk.filePath.split(".").pop() ?? "unknown";
  byExt[ext] ??= { total: 0, anonymous: 0 };
  byExt[ext].total++;
  if (chunk.name === "anonymous") byExt[ext].anonymous++;
}

console.log("\nBy extension:");
for (const [ext, { total, anonymous }] of Object.entries(byExt)) {
  console.log(`  .${ext}: ${anonymous}/${total} anonymous (${((anonymous / total) * 100).toFixed(1)}%)`);
}