import React, { useState } from 'react';
import { useStore } from '../../shared/store';
import { SyncApi } from '../../shared/api';

const DEFAULT_SYNC_URL = 'https://sync.gitmob.xyz';

export default function LoginPage() {
  const { setSyncUrl } = useStore();
  const [pat,     setPat]     = useState('');
  const [url,     setUrl]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleLogin() {
    if (!pat.trim()) { setError('请输入 GitHub PAT'); return; }
    setLoading(true); setError('');
    try {
      // 1. 验证 PAT
      const ghRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${pat.trim()}`, 'User-Agent': 'GitMob-Extension/1.0' },
      });
      if (!ghRes.ok) { setError('PAT 无效或已过期，请重新生成'); setLoading(false); return; }
      const ghUser = await ghRes.json() as { login: string; avatar_url: string };

      // 2. 验证 Worker URL
      const workerUrl = url.trim() || DEFAULT_SYNC_URL;
      const api = new SyncApi(pat.trim(), workerUrl, '');
      const info = await api.getInfo();
      if (!info || info.type !== 'gitmob-sync') {
        setError('同步服务地址无效，请检查 URL 或留空使用默认服务');
        setLoading(false); return;
      }

      // 3. 保存到 storage，触发 background 初始化
      await chrome.storage.local.set({
        token:     pat.trim(),
        userId:    ghUser.login,
        userAvatar: ghUser.avatar_url,
        syncUrl:   workerUrl,
      });

      setSyncUrl(workerUrl);
      useStore.setState({
        token:      pat.trim(),
        userId:     ghUser.login,
        userAvatar: ghUser.avatar_url,
        syncUrl:    workerUrl,
      });
    } catch {
      setError('连接失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-bg-deep px-6">
      {/* Logo */}
      <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border-dim flex items-center justify-center mb-5 shadow-gm">
        <span className="text-3xl">🔖</span>
      </div>
      <h1 className="text-xl font-bold text-text-pri mb-1">GitMob</h1>
      <p className="text-xs text-text-sec mb-8 text-center">GitHub 收藏夹跨设备实时同步</p>

      <div className="w-full space-y-3">
        {/* PAT 输入 */}
        <div>
          <label className="text-xs font-semibold text-text-sec uppercase tracking-wide mb-1.5 block">
            GitHub Personal Access Token
          </label>
          <input
            type="password"
            className="gm-input"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={pat}
            onChange={e => setPat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <p className="text-xs text-text-sec mt-1">
            仅需 <code className="text-accent">read:user</code> 权限 ·{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=read:user"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >生成 Token</a>
          </p>
        </div>

        {/* Worker URL */}
        <div>
          <label className="text-xs font-semibold text-text-sec uppercase tracking-wide mb-1.5 block">
            同步服务地址 <span className="font-normal normal-case">(留空使用公共服务)</span>
          </label>
          <input
            className="gm-input font-mono text-xs"
            placeholder={DEFAULT_SYNC_URL}
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-error/10 border border-error/30 rounded-xl px-3 py-2 text-xs text-error animate-fade-in">
            {error}
          </div>
        )}

        {/* 登录按钮 */}
        <button
          className="gm-btn w-full flex items-center justify-center gap-2 py-2.5"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin-slow" />
          ) : '验证并登录'}
        </button>
      </div>
    </div>
  );
}
