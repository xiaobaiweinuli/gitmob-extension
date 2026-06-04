import React, { useEffect, useState, useRef } from 'react';
import { FavGroup, FavRepo } from '../shared/types';

interface Props { owner: string; repo: string }

type State = 'loading' | 'not_authed' | 'favorited' | 'not_favorited';

// ─── 主题颜色（根据系统深浅色自动切换）──────────────────────────────────────
const DARK = {
  bgDeep:    '#0F1117',
  bgCard:    '#161B25',
  bgItem:    '#1E2535',
  border:    '#2A3347',
  textPri:   '#E8EAF0',
  textSec:   '#9BA3BA',
  shadow:    '0 16px 40px rgba(0,0,0,0.5)',
  btnShadow: '0 4px 12px rgba(0,0,0,0.4)',
  overlay:   'rgba(0,0,0,0.65)',
};
const LIGHT = {
  bgDeep:    '#F5F7FA',
  bgCard:    '#FFFFFF',
  bgItem:    '#F1F5F9',
  border:    '#E2E8F0',
  textPri:   '#0F172A',
  textSec:   '#64748B',
  shadow:    '0 16px 40px rgba(0,0,0,0.15)',
  btnShadow: '0 4px 12px rgba(0,0,0,0.12)',
  overlay:   'rgba(0,0,0,0.45)',
};

function useTheme() {
  const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark ? DARK : LIGHT;
}

// 内联样式工厂（content script 不走 Tailwind，用 JS 动态生成样式）
function makeStyles(t: typeof DARK, favorited: boolean) {
  return {
    btn: {
      width: '40px', height: '40px',
      borderRadius: '12px',
      border: `1px solid ${favorited ? '#FF6B4A40' : t.border}`,
      background: favorited ? 'rgba(255,107,74,0.12)' : t.bgCard,
      color: favorited ? '#FF6B4A' : t.textSec,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: t.btnShadow,
      transition: 'all 0.2s',
      outline: 'none',
      flexDirection: 'column' as const,
      gap: '1px',
      fontSize: '18px',
      lineHeight: 1,
    },
    modal: {
      position: 'fixed' as const,
      inset: 0,
      background: t.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999,
    },
    card: {
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '20px',
      padding: '20px',
      width: '300px',
      boxShadow: t.shadow,
      color: t.textPri,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
  };
}

export default function FloatBtn({ owner, repo }: Props) {
  const fullName = `${owner}/${repo}`;
  const theme = useTheme();
  const [state,        setState]        = useState<State>('loading');
  const [groups,       setGroups]       = useState<FavGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<string | null>(null);
  const [showModal,    setShowModal]    = useState(false);
  const [selectedGroup,setSelectedGroup]= useState<string | null>(null);
  const [adding,       setAdding]       = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [repoMeta,     setRepoMeta]     = useState<Partial<FavRepo>>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  // 加载状态
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'get_state' }, (res) => {
      if (!res?.token) { setState('not_authed'); return; }
      const repos: FavRepo[] = res.repos ?? [];
      const fav = repos.find(r => r.full_name === fullName);
      setState(fav ? 'favorited' : 'not_favorited');
      setCurrentGroup(fav?.group_id ?? null);
      setSelectedGroup(fav?.group_id ?? null);
      setGroups(res.groups ?? []);
    });
  }, [fullName]);

  async function fetchRepoMeta(): Promise<Partial<FavRepo>> {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'get_state' });
      const token: string = res?.token;
      if (!token) return {};
      const r = await fetch(`https://api.github.com/repos/${fullName}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'GitMob-Extension/1.0' },
      });
      if (!r.ok) return {};
      const d = await r.json() as any;
      return {
        github_id:      d.id,
        name:           d.name,
        owner_login:    d.owner?.login,
        description:    d.description,
        language:       d.language,
        stars:          d.stargazers_count,
        forks:          d.forks_count,
        default_branch: d.default_branch,
        is_private:     d.private,
        archived:       d.archived,
        html_url:       d.html_url,
        website:        d.homepage,
        topics:         d.topics ?? [],
      };
    } catch { return {}; }
  }

  async function openModal() {
    const meta = await fetchRepoMeta();
    setRepoMeta(meta);
    setShowModal(true);
  }

  async function handleConfirm() {
    setAdding(true);
    const now = Date.now();
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
      updated_at:     now,
    };
    await chrome.runtime.sendMessage({ action: 'add_favorite', repo });
    setState('favorited');
    setCurrentGroup(selectedGroup);
    setShowModal(false);
    setAdding(false);
  }

  async function handleRemove() {
    await chrome.runtime.sendMessage({ action: 'remove_favorite', fullName });
    setState('not_favorited');
    setCurrentGroup(null);
    setSelectedGroup(null);
    setShowModal(false);
  }

  async function handleAddNewGroup() {
    if (!newGroupName.trim()) return;
    const g: Omit<FavGroup, 'updated_at'> = {
      id:          crypto.randomUUID(),
      name:        newGroupName.trim(),
      description: '',
      sort_order:  groups.length,
    };
    await chrome.runtime.sendMessage({ action: 'add_group', group: g });
    const newG = { ...g, updated_at: Date.now() };
    setGroups(prev => [...prev, newG]);
    setSelectedGroup(newG.id);
    setNewGroupName('');
    setShowNewGroup(false);
  }

  if (state === 'not_authed' || state === 'loading') return null;

  const isFav = state === 'favorited';
  const S = makeStyles(theme, isFav);

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        style={S.btn}
        onClick={openModal}
        onMouseEnter={() => { hoverTimer.current = setTimeout(() => {}, 0); }}
        onMouseLeave={() => clearTimeout(hoverTimer.current)}
        title={isFav ? '已收藏 · 点击管理' : '添加到收藏夹'}
      >
        <span style={{ fontSize: '16px' }}>{isFav ? '★' : '☆'}</span>
        <span style={{ fontSize: '9px', letterSpacing: '-0.3px', marginTop: '-1px' }}>
          {isFav ? '已收藏' : '收藏'}
        </span>
      </button>

      {/* 收藏弹窗 */}
      {showModal && (
        <div style={S.modal} onClick={() => setShowModal(false)}>
          <div style={S.card} onClick={e => e.stopPropagation()}>
            {/* 标题 */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FF6B4A', fontFamily: 'monospace', marginBottom: '2px', wordBreak: 'break-all' }}>
                {fullName}
              </div>
              {repoMeta.description && (
                <div style={{ fontSize: '12px', color: theme.textSec, lineHeight: 1.5 }}>{repoMeta.description}</div>
              )}
            </div>

            {/* 分组选择 */}
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSec, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              选择分组
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <GroupOption label="未分组" desc={null} selected={selectedGroup === null} onSelect={() => setSelectedGroup(null)} theme={theme} />
              {groups.sort((a, b) => a.sort_order - b.sort_order).map(g => (
                <GroupOption key={g.id} label={g.name} desc={g.description} selected={selectedGroup === g.id} onSelect={() => setSelectedGroup(g.id)} theme={theme} />
              ))}
            </div>

            {/* 新建分组 */}
            {showNewGroup ? (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                  autoFocus
                  style={{ flex: 1, background: theme.bgItem, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '7px 10px', color: theme.textPri, fontSize: '13px', outline: 'none' }}
                  placeholder="新分组名称"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddNewGroup(); if (e.key === 'Escape') setShowNewGroup(false); }}
                />
                <button
                  style={{ background: '#FF6B4A', border: 'none', borderRadius: '10px', color: '#fff', padding: '7px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  onClick={handleAddNewGroup}
                >添加</button>
              </div>
            ) : (
              <button
                style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#FF6B4A', cursor: 'pointer', fontSize: '12px', padding: '4px 0', marginBottom: '12px' }}
                onClick={() => setShowNewGroup(true)}
              >
                <span style={{ fontSize: '15px' }}>＋</span> 新建分组
              </button>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                style={{ flex: 1, background: 'none', border: `1px solid ${theme.border}`, borderRadius: '12px', color: theme.textSec, cursor: 'pointer', padding: '9px', fontSize: '13px' }}
                onClick={() => setShowModal(false)}
              >取消</button>
              {isFav && (
                <button
                  style={{ flex: 1, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: '12px', color: '#F85149', cursor: 'pointer', padding: '9px', fontSize: '13px' }}
                  onClick={handleRemove}
                >移出收藏</button>
              )}
              <button
                style={{ flex: 1, background: '#FF6B4A', border: 'none', borderRadius: '12px', color: '#fff', cursor: adding ? 'not-allowed' : 'pointer', padding: '9px', fontSize: '13px', fontWeight: 600, opacity: adding ? 0.7 : 1 }}
                onClick={handleConfirm}
                disabled={adding}
              >{adding ? '…' : (isFav ? '确认修改' : '确认收藏')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GroupOption({ label, desc, selected, onSelect, theme }: {
  label: string; desc: string | null; selected: boolean; onSelect: () => void;
  theme: typeof DARK;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '9px 12px', borderRadius: '12px', cursor: 'pointer',
        border: `1px solid ${selected ? 'rgba(255,107,74,0.5)' : theme.border}`,
        background: selected ? 'rgba(255,107,74,0.08)' : 'transparent',
        transition: 'all 0.15s',
      }}
    >
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%',
        border: `2px solid ${selected ? '#FF6B4A' : theme.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: '1px',
      }}>
        {selected && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#FF6B4A' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPri, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        {desc && <div style={{ fontSize: '11px', color: theme.textSec, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</div>}
      </div>
    </div>
  );
}
