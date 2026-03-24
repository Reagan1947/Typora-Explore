import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { UniqueIdentifier } from '@dnd-kit/core';
import { MdKeyboardArrowRight, MdKeyboardArrowDown } from 'react-icons/md';
import { VscMarkdown } from 'react-icons/vsc';
import type { DropIndicator, TreeNode } from './types';
import { getMarkDisplay } from '../../markTagOptions';

/* eslint-disable react/jsx-props-no-spreading */

type Props = {
  node: TreeNode;
  depth: number;
  dropIndicator: DropIndicator | null;
  dropRejected: boolean;
  isDragSession: boolean;
  isExpanded?: boolean;
  focusPulse?: boolean;
  activeId?: string | null;
  /** 选中行在焦点位于编辑区时显示为灰色高亮 */
  selectionMuted?: boolean;
  onNodeClick?: (nodeId: string) => void;
  onNodeContextMenu?: (
    nodeId: string,
    clientX: number,
    clientY: number,
  ) => void;
};

export default function TreeNodeRow(props: Props) {
  const {
    node,
    depth,
    dropIndicator,
    dropRejected,
    isExpanded,
    focusPulse,
    activeId,
    selectionMuted,
    onNodeClick,
    onNodeContextMenu,
  } = props;

  const sortable = useSortable({
    id: node.id as UniqueIdentifier,
    data: {
      nodeId: node.id,
      parentId: node.parentId,
      type: node.type,
    },
  });

  const insideDroppable = useDroppable({
    id: `${node.id}__inside`,
    data: { dropKind: 'inside', targetParentId: node.id },
    disabled: node.type !== 'folder',
  });

  const { isDragging } = sortable;
  const isActive = activeId === node.id;
  const selectionMutedActive = Boolean(isActive && selectionMuted);
  const markDisplay = getMarkDisplay(node.mark);
  let markSuffix: React.ReactNode = null;
  if (markDisplay?.type === 'dot') {
    markSuffix = (
      <span
        className="treeMarkDot"
        title="标记"
        style={{ backgroundColor: markDisplay.hex }}
      />
    );
  } else if (markDisplay?.type === 'legacy') {
    markSuffix = (
      <span className="treeMark treeMarkLegacy" title={markDisplay.text}>
        {markDisplay.text}
      </span>
    );
  }
  const handleClick = React.useCallback(() => {
    onNodeClick?.(node.id);
  }, [node.id, onNodeClick]);
  // useSortable attributes may include `role`, we keep our own tree semantics.
  // `sortable.attributes` may include `role`/`tabIndex`; we keep our own tree semantics.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const {
    role: _sortableRole,
    tabIndex: _sortableTabIndex,
    ...sortableAttributes
  } = sortable.attributes as any;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // 用 padding-left 做层级缩进，保持行宽 100%，hover 高亮覆盖整行（与左侧对齐到文件树边缘）
  const indentPx = depth * 18;
  const rowLayout: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    paddingLeft: 6 + indentPx,
  };

  const transformStyle: React.CSSProperties = {
    transform: undefined,
    transition: undefined,
    opacity: isDragging ? 0 : 1,
    height: isDragging ? 0 : undefined,
    minHeight: isDragging ? 0 : undefined,
    paddingTop: isDragging ? 0 : undefined,
    paddingBottom: isDragging ? 0 : undefined,
    borderWidth: isDragging ? 0 : undefined,
    marginTop: isDragging ? 0 : undefined,
    marginBottom: isDragging ? 0 : undefined,
    overflow: isDragging ? 'hidden' : undefined,
    pointerEvents: isDragging ? 'none' : undefined,
    ...rowLayout,
  };

  const isBefore =
    dropIndicator?.kind === 'before' && dropIndicator.overId === node.id;
  const isAfter =
    dropIndicator?.kind === 'after' && dropIndicator.overId === node.id;
  const isInside =
    dropIndicator?.kind === 'inside' && dropIndicator.overId === node.id;
  const showReject = dropRejected && (isBefore || isAfter || isInside);

  let folderChevron: React.ReactNode = null;
  if (node.type === 'folder') {
    folderChevron = isExpanded ? (
      <MdKeyboardArrowDown className="treeExpandIcon" />
    ) : (
      <MdKeyboardArrowRight className="treeExpandIcon" />
    );
  }

  return (
    <div
      ref={sortable.setNodeRef}
      data-tree-node-id={node.id}
      style={transformStyle}
      className={[
        'treeItem',
        node.type === 'folder' ? 'treeItemFolder' : '',
        isActive ? 'treeItemActive' : '',
        selectionMutedActive ? 'treeItemSelectionMuted' : '',
        focusPulse ? 'treeItemFocusPulse' : '',
        isBefore ? 'ftDropBefore' : '',
        isAfter ? 'ftDropAfter' : '',
        isInside ? 'ftDropInside' : '',
        showReject ? 'ftDropRejected' : '',
      ].join(' ')}
      role="treeitem"
      aria-grabbed={isDragging}
      aria-selected={isActive}
      onClick={handleClick}
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onNodeContextMenu?.(node.id, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      {...sortableAttributes}
      {...sortable.listeners}
    >
      <span className="treeIcon" aria-hidden="true">
        {node.type === 'folder' ? (
          folderChevron
        ) : (
          <VscMarkdown className="treeFileIcon" />
        )}
      </span>
      <div className="treeRowMain">
        <span className="treeLabel">{node.name}</span>
        {node.remark ? (
          <span className="treeRemark" title={node.remark}>
            {node.remark}
          </span>
        ) : null}
      </div>
      {markSuffix}

      {node.type === 'folder' ? (
        <div
          ref={insideDroppable.setNodeRef}
          className="ftInsideZone"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

TreeNodeRow.defaultProps = {
  isExpanded: false,
  focusPulse: false,
  activeId: null,
  selectionMuted: false,
  onNodeClick: undefined,
  onNodeContextMenu: undefined,
};
