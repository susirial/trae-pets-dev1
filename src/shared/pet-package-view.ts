import type { PetPackageAsset, SoundLibraryAsset } from './ipc';
import type { PetClickConfig, PetSoundSelection } from './pet-config';

export const DEFAULT_CLICK_DURATION_MS = 2_000;

export interface PetPackageVisualSource {
  id: string;
  visuals: Record<string, string>;
  actions: Record<string, string>;
}

export interface ResolvedPetPackageSound {
  source: 'package-default' | 'package-selected' | 'library' | 'none' | 'missing';
  soundId: string | null;
  file: string | null;
  url: string | null;
  volume: number;
  error: string | null;
}

function packageStateId(pkg: PetPackageVisualSource, actionId: string): string {
  return pkg.actions[actionId] ?? actionId;
}

export function effectivePetClickAction(
  pkg: PetPackageAsset | undefined,
  click: PetClickConfig | undefined,
): string | null {
  if (click?.action === null) return null;
  const actionId = click?.action ?? pkg?.clickAction ?? null;
  return actionId && pkg?.actionOptions.some((option) => option.id === actionId)
    ? actionId
    : null;
}

export function petClickDuration(
  pkg: PetPackageAsset | undefined,
  actionId: string,
): number {
  return pkg?.actionOptions.find((option) => option.id === actionId)?.durationMs
    ?? DEFAULT_CLICK_DURATION_MS;
}

/** Resolves the same action → state → manifest file chain used by the runtime. */
export function petPackageVisualUrl(
  pkg: PetPackageVisualSource | undefined,
  actionId: string,
): string | null {
  if (!pkg) {
    return null;
  }
  const stateId = packageStateId(pkg, actionId);
  const file = pkg.visuals[stateId];
  return file
    ? `trae-pet://pet-asset/${encodeURIComponent(pkg.id)}/visual/${encodeURIComponent(file)}`
    : null;
}

/** Resolves a settings selection using the same action → state chain as runtime. */
export function resolvePetPackageSound(
  pkg: PetPackageAsset | undefined,
  actionId: string,
  selection?: PetSoundSelection,
  librarySounds: SoundLibraryAsset[] = [],
): ResolvedPetPackageSound {
  if (selection?.mode === 'none') {
    return {
      source: 'none',
      soundId: null,
      file: null,
      url: null,
      volume: 1,
      error: null,
    };
  }

  if (selection?.mode === 'library') {
    const sound = librarySounds.find((asset) => asset.id === selection.soundId);
    return sound
      ? {
          source: 'library',
          soundId: sound.id,
          file: sound.file,
          url: sound.url,
          volume: 1,
          error: null,
        }
      : {
          source: 'missing',
          soundId: selection.soundId,
          file: null,
          url: null,
          volume: 1,
          error: `公共音效不可用：${selection.soundId}`,
        };
  }

  if (!pkg) {
    return {
      source: 'missing',
      soundId: selection?.mode === 'sound' ? selection.soundId : null,
      file: null,
      url: null,
      volume: 1,
      error: '宠物包不可用',
    };
  }

  if (selection?.mode === 'sound') {
    const sound = pkg.sounds[selection.soundId];
    if (!sound) {
      return {
        source: 'missing',
        soundId: selection.soundId,
        file: null,
        url: null,
        volume: 1,
        error: `曲目不可用：${selection.soundId}`,
      };
    }
    return {
      source: 'package-selected',
      soundId: selection.soundId,
      file: sound.file,
      url: `trae-pet://pet-asset/${encodeURIComponent(pkg.id)}/audio/${encodeURIComponent(sound.file)}`,
      volume: sound.volume ?? 1,
      error: null,
    };
  }

  const defaultAudio = pkg.defaultAudio[packageStateId(pkg, actionId)];
  return {
    source: defaultAudio?.url ? 'package-default' : 'missing',
    soundId: defaultAudio?.soundId ?? null,
    file: defaultAudio?.file ?? null,
    url: defaultAudio?.url ?? null,
    volume: defaultAudio?.volume ?? 1,
    error: defaultAudio?.error ?? null,
  };
}
