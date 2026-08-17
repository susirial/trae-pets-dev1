import type { LoopKind } from './state-schema';

export const PET_MANIFEST_SCHEMA = 'trae.pet.manifest.v2' as const;

export const REQUIRED_PET_STATES = [
  'idle',
  'waving',
  'running-left',
  'running-right',
  'waiting',
  'review',
  'jumping',
  'happy',
  'failed',
] as const;

export type RequiredPetState = (typeof REQUIRED_PET_STATES)[number];

export interface PetManifestIdentity {
  id: string;
  name: string;
  description: string;
  version: string;
}

export interface PetManifestVisual {
  file: string;
  fps?: number;
  loopKind?: LoopKind;
  durationMs?: number;
}

export interface PetManifestAction {
  state: string;
  fallback?: string;
  durationMs?: number;
}

export interface PetManifestSound {
  file: string;
  volume?: number;
}

export interface PetManifestPresentation {
  width?: number;
  height?: number;
  scale?: number;
  reducedMotion?: boolean;
  anchor?: 'bottom-center' | 'center';
}

export interface PetManifestTheme {
  primary?: string;
  accent?: string;
  bubble?: string;
}

export interface PetManifestV2 {
  schema: typeof PET_MANIFEST_SCHEMA;
  schemaVersion?: 2;
  identity: PetManifestIdentity;
  visuals: Record<string, PetManifestVisual>;
  actions: Record<string, PetManifestAction>;
  sounds: Record<string, PetManifestSound>;
  stateSounds: Record<string, string>;
  interaction: {
    clickAction?: string;
    doubleClickAction?: string;
  };
  presentation: PetManifestPresentation;
  theme: PetManifestTheme;
  author: {
    name: string;
    url?: string;
  };
  license: {
    name: string;
    url?: string;
  };
}

export interface LegacyPetManifest {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  version?: unknown;
  author?: unknown;
  license?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalDuration(value: unknown): number | undefined {
  const duration = optionalNumber(value);
  return duration === undefined ? undefined : Math.min(30_000, Math.max(250, duration));
}

function normalizeVisuals(value: unknown): Record<string, PetManifestVisual> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
    if (typeof raw === 'string') return [[id, { file: raw }]];
    if (!isObject(raw) || typeof raw.file !== 'string') return [];
    const loopKind = raw.loopKind === 'seamless-loop' || raw.loopKind === 'one-shot'
      || raw.loopKind === 'one-shot-then-idle' ? raw.loopKind : undefined;
    return [[id, {
      file: raw.file,
      fps: optionalNumber(raw.fps),
      loopKind,
      durationMs: optionalDuration(raw.durationMs),
    }]];
  }));
}

function normalizeActions(
  value: unknown,
  legacyMetadata: unknown,
): Record<string, PetManifestAction> {
  if (!isObject(value)) return {};
  const metadata = isObject(legacyMetadata) ? legacyMetadata : {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
    const legacy = isObject(metadata[id]) ? metadata[id] : {};
    if (typeof raw === 'string') {
      return [[id, { state: raw, durationMs: optionalDuration(legacy.durationMs) }]];
    }
    if (!isObject(raw) || typeof raw.state !== 'string') return [];
    return [[id, {
      state: raw.state,
      fallback: text(raw.fallback) || undefined,
      durationMs: optionalDuration(raw.durationMs) ?? optionalDuration(legacy.durationMs),
    }]];
  }));
}

function normalizeSounds(value: unknown): Record<string, PetManifestSound> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
    if (typeof raw === 'string') return [[id, { file: raw }]];
    if (!isObject(raw) || typeof raw.file !== 'string') return [];
    return [[id, { file: raw.file, volume: optionalNumber(raw.volume) }]];
  }));
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string'
  )));
}

/**
 * Normalizes both manifest v2 and the original {id,name,...} format.
 * Legacy resource names remain implicit so existing bundled packages need no edits.
 */
export function normalizePetManifest(raw: unknown): PetManifestV2 | null {
  if (!isObject(raw)) return null;
  const identityRaw = isObject(raw.identity) ? raw.identity : raw;
  const id = text(identityRaw.id);
  const name = text(identityRaw.name);
  if (!id || !name) return null;

  const isV2 = raw.schema === PET_MANIFEST_SCHEMA;
  const visuals = normalizeVisuals(raw.visuals);
  if (!isV2) {
    for (const state of REQUIRED_PET_STATES) visuals[state] = { file: `${state}.webp` };
  }

  const presentation = isObject(raw.presentation) ? raw.presentation : {};
  const interaction = isObject(raw.interaction) ? raw.interaction : {};
  const theme = isObject(raw.theme) ? raw.theme : {};
  const author = isObject(raw.author) ? raw.author : {};
  const license = isObject(raw.license) ? raw.license : {};

  return {
    schema: PET_MANIFEST_SCHEMA,
    schemaVersion: 2,
    identity: {
      id,
      name,
      description: text(identityRaw.description),
      version: String(identityRaw.version ?? '1'),
    },
    visuals,
    actions: normalizeActions(raw.actions, raw.actionMetadata),
    sounds: normalizeSounds(raw.sounds),
    stateSounds: normalizeStringMap(raw.stateSounds),
    interaction: {
      clickAction: text(interaction.clickAction) || undefined,
      doubleClickAction: text(interaction.doubleClickAction) || undefined,
    },
    presentation: {
      width: optionalNumber(presentation.width),
      height: optionalNumber(presentation.height),
      scale: optionalNumber(presentation.scale),
      reducedMotion: typeof presentation.reducedMotion === 'boolean'
        ? presentation.reducedMotion : undefined,
      anchor: presentation.anchor === 'center' ? 'center'
        : presentation.anchor === 'bottom-center' ? 'bottom-center' : undefined,
    },
    theme: {
      primary: text(theme.primary) || undefined,
      accent: text(theme.accent) || undefined,
      bubble: text(theme.bubble) || undefined,
    },
    author: {
      name: text(author.name, typeof raw.author === 'string' ? raw.author : ''),
      url: text(author.url) || undefined,
    },
    license: {
      name: text(license.name, typeof raw.license === 'string' ? raw.license : ''),
      url: text(license.url) || undefined,
    },
  };
}
