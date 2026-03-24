import { useMemo } from 'react';
import { parse } from 'marked';

type Props = {
  markdown: string;
  className?: string;
};

function MarkdownPreview(props: Props) {
  const { markdown, className } = props;

  const html = useMemo(() => {
    try {
      return parse(markdown, { async: false }) as string;
    } catch {
      return '<p class="markdownPreviewError">预览解析失败</p>';
    }
  }, [markdown]);

  return (
    <div
      className={['markdownPreview', className].filter(Boolean).join(' ')}
      // eslint-disable-next-line react/no-danger -- 本地 Markdown 预览
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

MarkdownPreview.defaultProps = {
  className: undefined,
};

export default MarkdownPreview;
