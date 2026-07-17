import {
  process as tslpProcess,
  detectLanguageFromPath,
  hasLanguage,
  type StructureItem,
} from "@kreuzberg/tree-sitter-language-pack";
import { naiveChunk } from "../chunkers/native";

export interface CodeChunk {
  type: string;
  name: string;
  text: string;
  startLine: number;
  endLine: number;
  filePath: string;
}

const ANON_PLACEHOLDER_NAMES = new Set(["anonymous", "part", "untitled"]);

function recoverNameFromText(text: string): string | null {
  const constArrow = text.match(
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
  );
  if (constArrow) return constArrow[1];

  const constFunctionExpr = text.match(
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/,
  );
  if (constFunctionExpr) return constFunctionExpr[1];

  const namedFunctionDecl = text.match(
    /(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
  );
  if (namedFunctionDecl) return namedFunctionDecl[1];

  return null;
}

// Tree-sitter's span for an arrow/function expression starts at the function
// itself (e.g. "(token) => {"), not at the enclosing "const NAME = " — so
// recoverNameFromText never sees the declarator. This looks for that
// declarator immediately preceding the span instead. Returns the matched
// prefix text too, since the chunk's stored `text` needs the same lookback
// applied — not just its `name` — or the declarator (and the identifier in
// it) never appears in what gets embedded/shown to the generation model.
function matchPrecedingDeclarator(
  precedingText: string,
  text: string,
): { name: string; prefix: string } | null {
  if (!/^(\(|async\s|function\b)/.test(text)) return null;
  const declarator = precedingText.match(
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?$/,
  );
  return declarator ? { name: declarator[1], prefix: declarator[0] } : null;
}

function resolveChunk(
  rawName: string | undefined,
  text: string,
  precedingText: string,
): { name: string; text: string } {
  if (rawName && !ANON_PLACEHOLDER_NAMES.has(rawName)) {
    return { name: rawName, text };
  }
  const declaratorMatch = matchPrecedingDeclarator(precedingText, text);
  if (declaratorMatch) {
    return { name: declaratorMatch.name, text: declaratorMatch.prefix + text };
  }
  const recovered = recoverNameFromText(text);
  return { name: recovered ?? rawName ?? "anonymous", text };
}

export function splitChunkInHalf(chunk: CodeChunk): [CodeChunk, CodeChunk] {
  const lines = chunk.text.split("\n");

  if (lines.length <= 1) {
    const mid = Math.floor(chunk.text.length / 2);
    return [
      { ...chunk, text: chunk.text.slice(0, mid), name: `${chunk.name} (part 1)` },
      { ...chunk, text: chunk.text.slice(mid), name: `${chunk.name} (part 2)` },
    ];
  }

  const mid = Math.ceil(lines.length / 2);
  const firstText = lines.slice(0, mid).join("\n");
  const secondText = lines.slice(mid).join("\n");

  return [
    {
      ...chunk,
      text: firstText,
      endLine: chunk.startLine + mid - 1,
      name: `${chunk.name} (part 1)`,
    },
    {
      ...chunk,
      text: secondText,
      startLine: chunk.startLine + mid,
      name: `${chunk.name} (part 2)`,
    },
  ];
}

const DECLARATOR_LOOKBACK_BYTES = 120;

function flattenStructure(
  items: StructureItem[],
  filePath: string,
  sourceBuffer: Buffer,
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (const item of items) {
    if (item.span) {
      const text = sourceBuffer
        .subarray(item.span.startByte, item.span.endByte)
        .toString("utf-8");
      const precedingStart = Math.max(
        0,
        (item.span.startByte ?? 0) - DECLARATOR_LOOKBACK_BYTES,
      );
      const precedingText = sourceBuffer
        .subarray(precedingStart, item.span.startByte)
        .toString("utf-8");
      const resolved = resolveChunk(item.name, text, precedingText);
      chunks.push({
        type: item.kind ?? "Other",
        name: resolved.name,
        text: resolved.text,
        startLine: (item.span.startLine ?? 0) + 1,
        endLine: (item.span.endLine ?? 0) + 1,
        filePath,
      });
    }

    if (item.children?.length) {
      chunks.push(...flattenStructure(item.children, filePath, sourceBuffer));
    }
  }

  return chunks;
}

export async function chunkCodeFile(
  filePath: string,
  sourceCode: string,
): Promise<CodeChunk[]> {
  const language = detectLanguageFromPath(filePath);

  if (!language || !hasLanguage(language)) {
    return naiveChunk(sourceCode, filePath);
  }

  const result = tslpProcess(sourceCode, { language, structure: true });

  if (!result.structure || result.structure.length === 0) {
    return naiveChunk(sourceCode, filePath);
  }

  const sourceBuffer = Buffer.from(sourceCode, "utf-8");
  return flattenStructure(result.structure, filePath, sourceBuffer);
}
