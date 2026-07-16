#!/usr/bin/env bun
import { renderBanner, renderStatusLine } from "./ui/banner";
import { ingestCodeFolders } from "./ingest/ingest";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import readline from "node:readline/promises";

const args = process.argv.slice(2);
const command = args[0];

if (command === "ingest") {
  await runIngest(args.slice(1));
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

  const spinner = ora({
    text: "Walking folders and chunking code...",
    color: "green",
  }).start();

  const startTime = Date.now();
  const { chunks, warnings, filesScanned } = await ingestCodeFolders(resolvedFolders);
  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  spinner.succeed(`Ingested ${chunks.length} chunks from ${filesScanned} files in ${durationSeconds}s`);

  const byType = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log();
  renderStatusLine("Breakdown by type:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(chalk.hex("#33ff66")(`  ${type.padEnd(12)} ${count}`));
  }

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