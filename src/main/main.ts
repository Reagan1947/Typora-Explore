/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import {
  projectTrees,
  nodeIdToProjectRootPath,
  rebuildProjectTreeFromDisk,
} from './projectTreeScan';
import createProjectFolderWatcher from './projectFolderWatcher';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

const projectFolderWatcher = createProjectFolderWatcher((rootPath) => {
  mainWindow?.webContents.send('projectTreeChanged', rootPath);
});

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.handle('selectRootPath', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
});

ipcMain.handle('selectProjectIconPath', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择项目图标',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'icns'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
});

type ScanProjectTreeArgs = {
  rootPath: string;
};

type MoveNodeArgs = {
  nodeId: string;
  newParentId: string | null;
  insertMode: 'before' | 'after' | 'inside';
  overId?: string | null;
};

type CreateNodeArgs = {
  rootPath: string;
  parentId: string | null;
  kind: 'file' | 'folder';
  /** 显示用文件名/文件夹名（不含路径）；不传则使用默认 Untitled.md / New Folder */
  name?: string;
};

function sanitizeCreateNodeName(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new Error('名称不能为空');
  }
  if (/[/\\]/.test(t) || t.includes('\0')) {
    throw new Error('名称不能包含路径分隔符');
  }
  if (t === '.' || t === '..') {
    throw new Error('无效名称');
  }
  const base = path.basename(t);
  if (base !== t) {
    throw new Error('名称不能包含路径');
  }
  return t;
}

type CopyNodeArgs = {
  sourceNodeId: string;
  destParentId: string | null;
};

type RenameNodeArgs = {
  nodeId: string;
  newName: string;
};

type DeleteNodeArgs = {
  nodeId: string;
};

type ReadFileForNodeArgs = {
  nodeId: string;
};

type WriteFileForNodeArgs = {
  nodeId: string;
  content: string;
};

type OpenFileInSystemArgs = {
  nodeId: string;
  /** macOS：传给 `open -a` 的应用名；留空则用系统默认打开方式 */
  application?: string | null;
};

async function existsPath(targetPath: string): Promise<boolean> {
  return fs.stat(targetPath).then(
    () => true,
    () => false,
  );
}

function splitNameForConflict(
  name: string,
  isDirectory: boolean,
): {
  baseName: string;
  ext: string;
} {
  if (isDirectory) return { baseName: name, ext: '' };
  const ext = path.extname(name);
  const baseName = ext ? name.slice(0, -ext.length) : name;
  return { baseName, ext };
}

async function resolveConflictPath(args: {
  parentDir: string;
  originalName: string;
  isDirectory: boolean;
}): Promise<string> {
  const { parentDir, originalName, isDirectory } = args;
  const directPath = path.join(parentDir, originalName);
  if (!(await existsPath(directPath))) return directPath;

  const { baseName, ext } = splitNameForConflict(originalName, isDirectory);
  let idx = 1;
  while (idx < 10000) {
    const candidateName = `${baseName} (${idx})${ext}`;
    const candidatePath = path.join(parentDir, candidateName);
    // eslint-disable-next-line no-await-in-loop
    if (!(await existsPath(candidatePath))) return candidatePath;
    idx += 1;
  }
  throw new Error(
    `moveNode: failed to resolve non-conflicting name for: ${originalName}`,
  );
}

function isDescendantPath(containerPath: string, maybeDescendantPath: string) {
  const containerResolved = path.resolve(containerPath);
  const descendantResolved = path.resolve(maybeDescendantPath);

  if (containerResolved === descendantResolved) return true;
  return descendantResolved.startsWith(`${containerResolved}${path.sep}`);
}

function assertSafeBasename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('renameNode: empty name');
  }
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new Error('renameNode: name must not contain path separators');
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new Error('renameNode: invalid name');
  }
  return trimmed;
}

function isPathUnderRoot(rootPath: string, targetPath: string): boolean {
  const rootResolved = path.resolve(rootPath);
  const targetResolved = path.resolve(targetPath);
  if (targetResolved === rootResolved) return true;
  return targetResolved.startsWith(`${rootResolved}${path.sep}`);
}

ipcMain.handle('scanProjectTree', async (_event, args: ScanProjectTreeArgs) => {
  const result = await rebuildProjectTreeFromDisk(args.rootPath);
  projectFolderWatcher.setRoot(result.store.rootPath);
  return result;
});

ipcMain.handle('moveNode', async (_event, args: MoveNodeArgs) => {
  const { nodeId, newParentId } = args;
  const projectRootPath = nodeIdToProjectRootPath.get(nodeId);
  if (!projectRootPath) {
    throw new Error(`moveNode: unknown nodeId: ${nodeId}`);
  }

  const projectTree = projectTrees.get(projectRootPath);
  if (!projectTree) {
    throw new Error(`moveNode: project not found for nodeId: ${nodeId}`);
  }

  const node = projectTree.nodesById[nodeId];
  if (!node) {
    throw new Error(`moveNode: node not found in project: ${nodeId}`);
  }

  const srcDiskPath = node.diskPath;
  const srcStat = await fs.stat(srcDiskPath).catch(() => null);
  if (!srcStat) {
    throw new Error(`moveNode: source path not found: ${srcDiskPath}`);
  }

  const destParentDiskPath =
    newParentId === null
      ? projectRootPath
      : projectTree.nodesById[newParentId]?.diskPath;
  if (!destParentDiskPath) {
    throw new Error(`moveNode: invalid newParentId: ${newParentId}`);
  }

  const destParentStat = await fs.stat(destParentDiskPath).catch(() => null);
  if (!destParentStat || !destParentStat.isDirectory()) {
    throw new Error(
      `moveNode: destination parent is not a directory: ${destParentDiskPath}`,
    );
  }

  // 禁止拖入自身或子孙（只有文件夹需要检查后代）
  if (
    node.type === 'folder' &&
    isDescendantPath(srcDiskPath, destParentDiskPath)
  ) {
    throw new Error(`moveNode: cannot move folder into itself/descendants`);
  }

  const destDiskPath = await resolveConflictPath({
    parentDir: destParentDiskPath,
    originalName: node.name,
    isDirectory: node.type === 'folder',
  });

  await fs.rename(srcDiskPath, destDiskPath);

  // 为渲染层做“无扫描更新”准备：返回受影响节点的新 diskPath 集合
  let updatedDiskPaths: string[];
  if (node.type === 'folder') {
    const prefix = path.resolve(srcDiskPath) + path.sep;
    updatedDiskPaths = Object.values(projectTree.nodesById)
      .filter(
        (n) => n.diskPath === srcDiskPath || n.diskPath.startsWith(prefix),
      )
      .map((n) => {
        if (n.diskPath === srcDiskPath) return destDiskPath;
        return destDiskPath + n.diskPath.slice(srcDiskPath.length);
      });
  } else {
    updatedDiskPaths = [destDiskPath];
  }

  return { ok: true, updatedDiskPaths };
});

ipcMain.handle('createNode', async (_event, args: CreateNodeArgs) => {
  const rootPath = path.resolve(args.rootPath);
  const projectTree = projectTrees.get(rootPath);
  if (!projectTree) {
    throw new Error(`createNode: project not loaded: ${rootPath}`);
  }

  const destParentDiskPath =
    args.parentId === null
      ? projectTree.rootPath
      : projectTree.nodesById[args.parentId]?.diskPath;
  if (!destParentDiskPath) {
    throw new Error(`createNode: invalid parentId: ${args.parentId}`);
  }

  const parentStat = await fs.stat(destParentDiskPath).catch(() => null);
  if (!parentStat || !parentStat.isDirectory()) {
    throw new Error(
      `createNode: parent is not a directory: ${destParentDiskPath}`,
    );
  }

  let originalName: string;
  if (typeof args.name === 'string' && args.name.trim()) {
    originalName = sanitizeCreateNodeName(args.name);
  } else {
    originalName = args.kind === 'file' ? 'Untitled.md' : 'New Folder';
  }
  const isDirectory = args.kind === 'folder';

  const finalPath = await resolveConflictPath({
    parentDir: destParentDiskPath,
    originalName,
    isDirectory,
  });

  if (isDirectory) {
    await fs.mkdir(finalPath, { recursive: true });
  } else {
    await fs.writeFile(finalPath, '', 'utf8');
  }

  return { ok: true, diskPath: finalPath };
});

ipcMain.handle('copyNode', async (_event, args: CopyNodeArgs) => {
  const { sourceNodeId, destParentId } = args;
  const projectRootPath = nodeIdToProjectRootPath.get(sourceNodeId);
  if (!projectRootPath) {
    throw new Error(`copyNode: unknown nodeId: ${sourceNodeId}`);
  }

  const projectTree = projectTrees.get(projectRootPath);
  if (!projectTree) {
    throw new Error(`copyNode: project not found for nodeId: ${sourceNodeId}`);
  }

  const node = projectTree.nodesById[sourceNodeId];
  if (!node) {
    throw new Error(`copyNode: node not found: ${sourceNodeId}`);
  }

  const destParentDiskPath =
    destParentId === null
      ? projectTree.rootPath
      : projectTree.nodesById[destParentId]?.diskPath;
  if (!destParentDiskPath) {
    throw new Error(`copyNode: invalid destParentId: ${destParentId}`);
  }

  const destParentStat = await fs.stat(destParentDiskPath).catch(() => null);
  if (!destParentStat || !destParentStat.isDirectory()) {
    throw new Error(
      `copyNode: destination parent is not a directory: ${destParentDiskPath}`,
    );
  }

  if (!isPathUnderRoot(projectTree.rootPath, destParentDiskPath)) {
    throw new Error('copyNode: destination outside project root');
  }

  const srcDiskPath = path.resolve(node.diskPath);
  const destDiskPath = path.resolve(path.join(destParentDiskPath, node.name));

  if (srcDiskPath === destDiskPath) {
    throw new Error('copyNode: source and destination are the same path');
  }

  if (node.type === 'folder' && isDescendantPath(srcDiskPath, destDiskPath)) {
    throw new Error(
      'copyNode: cannot copy a folder into a path inside that folder',
    );
  }

  await fs.cp(srcDiskPath, destDiskPath, { recursive: true, force: true });

  return { ok: true, diskPath: destDiskPath };
});

ipcMain.handle('renameNode', async (_event, args: RenameNodeArgs) => {
  const safeName = assertSafeBasename(args.newName);
  const { nodeId } = args;

  const projectRootPath = nodeIdToProjectRootPath.get(nodeId);
  if (!projectRootPath) {
    throw new Error(`renameNode: unknown nodeId: ${nodeId}`);
  }

  const projectTree = projectTrees.get(projectRootPath);
  if (!projectTree) {
    throw new Error(`renameNode: project not found for nodeId: ${nodeId}`);
  }

  const node = projectTree.nodesById[nodeId];
  if (!node) {
    throw new Error(`renameNode: node not found: ${nodeId}`);
  }

  const parentDiskPath =
    node.parentId === null
      ? projectTree.rootPath
      : projectTree.nodesById[node.parentId]?.diskPath;
  if (!parentDiskPath) {
    throw new Error(`renameNode: parent not found for node: ${nodeId}`);
  }

  const oldPath = path.resolve(node.diskPath);
  const newPath = path.resolve(path.join(parentDiskPath, safeName));

  const rootResolved = path.resolve(projectTree.rootPath);
  if (oldPath === rootResolved) {
    throw new Error('renameNode: cannot rename project root');
  }

  if (oldPath === newPath) {
    return { ok: true, oldDiskPath: oldPath, newDiskPath: newPath };
  }

  if (await existsPath(newPath)) {
    throw new Error(
      'renameNode: a file or folder with that name already exists',
    );
  }

  await fs.rename(oldPath, newPath);

  return { ok: true, oldDiskPath: oldPath, newDiskPath: newPath };
});

ipcMain.handle('deleteNode', async (_event, args: DeleteNodeArgs) => {
  const { nodeId } = args;

  const projectRootPath = nodeIdToProjectRootPath.get(nodeId);
  if (!projectRootPath) {
    throw new Error(`deleteNode: unknown nodeId: ${nodeId}`);
  }

  const projectTree = projectTrees.get(projectRootPath);
  if (!projectTree) {
    throw new Error(`deleteNode: project not found for nodeId: ${nodeId}`);
  }

  const node = projectTree.nodesById[nodeId];
  if (!node) {
    throw new Error(`deleteNode: node not found: ${nodeId}`);
  }

  const diskPath = path.resolve(node.diskPath);
  const rootResolved = path.resolve(projectTree.rootPath);
  if (diskPath === rootResolved) {
    throw new Error('deleteNode: cannot delete project root');
  }

  await fs.rm(diskPath, { recursive: true, force: true });

  return { ok: true };
});

ipcMain.handle('readFileForNode', async (_event, args: ReadFileForNodeArgs) => {
  const { nodeId } = args;
  const projectRootPath = nodeIdToProjectRootPath.get(nodeId);
  if (!projectRootPath) {
    throw new Error(`readFileForNode: unknown nodeId: ${nodeId}`);
  }
  const projectTree = projectTrees.get(projectRootPath);
  if (!projectTree) {
    throw new Error(`readFileForNode: project not found for nodeId: ${nodeId}`);
  }
  const node = projectTree.nodesById[nodeId];
  if (!node) {
    throw new Error(`readFileForNode: node not found: ${nodeId}`);
  }
  if (node.type !== 'file') {
    throw new Error('readFileForNode: not a file');
  }
  const diskPath = path.resolve(node.diskPath);
  if (!isPathUnderRoot(projectTree.rootPath, diskPath)) {
    throw new Error('readFileForNode: path outside project root');
  }
  const content = await fs.readFile(diskPath, 'utf8');
  return { content };
});

ipcMain.handle(
  'writeFileForNode',
  async (_event, args: WriteFileForNodeArgs) => {
    const { nodeId, content } = args;
    const projectRootPath = nodeIdToProjectRootPath.get(nodeId);
    if (!projectRootPath) {
      throw new Error(`writeFileForNode: unknown nodeId: ${nodeId}`);
    }
    const projectTree = projectTrees.get(projectRootPath);
    if (!projectTree) {
      throw new Error(
        `writeFileForNode: project not found for nodeId: ${nodeId}`,
      );
    }
    const node = projectTree.nodesById[nodeId];
    if (!node) {
      throw new Error(`writeFileForNode: node not found: ${nodeId}`);
    }
    if (node.type !== 'file') {
      throw new Error('writeFileForNode: not a file');
    }
    const diskPath = path.resolve(node.diskPath);
    if (!isPathUnderRoot(projectTree.rootPath, diskPath)) {
      throw new Error('writeFileForNode: path outside project root');
    }
    await fs.writeFile(diskPath, content, 'utf8');
    return { ok: true };
  },
);

ipcMain.handle(
  'openFileInSystem',
  async (_event, args: OpenFileInSystemArgs) => {
    const { nodeId, application } = args;
    const projectRootPath = nodeIdToProjectRootPath.get(nodeId);
    if (!projectRootPath) {
      throw new Error(`openFileInSystem: unknown nodeId: ${nodeId}`);
    }
    const projectTree = projectTrees.get(projectRootPath);
    if (!projectTree) {
      throw new Error(
        `openFileInSystem: project not found for nodeId: ${nodeId}`,
      );
    }
    const node = projectTree.nodesById[nodeId];
    if (!node) {
      throw new Error(`openFileInSystem: node not found: ${nodeId}`);
    }
    if (node.type !== 'file') {
      throw new Error('openFileInSystem: not a file');
    }
    const diskPath = path.resolve(node.diskPath);
    if (!isPathUnderRoot(projectTree.rootPath, diskPath)) {
      throw new Error('openFileInSystem: path outside project root');
    }

    const appName =
      typeof application === 'string' ? application.trim() : '';

    if (process.platform === 'darwin' && appName) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('open', ['-a', appName, diskPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
          if (code === 0 || code === null) resolve();
          else reject(new Error(`open 命令退出码：${code}`));
        });
      });
      return { ok: true };
    }

    const errMsg = await shell.openPath(diskPath);
    if (errMsg) {
      throw new Error(errMsg);
    }
    return { ok: true };
  },
);

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition:
      process.platform === 'darwin' ? { x: 14, y: 13 } : undefined,
    backgroundColor: '#3c3f41',
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('before-quit', () => {
  projectFolderWatcher.stop();
});

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
