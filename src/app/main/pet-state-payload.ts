// @ts-ignore -- explicit .ts imports keep this module runnable under node --experimental-strip-types tests
import { resolvePetOverride, resolveState, type PetConfig } from '../../shared/pet-config.ts';
// @ts-ignore -- explicit .ts imports keep this module runnable under node --experimental-strip-types tests
import type { PetRuntimeState, RendererStatePayload } from '../../shared/state-schema.ts';
// @ts-ignore -- explicit .ts imports keep this module runnable under node --experimental-strip-types tests
import {
  listPetPackages,
  resolvePetAction,
  resolvePetAudio,
  resolvePetVisual,
  type PetPackageRoots,
} from './pet-packages.ts';
// @ts-ignore -- explicit .ts import keeps this module runnable under node --experimental-strip-types tests
import type { SoundLibraryRoots } from './sound-library.ts';

interface BuildRendererStatePayloadInput {
  statePath: string;
  raw: PetRuntimeState;
  config: PetConfig;
  petsDir: string | PetPackageRoots;
  soundLibraryRoots?: SoundLibraryRoots;
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function buildRendererStatePayload(input: BuildRendererStatePayloadInput): RendererStatePayload {
  const { statePath, raw, config, petsDir, soundLibraryRoots } = input;
  const cfgState = resolveState(config, raw.action);
  const packages = listPetPackages(petsDir);
  const selectedPet = packages.find((pkg) => pkg.id === config.pet.selectedId)
    ?? packages.find((pkg) => pkg.id === 'trae')
    ?? null;
  const selectedPetId = selectedPet?.id ?? config.pet.selectedId;
  const selectedPetName = selectedPet?.name ?? config.pet.displayName;
  const petOverride = resolvePetOverride(config, selectedPetId);
  const packageState = resolvePetAction(petsDir, selectedPetId, cfgState.id);
  const soundSelection = petOverride.soundSelections?.[cfgState.id];
  const visualAsset = resolvePetVisual(petsDir, selectedPetId, packageState);
  const audioAsset = resolvePetAudio(
    petsDir,
    selectedPetId,
    packageState,
    soundSelection,
    soundLibraryRoots,
  );
  const stateAudioEnabled = soundSelection?.mode === 'none'
    ? false
    : soundSelection?.mode === 'sound' || soundSelection?.mode === 'library'
      ? true
      : (petOverride.stateSounds?.[cfgState.id] ?? cfgState.audio.enabled);

  return {
    ok: true,
    statePath,
    state: {
      ...raw,
      fps: cfgState.fps,
      loopKind: cfgState.loopKind,
      oneShot: cfgState.oneShot,
      pet: {
        ...raw.pet,
        id: selectedPetId,
        displayName: selectedPetName,
      },
    },
    selectedPetId,
    selectedPetName,
    visualUrl: visualAsset.url,
    visualFile: visualAsset.file,
    visualError: visualAsset.error,
    audioUrl: audioAsset.url,
    audioFile: audioAsset.file,
    resolvedSoundId: audioAsset.soundId ?? null,
    audioError: audioAsset.error,
    effectiveAudio: {
      enabled: Boolean(
        (petOverride.audio?.enabled ?? config.audio.enabled)
        && stateAudioEnabled
        && audioAsset.url,
      ),
      mode: cfgState.audio.mode,
      count: cfgState.audio.mode === 'count' ? Math.max(1, cfgState.audio.count) : 1,
      volume: clampVolume(
        (petOverride.audio?.volume ?? config.audio.volume)
        * (cfgState.audio.volume ?? 1)
        * (audioAsset.volume ?? 1),
      ),
    },
  };
}
