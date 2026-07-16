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

function flattenStructure(
  items: StructureItem[],
  filePath: string,
  sourceBuffer: Buffer
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (const item of items) {
    if (item.span) {
      chunks.push({
        type: item.kind ?? "Other",
        name: item.name ?? "anonymous",
        text: sourceBuffer.subarray(item.span.startByte, item.span.endByte).toString("utf-8"),
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
  sourceCode: string
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
