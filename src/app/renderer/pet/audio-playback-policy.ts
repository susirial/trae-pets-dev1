export type AudioPlaybackKind = 'click' | 'state';

export interface ActiveAudioPlayback {
  kind: AudioPlaybackKind;
  petId: string;
  playbackKey: string;
}

export interface RequestedAudioPlayback extends ActiveAudioPlayback {
  payloadOk: boolean;
  playable: boolean;
}

export type AudioPlaybackTransition = 'preserve' | 'reuse' | 'replace' | 'stop';

/**
 * Click speech owns the audio channel until it ends naturally. Base-state
 * updates are intentionally suppressed while that focus is active so a visual
 * timeout or Hook event cannot truncate speech or start overlapping audio.
 */
export function audioPlaybackTransition(
  active: ActiveAudioPlayback | null,
  requested: RequestedAudioPlayback,
): AudioPlaybackTransition {
  if (!requested.payloadOk) return 'stop';
  if (
    active?.kind === 'click'
    && requested.kind === 'state'
    && active.petId === requested.petId
  ) {
    return 'preserve';
  }
  if (!requested.playable) return 'stop';
  if (active?.playbackKey === requested.playbackKey) return 'reuse';
  return 'replace';
}
