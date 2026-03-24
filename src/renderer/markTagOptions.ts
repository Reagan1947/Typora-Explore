/** 持久化在 `node.mark`：空字符串或 #RRGGBB（与 Figma 高亮标记一致） */

export type MarkTagOption = {
  value: string;
  label: string;
};

export const MARK_TAG_OPTIONS: readonly MarkTagOption[] = [
  { value: '', label: '无' },
  { value: '#E9524D', label: '红' },
  { value: '#F5A623', label: '橙' },
  { value: '#F8E71C', label: '黄' },
  { value: '#7ED321', label: '绿' },
  { value: '#50E3C2', label: '青' },
  { value: '#4A90E2', label: '蓝' },
  { value: '#9013FE', label: '紫' },
  { value: '#BD10E0', label: '品红' },
  { value: '#8B9AAB', label: '灰' },
] as const;

const PRESET_VALUES = new Set(
  MARK_TAG_OPTIONS.map((o) => o.value).filter(Boolean),
);

export function isHexMarkColor(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

export function isPresetMarkValue(s: string): boolean {
  return PRESET_VALUES.has(s.trim());
}

/** 树行展示：已知十六进制 → 色点；否则视为旧版文字标记 */
export function getMarkDisplay(
  mark: string | undefined,
): { type: 'dot'; hex: string } | { type: 'legacy'; text: string } | null {
  const raw = mark?.trim();
  if (!raw) return null;
  if (isHexMarkColor(raw)) return { type: 'dot', hex: raw };
  return { type: 'legacy', text: raw };
}
