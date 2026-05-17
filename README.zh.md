# Opaline

Opaline 是一个以干净 HTML 为原生笔记格式的本地优先知识工作台。

项目入口：

- [文档路口页](index.html)
- [英文 README](README.md)
- [HTML 原生 README](README.html)
- [中文 HTML 入口](README.zh.html)

## 发布状态

Opaline 当前是 **公开 alpha**。它适合测试、个人试用和早期反馈，但还不是稳定日用版本。

- 当前主要开发和验证环境是 Windows。
- macOS 支持在计划中，但 macOS 安装包应在 macOS 上构建和测试。
- 当前发布包默认未签名，除非 Release 明确说明。
- 用重要笔记测试 alpha 版本前，请先备份工作区。

相关文档：

- [构建与发布说明](docs/release.md)
- [数据与隐私](docs/data-and-privacy.md)
- [更新记录](CHANGELOG.md)
- [安全政策](SECURITY.md)

## 下载和运行

从源码运行：

```bash
npm install
npm run tauri:dev
```

本地生产构建：

```bash
npm run tauri:build
```

更多平台打包注意事项见 [docs/release.md](docs/release.md)。

## 赞助

Opaline 是一个 source-available、非商业授权项目。赞助会支持本地优先 HTML 笔记编辑器、存储模型、搜索、链接、发布和 AI 辅助知识工作流继续开发。

支付资料配置好后会添加赞助入口。GitHub Sponsors 和 PayPal 的计划配置见 [docs/sponsorship.md](docs/sponsorship.md)。

赞助不等于商业授权。商业使用需要向作者单独获得授权。

## 核心想法

Opaline 先不是论坛、平台、网站生成器，也不是现有笔记应用的复制品。

它的第一阶段应该是一个可靠的个人本地工具：

```text
说出来 -> 自动记录 -> 存得住 -> 找得到 -> 连得上 -> 以后能发布
```

长期方向可以扩展到公开知识站点、读者选中概念搜索、AI 带引用问答，以及和 Diandanr 这类发布平台打通。但这些都应该建立在本地知识系统足够可信之后。

## 为什么是 HTML

HTML 不是目的。真正目标是长期可用的富知识文档。

HTML 的价值在于：

- 不用 Opaline，也能用浏览器打开。
- 天然适合发布成网页。
- 比 Markdown 更适合表达表格、图片、callout、注释、嵌入、块 ID、概念标注等富结构。
- 可以通过 `lang`、`dir`、语义标签和 `data-opaline-*` 属性保存更多上下文。
- 适合未来做选中文字搜索、概念解释、公开知识库追问和 AI 检索。

但 HTML 也有风险：如果不限制格式，它很容易变成编辑器吐出的脏 HTML。因此 Opaline 必须定义自己的 **Opaline HTML Profile**，保存干净、稳定、可预测、适合 Git diff 和 AI 处理的 HTML。

## 初始产品边界

第一用户是作者，而不是读者或社区用户。

MVP 应该优先解决：

- 自动初始化默认工作区
- 创建 HTML note
- 使用 Tiptap 编辑
- 保存为干净 HTML
- 重启后无损读取
- SQLite 扫描并重建索引
- 标题和正文搜索
- 基础链接和提及关系
- 设置页管理工作区位置、AI provider、扩展组件与活组件策略

先把个人工具做好，再考虑发布和社区。

## 当前项目状态

当前项目已经不是纯构思或脚手架，已经有第一版可运行的桌面闭环：

- Tauri + React + Tiptap 桌面应用壳。
- 启动时自动初始化默认工作区：系统文档目录下的 `Opaline` 文件夹。
- 设置页可以修改工作区位置。
- 支持本地 HTML 笔记的创建、读取、编辑、保存和自动保存。
- 仍可创建日记；早期“随便记记 / Today”入口在公开 alpha 中暂时隐藏，优先打磨“认真记记”的专注知识工作台。
- AI 设置支持 provider、自定义 API 地址、模型名、API Key、显式保存、测试模型和抓取模型。
- 已有 Opaline HTML Profile 的基础清洗、解析和测试。
- SQLite 已开始参与搜索和元数据管理方向。
- 已梳理普通 `<a>`、`[[note links]]`、block ref、提及关系、出链和 broken link 的规则。
- 关系数据模型和关系图已经区分文件级、标题级、块级、概念级关系。
- 编辑器可以复制当前块的稳定链接，也可以从当前笔记中选择标题或块并插入带关系类型的链接。
- 已加入扩展组件设置：插件保护模式、扩展安装情况、刷新按钮，以及打开 `.opaline/plugins` 扩展文件夹的入口。
- `<opaline-widget>` 可以保存内置组件，也可以声明已安装插件提供的组件，例如 `network-status`。笔记只保存 `type`、`target`、`endpoint`、`refresh` 等参数；脚本放在工作区插件文件夹里。
- `<opaline-script>` 已作为实验性脚本笔记加入；在设置里启用后会在 Opaline 内运行 JS，并可通过 `opaline.render()` 更新卡片输出、通过 `opaline.net.fetch()` 请求 HTTP/HTTPS 接口。保存后的 HTML 会带轻量运行时，直接用浏览器打开也会尝试运行，但浏览器请求仍受 CORS 限制。
- 编辑器支持 callout、双栏、对照、旁注、折叠块、表格、任务列表、图片、嵌入、数学公式和 Mermaid 图表。
- 编辑器右键菜单已经把常用格式、段落、H1-H6 标题、插入和剪贴板操作收进分层菜单。
- 左侧文件区右键菜单支持打开、创建副本、收藏、复制路径和打开历史版本。
- 已内置本地笔记历史：HTML 快照存放在工作区元数据里。它不是 Git，基础用户不需要安装 Git。第一版默认保留最近 30 天，并且恢复前必须先预览和确认。
- “认真记记”开始形成专注知识工作台：左侧快捷栏、文件栏、主编辑器、右侧检查器、左右栏折叠、小型关系图预览和完整关系视图；完整关系视图已经有当前笔记关联范围和边详情。

仍然粗糙的地方：

- 更改工作区位置后，还没有迁移原工作区文件的流程。
- 从选中文字创建概念级关系的普通用户交互还没做，当前只是数据模型和关系图先支持。
- 文件操作还需要继续打磨，尤其是带迁移意识的移动流程和更完整的历史版本管理。
- HTML 的优势还需要通过更自然的交互块体现出来，而不是让用户看到或理解 HTML。
- 已知残留问题：块链接能打开目标笔记并滚动到目标块，但目标块的可视高亮在桌面编辑器里仍不稳定，当前可能看不到，需要后续单独修。

## AI 的位置

## 三个 HTML 原生差异点的当前落点

- **活组件 / Web Component：**设置页保留内置组件和实验性脚本笔记开关，第三方组件改为从 `.opaline/plugins/<plugin-id>/` 读取。用户把插件文件夹放进工作区，`manifest.json` 把 `network-status` 等组件类型映射到脚本文件；笔记只保存 `<opaline-widget type="network-status" target="192.168.1.1" endpoint="/status">` 这样的参数声明。
- **DOM 级原子链接：**标题、段落、表格、引用块等 DOM 块会保留 `data-opaline-block-id`。用户可以复制当前块链接，或从编辑器选择“链接到标题/块”生成稳定 ID 链接。
- **动态关系图：**关系图继续使用文件、标题、块、概念四类关系；现在可以切换当前笔记关联范围，并点击边查看关系类型、来源、目标和具体标题/块/概念信息。

已安装插件脚本现在拿到的是偏自由的桌面 API：

- `opaline.render/log/every/timeout`
- `opaline.net.fetch/ping/tcp`
- `opaline.notes.list/read/create/save/update/search/current`
- `opaline.links.backlinks/outgoing`
- `opaline.graph.current/neighborhood`
- `opaline.fs.readText/writeText/listDir`
- `opaline.storage.get/set/remove`
- `opaline.system.openExternal/openPath/notify`
- `opaline.shell.exec`

示例插件放在 `examples/plugins/network-tools/`，其中 `ping-monitor` 可以持续 ping `192.168.31.1` 这类内网地址。

AI 不应该只是一个聊天框。它应该帮助用户把随手说出的话沉淀为本地记录，并在后续帮助用户找回、理解和重组自己的旧知识。

当前公开 alpha 先保留“认真记记”进入专注知识工作台，适合明确知道自己要记录什么的人。“随便记记 / Today”入口暂时隐藏，等记录、AI 和日记体验更稳定后再重新评估。

设置页集中管理 AI provider、API 地址、模型、API Key、测试模型和抓取模型，并通过显式保存生效。

比较重要的原则：

- 回答必须带来源。
- 引用可以跳回原文。
- 找不到就说找不到。
- 区分原文事实和 AI 推断。
- 私有内容默认不上传云端模型。

## 发布和公开笔记

发布应该分阶段：

1. 静态导出：选择部分笔记，生成一个可部署的网站。
2. 托管发布：提供类似 `opaline.site/username` 的托管服务。
3. 公开知识网络：很多用户发布公开笔记，其他人可以发现、搜索、引用和追问。

我们讨论过的一个长期差异点是：

> 读者在公开笔记里选中某个概念后，可以搜索作者之前的公开笔记，查看这个概念在作者知识体系中的含义，并由 AI 给出带引用解释。

这个功能有潜力，但不是 MVP。

## 和 Diandanr 的关系

短期分工可以是：

```text
Opaline  = 本地知识创作与管理
Diandanr = 发布、站点生成、分发和平台能力
```

不要一开始合并。Opaline 先把本地 HTML 知识文件做好，未来再通过导出包或接口交给 Diandanr 做发布和平台化。

## 拆分文档

- [愿景和定位](docs/vision.html)：说明 Opaline 为什么先做本地个人知识工具，而不是平台或论坛。
- [HTML 格式和多语言支持](docs/html-format.html)：说明为什么选择 HTML、如何保持干净格式，以及中文/英文/RTL 语言如何共存。
- [存储模型和架构](docs/storage-architecture.html)：说明 HTML 文件和 SQLite 的分工，以及编辑器层、领域层、存储层的边界。
- [搜索、AI 和发布](docs/search-ai-publish.html)：说明普通搜索、语义搜索、AI 引用、静态发布和未来公开知识网络。
- [链接规则](docs/link-rules.zh.html)：说明文件级、标题级、块级、概念级关系，以及 `[[note]]`、普通 `<a>`、block ref 和 broken link 的处理规则；英文版见 [Link Rules](docs/link-rules.html)。
- [路线图和暂不做的事情](docs/roadmap.zh.html)：说明先做什么、后做什么，以及早期不碰哪些大功能；英文版见 [Roadmap](docs/roadmap.html)。

## 当前实施步骤

接下来更应该做的是把已经跑通的功能打磨成可信产品：

1. 继续打磨“认真记记”的专注工作区，让文件栏、侧栏、编辑器和右侧信息区更统一。
2. 补工作区迁移：用户更改位置时，可选择复制或移动原工作区文件。
3. 扩展文件右键菜单：重命名、删除、移动、在系统资源管理器中显示、复制相对/绝对路径、打开历史版本。
4. 继续改进关系图视图：在当前关联范围和边详情基础上，补更好的布局、边到具体目标的导航和保存过滤预设。
5. 修复块链接跳转后的目标高亮，让打开目标笔记、滚动和可见高亮成为稳定闭环。
6. 给普通用户补上从编辑器右键创建概念级关系，以及跨笔记选择标题/块目标的交互。
7. 继续强化 HTML 原生交互块，让双栏、旁注、标注、嵌入、折叠块像界面能力，而不是隐藏标签。
8. 继续用可靠 parser 和测试加固 Opaline HTML Profile。
9. 深化 SQLite FTS 搜索、元数据扫描、提及关系和断链修复。
10. 增加带来源的本地笔记 AI 检索，先展示命中的笔记和片段，再生成回答。
11. 增加明确的 AI 笔记操作：总结、提取标签、建议链接、拆分长笔记、生成大纲。
12. 后续再做静态发布和公开笔记的读者选中概念搜索。
