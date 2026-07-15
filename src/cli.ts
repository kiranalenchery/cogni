#!/usr/bin/env bun
import { renderBanner, renderStatusLine } from "./ui/banner";
import readline from "node:readline/promises";
import chalk from "chalk";

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