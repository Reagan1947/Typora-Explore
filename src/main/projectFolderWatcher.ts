import path from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import log from 'electron-log';
import { rebuildProjectTreeFromDisk } from './projectTreeScan';

const DEBOUNCE_MS = 450;

type NotifyFn = (rootPath: string) => void;

export type ProjectFolderWatcherHandle = {
  setRoot: (rootPath: string | null) => void;
  stop: () => void;
};

/**
 * Watches the project root on disk; debounced full rescan + notify renderer.
 */
export default function createProjectFolderWatcher(
  notify: NotifyFn,
): ProjectFolderWatcherHandle {
  let watcher: FSWatcher | null = null;
  let watchedRoot: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRescan = false;

  const runDebouncedRescan = async (): Promise<void> => {
    if (!pendingRescan || !watchedRoot) return;
    pendingRescan = false;

    const root = watchedRoot;
    try {
      await rebuildProjectTreeFromDisk(root);
      notify(root);
    } catch (e) {
      log.error('[ProjectFolderWatcher] rescan failed', e);
    }
  };

  const stop = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingRescan = false;
    if (watcher) {
      watcher.close().catch((err) => {
        log.error('[ProjectFolderWatcher] close watcher', err);
      });
      watcher = null;
    }
    watchedRoot = null;
  };

  const setRoot = (rootPath: string | null): void => {
    const resolved = rootPath ? path.resolve(rootPath) : null;

    if (watchedRoot === resolved && watcher && resolved) {
      return;
    }

    stop();
    watchedRoot = resolved;

    if (!resolved) return;

    watcher = chokidar.watch(resolved, {
      ignoreInitial: true,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.DS_Store',
        /(^|[\\/])\../,
      ],
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    const schedule = () => {
      pendingRescan = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runDebouncedRescan().catch((err) => {
          log.error('[ProjectFolderWatcher] debounced rescan error', err);
        });
      }, DEBOUNCE_MS);
    };

    watcher.on('add', schedule);
    watcher.on('unlink', schedule);
    watcher.on('addDir', schedule);
    watcher.on('unlinkDir', schedule);
    watcher.on('error', (err) => {
      log.error('[ProjectFolderWatcher]', err);
    });
  };

  return { setRoot, stop };
}
