# Typora Explore

基于 **Electron** 的 Markdown 笔记与项目管理桌面应用：在本地文件夹上以**文件树**组织文档，使用 **CodeMirror 6** 编辑、**Marked** 预览，主进程负责目录扫描、文件监听与磁盘操作。界面风格参考 JetBrains IDEA 深色主题。

> 工程脚手架来自 [Electron React Boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate)（Webpack 5 + React 19 + TypeScript）。

## 功能概览

- **项目根目录**：选择本地文件夹作为工作区，记住上次打开路径（`localStorage`）。
- **文件树**：展开/折叠、选中打开、多标签编辑；侧栏宽度可调，可隐藏树或编辑区。
- **编辑与预览**：Markdown 源码编辑与预览切换；行号显示可配置；⌘S / Ctrl+S 保存当前文件。
- **树内操作**：新建文件/文件夹、重命名、删除、复制/粘贴、拖拽调整顺序与层级（[@dnd-kit](https://dndkit.com/)）。
- **元数据**：为节点设置备注（页签 hover 查看）、颜色标记等（详见 `doc/` 需求说明）。
- **外部打开**：可将文件用系统默认应用打开（可配置）。
- **热更新开发**：渲染进程 Webpack Dev Server + 主进程 watch（`npm start`）。

更完整的产品与交互说明见：

- [`doc/global_info/需求概述.md`](doc/global_info/需求概述.md)
- [`doc/requirements/文件树需求详细.md`](doc/requirements/文件树需求详细.md)

## 环境要求

- **Node.js** ≥ 14（建议当前 LTS，如 20.x）
- **npm** ≥ 7

## 安装与运行

```bash
git clone https://github.com/Reagan1947/Typora-Explore.git
cd Typora-Explore
npm install
```

`postinstall` 会执行原生依赖安装与 `build:dll`，首次安装可能较慢。

**开发模式**（会先检查端口占用，再编译主进程并启动渲染 dev server）：

```bash
npm start
```

**生产构建**（主进程 + 渲染）：

```bash
npm run build
```

**打安装包**（当前平台，输出在 `release/build`）：

```bash
npm run package
```

**其他常用命令**

| 命令 | 说明 |
|------|------|
| `npm test` | Jest 单测 |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run rebuild` | 对 `release/app` 下的原生模块执行 electron-rebuild |

## 目录结构（简要）

| 路径 | 说明 |
|------|------|
| `src/main/` | Electron 主进程：`main.ts`、菜单、工程树扫描、文件夹监听、`preload` |
| `src/renderer/` | React 界面：文件树、编辑器、预览、工具栏、状态 store |
| `release/app/` | 随应用打包的 `package.json` 与生产依赖（含原生模块时由 electron-builder 处理） |
| `.erb/` | ERB 构建脚本与 Webpack 配置（**须纳入版本控制**，否则 `npm install` 会失败） |
| `assets/` | 图标、macOS 权限描述等打包资源 |
| `doc/` | 需求与设计文档 |

## 技术栈

- **桌面**：Electron 35、electron-builder、electron-updater（可选自动更新）
- **界面**：React 19、React Router 7、Sass
- **Markdown**：CodeMirror 6（`@codemirror/lang-markdown` 等）、marked
- **构建**：Webpack 5、ts-node、TypeScript 5.8

## 常见问题

- **`Cannot find module './check-native-dep.js'`**  
  表示项目根目录缺少 `.erb/`。请从本仓库拉取完整代码，或从 [electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate) 拷贝 `.erb` 目录后再执行 `npm install`。

- **`productName` / `appId` 仍为模板值**  
  可在 `package.json` 的 `build` 字段中改为你的产品名称与唯一 ID，再执行打包。

## 许可证

MIT（与上游 Electron React Boilerplate 一致；若你修改了 `LICENSE` 或版权信息，以仓库内实际文件为准。）
