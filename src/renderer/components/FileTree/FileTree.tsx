import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  type CollisionDetection,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import TreeNodeRow from './TreeNodeRow';
import type {
  DropIndicator,
  FileTreeProps,
  InsertMode,
  SortableNodeDragData,
  TreeNode,
} from './types';
import {
  getChildrenIds,
  getParentKey,
  insertAtIndex,
  isDescendant,
  buildNextOrderByParentId,
  expandedIdsWithFilterAncestors,
  nodeVisibleInTreeFilter,
} from './utils';
import './FileTree.css';

function getClientYFromActivatorEvent(event: unknown): number | null {
  const e = event as any;
  if (!e) return null;
  if (typeof e.clientY === 'number') return e.clientY;
  if (
    Array.isArray(e.touches) &&
    e.touches.length > 0 &&
    typeof e.touches[0].clientY === 'number'
  ) {
    return e.touches[0].clientY;
  }
  if (
    Array.isArray(e.changedTouches) &&
    e.changedTouches.length > 0 &&
    typeof e.changedTouches[0].clientY === 'number'
  ) {
    return e.changedTouches[0].clientY;
  }
  return null;
}

function getActiveCenterY(event: unknown): number | null {
  const e = event as any;
  const rect = e?.active?.rect?.current?.translated ?? e?.active?.rect?.current;
  if (!rect) return null;
  if (typeof rect.top === 'number' && typeof rect.height === 'number') {
    return rect.top + rect.height / 2;
  }
  if (typeof rect?.center?.y === 'number') return rect.center.y;
  return null;
}

function getPointerYFromDragEvent(
  event: unknown,
  dragStartClientY: number | null,
): number | null {
  if (dragStartClientY == null) return null;
  const e = event as any;
  const deltaY = e?.delta?.y;
  if (typeof deltaY !== 'number') return null;
  return dragStartClientY + deltaY;
}

function isInsideDroppableData(
  data: unknown,
): data is { dropKind: 'inside'; targetParentId: string } {
  const d = data as any;
  return d?.dropKind === 'inside' && typeof d?.targetParentId === 'string';
}

function getDropIndicator(args: {
  activeData: SortableNodeDragData;
  over: any;
  nodes: Record<string, TreeNode>;
  orderByParentId: Record<string, string[]>;
  pointerY: number | null;
  activeCenterY: number | null;
  rowRects: Record<string, { top: number; height: number; bottom: number }>;
}): { indicator: DropIndicator | null; dropRejected: boolean } {
  const {
    activeData,
    over,
    nodes,
    orderByParentId,
    pointerY,
    activeCenterY,
    rowRects,
  } = args;

  const overData = over?.data?.current as
    | SortableNodeDragData
    | { dropKind: 'inside'; targetParentId: string }
    | undefined;
  if (!overData) return { indicator: null, dropRejected: false };

  let insertMode: InsertMode;
  let newParentId: string | null;
  let overId: string;

  if (isInsideDroppableData(overData)) {
    insertMode = 'inside';
    newParentId = overData.targetParentId;
    overId = overData.targetParentId;
  } else {
    const overNodeId = String(over?.id);
    const eventRect = over?.rect as
      | { top?: number; height?: number; bottom?: number }
      | undefined;
    const overRect =
      eventRect &&
      typeof eventRect.top === 'number' &&
      typeof eventRect.height === 'number'
        ? { top: eventRect.top, height: eventRect.height }
        : rowRects[overNodeId]
          ? {
              top: rowRects[overNodeId].top,
              height: rowRects[overNodeId].height,
            }
          : null;
    const referenceY = pointerY ?? activeCenterY;
    const isBottomHalf =
      referenceY != null &&
      overRect != null &&
      referenceY >= overRect.top + overRect.height / 2;
    insertMode = isBottomHalf ? 'after' : 'before';
    newParentId = overData.parentId ?? null;
    overId = overNodeId;
  }

  const dropRejected =
    activeData.type === 'folder' &&
    newParentId !== null &&
    (newParentId === activeData.nodeId ||
      isDescendant({
        nodes,
        orderByParentId,
        ancestorId: activeData.nodeId,
        targetId: newParentId,
      }));

  if (insertMode === 'inside') {
    return {
      indicator: { kind: 'inside', overId, parentId: newParentId },
      dropRejected,
    };
  }

  const parentKey = getParentKey(newParentId);
  const siblings = orderByParentId[parentKey] ?? [];
  const overIndex = siblings.indexOf(overId);
  const index = insertMode === 'before' ? overIndex : overIndex + 1;

  return {
    indicator: {
      kind: insertMode,
      overId,
      parentId: newParentId,
      index,
    },
    dropRejected,
  };
}

function getNodeDepth(args: {
  nodes: Record<string, TreeNode>;
  nodeId: string;
}): number {
  const { nodes, nodeId } = args;
  let depth = 0;
  let current = nodes[nodeId];
  const visited = new Set<string>();
  while (current?.parentId) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    depth += 1;
    current = nodes[current.parentId];
  }
  return depth;
}

function findTreeRowEl(nodeId: string): HTMLElement | null {
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-tree-node-id]'),
    ).find((el) => el.dataset.treeNodeId === nodeId) ?? null
  );
}

const MAX_TREE_HISTORY_SIZE = 50;

export interface FileTreeHandle {
  undo: () => void;
}

export default forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  props,
  ref,
) {
  const {
    nodes,
    orderByParentId,
    expandedIds,
    activeId,
    treeSelectionMuted = false,
    onNodeClick,
    onExpandFolder,
    onOrderChange,
    moveNode,
    refreshStore,
    nameFilter = '',
    focusPulseNodeId = null,
    scrollToNodeRequest = null,
    onNodeContextMenu,
  } = props;

  const expandedIdsForRender = useMemo(
    () =>
      expandedIdsWithFilterAncestors(
        expandedIds,
        nodes,
        orderByParentId,
        nameFilter,
      ),
    [expandedIds, nodes, orderByParentId, nameFilter],
  );

  const filterLower = nameFilter.trim().toLowerCase();

  const scrollTargetId = scrollToNodeRequest?.nodeId;
  const scrollToken = scrollToNodeRequest?.token;
  useEffect(() => {
    if (!scrollTargetId) return undefined;
    const t = window.setTimeout(() => {
      const el = findTreeRowEl(scrollTargetId);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    return () => {
      window.clearTimeout(t);
    };
  }, [scrollTargetId, scrollToken]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  const [dropRejected, setDropRejected] = useState(false);
  const dropIndicatorRef = useRef<DropIndicator | null>(null);
  const dropRejectedRef = useRef(false);
  const dragStartClientYRef = useRef<number | null>(null);
  const dragStartRowRectsRef = useRef<
    Record<string, { top: number; height: number; bottom: number }>
  >({});
  const dragStartOrderByParentRef = useRef<Record<string, string[]>>({});
  const autoExpandTimerRef = useRef<number | null>(null);
  const autoExpandTargetRef = useRef<string | null>(null);

  /** 文件树操作历史栈（仅记录 orderByParentId） */
  const treeHistoryRef = useRef<{ orderByParentId: Record<string, string[]> }[]>(
    [],
  );

  /** 每次拖拽开始时压入当前 orderByParentId 快照 */
  const pushTreeHistory = useCallback(() => {
    const stack = treeHistoryRef.current;
    if (stack.length >= MAX_TREE_HISTORY_SIZE) {
      stack.shift();
    }
    stack.push({ orderByParentId: { ...orderByParentId } });
  }, [orderByParentId]);

  /** 执行一次撤销 */
  const handleTreeUndo = useCallback(() => {
    const stack = treeHistoryRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop();
    if (!prev) return;
    onOrderChange(prev.orderByParentId);
  }, [onOrderChange]);

  useImperativeHandle(ref, () => ({ undo: handleTreeUndo }), [
    handleTreeUndo,
  ]);

  const clearAutoExpandTimer = React.useCallback(() => {
    if (autoExpandTimerRef.current != null) {
      window.clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    autoExpandTargetRef.current = null;
  }, []);

  const collisionDetection: CollisionDetection = (args) => {
    // `pointerWithin` 在“最后一项下面的空白区域”可能得到空碰撞，
    // 从而导致 `event.over` 为空、拖拽结束无法触发 move/reorder。
    // 这里给一个 `closestCenter` fallback，让空白区域依然能落到最接近的末尾项。
    const draggingId = String(args.active.id);
    const pointerCollisions = pointerWithin(args);
    const filteredPointerCollisions = pointerCollisions.filter((c) => {
      const id = String(c.id);
      // 排除“被拖拽节点自身”作为 over，避免方向判定卡在自身行。
      return id !== draggingId;
    });
    if (filteredPointerCollisions.length === 0) {
      const closest = closestCenter(args);
      return closest.filter((c) => String(c.id) !== draggingId);
    }

    const insideCollisions = filteredPointerCollisions.filter((c) =>
      args.droppableContainers.some(
        (dc) =>
          dc.id === c.id && (dc.data?.current as any)?.dropKind === 'inside',
      ),
    );

    if (insideCollisions.length > 0) {
      const pointerY = args.pointerCoordinates?.y;
      if (typeof pointerY === 'number') {
        const preferredInside = insideCollisions.find((collision) => {
          const dc = args.droppableContainers.find((c) => c.id === collision.id);
          const data = dc?.data?.current as
            | { dropKind: 'inside'; targetParentId: string }
            | undefined;
          const targetParentId = data?.targetParentId;
          if (!targetParentId) return false;
          const rowRect = args.droppableRects.get(targetParentId as any);
          if (!rowRect) return false;
          const top = rowRect.top;
          const bottom = rowRect.bottom;
          const middleTop = top + rowRect.height * 0.3;
          const middleBottom = bottom - rowRect.height * 0.3;
          // 仅在文件夹中部区域才优先判定为 inside。
          return pointerY >= middleTop && pointerY <= middleBottom;
        });

        if (preferredInside) return [preferredInside];
        // 不在中部区域时，移除 inside 碰撞，避免 inside 持续抢占 over。
        return filteredPointerCollisions.filter(
          (collision) =>
            !args.droppableContainers.some(
              (dc) =>
                dc.id === collision.id &&
                (dc.data?.current as any)?.dropKind === 'inside',
            ),
        );
      } else {
        // 无法读取指针坐标时，保留原有 inside 优先策略。
        return insideCollisions;
      }
    }

    return filteredPointerCollisions;
  };

  const findActiveData = (active: any): SortableNodeDragData | null => {
    const data = active?.data?.current as SortableNodeDragData | undefined;
    if (!data) return null;
    if (!data.nodeId || !('parentId' in data) || !data.type) return null;
    return data;
  };

  const updateDropIndicatorFromEvent = (event: any) => {
    const activeData = findActiveData(event.active);
    if (!activeData || !event.over) {
      setDropIndicator(null);
      setDropRejected(false);
      dropIndicatorRef.current = null;
      dropRejectedRef.current = false;
      clearAutoExpandTimer();
      return;
    }
    const pointerY =
      getPointerYFromDragEvent(event, dragStartClientYRef.current) ??
      getActiveCenterY(event) ??
      getClientYFromActivatorEvent(event.activatorEvent);
    const activeCenterY = getActiveCenterY(event);
    const { over } = event;
    const { indicator, dropRejected: rejected } = getDropIndicator({
      activeData,
      over,
      nodes,
      orderByParentId,
      pointerY,
      activeCenterY,
      rowRects: dragStartRowRectsRef.current,
    });
    setDropIndicator(indicator);
    setDropRejected(rejected);
    dropIndicatorRef.current = indicator;
    dropRejectedRef.current = rejected;

    const overData = event.over?.data?.current as
      | SortableNodeDragData
      | { dropKind: 'inside'; targetParentId: string }
      | undefined;
    if (!overData) {
      clearAutoExpandTimer();
      return;
    }

    const folderId = isInsideDroppableData(overData)
      ? overData.targetParentId
      : nodes[String(event.over.id)]?.type === 'folder'
        ? String(event.over.id)
        : null;
    if (!folderId || expandedIdsForRender.has(folderId) || !onExpandFolder) {
      clearAutoExpandTimer();
      return;
    }

    // 禁止把父文件夹拖进子文件夹时，不触发自动展开。
    const illegalFolderTarget =
      activeData.type === 'folder' &&
      (folderId === activeData.nodeId ||
        isDescendant({
          nodes,
          orderByParentId,
          ancestorId: activeData.nodeId,
          targetId: folderId,
        }));
    if (illegalFolderTarget) {
      clearAutoExpandTimer();
      return;
    }

    if (autoExpandTargetRef.current === folderId) return;
    clearAutoExpandTimer();
    autoExpandTargetRef.current = folderId;
    autoExpandTimerRef.current = window.setTimeout(() => {
      onExpandFolder(folderId);
      autoExpandTimerRef.current = null;
      autoExpandTargetRef.current = null;
    }, 360);
  };

  const renderChildren = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode => {
    const rawChildren = getChildrenIds({ parentId, orderByParentId });
    const childrenIds = filterLower
      ? rawChildren.filter((childId) =>
          nodeVisibleInTreeFilter(
            childId,
            nodes,
            orderByParentId,
            filterLower,
          ),
        )
      : rawChildren;
    if (childrenIds.length === 0) return null;

    return (
      <SortableContext
        items={childrenIds}
        strategy={verticalListSortingStrategy}
      >
        {childrenIds.map((childId) => {
          const node = nodes[childId];
          if (!node) return null;

          if (node.type === 'folder') {
            const expanded = expandedIdsForRender.has(node.id);
            const isDraggingThisFolder = dragActiveId === node.id;
            return (
              <div key={node.id}>
                <TreeNodeRow
                  node={node}
                  depth={depth}
                  dropIndicator={dropIndicator}
                  dropRejected={dropRejected}
                  isDragSession={dragActiveId !== null}
                  isExpanded={expanded}
                  focusPulse={focusPulseNodeId === node.id}
                  activeId={activeId}
                  selectionMuted={treeSelectionMuted}
                  onNodeClick={onNodeClick}
                  onNodeContextMenu={onNodeContextMenu}
                />
                {expanded && !isDraggingThisFolder ? (
                  <div className="treeSection">
                    {renderChildren(node.id, depth + 1)}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={depth}
              dropIndicator={dropIndicator}
              dropRejected={dropRejected}
              isDragSession={dragActiveId !== null}
              isExpanded={false}
              focusPulse={focusPulseNodeId === node.id}
              activeId={activeId}
              selectionMuted={treeSelectionMuted}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
            />
          );
        })}
      </SortableContext>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event) => {
        clearAutoExpandTimer();
        pushTreeHistory();
        const data = findActiveData(event.active);
        setDragActiveId(data?.nodeId ?? null);
        setDropIndicator(null);
        setDropRejected(false);
        dropIndicatorRef.current = null;
        dropRejectedRef.current = false;
        dragStartClientYRef.current = getClientYFromActivatorEvent(
          event.activatorEvent,
        );
        const nodeEls = document.querySelectorAll<HTMLElement>(
          '[data-tree-node-id]',
        );
        const rectMap: Record<
          string,
          { top: number; height: number; bottom: number }
        > = {};
        nodeEls.forEach((el) => {
          const nodeId = el.dataset.treeNodeId;
          if (!nodeId) return;
          const r = el.getBoundingClientRect();
          rectMap[nodeId] = {
            top: r.top,
            height: r.height,
            bottom: r.bottom,
          };
        });
        dragStartRowRectsRef.current = rectMap;
        dragStartOrderByParentRef.current = Object.fromEntries(
          Object.entries(orderByParentId).map(([k, v]) => [k, [...v]]),
        );
      }}
      onDragOver={(event) => {
        updateDropIndicatorFromEvent(event);
      }}
      onDragMove={(event) => {
        // 同一 over 节点内部移动时，onDragOver 可能不会持续触发；
        // 这里强制实时重算“上半/下半”。
        updateDropIndicatorFromEvent(event);
      }}
      onDragEnd={async (event) => {
        clearAutoExpandTimer();
        const activeData = findActiveData(event.active);
        if (!activeData) {
          setDropIndicator(null);
          setDropRejected(false);
          setDragActiveId(null);
          dropIndicatorRef.current = null;
          dropRejectedRef.current = false;
          dragStartClientYRef.current = null;
          dragStartRowRectsRef.current = {};
          return;
        }

        const oldParentId = activeData.parentId;

        let newParentId: string | null = oldParentId;
        let insertMode: InsertMode = 'after';
        let overId: string | null = null;
        let targetOriginalInsertIndex: number | null = null;
        let rejected = false;

        // 优先以当前拖拽预览命中的 over 作为最终落位依据（而非蓝线指示器）。
        if (event.over) {
          const overData = event.over.data.current as any;
          if (isInsideDroppableData(overData)) {
            insertMode = 'inside';
            newParentId = overData.targetParentId;
            overId = overData.targetParentId;
          } else {
            const rawOverId = String(event.over.id);
            const pointerY =
              getPointerYFromDragEvent(event, dragStartClientYRef.current) ??
              getActiveCenterY(event) ??
              getClientYFromActivatorEvent(event.activatorEvent);
            const activeCenterY = getActiveCenterY(event);
            const eventRect = event.over?.rect as
              | { top?: number; height?: number; bottom?: number }
              | undefined;
            const overRect =
              eventRect &&
              typeof eventRect.top === 'number' &&
              typeof eventRect.height === 'number'
                ? { top: eventRect.top, height: eventRect.height }
                : dragStartRowRectsRef.current[rawOverId]
                  ? {
                      top: dragStartRowRectsRef.current[rawOverId].top,
                      height: dragStartRowRectsRef.current[rawOverId].height,
                    }
                  : null;
            const referenceY = pointerY ?? activeCenterY;
            const isBottomHalf =
              referenceY != null &&
              overRect != null &&
              referenceY >= overRect.top + overRect.height / 2;
            insertMode = isBottomHalf ? 'after' : 'before';
            newParentId =
              overData?.parentId ??
              nodes[String(event.over.id)]?.parentId ??
              null;
            overId = rawOverId;

            const parentKeyAtStart = getParentKey(newParentId);
            const targetOriginalChildren =
              dragStartOrderByParentRef.current[parentKeyAtStart] ??
              orderByParentId[parentKeyAtStart] ??
              [];
            const baseIndex = targetOriginalChildren.indexOf(rawOverId);
            if (baseIndex !== -1) {
              targetOriginalInsertIndex = isBottomHalf ? baseIndex + 1 : baseIndex;
            }
          }
        } else {
          // fallback：当松手瞬间 over 丢失时，退回最近一次 dragOver 的结果。
          const indicator = dropIndicatorRef.current;
          rejected = dropRejectedRef.current;
          if (!indicator) {
            setDropIndicator(null);
            setDropRejected(false);
            setDragActiveId(null);
            dropIndicatorRef.current = null;
            dropRejectedRef.current = false;
            dragStartClientYRef.current = null;
            dragStartRowRectsRef.current = {};
            return;
          }
          if (indicator.kind === 'inside') {
            insertMode = 'inside';
            newParentId = indicator.parentId;
            overId = indicator.overId;
          } else {
            insertMode = indicator.kind;
            newParentId = indicator.parentId;
            overId = indicator.overId;
            const parentKeyAtStart = getParentKey(newParentId);
            const targetOriginalChildren =
              dragStartOrderByParentRef.current[parentKeyAtStart] ??
              orderByParentId[parentKeyAtStart] ??
              [];
            const baseIndex = targetOriginalChildren.indexOf(indicator.overId);
            if (baseIndex !== -1) {
              targetOriginalInsertIndex =
                indicator.kind === 'after' ? baseIndex + 1 : baseIndex;
            }
          }
        }

        // 对合法性做最终校验：禁止 folder 拖入自身/子孙。
        if (
          !rejected &&
          activeData.type === 'folder' &&
          newParentId !== null &&
          (newParentId === activeData.nodeId ||
            isDescendant({
              nodes,
              orderByParentId,
              ancestorId: activeData.nodeId,
              targetId: newParentId,
            }))
        ) {
          rejected = true;
        }

        if (rejected) {
          setDropIndicator(null);
          setDropRejected(false);
          setDragActiveId(null);
          dropIndicatorRef.current = null;
          dropRejectedRef.current = false;
          dragStartClientYRef.current = null;
          dragStartRowRectsRef.current = {};
          return;
        }

        if (oldParentId === newParentId) {
          const parentKey = getParentKey(oldParentId);
          const currentChildren = orderByParentId[parentKey] ?? [];
          if (currentChildren.length === 0) {
            dragStartClientYRef.current = null;
            dragStartRowRectsRef.current = {};
            return;
          }

          if (insertMode === 'inside') {
            const without = currentChildren.filter(
              (id) => id !== activeData.nodeId,
            );
            const nextChildren = insertAtIndex({
              list: currentChildren,
              itemId: activeData.nodeId,
              index: without.length, // append to the end
            });
            onOrderChange(
              buildNextOrderByParentId({
                orderByParentId,
                parentId: oldParentId,
                nextChildren,
              }),
            );
            setDropIndicator(null);
            setDropRejected(false);
            setDragActiveId(null);
            dropIndicatorRef.current = null;
            dropRejectedRef.current = false;
            dragStartClientYRef.current = null;
            dragStartRowRectsRef.current = {};
            return;
          }

          const without = currentChildren.filter(
            (id) => id !== activeData.nodeId,
          );
          const parentKeyAtStart = getParentKey(oldParentId);
          const originalChildren =
            dragStartOrderByParentRef.current[parentKeyAtStart] ??
            currentChildren;
          const activeOriginalIndex = originalChildren.indexOf(
            activeData.nodeId,
          );
          const targetOriginalIndex = overId
            ? originalChildren.indexOf(overId)
            : -1;
          const desiredOriginalIndex =
            targetOriginalInsertIndex ??
            (targetOriginalIndex !== -1 ? targetOriginalIndex : null);

          let insertIndex = without.length;
          if (desiredOriginalIndex != null) {
            insertIndex =
              activeOriginalIndex !== -1 &&
              activeOriginalIndex < desiredOriginalIndex
                ? desiredOriginalIndex - 1
                : desiredOriginalIndex;
          }
          const nextChildren = insertAtIndex({
            list: currentChildren,
            itemId: activeData.nodeId,
            index: insertIndex,
          });

          onOrderChange(
            buildNextOrderByParentId({
              orderByParentId,
              parentId: oldParentId,
              nextChildren,
            }),
          );
          setDropIndicator(null);
          setDropRejected(false);
          setDragActiveId(null);
          dropIndicatorRef.current = null;
          dropRejectedRef.current = false;
          dragStartClientYRef.current = null;
          dragStartRowRectsRef.current = {};
          return;
        }

        let targetIndexHint: number | undefined;
        if (newParentId !== oldParentId) {
          const targetParentKey = getParentKey(newParentId);
          const targetOriginalChildren =
            dragStartOrderByParentRef.current[targetParentKey] ??
            orderByParentId[targetParentKey] ??
            [];

          if (insertMode === 'inside') {
            targetIndexHint = targetOriginalChildren.length;
          } else if (targetOriginalInsertIndex != null) {
            targetIndexHint = targetOriginalInsertIndex;
          } else if (overId) {
            const targetOriginalIndex = targetOriginalChildren.indexOf(overId);
            if (targetOriginalIndex !== -1) {
              targetIndexHint =
                insertMode === 'after' ? targetOriginalIndex + 1 : targetOriginalIndex;
            }
          }
        }

        try {
          await moveNode({
            nodeId: activeData.nodeId,
            newParentId,
            insertMode,
            overId,
            targetIndexHint,
          });

          if (refreshStore) {
            await refreshStore();
          }
        } catch (error) {
          const rawMessage = (error as any)?.message ?? String(error);
          const message = rawMessage.includes('destination already exists')
            ? '移动失败：目标位置已存在同名文件或文件夹。'
            : `移动失败：${rawMessage}`;
          // eslint-disable-next-line no-alert
          window.alert(message);
        }

        setDropIndicator(null);
        setDropRejected(false);
        setDragActiveId(null);
        dropIndicatorRef.current = null;
        dropRejectedRef.current = false;
        dragStartClientYRef.current = null;
        dragStartRowRectsRef.current = {};
      }}
      onDragCancel={() => {
        clearAutoExpandTimer();
        setDropIndicator(null);
        setDropRejected(false);
        setDragActiveId(null);
        dropIndicatorRef.current = null;
        dropRejectedRef.current = false;
        dragStartClientYRef.current = null;
        dragStartRowRectsRef.current = {};
      }}
    >
      <div role="tree" aria-label="file tree" className="treeList">
        {renderChildren(null, 0)}
      </div>

      <DragOverlay>
        {dragActiveId && nodes[dragActiveId] ? (
          <div
            className="treeItem"
            style={{
              marginLeft: getNodeDepth({ nodes, nodeId: dragActiveId }) * 18,
            }}
          >
            <span className="treeIcon" aria-hidden="true">
              {nodes[dragActiveId].type === 'folder' ? '▸' : '▫'}
            </span>
            <span className="treeLabel">{nodes[dragActiveId].name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
