# Opaline

Opaline 是一个以干净 HTML 为原生笔记格式的本地优先知识工作台。

项目入口：

- [文档路口页](index.html)
- [英文 README](README.md)
- [HTML 原生 README](README.html)
- [中文 HTML 入口](README.zh.html)

## 核心想法

Opaline 先不是论坛、平台、网站生成器，也不是完整复制 Obsidian。

它的第一阶段应该是一个可靠的个人本地工具：

```text
写下来 -> 存得住 -> 找得到 -> 连得上 -> 以后能发布
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

- 打开本地 workspace
- 创建 HTML note
- 使用 Tiptap 编辑
- 保存为干净 HTML
- 重启后无损读取
- SQLite 扫描并重建索引
- 标题和正文搜索
- 基础链接和反链

先把个人工具做好，再考虑发布和社区。

## AI 的位置

AI 不应该只是一个聊天框。它应该帮助用户找回、理解和重组自己的旧知识。

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

- [愿景和定位](docs/vision.html)
- [HTML 格式和多语言支持](docs/html-format.html)
- [存储模型和架构](docs/storage-architecture.html)
- [搜索、AI 和发布](docs/search-ai-publish.html)
- [路线图和暂不做的事情](docs/roadmap.html)
