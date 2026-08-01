#!/usr/bin/env bun
import { renderBanner, renderStatusLine } from "./ui/banner";
import { ensureConfig } from "./config";
import { ingestCodeFolders } from "./ingest/ingest";
import { embedDocument, embedQuery } from "./embed/embed";
import { generateAnswer, type ConversationTurn } from "./generate/generate";
import { classifyQuestion, preferredTypesForCategory } from "./route/router";
import {
  addChunk,
  clearStore,
  saveStore,
  loadStore,
  getStore,
  search,
} from "./store/vectorStore";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import readline from "node:readline/promises";

const SIMILARITY_THRESHOLD = 0.55;
const MAX_HISTORY_TURNS = 3;

const rawArgs = process.argv.slice(2);
const reconfigure = rawArgs.includes("--reconfigure");
const args = rawArgs.filter(a => a !== "--reconfigure");
const command = args[0];

await ensureConfig(reconfigure);

if (command === "ingest") {
  await runIngest(args.slice(1));
} else if (command === "ask") {
  await runAsk(args.slice(1));
} else {
  await runInteractive();
}

async function runIngest(rawArgs: string[]) {
  const verbose = rawArgs.includes("--verbose");
  const folderArgs = rawArgs.filter(a => a !== "--verbose");

  renderBanner();

  if (folderArgs.length === 0) {
    console.log(chalk.red("Usage: cogni ingest <folder1> <folder2> ... [--verbose]"));
    process.exit(1);
  }

  const resolvedFolders: string[] = [];
  for (const folder of folderArgs) {
    const absolutePath = resolve(folder);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      console.log(chalk.red(`Not a valid directory: ${absolutePath}`));
      process.exit(1);
    }
    resolvedFolders.push(absolutePath);
  }

  renderStatusLine(`> ingesting ${resolvedFolders.length} project(s)_`);
  for (const folder of resolvedFolders) {
    renderStatusLine(`  - ${folder}`);
  }
  console.log();

  const chunkSpinner = ora({ text: "Walking folders and chunking code...", color: "green" }).start();
  const chunkStart = Date.now();
  const { chunks, warnings, filesScanned } = await ingestCodeFolders(resolvedFolders);
  const chunkDuration = ((Date.now() - chunkStart) / 1000).toFixed(1);
  chunkSpinner.succeed(`Chunked ${chunks.length} chunks from ${filesScanned} files in ${chunkDuration}s`);

  const byType = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log();
  renderStatusLine("Breakdown by type:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(chalk.hex("#33ff66")(`  ${type.padEnd(12)} ${count}`));
  }
  console.log();

  clearStore();
  const embedSpinner = ora({ text: `Embedding 0/${chunks.length} chunks...`, color: "green" }).start();
  const embedStart = Date.now();

  for (const [i, chunk] of chunks.entries()) {
    try {
      const textForEmbedding = `${chunk.type}: ${chunk.name} (${chunk.filePath})\n\n${chunk.text}`;
      const embedding = await embedDocument(textForEmbedding);
      addChunk({
        id: `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`,
        text: chunk.text,
        embedding,
        type: chunk.type,
        name: chunk.name,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      });
    } catch (err) {
      warnings.push(`Failed to embed chunk from ${chunk.filePath}:${chunk.startLine} — ${(err as Error).message}`);
    }
    if (i % 10 === 0 || i === chunks.length - 1) {
      embedSpinner.text = `Embedding ${i + 1}/${chunks.length} chunks...`;
    }
  }

  const embedDuration = ((Date.now() - embedStart) / 1000).toFixed(1);
  embedSpinner.succeed(`Embedded ${getStore().length} chunks in ${embedDuration}s`);
  saveStore();
  renderStatusLine(`> saved index to ~/.cogni/index.json_`);

  if (warnings.length > 0) {
    if (verbose) {
      console.log();
      renderStatusLine(`Warnings (${warnings.length}):`);
      for (const warning of warnings) {
        console.log(chalk.hex("#1e9e46")(`  ${warning}`));
      }
    } else {
      console.log();
      renderStatusLine(`${warnings.length} warnings suppressed — rerun with --verbose to see them`);
    }
  }
}

function buildSearchQuery(question: string, history: ConversationTurn[]): string {
  if (history.length === 0) return question;
  const recentQuestions = history.slice(-2).map(h => h.question).join(" ");
  return `${recentQuestions} ${question}`;
}

async function answerQuestion(question: string, history: ConversationTurn[] = []): Promise<string | null> {
  const spinner = ora({ text: "Thinking...", color: "green" }).start();

  const category = await classifyQuestion(question);
  console.log(chalk.dim(`[category: ${category}]`));

  if (category === "CODE") {
    spinner.text = "Writing code...";
    let answer: string;
    try {
      answer = await generateAnswer(question, [], history, "CODE");
    } catch (err) {
      spinner.fail("Generation failed");
      console.log(chalk.red(`  ${(err as Error).message}`));
      return null;
    }
    spinner.succeed("Done");
    console.log();
    console.log(chalk.hex("#33ff66")(answer));
    console.log();
    return answer;
  }

  spinner.text = "Searching...";
  const searchQueryText = buildSearchQuery(question, history);
  const queryEmbedding = await embedQuery(searchQueryText);
  // NOTE: preferredTypesForCategory() is computed but not passed to search() —
  // vectorStore.ts's search() doesn't accept a type-preference argument yet,
  // so category-based ranking preference is not actually applied (see CLAUDE.md).
  const preferredTypes = preferredTypesForCategory(category);
  const results = search(queryEmbedding, 5, searchQueryText);

  const topResult = results[0];
  if (!topResult || topResult.score < SIMILARITY_THRESHOLD) {
    spinner.warn("Nothing relevant found");
    console.log();
    console.log(chalk.hex("#1e9e46")("I don't have relevant information in the indexed knowledge to answer this."));
    console.log();
    return null;
  }

  spinner.text = "Generating answer...";
  let answer: string;
  try {
    answer = await generateAnswer(question, results, history, category);
  } catch (err) {
    spinner.fail("Generation failed");
    console.log(chalk.red(`  ${(err as Error).message}`));
    return null;
  }

  spinner.succeed("Done");
  console.log();
  console.log(chalk.hex("#33ff66")(answer));
  console.log();
  renderStatusLine("sources_");
  for (const r of results) {
    console.log(chalk.hex("#1e9e46")(`  ${r.chunk.filePath}:${r.chunk.startLine}-${r.chunk.endLine} [${r.score.toFixed(3)}]`));
  }
  console.log();

  return answer;
}

async function runAsk(rawArgs: string[]) {
  const question = rawArgs.join(" ");
  if (!question) {
    console.log(chalk.red('Usage: cogni ask "<your question>"'));
    process.exit(1);
  }

  renderBanner();

  if (!loadStore() || getStore().length === 0) {
    console.log(chalk.red("No index found. Run `cogni ingest <folders...>` first."));
    process.exit(1);
  }

  await answerQuestion(question);
}

async function runInteractive() {
  renderBanner();

  if (!loadStore() || getStore().length === 0) {
    console.log(chalk.red("No index found. Run `cogni ingest <folders...>` first."));
    process.exit(1);
  }

  renderStatusLine("> retrieval engine online_");
  renderStatusLine(`loaded: ${getStore().length} chunks\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: ConversationTurn[] = [];

  console.log(chalk.hex("#33ff66")("where should we start digging?"));

  while (true) {
    const input = await rl.question(chalk.hex("#33ff66")("> "));
    const trimmed = input.trim().toLowerCase();

    if (trimmed === "exit" || trimmed === "quit") {
      break;
    }
    if (!trimmed) {
      continue;
    }

    const answer = await answerQuestion(input, history);

    if (answer) {
      history.push({ question: input, answer });
      if (history.length > MAX_HISTORY_TURNS) {
        history.shift();
      }
    }
  }

  rl.close();
}