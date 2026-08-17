import { useEffect, useRef, useState } from 'react';
import type { ResolvedPetPackageSound } from '@shared/pet-package-view';

interface Props {
  sound: ResolvedPetPackageSound;
  volume: number;
  label: string;
}

export function StateSoundPreview({ sound, volume, label }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => {
    stop();
    setError(null);
    return stop;
  }, [sound.url]);

  const toggle = async () => {
    if (playing) {
      stop();
      return;
    }
    if (!sound.url) {
      return;
    }
    setError(null);
    const audio = new Audio(sound.url);
    audio.volume = Math.max(0, Math.min(1, volume * sound.volume));
    audioRef.current = audio;
    audio.onended = stop;
    audio.onerror = () => {
      stop();
      setError('试听加载失败');
    };
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      stop();
      setError('浏览器阻止了试听');
    }
  };

  return (
    <div className="sound-preview">
      <button
        type="button"
        className={`sound-preview-button${playing ? ' is-playing' : ''}`}
        disabled={!sound.url}
        aria-label={playing ? `停止试听 ${label}` : `试听 ${label}`}
        aria-pressed={playing}
        onClick={() => void toggle()}
      >
        <span aria-hidden="true">{playing ? '■' : '▶'}</span>
        {playing ? '停止' : '试听'}
      </button>
      {(error || sound.error) && (
        <span className="sound-error" role="status" aria-live="polite">
          {error ?? sound.error}
        </span>
      )}
    </div>
  );
}
