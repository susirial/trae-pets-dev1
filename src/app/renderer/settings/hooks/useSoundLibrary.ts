import { useCallback, useState } from 'react';
import type { SoundLibraryAsset } from '@shared/ipc';

/** Owns the shared sound library list plus its load / import / folder effects. */
export function useSoundLibrary() {
  const [sounds, setSounds] = useState<SoundLibraryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSounds(await window.petAPI.listSoundLibrary());
      setMessage(null);
    } catch (error) {
      setMessage(`音效库加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Import an MP3; returns true when a new file was added. */
  const importSound = useCallback(async (): Promise<boolean> => {
    const result = await window.petAPI.importSound();
    if (result.canceled) return false;
    if (!result.ok) {
      setMessage(`导入失败：${result.error ?? '未知错误'}`);
      return false;
    }
    await reload();
    return true;
  }, [reload]);

  const openFolder = useCallback(async () => {
    const result = await window.petAPI.openSoundLibraryFolder();
    if (!result.ok) setMessage(`无法打开目录：${result.error ?? '未知错误'}`);
  }, []);

  return { sounds, loading, message, setMessage, reload, importSound, openFolder };
}
