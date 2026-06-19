import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatBtn from './FloatBtn';

function parseRepoPage(): { owner: string; repo: string } | null {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const excluded = ['settings','marketplace','explore','notifications','login','join','orgs','sponsors'];
  if (excluded.includes(parts[0])) return null;
  return { owner: parts[0], repo: parts[1] };
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
