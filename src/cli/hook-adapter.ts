export interface HookEvent {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  session_id?: string;
  prompt?: string;
  cwd?: string;
  raw?: string;
  parseError?: string;
}

/**
 * Reads the hook payload from stdin without ever blocking the hook past its
 * host timeout.
 *
 * Some hook runners (TRAE included) write the event JSON to the child's stdin
 * but keep the pipe OPEN for the lifetime of the session, so the `'end'` event
 * never fires. Waiting only for `'end'` makes the CLI hang until the host kills
 * it, so the pet never updates. We instead resolve as soon as the stream is
 * idle after receiving data, fall back to a hard cap when nothing arrives, and
 * skip reading entirely for an interactive TTY.
 */
function readStdin(hardCapMs = 1500, idleMs = 150): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (stdin.isTTY) {
      resolve('');
      return;
    }

    let data = '';
    let settled = false;
    let idleTimer: NodeJS.Timeout | null = null;
    const hardTimer = setTimeout(finish, hardCapMs);

    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(hardTimer);
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      stdin.removeListener('data', onData);
      stdin.removeListener('end', finish);
      stdin.removeListener('error', finish);
      try {
        stdin.pause();
      } catch {
        // Pausing is best-effort; the process exits right after anyway.
      }
      resolve(data);
    }

    function onData(chunk: string): void {
      data += chunk;
      // The payload arrived; resolve shortly after the stream goes quiet even
      // if the writer never closes the pipe.
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(finish, idleMs);
    }

    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.on('end', finish);
    stdin.on('error', finish);
  });
}

/** Picks the first CLI argument that parses as a JSON object, if any. */
function argvJson(args: string[]): string {
  for (const arg of args) {
    const trimmed = (arg || '').trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }
  }
  return '';
}

export async function readHookEvent(inputJson = '', args: string[] = []): Promise<HookEvent> {
  const raw = inputJson || argvJson(args) || (await readStdin());
  if (!raw || !raw.trim()) {
    return { hook_event_name: 'Manual', cwd: process.cwd() };
  }

  try {
    return JSON.parse(raw.replace(/^\uFEFF/, '')) as HookEvent;
  } catch (error) {
    return {
      hook_event_name: 'InvalidInput',
      cwd: process.cwd(),
      raw,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}
