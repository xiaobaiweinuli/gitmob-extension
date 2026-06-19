import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FavGroup, FavRepo } from '../shared/types';

interface Props {
  owner:          string;
  repo:           string;
  btnContainer:   HTMLElement;
  modalContainer: HTMLElement;
}

type FavState = 'loading' | 'not_authed' | 'favorited' | 'not_favorited';

// ─── 主题 ──────────────────────────────────────────────────────────────────
const DARK  = { bgCard:'#161B25', bgItem:'#1E2535', border:'#2A3347', textPri:'#E8EAF0', textSec:'#9BA3BA', shadow:'0 16px 40px rgba(0,0,0,.5)', btnShadow:'0 4px 12px rgba(0,0,0,.4)', overlay:'rgba(0,0,0,.65)' };
const LIGHT = { bgCard:'#FFFFFF', bgItem:'#F1F5F9', border:'#E2E8F0', textPri:'#0F172A',  textSec:'#64748B',  shadow:'0 16px 40px rgba(0,0,0,.15)', btnShadow:'0 4px 12px rgba(0,0,0,.12)', overlay:'rgba(0,0,0,.45)' };
type Theme = typeof DARK;

function useTheme(): Theme {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return dark ? DARK : LIGHT;
}

// ─── 按钮位置（全屏可拖，松手贴边）────────────────────────────────────────
interface BtnPos { x: number; y: number; }  // 按钮左上角相对 viewport

function snapToEdge(pos: BtnPos, btnW: number, btnH: number): BtnPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  // 松手时吸附到最近的水平边
  const snapLeft  = pos.x + btnW / 2 < vw / 2;
  const x = snapLeft ? margin : vw - btnW - margin;
  // 垂直方向限制在屏幕内
  const y = Math.max(margin, Math.min(vh - btnH - margin, pos.y));
  return { x, y };
}

export default function FloatBtn({ owner, repo, btnContainer, modalContainer }: Props) {
  const fullName = `${owner}/${repo}`;
  const t = useTheme();

  const [favState,      setFavState]      = useState<FavState>('loading');
  const [groups,        setGroups]        = useState<FavGroup[]>([]);
  const [showModal,     setShowModal]     = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [adding,        setAdding]        = useState(false);
  const [showNewGroup,  setShowNewGroup]  = useState(false);
  const [newGroupName,  setNewGroupName]  = useState('');
  const [newGroupDesc,  setNewGroupDesc]  = useState('');
  const [nameError,     setNameError]     = useState('');
  const [repoMeta,      setRepoMeta]      = useState<Partial<FavRepo>>({});

  // ─── 拖拽状态 ───────────────────────────────────────────────────────────
  const BTN_SIZE = 44; // px
  const isDragging  = useRef(false);
  const dragMoved   = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  // 按钮当前位置（左上角 viewport 坐标）
  const posRef = useRef<BtnPos>({ x: window.innerWidth - BTN_SIZE - 16, y: window.innerHeight / 2 - BTN_SIZE / 2 });

  // 初始化容器位置（去掉 index.tsx 里的 transform，改为绝对坐标）
  useEffect(() => {
    const p = posRef.current;
    Object.assign(btnContainer.style, {
      right:     '',
      top:       `${p.y}px`,
      left:      `${p.x}px`,
      transform: '',
    });
  }, [btnContainer]);

  function applyPos(p: BtnPos) {
    posRef.current = p;
    btnContainer.style.left = `${p.x}px`;
    btnContainer.style.top  = `${p.y}px`;
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (showModal) return;
    e.preventDefault();
    isDragging.current  = true;
    dragMoved.current   = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [showModal]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
    const p = posRef.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    applyPos({
      x: Math.max(0, Math.min(vw - BTN_SIZE, p.x + dx)),
      y: Math.max(0, Math.min(vh - BTN_SIZE, p.y + dy)),
    });
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (dragMoved.current) {
      // 松手：吸附到最近侧边
      applyPos(snapToEdge(posRef.current, BTN_SIZE, BTN_SIZE));
    } else {
      // 没移动：视为点击，打开弹窗
      openModal();
    }
  }, []);

  // ─── 数据加载 ─────────────────────────────────────────────────────────
  const loadState = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'get_state' }, (res) => {
      if (!res?.token) { setFavState('not_authed'); return; }
      const all: FavRepo[] = res.repos ?? [];
      const fav = all.find(r => r.full_name === fullName);
      setFavState(fav ? 'favorited' : 'not_favorited');
      setSelectedGroup(fav?.group_id ?? null);
      setGroups(res.groups ?? []);
    });
  }, [fullName]);

  useEffect(() => { loadState(); }, [loadState]);

  useEffect(() => {
    const onStorage = (ch: { [k: string]: chrome.storage.StorageChange }) => {
      if (ch.groups || ch.repos) loadState();
    };
    const onMsg = (msg: { type?: string }) => {
      if (msg?.type === 'gitmob_state_updated') loadState();
    };
    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMsg);
    };
  }, [loadState]);

  // ─── 仓库元信息 ───────────────────────────────────────────────────────
  async function fetchMeta(): Promise<Partial<FavRepo>> {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'get_state' });
      const tok = res?.token as string;
      if (!tok) return {};
      const r = await fetch(`https://api.github.com/repos/${fullName}`, {
        headers: { Authorization: `Bearer ${tok}`, 'User-Agent': 'GitMob-Extension/1.0' },
      });
      if (!r.ok) return {};
      const d = await r.json() as any;
      return { github_id: d.id, name: d.name, owner_login: d.owner?.login, description: d.description, language: d.language, stars: d.stargazers_count, forks: d.forks_count, default_branch: d.default_branch, is_private: d.private, archived: d.archived, html_url: d.html_url, website: d.homepage, topics: d.topics ?? [] };
    } catch { return {}; }
  }

  // ─── 弹窗开关 ──────────────────────────────────────────────────────────
  const openModalRef = useRef<() => void>(() => {});
  async function openModal() {
    loadState();
    setRepoMeta(await fetchMeta());
    setShowModal(true);
    modalContainer.style.pointerEvents = 'auto';
  }
  useEffect(() => { openModalRef.current = openModal; });

  function closeModal() {
    setShowModal(false); setShowNewGroup(false);
    setNewGroupName(''); setNewGroupDesc(''); setNameError('');
    modalContainer.style.pointerEvents = 'none';
  }

  // ─── 收藏操作 ──────────────────────────────────────────────────────────
  async function handleConfirm() {
    setAdding(true);
    const now = Date.now();
    const r: FavRepo = {
      full_name: fullName, github_id: repoMeta.github_id ?? 0,
      name: repoMeta.name ?? fullName.split('/')[1],
      owner_login: repoMeta.owner_login ?? owner,
      description: repoMeta.description ?? null, language: repoMeta.language ?? null,
      stars: repoMeta.stars ?? 0, forks: repoMeta.forks ?? 0,
      default_branch: repoMeta.default_branch ?? 'main',
      is_private: repoMeta.is_private ?? false, archived: repoMeta.archived ?? false,
      html_url: repoMeta.html_url ?? `https://github.com/${fullName}`,
      website: repoMeta.website ?? null, topics: repoMeta.topics ?? [],
      group_id: selectedGroup, sort_order: 0, updated_at: now,
    };
    await chrome.runtime.sendMessage({ action: 'add_favorite', repo: r });
    setFavState('favorited'); closeModal(); setAdding(false);
  }

  async function handleRemove() {
    await chrome.runtime.sendMessage({ action: 'remove_favorite', fullName });
    setFavState('not_favorited'); setSelectedGroup(null); closeModal();
  }

  async function handleAddGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const dup = groups.some(g => g.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) { setNameError(`分组「${name}」已存在`); return; }
    setNameError('');
    const group = { id: crypto.randomUUID(), name, description: newGroupDesc.trim(), sort_order: groups.length };
    const res = await chrome.runtime.sendMessage({ action: 'add_group', group });
    if (res?.ok !== false) setSelectedGroup(group.id);
    setNewGroupName(''); setNewGroupDesc(''); setShowNewGroup(false);
  }

  if (favState === 'not_authed' || favState === 'loading') return null;
  const isFav = favState === 'favorited';

  // ─── 弹窗 DOM（portal 到独立容器）────────────────────────────────────
  const modal = showModal ? (
    <div style={{ position:'fixed', inset:0, background:t.overlay, display:'flex', alignItems:'center', justifyContent:'center', zIndex:99999, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' }} onClick={closeModal}>
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:20, padding:20, width:300, maxWidth:'calc(100vw - 32px)', boxShadow:t.shadow, color:t.textPri }} onClick={e => e.stopPropagation()}>
        {/* 仓库名 */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#FF6B4A', fontFamily:'monospace', wordBreak:'break-all', marginBottom:2 }}>{fullName}</div>
          {repoMeta.description && <div style={{ fontSize:12, color:t.textSec, lineHeight:1.5 }}>{repoMeta.description}</div>}
        </div>

        {/* 分组选择 */}
        <div style={{ fontSize:11, fontWeight:700, color:t.textSec, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>选择分组</div>
        <div style={{ maxHeight:160, overflowY:'auto', marginBottom:10, display:'flex', flexDirection:'column', gap:6 }}>
          <GroupOption label="未分组" desc={null} selected={selectedGroup===null} onSelect={() => setSelectedGroup(null)} t={t} />
          {groups.sort((a,b) => a.sort_order-b.sort_order).map(g => (
            <GroupOption key={g.id} label={g.name} desc={g.description||null} selected={selectedGroup===g.id} onSelect={() => setSelectedGroup(g.id)} t={t} />
          ))}
        </div>

        {/* 新建分组 */}
        {showNewGroup ? (
          <div style={{ marginBottom:12, display:'flex', flexDirection:'column', gap:6 }}>
            <input autoFocus style={{ background:t.bgItem, border:`1px solid ${nameError?'#F85149':t.border}`, borderRadius:10, padding:'7px 10px', color:t.textPri, fontSize:13, outline:'none', width:'100%', boxSizing:'border-box' }}
              placeholder="分组名称" value={newGroupName}
              onChange={e => { setNewGroupName(e.target.value); setNameError(''); }}
              onKeyDown={e => { if(e.key==='Enter') handleAddGroup(); if(e.key==='Escape'){setShowNewGroup(false);setNewGroupName('');setNewGroupDesc('');setNameError('');} }} />
            {nameError && <div style={{ fontSize:11, color:'#F85149' }}>{nameError}</div>}
            <div style={{ display:'flex', gap:6 }}>
              <input style={{ flex:1, background:t.bgItem, border:`1px solid ${t.border}`, borderRadius:10, padding:'7px 10px', color:t.textPri, fontSize:12, outline:'none' }}
                placeholder="描述（可选）" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter') handleAddGroup(); if(e.key==='Escape'){setShowNewGroup(false);setNewGroupName('');setNewGroupDesc('');setNameError('');} }} />
              <button style={{ background:'#FF6B4A', border:'none', borderRadius:10, color:'#fff', padding:'7px 12px', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }} onClick={handleAddGroup}>添加</button>
            </div>
            <button style={{ background:'none', border:'none', color:t.textSec, cursor:'pointer', fontSize:12, padding:'2px 0', textAlign:'left' }} onClick={() => { setShowNewGroup(false); setNewGroupName(''); setNewGroupDesc(''); setNameError(''); }}>取消</button>
          </div>
        ) : (
          <button style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', color:'#FF6B4A', cursor:'pointer', fontSize:12, padding:'4px 0', marginBottom:12 }} onClick={() => setShowNewGroup(true)}>
            <span style={{ fontSize:15 }}>＋</span> 新建分组
          </button>
        )}

        {/* 操作按钮 */}
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ flex:1, background:'none', border:`1px solid ${t.border}`, borderRadius:12, color:t.textSec, cursor:'pointer', padding:9, fontSize:13 }} onClick={closeModal}>取消</button>
          {isFav && (
            <button style={{ flex:1, background:'rgba(248,81,73,.1)', border:'1px solid rgba(248,81,73,.3)', borderRadius:12, color:'#F85149', cursor:'pointer', padding:9, fontSize:13 }} onClick={handleRemove}>移出收藏</button>
          )}
          <button style={{ flex:1, background:'#FF6B4A', border:'none', borderRadius:12, color:'#fff', cursor:adding?'not-allowed':'pointer', padding:9, fontSize:13, fontWeight:600, opacity:adding?0.7:1 }} onClick={handleConfirm} disabled={adding}>
            {adding ? '…' : (isFav ? '确认修改' : '确认收藏')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* 悬浮按钮：pointer-events 激活，touchAction:none 防止触摸滚动干扰拖拽 */}
      <div style={{ pointerEvents:'auto', transform:'none', display:'inline-block' }}>
        <button
          style={{ width:BTN_SIZE, height:BTN_SIZE, borderRadius:12, border:`1px solid ${isFav?'#FF6B4A40':t.border}`, background:isFav?'rgba(255,107,74,.12)':t.bgCard, color:isFav?'#FF6B4A':t.textSec, cursor:isDragging.current?'grabbing':'grab', outline:'none', touchAction:'none', userSelect:'none', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, boxShadow:t.btnShadow, transition:'border-color .2s,background .2s' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title={isFav ? '已收藏 · 拖拽移动 · 点击管理' : '收藏 · 可拖拽移动'}
        >
          <span style={{ fontSize:16, pointerEvents:'none' }}>{isFav ? '★' : '☆'}</span>
          <span style={{ fontSize:9, letterSpacing:'-0.3px', pointerEvents:'none' }}>{isFav ? '已收藏' : '收藏'}</span>
        </button>
      </div>
      {createPortal(modal, modalContainer)}
    </>
  );
}

function GroupOption({ label, desc, selected, onSelect, t }: { label:string; desc:string|null; selected:boolean; onSelect:()=>void; t:Theme }) {
  return (
    <div onClick={onSelect} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'9px 12px', borderRadius:12, cursor:'pointer', border:`1px solid ${selected?'rgba(255,107,74,.5)':t.border}`, background:selected?'rgba(255,107,74,.08)':'transparent', transition:'all .15s' }}>
      <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0, marginTop:1, border:`2px solid ${selected?'#FF6B4A':t.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {selected && <div style={{ width:7, height:7, borderRadius:'50%', background:'#FF6B4A' }} />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:t.textPri, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
        {desc && <div style={{ fontSize:11, color:t.textSec, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{desc}</div>}
      </div>
    </div>
  );
}
