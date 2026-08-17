import type { HookEvent } from './hook-adapter.ts';

export interface ActionSelection {
  name: string;
  reason: string;
}

function getCommandText(toolInput: Record<string, unknown> = {}): string {
  return String(toolInput.command || toolInput.cmd || toolInput.script || toolInput.code || '');
}

export function toolFailed(toolResponse?: Record<string, unknown>): boolean {
  if (!toolResponse) {
    return false;
  }
  if (toolResponse.success === false) {
    return true;
  }
  const exitCode = (toolResponse.exitCode ?? toolResponse.exit_code) as number | undefined;
  if (exitCode !== undefined && Number(exitCode) !== 0) {
    return true;
  }
  if (toolResponse.error || toolResponse.errorMessage) {
    return true;
  }
  return /^(error|failed|failure)$/i.test(String(toolResponse.status || ''));
}

/** Maps a TRAE hook event to one of the built-in state ids. */
export function selectAction(event: HookEvent): ActionSelection {
  const eventName = String(event.hook_event_name || 'Manual');
  const toolName = String(event.tool_name || '');
  const commandText = getCommandText(event.tool_input);
  const readOnlyTool = /read|grep|glob|search|fetch|ls/i.test(toolName);

  switch (eventName) {
    case 'SessionStart':
      return { name: 'waving', reason: '新会话开始，播放问候动画。' };
    case 'SessionEnd':
      return { name: 'idle', reason: '会话结束，回到待命。' };
    case 'UserPromptSubmit':
      return { name: 'review', reason: '用户提交了请求，进入审阅状态。' };
    case 'PreToolUse':
      if (
        /run|command|terminal|execute/i.test(toolName) ||
        /\b(npm|pnpm|yarn|pytest|go test|cargo test|mvn test|gradle|pip|curl|git clone)\b/i.test(commandText)
      ) {
        return { name: 'waiting', reason: '即将执行命令或耗时任务。' };
      }
      return {
        name: 'review',
        reason: readOnlyTool ? '只读查询，检视上下文。' : '即将调用工具，进入审阅状态。',
      };
    case 'PostToolUse':
      if (toolFailed(event.tool_response)) {
        return { name: 'failed', reason: '工具执行失败。' };
      }
      if (readOnlyTool) {
        return { name: 'review', reason: '只读查询完成，继续审阅。' };
      }
      if (/diagnostic|test|run|command|terminal|execute/i.test(toolName) || /\b(test|build|lint|check)\b/i.test(commandText)) {
        return { name: 'happy', reason: '命令或校验成功完成。' };
      }
      if (/write|edit|patch|apply/i.test(toolName)) {
        return { name: 'jumping', reason: '文件改动完成，播放提示动画。' };
      }
      return { name: 'idle', reason: '工具执行完成，回到待命。' };
    case 'Stop':
      return { name: 'idle', reason: '回复结束，回到待命。' };
    case 'PreCompact':
      return { name: 'review', reason: '即将进行上下文压缩。' };
    default:
      return { name: 'idle', reason: '未知或手动事件，保持待命。' };
  }
}
