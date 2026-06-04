/**
 * GitMob Extension — Content Script
 * 注入 GitHub 仓库主页，显示悬浮「★」收藏按钮
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatBtn from './FloatBtn';

// 仅在仓库主页注入（URL 格式：github.com/owner/repo，且 repo 不含 /）
function parseRepoPage(): { owner: string; repo: string } | null {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  // 排除 GitHub 特殊页面
  const excluded = ['settings', 'marketplace', 'explore', 'notifications', 'login', 'join', 'orgs', 'sponsors'];
  if (excluded.includes(parts[0])) return null;
  return { owner: parts[0], repo: parts[1] };
}

function mount() {
  const repoInfo = parseRepoPage();
  if (!repoInfo) return;

  // 避免重复注入
  if (document.getElementById('gitmob-float-root')) return;

  const container = document.createElement('div');
  container.id = 'gitmob-float-root';
  container.style.cssText = 'position:fixed;right:16px;top:50%;transform:translateY(-50%);z-index:9999;';
  document.body.appendChild(container);

  createRoot(container).render(
    <FloatBtn owner={repoInfo.owner} repo={repoInfo.repo} />
  );
}

// 首次加载
mount();

// GitHub 是 SPA，监听路由变化后重新检测
let lastPath = location.pathname;
const observer = new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    // 移除旧的挂载点
    document.getElementById('gitmob-float-root')?.remove();
    setTimeout(mount, 300); // 等 DOM 稳定
  }
});
observer.observe(document.body, { childList: true, subtree: true });
