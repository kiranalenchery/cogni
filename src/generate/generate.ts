import type { SearchResult } from "../store/vectorStore";

const OLLAMA_GENERATE_URL = "http://localhost:11434/api/generate";
const GENERATION_MODEL = "llama3.2:3b";

export interface ConversationTurn {
  question: string;
  answer: string;
}

function buildPrompt(
  question: string,
  results: SearchResult[],
  history: ConversationTurn[],
): string {
  const sourceBlocks = results
    .map((r, i) => {
      const label = `${r.chunk.filePath}:${r.chunk.startLine}-${r.chunk.endLine}`;
      return `--- SOURCE ${i + 1}: ${label} ---\n${r.chunk.text}`;
    })
    .join("\n\n");

  const historyBlock =
    history.length > 0
      ? `RECENT CONVERSATION (only use this to resolve references like "it" or "that function"):\n` +
        history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n") +
        "\n\n"
      : "";

  return `You are Cogni, an engineering assistant helping developers at this company build software.

Answer only the single question given after "QUESTION:" below. Do not print the words "QUESTION" or "ANSWER" as labels — write the answer directly.

For "how do I build/implement X" questions, answer in two parts:
1. A short explanation of the general engineering approach.
2. A section starting exactly with "In this codebase:" describing whether the SOURCE blocks below already show this being done here. If none of the sources are relevant, say so plainly instead of guessing.

Cite a source inline like "(Source 2)" only when that exact source's text supports the claim. If unsure which source supports something, do not attach a number.

When reproducing code, copy it exactly from the SOURCE blocks — never invent function names, endpoints, or logic not shown there.

If the question asks about a specific fact or detail not present in the SOURCE blocks, say so directly.

${historyBlock}${sourceBlocks}

QUESTION: ${question}

ANSWER:`;
}

export async function generateAnswer(
  question: string,
  results: SearchResult[],
  history: ConversationTurn[] = [],
): Promise<string> {
  const prompt = buildPrompt(question, results, history);

  const res = await fetch(OLLAMA_GENERATE_URL, {
    method: "POST",
    body: JSON.stringify({
      model: GENERATION_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to call generate API: ${res.status} ${res.statusText}`,
    );
  }

  const data = await res.json();
  return data.response.trim();
}
