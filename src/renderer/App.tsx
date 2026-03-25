import './App.css';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { AiOutlineFolderOpen } from 'react-icons/ai';
import { IoChevronDown } from 'react-icons/io5';
import {
  IoDocumentTextOutline,
  IoBookOutline,
  IoFolderOutline,
  IoBrushOutline,
  IoCodeSlashOutline,
  IoGameControllerOutline,
  IoHardwareChipOutline,
  IoHeartOutline,
  IoLeafOutline,
  IoMicOutline,
  IoMusicalNotesOutline,
  IoNewspaperOutline,
  IoSchoolOutline,
  IoSettingsOutline,
  IoShieldOutline,
  IoStarOutline,
  IoTrophyOutline,
  IoVideocamOutline,
  IoWifiOutline,
  IoRocketOutline,
  IoFlaskOutline,
  IoColorPaletteOutline,
  IoCloudOutline,
  IoBriefcaseOutline,
  IoCameraOutline,
  IoGlobeOutline,
  IoHeadsetOutline,
  IoPeopleOutline,
  IoBulbOutline,
  IoStar,
  IoTimeOutline,
  IoFolderOpenOutline,
  IoEllipsisHorizontal,
} from 'react-icons/io5';

const ICON_OPTIONS = [
  IoDocumentTextOutline,
  IoBookOutline,
  IoFolderOutline,
  IoBrushOutline,
  IoCodeSlashOutline,
  IoGameControllerOutline,
  IoHardwareChipOutline,
  IoHeartOutline,
  IoLeafOutline,
  IoMicOutline,
  IoMusicalNotesOutline,
  IoNewspaperOutline,
  IoSchoolOutline,
  IoSettingsOutline,
  IoShieldOutline,
  IoStarOutline,
  IoTrophyOutline,
  IoVideocamOutline,
  IoWifiOutline,
  IoRocketOutline,
  IoFlaskOutline,
  IoColorPaletteOutline,
  IoCloudOutline,
  IoBriefcaseOutline,
  IoCameraOutline,
  IoGlobeOutline,
  IoHeadsetOutline,
  IoPeopleOutline,
  IoBulbOutline,
];
import { VscLayoutSidebarLeft, VscSearch, VscSettingsGear } from 'react-icons/vsc';
import { LuPanelLeft, LuPanelRight } from 'react-icons/lu';
import { FileTree, type FileTreeHandle } from './components/FileTree';
import ExploreToolbar from './components/ExploreToolbar';
import EditorPanelToolbar, { type EditorViewMode } from './components/EditorPanelToolbar';
import MarkdownEditor, { type EditorHandle } from './components/MarkdownEditor';
import MarkdownPreview from './components/MarkdownPreview';
import NodeDetailModal from './components/NodeDetailModal';
import RenameNodeModal from './components/RenameNodeModal';
import type { MoveNodeParams } from './components/FileTree/types';
import { ProjectStore, type ProjectStoreSnapshot } from './store/projectStore';
import { getParentKey } from './components/FileTree/utils';

const ROOT_PATH_LOCAL_STORAGE_KEY = 'markdown-management-tool:lastRootPath';
const RECENT_PROJECTS_KEY = 'markdown-management-tool:recentProjects';
const FAVORITE_PROJECTS_KEY = 'markdown-management-tool:favoriteProjects';
const SHOW_LINE_NUMBERS_KEY = 'markdown-management-tool:showLineNumbers';
const EDITOR_VIEW_MODE_KEY = 'markdown-management-tool:editorViewMode';
const SHOW_FILE_TREE_KEY = 'markdown-management-tool:showFileTree';
const SHOW_MARKDOWN_EDITOR_KEY = 'markdown-management-tool:showMarkdownEditor';
const EXTERNAL_OPEN_APP_KEY = 'markdown-management-tool:externalOpenApp';
const SIDE_BAR_WIDTH_KEY = 'markdown-management-tool:sidebarWidthPx';
const DEFAULT_SIDE_BAR_WIDTH_PX = 320;
const MIN_SIDE_BAR_WIDTH_PX = 180;
const MAX_SIDE_BAR_WIDTH_PX = 720;
const SCROLLBAR_IDLE_MS = 900;
const SCROLLBAR_FADE_OUT_MS = 360;
/** 页签 hover 浮层：离开页签后短暂保留，便于移入浮层阅读长备注 */
const TAB_HOVER_HIDE_MS = 100;

const WELCOME_EDITOR_TEXT = `欢迎使用

在左侧文件树中点击 Markdown 文件以打开标签页并开始编辑。

快捷键：⌘S / Ctrl+S 保存当前文件。`;

const DEFAULT_NEW_FILE_NAME = 'Untitled.md';
const DEFAULT_NEW_FOLDER_NAME = 'New Folder';

type FileBuffer = {
  text: string;
  dirty: boolean;
};

/** 界面焦点归属：决定树选中与当前页签哪一侧用「主」高亮、哪一侧用灰色 */
type UiPaneFocus = 'tree' | 'editor';

type TabHoverTipState = {
  nodeId: string;
  name: string;
  remark: string;
  left: number;
  top: number;
  minWidth: number;
};

function safeReadLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota / disabled storage
  }
}

function readShowLineNumbersFromStorage(): boolean {
  const raw = safeReadLocalStorage(SHOW_LINE_NUMBERS_KEY);
  if (raw === '0' || raw === 'false') return false;
  return true;
}

function readEditorViewModeFromStorage(): EditorViewMode {
  const raw = safeReadLocalStorage(EDITOR_VIEW_MODE_KEY);
  if (raw === 'edit' || raw === 'preview' || raw === 'split') return raw;
  return 'split';
}

function readShowFileTreeFromStorage(): boolean {
  const raw = safeReadLocalStorage(SHOW_FILE_TREE_KEY);
  if (raw === '0' || raw === 'false') return false;
  return true;
}

function readShowMarkdownEditorFromStorage(): boolean {
  const raw = safeReadLocalStorage(SHOW_MARKDOWN_EDITOR_KEY);
  if (raw === '0' || raw === 'false') return false;
  return true;
}

function readExternalOpenAppFromStorage(): string {
  return safeReadLocalStorage(EXTERNAL_OPEN_APP_KEY) ?? '';
}

function clampSidebarWidth(w: number, viewportW: number): number {
  const maxByVp = Math.max(
    MIN_SIDE_BAR_WIDTH_PX,
    Math.floor(viewportW * 0.58),
  );
  const max = Math.min(MAX_SIDE_BAR_WIDTH_PX, maxByVp);
  return Math.min(max, Math.max(MIN_SIDE_BAR_WIDTH_PX, Math.round(w)));
}

function readSidebarWidthFromStorage(): number {
  const raw = safeReadLocalStorage(SIDE_BAR_WIDTH_KEY);
  if (!raw) return DEFAULT_SIDE_BAR_WIDTH_PX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_SIDE_BAR_WIDTH_PX;
  return clampSidebarWidth(
    n,
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
}

function getLastPathSegment(p?: string | null): string {
  if (!p) return '未选择项目';
  const cleaned = p.replace(/[\\/]+$/, '');
  const seg = cleaned.split(/[\\/]/).pop();
  return seg || cleaned;
}

/** Compare project roots from main vs renderer (slash normalization only). */
function pathEquals(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  return norm(a) === norm(b);
}

export default function App() {
  const storeRef = useRef<ProjectStore | null>(null);
  const pendingMoveRef = useRef<null | {
    oldNodeId: string;
    newNodeId: string;
    newParentId: string | null;
    targetIndexHint?: number;
  }>(null);

  const [storeSnapshot, setStoreSnapshot] =
    useState<ProjectStoreSnapshot | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [loadTreeError, setLoadTreeError] = useState<string | null>(null);

  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  /** 文件树高亮：仅随树内点击等变化，不与当前页签 activeFileId 联动 */
  const [treeSelectedId, setTreeSelectedId] = useState<string | null>(null);
  const [uiPaneFocus, setUiPaneFocus] = useState<UiPaneFocus>('editor');
  const [fileBuffers, setFileBuffers] = useState<Record<string, FileBuffer>>(
    {},
  );
  const fileBuffersRef = useRef(fileBuffers);
  fileBuffersRef.current = fileBuffers;
  const fileLoadInFlightRef = useRef<Set<string>>(new Set());

  const [exploreTreeFilter, setExploreTreeFilter] = useState('');
  const [focusPulseNodeId, setFocusPulseNodeId] = useState<string | null>(null);
  const scrollToFileTokenRef = useRef(0);
  const [scrollToNodeRequest, setScrollToNodeRequest] = useState<{
    nodeId: string;
    token: number;
  } | null>(null);

  const [treeContextMenu, setTreeContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [editDetailNodeId, setEditDetailNodeId] = useState<string | null>(null);
  const [renameNodeId, setRenameNodeId] = useState<string | null>(null);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  const [showLineNumbers, setShowLineNumbers] = useState(
    readShowLineNumbersFromStorage,
  );
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>(
    readEditorViewModeFromStorage,
  );
  const [showFileTree, setShowFileTree] = useState(readShowFileTreeFromStorage);
  const [sidebarWidthPx, setSidebarWidthPx] = useState(readSidebarWidthFromStorage);
  const [showMarkdownEditor, setShowMarkdownEditor] = useState(
    readShowMarkdownEditorFromStorage,
  );
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [externalAppDialogOpen, setExternalAppDialogOpen] = useState(false);
  const [externalOpenApp, setExternalOpenApp] = useState(
    readExternalOpenAppFromStorage,
  );
  const [externalAppDraft, setExternalAppDraft] = useState('');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectIconPath, setProjectIconPath] = useState<string | null>(null);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [createProjectRootPath, setCreateProjectRootPath] = useState('');
  const [createProjectIconPath, setCreateProjectIconPath] = useState('');
  const [createProjectIconIndex, setCreateProjectIconIndex] = useState<number | null>(null);
  const [createProjectError, setCreateProjectError] = useState<string | null>(
    null,
  );
  const [editProjectDialogOpen, setEditProjectDialogOpen] = useState(false);
  const [editProjectIconIndex, setEditProjectIconIndex] = useState<number | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [recentProjects, setRecentProjects] = useState<Array<{ path: string; name: string; iconIndex: number | null }>>([]);
  const [favoriteProjects, setFavoriteProjects] = useState<Array<{ path: string; name: string; iconIndex: number | null }>>([]);
  const [createNodeNameDialog, setCreateNodeNameDialog] = useState<{
    kind: 'file' | 'folder';
    parentId: string | null;
    draftName: string;
  } | null>(null);
  const createNodeNameInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmNodeId, setDeleteConfirmNodeId] = useState<string | null>(
    null,
  );

  const [tabHoverTip, setTabHoverTip] = useState<TabHoverTipState | null>(null);
  const tabHoverHideTimerRef = useRef<number | null>(null);
  const hoveredTabElRef = useRef<HTMLDivElement | null>(null);
  const tabsBarTabsRef = useRef<HTMLDivElement>(null);
  const layoutResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startW: number;
  } | null>(null);

  const fileTreeRef = useRef<FileTreeHandle | null>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const commitSnapshot = () => {
    const s = storeRef.current?.getSnapshot() ?? null;
    setStoreSnapshot(s);
  };

  const clearTabHoverHideTimer = () => {
    if (tabHoverHideTimerRef.current != null) {
      window.clearTimeout(tabHoverHideTimerRef.current);
      tabHoverHideTimerRef.current = null;
    }
  };

  const hideTabHoverTip = () => {
    clearTabHoverHideTimer();
    tabHoverHideTimerRef.current = window.setTimeout(() => {
      tabHoverHideTimerRef.current = null;
      hoveredTabElRef.current = null;
      setTabHoverTip(null);
    }, TAB_HOVER_HIDE_MS);
  };

  const showTabHoverTip = (
    anchor: HTMLDivElement,
    tabNodeId: string,
    fileName: string,
    remarkRaw: string,
  ) => {
    clearTabHoverHideTimer();
    hoveredTabElRef.current = anchor;
    const r = anchor.getBoundingClientRect();
    setTabHoverTip({
      nodeId: tabNodeId,
      name: fileName,
      remark: remarkRaw.trim(),
      left: r.left,
      top: r.bottom + 4,
      minWidth: Math.min(Math.max(r.width, 200), 400),
    });
  };

  const scanAndInitStore = async (
    rootPath: string,
    opts?: { resetTabs?: boolean; silent?: boolean },
  ): Promise<void> => {
    const resetTabs = opts?.resetTabs ?? true;
    const silent = opts?.silent ?? false;
    if (!silent) setIsLoadingTree(true);
    setLoadTreeError(null);
    const prevSnapshot = storeRef.current?.getSnapshot() ?? storeSnapshot;
    const pendingMove = pendingMoveRef.current;
    try {
      const ipcResult = await window.electron.ipcRenderer.invoke(
        'scanProjectTree',
        {
          rootPath,
        },
      );
      // main side returns: { store: ProjectStore }
      const initial =
        ipcResult && typeof ipcResult === 'object' && 'store' in ipcResult
          ? (ipcResult as any).store
          : ipcResult;
      const nextStore = new ProjectStore(initial);
      storeRef.current = nextStore;
      const nextSnapshot = nextStore.getSnapshot();
      setStoreSnapshot(nextSnapshot);

      if (resetTabs) {
        setOpenFileIds([]);
        setActiveFileId(null);
        setTreeSelectedId(null);
        setFileBuffers({});
        fileLoadInFlightRef.current.clear();
      } else {
        setOpenFileIds((prev) => {
          if (!pendingMove) {
            return prev.filter((id) => !!nextSnapshot.nodes[id]);
          }

          return prev
            .map((id) =>
              id === pendingMove.oldNodeId ? pendingMove.newNodeId : id,
            )
            .filter((id) => !!nextSnapshot.nodes[id]);
        });
        setActiveFileId((prev) => {
          if (!prev) return null;
          if (pendingMove && prev === pendingMove.oldNodeId) {
            return nextSnapshot.nodes[pendingMove.newNodeId]
              ? pendingMove.newNodeId
              : null;
          }
          return nextSnapshot.nodes[prev] ? prev : null;
        });
        setTreeSelectedId((prev) => {
          if (!prev) return null;
          if (pendingMove && prev === pendingMove.oldNodeId) {
            return nextSnapshot.nodes[pendingMove.newNodeId]
              ? pendingMove.newNodeId
              : null;
          }
          return nextSnapshot.nodes[prev] ? prev : null;
        });
        setFileBuffers((prev) => {
          let next: Record<string, FileBuffer> = { ...prev };
          if (
            pendingMove &&
            Object.prototype.hasOwnProperty.call(next, pendingMove.oldNodeId)
          ) {
            next = { ...next };
            next[pendingMove.newNodeId] = next[pendingMove.oldNodeId];
            delete next[pendingMove.oldNodeId];
          }
          const pruned = Object.fromEntries(
            Object.entries(next).filter(([k]) => !!nextSnapshot.nodes[k]),
          );
          return pruned;
        });
      }
    } catch (e) {
      setLoadTreeError((e as any)?.message ?? String(e));
      if (resetTabs) {
        setStoreSnapshot(null);
        storeRef.current = null;
        setOpenFileIds([]);
        setActiveFileId(null);
        setTreeSelectedId(null);
        setFileBuffers({});
        fileLoadInFlightRef.current.clear();
      } else {
        setStoreSnapshot(prevSnapshot ?? null);
      }
    } finally {
      if (!silent) setIsLoadingTree(false);
    }
  };

  const selectRootAndLoad = async (): Promise<void> => {
    setLoadTreeError(null);
    try {
      const selected =
        await window.electron.ipcRenderer.invoke('selectRootPath');
      if (!selected || typeof selected !== 'string') return;
      await openProjectByPath(selected);
    } catch (e) {
      setLoadTreeError((e as any)?.message ?? String(e));
    }
  };

  const openProjectByPath = async (path: string): Promise<void> => {
    setLoadTreeError(null);
    setIsLoadingTree(true);
    const projectName = path.split('/').pop() || path;
    let iconIndex: number | null = null;
    if (projectIconPath?.startsWith('icon:')) {
      iconIndex = parseInt(projectIconPath.replace('icon:', ''), 10);
    }
    const newRecent = [
      { path, name: projectName, iconIndex },
      ...recentProjects.filter((p) => p.path !== path),
    ].slice(0, 10);
    setRecentProjects(newRecent);
    safeWriteLocalStorage(RECENT_PROJECTS_KEY, JSON.stringify(newRecent));
    safeWriteLocalStorage(ROOT_PATH_LOCAL_STORAGE_KEY, path);
    try {
      await scanAndInitStore(path);
    } catch (e) {
      setLoadTreeError((e as any)?.message ?? String(e));
    } finally {
      setIsLoadingTree(false);
    }
  };

  const handleOpenCreateProjectDialog = () => {
    setCreateProjectRootPath('');
    setCreateProjectIconPath('');
    setCreateProjectIconIndex(null);
    setCreateProjectError(null);
    setCreateProjectDialogOpen(true);
  };

  const handleOpenEditProjectDialog = () => {
    if (projectIconPath?.startsWith('icon:')) {
      setEditProjectIconIndex(parseInt(projectIconPath.replace('icon:', ''), 10));
    } else {
      setEditProjectIconIndex(null);
    }
    const stored = safeReadLocalStorage(`project:${storeSnapshot?.rootPath}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setEditProjectName(data.name || '');
        setEditProjectDescription(data.description || '');
      } catch {
        setEditProjectName('');
        setEditProjectDescription('');
      }
    } else {
      setEditProjectName(projectDisplayName);
      setEditProjectDescription('');
    }
    setEditProjectDialogOpen(true);
  };

  const handlePickCreateProjectRoot = async () => {
    const selected = await window.electron.ipcRenderer.invoke('selectRootPath');
    if (typeof selected === 'string' && selected) {
      setCreateProjectRootPath(selected);
      setCreateProjectError(null);
    }
  };

  const handlePickCreateProjectIcon = async () => {
    const selected =
      await window.electron.ipcRenderer.invoke('selectProjectIconPath');
    if (typeof selected === 'string' && selected) {
      setCreateProjectIconPath(selected);
    }
  };

  const handleConfirmCreateProject = async () => {
    if (!createProjectRootPath.trim()) {
      setCreateProjectError('请先选择项目文件夹地址');
      return;
    }
    setCreateProjectError(null);
    setCreateProjectDialogOpen(false);
    setLoadTreeError(null);
    setIsLoadingTree(true);
    const projectPath = createProjectRootPath.trim();
    const projectName = projectPath.split('/').pop() || projectPath;
    const iconIndex = createProjectIconIndex;
    try {
      if (iconIndex !== null) {
        setProjectIconPath(`icon:${iconIndex}`);
      } else if (createProjectIconPath.trim()) {
        setProjectIconPath(createProjectIconPath.trim());
      } else {
        setProjectIconPath(null);
      }
      safeWriteLocalStorage(
        ROOT_PATH_LOCAL_STORAGE_KEY,
        projectPath,
      );
      const newRecent = [
        { path: projectPath, name: projectName, iconIndex },
        ...recentProjects.filter((p) => p.path !== projectPath),
      ].slice(0, 10);
      setRecentProjects(newRecent);
      safeWriteLocalStorage(RECENT_PROJECTS_KEY, JSON.stringify(newRecent));
      await scanAndInitStore(projectPath);
    } catch (e) {
      setLoadTreeError((e as any)?.message ?? String(e));
    } finally {
      setIsLoadingTree(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lastRootPath = safeReadLocalStorage(ROOT_PATH_LOCAL_STORAGE_KEY);
      if (cancelled) return;
      if (lastRootPath) {
        await scanAndInitStore(lastRootPath);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const recent = safeReadLocalStorage(RECENT_PROJECTS_KEY);
    if (recent) {
      try {
        setRecentProjects(JSON.parse(recent));
      } catch {
        /* ignore parse errors */
      }
    }
    const favorite = safeReadLocalStorage(FAVORITE_PROJECTS_KEY);
    if (favorite) {
      try {
        setFavoriteProjects(JSON.parse(favorite));
      } catch {
        /* ignore parse errors */
      }
    }
  }, []);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;
    const close = (e: MouseEvent) => {
      if (!projectMenuRef.current?.contains(e.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    return () => {
      if (tabHoverHideTimerRef.current != null) {
        window.clearTimeout(tabHoverHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!tabHoverTip) return undefined;
    const onScrollOrResize = () => {
      setTabHoverTip((prev) => {
        const el = hoveredTabElRef.current;
        if (!prev || !el || !document.contains(el)) return prev;
        const r = el.getBoundingClientRect();
        return {
          ...prev,
          left: r.left,
          top: r.bottom + 4,
          minWidth: Math.min(Math.max(r.width, 200), 400),
        };
      });
    };
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    const tabsEl = tabsBarTabsRef.current;
    tabsEl?.addEventListener('scroll', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      tabsEl?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [tabHoverTip]);

  useEffect(() => {
    const onWinResize = () => {
      setSidebarWidthPx((w) => clampSidebarWidth(w, window.innerWidth));
    };
    window.addEventListener('resize', onWinResize, { passive: true });
    return () => window.removeEventListener('resize', onWinResize);
  }, []);

  /** 全局 Cmd+Z / Ctrl+Z 路由：根据焦点区域分发到对应组件的撤销 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (!modifier || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (uiPaneFocus === 'tree') {
        fileTreeRef.current?.undo();
      } else {
        editorRef.current?.undo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [uiPaneFocus]);

  useEffect(() => {
    const scopeSelector = [
      '.fileTreeArea',
      '.editorPanePreview',
      '.markdownPreview pre',
      '.editorCm .cm-scroller',
    ].join(', ');
    const timers = new WeakMap<
      HTMLElement,
      {
        idle?: ReturnType<typeof window.setTimeout>;
        hide?: ReturnType<typeof window.setTimeout>;
      }
    >();
    const touched = new Set<HTMLElement>();

    const resolveScope = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest(scopeSelector) as HTMLElement | null;
    };

    const clearTimers = (el: HTMLElement) => {
      const t = timers.get(el);
      if (!t) return;
      if (t.idle !== undefined) window.clearTimeout(t.idle);
      if (t.hide !== undefined) window.clearTimeout(t.hide);
      timers.delete(el);
    };

    const teardown = (el: HTMLElement) => {
      delete el.dataset.scrollbarsActive;
      delete el.dataset.scrollbarsReveal;
      delete el.dataset.scrollbarsPhase;
      touched.delete(el);
    };

    const showScrollbars = (target: EventTarget | null) => {
      const el = resolveScope(target);
      if (!el) return;
      touched.add(el);
      delete el.dataset.scrollbarsPhase;
      el.dataset.scrollbarsActive = '1';
      el.dataset.scrollbarsReveal = '1';
      clearTimers(el);
      const nextTimers = {} as {
        idle?: ReturnType<typeof window.setTimeout>;
        hide?: ReturnType<typeof window.setTimeout>;
      };
      nextTimers.idle = window.setTimeout(() => {
        el.dataset.scrollbarsPhase = 'hiding';
        nextTimers.hide = window.setTimeout(() => {
          teardown(el);
          nextTimers.hide = undefined;
        }, SCROLLBAR_FADE_OUT_MS);
        nextTimers.idle = undefined;
      }, SCROLLBAR_IDLE_MS);
      timers.set(el, nextTimers);
    };

    const opts = { capture: true, passive: true } as const;
    const onScroll = (e: Event) => showScrollbars(e.target);
    const onWheel = (e: WheelEvent) => showScrollbars(e.target);
    document.addEventListener('scroll', onScroll, opts);
    document.addEventListener('wheel', onWheel, opts);
    return () => {
      document.removeEventListener('scroll', onScroll, opts);
      document.removeEventListener('wheel', onWheel, opts);
      touched.forEach((el) => {
        clearTimers(el);
        teardown(el);
      });
    };
  }, []);

  useEffect(() => {
    const rootPath = storeSnapshot?.rootPath;
    if (!rootPath) return undefined;

    const unsubscribe = window.electron.ipcRenderer.on(
      'projectTreeChanged',
      (changedRoot: unknown) => {
        if (typeof changedRoot !== 'string') return;
        if (pathEquals(changedRoot, rootPath)) {
          scanAndInitStore(rootPath, {
            resetTabs: false,
            silent: true,
          }).catch(() => {
            /* errors surfaced via loadTreeError in scanAndInitStore */
          });
        }
      },
    );

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSnapshot?.rootPath]);

  const expandAncestorsToShowNode = (nodeId: string) => {
    const store = storeRef.current;
    if (!store) return;
    const snap = store.getSnapshot();
    let p: string | null | undefined = snap.nodes[nodeId]?.parentId;
    while (p) {
      store.expand(p);
      p = snap.nodes[p]?.parentId ?? null;
    }
  };

  const handleExploreFocusActiveFile = () => {
    if (!activeFileId || !storeRef.current) return;
    const node = storeRef.current.getSnapshot().nodes[activeFileId];
    if (!node || node.type !== 'file') return;
    setTreeSelectedId(activeFileId);
    setUiPaneFocus('tree');
    expandAncestorsToShowNode(activeFileId);
    commitSnapshot();
    setFocusPulseNodeId(activeFileId);
    scrollToFileTokenRef.current += 1;
    setScrollToNodeRequest({
      nodeId: activeFileId,
      token: scrollToFileTokenRef.current,
    });
    window.setTimeout(() => setFocusPulseNodeId(null), 2200);
  };

  const handleCreateNode = async (
    kind: 'file' | 'folder',
    parentId: string | null,
    baseName: string,
  ): Promise<boolean> => {
    if (!storeRef.current) return false;
    const { rootPath } = storeRef.current;
    try {
      const result = (await window.electron.ipcRenderer.invoke('createNode', {
        rootPath,
        parentId,
        kind,
        name: baseName.trim(),
      })) as { diskPath?: string };
      await scanAndInitStore(rootPath, { resetTabs: false });
      if (parentId) {
        storeRef.current?.expand(parentId);
      }
      if (kind === 'file' && result?.diskPath) {
        const newId = encodeURIComponent(result.diskPath);
        setOpenFileIds((prev) =>
          prev.includes(newId) ? prev : prev.concat(newId),
        );
        setTreeSelectedId(newId);
        setActiveFileId(newId);
        expandAncestorsToShowNode(newId);
        setUiPaneFocus('editor');
      } else if (kind === 'folder' && result?.diskPath) {
        const newId = encodeURIComponent(result.diskPath);
        setTreeSelectedId(newId);
        expandAncestorsToShowNode(newId);
        setUiPaneFocus('tree');
      }
      commitSnapshot();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert((e as Error)?.message ?? String(e));
      return false;
    }
  };

  const confirmCreateNodeNameDialog = async () => {
    if (!createNodeNameDialog) return;
    const trimmed = createNodeNameDialog.draftName.trim();
    if (!trimmed) {
      // eslint-disable-next-line no-alert
      window.alert('请输入名称');
      return;
    }
    const { kind, parentId } = createNodeNameDialog;
    const ok = await handleCreateNode(kind, parentId, trimmed);
    if (ok) {
      setCreateNodeNameDialog(null);
    }
  };

  const handleExploreExpandAll = () => {
    storeRef.current?.expandAllFolders();
    commitSnapshot();
  };

  const handleExploreCollapseAll = () => {
    storeRef.current?.collapseAllFolders();
    commitSnapshot();
  };

  function getPasteDestParentId(contextNodeId: string): string | null {
    if (!storeSnapshot) return null;
    const n = storeSnapshot.nodes[contextNodeId];
    if (!n) return null;
    if (n.type === 'folder') return contextNodeId;
    return n.parentId ?? null;
  }

  const handleNodeContextMenu = (
    nodeId: string,
    clientX: number,
    clientY: number,
  ) => {
    const menuW = 200;
    const menuH = 360;
    const pad = 8;
    const x = Math.min(Math.max(pad, clientX), window.innerWidth - menuW - pad);
    const y = Math.min(
      Math.max(pad, clientY),
      window.innerHeight - menuH - pad,
    );
    setTreeContextMenu({ x, y, nodeId });
  };

  useEffect(() => {
    setCopiedNodeId(null);
  }, [storeSnapshot?.rootPath]);

  useEffect(() => {
    if (!activeFileId || !storeSnapshot) return;
    const node = storeSnapshot.nodes[activeFileId];
    if (!node || node.type !== 'file') return;
    if (fileBuffersRef.current[activeFileId] !== undefined) return;
    if (fileLoadInFlightRef.current.has(activeFileId)) return;

    fileLoadInFlightRef.current.add(activeFileId);
    const nodeId = activeFileId;

    (async () => {
      try {
        const res = (await window.electron.ipcRenderer.invoke(
          'readFileForNode',
          { nodeId },
        )) as { content?: string };
        setFileBuffers((prev) => {
          if (prev[nodeId] !== undefined) return prev;
          return {
            ...prev,
            [nodeId]: { text: res.content ?? '', dirty: false },
          };
        });
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        setFileBuffers((prev) => {
          if (prev[nodeId] !== undefined) return prev;
          return {
            ...prev,
            [nodeId]: {
              text: `<!-- 读取文件失败：${msg} -->\n`,
              dirty: false,
            },
          };
        });
      } finally {
        fileLoadInFlightRef.current.delete(nodeId);
      }
    })();
  }, [activeFileId, storeSnapshot]);

  useEffect(() => {
    if (!treeContextMenu) return undefined;
    const close = () => setTreeContextMenu(null);
    const id = window.setTimeout(() => {
      document.addEventListener('click', close);
    }, 0);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', close);
      window.removeEventListener('keydown', onEsc);
    };
  }, [treeContextMenu]);

  useEffect(() => {
    if (!createNodeNameDialog) return undefined;
    const id = window.requestAnimationFrame(() => {
      const el = createNodeNameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [createNodeNameDialog]);

  useEffect(() => {
    if (!deleteConfirmNodeId) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteConfirmNodeId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteConfirmNodeId]);

  const openCreateNodeNameDialog = (
    kind: 'file' | 'folder',
    parentId: string | null = null,
  ) => {
    setCreateNodeNameDialog({
      kind,
      parentId,
      draftName:
        kind === 'file' ? DEFAULT_NEW_FILE_NAME : DEFAULT_NEW_FOLDER_NAME,
    });
  };

  const handleNodeClick = (nodeId: string) => {
    if (!storeSnapshot) return;
    const node = storeSnapshot.nodes[nodeId];
    if (!node) return;

    setUiPaneFocus('tree');

    if (node.type === 'folder') {
      setTreeSelectedId(nodeId);
      storeRef.current?.toggleExpanded(nodeId);
      commitSnapshot();
      return;
    }

    // file: open or switch tab（树高亮仅随树点击更新）
    setTreeSelectedId(nodeId);
    setOpenFileIds((prev) =>
      prev.includes(nodeId) ? prev : prev.concat(nodeId),
    );
    setActiveFileId(nodeId);
  };

  const closeTab = (nodeId: string) => {
    clearTabHoverHideTimer();
    hoveredTabElRef.current = null;
    setTabHoverTip(null);
    setFileBuffers((prev) => {
      if (!(nodeId in prev)) return prev;
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    setOpenFileIds((prev) => {
      const idx = prev.indexOf(nodeId);
      const next = prev.filter((id) => id !== nodeId);
      if (activeFileId === nodeId) {
        const nextActive = next[idx] ?? next[idx - 1] ?? null;
        setActiveFileId(nextActive);
      }
      return next;
    });
  };

  const endLayoutResize = (
    e: ReactPointerEvent<HTMLDivElement>,
    persist: boolean,
  ) => {
    const d = layoutResizeRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    layoutResizeRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (persist) {
      setSidebarWidthPx((w) => {
        const c = clampSidebarWidth(w, window.innerWidth);
        safeWriteLocalStorage(SIDE_BAR_WIDTH_KEY, String(c));
        return c;
      });
    }
  };

  const handleLayoutResizePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    layoutResizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startW: sidebarWidthPx,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleLayoutResizePointerMove = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const d = layoutResizeRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const next = clampSidebarWidth(d.startW + dx, window.innerWidth);
    setSidebarWidthPx(next);
  };

  const handleLayoutResizePointerUp = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    endLayoutResize(e, true);
  };

  const handleLayoutResizePointerCancel = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    endLayoutResize(e, true);
  };

  const handleEditorChange = (text: string) => {
    if (!activeFileId) return;
    setFileBuffers((prev) => ({
      ...prev,
      [activeFileId]: {
        text,
        dirty: true,
      },
    }));
  };

  const handleSaveActiveFile = async () => {
    if (!activeFileId || !storeSnapshot?.nodes[activeFileId]) return;
    const nodeId = activeFileId;
    const buf = fileBuffers[nodeId];
    if (!buf) return;
    try {
      await window.electron.ipcRenderer.invoke('writeFileForNode', {
        nodeId,
        content: buf.text,
      });
      setFileBuffers((prev) => {
        const b = prev[nodeId];
        if (!b) return prev;
        return { ...prev, [nodeId]: { ...b, dirty: false } };
      });
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert((e as Error)?.message ?? String(e));
    }
  };

  const handleOpenActiveFileExternally = async () => {
    if (!activeFileId || !storeSnapshot?.nodes[activeFileId]) return;
    const node = storeSnapshot.nodes[activeFileId];
    if (node.type !== 'file') return;
    try {
      const app = externalOpenApp.trim();
      await window.electron.ipcRenderer.invoke('openFileInSystem', {
        nodeId: activeFileId,
        application: app || undefined,
      });
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert((e as Error)?.message ?? String(e));
    }
  };

  const handleToggleLineNumbers = () => {
    setShowLineNumbers((prev) => {
      const next = !prev;
      safeWriteLocalStorage(SHOW_LINE_NUMBERS_KEY, next ? '1' : '0');
      return next;
    });
  };

  const handleEditorViewModeChange = (mode: EditorViewMode) => {
    setEditorViewMode(mode);
    safeWriteLocalStorage(EDITOR_VIEW_MODE_KEY, mode);
  };

  const handleCloseAllTabs = () => {
    setOpenFileIds([]);
    setActiveFileId(null);
    setFileBuffers({});
    fileLoadInFlightRef.current.clear();
  };

  const handleCloseAllTabsAndSave = async () => {
    if (!storeSnapshot) return;
    const snap = storeSnapshot;
    const buffers = fileBuffersRef.current;
    const ids = [...openFileIds];
    const dirtyFiles = ids
      .filter((id) => snap.nodes[id]?.type === 'file')
      .map((nodeId) => ({
        nodeId,
        node: snap.nodes[nodeId],
        buf: buffers[nodeId],
      }))
      .filter((x) => x.buf?.dirty);

    const saveFrom = async (index: number): Promise<boolean> => {
      if (index >= dirtyFiles.length) return true;
      const { nodeId, node, buf } = dirtyFiles[index];
      if (!node || !buf) return saveFrom(index + 1);
      try {
        await window.electron.ipcRenderer.invoke('writeFileForNode', {
          nodeId,
          content: buf.text,
        });
      } catch (e) {
        // eslint-disable-next-line no-alert
        window.alert(
          `保存「${node.name}」失败：${(e as Error)?.message ?? String(e)}`,
        );
        return false;
      }
      return saveFrom(index + 1);
    };

    if (await saveFrom(0)) handleCloseAllTabs();
  };

  const moveNode = async (params: MoveNodeParams): Promise<void> => {
    const { nodeId, newParentId, insertMode, overId, targetIndexHint } = params;
    const result = await window.electron.ipcRenderer.invoke('moveNode', {
      nodeId,
      newParentId,
      insertMode,
      overId: overId ?? null,
    });

    const updatedDiskPaths = (result as any)?.updatedDiskPaths;
    if (Array.isArray(updatedDiskPaths) && updatedDiskPaths.length > 0) {
      // folder move 时 updatedDiskPaths 顺序不固定，这里用“最短路径”当作被移动的根节点
      const newDiskPath = [...updatedDiskPaths]
        .filter((p) => typeof p === 'string')
        .sort((a, b) => a.length - b.length)[0];

      if (newDiskPath) {
        pendingMoveRef.current = {
          oldNodeId: nodeId,
          newNodeId: encodeURIComponent(newDiskPath),
          newParentId,
          targetIndexHint,
        };
      }
    }
  };

  const handleTreeCopy = (nodeId: string) => {
    setCopiedNodeId(nodeId);
    setTreeContextMenu(null);
  };

  const handleTreePaste = async (contextNodeId: string) => {
    if (!copiedNodeId || !storeRef.current) return;
    const destParentId = getPasteDestParentId(contextNodeId);
    if (destParentId === undefined) return;
    const { rootPath } = storeRef.current;
    try {
      await window.electron.ipcRenderer.invoke('copyNode', {
        sourceNodeId: copiedNodeId,
        destParentId,
      });
      await scanAndInitStore(rootPath, { resetTabs: false });
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert((e as Error)?.message ?? String(e));
    }
    setTreeContextMenu(null);
  };

  const handleTreeRenameSave = async (newName: string) => {
    if (!renameNodeId || !storeRef.current || !storeSnapshot) {
      setRenameNodeId(null);
      return;
    }
    const node = storeSnapshot.nodes[renameNodeId];
    if (!node) {
      setRenameNodeId(null);
      return;
    }
    if (!newName || newName === node.name) {
      setRenameNodeId(null);
      return;
    }

    const remark = node.remark ?? '';
    const mark = node.mark ?? '';
    const { rootPath } = storeRef.current;
    const oldId = renameNodeId;

    try {
      const result = (await window.electron.ipcRenderer.invoke('renameNode', {
        nodeId: oldId,
        newName,
      })) as { newDiskPath?: string };

      await scanAndInitStore(rootPath, { resetTabs: false });

      const newDiskPath =
        result && typeof result.newDiskPath === 'string'
          ? result.newDiskPath
          : null;
      const store = storeRef.current;
      if (newDiskPath && store) {
        const newId = encodeURIComponent(newDiskPath);
        if (remark.trim() || mark.trim()) {
          store.setNodeDetail(newId, { remark, mark });
        }
        setOpenFileIds((prev) => prev.map((id) => (id === oldId ? newId : id)));
        setActiveFileId((prev) => (prev === oldId ? newId : prev));
        setTreeSelectedId((prev) => (prev === oldId ? newId : prev));
        setCopiedNodeId((prev) => (prev === oldId ? newId : prev));
        setFileBuffers((prev) => {
          if (!(oldId in prev)) return prev;
          const next = { ...prev };
          next[newId] = next[oldId];
          delete next[oldId];
          return next;
        });
      }
      commitSnapshot();
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert((e as Error)?.message ?? String(e));
      return;
    }
    setRenameNodeId(null);
  };

  const performTreeDelete = async (nodeId: string) => {
    const store = storeRef.current;
    if (!store) return;
    const snap = store.getSnapshot();
    const delNode = snap.nodes[nodeId];
    const copiedPath = copiedNodeId
      ? snap.nodes[copiedNodeId]?.diskPath
      : undefined;
    if (copiedNodeId === nodeId) {
      setCopiedNodeId(null);
    } else if (delNode?.type === 'folder' && delNode.diskPath && copiedPath) {
      const rootNorm = delNode.diskPath.replace(/\\/g, '/');
      const copiedNorm = copiedPath.replace(/\\/g, '/');
      if (copiedNorm === rootNorm || copiedNorm.startsWith(`${rootNorm}/`)) {
        setCopiedNodeId(null);
      }
    }

    const { rootPath } = store;
    try {
      await window.electron.ipcRenderer.invoke('deleteNode', { nodeId });
      await scanAndInitStore(rootPath, { resetTabs: false });
      setTreeSelectedId((prev) => (prev === nodeId ? null : prev));
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert((e as Error)?.message ?? String(e));
    }
  };

  const confirmTreeDelete = async () => {
    if (!deleteConfirmNodeId) return;
    const nodeId = deleteConfirmNodeId;
    setDeleteConfirmNodeId(null);
    await performTreeDelete(nodeId);
  };

  const activeNode =
    activeFileId && storeSnapshot ? storeSnapshot.nodes[activeFileId] : null;
  const isFileTab = activeNode?.type === 'file';
  const activeBuffer = activeFileId ? fileBuffers[activeFileId] : undefined;
  const editorValue =
    !activeFileId || !isFileTab
      ? WELCOME_EDITOR_TEXT
      : (activeBuffer?.text ?? '');
  const editorReadOnly = !activeFileId || !isFileTab;
  const editorLoading = Boolean(
    activeFileId && isFileTab && activeBuffer === undefined,
  );

  const showEditorColumn =
    showMarkdownEditor &&
    (editorViewMode === 'edit' || editorViewMode === 'split');
  const showPreviewColumn =
    editorViewMode === 'preview' || editorViewMode === 'split';
  const editorAreaBothHidden = !showEditorColumn && !showPreviewColumn;

  const projectDisplayName = useMemo(() => {
    if (storeSnapshot?.rootPath) {
      const stored = safeReadLocalStorage(`project:${storeSnapshot.rootPath}`);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.name) return data.name;
        } catch { /* ignore */ }
      }
    }
    return getLastPathSegment(storeSnapshot?.rootPath);
  }, [storeSnapshot?.rootPath]);

  const projectDescription = useMemo(() => {
    if (storeSnapshot?.rootPath) {
      const stored = safeReadLocalStorage(`project:${storeSnapshot.rootPath}`);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.description) return data.description;
        } catch { /* ignore */ }
      }
    }
    return '';
  }, [storeSnapshot?.rootPath]);

  const globalSearchMatches = useMemo(() => {
    if (!storeSnapshot || !globalSearchQuery.trim()) return [];
    const q = globalSearchQuery.trim().toLowerCase();
    const isMdName = (name: string) => /\.(md|markdown|mdx)$/i.test(name);
    return Object.values(storeSnapshot.nodes)
      .filter(
        (n) =>
          n.type === 'file' &&
          isMdName(n.name) &&
          n.name.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
  }, [storeSnapshot, globalSearchQuery]);

  const handleTabsWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const delta =
      Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;
    el.scrollLeft += delta;
    e.preventDefault();
  };

  let treeBody: ReactNode;
  if (isLoadingTree) {
    treeBody = <div className="emptyHint">加载中...</div>;
  } else if (loadTreeError) {
    treeBody = (
      <div className="emptyHint" style={{ color: 'rgba(255,110,110,0.85)' }}>
        {loadTreeError}
      </div>
    );
  } else if (storeSnapshot) {
    treeBody = (
      <FileTree
        nodes={storeSnapshot.nodes}
        orderByParentId={storeSnapshot.orderByParentId}
        expandedIds={storeSnapshot.expandedIds}
        activeId={treeSelectedId}
        treeSelectionMuted={uiPaneFocus === 'editor'}
        nameFilter={exploreTreeFilter}
        focusPulseNodeId={focusPulseNodeId}
        scrollToNodeRequest={scrollToNodeRequest}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onExpandFolder={(nodeId) => {
          storeRef.current?.expand(nodeId);
          commitSnapshot();
        }}
        onOrderChange={(nextOrderByParentId) => {
          storeRef.current?.setOrderByParentId(nextOrderByParentId);
          commitSnapshot();
        }}
        moveNode={moveNode}
        refreshStore={async () => {
          if (!storeRef.current) return;
          await scanAndInitStore(storeRef.current.rootPath, {
            resetTabs: false,
          });

          const pendingMove = pendingMoveRef.current;
          const store = storeRef.current;
          if (!pendingMove || !store) return;

          const snapshot = store.getSnapshot();
          const destParentKey = getParentKey(pendingMove.newParentId);
          const destChildren = snapshot.orderByParentId[destParentKey] ?? [];
          const destChildrenWithoutMoved = destChildren.filter(
            (id) => id !== pendingMove.newNodeId,
          );

          const insertIndex =
            pendingMove.targetIndexHint ?? destChildrenWithoutMoved.length;

          store.insertNodeIntoOrderByParentId({
            parentId: pendingMove.newParentId,
            nodeId: pendingMove.newNodeId,
            index: insertIndex,
            updateNodeParentId: true,
          });
          setStoreSnapshot(store.getSnapshot());
          pendingMoveRef.current = null;
        }}
        ref={fileTreeRef}
      />
    );
  } else {
    treeBody = <div className="emptyHint">请选择根目录以加载文档树。</div>;
  }

  return (
    <div className="appRoot">
      <header className="windowTitleBar">
        <div className="windowTitleBarLeft">
          <div className="windowProjectMenuWrap" ref={projectMenuRef}>
          <button
            type="button"
            className="windowProjectSwitchBtn"
            onClick={() => setProjectMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
          >
            {projectIconPath?.startsWith('icon:') ? (
              (() => {
                const IconComponent = ICON_OPTIONS[parseInt(projectIconPath.replace('icon:', ''), 10)];
                return IconComponent ? (
                  <IconComponent className="windowProjectIconGlyph" />
                ) : (
                  <AiOutlineFolderOpen className="windowProjectIconGlyph" />
                );
              })()
            ) : projectIconPath ? (
              <img
                src={`file://${projectIconPath}`}
                alt=""
                className="windowProjectIcon"
                aria-hidden="true"
              />
            ) : (
              <AiOutlineFolderOpen className="windowProjectIconGlyph" />
            )}
            <span className="windowProjectName">{projectDisplayName}</span>
            <IoChevronDown className="windowProjectChevron" />
          </button>
          {projectMenuOpen ? (
            <div className="windowProjectMenu" role="menu">
              {storeSnapshot?.rootPath && (
                <>
                  <div className="windowProjectMenuCurrentProject">
                    <div className="windowProjectMenuCurrentInfo">
                      {projectIconPath?.startsWith('icon:') && ICON_OPTIONS[parseInt(projectIconPath.replace('icon:', ''), 10)] ? (
                        (() => {
                          const CurrentIcon = ICON_OPTIONS[parseInt(projectIconPath.replace('icon:', ''), 10)];
                          return <CurrentIcon size={18} />;
                        })()
                      ) : projectIconPath ? (
                        <img src={`file://${projectIconPath}`} alt="" className="windowProjectMenuCurrentIcon" />
                      ) : (
                        <AiOutlineFolderOpen size={18} />
                      )}
                      <span className="windowProjectMenuCurrentName">{projectDisplayName}</span>
                    </div>
                    <button
                      type="button"
                      className="windowProjectMenuEditBtn"
                      onClick={() => {
                        setProjectMenuOpen(false);
                        handleOpenEditProjectDialog();
                      }}
                      title="编辑项目信息"
                    >
                      <IoEllipsisHorizontal size={16} />
                    </button>
                  </div>
                  <div className="windowProjectMenuDivider" />
                </>
              )}

              <button
                type="button"
                className="windowProjectMenuItem"
                role="menuitem"
                onClick={() => {
                  setProjectMenuOpen(false);
                  handleOpenCreateProjectDialog();
                }}
              >
                <IoFolderOpenOutline size={16} />
                新建项目
              </button>
              <button
                type="button"
                className="windowProjectMenuItem"
                role="menuitem"
                onClick={() => {
                  setProjectMenuOpen(false);
                  selectRootAndLoad().catch(() => {
                    /* errors already surfaced via loadTreeError */
                  });
                }}
              >
                <IoFolderOutline size={16} />
                打开项目
              </button>

              {favoriteProjects.length > 0 && (
                <>
                  <div className="windowProjectMenuDivider" />
                  <div className="windowProjectMenuSectionTitle">收藏项目</div>
                  {favoriteProjects.map((project) => (
                    <button
                      key={project.path}
                      type="button"
                      className="windowProjectMenuItem"
                      role="menuitem"
                      onClick={() => {
                        setProjectMenuOpen(false);
                        openProjectByPath(project.path);
                      }}
                    >
                      {project.iconIndex !== null && ICON_OPTIONS[project.iconIndex] ? (
                        (() => {
                          const ProjectIcon = ICON_OPTIONS[project.iconIndex];
                          return <ProjectIcon size={16} />;
                        })()
                      ) : (
                        <IoFolderOutline size={16} />
                      )}
                      <span className="windowProjectMenuItemText">{project.name}</span>
                      <button
                        type="button"
                        className="windowProjectMenuItemAction"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = favoriteProjects.filter((p) => p.path !== project.path);
                          setFavoriteProjects(updated);
                          safeWriteLocalStorage(FAVORITE_PROJECTS_KEY, JSON.stringify(updated));
                        }}
                        title="取消收藏"
                      >
                        <IoStar size={14} />
                      </button>
                    </button>
                  ))}
                </>
              )}

              {recentProjects.length > 0 && (
                <>
                  <div className="windowProjectMenuDivider" />
                  <div className="windowProjectMenuSectionTitle">最近打开</div>
                  {recentProjects.map((project) => (
                    <button
                      key={project.path}
                      type="button"
                      className="windowProjectMenuItem"
                      role="menuitem"
                      onClick={() => {
                        setProjectMenuOpen(false);
                        openProjectByPath(project.path);
                      }}
                    >
                      {project.iconIndex !== null && ICON_OPTIONS[project.iconIndex] ? (
                        (() => {
                          const ProjectIcon = ICON_OPTIONS[project.iconIndex];
                          return <ProjectIcon size={16} />;
                        })()
                      ) : (
                        <IoTimeOutline size={16} />
                      )}
                      <span className="windowProjectMenuItemText">{project.name}</span>
                      <button
                        type="button"
                        className="windowProjectMenuItemAction"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = [
                            ...favoriteProjects,
                            project,
                          ];
                          setFavoriteProjects(updated);
                          safeWriteLocalStorage(FAVORITE_PROJECTS_KEY, JSON.stringify(updated));
                        }}
                        title="收藏"
                      >
                        <IoStarOutline size={14} />
                      </button>
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : null}
        </div>
        </div>
        <div className="windowTitleBarTools">
          <button
            type="button"
            className={[
              'titleBarIconBtn',
              showFileTree ? '' : 'titleBarIconBtnOff',
            ].join(' ')}
            aria-label={showFileTree ? '隐藏文件树' : '显示文件树'}
            aria-pressed={showFileTree}
            title={showFileTree ? '隐藏文件树' : '显示文件树'}
            onClick={() => {
              setShowFileTree((prev) => {
                const next = !prev;
                safeWriteLocalStorage(SHOW_FILE_TREE_KEY, next ? '1' : '0');
                return next;
              });
            }}
          >
            <LuPanelLeft size={16} />
          </button>
          <button
            type="button"
            className={[
              'titleBarIconBtn',
              showMarkdownEditor ? '' : 'titleBarIconBtnOff',
            ].join(' ')}
            aria-label={
              showMarkdownEditor ? '隐藏 Markdown 编辑区' : '显示 Markdown 编辑区'
            }
            aria-pressed={showMarkdownEditor}
            title={
              showMarkdownEditor ? '隐藏 Markdown 编辑区' : '显示 Markdown 编辑区'
            }
            onClick={() => {
              setShowMarkdownEditor((prev) => {
                const next = !prev;
                safeWriteLocalStorage(
                  SHOW_MARKDOWN_EDITOR_KEY,
                  next ? '1' : '0',
                );
                return next;
              });
            }}
          >
            <LuPanelRight size={16} />
          </button>
          <button
            type="button"
            className="titleBarIconBtn"
            aria-label="全局搜索"
            title="全局搜索（Markdown 文件名）"
            onClick={() => {
              setGlobalSearchQuery('');
              setGlobalSearchOpen(true);
            }}
          >
            <VscSearch size={16} />
          </button>
          <button
            type="button"
            className="titleBarIconBtn"
            aria-label="外部打开所用应用"
            title="设置外部打开所用应用"
            onClick={() => {
              setExternalAppDraft(externalOpenApp);
              setExternalAppDialogOpen(true);
            }}
          >
            <VscSettingsGear size={16} />
          </button>
        </div>
      </header>
      <div className="layoutBody">
        {showFileTree ? (
          <>
            <aside
              className="sideBar"
              style={{ width: sidebarWidthPx }}
              onMouseDownCapture={() => setUiPaneFocus('tree')}
            >
              <div className="sideBarHeader">
                <span className="sideBarTitle">EXPLORE</span>
                <ExploreToolbar
                  disabled={!storeSnapshot || isLoadingTree}
                  treeFilter={exploreTreeFilter}
                  onTreeFilterChange={setExploreTreeFilter}
                  onNewFile={() => openCreateNodeNameDialog('file', null)}
                  onNewFolder={() => openCreateNodeNameDialog('folder', null)}
                  onFocusActiveFile={handleExploreFocusActiveFile}
                  onExpandAll={handleExploreExpandAll}
                  onCollapseAll={handleExploreCollapseAll}
                />
              </div>
              <div className="fileTreeArea">{treeBody}</div>
            </aside>
            <div
              className="layoutResizeHandle"
              role="separator"
              aria-label="拖动调整文件树与编辑区宽度"
              aria-orientation="vertical"
              aria-valuemin={MIN_SIDE_BAR_WIDTH_PX}
              aria-valuemax={MAX_SIDE_BAR_WIDTH_PX}
              aria-valuenow={sidebarWidthPx}
              tabIndex={0}
              onPointerDown={handleLayoutResizePointerDown}
              onPointerMove={handleLayoutResizePointerMove}
              onPointerUp={handleLayoutResizePointerUp}
              onPointerCancel={handleLayoutResizePointerCancel}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                const step = e.shiftKey ? 20 : 8;
                const delta = e.key === 'ArrowRight' ? step : -step;
                setSidebarWidthPx((w) => {
                  const next = clampSidebarWidth(w + delta, window.innerWidth);
                  safeWriteLocalStorage(SIDE_BAR_WIDTH_KEY, String(next));
                  return next;
                });
              }}
            />
          </>
        ) : null}

        <main
          className="editorShell"
          onMouseDownCapture={() => setUiPaneFocus('editor')}
        >
          <div className="tabsBar">
            <div
              className="tabsBarTabs"
              ref={tabsBarTabsRef}
              onWheel={handleTabsWheel}
            >
              <div className="tabs">
                {openFileIds.length === 0 ? (
                  <div className="emptyHint" style={{ padding: '0 4px' }}>
                    打开一个文件
                  </div>
                ) : null}

                {openFileIds.map((nodeId) => {
                  const node = storeSnapshot?.nodes[nodeId];
                  const name = node?.name ?? 'unknown.md';
                  const isActive = nodeId === activeFileId;
                  const isDirty = fileBuffers[nodeId]?.dirty ?? false;
                  return (
                    <div
                      key={nodeId}
                      className={[
                        'tab',
                        isActive ? 'active' : '',
                        isActive && uiPaneFocus === 'tree' ? 'tabActiveMuted' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onMouseEnter={(e) => {
                        showTabHoverTip(
                          e.currentTarget,
                          nodeId,
                          name,
                          node?.remark ?? '',
                        );
                      }}
                      onMouseLeave={hideTabHoverTip}
                      onClick={() => {
                        if (!storeSnapshot?.nodes[nodeId]) return;
                        setUiPaneFocus('editor');
                        setActiveFileId(nodeId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (!storeSnapshot?.nodes[nodeId]) return;
                        setUiPaneFocus('editor');
                        setActiveFileId(nodeId);
                      }}
                    >
                      <span className="tabName">{name}</span>
                      {isActive ? (
                        <button
                          className={[
                            'tabClose',
                            isDirty ? 'tabCloseDirty' : '',
                          ].join(' ')}
                          type="button"
                          aria-label={`close ${name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(nodeId);
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <EditorPanelToolbar
              canOpenExternal={Boolean(
                activeFileId &&
                  storeSnapshot?.nodes[activeFileId]?.type === 'file',
              )}
              showLineNumbers={showLineNumbers}
              viewMode={editorViewMode}
              hasOpenTabs={openFileIds.length > 0}
              onOpenExternal={handleOpenActiveFileExternally}
              onToggleLineNumbers={handleToggleLineNumbers}
              onViewModeChange={handleEditorViewModeChange}
              onCloseAllTabs={handleCloseAllTabs}
              onCloseAllTabsAndSave={handleCloseAllTabsAndSave}
            />
          </div>

          <div
            className={[
              'editorArea',
              editorViewMode === 'split' ? 'editorAreaSplit' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {editorAreaBothHidden ? (
              <div className="editorPane editorHiddenPlaceholder">
                <div className="emptyHint">
                  编辑区与预览均已隐藏，可在顶部工具栏恢复显示。
                </div>
              </div>
            ) : null}
            {showEditorColumn ? (
              <div className="editorPane editorPaneEditor">
                {editorLoading ? (
                  <div className="editorLoadingHint">加载文件内容…</div>
                ) : null}
                <MarkdownEditor
                  key={activeFileId ?? 'welcome'}
                  className={
                    editorLoading ? 'editorCm editorCmHidden' : 'editorCm'
                  }
                  value={editorValue}
                  readOnly={editorReadOnly || editorLoading}
                  showLineNumbers={showLineNumbers}
                  onChange={
                    editorReadOnly || editorLoading
                      ? undefined
                      : handleEditorChange
                  }
                  onSave={
                    editorReadOnly || editorLoading
                      ? undefined
                      : handleSaveActiveFile
                  }
                  onFocus={() => setUiPaneFocus('editor')}
                  ref={editorRef}
                />
              </div>
            ) : null}
            {showPreviewColumn ? (
              <div className="editorPane editorPanePreview">
                <MarkdownPreview markdown={editorValue} />
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {treeContextMenu && storeSnapshot?.nodes[treeContextMenu.nodeId] ? (
        <div
          className="treeContextMenu"
          style={{ left: treeContextMenu.x, top: treeContextMenu.y }}
          role="menu"
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="treeContextMenuItem"
            role="menuitem"
            disabled={
              storeSnapshot.nodes[treeContextMenu.nodeId].type !== 'folder'
            }
            onClick={() => {
              if (storeSnapshot.nodes[treeContextMenu.nodeId].type !== 'folder')
                return;
              const parentFolderId = treeContextMenu.nodeId;
              setTreeContextMenu(null);
              openCreateNodeNameDialog('file', parentFolderId);
            }}
          >
            新建文件
          </button>
          <button
            type="button"
            className="treeContextMenuItem"
            role="menuitem"
            disabled={
              storeSnapshot.nodes[treeContextMenu.nodeId].type !== 'folder'
            }
            onClick={() => {
              if (storeSnapshot.nodes[treeContextMenu.nodeId].type !== 'folder')
                return;
              const parentFolderId = treeContextMenu.nodeId;
              setTreeContextMenu(null);
              openCreateNodeNameDialog('folder', parentFolderId);
            }}
          >
            新建文件夹
          </button>
          <hr className="treeContextMenuSep" />
          <button
            type="button"
            className="treeContextMenuItem"
            role="menuitem"
            onClick={() => {
              setEditDetailNodeId(treeContextMenu.nodeId);
              setTreeContextMenu(null);
            }}
          >
            备注与标记
          </button>
          <hr className="treeContextMenuSep" />
          <button
            type="button"
            className="treeContextMenuItem"
            role="menuitem"
            onClick={() => handleTreeCopy(treeContextMenu.nodeId)}
          >
            复制
          </button>
          <button
            type="button"
            className="treeContextMenuItem"
            role="menuitem"
            disabled={!copiedNodeId || !storeSnapshot?.nodes[copiedNodeId]}
            onClick={async () => {
              if (!copiedNodeId || !storeSnapshot?.nodes[copiedNodeId]) return;
              await handleTreePaste(treeContextMenu.nodeId);
            }}
          >
            粘贴
          </button>
          <button
            type="button"
            className="treeContextMenuItem"
            role="menuitem"
            onClick={() => {
              setRenameNodeId(treeContextMenu.nodeId);
              setTreeContextMenu(null);
            }}
          >
            重命名
          </button>
          <button
            type="button"
            className="treeContextMenuItem treeContextMenuItemDanger"
            role="menuitem"
            onClick={() => {
              setDeleteConfirmNodeId(treeContextMenu.nodeId);
              setTreeContextMenu(null);
            }}
          >
            删除
          </button>
        </div>
      ) : null}

      {deleteConfirmNodeId && storeSnapshot?.nodes[deleteConfirmNodeId] ? (
        <div
          className="nodeDetailModalBackdrop"
          role="presentation"
          onMouseDown={() => setDeleteConfirmNodeId(null)}
        >
          <div
            className="nodeDetailModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="nodeDetailModalTitle" id="delete-confirm-title">
              确认删除
            </div>
            <div className="nodeDetailModalPath">
              {storeSnapshot.nodes[deleteConfirmNodeId].name}
            </div>
            <div className="nodeDetailModalHint">
              {storeSnapshot.nodes[deleteConfirmNodeId].type === 'folder'
                ? '将删除该文件夹及其中的所有内容。此操作不可撤销。'
                : '将永久删除该文件。此操作不可撤销。'}
            </div>
            <div className="nodeDetailModalActions">
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                onClick={() => setDeleteConfirmNodeId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnDanger"
                onClick={() => void confirmTreeDelete()}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameNodeId && storeSnapshot?.nodes[renameNodeId] ? (
        <RenameNodeModal
          initialName={storeSnapshot.nodes[renameNodeId].name}
          onClose={() => setRenameNodeId(null)}
          onSave={async (name) => {
            await handleTreeRenameSave(name);
          }}
        />
      ) : null}

      {globalSearchOpen ? (
        <div
          className="nodeDetailModalBackdrop"
          role="presentation"
          onMouseDown={() => setGlobalSearchOpen(false)}
        >
          <div
            className="nodeDetailModal globalSearchModal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="nodeDetailModalTitle">全局搜索</div>
            <div className="nodeDetailModalHint">
              按文件名筛选扩展名为 .md / .markdown / .mdx 的文件（最多 200 条）
            </div>
            <input
              className="nodeDetailModalInput"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="输入文件名关键字…"
              autoFocus
            />
            <div className="globalSearchResults">
              {globalSearchMatches.length === 0 ? (
                <div className="emptyHint" style={{ padding: '8px 4px' }}>
                  {globalSearchQuery.trim()
                    ? '无匹配文件'
                    : '输入关键字开始搜索'}
                </div>
              ) : (
                globalSearchMatches.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="globalSearchResultRow"
                    onClick={() => {
                      setOpenFileIds((prev) =>
                        prev.includes(n.id) ? prev : prev.concat(n.id),
                      );
                      setActiveFileId(n.id);
                      setTreeSelectedId(n.id);
                      setUiPaneFocus('editor');
                      setGlobalSearchOpen(false);
                    }}
                  >
                    {n.name}
                  </button>
                ))
              )}
            </div>
            <div className="nodeDetailModalActions">
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                onClick={() => setGlobalSearchOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {externalAppDialogOpen ? (
        <div
          className="nodeDetailModalBackdrop"
          role="presentation"
          onMouseDown={() => setExternalAppDialogOpen(false)}
        >
          <div
            className="nodeDetailModal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="nodeDetailModalTitle">外部打开应用</div>
            <div className="nodeDetailModalHint">
              macOS：填写「应用程序」名称（例如 Typora、Visual Studio
              Code），将使用 <code>open -a</code> 打开当前文件。留空则使用系统默认应用。
            </div>
            <div className="nodeDetailModalField">
              <label
                className="nodeDetailModalLabelText"
                htmlFor="external-open-app"
              >
                应用名称
              </label>
              <input
                id="external-open-app"
                className="nodeDetailModalInput"
                value={externalAppDraft}
                onChange={(e) => setExternalAppDraft(e.target.value)}
                placeholder="例如：Typora"
              />
            </div>
            <div className="nodeDetailModalActions">
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                onClick={() => setExternalAppDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnPrimary"
                onClick={() => {
                  const t = externalAppDraft.trim();
                  setExternalOpenApp(t);
                  safeWriteLocalStorage(EXTERNAL_OPEN_APP_KEY, t);
                  setExternalAppDialogOpen(false);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createNodeNameDialog ? (
        <div
          className="nodeDetailModalBackdrop"
          role="presentation"
          onMouseDown={() => setCreateNodeNameDialog(null)}
        >
          <div
            className="nodeDetailModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-node-name-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="nodeDetailModalTitle" id="create-node-name-title">
              {createNodeNameDialog.kind === 'file' ? '新建文件' : '新建文件夹'}
            </div>
            <div className="nodeDetailModalHint">
              {createNodeNameDialog.kind === 'file'
                ? '可修改默认文件名；需包含扩展名（例如 .md）。若重名将自动追加序号。'
                : '可修改默认文件夹名。若重名将自动追加序号。'}
            </div>
            <div className="nodeDetailModalField">
              <label
                className="nodeDetailModalLabelText"
                htmlFor="create-node-name-input"
              >
                名称
              </label>
              <input
                id="create-node-name-input"
                ref={createNodeNameInputRef}
                className="nodeDetailModalInput"
                value={createNodeNameDialog.draftName}
                onChange={(e) =>
                  setCreateNodeNameDialog((prev) =>
                    prev ? { ...prev, draftName: e.target.value } : prev,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirmCreateNodeNameDialog();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setCreateNodeNameDialog(null);
                  }
                }}
              />
            </div>
            <div className="nodeDetailModalActions">
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                onClick={() => setCreateNodeNameDialog(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnPrimary"
                onClick={() => void confirmCreateNodeNameDialog()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createProjectDialogOpen ? (
        <div className="nodeDetailModalBackdrop" role="presentation">
          <div className="nodeDetailModal" role="dialog" aria-modal="true">
            <div className="nodeDetailModalTitle">新建项目</div>
            <div className="nodeDetailModalHint">
              请选择项目文件夹地址与项目图标，然后确认创建。
            </div>

            <div className="nodeDetailModalField">
              <label className="nodeDetailModalLabelText" htmlFor="project-root">
                项目文件夹
              </label>
              <input
                id="project-root"
                className="nodeDetailModalInput"
                value={createProjectRootPath}
                readOnly
                placeholder="请选择文件夹地址"
              />
              <div className="createProjectRowActions">
                <button
                  type="button"
                  className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                  onClick={() => {
                    handlePickCreateProjectRoot().catch(() => {
                      /* no-op */
                    });
                  }}
                >
                  浏览文件夹
                </button>
              </div>
            </div>

            <div className="nodeDetailModalField">
              <label className="nodeDetailModalLabelText">项目图标</label>
              <div className="iconPickerGrid">
                {ICON_OPTIONS.map((IconComponent, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`iconPickerItem ${createProjectIconIndex === index ? 'selected' : ''}`}
                    onClick={() => {
                      setCreateProjectIconIndex(index);
                      setCreateProjectIconPath('');
                    }}
                    title={`图标 ${index + 1}`}
                  >
                    <IconComponent size={20} />
                  </button>
                ))}
              </div>
            </div>

            {createProjectError ? (
              <div className="nodeDetailModalHint createProjectError">
                {createProjectError}
              </div>
            ) : null}

            <div className="nodeDetailModalActions">
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                onClick={() => setCreateProjectDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnPrimary"
                onClick={() => {
                  handleConfirmCreateProject().catch(() => {
                    /* errors surfaced via loadTreeError */
                  });
                }}
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editProjectDialogOpen ? (
        <div className="nodeDetailModalBackdrop" role="presentation">
          <div className="nodeDetailModal" role="dialog" aria-modal="true">
            <div className="nodeDetailModalTitle">编辑项目</div>
            <div className="nodeDetailModalHint">
              修改项目信息
            </div>

            <div className="nodeDetailModalField">
              <label className="nodeDetailModalLabelText" htmlFor="edit-project-name">
                项目名称
              </label>
              <input
                id="edit-project-name"
                className="nodeDetailModalInput"
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
                placeholder="输入项目名称"
              />
            </div>

            <div className="nodeDetailModalField">
              <label className="nodeDetailModalLabelText" htmlFor="edit-project-description">
                项目描述
              </label>
              <input
                id="edit-project-description"
                className="nodeDetailModalInput"
                value={editProjectDescription}
                onChange={(e) => setEditProjectDescription(e.target.value)}
                placeholder="输入项目描述（可选）"
              />
            </div>

            <div className="nodeDetailModalField">
              <label className="nodeDetailModalLabelText">项目图标</label>
              <div className="iconPickerGrid">
                {ICON_OPTIONS.map((IconComponent, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`iconPickerItem ${editProjectIconIndex === index ? 'selected' : ''}`}
                    onClick={() => setEditProjectIconIndex(index)}
                    title={`图标 ${index + 1}`}
                  >
                    <IconComponent size={20} />
                  </button>
                ))}
              </div>
            </div>

            <div className="nodeDetailModalActions">
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
                onClick={() => setEditProjectDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="nodeDetailModalBtn nodeDetailModalBtnPrimary"
                onClick={() => {
                  if (editProjectIconIndex !== null) {
                    setProjectIconPath(`icon:${editProjectIconIndex}`);
                  } else {
                    setProjectIconPath(null);
                  }
                  if (storeSnapshot?.rootPath) {
                    const stored = safeReadLocalStorage(`project:${storeSnapshot.rootPath}`);
                    let data = {};
                    if (stored) {
                      try {
                        data = JSON.parse(stored);
                      } catch { /* ignore */ }
                    }
                    const newData = {
                      ...data,
                      name: editProjectName.trim() || projectDisplayName,
                      description: editProjectDescription.trim(),
                      iconIndex: editProjectIconIndex,
                    };
                    safeWriteLocalStorage(`project:${storeSnapshot.rootPath}`, JSON.stringify(newData));
                  }
                  setEditProjectDialogOpen(false);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editDetailNodeId && storeSnapshot?.nodes[editDetailNodeId] ? (
        <NodeDetailModal
          nodeName={storeSnapshot.nodes[editDetailNodeId].name}
          initialRemark={storeSnapshot.nodes[editDetailNodeId].remark ?? ''}
          initialMark={storeSnapshot.nodes[editDetailNodeId].mark ?? ''}
          onClose={() => setEditDetailNodeId(null)}
          onSave={(remark, mark) => {
            storeRef.current?.setNodeDetail(editDetailNodeId, { remark, mark });
            commitSnapshot();
            setEditDetailNodeId(null);
          }}
        />
      ) : null}

      {tabHoverTip
        ? createPortal(
            <div
              className="tabHoverPop"
              style={{
                position: 'fixed',
                left: tabHoverTip.left,
                top: tabHoverTip.top,
                minWidth: tabHoverTip.minWidth,
              }}
              role="tooltip"
              onMouseEnter={clearTabHoverHideTimer}
              onMouseLeave={hideTabHoverTip}
            >
              <div className="tabHoverPopRow">
                <span className="tabHoverPopLabel">文件名</span>
                <span className="tabHoverPopValue tabHoverPopName">
                  {tabHoverTip.name}
                </span>
              </div>
              {tabHoverTip.remark ? (
                <div className="tabHoverPopRow">
                  <span className="tabHoverPopLabel">备注</span>
                  <span className="tabHoverPopValue tabHoverPopRemark">
                    {tabHoverTip.remark}
                  </span>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {storeSnapshot ? null : (
        <div className="emptyHint" style={{ padding: '20px', textAlign: 'center' }}>
          暂无打开的项目，请点击左上角切换项目按钮打开或创建项目
        </div>
      )}
    </div>
  );
}
