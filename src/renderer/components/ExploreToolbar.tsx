import React, { useEffect, useRef, useState } from 'react';
import {
  MdAdd,
  MdFilterCenterFocus,
  MdUnfoldMore,
  MdUnfoldLess,
} from 'react-icons/md';

type Props = {
  disabled: boolean;
  treeFilter: string;
  onTreeFilterChange: (value: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onFocusActiveFile: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function ExploreToolbar(props: Props) {
  const {
    disabled,
    treeFilter,
    onTreeFilterChange,
    onNewFile,
    onNewFolder,
    onFocusActiveFile,
    onExpandAll,
    onCollapseAll,
  } = props;

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!newMenuOpen) return undefined;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [newMenuOpen]);

  return (
    <div className="exploreToolbar" ref={wrapRef}>
      <div className="exploreToolbarInner">
        <div className="exploreToolbarGroup exploreToolbarGroupNew">
          <button
            type="button"
            className="exploreIconBtn"
            aria-label="新建"
            aria-expanded={newMenuOpen}
            aria-haspopup="menu"
            disabled={disabled}
            onClick={() => setNewMenuOpen((o) => !o)}
          >
            <MdAdd className="exploreToolbarIcon" />
          </button>
        </div>

        <button
          type="button"
          className="exploreIconBtn"
          aria-label="聚焦当前预览文件"
          title="聚焦当前预览文件"
          disabled={disabled}
          onClick={onFocusActiveFile}
        >
          <MdFilterCenterFocus className="exploreToolbarIcon" />
        </button>

        <button
          type="button"
          className="exploreIconBtn"
          aria-label="展开全部文件夹"
          title="展开全部"
          disabled={disabled}
          onClick={onExpandAll}
        >
          <MdUnfoldMore className="exploreToolbarIcon" />
        </button>

        <button
          type="button"
          className="exploreIconBtn"
          aria-label="收缩全部文件夹"
          title="收缩全部"
          disabled={disabled}
          onClick={onCollapseAll}
        >
          <MdUnfoldLess className="exploreToolbarIcon" />
        </button>
      </div>

      {newMenuOpen ? (
        <div className="exploreNewMenu" role="menu">
          <div className="exploreNewMenuSearchRow">
            <input
              className="exploreNewMenuSearch"
              type="search"
              placeholder="搜索文件树…"
              value={treeFilter}
              onChange={(e) => onTreeFilterChange(e.target.value)}
              role="searchbox"
              aria-label="搜索文件树"
            />
          </div>
          <button
            type="button"
            className="exploreNewMenuItem"
            role="menuitem"
            onClick={() => {
              onNewFile();
              setNewMenuOpen(false);
            }}
          >
            新建文件
          </button>
          <button
            type="button"
            className="exploreNewMenuItem"
            role="menuitem"
            onClick={() => {
              onNewFolder();
              setNewMenuOpen(false);
            }}
          >
            新建文件夹
          </button>
        </div>
      ) : null}
    </div>
  );
}
