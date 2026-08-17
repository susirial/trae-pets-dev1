// @ts-ignore -- explicit .ts imports keep this module runnable under node --experimental-strip-types tests
import { resolvePetOverride, type PetConfig, type PetSoundSelection } from '../../shared/pet-config.ts';
// @ts-ignore -- explicit .ts imports keep this module runnable under node --experimental-strip-types tests
import type { RendererInteractionPayload, RendererStatePayload } from '../../shared/state-schema.ts';
// @ts-ignore -- explicit .ts imports keep this module runnable under node --experimental-strip-types tests
import {
  findPetPackage,
  listPetActionOptions,
  resolvePetAudio,
  resolvePetVisual,
  type PetPackageRoots,
} from './pet-packages.ts';
// @ts-ignore -- explicit .ts import keeps this module runnable under node --experimental-strip-types tests
import type { SoundLibraryRoots } from './sound-library.ts';

interface BuildClickInteractionInput {
  config: PetConfig;
  petsDir: string | PetPackageRoots;
  soundLibraryRoots?: SoundLibraryRoots;
  petId: string;
  actionId: string;
  sound?: PetSoundSelection;
  token: number;
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function buildClickInteraction(
  input: BuildClickInteractionInput,
): RendererInteractionPayload | null {
  const { config, petsDir, soundLibraryRoots, petId, actionId, token } = input;
  const pkg = findPetPackage(petsDir, petId);
  if (!pkg) return null;
  const option = listPetActionOptions(pkg).find((candidate) => candidate.id === actionId);
  if (!option) return null;

  const visual = resolvePetVisual(petsDir, petId, option.stateId);
  // Click audio is deliberately independent: an omitted selection is silent.
  const selection = input.sound ?? { mode: 'none' };
  const audio = resolvePetAudio(
    petsDir,
    petId,
    option.stateId,
    selection,
    soundLibraryRoots,
  );
  const petOverride = resolvePetOverride(config, petId);

  return {
    kind: 'click',
    token,
    action: actionId,
    durationMs: option.durationMs,
    visualUrl: visual.url,
    visualFile: visual.file,
    visualError: visual.error,
    audioUrl: audio.url,
    audioFile: audio.file,
    resolvedSoundId: audio.soundId ?? null,
    audioError: audio.error,
    effectiveAudio: {
      enabled: Boolean(
        selection.mode !== 'none'
        && (petOverride.audio?.enabled ?? config.audio.enabled)
        && audio.url
      ),
      mode: 'once',
      count: 1,
      volume: clampVolume(
        (petOverride.audio?.volume ?? config.audio.volume) * (audio.volume ?? 1),
      ),
    },
  };
}

type TimerHandle = ReturnType<typeof setTimeout>;
type ScheduleTimer = (callback: () => void, delayMs: number) => TimerHandle;
type ClearTimer = (handle: TimerHandle) => void;

export class ClickInteractionController {
  private token = 0;
  private timer: TimerHandle | null = null;
  private readonly readBase: () => RendererStatePayload;
  private readonly emit: (payload: RendererStatePayload) => void;
  private readonly scheduleTimer: ScheduleTimer;
  private readonly clearScheduledTimer: ClearTimer;

  constructor(
    readBase: () => RendererStatePayload,
    emit: (payload: RendererStatePayload) => void,
    scheduleTimer: ScheduleTimer = setTimeout,
    clearScheduledTimer: ClearTimer = clearTimeout,
  ) {
    this.readBase = readBase;
    this.emit = emit;
    this.scheduleTimer = scheduleTimer;
    this.clearScheduledTimer = clearScheduledTimer;
  }

  nextToken(): number {
    return this.token + 1;
  }

  present(interaction: RendererInteractionPayload): void {
    this.clearTimer();
    this.token = interaction.token;
    this.emit({ ...this.readBase(), interaction });
    const activeToken = interaction.token;
    this.timer = this.scheduleTimer(() => {
      if (this.token !== activeToken) return;
      this.timer = null;
      this.token += 1;
      this.emit(this.readBase());
    }, interaction.durationMs);
  }

  cancel(emitBase = true): void {
    const wasActive = this.timer !== null;
    this.clearTimer();
    this.token += 1;
    if (wasActive && emitBase) this.emit(this.readBase());
  }

  dispose(): void {
    this.cancel(false);
  }

  private clearTimer(): void {
    if (this.timer) {
      this.clearScheduledTimer(this.timer);
      this.timer = null;
    }
  }
}
