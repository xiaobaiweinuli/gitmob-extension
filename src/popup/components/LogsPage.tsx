import React, { useEffect, useState } from 'react';
import { useStore } from '../../shared/store';
import { SyncApi } from '../../shared/api';
import { SyncLog } from '../../shared/types';

interface Props { onBack: () => void }

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  add_repo:          { label: '新增收藏',   color: 'text-ok',      icon: '＋' },
  remove_repo:       { label: '移出收藏',   color: 'text-error',   icon: '－' },
  move_repo:         { label: '移动仓库',   color: 'text-accent',  icon: '↗' },
  add_group:         { label: '新增分组',   color: 'text-ok',      icon: '＋' },
  rename_group:      { label: '修改分组',   color: 'text-accent',  icon: '✎' },
  delete_group:      { label: '删除分组',   color: 'text-error',   icon: '🗑' },
  reorder_groups:    { label: '分组排序',   color: 'text-text-sec', icon: '⇅' },
  reorder_repos:     { label: '仓库排序',   color: 'text-text-sec', icon: '⇅' },
  full_push:         { label: '全量上传',   color: 'text-warn',    icon: '↑' },
  full_pull:         { label: '全量拉取',   color: 'text-warn',    icon: '↓' },
  conflict_resolved: { label: '冲突解决',   color: 'text-accent',  icon: '✓' },
};

function formatDetail(action: string, detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '';
  const d = detail as Record<string, unknown>;
  if (action === 'add_repo' || action === 'remove_repo') return String(d.full_name ?? '');
  if (action === 'add_group' || action === 'rename_group') return String(d.name ?? d.group_id ?? '');
  if (action === 'delete_group') return `模式: ${d.mode ?? ''}`;
  if (action === 'full_push' || action === 'full_pull')
    return `${d.groups ?? 0} 个分组 · ${d.repos ?? 0} 个仓库`;
  if (action === 'conflict_resolved') return `${d.count ?? 0} 处冲突`;
  return '';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LogsPage({ onBack }: Props) {
  const { token, syncUrl, deviceId } = useStore();
  const [logs,    setLogs]    = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!token) return;
    const api = new SyncApi(token, syncUrl, deviceId);
    api.getLogs()
      .then(res => {
        if (res.ok) setLogs(res.logs);
        else setError('获取日志失败');
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-[600px]">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dim shrink-0">
        <button onClick={onBack} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-item text-text-sec hover:text-text-pri transition-colors">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-text-pri">同步日志</span>
        <span className="text-xs text-text-sec ml-auto">最近 100 条</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin-slow" />
          </div>
        )}

        {error && (
          <div className="mx-4 mt-4 px-3 py-2.5 bg-error/10 border border-error/30 rounded-xl text-xs text-error">
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-3xl mb-3">📋</span>
            <p className="text-sm text-text-sec">暂无同步记录</p>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="px-3 py-3 space-y-0">
            {logs.map((log, i) => {
              const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'text-text-sec', icon: '·' };
              const detail = formatDetail(log.action, log.detail);
              const isSelf = log.device_id === deviceId;

              return (
                <div key={log.id} className={`flex gap-3 py-2.5 ${i !== logs.length - 1 ? 'border-b border-border-dim/50' : ''}`}>
                  {/* 图标 */}
                  <div className={`w-6 h-6 rounded-lg bg-bg-item flex items-center justify-center text-xs shrink-0 mt-0.5 ${meta.color}`}>
                    {meta.icon}
                  </div>
                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                      {!isSelf && (
                        <span className="text-[10px] text-text-sec bg-bg-item px-1.5 rounded-full">其他设备</span>
                      )}
                    </div>
                    {detail && <p className="text-xs text-text-sec font-mono mt-0.5 truncate">{detail}</p>}
                    <p className="text-[10px] text-text-sec/50 mt-0.5">{formatTime(log.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
