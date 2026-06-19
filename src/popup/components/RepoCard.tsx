import React from 'react';
import { FavRepo } from '../../shared/types';

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Kotlin: '#A97BFF', Java: '#b07219', Go: '#00ADD8', Rust: '#dea584',
  Swift: '#F05138', 'C++': '#f34b7d', C: '#555555', Ruby: '#701516',
  Dart: '#00B4AB', Vue: '#41b883', CSS: '#563d7c', Shell: '#89e051',
};

interface Props {
  repo:        FavRepo;
  onRemove?:   (fullName: string) => void;
  dragHandle?: React.ReactNode;
}

export default function RepoCard({ repo, onRemove, dragHandle }: Props) {
  const langColor = repo.language ? (LANG_COLORS[repo.language] ?? '#8b949e') : null;

  function fmt(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  return (
    <div className="gm-card group relative flex items-stretch overflow-hidden hover:border-accent/40 transition-all animate-fade-in">
      {/* 拖拽把手（编辑模式）*/}
      {dragHandle && (
        <div className="flex items-center pl-2.5 pr-1 text-text-sec/40 hover:text-text-sec cursor-grab active:cursor-grabbing shrink-0">
          {dragHandle}
        </div>
      )}

      {/* 主内容区（点击跳转 GitHub，Popup 里 a target=_blank 不生效，用 chrome.tabs.create）*/}
      <div
        className="flex-1 p-3 block min-w-0 cursor-pointer"
        onClick={() => chrome.tabs.create({ url: repo.html_url })}
        role="link"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && chrome.tabs.create({ url: repo.html_url })}
      >
        {/* 仓库名 */}
        <div className="flex items-center gap-1.5 mb-1">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-text-sec shrink-0">
            <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>
          </svg>
          <span className="text-accent text-xs font-semibold font-mono truncate">{repo.full_name}</span>
          {repo.is_private && (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-warn/10 text-warn rounded-full font-medium">私有</span>
          )}
          {repo.archived && (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-text-sec/10 text-text-sec rounded-full font-medium">归档</span>
          )}
        </div>

        {/* 描述 */}
        {repo.description && (
          <p className="text-xs text-text-sec leading-snug line-clamp-2 mb-2">{repo.description}</p>
        )}

        {/* 元信息行 */}
        <div className="flex items-center gap-3">
          {langColor && (
            <span className="flex items-center gap-1 text-[11px] text-text-sec">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: langColor }} />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-text-sec">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-warn">
              <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
            </svg>
            {fmt(repo.stars)}
          </span>
          <span className="text-[11px] font-mono text-accent/60 bg-accent/10 px-1.5 rounded-md">
            {repo.default_branch}
          </span>
        </div>
      </div>

      {/* 移除按钮（悬停显示）*/}
      {onRemove && (
        <button
          onClick={e => { e.preventDefault(); onRemove(repo.full_name); }}
          className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-bg-deep/80 flex items-center justify-center text-text-sec hover:text-error hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100"
          title="移出收藏"
        >
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}
