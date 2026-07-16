import { getParser } from "@kreuzberg/tree-sitter-language-pack";
import type { Node } from "@kreuzberg/tree-sitter-language-pack";
import { naiveChunk } from "./native";
import type { CodeChunk } from "./code";

export interface DocChunk extends CodeChunk {
  headingPath?: string[];
}

interface HeadingInfo {
  level: number;
  title: string;
}

function getHeadingInfo(sectionNode: Node, sourceBuffer: Buffer): HeadingInfo | null {
  for (let i = 0; i < sectionNode.childCount(); i++) {
    const child = sectionNode.child(i);
    if (child && child.kind() === "atx_heading") {
      let level = 0;
      let title = "";

      for (let j = 0; j < child.childCount(); j++) {
        const grandchild = child.child(j);
        if (!grandchild) continue;

        const kind = grandchild.kind();
        const markerMatch = kind.match(/^atx_h(\d)_marker$/);

        if (markerMatch) {
          level = parseInt(markerMatch[1], 10);
        } else if (kind === "inline") {
          title = sourceBuffer
            .subarray(grandchild.startByte(), grandchild.endByte())
            .toString("utf-8")
            .trim();
        }
      }

      return { level, title: title || "Untitled" };
    }
  }
  return null;
}

function extractSections(
  node: Node,
  sourceBuffer: Buffer,
  filePath: string,
  headingPath: string[]
): DocChunk[] {
  const chunks: DocChunk[] = [];

  for (let i = 0; i < node.childCount(); i++) {
    const child = node.child(i);
    if (!child || child.kind() !== "section") continue;

    const heading = getHeadingInfo(child, sourceBuffer);
    const title = heading?.title ?? "Untitled";
    const currentPath = [...headingPath, title];

    chunks.push({
      type: "Section",
      name: title,
      text: sourceBuffer.subarray(child.startByte(), child.endByte()).toString("utf-8"),
      startLine: child.startPosition().row + 1,
      endLine: child.endPosition().row + 1,
      filePath,
      headingPath: currentPath,
    });

    chunks.push(...extractSections(child, sourceBuffer, filePath, currentPath));
  }

  return chunks;
}

export async function chunkMarkdownFile(
  filePath: string,
  sourceCode: string
): Promise<DocChunk[]> {
  const parser = getParser("markdown");
  const tree = parser.parse(sourceCode);

  if (!tree) {
    return naiveChunk(sourceCode, filePath);
  }

  const sourceBuffer = Buffer.from(sourceCode, "utf-8");
  const chunks = extractSections(tree.rootNode(), sourceBuffer, filePath, []);

  if (chunks.length === 0) {
    return naiveChunk(sourceCode, filePath);
  }

  return chunks;
}