import { useEffect, useMemo, useRef } from 'react';
import type { RendererStatePayload } from '@shared/state-schema';
import {
  audioPlaybackTransition,
  type ActiveAudioPlayback,
} from './audio-playback-policy';

interface Props {
  payload: RendererStatePayload | null;
}

export function PetAudioController({ payload }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupEndedRef = useRef<(() => void) | null>(null);
  const playbackRef = useRef<ActiveAudioPlayback | null>(null);
  const interaction = payload?.interaction;
  const audioUrl = interaction ? interaction.audioUrl : payload?.audioUrl;
  const audioFile = interaction ? interaction.audioFile : payload?.audioFile;
  const effectiveAudio = interaction ? interaction.effectiveAudio : payload?.effectiveAudio;
  const playbackKey = useMemo(() => {
    const state = payload?.state;
    if (interaction) {
      return `${payload?.selectedPetId ?? ''}:click:${interaction.action}:${interaction.token}:${audioFile ?? ''}`;
    }
    return state ? `${payload?.selectedPetId ?? ''}:${state.action}:${state.version}:${audioFile ?? ''}` : '';
  }, [audioFile, interaction, payload?.selectedPetId, payload?.state]);

  function stopCurrent(): void {
    cleanupEndedRef.current?.();
    cleanupEndedRef.current = null;
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.load();
    audioRef.current = null;
    playbackRef.current = null;
  }

  function releaseCurrent(audio: HTMLAudioElement): void {
    if (audioRef.current !== audio) return;
    cleanupEndedRef.current?.();
    cleanupEndedRef.current = null;
    audioRef.current = null;
    playbackRef.current = null;
  }

  useEffect(() => stopCurrent, []);

  useEffect(() => {
    const petId = payload?.selectedPetId ?? '';
    const transition = audioPlaybackTransition(playbackRef.current, {
      kind: interaction ? 'click' : 'state',
      petId,
      playbackKey,
      payloadOk: Boolean(payload?.ok),
      playable: Boolean(audioUrl && effectiveAudio?.enabled),
    });
    if (transition === 'preserve' || transition === 'reuse') {
      return;
    }
    if (transition === 'stop') {
      stopCurrent();
      return;
    }

    stopCurrent();

    const audio = new Audio(audioUrl!);
    audio.preload = 'auto';
    audio.volume = effectiveAudio!.volume;
    audio.loop = effectiveAudio!.mode === 'infinite';

    let playCount = 0;
    const targetCount = Math.max(1, effectiveAudio!.count);
    const handleEnded = () => {
      if (effectiveAudio!.mode === 'count') {
        playCount += 1;
        if (playCount < targetCount) {
          audio.currentTime = 0;
          void audio.play().catch(() => releaseCurrent(audio));
          return;
        }
      }
      releaseCurrent(audio);
    };
    audio.addEventListener('ended', handleEnded);
    cleanupEndedRef.current = () => {
      audio.removeEventListener('ended', handleEnded);
    };

    audioRef.current = audio;
    playbackRef.current = {
      kind: interaction ? 'click' : 'state',
      petId,
      playbackKey,
    };
    void audio.play().catch(() => releaseCurrent(audio));
  }, [
    playbackKey,
    payload?.ok,
    payload?.selectedPetId,
    interaction,
    audioUrl,
    effectiveAudio?.enabled,
    effectiveAudio?.mode,
    effectiveAudio?.count,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const active = playbackRef.current;
    if (
      active?.kind === 'click'
      && !interaction
      && active.petId === (payload?.selectedPetId ?? '')
    ) {
      return;
    }
    if (!payload?.ok || !effectiveAudio?.enabled) {
      stopCurrent();
      return;
    }
    audio.volume = effectiveAudio.volume;
  }, [
    payload?.ok,
    payload?.selectedPetId,
    interaction,
    effectiveAudio?.enabled,
    effectiveAudio?.volume,
  ]);

  return null;
}
