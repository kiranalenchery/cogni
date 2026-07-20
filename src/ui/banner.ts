import figlet from "figlet";
import chalk from "chalk";

const PHOSPHOR_GREEN = "#33ff66";
const DIM_GREEN = "#1e9e46";

export function renderBanner(): void {
    const banner = figlet.textSync("Cogni", { font: "Ansi Shadow" });
    console.log(chalk.hex(PHOSPHOR_GREEN)(banner));
}

export function renderStatusLine(text: string): void {
  console.log(chalk.hex(DIM_GREEN)(text));
}