import React, { useEffect, useRef, useState } from 'react';

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- backdrop click to close */

type Props = {
  initialName: string;
  onSave: (newName: string) => void | Promise<void>;
  onClose: () => void;
};

export default function RenameNodeModal(props: Props) {
  const { initialName, onSave, onClose } = props;
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [initialName]);

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
        aria-labelledby="renameNodeModalTitle"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="renameNodeModalTitle" className="nodeDetailModalTitle">
          重命名
        </h2>

        <div className="nodeDetailModalField">
          <span className="nodeDetailModalLabelText">名称</span>
          <input
            ref={inputRef}
            id="renameNodeInput"
            className="nodeDetailModalInput"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                Promise.resolve(onSave(name.trim())).catch(() => {});
              }
            }}
          />
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
            onClick={() => {
              Promise.resolve(onSave(name.trim())).catch(() => {});
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
