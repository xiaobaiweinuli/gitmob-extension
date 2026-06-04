import React, { useState, useRef } from 'react';
import { useStore } from '../../shared/store';
import { SyncApi } from '../../shared/api';
import { exportToJson, importFromJson } from '../../shared/importExport';

interface Props { onBack: () => void }

export default function SettingsPage({ onBack }: Props) {
  const { token, syncUrl, groups, repos, setSyncUrl, setView } = useStore();

  const [urlInput,    setUrlInput]    = useState(syncUrl);
  const [testStatus,  setTestStatus]  = useState<'idle'|'testing'|'ok'|'fail'>('idle');
  const [testMsg,     setTestMsg]     = useState('');
  const [patInput,    setPatInput]    = useState('');
  const [showPat,     setShowPat]     = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [importMsg,   setImportMsg]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function testConnection(url: string) {
    setTestStatus('testing'); setTestMsg('');
    try {
      const api = new SyncApi(token ?? '', url, '');
      const info = await api.getInfo();
      if (info?.type === 'gitmob-sync') {
        setTestStatus('ok');
        setTestMsg(`连接正常 · gitmob-sync v${info.version}`);
      } else {
        setTestStatus('fail');
        setTestMsg('非 GitMob 同步服务');
      }
    } catch {
      setTestStatus('fail');
      setTestMsg('连接失败，请检查地址');
    }
  }

  async function saveUrl() {
    const trimmed = urlInput.trim() || 'https://sync.gitmob.xyz';
    setSyncUrl(trimmed);
    await chrome.storage.local.set({ syncUrl: trimmed });
    await testConnection(trimmed);
  }

  async function changePat() {
    if (!patInput.trim()) return;
    try {
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${patInput.trim()}`, 'User-Agent': 'GitMob-Extension/1.0' },
      });
      if (!r.ok) { setImportMsg('PAT 无效'); return; }
      const u = await r.json() as { login: string; avatar_url: string };
      await chrome.storage.local.set({ token: patInput.trim(), userId: u.login, userAvatar: u.avatar_url });
      useStore.setState({ token: patInput.trim(), userId: u.login, userAvatar: u.avatar_url });
      setPatInput(''); setShowPat(false);
      setImportMsg('PAT 已更新');
    } catch { setImportMsg('验证失败，请重试'); }
  }

  function handleExport() {
    const json = exportToJson(groups, repos);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `gitmob-favorites-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg('');
    try {
      const text = await file.text();
      const { groups: g, repos: r } = importFromJson(text);
      await chrome.runtime.sendMessage({ action: 'push_full', groups: g, repos: r });
      useStore.setState({ groups: g, repos: r });
      setImportMsg(`已导入 ${g.length} 个分组、${r.length} 个仓库`);
    } catch {
      setImportMsg('导入失败，文件格式错误');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-[10px] font-bold text-text-sec uppercase tracking-widest mb-2 px-1">{children}</h3>
  );

  return (
    <div className="flex flex-col h-[600px]">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dim shrink-0">
        <button onClick={onBack} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-item text-text-sec hover:text-text-pri transition-colors">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-text-pri">设置</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* 认证 */}
        <div>
          <SectionTitle>GitHub 认证</SectionTitle>
          <div className="gm-card p-3 space-y-3">
            <div>
              <label className="text-xs text-text-sec mb-1.5 block">Personal Access Token</label>
              {showPat ? (
                <div className="space-y-2">
                  <input
                    type="password"
                    className="gm-input font-mono text-xs"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={patInput}
                    onChange={e => setPatInput(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowPat(false); setPatInput(''); }} className="gm-btn-ghost flex-1 text-center">取消</button>
                    <button onClick={changePat} className="gm-btn flex-1" disabled={!patInput.trim()}>更新 PAT</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-sec font-mono bg-bg-item px-2.5 py-1.5 rounded-lg flex-1 truncate">
                    {token ? `${token.slice(0, 8)}••••••••` : '未设置'}
                  </span>
                  <button onClick={() => setShowPat(true)} className="gm-btn-ghost text-xs shrink-0">修改</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 同步服务 */}
        <div>
          <SectionTitle>同步服务地址</SectionTitle>
          <div className="gm-card p-3 space-y-2">
            <input
              className="gm-input font-mono text-xs"
              placeholder="https://sync.gitmob.xyz"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setTestStatus('idle'); }}
            />
            {/* 测试状态 */}
            {testStatus !== 'idle' && (
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg ${
                testStatus === 'testing' ? 'text-text-sec bg-bg-item' :
                testStatus === 'ok'      ? 'text-ok bg-ok/10' : 'text-error bg-error/10'
              }`}>
                {testStatus === 'testing' && (
                  <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin-slow" />
                )}
                {testStatus === 'ok'   && '✓'}
                {testStatus === 'fail' && '✕'}
                <span>{testStatus === 'testing' ? '正在连接…' : testMsg}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => testConnection(urlInput.trim() || 'https://sync.gitmob.xyz')}
                className="gm-btn-ghost flex-1 text-center text-xs border border-border-dim"
                disabled={testStatus === 'testing'}
              >
                测试连接
              </button>
              <button onClick={saveUrl} className="gm-btn flex-1 text-xs" disabled={testStatus === 'testing'}>
                保存
              </button>
            </div>
            <p className="text-xs text-text-sec/60">
              留空使用默认公共服务 · 支持自托管实例
            </p>
          </div>
        </div>

        {/* 数据管理 */}
        <div>
          <SectionTitle>数据管理</SectionTitle>
          <div className="gm-card p-3 space-y-2">
            <p className="text-xs text-text-sec mb-1">
              导入/导出格式与 GitMob Android App 完全兼容
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-border-dim rounded-xl text-xs font-medium text-text-sec hover:text-text-pri hover:border-accent/40 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
                导出 JSON
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-border-dim rounded-xl text-xs font-medium text-text-sec hover:text-text-pri hover:border-accent/40 transition-colors"
              >
                {importing ? (
                  <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin-slow" />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                  </svg>
                )}
                导入 JSON
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            {importMsg && (
              <p className={`text-xs px-2 py-1.5 rounded-lg ${
                importMsg.includes('失败') || importMsg.includes('错误') || importMsg.includes('无效')
                  ? 'text-error bg-error/10' : 'text-ok bg-ok/10'
              }`}>
                {importMsg}
              </p>
            )}
          </div>
        </div>

        {/* 日志入口 */}
        <div>
          <SectionTitle>同步日志</SectionTitle>
          <button
            onClick={() => setView('logs')}
            className="gm-card w-full flex items-center justify-between px-4 py-3 hover:border-accent/30 transition-colors group"
          >
            <span className="text-sm text-text-pri">查看同步日志</span>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-text-sec group-hover:text-accent transition-colors">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        {/* 关于 */}
        <div>
          <SectionTitle>关于</SectionTitle>
          <div className="gm-card p-3 space-y-2 text-xs text-text-sec">
            <div className="flex justify-between">
              <span>版本</span><span className="text-text-pri font-mono">1.0.0</span>
            </div>
            <div className="gm-divider" />
            <div className="flex justify-between">
              <a href="https://github.com/xiaobaiweinuli/GitMob-Android" target="_blank" rel="noreferrer" className="text-accent hover:underline">GitMob Android App</a>
            </div>
            <div className="flex justify-between">
              <a href="https://github.com/xiaobaiweinuli/gitmob-sync-worker" target="_blank" rel="noreferrer" className="text-accent hover:underline">同步服务源码</a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
