export type TreeNodeType = 'file' | 'folder';

export type TreeNode = {
  id: string;
  name: string;
  type: TreeNodeType;
  parentId: string | null;
  // 预留：后续可以挂 diskPath、details 等持久化字段
  diskPath?: string;
  /** 备注，展示在文件名后 */
  remark?: string;
  /** 标记：#RRGGBB 在行末显示为色点；旧数据可能为文字 */
  mark?: string;
};

export type InsertMode = 'before' | 'after' | 'inside';

export type SortableNodeDragData = {
  nodeId: string;
  parentId: string | null;
  type: TreeNodeType;
};

export type InsideDroppableData = {
  dropKind: 'inside';
  targetParentId: string;
};

export type DropIndicator =
  | {
      kind: 'before' | 'after';
      overId: string;
      parentId: string | null;
      index: number;
    }
  | { kind: 'inside'; overId: string; parentId: string | null };

export type MoveNodeParams = {
  nodeId: string;
  newParentId: string | null;
  // 最终落位链路中，仅 inside 有语义；非 inside 统一占位到目标行。
  insertMode: InsertMode;
  overId?: string | null;
  // 占位式插入：目标应占据的索引（基于拖拽开始时的原始列表）
  targetIndexHint?: number;
};

export type FileTreeProps = {
  nodes: Record<string, TreeNode>;
  orderByParentId: Record<string, string[]>; // parentKey => ordered children ids
  expandedIds: Set<string>;

  // 当前选中的节点（用于高亮/aria-selected），通常来自“打开的标签页”
  activeId?: string | null;
  /** 为 true 时：仍保留选中高亮，但使用与编辑区失焦一致的灰色样式（焦点在编辑区时） */
  treeSelectionMuted?: boolean;
  onNodeClick?: (nodeId: string) => void;
  onExpandFolder?: (nodeId: string) => void;

  /** 按名称过滤树（来自 EXPLORE 新建菜单搜索） */
  nameFilter?: string;
  /** 聚焦当前文件时短暂高亮对应行 */
  focusPulseNodeId?: string | null;
  /** 滚动到某节点（token 变化即重新滚动） */
  scrollToNodeRequest?: { nodeId: string; token: number } | null;

  // same-parent：仅更新 orderByParentId
  onOrderChange: (nextOrderByParentId: Record<string, string[]>) => void;

  // cross-parent：调用 main move 并由外部刷新 store
  moveNode: (params: MoveNodeParams) => Promise<void>;
  refreshStore?: () => Promise<void>;

  /** 右键菜单（备注与标记等） */
  onNodeContextMenu?: (nodeId: string, clientX: number, clientY: number) => void;
};

export type ParentKey = string;
