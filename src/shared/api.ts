import {
  FavGroup, FavRepo, VersionVector,
  SyncFetchResponse, SyncWriteResponse, SyncLog,
} from './types';

export class SyncApi {
  constructor(
    private token: string,
    private baseUrl: string,
    private deviceId: string,
  ) {}

  private get headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type':  'application/json',
      'X-Device-Id':   this.deviceId,
    };
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async getInfo(): Promise<{ type: string; version: string } | null> {
    try {
      const r = await fetch(this.url('/info'));
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  }

  async getVersion(): Promise<VersionVector | null> {
    try {
      const r = await fetch(this.url('/favorites/version'), { headers: this.headers });
      if (!r.ok) return null;
      const data = await r.json() as { ok: boolean; version_vector?: VersionVector };
      return data.version_vector ?? null;
    } catch { return null; }
  }

  async getFavorites(): Promise<SyncFetchResponse> {
    const r = await fetch(this.url('/favorites'), { headers: this.headers });
    return r.json();
  }

  async pushFull(groups: FavGroup[], repos: FavRepo[]): Promise<SyncWriteResponse> {
    const r = await fetch(this.url('/favorites'), {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify({ groups, repos }),
    });
    return r.json();
  }

  async addGroup(group: Omit<FavGroup, 'updated_at'>): Promise<SyncWriteResponse> {
    const r = await fetch(this.url('/favorites/groups'), {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify({ group: { ...group, updated_at: Date.now() } }),
    });
    return r.json();
  }

  async updateGroup(id: string, name: string, description: string): Promise<SyncWriteResponse> {
    const r = await fetch(this.url(`/favorites/groups/${encodeURIComponent(id)}`), {
      method:  'PATCH',
      headers: this.headers,
      body:    JSON.stringify({ name, description }),
    });
    return r.json();
  }

  async deleteGroup(id: string, mode: 'group_only' | 'all'): Promise<SyncWriteResponse> {
    const r = await fetch(this.url(`/favorites/groups/${encodeURIComponent(id)}?mode=${mode}`), {
      method:  'DELETE',
      headers: this.headers,
    });
    return r.json();
  }

  async reorderGroups(order: string[]): Promise<SyncWriteResponse> {
    const r = await fetch(this.url('/favorites/groups/order'), {
      method:  'PATCH',
      headers: this.headers,
      body:    JSON.stringify({ order }),
    });
    return r.json();
  }

  async upsertRepo(repo: FavRepo): Promise<SyncWriteResponse> {
    const r = await fetch(this.url('/favorites/repos'), {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify({ repo }),
    });
    return r.json();
  }

  async deleteRepo(fullName: string): Promise<SyncWriteResponse> {
    const r = await fetch(this.url(`/favorites/repos/${encodeURIComponent(fullName)}`), {
      method:  'DELETE',
      headers: this.headers,
    });
    return r.json();
  }

  async reorderRepos(groupId: string | null, order: string[]): Promise<SyncWriteResponse> {
    const r = await fetch(this.url('/favorites/repos/order'), {
      method:  'PATCH',
      headers: this.headers,
      body:    JSON.stringify({ group_id: groupId, order }),
    });
    return r.json();
  }

  async getLogs(): Promise<{ ok: boolean; logs: SyncLog[] }> {
    const r = await fetch(this.url('/logs'), { headers: this.headers });
    return r.json();
  }
}
