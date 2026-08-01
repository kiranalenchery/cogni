import { getConfig, getEmbedUrl } from "../config";

interface OllamaEmbedResponse {
  embeddings: number[][];
}

async function callEmbedAPI(prefixedText: string): Promise<number[]> {
  const res = await fetch(getEmbedUrl(), {
    method: "POST",
    body: JSON.stringify({ model: getConfig().embedModel, input: prefixedText }),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "(could not read response body)");
    throw new Error(`Failed to call embed API: ${res.status} ${res.statusText} — ${errorBody}`);
  }
  const data = (await res.json()) as OllamaEmbedResponse;
  const embedding = data.embeddings[0];
  if (!embedding) {
    throw new Error("Embed API returned no embeddings");
  }
  return embedding;
}
export async function embedDocument(text: string): Promise<number[]> {
  return callEmbedAPI(`search_document: ${text}`);
}

export async function embedQuery(text: string): Promise<number[]> {
  return callEmbedAPI(`search_query: ${text}`);
}
