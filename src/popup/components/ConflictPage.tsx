import React, { useState } from 'react';
import { useStore } from '../../shared/store';
import { ConflictItem } from '../../shared/types';
import { conflictKey, applyConflictChoices } from '../../shared/conflict';

interface Props { onBack: () => void }

export default function ConflictPage({ onBack }: Props) {
  const { conflicts, groups, repos, setView } = useStore();
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({});

  function toggle(key: string, val: 'local' | 'remote') {
    setChoices(c => ({ ...c, [key]: val }));
  }

  function selectAll(val: 'local' | 'remote') {
    const all: Record<string, 'local' | 'remote'> = {};
    for (const c of conflicts) all[conflictKey(c)] = val;
    setChoices(all);
  }

  async function handleConfirm() {
    // 从 storage 拿远端数据
    const s = await chrome.storage.local.get(['remoteData']);
    const remote = s.remoteData as { groups: typeof groups; repos: typeof repos } | undefined;
    if (!remote) { setView('main'); return; }

    // 按选择合并
    const defaulted: Record<string, 'local' | 'remote'> = {};
    for (const c of conflicts) {
      const k = conflictKey(c);
      defaulted[k] = choices[k] ?? 'local';
    }

    const { groups: finalGroups, repos: finalRepos } = applyConflictChoices(
      defaulted, conflicts,
      groups, repos,
      remote.groups, remote.repos,
    );

    // 全量推送合并结果
    await chrome.runtime.sendMessage({ action: 'push_full', groups: finalGroups, repos: finalRepos });
    useStore.setState({ groups: finalGroups, repos: finalRepos, conflicts: [] });
    await chrome.storage.local.remove(['pendingConflicts', 'remoteData']);
    setView('main');
  }

  function ConflictRow({ c }: { c: ConflictItem }) {
    const key    = conflictKey(c);
    const choice = choices[key] ?? 'local';

    let title = '';
    let localDesc = '';
    let remoteDesc = '';

    if (c.kind === 'group_name') {
      title      = `分组「${c.localName}」的名称/描述`;
      localDesc  = `${c.localName}${c.localDesc ? ` · ${c.localDesc}` : ''}`;
      remoteDesc = `${c.remoteName}${c.remoteDesc ? ` · ${c.remoteDesc}` : ''}`;
    } else if (c.kind === 'repo_group') {
      title      = `仓库 ${c.fullName} 的分组归属`;
      localDesc  = c.localGroupId  ? (groups.find(g => g.id === c.localGroupId)?.name  ?? c.localGroupId)  : '未分组';
      remoteDesc = c.remoteGroupId ? (groups.find(g => g.id === c.remoteGroupId)?.name ?? c.remoteGroupId) : '未分组';
    } else {
      title      = `仓库 ${c.fullName}`;
      localDesc  = '本机：仍在收藏中';
      remoteDesc = '其他设备：已移出收藏';
    }

    return (
      <div className="gm-card p-3.5 space-y-3 animate-fade-in">
        <p className="text-xs font-semibold text-text-pri">{title}</p>

        {/* 本机 */}
        <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
          choice === 'local' ? 'border-accent/50 bg-accent/5' : 'border-border-dim hover:border-border-dim/80'
        }`}>
          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
            choice === 'local' ? 'border-accent' : 'border-border-dim'
          }`}>
            {choice === 'local' && <div className="w-2 h-2 rounded-full bg-accent" />}
          </div>
          <input type="radio" className="hidden" checked={choice === 'local'} onChange={() => toggle(key, 'local')} />
          <div>
            <p className="text-[10px] font-bold text-text-sec uppercase tracking-wider mb-0.5">保留本机</p>
            <p className="text-xs text-text-pri">{localDesc}</p>
          </div>
        </label>

        {/* 其他设备 */}
        <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
          choice === 'remote' ? 'border-accent/50 bg-accent/5' : 'border-border-dim hover:border-border-dim/80'
        }`}>
          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
            choice === 'remote' ? 'border-accent' : 'border-border-dim'
          }`}>
            {choice === 'remote' && <div className="w-2 h-2 rounded-full bg-accent" />}
          </div>
          <input type="radio" className="hidden" checked={choice === 'remote'} onChange={() => toggle(key, 'remote')} />
          <div>
            <p className="text-[10px] font-bold text-text-sec uppercase tracking-wider mb-0.5">使用其他设备</p>
            <p className="text-xs text-text-pri">{remoteDesc}</p>
          </div>
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px]">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dim shrink-0">
        <button onClick={onBack} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-item text-text-sec hover:text-text-pri transition-colors">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-text-pri">同步冲突</span>
        <span className="ml-auto text-xs bg-warn/10 text-warn px-2 py-0.5 rounded-full font-medium">
          {conflicts.length} 处
        </span>
      </div>

      {/* 说明 */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <p className="text-xs text-text-sec leading-relaxed">
          以下内容在多个设备上同时被修改，请逐项选择保留哪个版本。
        </p>
        <div className="flex gap-2 mt-2">
          <button onClick={() => selectAll('local')}  className="text-xs text-accent hover:underline">全选本机</button>
          <span className="text-text-sec/40">·</span>
          <button onClick={() => selectAll('remote')} className="text-xs text-accent hover:underline">全选其他设备</button>
        </div>
      </div>

      {/* 冲突列表 */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
        {conflicts.map(c => <ConflictRow key={conflictKey(c)} c={c} />)}
      </div>

      {/* 确认按钮 */}
      <div className="px-4 py-3 border-t border-border-dim shrink-0">
        <button onClick={handleConfirm} className="gm-btn w-full py-2.5">
          确认并同步
        </button>
      </div>
    </div>
  );
}
