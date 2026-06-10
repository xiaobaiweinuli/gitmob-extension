import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS }         from '@dnd-kit/utilities';
import { FavGroup, FavRepo } from '../../shared/types';
import { getGroupRepos }     from '../../shared/store';
import RepoCard from './RepoCard';

interface Props {
  group:        FavGroup;
  allGroups:    FavGroup[];   // 用于重复名称检查
  repos:        FavRepo[];
  editMode:     boolean;
  onSave:       (id: string, name: string, desc: string) => void;
  onDelete:     (id: string) => void;
  onRemoveRepo: (fullName: string) => void;
  onAddRepo?:   () => void;
}

export default function GroupItem({
  group, allGroups, repos, editMode, onSave, onDelete, onRemoveRepo,
}: Props) {
  const [open,      setOpen]      = useState(true);
  const [editing,   setEditing]   = useState(false);
  const [name,      setName]      = useState(group.name);
  const [desc,      setDesc]      = useState(group.description);
  const [showDel,   setShowDel]   = useState(false);
  const [nameError, setNameError] = useState('');

  const nameRef    = useRef<HTMLInputElement>(null);
  const groupRepos = getGroupRepos(repos, group.id);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  const style: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.5 : 1,
    zIndex:     isDragging ? 50 : undefined,
  };

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // 重复名称检查（排除自身，不区分大小写）
    const duplicate = allGroups.some(
      g => g.id !== group.id && g.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setNameError(`分组「${trimmed}」已存在`);
      return;
    }
    setNameError('');
    onSave(group.id, trimmed, desc.trim());
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { handleSave(); }
    if (e.key === 'Escape') {
      setName(group.name); setDesc(group.description);
      setEditing(false); setNameError('');
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="animate-fade-in">
      {/* 分组标题行 */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl group transition-colors ${
        isDragging ? 'bg-bg-item' : 'hover:bg-bg-item/50'
      }`}>
        {/* 拖拽把手（编辑模式）*/}
        {editMode && (
          <button
            {...attributes} {...listeners}
            className="text-text-sec/40 hover:text-text-sec cursor-grab active:cursor-grabbing shrink-0 p-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM17 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
            </svg>
          </button>
        )}

        {/* 展开/折叠箭头 */}
        {!editing && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-text-sec/50 hover:text-text-sec transition-colors shrink-0"
          >
            <svg
              width="12" height="12" viewBox="0 0 20 20" fill="currentColor"
              className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* 行内编辑 / 正常显示 */}
        {editing ? (
          <div className="flex-1 space-y-1">
            <input
              ref={nameRef}
              className={`gm-input py-1 text-sm ${nameError ? 'border-error' : ''}`}
              value={name}
              onChange={e => { setName(e.target.value); setNameError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="分组名称"
            />
            {nameError && (
              <p className="text-[11px] px-1" style={{ color: '#F85149' }}>{nameError}</p>
            )}
            <input
              className="gm-input py-1 text-xs"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述（可选）"
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-text-pri truncate">{group.name}</span>
              <span className="text-[10px] text-text-sec bg-bg-item px-1.5 py-0.5 rounded-full shrink-0">
                {groupRepos.length}
              </span>
            </div>
            {group.description && (
              <p className="text-xs text-text-sec truncate mt-0.5">{group.description}</p>
            )}
          </div>
        )}

        {/* 操作按钮区 */}
        {editing ? (
          <div className="flex gap-1 shrink-0">
            <button onClick={handleSave}   className="w-7 h-7 flex items-center justify-center rounded-lg bg-ok/10 text-ok hover:bg-ok/20 transition-colors text-sm">✓</button>
            <button onClick={() => { setName(group.name); setDesc(group.description); setEditing(false); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-bg-item text-text-sec hover:text-text-pri transition-colors text-sm">✕</button>
          </div>
        ) : (
          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* 编辑 */}
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-item text-text-sec hover:text-text-pri transition-colors"
              title="编辑"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
              </svg>
            </button>
            {/* 删除 */}
            <button
              onClick={() => setShowDel(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-error/10 text-text-sec hover:text-error transition-colors"
              title="删除"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 仓库列表（展开状态）*/}
      {open && !editing && groupRepos.length > 0 && (
        <div className="ml-6 mt-1.5 mb-2 space-y-1.5">
          {groupRepos.map(repo => (
            <RepoCard
              key={repo.full_name}
              repo={repo}
              onRemove={onRemoveRepo}
            />
          ))}
        </div>
      )}

      {open && !editing && groupRepos.length === 0 && (
        <p className="ml-6 mt-1 mb-2 text-xs text-text-sec/50 italic">暂无收藏仓库</p>
      )}

      {/* 删除确认弹窗 */}
      {showDel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowDel(false)}>
          <div className="gm-card p-5 w-72 shadow-gm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-text-pri mb-1">删除分组「{group.name}」</h3>
            <p className="text-xs text-text-sec mb-4">请选择删除方式：</p>
            <div className="space-y-2">
              <button
                onClick={() => { onDelete(group.id + ':group_only'); setShowDel(false); }}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-bg-item hover:bg-bg-item/80 text-sm text-text-pri border border-border-dim transition-colors"
              >
                <span className="font-medium">删除分组</span>
                <span className="text-text-sec text-xs ml-1">· 内容移至未分组</span>
              </button>
              <button
                onClick={() => { onDelete(group.id + ':all'); setShowDel(false); }}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-error/10 hover:bg-error/15 text-sm text-error border border-error/20 transition-colors"
              >
                同时删除分组内所有收藏
              </button>
              <button
                onClick={() => setShowDel(false)}
                className="w-full px-3 py-2 text-sm text-text-sec hover:text-text-pri transition-colors"
              >取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
