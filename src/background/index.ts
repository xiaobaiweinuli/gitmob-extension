/**
 * GitMob Extension — Background Service Worker
 *
 * 保活策略（基于 Chrome 116+ 官方机制）：
 *
 * 主保活：WS 连接 + setInterval 每 20s 发 ping
 *   → WS 消息（发送/接收）会重置 SW 的 30s idle timer（Chrome 116+）
 *   → 只要 WS 在线且 ping 正常，SW 永不被杀
 *
 * 备用唤醒：chrome.alarms 每 30s（MV3 最小间隔）
 *   → 当 WS 断开、setInterval 停止、SW 被杀后
 *   → alarm 唤醒 SW → 检测到 ws===null → 触发重连
 *   → 重连成功后主保活恢复
 *
 * SW terminate 恢复路径：
 *   SW 被杀 → alarm 30s 后唤醒 → init() 从 storage 恢复状态 → connectWs()
 *
 * 所有关键状态存 chrome.storage.local，绝不依赖内存。
 */

import { SyncApi }        from '../shared/api';
import { detectConflicts } from '../shared/conflict';
import { FavGroup, FavRepo, VersionVector } from '../shared/types';

// ─── 常量 ─────────────────────────────────────────────────────────────────────
const DEFAULT_SYNC_URL   = 'https://sync.gitmob.xyz';
const PING_INTERVAL_MS   = 20_000;  // 官方推荐 20s（< SW 30s idle timeout）
const RECONNECT_INIT_MS  = 3_000;   // 初始重连延迟
const RECONNECT_MAX_MS   = 60_000;  // 最大重连延迟
const ALARM_NAME         = 'gitmob-ws-backup'; // alarm 名称

// ─── 运行时变量（SW 重启后从 storage 恢复，不依赖内存持久化）─────────────────
let ws:             WebSocket | null = null;
let keepAliveTimer: ReturnType<typeof setInterval>  | null = null;
let reconnectTimer: ReturnType<typeof setTimeout>   | null = null;
let reconnectDelay  = RECONNECT_INIT_MS;
let isConnecting    = false; // 防止并发重连

// 运行时缓存（从 storage 恢复，加速操作，避免每次读 storage）
let token:    string | null = null;
let syncUrl:  string        = DEFAULT_SYNC_URL;
let deviceId: string        = '';
let groups:   FavGroup[]    = [];
let repos:    FavRepo[]     = [];
let vector:   VersionVector = {};

// ─── 初始化（SW 启动 / 被唤醒时执行）──────────────────────────────────────────
async function init(): Promise<void> {
  const s = await chrome.storage.local.get([
    'token', 'syncUrl', 'deviceId', 'groups', 'repos', 'versionVector',
  ]);

  token    = s.token    ?? null;
  syncUrl  = s.syncUrl  ?? DEFAULT_SYNC_URL;
  groups   = s.groups   ?? [];
  repos    = s.repos    ?? [];
  vector   = s.versionVector ?? {};

  if (!s.deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  } else {
    deviceId = s.deviceId;
  }

  // 注册备用唤醒 alarm（30s，MV3 允许的最小值）
  // createAlarm 是幂等的，重复调用不会重复注册
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 30 / 60 });

  // 有 token 则尝试建立 WS
  if (token) connectWs().catch(console.error);
}

// ─── WebSocket 连接 ───────────────────────────────────────────────────────────

async function connectWs(): Promise<void> {
  if (!token || isConnecting) return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  isConnecting = true;
  clearReconnectTimer();

  try {
    // 第一步：用 REST + Authorization header 获取一次性 ws_token
    // 避免 GitHub PAT 出现在 WS URL（URL 可能被日志记录、浏览器历史等）
    const authRes = await fetch(`${syncUrl.replace(/\/$/, '')}/ws-auth`, {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': deviceId,
      },
    });

    if (!authRes.ok) {
      isConnecting = false;
      if (token) scheduleReconnect();
      return;
    }

    const authData = await authRes.json() as { ok: boolean; ws_token?: string };
    if (!authData.ok || !authData.ws_token) {
      isConnecting = false;
      if (token) scheduleReconnect();
      return;
    }

    // 第二步：用一次性 ws_token 建立 WS 连接（URL 中不含明文 PAT）
    const base  = syncUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    const wsUrl = `${base}/ws?device_id=${encodeURIComponent(deviceId)}&ws_token=${encodeURIComponent(authData.ws_token)}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = (): void => {
      isConnecting   = false;
      reconnectDelay = RECONNECT_INIT_MS;
      startKeepalive();
      syncCheck().catch(console.error);
    };

    ws.onmessage = (e: MessageEvent): void => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string };
        if (msg.type === 'pong') return;
        if (msg.type === 'fav_updated' || msg.type === 'need_full_sync') {
          syncCheck().catch(console.error);
        }
      } catch { /* 忽略非法消息 */ }
    };

    ws.onclose = (): void => {
      isConnecting = false;
      ws           = null;
      stopKeepalive();
      if (token) scheduleReconnect();
    };

    ws.onerror = (): void => { ws?.close(); };

  } catch {
    isConnecting = false;
    if (token) scheduleReconnect();
  }
}

// ─── 主保活：每 20s ping（重置 SW idle timer）─────────────────────────────────

function startKeepalive(): void {
  stopKeepalive(); // 防止重复启动
  keepAliveTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      // WS 已断开但 timer 还在，清理并重连
      stopKeepalive();
      if (token) scheduleReconnect();
    }
  }, PING_INTERVAL_MS);
}

function stopKeepalive(): void {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// ─── 指数退避重连 ─────────────────────────────────────────────────────────────

function scheduleReconnect(): void {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    connectWs().catch(console.error);
  }, reconnectDelay);
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// ─── 备用唤醒：alarm handler ─────────────────────────────────────────────────
// 作用：WS 断开、keepalive 停止、SW 被杀后，alarm 唤醒 SW 触发重连

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  if (!token) return; // 未登录，不操作

  if (ws?.readyState === WebSocket.OPEN) {
    // WS 在线：发一次 ping 作为双保险
    ws.send(JSON.stringify({ type: 'ping' }));
  } else if (!isConnecting) {
    // WS 不在线且没有正在连接：触发重连（SW 被杀后的恢复路径）
    reconnectDelay = RECONNECT_INIT_MS; // alarm 唤醒时重置退避，快速恢复
    connectWs().catch(console.error);
  }
});

// ─── 同步检查（轻量版本对比，有差异才拉全量）─────────────────────────────────

async function syncCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Not authenticated' };

  const api = new SyncApi(token, syncUrl, deviceId);

  await chrome.storage.local.set({ syncStatus: 'syncing', syncError: null });

  try {
    // Step 1: 轻量版本检查（仅返回版本向量，响应体极小）
    const remoteVec = await api.getVersion();
    if (!remoteVec) {
      await chrome.storage.local.set({ syncStatus: 'error', syncError: '无法连接同步服务' });
      return { ok: false, error: '无法连接' };
    }

    const remoteHasNew = Object.entries(remoteVec).some(
      ([id, v]) => id !== deviceId && v > (vector[id] ?? 0),
    );
    const localHasNew  = (vector[deviceId] ?? 0) > (remoteVec[deviceId] ?? 0);

    if (!remoteHasNew && !localHasNew) {
      await chrome.storage.local.set({ syncStatus: 'ok', syncError: null, lastSyncAt: Date.now() });
      return { ok: true };
    }

    // Step 2: 有差异，拉取全量数据
    const res = await api.getFavorites();
    if (!res.ok || !res.data) {
      await chrome.storage.local.set({ syncStatus: 'error', syncError: '拉取数据失败' });
      return { ok: false, error: '拉取失败' };
    }

    const { groups: rg, repos: rr, version_vector: rv } = res.data;

    // 两端都有新写入时做冲突检测
    if (remoteHasNew && localHasNew) {
      const conflicts = detectConflicts(vector, rv, deviceId, groups, repos, rg, rr);
      if (conflicts.length > 0) {
        await chrome.storage.local.set({
          pendingConflicts: conflicts,
          remoteData:       res.data,
          syncStatus:       'error',
          syncError:        `${conflicts.length} 处冲突需要处理`,
        });
        notifyContentScripts();
        return { ok: false, error: `${conflicts.length} 处冲突` };
      }
    }

    await saveData(rg, rr, rv);
    await chrome.storage.local.set({ syncStatus: 'ok', syncError: null, lastSyncAt: Date.now() });
    return { ok: true };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '同步失败';
    await chrome.storage.local.set({ syncStatus: 'error', syncError: msg });
    return { ok: false, error: msg };
  }
}

// ─── 保存数据到 storage，并通知所有 content script ───────────────────────────

async function saveData(g: FavGroup[], r: FavRepo[], v: VersionVector): Promise<void> {
  groups = g; repos = r; vector = v;
  await chrome.storage.local.set({
    groups: g, repos: r, versionVector: v, lastSyncAt: Date.now(),
  });
  notifyContentScripts();
}

// 向所有 GitHub tab 的 content script 发送刷新通知
function notifyContentScripts(): void {
  chrome.tabs.query({ url: 'https://github.com/*/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'gitmob_state_updated' })
          .catch(() => { /* tab 未注入 content script，忽略 */ });
      }
    }
  });
}

// ─── 消息处理（来自 popup 和 content script）────────────────────────────────

chrome.runtime.onMessage.addListener((msg: any, _sender, respond) => {
  (async () => {
    // get_state：无需认证，直接读 storage
    if (msg.action === 'get_state') {
      const s = await chrome.storage.local.get([
        'token', 'userId', 'userAvatar', 'syncUrl', 'deviceId',
        'groups', 'repos', 'versionVector',
        'syncStatus', 'syncError', 'lastSyncAt', 'pendingConflicts',
      ]);
      respond({ ok: true, ...s, deviceId });
      return;
    }

    if (!token) { respond({ ok: false, error: 'Not authenticated' }); return; }
    const api = new SyncApi(token, syncUrl, deviceId);

    switch (msg.action) {

      case 'sync_now': {
        respond(await syncCheck());
        break;
      }

      case 'add_favorite': {
        const updated = [...repos.filter(r => r.full_name !== msg.repo.full_name), msg.repo];
        const res     = await api.upsertRepo(msg.repo);
        if (res.new_version_vector) await saveData(groups, updated, res.new_version_vector);
        respond(res);
        break;
      }

      case 'remove_favorite': {
        const updated = repos.filter(r => r.full_name !== msg.fullName);
        const res     = await api.deleteRepo(msg.fullName);
        if (res.new_version_vector) await saveData(groups, updated, res.new_version_vector);
        respond(res);
        break;
      }

      case 'add_group': {
        const newGroup = { ...msg.group, updated_at: Date.now() };
        const res      = await api.addGroup(msg.group);
        if (res.new_version_vector) await saveData([...groups, newGroup], repos, res.new_version_vector);
        respond(res);
        break;
      }

      case 'update_group': {
        const updated = groups.map(g =>
          g.id === msg.groupId
            ? { ...g, name: msg.name, description: msg.description, updated_at: Date.now() }
            : g,
        );
        const res = await api.updateGroup(msg.groupId, msg.name, msg.description);
        if (res.new_version_vector) await saveData(updated, repos, res.new_version_vector);
        respond(res);
        break;
      }

      case 'delete_group': {
        const updG = groups.filter(g => g.id !== msg.groupId);
        const updR = msg.mode === 'all'
          ? repos.filter(r => r.group_id !== msg.groupId)
          : repos.map(r => r.group_id === msg.groupId ? { ...r, group_id: null } : r);
        const res  = await api.deleteGroup(msg.groupId, msg.mode);
        if (res.new_version_vector) await saveData(updG, updR, res.new_version_vector);
        respond(res);
        break;
      }

      case 'reorder_groups': {
        const updated = (msg.order as string[]).map((id, i) => {
          const g = groups.find(x => x.id === id);
          return g ? { ...g, sort_order: i } : null;
        }).filter((g): g is FavGroup => g !== null);
        const res = await api.reorderGroups(msg.order);
        if (res.new_version_vector) await saveData(updated, repos, res.new_version_vector);
        respond(res);
        break;
      }

      case 'reorder_repos': {
        const updated = repos.map(r => {
          if (r.group_id !== msg.groupId) return r;
          const i = (msg.order as string[]).indexOf(r.full_name);
          return i >= 0 ? { ...r, sort_order: i } : r;
        });
        const res = await api.reorderRepos(msg.groupId, msg.order);
        if (res.new_version_vector) await saveData(groups, updated, res.new_version_vector);
        respond(res);
        break;
      }

      case 'push_full': {
        const res = await api.pushFull(msg.groups, msg.repos);
        if (res.new_version_vector) await saveData(msg.groups, msg.repos, res.new_version_vector);
        respond(res);
        break;
      }

      default:
        respond({ ok: false, error: 'Unknown action' });
    }
  })();
  return true; // 必须返回 true 表示异步响应
});

// ─── storage 变化时同步内存缓存（token/syncUrl 改变时重新连接）──────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes.token) {
    const newToken = changes.token.newValue ?? null;
    const hadToken = !!token;
    token = newToken;

    if (token && !hadToken) {
      // 新登录：建立 WS
      reconnectDelay = RECONNECT_INIT_MS;
      connectWs().catch(console.error);
    } else if (!token && hadToken) {
      // 退出登录：断开 WS，清理 timer
      ws?.close();
      ws = null;
      stopKeepalive();
      clearReconnectTimer();
    }
  }

  if (changes.syncUrl) {
    const newUrl = changes.syncUrl.newValue ?? DEFAULT_SYNC_URL;
    if (newUrl !== syncUrl) {
      syncUrl = newUrl;
      // URL 变了：重连到新地址
      if (token) {
        ws?.close(); // 触发 onclose → scheduleReconnect
      }
    }
  }
});

// ─── 启动 ─────────────────────────────────────────────────────────────────────
init().catch(console.error);
