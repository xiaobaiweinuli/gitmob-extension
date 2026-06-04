// ─── 核心数据类型（与 Android FavoritesManager 对齐）────────────────────────

export interface FavGroup {
  id:          string;
  name:        string;
  description: string;
  sort_order:  number;
  updated_at:  number;
}

export interface FavRepo {
  full_name:      string;
  github_id:      number;
  name:           string;
  owner_login:    string;
  description:    string | null;
  language:       string | null;
  stars:          number;
  forks:          number;
  default_branch: string;
  is_private:     boolean;
  archived:       boolean;
  html_url:       string;
  website:        string | null;
  topics:         string[];
  group_id:       string | null;
  sort_order:     number;
  updated_at:     number;
}

export type VersionVector = Record<string, number>;

// ─── 同步状态 ────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline';

// ─── 冲突类型 ────────────────────────────────────────────────────────────────

export type ConflictItem =
  | { kind: 'group_name';   groupId: string; localName: string; remoteName: string; localDesc: string; remoteDesc: string }
  | { kind: 'repo_group';   fullName: string; localGroupId: string | null; remoteGroupId: string | null }
  | { kind: 'repo_deleted'; fullName: string; localRepo: FavRepo }

// ─── Background 消息协议 ─────────────────────────────────────────────────────

export type BgAction =
  | { action: 'get_state' }
  | { action: 'add_favorite';    repo: FavRepo }
  | { action: 'remove_favorite'; fullName: string }
  | { action: 'update_group';    groupId: string; name: string; description: string }
  | { action: 'delete_group';    groupId: string; mode: 'group_only' | 'all' }
  | { action: 'add_group';       group: Omit<FavGroup, 'updated_at'> }
  | { action: 'reorder_groups';  order: string[] }
  | { action: 'reorder_repos';   groupId: string | null; order: string[] }
  | { action: 'push_full';       groups: FavGroup[]; repos: FavRepo[] }
  | { action: 'sync_now' }

// ─── Worker API ──────────────────────────────────────────────────────────────

export interface SyncFetchResponse {
  ok: boolean;
  data?: { version_vector: VersionVector; groups: FavGroup[]; repos: FavRepo[] };
  error?: string;
}

export interface SyncWriteResponse {
  ok: boolean;
  new_version_vector?: VersionVector;
  error?: string;
}

export interface SyncLog {
  id:         number;
  device_id:  string;
  action:     string;
  detail:     unknown;
  created_at: number;
}

// ─── Popup 视图 ──────────────────────────────────────────────────────────────

export type PopupView = 'main' | 'settings' | 'logs' | 'conflict';
