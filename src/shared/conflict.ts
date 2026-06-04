import { FavGroup, FavRepo, VersionVector, ConflictItem } from './types';

/**
 * 检测本地与远端数据之间的写-写冲突。
 * 只有两端都有新写入时才逐项对比，否则直接返回空数组。
 */
export function detectConflicts(
  localVector:  VersionVector,
  remoteVector: VersionVector,
  deviceId:     string,
  localGroups:  FavGroup[],
  localRepos:   FavRepo[],
  remoteGroups: FavGroup[],
  remoteRepos:  FavRepo[],
): ConflictItem[] {
  // 本机是否有离线期间新写入
  const localHasNew =
    (localVector[deviceId] ?? 0) > (remoteVector[deviceId] ?? 0);

  // 其他设备是否有新写入
  const remoteHasNew = Object.entries(remoteVector).some(
    ([id, v]) => id !== deviceId && v > (localVector[id] ?? 0),
  );

  if (!localHasNew || !remoteHasNew) return [];

  const conflicts: ConflictItem[] = [];
  const remoteGroupMap = new Map(remoteGroups.map(g => [g.id, g]));
  const remoteRepoMap  = new Map(remoteRepos.map(r => [r.full_name, r]));

  // 分组名称 / 描述冲突
  for (const lg of localGroups) {
    const rg = remoteGroupMap.get(lg.id);
    if (!rg) continue;
    if (lg.name !== rg.name || lg.description !== rg.description) {
      conflicts.push({
        kind:       'group_name',
        groupId:    lg.id,
        localName:  lg.name,
        remoteName: rg.name,
        localDesc:  lg.description,
        remoteDesc: rg.description,
      });
    }
  }

  // 仓库归属冲突 / 远端删除
  for (const lr of localRepos) {
    const rr = remoteRepoMap.get(lr.full_name);
    if (!rr) {
      conflicts.push({ kind: 'repo_deleted', fullName: lr.full_name, localRepo: lr });
    } else if (lr.group_id !== rr.group_id) {
      conflicts.push({
        kind:          'repo_group',
        fullName:      lr.full_name,
        localGroupId:  lr.group_id,
        remoteGroupId: rr.group_id,
      });
    }
  }

  return conflicts;
}

/** 根据用户选择（'local' | 'remote'）合并冲突，返回最终状态 */
export function applyConflictChoices(
  choices:      Record<string, 'local' | 'remote'>,
  conflicts:    ConflictItem[],
  localGroups:  FavGroup[],
  localRepos:   FavRepo[],
  remoteGroups: FavGroup[],
  remoteRepos:  FavRepo[],
): { groups: FavGroup[]; repos: FavRepo[] } {
  let groups = [...localGroups];
  let repos  = [...localRepos];

  const remoteGroupMap = new Map(remoteGroups.map(g => [g.id, g]));
  const remoteRepoMap  = new Map(remoteRepos.map(r => [r.full_name, r]));

  // 追加远端新增的分组和仓库（两端都有新增时自动合并）
  for (const rg of remoteGroups) {
    if (!groups.find(g => g.id === rg.id)) groups.push(rg);
  }
  for (const rr of remoteRepos) {
    if (!repos.find(r => r.full_name === rr.full_name)) repos.push(rr);
  }

  for (const conflict of conflicts) {
    const key    = conflictKey(conflict);
    const choice = choices[key] ?? 'local';

    if (conflict.kind === 'group_name' && choice === 'remote') {
      const rg = remoteGroupMap.get(conflict.groupId);
      if (rg) groups = groups.map(g => g.id === conflict.groupId ? { ...g, ...rg } : g);
    }

    if (conflict.kind === 'repo_group' && choice === 'remote') {
      const rr = remoteRepoMap.get(conflict.fullName);
      if (rr) repos = repos.map(r => r.full_name === conflict.fullName ? { ...r, group_id: rr.group_id } : r);
    }

    if (conflict.kind === 'repo_deleted') {
      if (choice === 'remote') {
        // 接受远端删除
        repos = repos.filter(r => r.full_name !== conflict.fullName);
      }
      // choice === 'local' → 保留本地，什么都不做
    }
  }

  return { groups, repos };
}

export function conflictKey(c: ConflictItem): string {
  if (c.kind === 'group_name')   return `group:${c.groupId}`;
  if (c.kind === 'repo_group')   return `repo_group:${c.fullName}`;
  if (c.kind === 'repo_deleted') return `repo_del:${c.fullName}`;
  return '';
}
