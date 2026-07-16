import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STORE_DIR = join(homedir(), ".cogni");
const STORE_PATH = join(STORE_DIR, "index.json");

export interface StoredChunk {
  id: string;
  text: string;
  embedding: number[];
  type: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface SearchResult {
  chunk: StoredChunk;
  score: number;
}

let store: StoredChunk[] = [];

export function addChunk(chunk: StoredChunk) {
  store.push(chunk);
}

export function getStore(): StoredChunk[] {
  return store;
}

export function clearStore() {
  store = [];
}

export function saveStore() {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store));
}

export function loadStore(): boolean {
  if (!existsSync(STORE_PATH)) return false;
  store = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  return true;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export function search(
  queryEmbedding: number[],
  topK: number = 5,
): SearchResult[] {
  const scored = store.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
