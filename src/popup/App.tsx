import React, { useEffect, useState } from 'react';
import { useStore } from '../shared/store';
import LoginPage    from './components/LoginPage';
import MainPage     from './components/MainPage';
import SettingsPage from './components/SettingsPage';
import LogsPage     from './components/LogsPage';
import ConflictPage from './components/ConflictPage';

/**
 * Popup 不再自己管理 WebSocket。
 * WS 由 background SW 统一管理（保活 + 广播接收）。
 * Popup 只负责：
 *   1. 打开时从 background 拉取最新状态
 *   2. 监听 chrome.storage.onChanged，background 更新 storage 后 Popup 实时刷新 UI
 */
export default function App() {
  const { token, view, setView } = useStore();
  const [loading, setLoading]    = useState(true);

  useEffect(() => {
    // ── 从 background 恢复完整状态 ──────────────────────────────────────────
    chrome.runtime.sendMessage({ action: 'get_state' }, (res) => {
      if (res?.token) {
        useStore.setState({
          token:         res.token,
          userId:        res.userId        ?? null,
          userAvatar:    res.userAvatar    ?? null,
          syncUrl:       res.syncUrl       ?? 'https://sync.gitmob.xyz',
          deviceId:      res.deviceId      ?? '',
          groups:        res.groups        ?? [],
          repos:         res.repos         ?? [],
          versionVector: res.versionVector ?? {},
          syncStatus:    res.syncStatus    ?? 'idle',
          syncError:     res.syncError     ?? null,
          lastSyncAt:    res.lastSyncAt    ?? null,
        });

        // Popup 打开后立即触发一次同步检查
        // background SW 的 WS onopen 也会触发，这里提前触发保证即时性
        chrome.runtime.sendMessage({ action: 'sync_now' });
      }
      setLoading(false);
    });

    // ── 监听 background 写入 storage 的变化，实时更新 UI ──────────────────
    // background saveData() → chrome.storage.set() → onChanged → Popup UI 更新
    const handler = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      const update: Record<string, unknown> = {};

      if (changes.groups)        update.groups        = changes.groups.newValue        ?? [];
      if (changes.repos)         update.repos         = changes.repos.newValue         ?? [];
      if (changes.versionVector) update.versionVector = changes.versionVector.newValue ?? {};
      if (changes.lastSyncAt)    update.lastSyncAt    = changes.lastSyncAt.newValue    ?? null;

      if (Object.keys(update).length > 0) useStore.setState(update as any);

      if (changes.syncStatus || changes.syncError) {
        useStore.setState({
          syncStatus: (changes.syncStatus?.newValue  ?? useStore.getState().syncStatus) as any,
          syncError:   changes.syncError?.newValue   ?? null,
        });
      }

      // 冲突：background 检测到后写入 storage，Popup 自动跳转冲突页
      if (changes.pendingConflicts?.newValue) {
        useStore.setState({
          conflicts: changes.pendingConflicts.newValue,
          view:      'conflict',
        });
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-bg-deep"
        style={{ width: '400px', height: '600px' }}
      >
        <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin-slow" />
      </div>
    );
  }

  if (!token) return <LoginPage />;

  return (
    <div
      className="flex flex-col bg-bg-deep overflow-hidden"
      style={{ width: '400px', height: '600px' }}
    >
      {view === 'main'     && <MainPage />}
      {view === 'settings' && <SettingsPage onBack={() => setView('main')} />}
      {view === 'logs'     && <LogsPage     onBack={() => setView('main')} />}
      {view === 'conflict' && <ConflictPage onBack={() => setView('main')} />}
    </div>
  );
}
