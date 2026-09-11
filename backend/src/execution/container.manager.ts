// ============================================================================
// ContainerManager — Docker container lifecycle management
// ============================================================================
// This module wraps dockerode to provide a clean interface for:
//   1. Creating sandboxed containers with resource limits
//   2. Executing code inside containers
//   3. Capturing stdout/stderr and exit codes
//   4. Handling timeouts and OOM kills gracefully
//
// Security measures applied per container:
//   - --network none: no network access
//   - --memory: hard memory limit with OOM kill
//   - --cpus: CPU quota
//   - --pids-limit: prevents fork bombs
//   - --cap-drop ALL: drop all Linux capabilities
//   - --security-opt no-new-privileges: prevent privilege escalation
//   - --read-only: read-only root filesystem (writable /tmp for code)
//   - Non-root user inside container (configured in sandbox Dockerfile)
// ============================================================================

import Docker from 'dockerode';
import { Readable } from 'stream';
import { config } from '../config';
import { ExecutionResult, Language } from '../types';
import { getLanguageConfig } from './language-runner';
import { createLogger } from '../utils/logger';

const log = createLogger('container-manager');

const docker = new Docker();

/**
 * Create a new sandboxed Docker container for the given language.
 * The container is created but not started — call container.start() separately.
 */
export async function createSandboxContainer(language: Language): Promise<Docker.Container> {
  const langConfig = getLanguageConfig(language);

  const container = await docker.createContainer({
    Image: langConfig.dockerImage,
    Cmd: ['sleep', 'infinity'], // Keep alive for warm pool; overridden on exec
    WorkingDir: '/tmp/code',
    // Security & resource constraints
    HostConfig: {
      // No network access — untrusted code cannot make outbound requests
      NetworkMode: 'none',
      // Memory limit — OOM killer will terminate if exceeded
      Memory: parseMemoryLimit(config.execution.memoryLimit),
      MemorySwap: parseMemoryLimit(config.execution.memoryLimit), // No swap
      // CPU limit — fraction of one core
      NanoCpus: Math.floor(config.execution.cpuLimit * 1e9),
      // Prevent fork bombs
      PidsLimit: config.execution.pidsLimit,
      // Drop ALL Linux capabilities — minimal attack surface
      CapDrop: ['ALL'],
      // Prevent gaining new privileges via setuid, etc.
      SecurityOpt: ['no-new-privileges'],
      // Read-only root filesystem — only /tmp is writable (for user code)
      ReadonlyRootfs: true,
      // Tmpfs mount for /tmp so user code can write there
      Tmpfs: {
        '/tmp/code': 'rw,noexec,nosuid,size=64m',
      },
      // Auto-remove container when it stops
      AutoRemove: true,
    },
    // Environment variables — keep minimal
    Env: ['HOME=/home/sandbox'],
    // Run as the sandbox user (uid 999, created in sandbox Dockerfile)
    User: 'sandbox',
  });

  log.debug({ containerId: container.id, language }, 'Sandbox container created');
  return container;
}

/**
 * Execute user code inside a running container.
 * 
 * Flow:
 * 1. Write user code to /tmp/code/main.<ext> inside the container
 * 2. Run the language-specific command
 * 3. Capture stdout/stderr with timeout enforcement
 * 4. Detect OOM kills and timeouts, surface as clean errors
 */
export async function executeInContainer(
  container: Docker.Container,
  language: Language,
  code: string,
  timeoutMs: number = config.execution.timeoutMs
): Promise<ExecutionResult> {
  const langConfig = getLanguageConfig(language);
  const fileName = `main${langConfig.fileExtension}`;
  const filePath = `/tmp/code/${fileName}`;
  const startTime = Date.now();

  try {
    // Step 1: Write user code into the container
    // We use exec to echo the code into a file since the container is already running
    const writeExec = await container.exec({
      Cmd: ['sh', '-c', `cat > ${filePath}`],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    const writeStream = await writeExec.start({ hijack: true, stdin: true });
    writeStream.write(code);
    writeStream.end();

    // Wait briefly for the write to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 2: Execute the user's code
    const runExec = await container.exec({
      Cmd: langConfig.runCommand(filePath),
      AttachStdout: true,
      AttachStderr: true,
    });

    const execStream = await runExec.start({ hijack: false, stdin: false });

    // Step 3: Capture output with timeout
    const { stdout, stderr } = await captureOutput(execStream, timeoutMs);

    // Step 4: Check exit code and container state
    const execInspect = await runExec.inspect();
    const exitCode = execInspect.ExitCode ?? 1;
    const executionTimeMs = Date.now() - startTime;

    // Check if the container was OOM killed
    let oomKilled = false;
    try {
      const containerInfo = await container.inspect();
      oomKilled = containerInfo.State.OOMKilled || false;
    } catch {
      // Container may already be removed (AutoRemove)
    }

    return {
      stdout: stdout.substring(0, 50_000), // Cap output size
      stderr: oomKilled
        ? 'Error: Memory limit exceeded (OOM killed)\n' + stderr.substring(0, 50_000)
        : stderr.substring(0, 50_000),
      exitCode,
      executionTimeMs,
      timedOut: false,
      oomKilled,
    };
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;

    // Check if this was a timeout
    if (err.message === 'EXECUTION_TIMEOUT') {
      log.warn({ containerId: container.id, executionTimeMs }, 'Execution timed out');
      // Force-kill the container
      try {
        await container.kill();
      } catch {
        // Container may already be dead
      }
      return {
        stdout: '',
        stderr: `Error: Execution timed out after ${timeoutMs}ms`,
        exitCode: 124, // Standard timeout exit code
        executionTimeMs,
        timedOut: true,
        oomKilled: false,
      };
    }

    log.error({ err: err.message, containerId: container.id }, 'Container execution failed');
    return {
      stdout: '',
      stderr: `Internal error: ${err.message}`,
      exitCode: 1,
      executionTimeMs,
      timedOut: false,
      oomKilled: false,
    };
  }
}

/**
 * Capture stdout and stderr from a Docker exec stream, with a hard timeout.
 */
function captureOutput(stream: NodeJS.ReadableStream, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        reject(new Error('EXECUTION_TIMEOUT'));
      }
    }, timeoutMs);

    // Docker multiplexes stdout/stderr into a single stream with headers.
    // We need to demultiplex it.
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    // Use dockerode's demuxStream helper
    const docker = new Docker();
    const stdoutStream = new (require('stream').PassThrough)();
    const stderrStream = new (require('stream').PassThrough)();

    stdoutStream.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    stderrStream.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on('end', () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        stderr = Buffer.concat(stderrChunks).toString('utf-8');
        resolve({ stdout, stderr });
      }
    });

    stream.on('error', (err: Error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

/**
 * Stop and remove a container gracefully. Ignores errors from already-removed containers.
 */
export async function destroyContainer(container: Docker.Container): Promise<void> {
  try {
    await container.stop({ t: 2 });
  } catch {
    // Already stopped or removed
  }
  try {
    await container.remove({ force: true });
  } catch {
    // Already removed (AutoRemove)
  }
}

/**
 * Parse a memory limit string (e.g. "128m") to bytes.
 */
function parseMemoryLimit(limit: string): number {
  const units: Record<string, number> = {
    b: 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };
  const match = limit.toLowerCase().match(/^(\d+)([bkmg])$/);
  if (!match) throw new Error(`Invalid memory limit format: ${limit}`);
  return parseInt(match[1], 10) * units[match[2]];
}
