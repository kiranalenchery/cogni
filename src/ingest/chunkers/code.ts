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

function resolveChunkName(rawName: string | undefined, text: string): string {
  if (rawName && !ANON_PLACEHOLDER_NAMES.has(rawName)) {
    return rawName;
  }
  const recovered = recoverNameFromText(text);
  return recovered ?? rawName ?? "anonymous";
}

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
      chunks.push({
        type: item.kind ?? "Other",
        name: resolveChunkName(item.name, text),
        text,
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
