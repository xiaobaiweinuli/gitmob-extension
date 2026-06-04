import React from 'react';
import { useStore } from '../../shared/store';
import { SyncStatus } from '../../shared/types';

interface Props {
  onSettings: () => void;
  onLogout:   () => void;
}

const STATUS_DOT: Record<SyncStatus, { color: string; label: string; pulse: boolean }> = {
  idle:    { color: 'bg-text-sec',  label: '未同步',  pulse: false },
  syncing: { color: 'bg-warn',      label: '同步中…', pulse: true  },
  ok:      { color: 'bg-ok',        label: '已同步',  pulse: false },
  error:   { color: 'bg-error',     label: '同步失败', pulse: false },
  offline: { color: 'bg-text-sec',  label: '离线',    pulse: false },
};

export default function Header({ onSettings, onLogout }: Props) {
  const { userId, userAvatar, syncStatus, syncError, conflicts } = useStore();
  const dot = STATUS_DOT[syncStatus];

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-dim shrink-0">
      {/* 头像 */}
      {userAvatar ? (
        <img
          src={userAvatar}
          alt={userId ?? ''}
          className="w-8 h-8 rounded-full ring-1 ring-border-dim shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-bg-item flex items-center justify-center shrink-0">
          <span className="text-sm">👤</span>
        </div>
      )}

      {/* 用户名 */}
      <span className="text-sm font-semibold text-text-pri flex-1 truncate">{userId}</span>

      {/* 同步状态 */}
      <button
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-item border border-border-dim text-xs font-medium text-text-sec hover:border-accent/50 transition-colors"
        title={syncError ?? dot.label}
        onClick={() => {
          useStore.setState({ syncStatus: 'syncing' });
          chrome.runtime.sendMessage({ action: 'sync_now' });
        }}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot.color} ${dot.pulse ? 'animate-pulse' : ''} shrink-0`} />
        {dot.label}
        {conflicts.length > 0 && (
          <span className="ml-1 bg-error text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
            {conflicts.length}
          </span>
        )}
      </button>

      {/* 设置 */}
      <button
        onClick={onSettings}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-item text-text-sec hover:text-text-pri transition-colors"
        title="设置"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>

      {/* 退出 */}
      <button
        onClick={onLogout}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-item text-text-sec hover:text-error transition-colors"
        title="退出登录"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
