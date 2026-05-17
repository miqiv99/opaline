# Opaline

**English:** [README.md](README.md)

Opaline 是一个本地优先的桌面知识工作台，笔记以干净 HTML 文件保存。

它的目标很直接：你的笔记不应该被锁在某个应用或数据库里。每篇笔记都是本地 HTML 文档，可以用浏览器打开，可以被应用索引，可以和其他笔记建立链接，未来也可以发布成网页，或让 AI 基于明确来源进行检索和回答。

## 当前状态

Opaline 当前是 **公开 alpha**。

- 当前主要开发和验证环境是 Windows。
- macOS 支持在计划中，但 macOS 安装包应在 macOS 上构建和测试。
- 当前发布包默认未签名，除非 Release 明确说明。
- 用重要笔记测试 alpha 版本前，请先备份工作区。

## 为什么是 HTML 笔记？

Markdown 很适合纯文本笔记。Opaline 探索的是另一条路线：长期知识工作经常需要更丰富的结构。

干净 HTML 可以表达：

- 标题、段落、列表、表格、任务列表、代码块
- 图片、附件、callout、嵌入、数学公式、图表
- 稳定块 ID 和深层链接
- 笔记链接、标题链接、块链接、概念链接、标签和元数据
- 不依赖 Opaline 也能用浏览器阅读的文档，并且天然接近可发布网页

Opaline 不是要保存任意浏览器或编辑器吐出的脏 HTML。项目会维护 Opaline HTML Profile，让保存出来的笔记保持干净、稳定、可预测、可迁移，并适合搜索、链接、发布和 AI 检索。

## 现在已经能做什么

当前 alpha 已经包含：

- Tauri 2 + React + Tiptap 桌面应用
- 自动初始化默认工作区到系统文档目录
- 本地 HTML 笔记的创建、读取、编辑、保存和自动保存
- 文件树和笔记右键操作
- 富文本编辑块：标题、列表、任务、表格、callout、图片、嵌入、数学公式、Mermaid、布局、折叠块和代码块
- SQLite 元数据、搜索方向、标签、标题、反链、出链和断链检测
- 文件级、标题级、块级、概念级关系图
- 本地笔记历史快照
- AI 设置：provider、API 地址、模型、API Key、模型测试和模型抓取
- 实验性活组件和插件文件夹
- 界面语言切换和工作区本地语言包

公开 alpha 目前优先进入“认真记记”的专注工作区。早期“随便记记 / Today”入口暂时隐藏，先把核心笔记工作台打磨稳定。

## 仍然粗糙的地方

- 工作区迁移还需要完整用户流程。
- 部分文件操作和历史版本控制还需要打磨。
- 从选中文字创建概念级链接还需要更友好的 UI。
- 块链接跳转后的目标高亮仍可能不稳定。
- 安装包还没有面向大众发布所需的签名/公证。
- 静态发布功能在计划中，但不属于第一版 alpha。

## 从源码运行

需要：

- Node.js
- Rust
- 当前系统所需的 Tauri 依赖

开发运行：

```bash
npm install
npm run tauri:dev
```

本地打包：

```bash
npm run tauri:build
```

更多打包说明：[docs/release.md](docs/release.md)

## 数据与隐私

Opaline 是本地优先。典型工作区结构：

```text
Opaline/
  notes/
  assets/
  .opaline/
```

- `notes/` 保存耐久 HTML 笔记。
- `assets/` 保存图片和附件。
- `.opaline/` 保存元数据、设置、索引、缓存和历史快照。

本地编辑不需要云账号。只有在用户配置 AI provider、抓取模型列表、运行插件/脚本或打开外部链接时，才可能发生网络访问。

更多说明：[docs/data-and-privacy.md](docs/data-and-privacy.md)

## 文档

- [英文 README](README.md)
- [文档入口](index.html)
- [HTML README](README.zh.html)
- [HTML 格式](docs/html-format.zh.html)
- [存储与架构](docs/storage-architecture.zh.html)
- [搜索、AI 和发布](docs/search-ai-publish.zh.html)
- [链接规则](docs/link-rules.zh.html)
- [路线图](docs/roadmap.zh.html)
- [构建与发布说明](docs/release.md)
- [更新记录](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [安全政策](SECURITY.md)

## 许可证

Copyright (c) 2026 Enjun Lu.

Opaline 使用 [PolyForm Noncommercial License 1.0.0](LICENSE)。

非商业使用遵循许可证条款。商业使用需要向作者单独获得商业授权。
