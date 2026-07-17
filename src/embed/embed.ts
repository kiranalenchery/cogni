const OLLAMA_API_URL = "http://localhost:11434/api/embed";
const EMBEDDING_MODEL = "nomic-embed-text";

async function callEmbedAPI(prefixedText: string): Promise<number[]> {
  const res = await fetch(OLLAMA_API_URL, {
    method: "POST",
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: prefixedText }),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "(could not read response body)");
    throw new Error(`Failed to call embed API: ${res.status} ${res.statusText} — ${errorBody}`);
  }
  const data = await res.json();
  return data.embeddings[0];
}
export async function embedDocument(text: string): Promise<number[]> {
  return callEmbedAPI(`search_document: ${text}`);
}

export async function embedQuery(text: string): Promise<number[]> {
  return callEmbedAPI(`search_query: ${text}`);
}
