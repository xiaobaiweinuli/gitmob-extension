import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FavGroup, FavRepo } from '../shared/types';

interface Props {
  owner:          string;
  repo:           string;
  modalContainer: HTMLElement;
  btnContainer:   HTMLElement;  // 直接操作 DOM 更新位置，避免 React 渲染层延迟
}

type State = 'loading' | 'not_authed' | 'favorited' | 'not_favorited';

// ─── 主题 ─────────────────────────────────────────────────────────────────────
const DARK = {
  bgCard: '#161B25', bgItem: '#1E2535', border: '#2A3347',
  textPri: '#E8EAF0', textSec: '#9BA3BA',
  shadow: '0 16px 40px rgba(0,0,0,0.5)',
  btnShadow: '0 4px 12px rgba(0,0,0,0.4)',
  overlay: 'rgba(0,0,0,0.65)',
};
const LIGHT = {
  bgCard: '#FFFFFF', bgItem: '#F1F5F9', border: '#E2E8F0',
  textPri: '#0F172A', textSec: '#64748B',
  shadow: '0 16px 40px rgba(0,0,0,0.15)',
  btnShadow: '0 4px 12px rgba(0,0,0,0.12)',
  overlay: 'rgba(0,0,0,0.45)',
};
type Theme = typeof DARK;

function useTheme() {
  const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return dark ? DARK : LIGHT;
}

export default function FloatBtn({ owner, repo, modalContainer, btnContainer }: Props) {
  const fullName = `${owner}/${repo}`;
  const t = useTheme();

  const [state,         setState]         = useState<State>('loading');
  const [groups,        setGroups]        = useState<FavGroup[]>([]);
  const [showModal,     setShowModal]     = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [adding,        setAdding]        = useState(false);
  const [showNewGroup,  setShowNewGroup]  = useState(false);
  const [newGroupName,  setNewGroupName]  = useState('');
  const [newGroupDesc,  setNewGroupDesc]  = useState('');
  const [nameError,     setNameError]     = useState('');
  const [repoMeta,      setRepoMeta]      = useState<Partial<FavRepo>>({});

  // ─── 拖拽（Pointer Events API）─────────────────────────────────────────────
  // 直接操作 btnContainer.style.top，不通过 React state，无渲染延迟
  const isDragging   = useRef(false);
  const dragMoved    = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const posRef       = useRef(50);   // viewport 高度百分比，持久化位置

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (showModal) return;
    e.preventDefault();
    isDragging.current   = true;
    dragMoved.current    = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [showModal]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging.current) return;
    const dy = e.clientY - pointerStart.current.y;
    if (Math.abs(dy) > 3) dragMoved.current = true;
    const newTop = posRef.current + (dy / window.innerHeight) * 100;
    const clamped = Math.max(5, Math.min(95, newTop));
    posRef.current = clamped;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    // 直接操作 DOM，不触发 React 重新渲染，拖拽更顺滑
    btnContainer.style.top = `${clamped}%`;
  }, [btnContainer]);

  // ─── 加载 storage 状态 ────────────────────────────────────────────────────
  const loadState = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'get_state' }, (res) => {
      if (!res?.token) { setState('not_authed'); return; }
      const repos: FavRepo[] = res.repos ?? [];
      const fav = repos.find(r => r.full_name === fullName);
      setState(fav ? 'favorited' : 'not_favorited');
      setSelectedGroup(fav?.group_id ?? null);
      setGroups(res.groups ?? []);
    });
  }, [fullName]);

  useEffect(() => { loadState(); }, [loadState]);

  // 监听 storage 变化 + background 推送，保持双向同步
  useEffect(() => {
    const storageH = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes.groups || changes.repos) loadState();
    };
    const msgH = (msg: { type?: string }) => {
      if (msg?.type === 'gitmob_state_updated') loadState();
    };
    chrome.storage.onChanged.addListener(storageH);
    chrome.runtime.onMessage.addListener(msgH);
    return () => {
      chrome.storage.onChanged.removeListener(storageH);
      chrome.runtime.onMessage.removeListener(msgH);
    };
  }, [loadState]);

  // ─── 拉取仓库元信息 ───────────────────────────────────────────────────────
  async function fetchRepoMeta(): Promise<Partial<FavRepo>> {
    try {
      const res   = await chrome.runtime.sendMessage({ action: 'get_state' });
      const token = res?.token as string;
      if (!token) return {};
      const r = await fetch(`https://api.github.com/repos/${fullName}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'GitMob-Extension/1.0' },
      });
      if (!r.ok) return {};
      const d = await r.json() as any;
      return {
        github_id: d.id, name: d.name, owner_login: d.owner?.login,
        description: d.description, language: d.language,
        stars: d.stargazers_count, forks: d.forks_count,
        default_branch: d.default_branch, is_private: d.private,
        archived: d.archived, html_url: d.html_url,
        website: d.homepage, topics: d.topics ?? [],
      };
    } catch { return {}; }
  }

  // ─── 弹窗开关 ─────────────────────────────────────────────────────────────
  async function openModal() {
    loadState();
    const meta = await fetchRepoMeta();
    setRepoMeta(meta);
    setShowModal(true);
    modalContainer.style.pointerEvents = 'auto';
  }

  function closeModal() {
    setShowModal(false);
    setShowNewGroup(false);
    setNewGroupName('');
    setNewGroupDesc('');
    setNameError('');
    modalContainer.style.pointerEvents = 'none';
  }

  // pointerUp：未拖拽则触发 openModal
  const openModalRef = useRef(openModal);
  useEffect(() => { openModalRef.current = openModal; });

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!dragMoved.current) openModalRef.current();
  }, []);

  // ─── 确认收藏 ─────────────────────────────────────────────────────────────
  async function handleConfirm() {
    setAdding(true);
    const repo: FavRepo = {
      full_name:      fullName,
      github_id:      repoMeta.github_id ?? 0,
      name:           repoMeta.name ?? fullName.split('/')[1],
      owner_login:    repoMeta.owner_login ?? owner,
      description:    repoMeta.description ?? null,
      language:       repoMeta.language ?? null,
      stars:          repoMeta.stars ?? 0,
      forks:          repoMeta.forks ?? 0,
      default_branch: repoMeta.default_branch ?? 'main',
      is_private:     repoMeta.is_private ?? false,
      archived:       repoMeta.archived ?? false,
      html_url:       repoMeta.html_url ?? `https://github.com/${fullName}`,
      website:        repoMeta.website ?? null,
      topics:         repoMeta.topics ?? [],
      group_id:       selectedGroup,
      sort_order:     0,
      updated_at:     Date.now(),
    };
    await chrome.runtime.sendMessage({ action: 'add_favorite', repo });
    setState('favorited');
    closeModal();
    setAdding(false);
  }

  // ─── 移出收藏 ─────────────────────────────────────────────────────────────
  async function handleRemove() {
    await chrome.runtime.sendMessage({ action: 'remove_favorite', fullName });
    setState('not_favorited');
    setSelectedGroup(null);
    closeModal();
  }

  // ─── 新建分组（含重复名称检查）────────────────────────────────────────────
  async function handleAddNewGroup() {
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;
    // 检查分组名是否已存在（不区分大小写）
    const duplicate = groups.some(
      g => g.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setNameError(`分组「${trimmedName}」已存在`);
      return;
    }
    setNameError('');
    const group = {
      id:          crypto.randomUUID(),
      name:        trimmedName,
      description: newGroupDesc.trim(),
      sort_order:  groups.length,
    };
    const res = await chrome.runtime.sendMessage({ action: 'add_group', group });
    if (res?.ok !== false) setSelectedGroup(group.id);
    setNewGroupName('');
    setNewGroupDesc('');
    setShowNewGroup(false);
  }

  if (state === 'not_authed' || state === 'loading') return null;

  const isFav = state === 'favorited';

  // ─── 弹窗内容（portal 到独立容器）────────────────────────────────────────
  const modalContent = showModal ? (
    <div
      style={{
        position: 'fixed', inset: 0, background: t.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
      onClick={closeModal}
    >
      <div
        style={{
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: '20px', padding: '20px',
          width: '300px', maxWidth: 'calc(100vw - 32px)',
          boxShadow: t.shadow, color: t.textPri,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 仓库名 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '14px', fontWeight: 700, color: '#FF6B4A',
            fontFamily: 'monospace', marginBottom: '2px', wordBreak: 'break-all',
          }}>
            {fullName}
          </div>
          {repoMeta.description && (
            <div style={{ fontSize: '12px', color: t.textSec, lineHeight: 1.5 }}>
              {repoMeta.description}
            </div>
          )}
        </div>

        {/* 分组选择 */}
        <div style={{
          fontSize: '11px', fontWeight: 700, color: t.textSec,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px',
        }}>
          选择分组
        </div>
        <div style={{
          maxHeight: '160px', overflowY: 'auto', marginBottom: '10px',
          display: 'flex', flexDirection: 'column', gap: '6px',
        }}>
          <GroupOption label="未分组" desc={null} selected={selectedGroup === null}
            onSelect={() => setSelectedGroup(null)} t={t} />
          {groups.sort((a, b) => a.sort_order - b.sort_order).map(g => (
            <GroupOption key={g.id} label={g.name} desc={g.description || null}
              selected={selectedGroup === g.id} onSelect={() => setSelectedGroup(g.id)} t={t} />
          ))}
        </div>

        {/* 新建分组 */}
        {showNewGroup ? (
          <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              autoFocus
              style={{
                background: t.bgItem, border: `1px solid ${nameError ? '#F85149' : t.border}`,
                borderRadius: '10px', padding: '7px 10px',
                color: t.textPri, fontSize: '13px', outline: 'none', width: '100%',
                boxSizing: 'border-box',
              }}
              placeholder="分组名称"
              value={newGroupName}
              onChange={e => { setNewGroupName(e.target.value); setNameError(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddNewGroup();
                if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName(''); setNewGroupDesc(''); setNameError(''); }
              }}
            />
            {nameError && (
              <div style={{ fontSize: '11px', color: '#F85149', padding: '0 2px' }}>
                {nameError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                style={{
                  flex: 1, background: t.bgItem, border: `1px solid ${t.border}`,
                  borderRadius: '10px', padding: '7px 10px',
                  color: t.textPri, fontSize: '12px', outline: 'none',
                }}
                placeholder="描述（可选）"
                value={newGroupDesc}
                onChange={e => setNewGroupDesc(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddNewGroup();
                  if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName(''); setNewGroupDesc(''); setNameError(''); }
                }}
              />
              <button
                style={{
                  background: '#FF6B4A', border: 'none', borderRadius: '10px',
                  color: '#fff', padding: '7px 12px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                }}
                onClick={handleAddNewGroup}
              >
                添加
              </button>
            </div>
            <button
              style={{
                background: 'none', border: 'none', color: t.textSec,
                cursor: 'pointer', fontSize: '12px', padding: '2px 0', textAlign: 'left',
              }}
              onClick={() => { setShowNewGroup(false); setNewGroupName(''); setNewGroupDesc(''); setNameError(''); }}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'none', border: 'none', color: '#FF6B4A',
              cursor: 'pointer', fontSize: '12px', padding: '4px 0', marginBottom: '12px',
            }}
            onClick={() => setShowNewGroup(true)}
          >
            <span style={{ fontSize: '15px' }}>＋</span> 新建分组
          </button>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              flex: 1, background: 'none', border: `1px solid ${t.border}`,
              borderRadius: '12px', color: t.textSec,
              cursor: 'pointer', padding: '9px', fontSize: '13px',
            }}
            onClick={closeModal}
          >
            取消
          </button>
          {isFav && (
            <button
              style={{
                flex: 1, background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)', borderRadius: '12px',
                color: '#F85149', cursor: 'pointer', padding: '9px', fontSize: '13px',
              }}
              onClick={handleRemove}
            >
              移出收藏
            </button>
          )}
          <button
            style={{
              flex: 1, background: '#FF6B4A', border: 'none', borderRadius: '12px',
              color: '#fff', cursor: adding ? 'not-allowed' : 'pointer',
              padding: '9px', fontSize: '13px', fontWeight: 600,
              opacity: adding ? 0.7 : 1,
            }}
            onClick={handleConfirm}
            disabled={adding}
          >
            {adding ? '…' : (isFav ? '确认修改' : '确认收藏')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* 按钮包装：translateY 垂直居中，pointer-events 激活 */}
      <div style={{ transform: 'translateY(-50%)', pointerEvents: 'auto' }}>
        <button
          ref={undefined}
          style={{
            width: '40px', height: '40px', borderRadius: '12px',
            border: `1px solid ${isFav ? '#FF6B4A40' : t.border}`,
            background: isFav ? 'rgba(255,107,74,0.12)' : t.bgCard,
            color: isFav ? '#FF6B4A' : t.textSec,
            cursor: isDragging.current ? 'grabbing' : 'grab',
            outline: 'none', touchAction: 'none',  // 禁用 touch 滚动，防止干扰拖拽
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '1px',
            boxShadow: t.btnShadow, transition: 'border-color 0.2s, background 0.2s',
            userSelect: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={isFav ? '已收藏 · 点击管理 / 拖拽移动' : '收藏 / 拖拽移动'}
        >
          <span style={{ fontSize: '16px', pointerEvents: 'none' }}>{isFav ? '★' : '☆'}</span>
          <span style={{ fontSize: '9px', letterSpacing: '-0.3px', marginTop: '-1px', pointerEvents: 'none' }}>
            {isFav ? '已收藏' : '收藏'}
          </span>
        </button>
      </div>

      {createPortal(modalContent, modalContainer)}
    </>
  );
}

// ─── 分组选项 ─────────────────────────────────────────────────────────────────
function GroupOption({ label, desc, selected, onSelect, t }: {
  label: string; desc: string | null; selected: boolean;
  onSelect: () => void; t: Theme;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '9px 12px', borderRadius: '12px', cursor: 'pointer',
        border: `1px solid ${selected ? 'rgba(255,107,74,0.5)' : t.border}`,
        background: selected ? 'rgba(255,107,74,0.08)' : 'transparent',
        transition: 'all 0.15s',
      }}
    >
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
        border: `2px solid ${selected ? '#FF6B4A' : t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#FF6B4A' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 600, color: t.textPri,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        {desc && (
          <div style={{
            fontSize: '11px', color: t.textSec, marginTop: '1px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}
