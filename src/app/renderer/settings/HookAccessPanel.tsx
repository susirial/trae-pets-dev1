import { useCallback, useEffect, useState } from 'react';
import type { HookAccessStatus } from '@shared/ipc';
import { Button } from './ui';

const PROFILE_LABELS: Record<string, string> = {
  trae: 'TRAE 国际版',
  'trae-cn': 'TRAE 国内版',
  'trae-beta': 'TRAE Beta',
};

function profileLabel(id: string): string {
  return PROFILE_LABELS[id] ?? `TRAE (${id})`;
}

function summaryText(status: HookAccessStatus): string {
  if (status.ok) {
    return `已自动接入 ${status.profiles.length} 个 TRAE 版本，桌宠会跟随会话事件变化。`;
  }
  if (!status.node.ok) {
    return `需要系统 Node ${status.requirements.majors.join('/')} LTS`
      + `（最低 ${status.requirements.min}）。安装后点击“立即接入”即可。`;
  }
  if (status.profiles.length === 0) {
    return '未检测到 TRAE 配置目录。安装并启动一次 TRAE 后再点击“立即接入”。';
  }
  return status.error ?? '部分 TRAE 版本尚未接入。';
}

export function HookAccessPanel() {
  const [status, setStatus] = useState<HookAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await window.petAPI.getHookStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runOperation = useCallback(async (
    operation: () => Promise<{ ok: boolean; error?: string; status: HookAccessStatus }>,
    successText: string,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await operation();
      setStatus(result.status);
      setMessage(result.ok ? successText : result.error ?? '操作失败');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!status) {
    return (
      <div className="hook-access">
        <div className="hook-access-head"><b>TRAE 接入状态</b></div>
        <p className="hook-access-summary">正在检测…</p>
      </div>
    );
  }

  return (
    <div className="hook-access">
      <div className="hook-access-head">
        <div>
          <b>TRAE 接入状态</b>
          <small>
            应用每次启动都会自动接入全部已安装的 TRAE 版本，无需手动编辑 hooks.json
          </small>
        </div>
        <div className="hook-access-actions">
          <Button
            size="tiny"
            variant="primary"
            disabled={busy}
            onClick={() => void runOperation(
              () => window.petAPI.installHooks(),
              '接入完成。',
            )}
          >
            {busy ? '处理中…' : '立即接入'}
          </Button>
          <Button
            size="tiny"
            variant="danger"
            disabled={busy}
            onClick={() => void runOperation(
              () => window.petAPI.uninstallHooks(),
              '已移除桌宠 Hook，其它 Hook 保持不变。',
            )}
          >
            移除接入
          </Button>
          <Button size="tiny" disabled={busy} onClick={() => void refresh()}>刷新</Button>
        </div>
      </div>

      <p className={`hook-access-summary hook-access-${status.ok ? 'ok' : 'warn'}`} role="status">
        {summaryText(status)}
      </p>
      {message && <p className="hook-access-message" role="status">{message}</p>}

      <div className="hook-access-list">
        {status.profiles.length === 0 && (
          <div className="hook-access-empty">暂无已接入的 TRAE 版本。</div>
        )}
        {status.profiles.map((profile) => (
          <div className="hook-access-item" key={profile.id}>
            <div className="hook-access-meta">
              <strong>
                {profileLabel(profile.id)}
                <i className={`hook-access-dot hook-access-dot-${profile.ok ? 'ok' : 'warn'}`}>
                  {profile.ok ? '已接入' : '未接入'}
                </i>
              </strong>
              <span>{profile.hooksFile}</span>
              {profile.error && <span className="hook-access-error">{profile.error}</span>}
            </div>
            <Button
              size="tiny"
              onClick={() => void window.petAPI.openHookProfileDir(profile.id)}
            >
              打开目录
            </Button>
          </div>
        ))}
      </div>

      <p className="hook-access-node">
        Node：{status.node.ok
          ? `${status.node.version} · ${status.node.execPath}`
          : status.node.error ?? '未找到受支持的 Node'}
      </p>
      {status.skippedProfiles.length > 0 && (
        <p className="hook-access-node">
          已跳过：{status.skippedProfiles.map((entry) => `${entry.dir}（${entry.reason}）`).join('；')}
        </p>
      )}
    </div>
  );
}
