import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type PetAPI } from '@shared/ipc';
import type { PetConfig } from '@shared/pet-config';
import type { RendererStatePayload } from '@shared/state-schema';

const api: PetAPI = {
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  onStateUpdate: (callback) => {
    const listener = (_event: unknown, payload: RendererStatePayload) => callback(payload);
    ipcRenderer.on(IPC.stateUpdate, listener);
    return () => ipcRenderer.removeListener(IPC.stateUpdate, listener);
  },
  closePet: () => {
    void ipcRenderer.invoke(IPC.petClose);
  },
  setIgnoreMouse: (ignore) => {
    void ipcRenderer.invoke(IPC.petIgnoreMouse, ignore);
  },
  openContextMenu: () => {
    void ipcRenderer.invoke(IPC.petContextMenu);
  },
  savePetPosition: (x, y) => ipcRenderer.invoke(IPC.petPositionSave, x, y),
  getPetWindowBounds: () => ipcRenderer.invoke(IPC.petBoundsGet),
  movePetWindow: (x, y) => ipcRenderer.invoke(IPC.petWindowMove, x, y),
  setPetWindowScale: (scale) => ipcRenderer.invoke(IPC.petScaleSet, scale),
  openSettings: () => {
    void ipcRenderer.invoke(IPC.settingsOpen);
  },
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  getDefaultConfig: () => ipcRenderer.invoke(IPC.configGetDefaults),
  saveConfig: (config) => ipcRenderer.invoke(IPC.configSave, config),
  onConfigUpdate: (callback) => {
    const listener = (_event: unknown, config: PetConfig) => callback(config);
    ipcRenderer.on(IPC.configUpdate, listener);
    return () => ipcRenderer.removeListener(IPC.configUpdate, listener);
  },
  listPetPackages: () => ipcRenderer.invoke(IPC.petPackagesList),
  importPetPackage: (sourcePath) => ipcRenderer.invoke(IPC.petPackageImport, sourcePath),
  inspectPetPackage: (mode, sourcePath) => (
    ipcRenderer.invoke(IPC.petPackageInspect, mode, sourcePath)
  ),
  installPetPackage: (sessionId, input) => (
    ipcRenderer.invoke(IPC.petPackageInstall, sessionId, input)
  ),
  cancelPetPackageInspection: (sessionId) => (
    ipcRenderer.invoke(IPC.petPackageCancel, sessionId)
  ),
  deletePetPackage: (id) => ipcRenderer.invoke(IPC.petPackageDelete, id),
  diagnosePetPackages: () => ipcRenderer.invoke(IPC.petPackagesDiagnose),
  listSoundLibrary: () => ipcRenderer.invoke(IPC.soundLibraryList),
  importSound: (sourcePath) => ipcRenderer.invoke(IPC.soundLibraryImport, sourcePath),
  deleteSound: (id) => ipcRenderer.invoke(IPC.soundLibraryDelete, id),
  openSoundLibraryFolder: () => ipcRenderer.invoke(IPC.soundLibraryOpenFolder),
  getHookStatus: () => ipcRenderer.invoke(IPC.hooksStatus),
  installHooks: () => ipcRenderer.invoke(IPC.hooksInstall),
  uninstallHooks: (restoreBackup) => ipcRenderer.invoke(IPC.hooksUninstall, restoreBackup === true),
  openHookProfileDir: (id) => ipcRenderer.invoke(IPC.hooksOpenProfileDir, id),
  openOfficialWebsite: () => ipcRenderer.invoke(IPC.externalOpenOfficialWebsite),
  triggerAction: (id) => {
    void ipcRenderer.invoke(IPC.actionTrigger, id);
  },
  triggerPetClick: () => {
    void ipcRenderer.invoke(IPC.petClickTrigger);
  },
  previewPetClick: (input) => {
    void ipcRenderer.invoke(IPC.petClickPreview, input);
  },
};

contextBridge.exposeInMainWorld('petAPI', api);
