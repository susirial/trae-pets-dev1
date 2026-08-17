import { interpolate, type PetConfig, type PetStateConfig } from '../shared/pet-config.ts';
import type { PetHint } from '../shared/state-schema.ts';
import { basenameOnly, compactText, summarizeCommand } from './redact.ts';
import { toolFailed } from './action-mapper.ts';
import type { HookEvent } from './hook-adapter.ts';

function inputSummary(event: HookEvent, config: PetConfig): string {
  const input = (event.tool_input || {}) as Record<string, string>;
  if (input.file_path) {
    return basenameOnly(input.file_path);
  }
  if (input.path && input.pattern) {
    return `${basenameOnly(input.path)} / ${compactText(input.pattern, 42)}`;
  }
  if (input.pattern) {
    return compactText(input.pattern, 64);
  }
  if (input.command) {
    return config.privacy.showCommandArgs
      ? compactText(input.command, 84)
      : summarizeCommand(input.command, 5, 64);
  }
  if (input.url) {
    return compactText(input.url, 84);
  }
  return '';
}

function resultSummary(event: HookEvent): string {
  const response = (event.tool_response || {}) as Record<string, unknown>;
  const exitCode = (response.exitCode ?? response.exit_code) as number | undefined;
  if (exitCode !== undefined) {
    return `退出码 ${exitCode}`;
  }
  if (response.errorMessage || response.error) {
    return compactText(response.errorMessage || response.error, 84);
  }
  if (Array.isArray(response.files)) {
    return `${response.files.length} 个文件`;
  }
  if (response.content) {
    return '已返回内容';
  }
  return '';
}

function eventLabelFor(event: HookEvent): string | null {
  const eventName = String(event.hook_event_name || '').trim();
  return eventName || null;
}

function toolLabelFor(event: HookEvent): string | null {
  const toolName = String(event.tool_name || '').trim();
  return toolName || null;
}

function detailFor(event: HookEvent): string {
  const eventName = String(event.hook_event_name || 'Manual');
  const toolName = String(event.tool_name || '');
  if (eventName === 'PreToolUse') {
    return toolName ? `调用前 · ${toolName}` : '工具调用前';
  }
  if (eventName === 'PostToolUse') {
    return toolName ? `调用后 · ${toolName}` : '工具调用后';
  }
  if (eventName === 'UserPromptSubmit') {
    return '用户输入';
  }
  return eventName;
}

function summaryFor(event: HookEvent, config: PetConfig): string | null {
  const eventName = String(event.hook_event_name || 'Manual');
  if (eventName === 'UserPromptSubmit') {
    return config.privacy.showPromptText && event.prompt
      ? compactText(event.prompt, 96)
      : '用户提交了请求';
  }

  const summary = inputSummary(event, config);
  return summary || null;
}

function resultFor(event: HookEvent): string | null {
  const eventName = String(event.hook_event_name || 'Manual');
  if (eventName === 'PreToolUse' || eventName === 'UserPromptSubmit' || eventName === 'SessionStart') {
    return null;
  }

  const result = resultSummary(event);
  return result || null;
}

/**
 * Builds the hint bubble payload by interpolating the (user-editable) text
 * templates configured for the selected state with redacted runtime context.
 */
export function buildHint(
  event: HookEvent,
  state: PetStateConfig,
  reason: string,
  config: PetConfig,
): PetHint {
  const eventName = String(event.hook_event_name || 'Manual');
  const toolName = String(event.tool_name || '');
  const summary = summaryFor(event, config);
  const result = resultFor(event);

  const promptText = config.privacy.showPromptText && event.prompt
    ? compactText(event.prompt, 84)
    : '用户提交了请求';

  const vars: Record<string, string> = {
    petName: config.pet.displayName,
    tool: toolName,
    summary: eventName === 'UserPromptSubmit' ? promptText : (summary || ''),
    result: result || summary || '请查看工具输出',
    event: eventName,
    reason,
  };

  const title = interpolate(state.text.title || state.label, vars) || state.label;
  const message = interpolate(state.text.message || '{reason}', vars) || reason;

  return {
    title: compactText(title, 42),
    message: compactText(message, 96),
    detail: compactText(detailFor(event), 64),
    severity: toolFailed(event.tool_response) ? 'error' : state.severity,
    event: eventName,
    toolName: toolName || null,
    eventLabel: eventLabelFor(event),
    toolLabel: toolLabelFor(event),
    summary,
    result,
    persistent: toolFailed(event.tool_response) || state.severity === 'error',
    ttlMs: state.id === 'idle' ? 3500 : 9000,
    updatedAt: new Date().toISOString(),
  };
}
