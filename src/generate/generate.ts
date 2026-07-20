import type { SearchResult } from "../store/vectorStore";
import type { QuestionCategory } from "../route/router";
import { getConfig, getGenerateUrl } from "../config";

export interface ConversationTurn {
  question: string;
  answer: string;
}

function buildCodePrompt(question: string, history: ConversationTurn[]): string {
  const historyBlock = history.length > 0
    ? `RECENT CONVERSATION (only use this to resolve references like "it" or "that function"):\n` +
      history.map(h => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n") + "\n\n"
    : "";

  return `You are Cogni, an engineering assistant. This question asks for a piece of code using general programming knowledge — it has nothing to do with any specific company codebase. Write real, correct, working code in a fenced code block. Do not mention "sources" or "this codebase" in your answer.

${historyBlock}QUESTION: ${question}

ANSWER:`;
}

function buildGroundedPrompt(
  question: string,
  results: SearchResult[],
  history: ConversationTurn[]
): string {
  const sourceBlocks = results
    .map((r, i) => {
      const label = `${r.chunk.filePath}:${r.chunk.startLine}-${r.chunk.endLine}`;
      return `--- SOURCE ${i + 1}: ${label} ---\n${r.chunk.text}`;
    })
    .join("\n\n");

  const historyBlock = history.length > 0
    ? `RECENT CONVERSATION (only use this to resolve references like "it" or "that function"):\n` +
      history.map(h => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n") + "\n\n"
    : "";

  return `You are Cogni, an engineering assistant helping developers at this company build software.

Answer only the single question given after "QUESTION:" below. Do not print the words "QUESTION" or "ANSWER" as labels — write the answer directly.

If the question asks you to write, generate, or show a specific piece of code, write real, working code in a fenced code block using your own programming knowledge, even if no SOURCE block covers that exact task. Only mention "In this codebase" if a SOURCE block is genuinely relevant to that specific code.

If the question asks "how do I build/implement X" as a design question, or how this codebase already handles something, answer in two parts:
1. A short explanation of the general engineering approach.
2. A section starting exactly with "In this codebase:" describing whether the SOURCE blocks below already show this being done here. If none are relevant, say so plainly.

Cite a source inline like "(Source 2)" only when that exact source's text supports the claim. If unsure, do not attach a number.

When reproducing existing code from the SOURCE blocks, copy it exactly — never invent function names, endpoints, or logic not shown there.

If the question asks about a specific company fact, incident, or implementation detail not in the SOURCE blocks, say so directly instead of guessing. This does not apply to general programming knowledge.

${historyBlock}${sourceBlocks}

QUESTION: ${question}

ANSWER:`;
}

export async function generateAnswer(
  question: string,
  results: SearchResult[],
  history: ConversationTurn[] = [],
  category: QuestionCategory = "DEFAULT"
): Promise<string> {
  const prompt = category === "CODE"
    ? buildCodePrompt(question, history)
    : buildGroundedPrompt(question, results, history);

  const res = await fetch(getGenerateUrl(), {
    method: "POST",
    body: JSON.stringify({
      model: getConfig().generateModel,
      prompt,
      stream: false,
      options: { temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to call generate API: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.response.trim();
}