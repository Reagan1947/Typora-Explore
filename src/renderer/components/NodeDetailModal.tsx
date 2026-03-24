import React, { useEffect, useState } from 'react';
import {
  MARK_TAG_OPTIONS,
  isHexMarkColor,
  isPresetMarkValue,
} from '../markTagOptions';

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- backdrop click to close */

type Props = {
  nodeName: string;
  initialRemark: string;
  initialMark: string;
  onSave: (remark: string, mark: string) => void;
  onClose: () => void;
};

export default function NodeDetailModal(props: Props) {
  const { nodeName, initialRemark, initialMark, onSave, onClose } = props;
  const [remark, setRemark] = useState(initialRemark);
  const [mark, setMark] = useState(initialMark);

  useEffect(() => {
    setRemark(initialRemark);
    setMark(initialMark);
  }, [initialRemark, initialMark, nodeName]);

  const showCustomSwatch =
    Boolean(mark) && isHexMarkColor(mark) && !isPresetMarkValue(mark);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="nodeDetailModalBackdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="nodeDetailModal"
        role="dialog"
        aria-labelledby="nodeDetailModalTitle"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="nodeDetailModalTitle" className="nodeDetailModalTitle">
          备注与标记
        </h2>
        <p className="nodeDetailModalPath">{nodeName}</p>

        <div className="nodeDetailModalField">
          <span className="nodeDetailModalLabelText">备注</span>
          <textarea
            id="nodeDetailRemark"
            className="nodeDetailModalTextarea"
            rows={3}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="显示在文件名之后"
          />
        </div>

        <div className="nodeDetailModalField">
          <span className="nodeDetailModalLabelText">标记</span>
          <p className="nodeDetailModalHint">
            选择高亮颜色，在文件树行末显示为小圆点
          </p>
          <div
            className="nodeDetailModalMarkGrid"
            role="group"
            aria-label="标记颜色"
          >
            {showCustomSwatch ? (
              <button
                type="button"
                key="__custom__"
                className="nodeDetailModalMarkBtn nodeDetailModalMarkBtnSelected"
                aria-label="已保存的自定义颜色"
                aria-pressed
                onClick={() => setMark(mark)}
                title={mark}
              >
                <span
                  className="nodeDetailModalMarkDot"
                  style={{ backgroundColor: mark }}
                />
              </button>
            ) : null}
            {MARK_TAG_OPTIONS.map((opt) => {
              const selected = mark === opt.value;
              return (
                <button
                  key={opt.value || 'none'}
                  type="button"
                  className={[
                    'nodeDetailModalMarkBtn',
                    selected ? 'nodeDetailModalMarkBtnSelected' : '',
                    opt.value === '' ? 'nodeDetailModalMarkBtnNone' : '',
                  ].join(' ')}
                  aria-label={opt.label}
                  aria-pressed={selected}
                  onClick={() => setMark(opt.value)}
                  title={opt.label}
                >
                  {opt.value === '' ? (
                    <span className="nodeDetailModalMarkNoneIcon" aria-hidden />
                  ) : (
                    <span
                      className="nodeDetailModalMarkDot"
                      style={{ backgroundColor: opt.value }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {mark && !isHexMarkColor(mark) ? (
            <p className="nodeDetailModalLegacyHint">
              当前为旧版文字标记，选择上方颜色后将改为色点；不选则保留原文字。
            </p>
          ) : null}
        </div>

        <div className="nodeDetailModalActions">
          <button
            type="button"
            className="nodeDetailModalBtn nodeDetailModalBtnSecondary"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="nodeDetailModalBtn nodeDetailModalBtnPrimary"
            onClick={() => onSave(remark.trim(), mark.trim())}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
