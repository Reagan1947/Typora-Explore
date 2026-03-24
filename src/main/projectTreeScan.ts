import path from 'path';
import fs from 'fs/promises';

export type TreeNodeType = 'file' | 'folder';
export type TreeNode = {
  id: string;
  name: string;
  type: TreeNodeType;
  parentId: string | null;
  diskPath: string;
};

export type ProjectTreeState = {
  rootPath: string;
  nodesById: Record<string, TreeNode>;
  orderByParentId: Record<string, string[]>;
};

export type IpcScanProjectTreeStore = {
  rootPath: string;
  nodes: Record<string, TreeNode>;
  orderByParentId: Record<string, string[]>;
  expandedIds: string[];
};

const ROOT_PARENT_KEY = '__root__';

export const encodeNodeId = (diskPath: string) => encodeURIComponent(diskPath);

export const projectTrees = new Map<string, ProjectTreeState>();
export const nodeIdToProjectRootPath = new Map<string, string>();

const scanDir = async (args: {
  dirPath: string;
  parentId: string | null;
  nodesById: Record<string, TreeNode>;
  orderByParentId: Record<string, string[]>;
}) => {
  const { dirPath, parentId, nodesById, orderByParentId } = args;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const parentKey = parentId ?? ROOT_PARENT_KEY;
  const maybeChildIds = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const id = encodeNodeId(fullPath);
        const node: TreeNode = {
          id,
          name: entry.name,
          type: 'folder',
          parentId,
          diskPath: fullPath,
        };

        nodesById[id] = node;

        await scanDir({
          dirPath: fullPath,
          parentId: id,
          nodesById,
          orderByParentId,
        });

        return id;
      }

      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const isMarkdownFile = ext === '.md' || ext === '.markdown';
        if (!isMarkdownFile) return null;

        const id = encodeNodeId(fullPath);
        const node: TreeNode = {
          id,
          name: entry.name,
          type: 'file',
          parentId,
          diskPath: fullPath,
        };

        nodesById[id] = node;
        return id;
      }

      return null;
    }),
  );

  const childrenIds = maybeChildIds.filter((id): id is string => id !== null);
  orderByParentId[parentKey] = childrenIds;
};

/**
 * Full directory scan into main-process caches. Used by IPC and folder watcher.
 */
export async function rebuildProjectTreeFromDisk(
  rootPathArg: string,
): Promise<{ store: IpcScanProjectTreeStore }> {
  const rootPath = path.resolve(rootPathArg);

  const stat = await fs.stat(rootPath).catch((e) => {
    (e as any).code = (e as any)?.code ?? 'ENOENT';
    throw e;
  });

  if (!stat.isDirectory()) {
    throw new Error(`scanProjectTree rootPath is not a directory: ${rootPath}`);
  }

  [...nodeIdToProjectRootPath.entries()].forEach(([nodeId, rp]) => {
    if (rp === rootPath) nodeIdToProjectRootPath.delete(nodeId);
  });

  const nodesById: Record<string, TreeNode> = {};
  const orderByParentId: Record<string, string[]> = {};

  await scanDir({
    dirPath: rootPath,
    parentId: null,
    nodesById,
    orderByParentId,
  });

  projectTrees.set(rootPath, { rootPath, nodesById, orderByParentId });
  Object.keys(nodesById).forEach((nodeId) => {
    nodeIdToProjectRootPath.set(nodeId, rootPath);
  });

  return {
    store: {
      rootPath,
      nodes: nodesById,
      orderByParentId,
      expandedIds: [],
    },
  };
}
