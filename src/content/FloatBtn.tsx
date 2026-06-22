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
type Side = 'left' | 'right';

// ─── 主题 ──────────────────────────────────────────────────────────────────
const DARK  = { bgCard:'#161B25', bgItem:'#1E2535', border:'#2A3347', textPri:'#E8EAF0', textSec:'#9BA3BA', shadow:'0 12px 32px rgba(0,0,0,.45)', btnShadow:'0 4px 12px rgba(0,0,0,.4)' };
const LIGHT = { bgCard:'#FFFFFF', bgItem:'#F1F5F9', border:'#E2E8F0', textPri:'#0F172A',  textSec:'#64748B',  shadow:'0 12px 32px rgba(0,0,0,.18)', btnShadow:'0 4px 12px rgba(0,0,0,.12)' };
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

const BTN_SIZE = 44;
const MARGIN   = 12;
const MODAL_W  = 300;

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
  const [modalPos,      setModalPos]      = useState<{ top: number; left: number } | null>(null);

  // ─── 按钮位置：side（贴边） + yPercent（垂直相对位置）──────────────────
  // 用相对值而非绝对像素存储，窗口缩放时重新换算像素坐标，按钮始终在可视区内
  const sideRef     = useRef<Side>('right');
  const yPercentRef = useRef(0.5); // 0~1，相对 (视口高度 - 按钮高度) 的比例

  const isDragging   = useRef(false);
  const dragMoved    = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const dragXRef      = useRef(0); // 拖拽中的临时像素位置
  const dragYRef      = useRef(0);

  // 根据 side + yPercent 计算实际像素坐标并应用到 DOM
  const applyFromRelative = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x  = sideRef.current === 'left' ? MARGIN : vw - BTN_SIZE - MARGIN;
    const y  = Math.max(MARGIN, Math.min(vh - BTN_SIZE - MARGIN, yPercentRef.current * (vh - BTN_SIZE)));
    btnContainer.style.left = `${x}px`;
    btnContainer.style.top  = `${y}px`;
    btnContainer.style.right = '';
    btnContainer.style.transform = '';
    dragXRef.current = x;
    dragYRef.current = y;
  }, [btnContainer]);

  // 初始定位 + 监听窗口缩放重新换算（核心修复：按钮不再因缩放消失）
  useEffect(() => {
    applyFromRelative();
    const onResize = () => applyFromRelative();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyFromRelative]);

  // ─── 拖拽 ─────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (showModal) return;
    e.preventDefault();
    isDragging.current   = true;
    dragMoved.current    = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [showModal]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;

    const vw = window.innerWidth, vh = window.innerHeight;
    const nx = Math.max(0, Math.min(vw - BTN_SIZE, dragXRef.current + dx));
    const ny = Math.max(0, Math.min(vh - BTN_SIZE, dragYRef.current + dy));
    dragXRef.current = nx;
    dragYRef.current = ny;
    btnContainer.style.left = `${nx}px`;
    btnContainer.style.top  = `${ny}px`;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }, [btnContainer]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    if (dragMoved.current) {
      // 松手：吸附最近侧边，并把当前位置换算为相对值持久化（缩放安全）
      const vw = window.innerWidth, vh = window.innerHeight;
      const side: Side = (dragXRef.current + BTN_SIZE / 2) < vw / 2 ? 'left' : 'right';
      sideRef.current     = side;
      yPercentRef.current = Math.max(0, Math.min(1, dragYRef.current / (vh - BTN_SIZE)));
      applyFromRelative();
    } else {
      openModal();
    }
  }, [applyFromRelative]);

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

  // ─── 弹窗定位：锚定按钮，自动判断上下左右 ────────────────────────────
  // 不再用全屏居中弹窗；改为紧贴按钮弹出，根据按钮所在象限智能翻转
  const computeModalPos = useCallback((estHeight: number) => {
    const btnRect = btnContainer.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    // 水平方向：按钮贴右边就往左弹，贴左边就往右弹
    const placeLeft = sideRef.current === 'right';
    let left = placeLeft
      ? btnRect.left - MODAL_W - 10
      : btnRect.right + 10;
    // 极端窄屏兜底：弹窗超出视口则贴边显示
    left = Math.max(MARGIN, Math.min(vw - MODAL_W - MARGIN, left));

    // 垂直方向：尽量与按钮顶部对齐，超出底部则向上翻转对齐按钮底部
    let top = btnRect.top;
    if (top + estHeight > vh - MARGIN) {
      top = btnRect.bottom - estHeight;
    }
    top = Math.max(MARGIN, Math.min(vh - estHeight - MARGIN, top));

    return { top, left };
  }, [btnContainer]);

  // ─── 弹窗开关 ──────────────────────────────────────────────────────────
  async function openModal() {
    loadState();
    setRepoMeta(await fetchMeta());
    // 估算弹窗高度（基础内容 ~230px + 分组列表区域），用于初次定位
    setModalPos(computeModalPos(360));
    setShowModal(true);
    modalContainer.style.pointerEvents = 'auto';
  }

  function closeModal() {
    setShowModal(false); setShowNewGroup(false);
    setNewGroupName(''); setNewGroupDesc(''); setNameError('');
    modalContainer.style.pointerEvents = 'none';
  }

  // 弹窗打开期间窗口缩放：重新计算锚定位置，保持跟随按钮
  useEffect(() => {
    if (!showModal) return;
    const onResize = () => setModalPos(computeModalPos(360));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [showModal, computeModalPos]);

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

  // ─── 弹窗 DOM：锚定在按钮旁，带快速淡入缩放动画 ──────────────────────
  const modal = showModal && modalPos ? (
    <>
      {/* 透明全屏背景，仅用于捕获点击外部关闭，不做视觉遮罩，弹窗不再"远在天边" */}
      <div style={{ position:'fixed', inset:0, zIndex:99999 }} onClick={closeModal} />
      <div
        style={{
          position: 'fixed',
          top: modalPos.top, left: modalPos.left,
          background:t.bgCard, border:`1px solid ${t.border}`,
          borderRadius:16, padding:18,
          width: MODAL_W, maxWidth:'calc(100vw - 24px)',
          boxShadow:t.shadow, color:t.textPri,
          zIndex: 100000,
          fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
          animation: 'gitmob-pop-in .12s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes gitmob-pop-in { from { opacity:0; transform:scale(.96); } to { opacity:1; transform:scale(1); } }`}</style>

        {/* 仓库名 */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#FF6B4A', fontFamily:'monospace', wordBreak:'break-all', marginBottom:2 }}>{fullName}</div>
          {repoMeta.description && <div style={{ fontSize:11, color:t.textSec, lineHeight:1.5 }}>{repoMeta.description}</div>}
        </div>

        {/* 分组选择 */}
        <div style={{ fontSize:10, fontWeight:700, color:t.textSec, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:7 }}>选择分组</div>
        <div style={{ maxHeight:150, overflowY:'auto', marginBottom:9, display:'flex', flexDirection:'column', gap:5 }}>
          <GroupOption label="未分组" desc={null} selected={selectedGroup===null} onSelect={() => setSelectedGroup(null)} t={t} />
          {groups.sort((a,b) => a.sort_order-b.sort_order).map(g => (
            <GroupOption key={g.id} label={g.name} desc={g.description||null} selected={selectedGroup===g.id} onSelect={() => setSelectedGroup(g.id)} t={t} />
          ))}
        </div>

        {/* 新建分组 */}
        {showNewGroup ? (
          <div style={{ marginBottom:11, display:'flex', flexDirection:'column', gap:5 }}>
            <input autoFocus style={{ background:t.bgItem, border:`1px solid ${nameError?'#F85149':t.border}`, borderRadius:9, padding:'6px 9px', color:t.textPri, fontSize:12, outline:'none', width:'100%', boxSizing:'border-box' }}
              placeholder="分组名称" value={newGroupName}
              onChange={e => { setNewGroupName(e.target.value); setNameError(''); }}
              onKeyDown={e => { if(e.key==='Enter') handleAddGroup(); if(e.key==='Escape'){setShowNewGroup(false);setNewGroupName('');setNewGroupDesc('');setNameError('');} }} />
            {nameError && <div style={{ fontSize:10, color:'#F85149' }}>{nameError}</div>}
            <div style={{ display:'flex', gap:5 }}>
              <input style={{ flex:1, background:t.bgItem, border:`1px solid ${t.border}`, borderRadius:9, padding:'6px 9px', color:t.textPri, fontSize:11, outline:'none' }}
                placeholder="描述（可选）" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter') handleAddGroup(); if(e.key==='Escape'){setShowNewGroup(false);setNewGroupName('');setNewGroupDesc('');setNameError('');} }} />
              <button style={{ background:'#FF6B4A', border:'none', borderRadius:9, color:'#fff', padding:'6px 11px', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap', fontSize:11 }} onClick={handleAddGroup}>添加</button>
            </div>
            <button style={{ background:'none', border:'none', color:t.textSec, cursor:'pointer', fontSize:11, padding:'2px 0', textAlign:'left' }} onClick={() => { setShowNewGroup(false); setNewGroupName(''); setNewGroupDesc(''); setNameError(''); }}>取消</button>
          </div>
        ) : (
          <button style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', color:'#FF6B4A', cursor:'pointer', fontSize:11, padding:'3px 0', marginBottom:11 }} onClick={() => setShowNewGroup(true)}>
            <span style={{ fontSize:14 }}>＋</span> 新建分组
          </button>
        )}

        {/* 操作按钮 */}
        <div style={{ display:'flex', gap:7 }}>
          <button style={{ flex:1, background:'none', border:`1px solid ${t.border}`, borderRadius:10, color:t.textSec, cursor:'pointer', padding:8, fontSize:12 }} onClick={closeModal}>取消</button>
          {isFav && (
            <button style={{ flex:1, background:'rgba(248,81,73,.1)', border:'1px solid rgba(248,81,73,.3)', borderRadius:10, color:'#F85149', cursor:'pointer', padding:8, fontSize:12 }} onClick={handleRemove}>移出收藏</button>
          )}
          <button style={{ flex:1, background:'#FF6B4A', border:'none', borderRadius:10, color:'#fff', cursor:adding?'not-allowed':'pointer', padding:8, fontSize:12, fontWeight:600, opacity:adding?0.7:1 }} onClick={handleConfirm} disabled={adding}>
            {adding ? '…' : (isFav ? '确认修改' : '确认收藏')}
          </button>
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      <div style={{ pointerEvents:'auto', display:'inline-block' }}>
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
    <div onClick={onSelect} style={{ display:'flex', alignItems:'flex-start', gap:9, padding:'8px 11px', borderRadius:10, cursor:'pointer', border:`1px solid ${selected?'rgba(255,107,74,.5)':t.border}`, background:selected?'rgba(255,107,74,.08)':'transparent', transition:'all .15s' }}>
      <div style={{ width:15, height:15, borderRadius:'50%', flexShrink:0, marginTop:1, border:`2px solid ${selected?'#FF6B4A':t.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {selected && <div style={{ width:6, height:6, borderRadius:'50%', background:'#FF6B4A' }} />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:t.textPri, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
        {desc && <div style={{ fontSize:10, color:t.textSec, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{desc}</div>}
      </div>
    </div>
  );
}
