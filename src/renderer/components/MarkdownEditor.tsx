import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  RangeSet,
} from '@codemirror/state';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  GutterMarker,
  gutterLineClass,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';

const readOnlyCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();

/** 程序化替换全文时不应触发 onChange（避免误标脏） */
const externalDocSync = Annotation.define<boolean>();

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 折叠 gutter：`open === true` 表示可折叠（当前展开），`false` 表示已折叠可展开。
 * 与 codemirror `basicSetup` 中 `foldGutter()` 行为一致，仅替换为 SVG 图标。
 */
function foldGutterMarkerDOM(open: boolean): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'cm-foldGutterIcon';
  wrap.title = open ? '折叠' : '展开';
  wrap.setAttribute('role', 'presentation');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.25');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS(SVG_NS, 'path');
  if (open) {
    path.setAttribute('d', 'M6 9l6 6 6-6');
  } else {
    path.setAttribute('d', 'M9 18l6-6-6-6');
  }
  svg.appendChild(path);
  wrap.appendChild(svg);
  return wrap;
}

/** 选区（含仅光标）所涉每一行的行号 gutter 加此类，样式见 shellTheme */
const SelectionLineGutterMarkerClass = class extends GutterMarker {
  elementClass = 'cm-selectionLineGutter';

  // eslint-disable-next-line class-methods-use-this -- GutterMarker 接口要求
  eq(other: GutterMarker): boolean {
    return other instanceof SelectionLineGutterMarkerClass;
  }
};

const selectionLineGutterMarker = new SelectionLineGutterMarkerClass();

const selectionLineNumberGutter = gutterLineClass.compute(
  ['selection'],
  (state) => {
    const marks: ReturnType<typeof selectionLineGutterMarker.range>[] = [];
    const seen = new Set<number>();
    state.selection.ranges.forEach((range) => {
      const fromLine = state.doc.lineAt(range.from);
      const toLine = state.doc.lineAt(range.to);
      const lineCount = toLine.number - fromLine.number + 1;
      Array.from({ length: lineCount }, (_, i) => fromLine.number + i).forEach(
        (num) => {
          const line = state.doc.line(num);
          if (!seen.has(line.from)) {
            seen.add(line.from);
            marks.push(selectionLineGutterMarker.range(line.from));
          }
        },
      );
    });
    marks.sort((a, b) => a.from - b.from);
    return RangeSet.of(marks);
  },
);

/** 与 `codemirror` 包 `basicSetup` 一致，仅 `foldGutter` 使用图标；行号由 `lineNumbersCompartment` 控制。 */
const markdownEditorCoreSetup = [
  highlightSpecialChars(),
  history(),
  foldGutter({ markerDOM: foldGutterMarkerDOM }),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  EditorView.lineWrapping,
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
] as const;

const shellTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--panel)',
    },
    '.cm-scroller': {
      fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        "Liberation Mono", "Courier New", monospace`,
      fontSize: '12px',
      lineHeight: '20px',
      backgroundColor: 'var(--panel)',
      // 垂直留白只放在 scroller，避免 gutter 与正文行框各算一套 padding 导致错位
      paddingTop: '10px',
      paddingBottom: '10px',
    },
    '.cm-content': {
      caretColor: 'var(--text)',
      padding: 0,
    },
    '.cm-line': {
      lineHeight: '20px',
    },
    '.cm-gutterElement': {
      lineHeight: '20px',
    },
    '.cm-gutters': {
      // 压过 @codemirror/view baseTheme 中 &dark .cm-gutters（#333338）的层叠顺序
      backgroundColor: '#2c2d30 !important',
      color: 'rgba(188, 190, 196, 0.45)',
      border: 'none !important',
      padding: 0,
    },
    '.cm-lineNumbers .cm-gutterElement.cm-selectionLineGutter': {
      color: '#ffffff !important',
      fontWeight: '600',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--text)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(74, 136, 199, 0.35) !important',
    },
    '.cm-foldGutter .cm-foldGutterIcon': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '14px',
      height: '20px',
      opacity: 0,
      verticalAlign: 'middle',
      transition: 'opacity 0.12s ease',
    },
    // 鼠标在行号区（整块 .cm-gutters，含行号列与折叠列）时，显示全部折叠指示器
    '.cm-gutters:hover .cm-foldGutter .cm-foldGutterIcon': {
      opacity: 0.72,
    },
    '.cm-foldGutter .cm-foldGutterIcon svg': {
      display: 'block',
    },
    // 覆盖 @codemirror/language baseTheme 中 .cm-foldPlaceholder 的灰底与边框
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent !important',
      border: 'none !important',
      borderRadius: 0,
      boxShadow: 'none',
      margin: 0,
      padding: 0,
      color: 'var(--muted)',
      cursor: 'pointer',
    },
  },
  { dark: true },
);

export type MarkdownEditorProps = {
  value: string;
  readOnly?: boolean;
  showLineNumbers?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
  /** 编辑器获得键盘焦点时（含 Tab 切入） */
  onFocus?: () => void;
  className?: string;
};

export interface EditorHandle {
  undo: () => void;
}

const MarkdownEditor = forwardRef<EditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(props, ref) {
  const {
    value,
    readOnly: readOnlyProp,
    showLineNumbers: showLineNumbersProp,
    onChange,
    onSave,
    onFocus,
    className,
  } = props;
  const readOnly = readOnlyProp ?? false;
  const showLineNumbers = showLineNumbersProp ?? true;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);

  onSaveRef.current = onSave;
  onChangeRef.current = onChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (!viewRef.current) return;
      undo(viewRef.current);
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbersCompartment.of(
          showLineNumbers ? [lineNumbers(), selectionLineNumberGutter] : [],
        ),
        ...markdownEditorCoreSetup,
        markdown(),
        syntaxHighlighting(oneDarkHighlightStyle),
        shellTheme,
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.domEventHandlers({
          focusin: () => {
            onFocusRef.current?.();
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || !onChangeRef.current) return;
          if (
            update.transactions.some((tr) => tr.annotation(externalDocSync))
          ) {
            return;
          }
          onChangeRef.current(update.state.doc.toString());
        }),
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
          ]),
        ),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; value/readOnly/showLineNumbers updated below
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(
        showLineNumbers ? [lineNumbers(), selectionLineNumberGutter] : [],
      ),
    });
  }, [showLineNumbers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalDocSync.of(true),
    });
  }, [value]);

  return <div ref={hostRef} className={className} />;
});

export default MarkdownEditor;
