import { create } from 'zustand';
import { FavGroup, FavRepo, VersionVector, SyncStatus, ConflictItem, PopupView } from './types';

const DEFAULT_SYNC_URL = 'https://sync.gitmob.xyz';

interface ExtState {
  // ── 认证 ────────────────────────────────────────────────────────────────
  token:       string | null;
  userId:      string | null;
  userAvatar:  string | null;
  deviceId:    string;
  syncUrl:     string;

  // ── 数据 ────────────────────────────────────────────────────────────────
  groups:        FavGroup[];
  repos:         FavRepo[];
  versionVector: VersionVector;

  // ── UI 状态 ──────────────────────────────────────────────────────────────
  syncStatus:  SyncStatus;
  syncError:   string | null;
  lastSyncAt:  number | null;
  conflicts:   ConflictItem[];
  view:        PopupView;

  // ── Actions ──────────────────────────────────────────────────────────────
  setAuth:       (token: string, userId: string, avatar: string, syncUrl?: string) => void;
  clearAuth:     () => void;
  setSyncUrl:    (url: string) => void;
  setData:       (groups: FavGroup[], repos: FavRepo[], vector: VersionVector) => void;
  setSyncStatus: (s: SyncStatus, err?: string | null) => void;
  setConflicts:  (c: ConflictItem[]) => void;
  setView:       (v: PopupView) => void;
}

export const useStore = create<ExtState>((set) => ({
  token:         null,
  userId:        null,
  userAvatar:    null,
  deviceId:      '',
  syncUrl:       DEFAULT_SYNC_URL,
  groups:        [],
  repos:         [],
  versionVector: {},
  syncStatus:    'idle',
  syncError:     null,
  lastSyncAt:    null,
  conflicts:     [],
  view:          'main',

  setAuth: (token, userId, avatar, syncUrl) =>
    set({ token, userId, userAvatar: avatar, syncUrl: syncUrl ?? DEFAULT_SYNC_URL }),

  clearAuth: () =>
    set({
      token: null, userId: null, userAvatar: null,
      groups: [], repos: [], versionVector: {},
      syncStatus: 'idle', conflicts: [],
    }),

  setSyncUrl: (url) => set({ syncUrl: url || DEFAULT_SYNC_URL }),

  setData: (groups, repos, vector) =>
    set({ groups, repos, versionVector: vector, syncStatus: 'ok', lastSyncAt: Date.now(), syncError: null }),

  setSyncStatus: (s, err = null) =>
    set({ syncStatus: s, syncError: err ?? null }),

  setConflicts: (c) => set({ conflicts: c, view: c.length > 0 ? 'conflict' : 'main' }),

  setView: (v) => set({ view: v }),
}));

// ─── 辅助 selector ───────────────────────────────────────────────────────────

/** 判断某仓库是否已收藏 */
export const isFavorited = (repos: FavRepo[], fullName: string) =>
  repos.some(r => r.full_name === fullName);

/** 获取仓库所在分组 id */
export const getRepoGroupId = (repos: FavRepo[], fullName: string) =>
  repos.find(r => r.full_name === fullName)?.group_id ?? null;

/** 组内仓库列表（按 sort_order） */
export const getGroupRepos = (repos: FavRepo[], groupId: string | null) =>
  repos
    .filter(r => r.group_id === groupId)
    .sort((a, b) => a.sort_order - b.sort_order);
