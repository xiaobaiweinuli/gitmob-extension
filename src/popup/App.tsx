import React, { useEffect, useState } from 'react';
import { useStore } from '../shared/store';
import LoginPage    from './components/LoginPage';
import MainPage     from './components/MainPage';
import SettingsPage from './components/SettingsPage';
import LogsPage     from './components/LogsPage';
import ConflictPage from './components/ConflictPage';

export default function App() {
  const { token, view, setView } = useStore();
  const [loading, setLoading] = useState(true);

  // 从 background 恢复状态
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'get_state' }, (res) => {
      if (res?.token) {
        useStore.setState({
          token:         res.token,
          userId:        res.userId,
          userAvatar:    res.userAvatar,
          syncUrl:       res.syncUrl ?? 'https://sync.gitmob.xyz',
          deviceId:      res.deviceId ?? '',
          groups:        res.groups  ?? [],
          repos:         res.repos   ?? [],
          versionVector: res.versionVector ?? {},
          syncStatus:    res.syncStatus ?? 'idle',
          syncError:     res.syncError  ?? null,
          lastSyncAt:    res.lastSyncAt ?? null,
        });
      }
      setLoading(false);
    });

    // 监听 chrome.storage 变化（background 写入后自动触发）
    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      // 数据更新：直接用 newValue，避免再次 sendMessage 延迟
      if (changes.groups || changes.repos || changes.versionVector || changes.lastSyncAt) {
        const update: Record<string, unknown> = {};
        if (changes.groups)        update.groups        = changes.groups.newValue        ?? [];
        if (changes.repos)         update.repos         = changes.repos.newValue         ?? [];
        if (changes.versionVector) update.versionVector = changes.versionVector.newValue ?? {};
        if (changes.lastSyncAt)    update.lastSyncAt    = changes.lastSyncAt.newValue    ?? null;
        useStore.setState(update as any);
      }
      // 同步状态
      if (changes.syncStatus || changes.syncError) {
        useStore.setState({
          syncStatus: (changes.syncStatus?.newValue ?? useStore.getState().syncStatus) as any,
          syncError:   changes.syncError?.newValue  ?? null,
        });
      }
      // 冲突
      if (changes.pendingConflicts?.newValue) {
        useStore.setState({
          conflicts: changes.pendingConflicts.newValue,
          view: 'conflict',
        });
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-bg-deep" style={{ width: '400px', height: '600px' }}>
        <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin-slow" />
      </div>
    );
  }

  if (!token) return <LoginPage />;

  return (
    <div className="flex flex-col bg-bg-deep overflow-hidden" style={{ width: '400px', height: '600px' }}>
      {view === 'main'     && <MainPage />}
      {view === 'settings' && <SettingsPage onBack={() => setView('main')} />}
      {view === 'logs'     && <LogsPage     onBack={() => setView('main')} />}
      {view === 'conflict' && <ConflictPage onBack={() => setView('main')} />}
    </div>
  );
}
