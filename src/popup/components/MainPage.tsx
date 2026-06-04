import React, { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { useStore, getGroupRepos } from '../../shared/store';
import Header    from './Header';
import GroupItem from './GroupItem';
import RepoCard  from './RepoCard';

export default function MainPage() {
  const { groups, repos, setView, clearAuth } = useStore();
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [ungroupedOpen, setUngroupedOpen] = useState(true);

  const ungroupedRepos = getGroupRepos(repos, null);

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 6 },
  }));

  function handleLogout() {
    chrome.storage.local.clear(() => clearAuth());
  }

  function handleGroupSave(id: string, name: string, desc: string) {
    chrome.runtime.sendMessage({ action: 'update_group', groupId: id, name, description: desc });
    useStore.setState(s => ({
      groups: s.groups.map(g => g.id === id ? { ...g, name, description: desc } : g),
    }));
  }

  function handleGroupDelete(idWithMode: string) {
    const [id, mode] = idWithMode.split(':');
    chrome.runtime.sendMessage({ action: 'delete_group', groupId: id, mode: mode as 'group_only' | 'all' });
    useStore.setState(s => ({
      groups: s.groups.filter(g => g.id !== id),
      repos:  mode === 'all'
        ? s.repos.filter(r => r.group_id !== id)
        : s.repos.map(r => r.group_id === id ? { ...r, group_id: null } : r),
    }));
  }

  function handleRemoveRepo(fullName: string) {
    chrome.runtime.sendMessage({ action: 'remove_favorite', fullName });
    useStore.setState(s => ({ repos: s.repos.filter(r => r.full_name !== fullName) }));
  }

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    const g = {
      id:          crypto.randomUUID(),
      name:        newGroupName.trim(),
      description: newGroupDesc.trim(),
      sort_order:  groups.length,
    };
    chrome.runtime.sendMessage({ action: 'add_group', group: g });
    useStore.setState(s => ({ groups: [...s.groups, { ...g, updated_at: Date.now() }] }));
    setNewGroupName(''); setNewGroupDesc(''); setShowAddGroup(false);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = groups.findIndex(g => g.id === active.id);
    const newIdx = groups.findIndex(g => g.id === over.id);
    const reordered = arrayMove(groups, oldIdx, newIdx).map((g, i) => ({ ...g, sort_order: i }));
    useStore.setState({ groups: reordered });
    chrome.runtime.sendMessage({ action: 'reorder_groups', order: reordered.map(g => g.id) });
  }

  return (
    <div className="flex flex-col h-[600px]">
      <Header
        onSettings={() => setView('settings')}
        onLogout={handleLogout}
      />

      {/* 收藏夹标题 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-sec uppercase tracking-widest">收藏夹</span>
          <span className="text-[10px] text-text-sec/60 bg-bg-item px-1.5 rounded-full">
            {repos.length} 个仓库
          </span>
        </div>
        <button
          onClick={() => setShowAddGroup(true)}
          className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          新建分组
        </button>
      </div>

      {/* 冲突提示横幅 */}
      {useStore.getState().conflicts.length > 0 && (
        <div
          className="mx-3 mb-2 px-3 py-2 bg-warn/10 border border-warn/30 rounded-xl flex items-center justify-between cursor-pointer hover:bg-warn/15 transition-colors animate-fade-in"
          onClick={() => setView('conflict')}
        >
          <div className="flex items-center gap-2 text-xs text-warn font-medium">
            <span>⚠</span>
            <span>检测到 {useStore.getState().conflicts.length} 处同步冲突</span>
          </div>
          <span className="text-xs text-warn/70">查看 →</span>
        </div>
      )}

      {/* 分组列表 */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {groups.length === 0 && ungroupedRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">🔖</span>
            <p className="text-sm font-semibold text-text-pri mb-1">暂无收藏</p>
            <p className="text-xs text-text-sec">在 GitHub 仓库页点击悬浮「★」按钮收藏</p>
          </div>
        ) : (
          <>
            {/* 可拖拽的分组列表 */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={groups.map(g => g.id)}
                strategy={verticalListSortingStrategy}
              >
                {groups.sort((a, b) => a.sort_order - b.sort_order).map(group => (
                  <GroupItem
                    key={group.id}
                    group={group}
                    repos={repos}
                    editMode={true}
                    onSave={handleGroupSave}
                    onDelete={handleGroupDelete}
                    onRemoveRepo={handleRemoveRepo}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* 未分组 */}
            {ungroupedRepos.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setUngroupedOpen(o => !o)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-bg-item/50 transition-colors group"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 20 20" fill="currentColor"
                    className={`text-text-sec/50 transition-transform duration-200 ${ungroupedOpen ? 'rotate-90' : ''}`}
                  >
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span className="text-sm font-semibold text-text-pri">未分组</span>
                  <span className="text-[10px] text-text-sec bg-bg-item px-1.5 py-0.5 rounded-full">
                    {ungroupedRepos.length}
                  </span>
                </button>
                {ungroupedOpen && (
                  <div className="ml-6 mt-1.5 space-y-1.5">
                    {ungroupedRepos.map(repo => (
                      <RepoCard key={repo.full_name} repo={repo} onRemove={handleRemoveRepo} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 新建分组弹窗 */}
      {showAddGroup && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
          onClick={() => setShowAddGroup(false)}
        >
          <div className="gm-card p-5 w-72 shadow-gm animate-fade-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-text-pri mb-4">新建分组</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-text-sec uppercase tracking-wide mb-1.5 block">分组名称</label>
                <input
                  autoFocus
                  className="gm-input"
                  placeholder="例如：工具库"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-sec uppercase tracking-wide mb-1.5 block">描述（可选）</label>
                <input
                  className="gm-input"
                  placeholder="简短描述"
                  value={newGroupDesc}
                  onChange={e => setNewGroupDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAddGroup(false)} className="gm-btn-ghost flex-1">取消</button>
                <button onClick={handleAddGroup} className="gm-btn flex-1" disabled={!newGroupName.trim()}>创建</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
