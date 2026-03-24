import type {
  DropIndicator,
  InsertMode,
  ParentKey,
  TreeNode,
  TreeNodeType,
} from './types';

export const ROOT_PARENT_KEY: ParentKey = '__root__';

export function getParentKey(parentId: string | null): ParentKey {
  return parentId ?? ROOT_PARENT_KEY;
}

export function getChildrenIds(args: {
  parentId: string | null;
  orderByParentId: Record<string, string[]>;
}): string[] {
  return args.orderByParentId[getParentKey(args.parentId)] ?? [];
}

/** 名称过滤：节点自身或任意子孙名称匹配则显示 */
export function nodeVisibleInTreeFilter(
  nodeId: string,
  nodes: Record<string, TreeNode>,
  orderByParentId: Record<string, string[]>,
  qLower: string,
): boolean {
  if (!qLower) return true;
  const node = nodes[nodeId];
  if (!node) return false;
  if (node.name.toLowerCase().includes(qLower)) return true;
  if (node.type === 'file') return false;
  const kids = getChildrenIds({ parentId: nodeId, orderByParentId });
  return kids.some((kidId) =>
    nodeVisibleInTreeFilter(kidId, nodes, orderByParentId, qLower),
  );
}

/** 过滤时自动展开匹配项的祖先文件夹 */
export function expandedIdsWithFilterAncestors(
  baseExpanded: Set<string>,
  nodes: Record<string, TreeNode>,
  orderByParentId: Record<string, string[]>,
  nameFilter: string,
): Set<string> {
  const q = nameFilter.trim().toLowerCase();
  if (!q) return baseExpanded;
  const next = new Set(baseExpanded);
  Object.keys(nodes).forEach((id) => {
    if (!nodeVisibleInTreeFilter(id, nodes, orderByParentId, q)) return;
    let p: string | null | undefined = nodes[id]?.parentId;
    while (p) {
      next.add(p);
      p = nodes[p]?.parentId ?? null;
    }
  });
  return next;
}

export function isDescendant(args: {
  nodes: Record<string, TreeNode>;
  orderByParentId: Record<string, string[]>;
  ancestorId: string;
  targetId: string;
}): boolean {
  const { nodes, orderByParentId, ancestorId, targetId } = args;

  const stack: string[] = [
    ...(orderByParentId[getParentKey(ancestorId)] ?? []),
  ];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      // no-op
    } else if (visited.has(current)) {
      // already processed
    } else {
      visited.add(current);
      if (current === targetId) return true;

      const node = nodes[current];
      const nodeType: TreeNodeType | undefined = node?.type;
      if (nodeType === 'folder') {
        stack.push(...(orderByParentId[getParentKey(current)] ?? []));
      }
    }
  }

  return false;
}

export function buildNextOrderByParentId(args: {
  orderByParentId: Record<string, string[]>;
  parentId: string | null;
  nextChildren: string[];
}): Record<string, string[]> {
  return {
    ...args.orderByParentId,
    [getParentKey(args.parentId)]: args.nextChildren,
  };
}

export function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

export function removeItem(list: string[], itemId: string): string[] {
  return list.filter((id) => id !== itemId);
}

export function insertAtIndex(args: {
  list: string[];
  itemId: string;
  index: number;
}): string[] {
  const without = removeItem(args.list, args.itemId);
  const insertIndex = clampIndex(args.index, without.length);
  return [
    ...without.slice(0, insertIndex),
    args.itemId,
    ...without.slice(insertIndex),
  ];
}

export function computeInsertModeFromDropIndicator(
  indicator: DropIndicator | null | undefined,
): InsertMode | null {
  if (!indicator) return null;
  if (indicator.kind === 'inside') return 'inside';
  return indicator.kind;
}
