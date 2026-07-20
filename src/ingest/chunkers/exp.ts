async function getEmbedding(text: string, taskType: "search_document" | "search_query"): Promise<number[]> {
  const prefixedText = `${taskType}: ${text}`;
  const res = await fetch("http://localhost:11434/api/embed", {
    method: "POST",
    body: JSON.stringify({ model: "nomic-embed-text", input: prefixedText }),
  });
  const data = await res.json();
  return data.embeddings[0];
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
for (const label of Object.keys(sentences)) {
  if (label === "original") continue;
  const score = cosineSimilarity(embeddings.original, embeddings[label]);
  console.log(`  ${label.padEnd(15)} ${score.toFixed(4)}`);
}