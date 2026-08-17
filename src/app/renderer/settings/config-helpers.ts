import {
  DEFAULT_STATE_AUDIO,
  type PetConfig,
  type PetSoundSelection,
  type PetStateConfig,
} from '@shared/pet-config';

/** Partial patch for a single state (text/audio merged shallowly by callers). */
export type StateDraftPatch = Partial<Omit<PetStateConfig, 'text' | 'audio'>> & {
  text?: Partial<PetStateConfig['text']>;
  audio?: Partial<PetStateConfig['audio']>;
};

/** Build a fresh custom state with a unique `custom-N` id. */
export function createCustomState(existing: PetStateConfig[]): PetStateConfig {
  let n = existing.length + 1;
  let id = `custom-${n}`;
  const ids = new Set(existing.map((s) => s.id));
  while (ids.has(id)) {
    n += 1;
    id = `custom-${n}`;
  }
  return {
    id,
    label: `自定义表情 ${n}`,
    enabled: true,
    builtin: false,
    fps: 10,
    loopKind: 'one-shot-then-idle',
    oneShot: true,
    priority: 60,
    holdMs: 1500,
    fallback: 'idle',
    severity: 'info',
    text: { title: '新表情', message: '在这里编辑文案 ✨' },
    audio: { ...DEFAULT_STATE_AUDIO },
  };
}

/** Resolve the effective per-pet sound selection for a state. */
export function effectiveSoundSelection(
  config: PetConfig,
  state: PetStateConfig,
): PetSoundSelection | undefined {
  const override = config.petOverrides[config.pet.selectedId];
  const explicit = override?.soundSelections?.[state.id];
  if (explicit) {
    return explicit;
  }
  const enabled = override?.stateSounds?.[state.id] ?? state.audio.enabled;
  return enabled ? undefined : { mode: 'none' };
}
