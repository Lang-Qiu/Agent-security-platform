export interface PortCollectorCommandRunner {
  run(command: string, args: string[], timeoutMs?: number): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

export interface PortCollectionResult {
  tool: string;
  target: string;
  open_ports: number[];
  raw_output: string;
}

export interface OpenSourcePortCollector {
  collect(target: string): Promise<PortCollectionResult>;
}

function toSortedUniquePorts(ports: number[]): number[] {
  return [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))].sort((a, b) => a - b);
}

function parseNmapOpenPorts(stdout: string): number[] {
  const ports: number[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(\d+)\/(tcp|udp)\s+open\b/i);
    if (match) {
      ports.push(Number(match[1]));
    }
  }

  return toSortedUniquePorts(ports);
}

function parseNaabuOpenPorts(stdout: string): number[] {
  const ports: number[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Supports output like "127.0.0.1:443" or "https://x.y.z:8443".
    const match = trimmed.match(/:(\d+)$/);
    if (match) {
      ports.push(Number(match[1]));
    }
  }

  return toSortedUniquePorts(ports);
}

export class NmapPortCollector implements OpenSourcePortCollector {
  runner: PortCollectorCommandRunner;
  binaryPath: string;
  timeoutMs: number;

  constructor(options: { runner: PortCollectorCommandRunner; binaryPath?: string; timeoutMs?: number }) {
    this.runner = options.runner;
    this.binaryPath = options.binaryPath ?? "nmap";
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async collect(target: string): Promise<PortCollectionResult> {
    const execution = await this.runner.run(this.binaryPath, ["-Pn", target], this.timeoutMs);

    if (execution.exitCode !== 0) {
      return {
        tool: "nmap",
        target,
        open_ports: [],
        raw_output: execution.stdout || execution.stderr
      };
    }

    return {
      tool: "nmap",
      target,
      open_ports: parseNmapOpenPorts(execution.stdout),
      raw_output: execution.stdout
    };
  }
}

export class NaabuPortCollector implements OpenSourcePortCollector {
  runner: PortCollectorCommandRunner;
  binaryPath: string;
  timeoutMs: number;

  constructor(options: { runner: PortCollectorCommandRunner; binaryPath?: string; timeoutMs?: number }) {
    this.runner = options.runner;
    this.binaryPath = options.binaryPath ?? "naabu";
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async collect(target: string): Promise<PortCollectionResult> {
    const execution = await this.runner.run(this.binaryPath, ["-host", target, "-silent"], this.timeoutMs);

    if (execution.exitCode !== 0) {
      return {
        tool: "naabu",
        target,
        open_ports: [],
        raw_output: execution.stdout || execution.stderr
      };
    }

    return {
      tool: "naabu",
      target,
      open_ports: parseNaabuOpenPorts(execution.stdout),
      raw_output: execution.stdout
    };
  }
}

export async function collectOpenPortsWithFallback(
  target: string,
  collectors: Array<Pick<OpenSourcePortCollector, "collect">>
): Promise<number[]> {
  for (const collector of collectors) {
    const result = await collector.collect(target);
    if (result.open_ports.length > 0) {
      return result.open_ports;
    }
  }

  return [];
}
