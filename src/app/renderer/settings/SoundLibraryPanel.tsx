import type { SoundLibraryAsset } from '@shared/ipc';
import type { ResolvedPetPackageSound } from '@shared/pet-package-view';
import { StateSoundPreview } from './StateSoundPreview';
import { Button } from './ui';

interface Props {
  sounds: SoundLibraryAsset[];
  loading: boolean;
  volume: number;
  message: string | null;
  onImport(): void;
  onRefresh(): void;
  onOpenFolder(): void;
  onDelete(sound: SoundLibraryAsset): void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function previewSound(asset: SoundLibraryAsset): ResolvedPetPackageSound {
  return {
    source: 'library',
    soundId: asset.id,
    file: asset.file,
    url: asset.url,
    volume: 1,
    error: null,
  };
}

export function SoundLibraryPanel({
  sounds,
  loading,
  volume,
  message,
  onImport,
  onRefresh,
  onOpenFolder,
  onDelete,
}: Props) {
  return (
    <div className="sound-library">
      <div className="sound-library-head">
        <div>
          <b>公共音效库</b>
          <small>内置音效只读；用户音效保存在应用数据目录</small>
        </div>
        <div className="sound-library-actions">
          <Button size="tiny" variant="primary" onClick={onImport}>导入 MP3</Button>
          <Button size="tiny" onClick={onOpenFolder}>打开目录</Button>
          <Button size="tiny" onClick={onRefresh} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </Button>
        </div>
      </div>

      {message && <p className="sound-library-message" role="status">{message}</p>}

      <div className="sound-library-list" aria-busy={loading}>
        {!loading && sounds.length === 0 && (
          <div className="sound-library-empty">
            暂无公共音效。导入 MP3，或将文件复制到用户音效目录后刷新。
          </div>
        )}
        {sounds.map((asset) => (
          <div className="sound-library-item" key={asset.id}>
            <div className="sound-library-meta">
              <strong>{asset.name}</strong>
              <span>
                <i className={`sound-source sound-source-${asset.source}`}>
                  {asset.source === 'built-in' ? '内置' : '用户'}
                </i>
                {asset.file} · {formatBytes(asset.size)}
              </span>
            </div>
            <StateSoundPreview sound={previewSound(asset)} volume={volume} label={asset.name} />
            {asset.source === 'user' && (
              <Button size="tiny" variant="danger" onClick={() => onDelete(asset)}>
                删除
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
