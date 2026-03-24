# Markdown 文件树实现方案设计

## 参考文档
- `doc/global_info/需求概述.md`
- `doc/requirements/文件树需求详细.md`

## 1. 目标与范围

### 目标
1. 支持文件树的展开/折叠、选择与编辑详情（备注/标记）。
2. 支持拖拽排序：同级“顺序调整”不需要同步到系统磁盘；跨文件夹/改变父子关系的移动需要同步到系统磁盘。
3. 支持右键操作：Rename、Delete、Copy、Paste。
4. 支持文件夹监控：系统磁盘发生新增/删除/重命名等变化时，同步到应用（并更新持久化）。
5. 支持“在文件系统中查看”。

### 非目标（本设计不展开）
1. 编辑器（CodeMirror）与内容写入策略（只约定文件内容从磁盘/持久化如何获取）。
2. 未来的 Git 集成、云同步、插件化等。

## 2. 同步边界（必须严格遵守）

1. 拖拽排序（自由排序）
   1. 仅改变同级顺序：不写磁盘，只更新“持久化文件”中的顺序。
   2. 改变父子关系或跨文件夹移动：写磁盘（move/rename），同时更新持久化。
   3. 禁止把文件夹拖入其自身或子孙文件夹。

2. 备注/标记（Edit Details）
   - 只更新持久化文件，不写磁盘。

3. 复制/粘贴
   - 必须写磁盘（深度克隆会创建新文件/目录/写内容），并更新持久化。
   - 命名冲突处理由系统自动完成（根据需求可实现：paste 生成 `copy` 后缀并在必要时累加数字）。

4. 重命名
   - 必须写磁盘，并更新持久化。
   - 同级不允许重名（以磁盘实际存在为准）。

5. 删除
   - 必须写磁盘；删除文件夹时递归删除子项。
   - 同步更新持久化；如果该文件在编辑器打开则需要关闭标签（由编辑器模块处理）。

6. 文件夹监控（chokidar）
   - 监听系统磁盘新增/删除/重命名等变化，并更新应用与持久化。
   - 磁盘上的“排序变化”不需要同步到应用（应用顺序永远以持久化为准）。

## 3. 推荐架构（Renderer / Main）

### Renderer（React）
1. `FileTree`：递归渲染文件/文件夹节点。
2. `TreeNodeRow`：单行展示（名称 + 备注 + 标记 + 右键菜单触发器）。
3. `useFileTreeState(projectId)`：管理当前项目的树状态（来自持久化 store + 服务器/IPC 的增量更新）。
4. DnD 交互（建议继续使用当前依赖 `@dnd-kit/*`）：产生拖拽意图并在成功后只更新本地顺序或发起磁盘同步命令（取决于同步边界）。
5. 与编辑器模块交互：点击节点打开标签页；删除节点关闭标签页。
6. 与 main 进程通信：发起磁盘写操作的 IPC 命令，并接收更新结果/刷新信号。

### Main（Electron 主进程）
1. 磁盘读写服务：创建/移动/重命名/删除文件与目录；读取文件内容（如需要）。
2. 目录监控服务：chokidar 监听目录变化并触发“扫描-对齐”逻辑。
3. IPC 入口：统一暴露“会写磁盘”的命令与“扫描/刷新”的查询。

## 4. 持久化数据模型（Project Store）

持久化 store 的职责：
1. 固化节点（id/name/type/parentId/diskPath）与层级关系。
2. 固化同级顺序：`orderByParentId[parentId] = childrenId[]`。
3. 固化节点详情：备注与标记（不在磁盘中存储）。

建议数据结构（示例）：

```ts
type NodeType = 'file' | 'folder';

type Node = {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null; // root 的 parentId 设为 null 或固定值
  diskPath: string; // 绝对路径，便于移动/重命名/监控对齐
  details?: {
    remark?: string;
    color?: number; // 0..7
  };
};

type ProjectStore = {
  version: 1;
  projectId: string;
  rootPath: string;
  nodes: Record<string, Node>;
  orderByParentId: Record<string, string[]>; // parentId -> childrenId[]
};
```

顺序策略：
1. renderer 展示顺序严格来自 `orderByParentId`。
2. 在文件夹监控对齐时，只更新结构（新增/删除/父子关系/重命名），不改顺序数组。

## 5. 拖拽排序实现方案（DnD to Sync Decision）

### 输入（DnD 结果）
假设 DnD 能输出：
1. `activeId`：被拖拽节点 id
2. `overId`：放置参照节点 id
3. `dropPosition`：语义为 `before | after | inside`

### 关键计算
1. `oldParentId = nodes[activeId].parentId`
2. 目标父节点 `newParentId`：
   - `inside`：newParentId = nodes[overId].id（前提：over 为 folder）
   - `before/after`：newParentId = nodes[overId].parentId
3. `isSameParent = newParentId === oldParentId`

### 校验：禁止文件夹拖入自身/子孙
当 `activeId` 是 folder 且 `newParentId` 为其后代时拒绝：
1. 从 `newParentId` 沿 parentId 追溯到 root
2. 若追溯链中出现 `activeId`，则不允许

### 同步决策
1. `isSameParent === true`
   - 更新 `orderByParentId[oldParentId]`：把 `activeId` 插入到目标位置（before/after/inside 在同级情况下都落为同级插入规则）
   - 不调用 main 的磁盘同步接口
2. `isSameParent === false`
   - 调用 main：执行磁盘移动/必要时更新磁盘路径
   - main 成功后，更新持久化中的 `parentId/diskPath`（并可触发 renderer 刷新）

### inside 的持久化插入规则（建议）
当拖入 inside 且父节点变化时：
1. 从 `oldParentId` 移除 `activeId`
2. 在 `newParentId` 对应的 `orderByParentId[newParentId]` 末尾插入 `activeId`

（若你未来希望 inside 也精确落在 over 节点前后，可扩展为计算“over 子项的插入 index”。当前设计优先可实现且稳定。）

### dnd-kit 具体实现细化（before/after/inside）

本节描述如何用 `@dnd-kit/core` + `@dnd-kit/sortable` 实现“文件树拖拽到 before/after/inside”，并把结果映射回上面第 5 节的同步决策。

#### 5.1 数据载荷：给每个可拖节点带上 parentId/type

每个节点行渲染时，`useSortable`（或 `useDraggable`）的 `id` 使用 `node.id`，同时在 `data` 中挂载：

- `nodeId`: string
- `parentId`: string | null
- `type`: `'file' | 'folder'`

这样在 `onDragOver/onDragEnd` 中可以直接拿到 `active` 与 `over` 的结构信息，从而计算 `oldParentId/newParentId` 与禁入校验（禁止文件夹拖入自身/子孙）。

#### 5.2 拖拽上下文与容器划分（每个父文件夹一个 SortableContext）

推荐把“同级列表”当成一个容器：

1. renderer 递归渲染文件树时，对每个“已展开的文件夹”渲染其 children 列表区域。
2. 对每个 children 列表，使用 `SortableContext`，`items` 来自持久化的 `orderByParentId[parentId]`（仅包含当前父文件夹的 children）。
3. 对于跨父节点拖拽：`onDragEnd` 不依赖 `SortableContext` 的内部索引，而是用上面第 5 节的逻辑按 `orderByParentId` 手动计算插入点；这能保证“跨层级移动”的语义完全可控。

这样做的效果：
- 同级 before/after 插入时，index 计算稳定且与持久化顺序一致
- 跨父节点移动时，dropPosition 仍能正确判断（inside/before/after），但真正的插入与同步由你在 `onDragEnd` 控制

#### 5.3 before/after 目标：用 over 节点的矩形中心判断

当 `overId` 指向“某个具体节点行”（file 或 folder 都行）时：

1. 取得指针位置（dnd-kit 会提供 `event` / 或可用 `active/over` rect 与最近一次 pointer 坐标）
2. 获取 `over` 节点的 DOMRect：`overRect.top + overRect.height / 2` 作为分界
3. 若指针 y < 分界，则 `dropPosition = 'before'`
4. 否则 `dropPosition = 'after'`

注意：这里的 before/after 只表示“在 `overId` 所属父节点的同级顺序中，放在它前/后”。

#### 5.4 inside 目标：给 folder 行增加“inside zone”（useDroppable）

仅用节点行整体作为 over 很难稳定地区分 inside/before/after。推荐做法是：

1. 对 folder 节点行（`type === 'folder'`）额外渲染一个内部区域（inside zone），例如：
   - folder 行中间区域（或整行但样式分区更明确）
   - inside zone 的高度可以固定（如 20px~40px），用于稳定判断
2. 给 inside zone 使用 `useDroppable({ id: folderId, data: { dropKind: 'inside' } })`
3. 在碰撞结果中，当 over 命中 inside zone 时：
   - `dropPosition = 'inside'`
   - `newParentId = folderId`

同时建议在视觉层面显示：
- `before/after`: 蓝色线条指示器（放在 over 节点上方/下方）
- `inside`: 蓝色边框指示器（包围在 folder inside zone 或 folder 容器区域）

#### 5.5 collision detection：优先命中 inside zone

为了让 inside zone 的优先级高于同一 folder 行的“before/after”逻辑：

1. 可使用 `pointerWithin`（通常对指针落点更友好）
2. 结合 `over.data.dropKind === 'inside'` 进行优先处理
3. 在 `onDragOver` 中计算 `dropPosition` 时，inside zone 命中优先返回 `inside`，其余情况才计算 before/after

> 如果你后续希望更进一步（例如拖入 folder 但指针在它上半部分时仍认为 inside），可以在 inside zone 的 DOMRect 上进一步调节阈值。

#### 5.6 onDragOver：实时计算 dropPosition 并更新拖拽指示器

`onDragOver({ active, over, event })` 做两件事：

1. 计算候选 drop 结果：
   - 命中 inside zone：`dropPosition='inside'`, `overId=folderId`
   - 命中普通节点行：`dropPosition='before'|'after'`, `overId=nodeId`
2. 禁入校验（只影响视觉与最终允许性）：
   - 若 `active.type === 'folder'` 且目标 `newParentId` 是它的后代，则标记为 `dropRejected=true`

拖拽指示器状态建议结构：

```ts
type DropIndicator =
  | { kind: 'before'|'after'; overId: string; parentId: string; index: number }
  | { kind: 'inside'; overId: string; parentId: string };
```

其中 `index` 对应“将 active 插入到 over 所属父节点 order 数组中的位置”：
- `before`: index = overIndex
- `after`: index = overIndex + 1

#### 5.7 onDragEnd：把 dnd-kit 结果映射到第 5 节同步决策

`onDragEnd` 内按以下顺序执行：

1. 若 `over` 为 null：取消（或回滚 UI）
2. 读取 `active` 与 `over` 的 `data`，得到：
   - `activeId`, `active.type`, `oldParentId`
   - `newParentId` 与 `dropPosition`（inside/before/after）
3. 执行禁入校验：
   - 文件夹拖入自身/子孙：直接拒绝并回滚（必要时给用户提示）
4. 计算 `isSameParent`：
   - 若 same parent：只更新 `orderByParentId`（不调用 main）
   - 若不同 parent：调用 main 执行磁盘 move，并在成功后更新持久化 `parentId/diskPath`

至此，你就实现了：
- UI 拖拽体验：实时指示 before/after/inside
- 语义一致性：最终写入磁盘与否由 parentId 是否变化决定

#### 5.8 可选增强：悬停展开折叠文件夹

当你支持折叠文件夹（children 容器不渲染）时，为了让 inside 更好用：

1. 在 `onDragOver` 检测到指针 hover 到“折叠文件夹”的 folder 行时
2. 通过 `setTimeout` 延迟（如 500~800ms）自动展开该文件夹
3. 如果指针离开或最终 drop 被拒绝，则取消定时器

这会显著降低用户把节点拖进深层折叠文件夹时的操作成本。

#### 5.9（可选）拍平树 + 投影层级（更接近 VSCode/Finder 的横向调整）

`文件树技术参考.md` 提供了一个更“真实树拖拽”的实现思路：把当前可见树拍平成一维列表，然后通过“横向拖动距离”推算目标层级（depth），从而得到 `newParentId`。这能让用户不必依赖单独的 inside zone，而是像 VSCode 一样通过左右移动改变父子关系。

这部分是“可选增强”：即便你仍保留 5.4/5.5 的 inside zone，也可以把它作为另一种输入方式（命中 inside zone 优先，否则走投影）。

1. 把持久化 store 转为可拖拽数据（拍平）
   - 从 `ProjectStore.nodes + orderByParentId` 构建出“当前树的层级”
   - 使用 `flattenTree`（可按技术参考的伪代码实现）得到：
     - `id`
     - `parentId`
     - `type`
     - `depth`（缩进层级）
   - 注意：这里的“显示树”应基于 `expandedIds`（折叠状态），而不是把折叠写进 `ProjectStore`

2. 展开/折叠状态单独存（不要混进树结构）
   - 建议维护：
     - `expandedIds: Set<string>`
   - 渲染时仅显示展开路径上的节点
   - 若某个文件夹折叠，拖拽列表中需要隐藏它的后代，可在拍平结果上执行 `removeChildrenOf(flattened, collapsedIds)`

3. 横向拖动 -> 目标 depth（getProjection）
   - 计算：
     - `offsetLeft = event.delta.x`（或用 pointer 坐标差）
     - `indentationWidth`（每层缩进宽度，和 UI 缩进保持一致）
   - `projectedDepth = clamp(oldDepth + Math.round(offsetLeft / indentationWidth), 0, maxDepth)`
   - `projectedDepth` 决定新的父节点层级关系：
     - `projectedDepth === oldDepth`：说明仍同级（same parent）
     - `projectedDepth !== oldDepth`：说明发生父子关系变化（newParentId 需要重算）

4. 根据 projectedDepth 推导 newParentId
   - 参考技术参考中的思路：从当前 projected 位置往前找第一个 `depth === projectedDepth - 1` 的节点作为父节点
   - 该步骤最终得到 `newParentId`

5. before/after 仍由纵向位置决定
   - 当 `overId` 指向某个节点行时，结合指针 y 与该行的矩形中心：
     - 指针在上半区 => `before`
     - 指针在下半区 => `after`
   - 同级情况下 `before/after` 直接映射到 `orderByParentId` 的插入 index

6. moveTreeItem：更新拍平数组中的 depth/parentId（用于计算/预览）
   - `moveTreeItem(flattened, activeId, overId, projectedDepth)` 仅用于计算“拖拽投影后的结果”
   - 真正落库/落盘仍以 5.7 的同步决策为准：
     - `oldParentId === newParentId`：只更新持久化顺序，不调用 main
     - 否则：调用 main 做磁盘 move，并更新持久化 `parentId/diskPath`

7. 禁止拖入自身/子孙（强制校验）
   - 技术参考强调：拖入后代是非法的
   - 无论你是 inside zone 方式还是投影方式，最终在 onDragEnd 落库前都要做一次：
     - `activeId` 作为 folder 时，检查 `newParentId` 是否为其后代
   - 如果非法：拒绝并回滚 UI（必要时显示提示）

8. DragOverlay 与视觉反馈
   - overlay 建议使用“投影后的深度缩进”来渲染拖拽中节点（包含文件夹子树的情形可按你的 UX 选择）
   - 视觉指示：
     - 同级 before/after：蓝色线条
     - inside/投影成为子节点：蓝色边框/容器高亮

9. 性能要点（大树时）
   - `flattenTree/buildTree` 用 `useMemo` 缓存
   - React 组件用 `React.memo`，避免每次 pointermove 都触发全树重渲染
   - 拖拽中尽量只维护“投影结果”而非深拷贝整棵树
   - 节点很多时可考虑虚拟列表（但会显著增加实现复杂度）

## 6. 右键操作实现方案

### 6.1 Edit Details（备注/标记）
1. renderer 更新对话框中的输入
2. 发 IPC `updateNodeDetails`（仅持久化）
3. main 更新 Project Store 中该节点的 `details`
4. renderer 收到更新后重渲染节点行

### 6.2 Rename
1. renderer 发起 `renameNode(nodeId, newName)`
2. main：
   - 检查同级目录是否存在同名（磁盘为准）
   - 执行 `fs.rename(oldPath, newPath)`
   - 更新 Project Store：节点 name 与 diskPath；如为 folder 则需更新其子树每个节点的 diskPath（因为路径前缀变化）
3. renderer 刷新该子树视图

### 6.3 Delete
1. renderer 发起 `deleteNode(nodeId)`
2. main：
   - 若 file：unlink
   - 若 folder：递归删除（注意安全处理）
   - 从 Project Store 删除该节点子树（包括其 children）
3. renderer 删除对应 UI 节点；若节点在编辑器打开则关闭标签页（由编辑器模块订阅删除事件或在删除响应里携带被删除文件列表）

### 6.4 Copy / Paste（深度克隆）
1. renderer 发起 `pasteNodes(sourceIds[], targetParentId, dropPosition)`（一次可只粘贴一个，先支持单节点更简单）
2. main 递归复制：
   - 为每个新节点生成新 `id`
   - 目标目录下按规则生成不冲突名称：
     - base: 源节点 name
     - 目标名可在冲突时生成 `copy` 后缀并累加数字
   - 文件夹：递归创建目录
   - 文件：复制磁盘内容或从持久化中读取文本后写入磁盘
3. 更新 Project Store 并追加到 `orderByParentId[targetParentId]`
4. renderer 根据返回结果插入 UI

## 7. 文件夹监控与外部变更对齐（chokidar）

### 事件触发策略
1. 监听 `add/unlink/rename/change` 等事件
2. 对事件做 debounce（例如 300-800ms），避免高频触发导致重复扫描
3. debounce 触发后执行一次“扫描-对齐”

### 扫描-对齐（核心思路）
扫描目录得到磁盘真实树（相对 rootPath 的路径集合/层级）。

对齐规则建议：
1. 尽量保持原有 nodeId：
   - 通过磁盘路径匹配（`diskPath`）找到已有节点
   - 若未找到且出现新路径：创建新 nodeId
2. 识别重命名/移动：
   - 当某个旧路径不再存在而出现新路径：推断为 move/rename（精度可逐步增强）
   - 更新节点的 `name/parentId/diskPath`
3. 维护顺序：
   - 结构对齐后不修改 `orderByParentId` 中已有节点的相对顺序
   - 新增节点默认追加到目标父节点的 children 尾部

### “排序变化不需要同步”
因此扫描对齐时只比较“存在性 + 父子关系/名称”，不读取目录返回顺序来覆盖 `orderByParentId`。

## 8. 在文件系统中查看

renderer 右键 `Reveal in System`：
1. 发 IPC `revealInSystem(diskPath)`
2. main 使用 Electron `shell.showItemInFolder(diskPath)` 或 `shell.openPath(diskPath)` 打开系统文件浏览器/定位文件

## 9. IPC 合约（草案）

说明：下列为建议命名与载荷结构，实际落地可按你们现有 IPC 封装方式调整。

1. `scanProjectTree`
   - 入参：`{ projectId }`
   - 出参：`{ store: ProjectStore }`（或至少返回 root 树与 order）

2. `moveNode`
   - 入参：`{ nodeId, newParentId, insertMode: 'before'|'after'|'inside', overId? }`
   - 出参：`{ updatedDiskPaths: string[], storeVersion?: number }`

3. `renameNode`
   - 入参：`{ nodeId, newName }`
   - 出参：`{ updatedNodes: string[] }`

4. `deleteNode`
   - 入参：`{ nodeId }`
   - 出参：`{ deletedNodeIds: string[] }`

5. `pasteNodes`
   - 入参：`{ sourceNodeIds: string[], targetParentId: string }`
   - 出参：`{ createdNodeIds: string[], createdSubtreeRootId?: string }`

6. `updateNodeDetails`
   - 入参：`{ nodeId, details: { remark?: string; color?: number } }`
   - 出参：`{ updatedNodeId: string }`

7. `revealInSystem`
   - 入参：`{ diskPath }`
   - 出参：`{ ok: true }`

## 10. 边界情况与风险点

1. 重命名冲突：以磁盘同级真实存在为准，遇冲突直接拒绝并在 renderer 给出提示。
2. 文件夹移动的 diskPath 更新：folder 移动后必须递归更新其子树所有节点 diskPath。
3. 监控对齐误判：外部移动/重命名的推断不可能 100% 完美；建议使用更多信息逐步增强（例如：基于相对路径、文件内容 hash、或同级策略）。
4. 路径编码与大小写问题：macOS 默认大小写可能影响“同名检测”，需要在重命名/创建时明确采用一致策略（例如直接使用磁盘真实查询）。

## 11. 建议实现步骤（可并行拆分）

1. 先落地 Project Store 读写与初始化扫描（保证 UI 能展示真实树 + 固化顺序）。
2. 实现拖拽后“仅同级顺序更新”（不触碰磁盘），验证 DnD before/after/inside 的持久化顺序插入逻辑。
3. 实现跨父节点移动（moveNode IPC + main 真实 move），再扩展禁入校验（禁止拖入自身/子孙）。
4. 实现 Rename/Delete（磁盘写 + 持久化更新 + UI 刷新）。
5. 实现 Copy/Paste 深度克隆（命名冲突策略先简单可用，后续再优化）。
6. 实现文件夹监控（chokidar + debounce + 扫描对齐），先实现结构存在性对齐，再逐步增强 move/rename 识别精度。
7. 完成 “Reveal in system”。

## 12. 验证清单（建议用于开发自测）
1. 同级拖拽前后：磁盘不发生 rename/move，但持久化 order 发生变化。
2. 跨文件夹拖拽：磁盘路径变化，持久化结构与 order 同步正确。
3. 禁止拖入自身/子孙文件夹：UI 拒绝操作或自动回滚。
4. Rename：同级不重名；folder rename 后子树全部可见且路径正确。
5. Delete folder：子树全部消失，且持久化与磁盘一致。
6. Copy/Paste：复制子树，生成新 id；命名自动避免冲突。
7. 外部监控：在磁盘手动新增/删除/重命名，应用结构更新；顺序保持为持久化结果。

