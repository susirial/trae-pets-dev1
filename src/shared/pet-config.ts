import type { LoopKind, Severity } from './state-schema';

export const CONFIG_SCHEMA = 'trae.pet.config.v5' as const;

/** Placeholders usable inside text templates: {petName} {tool} {summary} {result} {event} {reason} */
export interface StateText {
  title: string;
  message: string;
}

export interface PetAudioConfig {
  enabled: boolean;
  volume: number;
}

export interface StateAudioConfig {
  enabled: boolean;
  mode: 'once' | 'count' | 'infinite';
  count: number;
  volume?: number | null;
}

export interface PetStateConfig {
  id: string;
  /** Human label shown in the settings UI. */
  label: string;
  enabled: boolean;
  /** Built-in states map to TRAE events; custom states are triggered manually. */
  builtin: boolean;
  fps: number;
  loopKind: LoopKind;
  oneShot: boolean;
  priority: number;
  holdMs: number;
  fallback: string;
  severity: Severity;
  text: StateText;
  audio: StateAudioConfig;
}

export interface PetWindowConfig {
  width: number;
  height: number;
  /** Display scale applied over the base width/height. 1 = 100%. */
  scale: number;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  alwaysOnTop: boolean;
  positionMode?: 'preset' | 'manual';
  manualX?: number;
  manualY?: number;
}

export const MIN_PET_SCALE = 0.5;
export const MAX_PET_SCALE = 2.5;

export function clampPetScale(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(MAX_PET_SCALE, Math.max(MIN_PET_SCALE, n));
}

export interface PetPrivacyConfig {
  showPromptText: boolean;
  showCommandArgs: boolean;
  redactSecrets: boolean;
  historyEnabled: boolean;
}

export interface PetPresentationOverride {
  scale?: number;
  reducedMotion?: boolean;
  width?: number;
  height?: number;
}

export type PetSoundSelection =
  | { mode: 'none' }
  | { mode: 'sound'; soundId: string }
  | { mode: 'library'; soundId: string };

export interface PetClickConfig {
  /** Missing inherits the package default; null explicitly disables clicking. */
  action?: string | null;
  /** Missing and `none` are both silent; click audio never inherits state audio. */
  sound?: PetSoundSelection;
}

/** User-owned settings scoped to one package; package updates never overwrite these. */
export interface PetUserOverride {
  audio?: Partial<PetAudioConfig>;
  click?: PetClickConfig;
  presentation?: PetPresentationOverride;
  /** Per config action id. Missing means inherit the package default. */
  soundSelections?: Record<string, PetSoundSelection>;
  /** Legacy per-state playback gate retained for v3/v4 compatibility. */
  stateSounds?: Record<string, boolean>;
}

export interface PetConfig {
  schema: typeof CONFIG_SCHEMA;
  pet: {
    selectedId: string;
    displayName: string;
    description: string;
  };
  privacy: PetPrivacyConfig;
  window: PetWindowConfig;
  audio: PetAudioConfig;
  states: PetStateConfig[];
  petOverrides: Record<string, PetUserOverride>;
}

export const DEFAULT_AUDIO_CONFIG: PetAudioConfig = {
  enabled: true,
  volume: 0.8,
};

export const DEFAULT_STATE_AUDIO: StateAudioConfig = {
  enabled: false,
  mode: 'once',
  count: 1,
  volume: null,
};

/** The nine built-in, event-driven states with editable Chinese text defaults. */
export const DEFAULT_STATES: PetStateConfig[] = [
  {
    id: 'idle', label: '待命', enabled: true, builtin: true,
    fps: 10, loopKind: 'seamless-loop', oneShot: false, priority: 10, holdMs: 0,
    fallback: 'idle', severity: 'info',
    text: { title: '待命中', message: '准备好接收下一个请求 ✨' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'waving', label: '打招呼', enabled: true, builtin: true,
    fps: 10, loopKind: 'one-shot-then-idle', oneShot: true, priority: 30, holdMs: 0,
    fallback: 'idle', severity: 'info',
    text: { title: '你好呀', message: '新的会话开始啦，一起开干 👋' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'running-right', label: '向右奔跑', enabled: true, builtin: true,
    fps: 10, loopKind: 'seamless-loop', oneShot: false, priority: 20, holdMs: 0,
    fallback: 'idle', severity: 'info',
    text: { title: '出发', message: '{summary}' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'running-left', label: '向左奔跑', enabled: true, builtin: true,
    fps: 10, loopKind: 'seamless-loop', oneShot: false, priority: 20, holdMs: 0,
    fallback: 'idle', severity: 'info',
    text: { title: '折返', message: '{summary}' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'waiting', label: '等待执行', enabled: true, builtin: true,
    fps: 8, loopKind: 'seamless-loop', oneShot: false, priority: 50, holdMs: 0,
    fallback: 'idle', severity: 'info',
    text: { title: '执行中', message: '正在运行 {summary}' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'review', label: '审阅', enabled: true, builtin: true,
    fps: 8, loopKind: 'seamless-loop', oneShot: false, priority: 40, holdMs: 0,
    fallback: 'idle', severity: 'info',
    text: { title: '查看中', message: '{summary}' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'jumping', label: '雀跃', enabled: true, builtin: true,
    fps: 12, loopKind: 'one-shot', oneShot: true, priority: 70, holdMs: 1000,
    fallback: 'idle', severity: 'success',
    text: { title: '文件已更新', message: '{summary} 🎉' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'failed', label: '出错', enabled: true, builtin: true,
    fps: 8, loopKind: 'one-shot-then-idle', oneShot: true, priority: 90, holdMs: 1800,
    fallback: 'idle', severity: 'error',
    text: { title: '出错了', message: '{result}' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
  {
    id: 'happy', label: '完成', enabled: true, builtin: true,
    fps: 12, loopKind: 'one-shot-then-idle', oneShot: true, priority: 80, holdMs: 1200,
    fallback: 'idle', severity: 'success',
    text: { title: '搞定', message: '{summary} ✅' },
    audio: { ...DEFAULT_STATE_AUDIO },
  },
];

export const DEFAULT_CONFIG: PetConfig = {
  schema: CONFIG_SCHEMA,
  pet: {
    selectedId: 'trae',
    displayName: 'TRAE 宠物',
    description: '陪你写代码的桌面小伙伴',
  },
  privacy: {
    showPromptText: false,
    showCommandArgs: false,
    redactSecrets: true,
    historyEnabled: true,
  },
  audio: DEFAULT_AUDIO_CONFIG,
  window: {
    width: 280,
    height: 400,
    scale: 1,
    position: 'bottom-right',
    alwaysOnTop: true,
    positionMode: 'preset',
  },
  states: DEFAULT_STATES,
  petOverrides: {},
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAudio(raw: Partial<StateAudioConfig> | undefined): StateAudioConfig {
  return {
    enabled: raw?.enabled ?? DEFAULT_STATE_AUDIO.enabled,
    mode: raw?.mode ?? DEFAULT_STATE_AUDIO.mode,
    count: Math.max(1, Number(raw?.count ?? DEFAULT_STATE_AUDIO.count)),
    volume: raw?.volume ?? DEFAULT_STATE_AUDIO.volume,
  };
}

function cloneState(state: PetStateConfig): PetStateConfig {
  return {
    ...state,
    text: { ...state.text },
    audio: normalizeAudio(state.audio),
  };
}

function mergeStateList(base: PetStateConfig[], override: unknown): PetStateConfig[] {
  if (!Array.isArray(override)) {
    return base.map(cloneState);
  }

  const byId = new Map<string, PetStateConfig>();
  for (const state of base) {
    byId.set(state.id, cloneState(state));
  }

  for (const raw of override as Partial<PetStateConfig>[]) {
    if (!raw || typeof raw.id !== 'string') {
      continue;
    }
    const existing = byId.get(raw.id);
    if (existing) {
      byId.set(raw.id, {
        ...existing,
        ...raw,
        text: { ...existing.text, ...(raw.text ?? {}) },
        audio: normalizeAudio(raw.audio ?? existing.audio),
      });
    } else {
      byId.set(raw.id, normalizeCustomState(raw));
    }
  }

  return Array.from(byId.values());
}

function normalizeCustomState(raw: Partial<PetStateConfig>): PetStateConfig {
  return {
    id: String(raw.id),
    label: raw.label ?? String(raw.id),
    enabled: raw.enabled ?? true,
    builtin: false,
    fps: Number(raw.fps ?? 10),
    loopKind: raw.loopKind ?? 'one-shot-then-idle',
    oneShot: raw.oneShot ?? true,
    priority: Number(raw.priority ?? 60),
    holdMs: Number(raw.holdMs ?? 1500),
    fallback: raw.fallback ?? 'idle',
    severity: raw.severity ?? 'info',
    text: {
      title: raw.text?.title ?? raw.label ?? String(raw.id),
      message: raw.text?.message ?? '',
    },
    audio: normalizeAudio(raw.audio),
  };
}

function normalizeWindow(base: PetWindowConfig, override: unknown): PetWindowConfig {
  const merged = { ...base, ...(isObject(override) ? override : {}) };
  return { ...merged, scale: clampPetScale(merged.scale) };
}

function normalizeSoundSelections(value: unknown): Record<string, PetSoundSelection> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value).flatMap(([stateId, raw]) => {
    if (!stateId || !isObject(raw)) return [];
    if (raw.mode === 'none') {
      return [[stateId, { mode: 'none' } as PetSoundSelection]];
    }
    if (
      (raw.mode === 'sound' || raw.mode === 'library')
      && typeof raw.soundId === 'string'
      && raw.soundId.trim()
    ) {
      return [[stateId, { mode: raw.mode, soundId: raw.soundId.trim() } as PetSoundSelection]];
    }
    return [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizePetOverrides(value: unknown): Record<string, PetUserOverride> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
    if (!id || !isObject(raw)) return [];
    const audio = isObject(raw.audio) ? {
      enabled: typeof raw.audio.enabled === 'boolean' ? raw.audio.enabled : undefined,
      volume: Number.isFinite(Number(raw.audio.volume)) ? Number(raw.audio.volume) : undefined,
    } : undefined;
    const presentation = isObject(raw.presentation) ? {
      scale: Number.isFinite(Number(raw.presentation.scale))
        ? clampPetScale(raw.presentation.scale) : undefined,
      reducedMotion: typeof raw.presentation.reducedMotion === 'boolean'
        ? raw.presentation.reducedMotion : undefined,
      width: Number.isFinite(Number(raw.presentation.width)) ? Number(raw.presentation.width) : undefined,
      height: Number.isFinite(Number(raw.presentation.height)) ? Number(raw.presentation.height) : undefined,
    } : undefined;
    const stateSounds = isObject(raw.stateSounds)
      ? Object.fromEntries(Object.entries(raw.stateSounds).filter((entry): entry is [string, boolean] => (
        typeof entry[1] === 'boolean'
      )))
      : undefined;
    const soundSelections = normalizeSoundSelections(raw.soundSelections);
    const clickRaw = isObject(raw.click) ? raw.click : undefined;
    const legacyClickAction = typeof raw.clickAction === 'string' || raw.clickAction === null
      ? raw.clickAction : undefined;
    const clickAction = clickRaw && (
      typeof clickRaw.action === 'string' || clickRaw.action === null
    )
      ? clickRaw.action
      : legacyClickAction;
    const clickSound = clickRaw
      ? normalizeSoundSelections({ click: clickRaw.sound })?.click
      : undefined;
    const click = clickAction !== undefined || clickSound
      ? {
          ...(clickAction !== undefined ? { action: clickAction } : {}),
          ...(clickSound ? { sound: clickSound } : {}),
        }
      : undefined;
    return [[id, {
      audio,
      click,
      presentation,
      soundSelections,
      stateSounds,
    }]];
  }));
}

function mergePetOverrides(
  baseValue: unknown,
  overrideValue: unknown,
): Record<string, PetUserOverride> {
  const base = normalizePetOverrides(baseValue);
  const override = normalizePetOverrides(overrideValue);
  const merged = { ...base };
  for (const [id, value] of Object.entries(override)) {
    const previous = base[id] ?? {};
    merged[id] = {
      ...previous,
      ...value,
      audio: { ...previous.audio, ...value.audio },
      click: { ...previous.click, ...value.click },
      presentation: { ...previous.presentation, ...value.presentation },
      soundSelections: { ...previous.soundSelections, ...value.soundSelections },
      stateSounds: { ...previous.stateSounds, ...value.stateSounds },
    };
  }
  return merged;
}

/** Deep-merges a (possibly partial) user config over the defaults. */
export function mergeConfig(base: PetConfig, override: unknown): PetConfig {
  if (!isObject(override)) {
    return {
      ...base,
      audio: { ...base.audio },
      states: base.states.map(cloneState),
      petOverrides: normalizePetOverrides(base.petOverrides),
    };
  }

  return {
    schema: CONFIG_SCHEMA,
    pet: {
      ...base.pet,
      ...(isObject(override.pet) ? override.pet : {}),
      selectedId: String((isObject(override.pet) ? override.pet.selectedId : undefined) ?? base.pet.selectedId),
    },
    privacy: { ...base.privacy, ...(isObject(override.privacy) ? override.privacy : {}) },
    audio: { ...base.audio, ...(isObject(override.audio) ? override.audio : {}) },
    window: normalizeWindow(base.window, override.window),
    states: mergeStateList(base.states, override.states),
    petOverrides: mergePetOverrides(base.petOverrides, override.petOverrides),
  };
}

export function removePetFromConfig(
  config: PetConfig,
  removedId: string,
  fallbackId = 'trae',
): PetConfig {
  const petOverrides = { ...config.petOverrides };
  delete petOverrides[removedId];
  return {
    ...config,
    pet: config.pet.selectedId === removedId
      ? { ...config.pet, selectedId: fallbackId }
      : config.pet,
    petOverrides,
  };
}

export function findState(config: PetConfig, id: string): PetStateConfig | undefined {
  return config.states.find((state) => state.id === id);
}

export function resolveState(config: PetConfig, id: string): PetStateConfig {
  return findState(config, id) ?? findState(config, 'idle') ?? DEFAULT_STATES[0];
}

export function resolvePetOverride(config: PetConfig, petId: string): PetUserOverride {
  return config.petOverrides[petId] ?? {};
}

/** Replaces {placeholder} tokens; empty values collapse cleanly. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
