interface WelcomePageProps {
  onOpenProject: () => void;
  onCreateProject: () => void;
}

const WELCOME_MARKDOWN = `欢迎使用 Typora Explore!

> Typora Explore 希望能帮助您更高效的管理您的 Markdown 文档资源。

## 1.1 项目管理

### 1.1.1 从系统磁盘导入您的 Markdown 文件项目

您可以十分轻松的通过左上角的项目管理入口, 方便的导入您本地的 Markdown 文件项目, 顶层的文件夹名称将作为您的项目名称。与此同时您可以自定义您喜欢的项目图标。

### 1.1.2 新建项目

当然您也可以立即新建一个 Markdown 文件项目。并设置您想存储该项目的位置。

## 1.2 文件树管理

### 1.2.1 自由排序您的文件以及文件夹

您可以自由的排序您的文件夹和文件信息, 这将与您的本地磁盘同步。但是同级文件夹和同级文件之间的排序并不会同步到本地磁盘。

### 1.2.2 备注与标记

您可以为您的文件或文件夹设置任意的备注信息或颜色标注。这些信息将通过持久化元数据的方式跟随您的项目文件。不用担心您的备注或标记信息丢失。

## 1.3 Markdown 编辑与预览

### 1.3.1 Markdown 编辑

您可以使用 Typora Explore 进行简单的 Markdown 文件编辑。但是我们强烈建议您不要通过 Markdown Explore 编辑您的 Markdown 文件。这不是我们设计这个应用程序的初衷。==我们希望您仅通过 Typora Explore 管理您的 Markdown 文件。== 若您想要编辑您的 Markdown 文件, 可以使用在外部引用中打开, 例如使用 Typora 打开以进行编辑工作。

### 1.3.2 Markdown 预览

Markdown Explore 页提供简单的预览功能。当然这仅作为效果参考。这并不是我们应用的功能重点。

## 反馈与其他

我们十分欢迎您提交您在使用过程中遇到的问题, 或是功能建议。您可以通过提交 [Github ISSUE](https://github.com/Reagan1947/Typora-Explore/issues) 的方式提交您的反馈信息。`;

export default function WelcomePage({ onOpenProject, onCreateProject }: WelcomePageProps) {
  return (
    <div className="welcomePage">
      <div className="welcomePageContent">
        <div className="welcomeMain">
          <div className="welcomeHeader">
            <h1 className="welcomeTitle">欢迎使用 Typora Explore!</h1>
            <p className="welcomeSubtitle">
              Typora Explore 希望能帮助您更高效的管理您的 Markdown 文档资源。
            </p>
          </div>

          <div className="welcomeActions">
            <button
              type="button"
              className="welcomeActionBtn welcomeActionBtnPrimary"
              onClick={onOpenProject}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              打开已有项目
            </button>
            <button
              type="button"
              className="welcomeActionBtn welcomeActionBtnSecondary"
              onClick={onCreateProject}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              新建项目
            </button>
          </div>

          <div className="welcomeGuide">
            <div className="welcomeGuideSection">
              <div className="welcomeGuideCards">
                <div className="welcomeGuideCard">
                  <div className="welcomeGuideCardIcon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <div className="welcomeGuideCardContent">
                    <h3>项目管理</h3>
                    <p>导入本地 Markdown 项目或创建新项目，自定义项目图标</p>
                  </div>
                </div>
                <div className="welcomeGuideCard">
                  <div className="welcomeGuideCardIcon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6"/>
                      <line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/>
                      <line x1="3" y1="6" x2="3.01" y2="6"/>
                      <line x1="3" y1="12" x2="3.01" y2="12"/>
                      <line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  </div>
                  <div className="welcomeGuideCardContent">
                    <h3>文件树管理</h3>
                    <p>自由排序文件和文件夹，设置备注与颜色标记</p>
                  </div>
                </div>
                <div className="welcomeGuideCard">
                  <div className="welcomeGuideCardIcon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                  <div className="welcomeGuideCardContent">
                    <h3>编辑与预览</h3>
                    <p>使用 CodeMirror 编辑，支持实时预览</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="welcomeTip">
              <strong>温馨提示：</strong> 我们建议您使用 Typora 等专业编辑器来编辑 Markdown 文件，Typora Explore 主要用于管理您的 Markdown 文档资源。
            </div>
          </div>
        </div>

        <div className="welcomeFooter">
          <a
            href="https://github.com/Reagan1947/Typora-Explore/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="welcomeFooterLink"
          >
            提交问题反馈
          </a>
          <span className="welcomeFooterSep">|</span>
          <a
            href="https://github.com/Reagan1947/Typora-Explore"
            target="_blank"
            rel="noopener noreferrer"
            className="welcomeFooterLink"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

export { WELCOME_MARKDOWN };
