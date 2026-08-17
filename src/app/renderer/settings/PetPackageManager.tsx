import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PetPackageAsset,
  PetPackageDiagnostic,
  PetPackageImportMode,
  PetPackageInspection,
  PetQuickActionInput,
  PetQuickCreateInput,
} from '@shared/ipc';
import {
  REQUIRED_PET_STATES,
  type RequiredPetState,
} from '@shared/pet-manifest';
import { Button } from './ui';

const STATE_LABELS: Record<RequiredPetState, string> = {
  idle: '待命',
  waving: '挥手',
  'running-left': '向左跑',
  'running-right': '向右跑',
  waiting: '等待',
  review: '审阅',
  jumping: '跳跃',
  happy: '开心',
  failed: '失败',
};

const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

interface Props {
  packages: PetPackageAsset[];
  onInstalled(id: string): Promise<void>;
  onDelete(pkg: PetPackageAsset): Promise<void>;
}

function actionIdFromFile(file: string): string {
  const name = file.replaceAll('\\', '/').split('/').pop() ?? '';
  const stem = name.replace(/\.[^.]+$/, '');
  return stem.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 64)
    .replace(/[._-]+$/g, '') || 'action';
}

function availableExtraActions(
  inspection: PetPackageInspection,
  draft: PetQuickCreateInput,
): PetQuickActionInput[] {
  const assigned = new Set(Object.values(draft.stateFiles));
  const existing = new Map((draft.extraActions ?? []).map((action) => [action.file, action]));
  const usedIds = new Set([
    ...REQUIRED_PET_STATES,
    ...(draft.extraActions ?? []).map((action) => action.id),
  ]);
  return inspection.availableVisuals.flatMap((asset) => {
    if (assigned.has(asset.file)) return [];
    const saved = existing.get(asset.file);
    if (saved) return [saved];
    const base = actionIdFromFile(asset.file);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      const ending = `-${suffix++}`;
      id = `${base.slice(0, 64 - ending.length)}${ending}`;
    }
    usedIds.add(id);
    return [{ id, file: asset.file, durationMs: 2_000, enabled: true }];
  });
}

function quickInput(inspection: PetPackageInspection): PetQuickCreateInput {
  const input: PetQuickCreateInput = {
    id: inspection.id ?? '',
    name: inspection.name ?? '',
    description: inspection.description ?? '',
    author: inspection.author || 'User created',
    license: inspection.license || 'Unspecified',
    stateFiles: Object.fromEntries(REQUIRED_PET_STATES.map((state) => (
      [state, inspection.stateFiles[state] ?? '']
    ))) as Record<RequiredPetState, string>,
  };
  input.extraActions = availableExtraActions(inspection, input);
  input.clickAction = input.extraActions[0]?.id ?? 'waving';
  return input;
}

export function PetPackageManager({ packages, onInstalled, onDelete }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [inspection, setInspection] = useState<PetPackageInspection | null>(null);
  const [draft, setDraft] = useState<PetQuickCreateInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PetPackageDiagnostic[]>([]);

  useEffect(() => {
    if (!inspection || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void closeInspection();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) {
        focusable()[0]?.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [inspection]);

  const blockingIssues = useMemo(() => inspection?.issues.filter((entry) => (
    entry.severity === 'error'
      && !(inspection.mode === 'quick' && entry.code === 'MISSING_STATE_MAPPING')
  )) ?? [], [inspection]);
  const visibleIssues = useMemo(() => inspection?.issues.filter((entry) => {
    if (inspection.mode !== 'quick' || entry.code !== 'MISSING_STATE_MAPPING' || !draft) return true;
    const state = entry.path?.replace('visuals.', '') as RequiredPetState | undefined;
    return !state || !draft.stateFiles[state];
  }) ?? [], [draft, inspection]);
  const duplicateQuickId = Boolean(
    inspection?.mode === 'quick'
    && draft?.id
    && packages.some((pkg) => pkg.id === draft.id),
  );
  const extraActions = useMemo(() => (
    inspection?.mode === 'quick' && draft
      ? availableExtraActions(inspection, draft)
      : []
  ), [draft, inspection]);
  const enabledExtraActions = extraActions.filter((action) => action.enabled);
  const duplicateActionIds = new Set(enabledExtraActions.flatMap((action, index, actions) => (
    actions.some((candidate, candidateIndex) => candidateIndex !== index && candidate.id === action.id)
      ? [action.id]
      : []
  )));
  const invalidExtraActions = enabledExtraActions.filter((action) => (
    !ACTION_ID_PATTERN.test(action.id)
    || REQUIRED_PET_STATES.includes(action.id as RequiredPetState)
    || duplicateActionIds.has(action.id)
    || !Number.isInteger(action.durationMs)
    || action.durationMs < 250
    || action.durationMs > 30_000
  ));
  const effectiveClickAction = draft?.clickAction === 'waving'
    || enabledExtraActions.some((action) => action.id === draft?.clickAction)
    ? draft?.clickAction
    : enabledExtraActions[0]?.id ?? 'waving';
  const quickComplete = draft
    ? Boolean(
        ACTION_ID_PATTERN.test(draft.id)
        && draft.name.trim()
        && REQUIRED_PET_STATES.every((state) => draft.stateFiles[state])
        && invalidExtraActions.length === 0,
      )
    : false;

  const closeInspection = async () => {
    if (inspection?.sessionId) {
      await window.petAPI.cancelPetPackageInspection(inspection.sessionId);
    }
    setInspection(null);
    setDraft(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const inspect = async (mode: PetPackageImportMode) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true);
    setMessage(null);
    const result = await window.petAPI.inspectPetPackage(mode);
    setBusy(false);
    if (result.canceled) return;
    if (!result.sessionId) {
      setMessage(`无法读取素材：${result.error ?? '未知错误'}`);
      return;
    }
    setInspection(result);
    setDraft(mode === 'quick' ? quickInput(result) : null);
  };

  const install = async () => {
    if (!inspection?.sessionId) return;
    setBusy(true);
    const quickDraft = inspection.mode === 'quick' && draft
      ? { ...draft, extraActions, clickAction: effectiveClickAction }
      : undefined;
    const result = await window.petAPI.installPetPackage(
      inspection.sessionId,
      quickDraft,
    );
    setBusy(false);
    if (!result.ok || !result.id) {
      setMessage(`安装失败：${result.error ?? '未知错误'}`);
      setInspection(null);
      setDraft(null);
      return;
    }
    const id = result.id;
    setInspection(null);
    setDraft(null);
    setMessage('宠物已安装并切换，保存配置后桌宠将持续使用它。');
    window.requestAnimationFrame(() => openerRef.current?.focus());
    await onInstalled(id);
  };

  const updateExtraAction = (file: string, patch: Partial<PetQuickActionInput>) => {
    if (!draft) return;
    const previous = extraActions.find((action) => action.file === file);
    setDraft({
      ...draft,
      clickAction: patch.id !== undefined && draft.clickAction === previous?.id
        ? patch.id
        : draft.clickAction,
      extraActions: extraActions.map((action) => (
        action.file === file ? { ...action, ...patch } : action
      )),
    });
  };

  const diagnose = async () => {
    const result = await window.petAPI.diagnosePetPackages();
    setDiagnostics(result.filter((entry) => !entry.valid));
    setMessage(result.every((entry) => entry.valid)
      ? '所有用户宠物包均通过诊断。'
      : `发现 ${result.filter((entry) => !entry.valid).length} 个异常宠物包。`);
  };

  return (
    <div className="pet-library">
      <div className="pet-library-head">
        <div>
          <b>用户宠物库</b>
          <small>导入标准包，或用九张状态图快速制作宠物。</small>
        </div>
        <div className="pet-library-actions">
          <Button size="small" disabled={busy} onClick={() => void inspect('package')}>
            导入宠物包
          </Button>
          <Button size="small" variant="primary" disabled={busy} onClick={() => void inspect('quick')}>
            九图快速制作
          </Button>
          <Button size="small" variant="ghost" disabled={busy} onClick={() => void diagnose()}>
            诊断
          </Button>
        </div>
      </div>

      {message && <p className="pet-library-message" role="status">{message}</p>}
      {diagnostics.length > 0 && (
        <ul className="pet-package-issues">
          {diagnostics.map((entry) => (
            <li key={entry.folder}><b>{entry.folder}</b>：{entry.errors.join('；')}</li>
          ))}
        </ul>
      )}

      <div className="pet-library-list">
        {packages.filter((pkg) => pkg.source === 'user').map((pkg) => (
          <div className="pet-library-item" key={pkg.id}>
            <div>
              <b>{pkg.name}</b>
              <small>{pkg.id} · {pkg.version ?? '未标版本'}</small>
            </div>
            <Button size="tiny" variant="danger" onClick={() => void onDelete(pkg)}>
              删除
            </Button>
          </div>
        ))}
        {!packages.some((pkg) => pkg.source === 'user') && (
          <p className="pet-library-empty">还没有用户宠物。可导入 ZIP/文件夹，或选择九图素材目录。</p>
        )}
      </div>

      {inspection && (
        <div className="pet-import-overlay" role="dialog" aria-modal="true" aria-label="宠物导入预览">
          <div className="pet-import-dialog" ref={dialogRef}>
            <div className="pet-import-title">
              <div>
                <span>{inspection.mode === 'quick' ? 'QUICK CREATOR' : 'PACKAGE INSPECTOR'}</span>
                <h3>{inspection.mode === 'quick' ? '九图宠物快速制作' : '宠物包安装预览'}</h3>
              </div>
              <Button size="tiny" variant="ghost" onClick={() => void closeInspection()}>关闭</Button>
            </div>

            {inspection.mode === 'quick' && draft && (
              <div className="pet-import-meta">
                <label><span>宠物 ID</span><input value={draft.id} onChange={(event) => setDraft({
                  ...draft, id: event.target.value.toLowerCase().trim(),
                })} /></label>
                <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft({
                  ...draft, name: event.target.value,
                })} /></label>
                <label className="span2"><span>描述</span><input value={draft.description} onChange={(event) => setDraft({
                  ...draft, description: event.target.value,
                })} /></label>
                <label><span>作者</span><input value={draft.author} onChange={(event) => setDraft({
                  ...draft, author: event.target.value,
                })} /></label>
                <label><span>许可证</span><input value={draft.license} onChange={(event) => setDraft({
                  ...draft, license: event.target.value,
                })} /></label>
              </div>
            )}

            <div className="pet-state-grid">
              {REQUIRED_PET_STATES.map((state) => {
                const selectedFile = inspection.mode === 'quick'
                  ? draft?.stateFiles[state]
                  : inspection.stateFiles[state];
                const selectedAsset = inspection.availableVisuals.find((asset) => asset.file === selectedFile);
                return (
                  <div className="pet-state-tile" key={state}>
                    <div className="pet-state-image">
                      {selectedAsset
                        ? <img src={selectedAsset.url} alt={`${STATE_LABELS[state]}预览`} />
                        : <span>未映射</span>}
                    </div>
                    <b>{STATE_LABELS[state]}</b>
                    <small>{state}</small>
                    {inspection.mode === 'quick' && draft && (
                      <select
                        aria-label={`${STATE_LABELS[state]}图片`}
                        value={draft.stateFiles[state]}
                        onChange={(event) => setDraft({
                          ...draft,
                          stateFiles: { ...draft.stateFiles, [state]: event.target.value },
                        })}
                      >
                        <option value="">选择图片…</option>
                        {inspection.availableVisuals.map((asset) => (
                          <option value={asset.file} key={asset.file}>{asset.file}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            {inspection.mode === 'quick' && draft && extraActions.length > 0 && (
              <section className="pet-extra-actions">
                <div className="pet-extra-actions-head">
                  <div>
                    <b>发现 {extraActions.length} 个额外动作</b>
                    <small>未被九图占用的图片会作为点击互动动作写入宠物包。</small>
                  </div>
                  <label>
                    <span>默认点击动作</span>
                    <select
                      value={effectiveClickAction}
                      onChange={(event) => setDraft({ ...draft, clickAction: event.target.value })}
                    >
                      <option value="waving">挥手 · waving</option>
                      {enabledExtraActions.map((action) => (
                        <option key={action.file} value={action.id}>
                          {action.id} · {action.file.split('/').pop()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="pet-extra-action-grid">
                  {extraActions.map((action) => {
                    const asset = inspection.availableVisuals.find((candidate) => (
                      candidate.file === action.file
                    ));
                    const idInvalid = action.enabled && (
                      !ACTION_ID_PATTERN.test(action.id)
                      || REQUIRED_PET_STATES.includes(action.id as RequiredPetState)
                      || duplicateActionIds.has(action.id)
                    );
                    const durationInvalid = action.enabled && (
                      !Number.isInteger(action.durationMs)
                      || action.durationMs < 250
                      || action.durationMs > 30_000
                    );
                    return (
                      <article className={`pet-extra-action${action.enabled ? ' is-enabled' : ''}`} key={action.file}>
                        <div className="pet-extra-action-image">
                          {asset && <img src={asset.url} alt={`${action.id} 预览`} />}
                        </div>
                        <label className="pet-extra-action-toggle">
                          <input
                            type="checkbox"
                            checked={action.enabled}
                            onChange={(event) => updateExtraAction(action.file, {
                              enabled: event.target.checked,
                            })}
                          />
                          <span>作为特殊动作</span>
                        </label>
                        <small title={action.file}>{action.file}</small>
                        <label>
                          <span>动作 ID</span>
                          <input
                            value={action.id}
                            disabled={!action.enabled}
                            aria-invalid={idInvalid}
                            onChange={(event) => updateExtraAction(action.file, {
                              id: event.target.value.toLowerCase().trim(),
                            })}
                          />
                        </label>
                        <label>
                          <span>单轮时长（ms）</span>
                          <input
                            type="number"
                            min={250}
                            max={30_000}
                            step={50}
                            value={action.durationMs}
                            disabled={!action.enabled}
                            aria-invalid={durationInvalid}
                            onChange={(event) => updateExtraAction(action.file, {
                              durationMs: Number(event.target.value),
                            })}
                          />
                        </label>
                        {idInvalid && (
                          <small className="is-error">
                            ID 需唯一、使用小写字母/数字/._-，且不能占用标准状态。
                          </small>
                        )}
                        {durationInvalid && (
                          <small className="is-error">时长需为 250–30000ms 的整数。</small>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {(visibleIssues.length > 0 || duplicateQuickId) && (
              <ul className="pet-package-issues">
                {duplicateQuickId && (
                  <li className="error">
                    <b>错误</b>：宠物 ID “{draft?.id}” 已存在，请改用其他 ID。
                  </li>
                )}
                {visibleIssues.map((entry, index) => (
                  <li className={entry.severity} key={`${entry.code}-${entry.path}-${index}`}>
                    <b>{entry.severity === 'error' ? '错误' : '提醒'}</b>：{entry.message}
                    {entry.hint && <small>{entry.hint}</small>}
                  </li>
                ))}
              </ul>
            )}

            <div className="pet-import-footer">
              <small>安装前仅使用临时预览；关闭窗口会清理暂存文件。</small>
              <Button
                variant="primary"
                disabled={
                  busy
                  || blockingIssues.length > 0
                  || duplicateQuickId
                  || (inspection.mode === 'quick' && !quickComplete)
                }
                onClick={() => void install()}
              >
                {busy ? '安装中…' : '确认安装'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
