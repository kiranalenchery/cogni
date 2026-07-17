export type QuestionCategory = "CODE" | "HOWTO" | "FACT" | "DEFAULT";

const CODE_VERB_PATTERN =
  /^\s*(write|create|generate|give me|show me)\b.{0,40}\b(function|script|snippet|program|class|method|code)\b/i;
const CODEBASE_REFERENCE_PATTERN =
  /\b(this codebase|our codebase|in (this|our) project|how we|like we do|similar to how|in the code|our project|this project|our system)\b/i;
const FACT_PATTERN =
  /\b(incident|why did|what caused|when did|what happened|outage|postmortem|root cause)\b/i;
const HOWTO_PATTERN =
  /\b(how do i|how to|how does|how can i|how would i|how should i)\b/i;

const CLASSIFY_MODEL = "llama3.2:3b"; // TODO: route through shared LLMProvider once that abstraction exists
const VALID_CATEGORIES = new Set(["CODE", "HOWTO", "FACT", "DEFAULT"]);

function heuristicClassify(question: string): QuestionCategory | null {
  const looksLikeCode = CODE_VERB_PATTERN.test(question);
  const referencesCodebase = CODEBASE_REFERENCE_PATTERN.test(question);
  const looksLikeFact = FACT_PATTERN.test(question);
  const looksLikeHowto = HOWTO_PATTERN.test(question);

  if (looksLikeCode && !referencesCodebase) return "CODE";
  if (looksLikeFact) return "FACT";
  if (looksLikeHowto) return "HOWTO";

  return null; // genuinely ambiguous — fall through to the model
}

async function classifyWithModel(question: string): Promise<QuestionCategory> {
  const prompt = `Classify this question into exactly one category. Respond with only the category word, nothing else.

CODE — asks to write or show a specific piece of code, unrelated to this company's past work
HOWTO — asks how to build/set up something, where this codebase's existing pattern would help
FACT — asks about a specific past incident or implementation detail in this codebase
DEFAULT — anything else, or you're not sure

Question: ${question}

Category:`;

  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0, num_predict: 5 },
      }),
    });
    if (!res.ok) return "DEFAULT";
    const data = await res.json();
    const label = (data.response as string)
      .trim()
      .toUpperCase()
      .split(/\s+/)[0];
    return VALID_CATEGORIES.has(label)
      ? (label as QuestionCategory)
      : "DEFAULT";
  } catch {
    return "DEFAULT"; // classification failing should never break the real answer
  }
}

export async function classifyQuestion(
  question: string,
): Promise<QuestionCategory> {
  return heuristicClassify(question) ?? (await classifyWithModel(question));
}

const TYPE_PREFERENCES: Record<
  Exclude<QuestionCategory, "CODE">,
  Set<string> | null
> = {
  HOWTO: new Set(["Function", "Class", "Method"]),
  FACT: new Set(["Section"]),
  DEFAULT: null,
};

export function preferredTypesForCategory(
  category: QuestionCategory,
): Set<string> | null {
  if (category === "CODE") return null;
  return TYPE_PREFERENCES[category];
}
