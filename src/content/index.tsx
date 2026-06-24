import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatBtn from './FloatBtn';

function parseRepoPage(): { owner: string; repo: string } | null {
  const parts = location.pathname.split('/').filter(Boolean);

  // 至少需要 /owner/repo 两段
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo  = parts[1];

  // 排除 GitHub 顶层特殊页面（第一段不是用户/组织名）
  const excludedFirst = [
    'settings', 'marketplace', 'explore', 'notifications',
    'login', 'join', 'orgs', 'sponsors', 'features', 'about',
    'pricing', 'enterprise', 'trending', 'collections',
    'topics', 'events', 'pulls', 'issues', 'codespaces',
  ];
  if (excludedFirst.includes(owner)) return null;

  // 排除 /owner 下的用户个人页子路径（非仓库）
  // 例如 github.com/user/starred、github.com/user/followers 等
  const excludedSecond = [
    'starred', 'followers', 'following', 'repositories',
    'packages', 'projects', 'sponsoring', 'achievements',
    'gists', 'overview',
  ];
  if (excludedSecond.includes(repo)) return null;

  // repo 名称不能包含 . 开头（GitHub 不允许）或者是空字符串
  if (!repo || repo.startsWith('.')) return null;

  return { owner, repo };
}

function mount() {
  const info = parseRepoPage();
  if (!info) return;
  if (document.getElementById('gitmob-float-root')) return;

  // 按钮容器：全屏定位，初始右侧中间，由 FloatBtn 通过 JS 直接更新 left/top
  const btnContainer = document.createElement('div');
  btnContainer.id = 'gitmob-float-root';
  Object.assign(btnContainer.style, {
    position:      'fixed',
    right:         '16px',
    top:           '50%',
    transform:     'translateY(-50%)',
    zIndex:        '9998',
    pointerEvents: 'none',
  });
  document.body.appendChild(btnContainer);

  // 弹窗容器：独立挂载到 body，无 transform，fixed 定位正确全屏
  const modalContainer = document.createElement('div');
  modalContainer.id = 'gitmob-modal-root';
  Object.assign(modalContainer.style, {
    position:      'fixed',
    inset:         '0',
    zIndex:        '99999',
    pointerEvents: 'none',
  });
  document.body.appendChild(modalContainer);

  createRoot(btnContainer).render(
    <FloatBtn
      owner={info.owner}
      repo={info.repo}
      btnContainer={btnContainer}
      modalContainer={modalContainer}
    />
  );
}

mount();

let lastPath = location.pathname;
new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    document.getElementById('gitmob-float-root')?.remove();
    document.getElementById('gitmob-modal-root')?.remove();
    setTimeout(mount, 300);
  }
}).observe(document.body, { childList: true, subtree: true });
