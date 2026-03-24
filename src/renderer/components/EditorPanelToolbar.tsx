import { useEffect, useRef, useState } from 'react';
import { AiOutlineExport } from 'react-icons/ai';
import { HiOutlineViewColumns } from 'react-icons/hi2';
import { IoChevronDown } from 'react-icons/io5';
import { VscSymbolNumeric } from 'react-icons/vsc';

export type EditorViewMode = 'edit' | 'preview' | 'split';

type Props = {
  canOpenExternal: boolean;
  showLineNumbers: boolean;
  viewMode: EditorViewMode;
  hasOpenTabs: boolean;
  onOpenExternal: () => void;
  onToggleLineNumbers: () => void;
  onViewModeChange: (mode: EditorViewMode) => void;
  onCloseAllTabs: () => void;
  onCloseAllTabsAndSave: () => void;
};

export default function EditorPanelToolbar(props: Props) {
  const {
    canOpenExternal,
    showLineNumbers,
    viewMode,
    hasOpenTabs,
    onOpenExternal,
    onToggleLineNumbers,
    onViewModeChange,
    onCloseAllTabs,
    onCloseAllTabsAndSave,
  } = props;

  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [closeMenuOpen, setCloseMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewMenuOpen && !closeMenuOpen) return undefined;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setViewMenuOpen(false);
        setCloseMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [viewMenuOpen, closeMenuOpen]);

  const viewModeAria: Record<EditorViewMode, string> = {
    edit: '仅编辑',
    preview: '仅预览',
    split: '分栏',
  };

  return (
    <div className="editorPanelToolbar" ref={wrapRef}>
      <button
        type="button"
        className="exploreIconBtn editorToolbarBtn"
        aria-label="使用外部应用打开当前文件"
        disabled={!canOpenExternal}
        onClick={onOpenExternal}
      >
        <AiOutlineExport className="exploreToolbarIcon" />
      </button>

      <span className="editorToolbarSep" aria-hidden="true" />

      <button
        type="button"
        className="exploreIconBtn editorToolbarBtn"
        aria-label={showLineNumbers ? '隐藏行号' : '显示行号'}
        aria-pressed={showLineNumbers}
        onClick={onToggleLineNumbers}
      >
        <VscSymbolNumeric className="exploreToolbarIcon" />
      </button>

      <span className="editorToolbarSep" aria-hidden="true" />

      <div className="editorPanelToolbarMenuWrap">
        <button
          type="button"
          className="exploreIconBtn editorToolbarBtn"
          aria-label={`视图模式（当前：${viewModeAria[viewMode]}），打开菜单`}
          aria-expanded={viewMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setCloseMenuOpen(false);
            setViewMenuOpen((o) => !o);
          }}
        >
          <HiOutlineViewColumns className="exploreToolbarIcon" />
        </button>
        {viewMenuOpen ? (
          <div className="editorPanelToolbarMenu" role="menu">
            <button
              type="button"
              className="editorPanelToolbarMenuItem"
              role="menuitem"
              onClick={() => {
                onViewModeChange('edit');
                setViewMenuOpen(false);
              }}
            >
              仅编辑
            </button>
            <button
              type="button"
              className="editorPanelToolbarMenuItem"
              role="menuitem"
              onClick={() => {
                onViewModeChange('preview');
                setViewMenuOpen(false);
              }}
            >
              仅 Markdown 预览
            </button>
            <button
              type="button"
              className="editorPanelToolbarMenuItem"
              role="menuitem"
              onClick={() => {
                onViewModeChange('split');
                setViewMenuOpen(false);
              }}
            >
              编辑与预览
            </button>
          </div>
        ) : null}
      </div>

      <span className="editorToolbarSep" aria-hidden="true" />

      <div className="editorPanelToolbarMenuWrap">
        <button
          type="button"
          className="exploreIconBtn editorToolbarBtn"
          aria-label="关闭页签菜单"
          aria-expanded={closeMenuOpen}
          aria-haspopup="menu"
          disabled={!hasOpenTabs}
          onClick={() => {
            setViewMenuOpen(false);
            setCloseMenuOpen((o) => !o);
          }}
        >
          <IoChevronDown className="exploreToolbarIcon" />
        </button>
        {closeMenuOpen ? (
          <div className="editorPanelToolbarMenu" role="menu">
            <button
              type="button"
              className="editorPanelToolbarMenuItem"
              role="menuitem"
              onClick={() => {
                onCloseAllTabs();
                setCloseMenuOpen(false);
              }}
            >
              关闭所有页签
            </button>
            <button
              type="button"
              className="editorPanelToolbarMenuItem"
              role="menuitem"
              onClick={() => {
                onCloseAllTabsAndSave();
                setCloseMenuOpen(false);
              }}
            >
              关闭并保存所有页签
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
