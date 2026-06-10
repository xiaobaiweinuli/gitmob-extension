/**
 * GitMob Extension — Content Script
 * 注入 GitHub 仓库主页，显示悬浮「★」收藏按钮
 *
 * 关键设计：按钮容器和弹窗容器分离挂载
 * - 按钮容器：position:fixed + transform（垂直居中），会捕获子元素的 fixed 定位
 * - 弹窗容器：独立挂载到 body，position:fixed 不受 transform 影响，弹窗全屏正确
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatBtn from './FloatBtn';

function parseRepoPage(): { owner: string; repo: string } | null {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const excluded = ['settings', 'marketplace', 'explore', 'notifications',
                    'login', 'join', 'orgs', 'sponsors'];
  if (excluded.includes(parts[0])) return null;
  return { owner: parts[0], repo: parts[1] };
}

function mount() {
  const repoInfo = parseRepoPage();
  if (!repoInfo) return;
  if (document.getElementById('gitmob-float-root')) return;

  // ① 按钮容器：有 transform 做垂直居中，position:fixed 相对 viewport
  //    注意：不能在此容器内放弹窗，transform 会捕获子 fixed 元素
  const btnContainer = document.createElement('div');
  btnContainer.id = 'gitmob-float-root';
  // 不加 transform，改用 top + translateY 在 FloatBtn 内部控制
  btnContainer.style.cssText = [
    'position:fixed',
    'right:16px',
    'top:50%',
    'z-index:9998',
    'pointer-events:none',   // 容器本身不拦截事件
  ].join(';');
  document.body.appendChild(btnContainer);

  // ② 弹窗容器：独立挂载到 body，无 transform，fixed 正确全屏
  const modalContainer = document.createElement('div');
  modalContainer.id = 'gitmob-modal-root';
  modalContainer.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'pointer-events:none',   // 无弹窗时完全透明不拦截
  ].join(';');
  document.body.appendChild(modalContainer);

  createRoot(btnContainer).render(
    <FloatBtn
      owner={repoInfo.owner}
      repo={repoInfo.repo}
      modalContainer={modalContainer}
      btnContainer={btnContainer}
    />
  );
}

mount();

let lastPath = location.pathname;
const observer = new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    document.getElementById('gitmob-float-root')?.remove();
    document.getElementById('gitmob-modal-root')?.remove();
    setTimeout(mount, 300);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
