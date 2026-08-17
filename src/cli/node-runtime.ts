import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore -- Node strip-types tests and tsup both support JSON import attributes.
import releaseConfig from '../../release.config.json' with { type: 'json' };
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import { userPaths } from '../shared/paths.ts';

export interface NodeRequirements {
  min: string;
  majors: number[];
  recommended: string;
}

export interface NodeAttempt {
  execPath: string;
  source: string;
  error: string;
}

export interface NodeInfo {
  ok: boolean;
  execPath: string | null;
  version: string | null;
  arch: string | null;
  source: string | null;
  error: string | null;
  attempts: NodeAttempt[];
}

interface NodePathRecord {
  schema: 'trae.pet.node-path.v1';
  execPath: string;
  version: string;
  arch: string;
  resolvedAt: string;
}

interface Candidate {
  execPath: string;
  source: string;
}

interface ProbeOutput {
  version: string;
  arch: string;
  execPath: string;
}

export const SUPPORTED_NODE: NodeRequirements = Object.freeze({
  min: releaseConfig.supportedNode.min,
  majors: [...releaseConfig.supportedNode.majors],
  recommended: releaseConfig.supportedNode.recommended,
});

const PROBE_EXPRESSION = 'JSON.stringify({version:process.versions.node,arch:process.arch,execPath:process.execPath})';

export function parseStableNodeVersion(version: string): [number, number, number] | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return parts as [number, number, number];
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function nodeVersionError(
  version: string,
  requirements: NodeRequirements = SUPPORTED_NODE,
): string | null {
  const parsed = parseStableNodeVersion(version);
  if (!parsed) return `Node ${version} 不是稳定正式版 x.y.z`;
  const minimum = parseStableNodeVersion(requirements.min);
  if (!minimum) return `Node 最低版本配置无效：${requirements.min}`;
  const [major] = parsed;
  if (major % 2 !== 0) return `Node ${version} 是非 LTS 奇数主版本`;
  if (!requirements.majors.includes(major)) {
    return `Node ${version} 不受支持；需要 Node ${requirements.majors.join('/')} LTS`;
  }
  if (compareVersions(parsed, minimum) < 0) {
    return `Node ${version} 过低；最低需要 ${requirements.min}`;
  }
  return null;
}

export function nodePathFile(baseDir = userPaths(process.env.TRAE_PET_DATA_DIR || undefined).baseDir): string {
  return path.join(baseDir, 'hook-runtime', 'node-path.json');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function existingAbsoluteFile(candidate: string): string | null {
  if (!path.isAbsolute(candidate)) return null;
  try {
    return fs.statSync(candidate).isFile() ? path.normalize(candidate) : null;
  } catch {
    return null;
  }
}

function probeNode(execPath: string): ProbeOutput {
  const output = execFileSync(execPath, ['-p', PROBE_EXPRESSION], {
    encoding: 'utf8',
    timeout: 3_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  }).trim();
  const parsed = JSON.parse(output) as Partial<ProbeOutput>;
  if (
    typeof parsed.version !== 'string'
    || typeof parsed.arch !== 'string'
    || !parsed.arch
    || typeof parsed.execPath !== 'string'
    || !path.isAbsolute(parsed.execPath)
  ) {
    throw new Error('Node 探测结果字段无效');
  }
  return parsed as ProbeOutput;
}

function parseNodePathRecord(file: string): NodePathRecord {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('node-path.json 顶层必须是对象');
  }
  const record = raw as Record<string, unknown>;
  const expectedKeys = ['arch', 'execPath', 'resolvedAt', 'schema', 'version'];
  if (
    Object.keys(record).sort().join(',') !== expectedKeys.join(',')
    || record.schema !== 'trae.pet.node-path.v1'
    || typeof record.execPath !== 'string'
    || !path.isAbsolute(record.execPath)
    || typeof record.version !== 'string'
    || !parseStableNodeVersion(record.version)
    || typeof record.arch !== 'string'
    || !record.arch
    || typeof record.resolvedAt !== 'string'
    || !Number.isFinite(Date.parse(record.resolvedAt))
  ) {
    throw new Error('node-path.json schema 或字段无效');
  }
  return record as unknown as NodePathRecord;
}

function recordCandidate(file: string): Candidate | null {
  if (!fs.existsSync(file)) return null;
  const record = parseNodePathRecord(file);
  return { execPath: record.execPath, source: 'node-path.json' };
}

function pathCandidates(): Candidate[] {
  const executable = process.platform === 'win32' ? 'node.exe' : 'node';
  return (process.env.PATH || '').split(path.delimiter)
    .filter(Boolean)
    .map((directory) => ({ execPath: path.resolve(directory, executable), source: 'PATH' }));
}

function commonCandidates(): Candidate[] {
  if (process.platform === 'darwin') {
    return [
      { execPath: '/opt/homebrew/bin/node', source: 'macOS common path' },
      { execPath: '/usr/local/bin/node', source: 'macOS common path' },
    ];
  }
  if (process.platform === 'win32') {
    return [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
    ].filter((root): root is string => Boolean(root))
      .map((root) => ({ execPath: path.join(root, 'nodejs', 'node.exe'), source: 'Windows Program Files' }));
  }
  return [{ execPath: '/usr/bin/node', source: 'Linux common path' }];
}

function candidateList(recordFile: string): { candidates: Candidate[]; attempts: NodeAttempt[] } {
  const candidates: Candidate[] = [];
  const attempts: NodeAttempt[] = [];
  if (process.env.TRAE_PET_NODE) {
    candidates.push({ execPath: process.env.TRAE_PET_NODE, source: 'TRAE_PET_NODE' });
  }
  try {
    const pinned = recordCandidate(recordFile);
    if (pinned) candidates.push(pinned);
  } catch (error) {
    attempts.push({ execPath: recordFile, source: 'node-path.json', error: errorMessage(error) });
  }
  // Inside the Electron main process `process.execPath` is the app binary, and
  // probing it would spawn a second copy of the app instead of a Node runtime.
  if (!process.versions.electron) {
    candidates.push({ execPath: process.execPath, source: 'process.execPath' });
  }
  candidates.push(...pathCandidates(), ...commonCandidates());
  return { candidates, attempts };
}

export function discoverNode(
  requirements: NodeRequirements = SUPPORTED_NODE,
  recordFile = nodePathFile(),
): NodeInfo {
  const { candidates, attempts } = candidateList(recordFile);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = path.isAbsolute(candidate.execPath) ? path.normalize(candidate.execPath) : candidate.execPath;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const file = existingAbsoluteFile(candidate.execPath);
    if (!file) {
      attempts.push({
        execPath: candidate.execPath,
        source: candidate.source,
        error: '候选路径不是绝对且现存的文件',
      });
      continue;
    }
    try {
      const probe = probeNode(file);
      const unsupported = nodeVersionError(probe.version, requirements);
      if (unsupported) throw new Error(unsupported);
      return {
        ok: true,
        execPath: file,
        version: probe.version,
        arch: probe.arch,
        source: candidate.source,
        error: null,
        attempts,
      };
    } catch (error) {
      attempts.push({ execPath: file, source: candidate.source, error: errorMessage(error) });
    }
  }
  return {
    ok: false,
    execPath: null,
    version: null,
    arch: null,
    source: null,
    error: `未找到受支持的 Node ${requirements.majors.join('/')} LTS；请安装 ${requirements.recommended}`,
    attempts,
  };
}

export function readPinnedNode(
  requirements: NodeRequirements = SUPPORTED_NODE,
  file = nodePathFile(),
): NodeInfo {
  const attempts: NodeAttempt[] = [];
  try {
    const record = parseNodePathRecord(file);
    const existing = existingAbsoluteFile(record.execPath);
    if (!existing) throw new Error('固化的 Node 路径已失效');
    const probe = probeNode(existing);
    const unsupported = nodeVersionError(probe.version, requirements);
    if (unsupported) throw new Error(unsupported);
    if (probe.version !== record.version || probe.arch !== record.arch) {
      throw new Error('固化的 Node 记录与实际运行时不一致');
    }
    return {
      ok: true,
      execPath: existing,
      version: probe.version,
      arch: probe.arch,
      source: 'node-path.json',
      error: null,
      attempts,
    };
  } catch (error) {
    const message = errorMessage(error);
    attempts.push({ execPath: file, source: 'node-path.json', error: message });
    return {
      ok: false,
      execPath: null,
      version: null,
      arch: null,
      source: 'node-path.json',
      error: message,
      attempts,
    };
  }
}

export function writeNodePathRecord(info: NodeInfo, file = nodePathFile()): void {
  if (!info.ok || !info.execPath || !info.version || !info.arch) {
    throw new Error('不能写入未通过验证的 Node 记录');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const record: NodePathRecord = {
    schema: 'trae.pet.node-path.v1',
    execPath: info.execPath,
    version: info.version,
    arch: info.arch,
    resolvedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

