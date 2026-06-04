/**
 * GitMob Extension — Background Service Worker
 *
 * 职责（仅三件事）：
 * 1. 持久化并提供 token、deviceId 等认证状态
 * 2. 作为 popup 和 content script 的共享状态中间人（chrome.storage）
 * 3. 执行所有收藏 CRUD 操作（调 REST API + 更新本地缓存）
 *
 * 不做的事：WebSocket、alarm、定时任务、后台轮询——全部移除。
 * 同步触发点：popup 打开时主动 version 检查，操作时直接写 REST API。
 */

import { SyncApi } from '../shared/api';
import { detectConflicts } from '../shared/conflict';
import { BgAction, FavGroup, FavRepo, VersionVector } from '../shared/types';

const DEFAULT_SYNC_URL = 'https://sync.gitmob.xyz';

// ─── 内存状态（SW 被唤醒后从 chrome.storage 恢复）───────────────────────────
let token:    string | null = null;
let syncUrl:  string        = DEFAULT_SYNC_URL;
let deviceId: string        = '';
let groups:   FavGroup[]    = [];
let repos:    FavRepo[]     = [];
let vector:   VersionVector = {};

// ─── 启动时从 storage 恢复状态 ───────────────────────────────────────────────
async function init() {
  const s = await chrome.storage.local.get([
    'token', 'syncUrl', 'deviceId', 'groups', 'repos', 'versionVector',
  ]);
  token   = s.token   ?? null;
  syncUrl = s.syncUrl ?? DEFAULT_SYNC_URL;
  groups  = s.groups  ?? [];
  repos   = s.repos   ?? [];
  vector  = s.versionVector ?? {};

  if (!s.deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  } else {
    deviceId = s.deviceId;
  }
}
init();

// ─── 工具：保存数据到 storage ─────────────────────────────────────────────────
async function saveData(g: FavGroup[], r: FavRepo[], v: VersionVector) {
  groups = g; repos = r; vector = v;
  await chrome.storage.local.set({
    groups: g,
    repos:  r,
    versionVector: v,
    lastSyncAt: Date.now(),
  });
}

// ─── 同步检查（popup 打开时调用）─────────────────────────────────────────────
// 只做 version 对比，有差异才拉全量，尽量减少请求
async function syncCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Not authenticated' };

  const api = new SyncApi(token, syncUrl, deviceId);

  try {
    // Step 1: 轻量版本检查
    const remoteVec = await api.getVersion();
    if (!remoteVec) return { ok: false, error: '无法连接同步服务' };

    const remoteHasNew = Object.entries(remoteVec).some(
      ([id, v]) => id !== deviceId && v > (vector[id] ?? 0),
    );
    const localHasNew = (vector[deviceId] ?? 0) > (remoteVec[deviceId] ?? 0);

    // 两端版本一致，无需任何操作
    if (!remoteHasNew && !localHasNew) {
      return { ok: true };
    }

    // Step 2: 有差异，拉取全量数据
    const res = await api.getFavorites();
    if (!res.ok || !res.data) return { ok: false, error: '拉取数据失败' };

    const { groups: rg, repos: rr, version_vector: rv } = res.data;

    // 两端都有新写入：做冲突检测
    if (remoteHasNew && localHasNew) {
      const conflicts = detectConflicts(
        vector, rv, deviceId, groups, repos, rg, rr,
      );
      if (conflicts.length > 0) {
        // 把冲突数据写入 storage，popup 监听到变化后自动跳转冲突页
        await chrome.storage.local.set({
          pendingConflicts: conflicts,
          remoteData: res.data,
          syncStatus: 'error',
          syncError: `${conflicts.length} 处冲突需要处理`,
        });
        return { ok: false, error: `${conflicts.length} 处冲突需要处理` };
      }
    }

    // 无冲突：直接覆盖本地数据
    await saveData(rg, rr, rv);
    await chrome.storage.local.set({ syncStatus: 'ok', syncError: null });
    return { ok: true };

  } catch (e: any) {
    const msg = e?.message ?? '同步失败';
    await chrome.storage.local.set({ syncStatus: 'error', syncError: msg });
    return { ok: false, error: msg };
  }
}

// ─── 消息处理（来自 popup 和 content script）────────────────────────────────
chrome.runtime.onMessage.addListener((msg: BgAction, _sender, respond) => {
  (async () => {
    // get_state 不需要认证
    if (msg.action === 'get_state') {
      const s = await chrome.storage.local.get([
        'token', 'userId', 'userAvatar', 'syncUrl', 'deviceId',
        'groups', 'repos', 'versionVector',
        'syncStatus', 'syncError', 'lastSyncAt',
        'pendingConflicts',
      ]);
      respond({ ok: true, ...s, deviceId });
      return;
    }

    if (!token) {
      respond({ ok: false, error: 'Not authenticated' });
      return;
    }

    const api = new SyncApi(token, syncUrl, deviceId);

    switch (msg.action) {

      // ── popup 打开时触发的版本检查 ──────────────────────────────────────────
      case 'sync_now': {
        const result = await syncCheck();
        respond(result);
        break;
      }

      // ── 新增/更新收藏 ────────────────────────────────────────────────────────
      case 'add_favorite': {
        // 乐观更新本地缓存
        const updated = [...repos.filter(r => r.full_name !== msg.repo.full_name), msg.repo];
        // 写远端
        const res = await api.upsertRepo(msg.repo);
        if (res.new_version_vector) {
          await saveData(groups, updated, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 移出收藏 ─────────────────────────────────────────────────────────────
      case 'remove_favorite': {
        const updated = repos.filter(r => r.full_name !== msg.fullName);
        const res = await api.deleteRepo(msg.fullName);
        if (res.new_version_vector) {
          await saveData(groups, updated, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 新增分组 ─────────────────────────────────────────────────────────────
      case 'add_group': {
        const newGroup = { ...msg.group, updated_at: Date.now() };
        const updated  = [...groups, newGroup];
        const res = await api.addGroup(msg.group);
        if (res.new_version_vector) {
          await saveData(updated, repos, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 修改分组名/描述 ───────────────────────────────────────────────────────
      case 'update_group': {
        const updated = groups.map(g =>
          g.id === msg.groupId
            ? { ...g, name: msg.name, description: msg.description, updated_at: Date.now() }
            : g,
        );
        const res = await api.updateGroup(msg.groupId, msg.name, msg.description);
        if (res.new_version_vector) {
          await saveData(updated, repos, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 删除分组 ─────────────────────────────────────────────────────────────
      case 'delete_group': {
        const updatedGroups = groups.filter(g => g.id !== msg.groupId);
        const updatedRepos  = msg.mode === 'all'
          ? repos.filter(r => r.group_id !== msg.groupId)
          : repos.map(r => r.group_id === msg.groupId ? { ...r, group_id: null } : r);
        const res = await api.deleteGroup(msg.groupId, msg.mode);
        if (res.new_version_vector) {
          await saveData(updatedGroups, updatedRepos, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 更新分组排序 ──────────────────────────────────────────────────────────
      case 'reorder_groups': {
        const updated = msg.order.map((id, i) => {
          const g = groups.find(x => x.id === id);
          return g ? { ...g, sort_order: i } : null;
        }).filter((g): g is FavGroup => g !== null);
        const res = await api.reorderGroups(msg.order);
        if (res.new_version_vector) {
          await saveData(updated, repos, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 更新组内仓库排序 ──────────────────────────────────────────────────────
      case 'reorder_repos': {
        const updated = repos.map(r => {
          if (r.group_id !== msg.groupId) return r;
          const i = msg.order.indexOf(r.full_name);
          return i >= 0 ? { ...r, sort_order: i } : r;
        });
        const res = await api.reorderRepos(msg.groupId, msg.order);
        if (res.new_version_vector) {
          await saveData(groups, updated, res.new_version_vector);
        }
        respond(res);
        break;
      }

      // ── 全量覆盖写入（导入 JSON 后调用）─────────────────────────────────────
      case 'push_full': {
        const res = await api.pushFull(msg.groups, msg.repos);
        if (res.new_version_vector) {
          await saveData(msg.groups, msg.repos, res.new_version_vector);
        }
        respond(res);
        break;
      }

      default:
        respond({ ok: false, error: 'Unknown action' });
    }
  })();
  return true; // 必须返回 true，表示异步响应
});

// ─── 监听 storage 变化（token/syncUrl 更新时同步内存状态）──────────────────
chrome.storage.onChanged.addListener(changes => {
  if (changes.token)   token   = changes.token.newValue   ?? null;
  if (changes.syncUrl) syncUrl = changes.syncUrl.newValue ?? DEFAULT_SYNC_URL;
});
