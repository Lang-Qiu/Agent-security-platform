import { exec } from "node:child_process";

export function runCommand(commandInput: string) {
  return exec(commandInput);
}
