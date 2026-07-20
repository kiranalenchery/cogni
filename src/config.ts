import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline/promises";
import chalk from "chalk";
import { renderStatusLine } from "./ui/banner";

const CONFIG_DIR = join(homedir(), ".cogni");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface CogniConfig {
  ollamaBaseUrl: string;
  embedModel: string;
  generateModel: string;
}

const DEFAULT_CONFIG: CogniConfig = {
  ollamaBaseUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  generateModel: "llama3.2:3b",
};

function loadConfigFile(): CogniConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (
      typeof raw.ollamaBaseUrl !== "string" ||
      typeof raw.embedModel !== "string" ||
      typeof raw.generateModel !== "string"
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function saveConfigFile(config: CogniConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function promptForConfig(): Promise<CogniConfig> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  renderStatusLine("> first-time setup — configuring Ollama connection_");
  console.log(chalk.dim("  press enter to accept the default shown in [brackets]\n"));

  const ollamaBaseUrl = (
    await rl.question(chalk.hex("#33ff66")(`Ollama base URL [${DEFAULT_CONFIG.ollamaBaseUrl}]: `))
  ).trim() || DEFAULT_CONFIG.ollamaBaseUrl;

  const embedModel = (
    await rl.question(chalk.hex("#33ff66")(`Embed model [${DEFAULT_CONFIG.embedModel}]: `))
  ).trim() || DEFAULT_CONFIG.embedModel;

  const generateModel = (
    await rl.question(chalk.hex("#33ff66")(`Generate model [${DEFAULT_CONFIG.generateModel}]: `))
  ).trim() || DEFAULT_CONFIG.generateModel;

  rl.close();

  return { ollamaBaseUrl, embedModel, generateModel };
}

let cachedConfig: CogniConfig | null = null;

export function getConfig(): CogniConfig {
  if (cachedConfig) return cachedConfig;
  const fileConfig = loadConfigFile() ?? DEFAULT_CONFIG;
  cachedConfig = {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? fileConfig.ollamaBaseUrl,
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? fileConfig.embedModel,
    generateModel: process.env.OLLAMA_GENERATE_MODEL ?? fileConfig.generateModel,
  };
  return cachedConfig;
}

export function getEmbedUrl(): string {
  return `${getConfig().ollamaBaseUrl.replace(/\/$/, "")}/api/embed`;
}

export function getGenerateUrl(): string {
  return `${getConfig().ollamaBaseUrl.replace(/\/$/, "")}/api/generate`;
}

export async function ensureConfig(forceReconfigure = false): Promise<CogniConfig> {
  if (!forceReconfigure && existsSync(CONFIG_PATH)) {
    return getConfig();
  }

  const config = await promptForConfig();
  saveConfigFile(config);
  cachedConfig = null;

  console.log();
  renderStatusLine(`> saved config to ${CONFIG_PATH}_`);
  console.log(chalk.hex("#1e9e46")(`  ollamaBaseUrl: ${config.ollamaBaseUrl}`));
  console.log(chalk.hex("#1e9e46")(`  embedModel:    ${config.embedModel}`));
  console.log(chalk.hex("#1e9e46")(`  generateModel: ${config.generateModel}`));
  console.log(chalk.dim(`  edit this file directly any time, or rerun with --reconfigure\n`));

  return getConfig();
}
