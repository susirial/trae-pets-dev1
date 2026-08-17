import { resolveState } from '@shared/pet-config';
import { ensureDir, createLogger, type Logger } from './logger';
import { loadContext, type CliContext } from './config';
import { readHookEvent, type HookEvent } from './hook-adapter';
import { secureCoreDecision } from './secure-core';
import { buildHookDebugEntry, writeHookDebugEntry } from './hook-debug';
import { resolvePet } from './asset-resolver';
import { readState, writeState } from './state-store';
import { rendererStatus, startRenderer, stopRenderer } from './renderer-manager';
import {
  hookCommandFor,
  installTraeHooks,
  resolveHookLauncher,
  uninstallTraeHooks,
  verifyTraeHooks,
} from './hook-installer';
import { resolveTraeProfiles } from './trae-profiles';
import { discoverNode, SUPPORTED_NODE, type NodeInfo } from './node-runtime';
import packageJson from '../../package.json';

function ensureUserDirs(ctx: CliContext): void {
  ensureDir(ctx.user.baseDir);
  ensureDir(ctx.user.logsDir);
}

function hookOutput(event: HookEvent, action: string): unknown {
  const eventName = event.hook_event_name || 'Manual';
  const output: Record<string, unknown> = {
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: `TRAE pet updated: action=${action}.`,
    },
  };
  if (eventName === 'PreToolUse') {
    const specific = output.hookSpecificOutput as Record<string, unknown>;
    specific.permissionDecision = 'allow';
    specific.permissionDecisionReason = 'TRAE pet only updates animation state and never blocks tools.';
  }
  return output;
}

async function handleHook(
  ctx: CliContext,
  logger: Logger,
  inputJson: string,
  args: string[] = [],
): Promise<unknown> {
  const event = await readHookEvent(inputJson, args);
  const { selection, hint } = secureCoreDecision(event, ctx.config);
  const state = resolveState(ctx.config, selection.name);
  const pet = resolvePet(ctx.config);
  const result = writeState(ctx, {
    event,
    actionSelection: selection,
    state,
    pet,
    hint,
  });
  writeHookDebugEntry(ctx.user.logsDir, buildHookDebugEntry(event, result.state.action));
  logger.info('hook handled', {
    event: event.hook_event_name,
    tool: event.tool_name,
    action: result.state.action,
    preserved: result.preserved,
  });
  return hookOutput(event, result.state.action);
}

function handleAction(ctx: CliContext, logger: Logger, actionName: string): void {
  const state = resolveState(ctx.config, actionName);
  const event: HookEvent = { hook_event_name: 'ManualAction' };
  const selection = { name: state.id, reason: `手动触发：${state.label}` };
  const pet = resolvePet(ctx.config);
  const hint = {
    title: state.text.title || state.label,
    message: state.text.message || selection.reason,
    detail: 'ManualAction',
    severity: state.severity,
    event: 'ManualAction',
    toolName: null,
    eventLabel: 'ManualAction',
    toolLabel: null,
    summary: null,
    result: null,
    persistent: state.severity === 'error',
    ttlMs: state.id === 'idle' ? 3500 : 9000,
    updatedAt: new Date().toISOString(),
  };
  const result = writeState(ctx, {
    event,
    actionSelection: selection,
    state,
    pet,
    hint,
  });
  logger.info('manual action', { action: result.state.action });
  process.stdout.write(`${JSON.stringify({ ok: true, action: result.state.action })}\n`);
}

function handleStatus(ctx: CliContext): void {
  const state = readState(ctx.user.stateFile);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dataDir: ctx.user.baseDir,
    statePath: ctx.user.stateFile,
    configPath: ctx.user.configFile,
    renderer: rendererStatus(ctx),
    state: state
      ? { action: state.action, updatedAt: state.updatedAt, hint: state.hint }
      : null,
  }, null, 2)}\n`);
}

function nodeSummary(node: NodeInfo): Omit<NodeInfo, 'attempts'> {
  const { attempts: _attempts, ...summary } = node;
  return summary;
}

function handleDoctor(ctx: CliContext, args: string[]): void {
  const node = discoverNode();
  const selection = resolveTraeProfiles({ args });
  process.stdout.write(`${JSON.stringify({
    ok: node.ok,
    requirements: SUPPORTED_NODE,
    node: nodeSummary(node),
    checks: {
      platform: process.platform,
      dataDir: ctx.user.baseDir,
      resourcesDir: ctx.resources.resourcesDir,
      states: ctx.config.states.length,
      enabledStates: ctx.config.states.filter((s) => s.enabled).length,
      renderer: rendererStatus(ctx),
      traeProfiles: selection.profiles.map((profile) => profile.id),
      skippedProfiles: selection.skipped,
    },
  }, null, 2)}\n`);
}

export async function run(args: string[]): Promise<void> {
  const ctx = loadContext();
  ensureUserDirs(ctx);
  const logger = createLogger(ctx.user.logsDir);
  const command = args[0] || 'help';

  switch (command) {
    case 'hook':
      process.stdout.write(`${JSON.stringify(
        await handleHook(ctx, logger, process.env.TRAE_PET_INPUT_JSON || '', args.slice(1)),
      )}\n`);
      break;
    case '--version':
    case 'version':
      process.stdout.write(`${JSON.stringify({
        ok: true,
        name: packageJson.name,
        version: packageJson.version,
      }, null, 2)}\n`);
      break;
    case 'install-info': {
      const launcher = resolveHookLauncher();
      const node = discoverNode();
      const selection = resolveTraeProfiles({ args: args.slice(1) });
      process.stdout.write(`${JSON.stringify({
        ok: Boolean(launcher && node.ok && selection.profiles.length > 0),
        name: packageJson.name,
        version: packageJson.version,
        platform: process.platform,
        arch: process.arch,
        launcher,
        hookCommand: launcher ? hookCommandFor(launcher) : null,
        requirements: SUPPORTED_NODE,
        node: nodeSummary(node),
        profileSource: selection.source,
        profiles: selection.profiles,
        skippedProfiles: selection.skipped,
        dataDir: ctx.user.baseDir,
        resourcesDir: ctx.resources.resourcesDir,
      }, null, 2)}\n`);
      break;
    }
    case 'install-hooks': {
      const options = { args: args.slice(1) };
      const installed = installTraeHooks(packageJson.version, options);
      const verified = installed.ok ? verifyTraeHooks(options) : null;
      const hookTest = verified?.ok
        ? await handleHook(ctx, logger, JSON.stringify({
            hook_event_name: 'UserPromptSubmit',
            prompt: 'TRAE Pet installation verification',
          }))
        : null;
      process.stdout.write(`${JSON.stringify({
        ...installed,
        ok: Boolean(installed.ok && verified?.ok && hookTest),
        requirements: SUPPORTED_NODE,
        node: installed.node ? nodeSummary(installed.node) : null,
        verified,
        hookTest,
      }, null, 2)}\n`);
      break;
    }
    case 'verify-hooks': {
      const verified = verifyTraeHooks({ args: args.slice(1) });
      const before = readState(ctx.user.stateFile)?.updatedAtMs ?? 0;
      const hookTest = verified.ok
        ? await handleHook(ctx, logger, JSON.stringify({
            hook_event_name: 'UserPromptSubmit',
            prompt: 'TRAE Pet hook verification',
          }))
        : null;
      const after = readState(ctx.user.stateFile)?.updatedAtMs ?? 0;
      process.stdout.write(`${JSON.stringify({
        ...verified,
        ok: Boolean(verified.ok && hookTest && after > before),
        requirements: SUPPORTED_NODE,
        node: verified.node ? nodeSummary(verified.node) : null,
        stateUpdated: after > before,
        hookTest,
      }, null, 2)}\n`);
      break;
    }
    case 'uninstall-hooks':
      process.stdout.write(`${JSON.stringify(
        uninstallTraeHooks(args.includes('--restore-backup'), { args: args.slice(1) }),
        null,
        2,
      )}\n`);
      break;
    case 'start':
      process.stdout.write(`${JSON.stringify({ ok: true, renderer: startRenderer(ctx) })}\n`);
      break;
    case 'stop':
      process.stdout.write(`${JSON.stringify({ ok: true, renderer: stopRenderer(ctx) })}\n`);
      break;
    case 'restart':
      stopRenderer(ctx);
      process.stdout.write(`${JSON.stringify({ ok: true, renderer: startRenderer(ctx) })}\n`);
      break;
    case 'status':
      handleStatus(ctx);
      break;
    case 'action':
      handleAction(ctx, logger, args[1] || 'idle');
      break;
    case 'doctor':
      handleDoctor(ctx, args.slice(1));
      break;
    default:
      process.stdout.write(
        'Usage: trae-pet <hook|start|stop|restart|status|action <id>|doctor|'
        + 'install-info|install-hooks|verify-hooks|uninstall-hooks [--restore-backup]|--version>\n'
        + 'Hook 命令默认接入全部已安装的 TRAE 版本（~/.trae、~/.trae-cn 等）。\n'
        + '可用 --profile=trae-cn,trae 或 --dir=<绝对路径> 限定目标。\n',
      );
      break;
  }
}
