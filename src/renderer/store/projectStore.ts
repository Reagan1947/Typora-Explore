import type { TreeNode } from '../components/FileTree/types';
import { getParentKey } from '../components/FileTree/utils';

export type ProjectStoreNode = TreeNode & {
  diskPath?: string;
};

function mergeNodeDetailsFromPersisted(
  current: Record<string, ProjectStoreNode>,
  persistedNodes: Record<string, ProjectStoreNode>,
): Record<string, ProjectStoreNode> {
  const next = { ...current };
  Object.keys(next).forEach((id) => {
    const prev = persistedNodes[id];
    if (!prev) return;
    if (prev.remark === undefined && prev.mark === undefined) return;
    next[id] = {
      ...next[id],
      ...(prev.remark !== undefined ? { remark: prev.remark } : {}),
      ...(prev.mark !== undefined ? { mark: prev.mark } : {}),
    };
  });
  return next;
}

export type IpcScanProjectTreeStore = {
  rootPath: string;
  nodes: Record<string, ProjectStoreNode>;
  orderByParentId: Record<string, string[]>;
  expandedIds: string[];
};

export type ProjectStorePersistedV1 = {
  version: 1;
  rootPath: string;
  nodes: Record<string, ProjectStoreNode>;
  orderByParentId: Record<string, string[]>;
  expandedIds: string[];
};

export type ProjectStoreSnapshot = {
  rootPath: string;
  nodes: Record<string, ProjectStoreNode>;
  orderByParentId: Record<string, string[]>;
  expandedIds: Set<string>;
};

const PROJECT_STORE_VERSION = 1 as const;
const LOCAL_STORAGE_KEY_PREFIX = 'markdown-management-tool:projectStore:';

function encodeProjectId(rootPath: string): string {
  return encodeURIComponent(rootPath);
}

function getLocalStorageKey(projectId: string): string {
  return `${LOCAL_STORAGE_KEY_PREFIX}${projectId}`;
}

function safeReadLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota / disabled storage in renderers such as tests.
  }
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function uniqPreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function computeChildrenByParentKey(nodes: Record<string, ProjectStoreNode>): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const parentKey = getParentKey(node.parentId ?? null);
    if (!map[parentKey]) map[parentKey] = [];
    map[parentKey].push(nodeId);
  }
  return map;
}

function reconcileOrderByParentId(args: {
  initialOrderByParentId: Record<string, string[]>;
  persistedOrderByParentId: Record<string, string[]>;
  nodes: Record<string, ProjectStoreNode>;
}): Record<string, string[]> {
  const { initialOrderByParentId, persistedOrderByParentId, nodes } = args;

  const childrenByParentKey = computeChildrenByParentKey(nodes);
  const next: Record<string, string[]> = {};

  const allParentKeys = new Set<string>([
    ...Object.keys(childrenByParentKey),
    ...Object.keys(initialOrderByParentId),
    ...Object.keys(persistedOrderByParentId),
  ]);

  for (const parentKey of allParentKeys) {
    const nodesInParent = childrenByParentKey[parentKey] ?? [];
    if (nodesInParent.length === 0) {
      next[parentKey] = [];
      continue;
    }
    const persistedFiltered = uniqPreserveOrder(
      (persistedOrderByParentId[parentKey] ?? []).filter((id) => {
        const node = nodes[id];
        if (!node) return false;
        return getParentKey(node.parentId ?? null) === parentKey;
      }),
    );

    const baselineFiltered = (initialOrderByParentId[parentKey] ?? []).filter((id) => {
      const node = nodes[id];
      if (!node) return false;
      return getParentKey(node.parentId ?? null) === parentKey;
    });

    const used = new Set<string>(persistedFiltered);
    const nextChildren: string[] = [...persistedFiltered];
    for (const id of baselineFiltered) {
      if (used.has(id)) continue;
      used.add(id);
      nextChildren.push(id);
    }

    const remaining = nodesInParent
      .filter((id) => !used.has(id))
      .slice()
      .sort((a, b) => (nodes[a]?.name ?? '').localeCompare(nodes[b]?.name ?? ''));

    next[parentKey] = nextChildren.concat(remaining);
  }

  return next;
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

function insertAtIndex(args: { list: string[]; itemId: string; index: number }): string[] {
  const { list, itemId, index } = args;
  const without = list.filter((id) => id !== itemId);
  const insertIndex = clampIndex(index, without.length);
  return [
    ...without.slice(0, insertIndex),
    itemId,
    ...without.slice(insertIndex),
  ];
}

export class ProjectStore {
  readonly rootPath: string;
  readonly projectId: string;

  private nodes: Record<string, ProjectStoreNode>;
  private orderByParentId: Record<string, string[]>;
  private expandedIds: Set<string>;

  constructor(initialStore: IpcScanProjectTreeStore) {
    this.rootPath = initialStore.rootPath;
    this.projectId = encodeProjectId(initialStore.rootPath);

    this.nodes = initialStore.nodes;
    this.orderByParentId = initialStore.orderByParentId;
    this.expandedIds = new Set(initialStore.expandedIds);

    const persisted = this.loadPersisted();
    if (persisted) {
      this.nodes = mergeNodeDetailsFromPersisted(this.nodes, persisted.nodes);
      // Nodes are treated as "from disk scan" data; we only persist order + expanded state.
      // Still reconcile order to avoid stale ids.
      this.orderByParentId = reconcileOrderByParentId({
        initialOrderByParentId: initialStore.orderByParentId,
        persistedOrderByParentId: persisted.orderByParentId,
        nodes: this.nodes,
      });

      const persistedExpanded = new Set(
        persisted.expandedIds.filter((id) => !!this.nodes[id]),
      );
      if (persistedExpanded.size > 0) {
        this.expandedIds = persistedExpanded;
      }
    }

    // Keep localStorage aligned after every scan (e.g. folder watcher / external FS changes).
    this.persist();
  }

  getSnapshot(): ProjectStoreSnapshot {
    return {
      rootPath: this.rootPath,
      nodes: this.nodes,
      orderByParentId: this.orderByParentId,
      expandedIds: new Set(this.expandedIds),
    };
  }

  private loadPersisted(): ProjectStorePersistedV1 | null {
    const key = getLocalStorageKey(this.projectId);
    const raw = safeReadLocalStorageItem(key);
    if (!raw) return null;

    const parsed = safeParseJson<ProjectStorePersistedV1>(raw);
    if (!parsed) return null;
    if (parsed.version !== PROJECT_STORE_VERSION) return null;
    if (parsed.rootPath !== this.rootPath) return null;

    return parsed;
  }

  private persist(): void {
    const key = getLocalStorageKey(this.projectId);
    const payload: ProjectStorePersistedV1 = {
      version: PROJECT_STORE_VERSION,
      rootPath: this.rootPath,
      nodes: this.nodes,
      orderByParentId: this.orderByParentId,
      expandedIds: Array.from(this.expandedIds),
    };
    safeWriteLocalStorageItem(key, JSON.stringify(payload));
  }

  /**
   * Expanded state helpers
   */
  isExpanded(nodeId: string): boolean {
    return this.expandedIds.has(nodeId);
  }

  expand(nodeId: string): void {
    if (!this.nodes[nodeId]) return;
    if (this.expandedIds.has(nodeId)) return;
    this.expandedIds.add(nodeId);
    this.persist();
  }

  collapse(nodeId: string): void {
    if (!this.expandedIds.has(nodeId)) return;
    this.expandedIds.delete(nodeId);
    this.persist();
  }

  toggleExpanded(nodeId: string): void {
    if (this.isExpanded(nodeId)) this.collapse(nodeId);
    else this.expand(nodeId);
  }

  expandAllFolders(): void {
    let changed = false;
    Object.keys(this.nodes).forEach((id) => {
      if (this.nodes[id]?.type !== 'folder') return;
      if (this.expandedIds.has(id)) return;
      this.expandedIds.add(id);
      changed = true;
    });
    if (changed) this.persist();
  }

  collapseAllFolders(): void {
    if (this.expandedIds.size === 0) return;
    this.expandedIds.clear();
    this.persist();
  }

  /**
   * orderByParentId helpers
   *
   * Note: this manager treats orderByParentId as "source-of-truth for render ordering".
   */
  insertNodeIntoOrderByParentId(args: {
    parentId: string | null;
    nodeId: string;
    index: number;
    updateNodeParentId?: boolean;
  }): void {
    const { parentId, nodeId, index, updateNodeParentId = true } = args;
    if (!this.nodes[nodeId]) return;

    const nextOrderByParentId = { ...this.orderByParentId };

    // Remove from any existing parent list first to avoid duplicates.
    for (const key of Object.keys(nextOrderByParentId)) {
      if (!nextOrderByParentId[key].includes(nodeId)) continue;
      nextOrderByParentId[key] = nextOrderByParentId[key].filter((id) => id !== nodeId);
    }

    const parentKey = getParentKey(parentId);
    const currentChildren = nextOrderByParentId[parentKey] ?? [];
    nextOrderByParentId[parentKey] = insertAtIndex({
      list: currentChildren,
      itemId: nodeId,
      index,
    });

    this.orderByParentId = nextOrderByParentId;

    if (updateNodeParentId) {
      const node = this.nodes[nodeId];
      this.nodes = {
        ...this.nodes,
        [nodeId]: { ...node, parentId },
      };
    }

    this.persist();
  }

  deleteNodeFromOrderByParentId(args: { parentId: string | null; nodeId: string }): void {
    const { parentId, nodeId } = args;
    if (!this.nodes[nodeId]) return;

    const parentKey = getParentKey(parentId);
    const currentChildren = this.orderByParentId[parentKey];
    if (!currentChildren || currentChildren.length === 0) return;

    const nextChildren = currentChildren.filter((id) => id !== nodeId);
    const nextOrderByParentId = { ...this.orderByParentId, [parentKey]: nextChildren };
    this.orderByParentId = nextOrderByParentId;

    this.persist();
  }

  removeNodeFromOrderByParentIdEverywhere(nodeId: string): void {
    if (!this.nodes[nodeId]) return;

    let changed = false;
    const nextOrderByParentId: Record<string, string[]> = { ...this.orderByParentId };
    for (const key of Object.keys(nextOrderByParentId)) {
      if (!nextOrderByParentId[key].includes(nodeId)) continue;
      nextOrderByParentId[key] = nextOrderByParentId[key].filter((id) => id !== nodeId);
      changed = true;
    }

    if (!changed) return;
    this.orderByParentId = nextOrderByParentId;
    this.persist();
  }

  /**
   * Bulk setters (useful for future cross-parent move + reorder flows)
   */
  setOrderByParentId(next: Record<string, string[]>): void {
    this.orderByParentId = next;
    this.persist();
  }

  /**
   * 备注 / 标记，写入 nodes 并持久化到 localStorage
   */
  setNodeDetail(
    nodeId: string,
    detail: { remark: string; mark: string },
  ): void {
    const node = this.nodes[nodeId];
    if (!node) return;
    const remark = detail.remark || undefined;
    const mark = detail.mark || undefined;
    this.nodes = {
      ...this.nodes,
      [nodeId]: {
        ...node,
        remark,
        mark,
      },
    };
    this.persist();
  }
}

