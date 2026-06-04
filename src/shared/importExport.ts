import { FavGroup, FavRepo } from './types';

/** 与 Android FavoritesManager.exportFavorites() 输出格式完全一致 */
export function exportToJson(groups: FavGroup[], repos: FavRepo[]): string {
  const ungrouped = repos
    .filter(r => r.group_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);

  const groupsOut = groups
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(g => ({
      id:          g.id,
      name:        g.name,
      description: g.description,
      repoIds:     repos
        .filter(r => r.group_id === g.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(r => r.full_name),
    }));

  const allRepos: Record<string, FavRepo> = {};
  for (const r of repos) allRepos[r.full_name] = r;

  return JSON.stringify({ groups: groupsOut, ungrouped, allRepos }, null, 2);
}

/** 解析 Android 导出的 JSON 格式，返回规范化的 groups + repos */
export function importFromJson(json: string): { groups: FavGroup[]; repos: FavRepo[] } {
  const data = JSON.parse(json);
  const now = Date.now();

  // 解析分组
  const groups: FavGroup[] = (data.groups ?? []).map((g: any, i: number) => ({
    id:          g.id ?? crypto.randomUUID(),
    name:        g.name ?? '未命名分组',
    description: g.description ?? '',
    sort_order:  i,
    updated_at:  now,
  }));

  // allRepos Map 用于快速查找仓库元信息
  const allReposMap: Record<string, any> = data.allRepos ?? {};

  const repos: FavRepo[] = [];

  // 各分组内的仓库
  for (const g of (data.groups ?? [])) {
    const groupId = g.id;
    for (let i = 0; i < (g.repoIds ?? []).length; i++) {
      const fn   = g.repoIds[i];
      const meta = allReposMap[fn] ?? {};
      repos.push(normalizeRepo(meta, fn, groupId, i, now));
    }
  }

  // 未分组仓库
  for (let i = 0; i < (data.ungrouped ?? []).length; i++) {
    const r = data.ungrouped[i];
    const fn = r.fullName ?? r.full_name ?? '';
    if (!fn) continue;
    const meta = allReposMap[fn] ?? r;
    repos.push(normalizeRepo(meta, fn, null, i, now));
  }

  return { groups, repos };
}

function normalizeRepo(
  meta: any,
  fullName: string,
  groupId: string | null,
  sortOrder: number,
  now: number,
): FavRepo {
  const parts = fullName.split('/');
  return {
    full_name:      fullName,
    github_id:      meta.id ?? meta.github_id ?? 0,
    name:           meta.name ?? parts[1] ?? fullName,
    owner_login:    meta.ownerLogin ?? meta.owner_login ?? parts[0] ?? '',
    description:    meta.description ?? null,
    language:       meta.language ?? null,
    stars:          meta.stars ?? meta.stargazers_count ?? 0,
    forks:          meta.forks ?? meta.forks_count ?? 0,
    default_branch: meta.defaultBranch ?? meta.default_branch ?? 'main',
    is_private:     meta.isPrivate ?? meta.is_private ?? false,
    archived:       meta.archived ?? false,
    html_url:       meta.htmlUrl ?? meta.html_url ?? `https://github.com/${fullName}`,
    website:        meta.website ?? meta.homepage ?? null,
    topics:         Array.isArray(meta.topics) ? meta.topics : [],
    group_id:       groupId,
    sort_order:     sortOrder,
    updated_at:     now,
  };
}
