import fs from 'node:fs';
import path from 'node:path';
import type { HookEvent } from './hook-adapter';
import { basenameOnly, compactText, summarizeCommand } from './redact';

export interface HookDebugEntry {
  ts: string;
  event: string;
  toolName: string | null;
  sessionId: string | null;
  action: string;
  hasPrompt: boolean;
  promptPreview: string | null;
  hasToolInput: boolean;
  toolInputPreview: string | null;
  hasToolResponse: boolean;
  toolResponsePreview: string | null;
  parseError: string | null;
}

function summarizeToolInput(toolInput?: Record<string, unknown>): string | null {
  if (!toolInput) {
    return null;
  }
  if (toolInput.command) {
    return summarizeCommand(toolInput.command, 5, 96) || null;
  }
  if (toolInput.file_path) {
    return basenameOnly(toolInput.file_path) || null;
  }
  if (toolInput.path && toolInput.pattern) {
    return compactText(`${basenameOnly(toolInput.path)} / ${toolInput.pattern}`, 96) || null;
  }
  if (toolInput.pattern) {
    return compactText(toolInput.pattern, 96) || null;
  }
  if (toolInput.url) {
    return compactText(toolInput.url, 96) || null;
  }
  return compactText(JSON.stringify(toolInput), 96) || null;
}

function summarizeToolResponse(toolResponse?: Record<string, unknown>): string | null {
  if (!toolResponse) {
    return null;
  }

  const parts: string[] = [];
  const status = String(toolResponse.status || '').trim();
  const exitCode = toolResponse.exitCode ?? toolResponse.exit_code;
  const error = toolResponse.error ?? toolResponse.errorMessage ?? null;

  if (status) {
    parts.push(`status=${status}`);
  }
  if (exitCode !== undefined && exitCode !== null && String(exitCode).trim() !== '') {
    parts.push(`exitCode=${exitCode}`);
  }
  if (error) {
    parts.push(`error=${compactText(error, 48)}`);
  }

  if (!parts.length) {
    return compactText(JSON.stringify(toolResponse), 96) || null;
  }
  return compactText(parts.join(' '), 96) || null;
}

export function buildHookDebugEntry(event: HookEvent, action: string): HookDebugEntry {
  const toolInput = (event.tool_input || undefined) as Record<string, unknown> | undefined;
  const toolResponse = (event.tool_response || undefined) as Record<string, unknown> | undefined;
  const promptPreview = event.prompt ? compactText(event.prompt, 96) : null;
  const toolInputPreview = summarizeToolInput(toolInput);
  const toolResponsePreview = summarizeToolResponse(toolResponse);

  return {
    ts: new Date().toISOString(),
    event: String(event.hook_event_name || 'Manual'),
    toolName: event.tool_name ? String(event.tool_name) : null,
    sessionId: event.session_id ? String(event.session_id) : null,
    action,
    hasPrompt: Boolean(event.prompt),
    promptPreview,
    hasToolInput: Boolean(toolInput),
    toolInputPreview,
    hasToolResponse: Boolean(toolResponse),
    toolResponsePreview,
    parseError: event.parseError ? compactText(event.parseError, 96) : null,
  };
}

export function writeHookDebugEntry(logsDir: string, entry: HookDebugEntry): void {
  const logPath = path.join(logsDir, 'hook-debug.log');
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Diagnostic logging must never break hook handling.
  }
}
