#!/usr/bin/env bun
import { renderBanner, renderStatusLine } from "./ui/banner";
import { ingestCodeFolders } from "./ingest/ingest";
import { embedDocument, embedQuery } from "./embed/embed";
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

const args = process.argv.slice(2);
const command = args[0];

if (command === "ingest") {
  await runIngest(args.slice(1));
} else if (command === "ask") {
  await runAsk(args.slice(1));
} else {
  await runInteractive();
}

async function runIngest(rawArgs: string[]) {
  const verbose = rawArgs.includes("--verbose");
  const folderArgs = rawArgs.filter((a) => a !== "--verbose");

  renderBanner();

  if (folderArgs.length === 0) {
    console.log(
      chalk.red("Usage: cogni ingest <folder1> <folder2> ... [--verbose]"),
    );
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

  // --- Chunking phase ---
  const chunkSpinner = ora({
    text: "Walking folders and chunking code...",
    color: "green",
  }).start();

  const chunkStart = Date.now();
  const { chunks, warnings, filesScanned } =
    await ingestCodeFolders(resolvedFolders);
  const chunkDuration = ((Date.now() - chunkStart) / 1000).toFixed(1);

  chunkSpinner.succeed(
    `Chunked ${chunks.length} chunks from ${filesScanned} files in ${chunkDuration}s`,
  );

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

  // --- Embedding phase ---
  clearStore();
  const embedSpinner = ora({
    text: `Embedding 0/${chunks.length} chunks...`,
    color: "green",
  }).start();
  const embedStart = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await embedDocument(chunk.text);
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
      warnings.push(
        `Failed to embed chunk from ${chunk.filePath}:${chunk.startLine}`,
      );
    }

    if (i % 10 === 0 || i === chunks.length - 1) {
      embedSpinner.text = `Embedding ${i + 1}/${chunks.length} chunks...`;
    }
  }

  const embedDuration = ((Date.now() - embedStart) / 1000).toFixed(1);
  embedSpinner.succeed(
    `Embedded ${getStore().length} chunks in ${embedDuration}s`,
  );

  saveStore();
  renderStatusLine(`> saved index to ~/.cogni/index.json_`);

  // --- Warnings ---
  if (warnings.length > 0) {
    if (verbose) {
      console.log();
      renderStatusLine(`Warnings (${warnings.length}):`);
      for (const warning of warnings) {
        console.log(chalk.hex("#1e9e46")(`  ${warning}`));
      }
    } else {
      console.log();
      renderStatusLine(
        `${warnings.length} warnings suppressed — rerun with --verbose to see them`,
      );
    }
  }
}

async function runAsk(rawArgs: string[]) {
  const question = rawArgs.join(" ");

  if (!question) {
    console.log(chalk.red('Usage: cogni ask "<your question>"'));
    process.exit(1);
  }

  renderBanner();

  const loaded = loadStore();
  if (!loaded || getStore().length === 0) {
    console.log(
      chalk.red("No index found. Run `cogni ingest <folders...>` first."),
    );
    process.exit(1);
  }

  renderStatusLine(
    `> searching ${getStore().length} chunks for: "${question}"_\n`,
  );

  const spinner = ora({
    text: "Embedding query and searching...",
    color: "green",
  }).start();

  const queryEmbedding = await embedQuery(question);
  const results = search(queryEmbedding, 5);

  spinner.succeed(`Found ${results.length} matches`);
  console.log();

  for (const [i, result] of results.entries()) {
    console.log(
      chalk.hex("#33ff66")(
        `${i + 1}. [${result.score.toFixed(4)}] ${result.chunk.type}: ${result.chunk.name}`,
      ),
    );
    console.log(
      chalk.hex("#1e9e46")(
        `   ${result.chunk.filePath}:${result.chunk.startLine}-${result.chunk.endLine}`,
      ),
    );
    console.log();
  }
}

async function runInteractive() {
  renderBanner();
  renderStatusLine("> retrieval engine online_");
  renderStatusLine("loaded: code(0) docs(0) incidents(0)\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.hex("#33ff66")("where should we start digging?"));
  const question = await rl.question(chalk.hex("#33ff66")("> "));

  console.log(`\nYou asked: ${question}`);
  rl.close();
}
