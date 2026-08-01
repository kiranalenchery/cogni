interface OllamaEmbedResponse {
  embeddings: number[][];
}

async function getEmbedding(text: string, taskType: "search_document" | "search_query"): Promise<number[]> {
  const prefixedText = `${taskType}: ${text}`;
  const res = await fetch("http://localhost:11434/api/embed", {
    method: "POST",
    body: JSON.stringify({ model: "nomic-embed-text", input: prefixedText }),
  });
  const data = (await res.json()) as OllamaEmbedResponse;
  const embedding = data.embeddings[0];
  if (!embedding) {
    throw new Error("Embed API returned no embeddings");
  }
  return embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    magnitudeA += ai * ai;
    magnitudeB += bi * bi;
  }
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

const sentences = {
  original: "The connection pool exhausted under heavy load, causing timeouts.",
  nearDuplicate: "The connection pool exhausted under heavy load, causing timeouts.",
  paraphrase: "Database connections ran out during high traffic, leading to timeout errors.",
  related: "The Celery worker queue backed up because of blocking API calls.",
  unrelated: "The company picnic was rescheduled to next Saturday due to rain.",
};

// All treated as "documents" here, since we're comparing document-to-document for this exercise
const embeddings: Record<string, number[]> = {};
for (const [label, text] of Object.entries(sentences)) {
  embeddings[label] = await getEmbedding(text, "search_document");
}

console.log("Similarity to 'original':\n");
const original = embeddings.original;
if (!original) {
  throw new Error("Missing 'original' embedding");
}
for (const label of Object.keys(sentences)) {
  if (label === "original") continue;
  const candidate = embeddings[label];
  if (!candidate) continue;
  const score = cosineSimilarity(original, candidate);
  console.log(`  ${label.padEnd(15)} ${score.toFixed(4)}`);
}