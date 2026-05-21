# MemoWords — Product Requirements Document (PRD)

## 1. 产品概述

**MemoWords** 是一款基于 Tauri + Rust 后端与 React + TypeScript 前端的高性能本地词典 / 背单词桌面客户端。核心目标：提供极致性能的 MDX/MDD 词典解析与索引能力，同时融合现代化背单词体验，打造 all-in-one 的语言学习工具。

### 1.1 产品定位

| 维度 | 描述 |
| --- | --- |
| 目标用户 | 英语 / 日语等多语种学习者、词典爱好者、备考人群 (四六级、专八、N1/N2) |
| 平台 | Windows / macOS / Linux 桌面客户端 (Tauri) |
| 核心价值 | 高性能词典查词 + 科学背单词 + 美观现代 UI |

### 1.2 竞品分析

| 竞品 | 优势 | 劣势 | MemoWords 差异化 |
| --- | --- | --- | --- |
| GoldenDict-ng | 成熟稳定、格式支持全 | C++/Qt 技术栈老旧、UI 过时 | Rust 高性能、现代 Web UI |
| Anki | 背单词生态强 | 不支持 MDX、查词弱 | 词典 + 背单词一体化 |
| 欧路词典 | 商业级体验 | 闭源、无法定制 | 开源、可扩展 |
| MDX Server | 轻量 | 功能单一 | 全功能客户端 |

---

## 2. 用户角色与使用场景

### 2.1 用户角色 (Personas)

- **Learner** — 备考用户：需要词库管理、间隔重复背单词
- **Explorer** — 词典爱好者：需要挂载大量 MDX 词典、高效查词
- **Reader** — 阅读用户：需要划词查词、多词典联合释义

### 2.2 核心使用场景

1. **查词**：输入单词 → 模糊匹配候选列表 → 点击查看词典释义（多词典滚动展示）
2. **反向搜索**：输入中文释义 → 搜索所有词典中包含该释义的词条
3. **背单词**：选择词库 → 间隔重复复习 → 标记掌握/未掌握 → 查看统计
4. **词典管理**：导入 MDX/MDD → 分组管理 → 排序/启用/禁用 → 切换词典组
5. **资源浏览**：查看词典内嵌图片、音频播放、CSS 样式渲染

---

## 3. 功能需求

### 3.1 词典引擎 (P0 — 核心)

| ID | 功能 | 描述 | 优先级 |
| --- | --- | --- | --- |
| DE-01 | MDX 解析 | 解析 MDX v1.x / v2.0 文件头、关键词块、记录块 | P0 |
| DE-02 | MDD 解析 | 解析 MDD 资源文件（图片/音频/CSS/字体）| P0 |
| DE-03 | 索引构建 | 基于 B-Tree 或 FST 构建持久化索引，支持增量更新 | P0 |
| DE-04 | 精确搜索 | 大小写不敏感精确匹配 | P0 |
| DE-05 | 前缀搜索 | 输入前缀实时匹配候选词 | P0 |
| DE-06 | 模糊搜索 | 编辑距离 / Levenshtein 模糊匹配 | P0 |
| DE-07 | 反向搜索 | 全文搜索释义内容 | P1 |
| DE-08 | 词干匹配 | 基于词干变化的匹配 (suffix variation) | P1 |
| DE-09 | 解压缩 | 支持 zlib / lzo / 无压缩三种压缩方式 | P0 |
| DE-10 | 加密词典 | 支持 RIPEMD128 加密的关键词索引解密 | P1 |
| DE-11 | CSS 样式 | 解析词典内嵌 stylesheet，替换 style id 占位符 | P0 |
| DE-12 | 链接重写 | 将词典内部链接 (entry://, sound://) 重写为应用内路由 | P0 |
| DE-13 | 词典跳转 | @@@LINK= 内部重定向支持 | P0 |
| DE-14 | 编码处理 | UTF-8 / UTF-16LE / GBK / GB18030 等编码转换 | P0 |

### 3.2 词典管理 (P0)

| ID | 功能 | 描述 | 优先级 |
| --- | --- | --- | --- |
| DM-01 | 词典导入 | 扫描目录、手动添加 MDX 文件 | P0 |
| DM-02 | 词典分组 | 创建 / 编辑 / 删除词典组，词典可属于多个组 | P0 |
| DM-03 | 组内排序 | 拖拽排序词典展示顺序 | P0 |
| DM-04 | 词典切换 | 快速切换当前活跃词典组 | P0 |
| DM-05 | 词典信息 | 展示词典名称、词条数、语言、描述 | P1 |
| DM-06 | 词典启用/禁用 | 单个词典的 mute/unmute | P1 |
| DM-07 | 自动发现 MDD | 自动关联同名 .mdd 及分卷 (.1.mdd, .2.mdd ...) | P0 |

### 3.3 查词界面 (P0)

| ID | 功能 | 描述 | 优先级 |
| --- | --- | --- | --- |
| UI-01 | 搜索栏 | 实时前缀匹配 + 防抖 | P0 |
| UI-02 | 候选列表 | 带权重排序的候选词展示 | P0 |
| UI-03 | 多词典滚动 | 同一单词在多个词典中的释义滚动展示 | P0 |
| UI-04 | 词典折叠/展开 | 单个词典释义的折叠/展开 | P0 |
| UI-05 | HTML 渲染 | 安全渲染词典 HTML 内容 + CSS 隔离 | P0 |
| UI-06 | 图片展示 | 词典内嵌图片资源渲染 | P0 |
| UI-07 | 音频播放 | 发音音频播放 (mp3/ogg/wav/spx) | P1 |
| UI-08 | 查词历史 | 记录查词历史，支持回溯 | P1 |
| UI-09 | 词典间跳转 | 点击词典内链接跳转到其他词条 | P0 |

### 3.4 背单词模块 (P1)

| ID | 功能 | 描述 | 优先级 |
| --- | --- | --- | --- |
| VB-01 | 词库管理 | 内置词库 (CET4/6, TEM8, JLPT N1/N2 等) | P1 |
| VB-02 | 自定义词库 | 用户手动添加/导入单词到自建词库 | P1 |
| VB-03 | 间隔重复 | SM-2 / FSRS 算法的间隔重复复习 | P1 |
| VB-04 | 复习卡片 | 卡片翻转展示、认识/模糊/不认识三档 | P1 |
| VB-05 | 学习统计 | 每日学习量、掌握率、遗忘曲线可视化 | P2 |
| VB-06 | 收藏夹 | 查词时一键收藏到词库 | P1 |

### 3.5 系统功能 (P1)

| ID | 功能 | 描述 | 优先级 |
| --- | --- | --- | --- |
| SYS-01 | 本地存储 | SQLite (sqlx) 存储配置、词库、历史、复习记录 | P0 |
| SYS-02 | 日志追踪 | tracing + tracing-subscriber 结构化日志 | P0 |
| SYS-03 | 错误处理 | anyhow 统一错误处理，用户友好的错误提示 | P0 |
| SYS-04 | 主题设置 | 浅色 / 深色主题切换 | P2 |
| SYS-05 | 快捷键 | 全局快捷键呼出查词窗口 | P2 |

---

## 4. 非功能需求

### 4.1 性能

| 指标 | 目标 |
| --- | --- |
| 索引构建 | 10 万词条词典 < 3s |
| 前缀搜索响应 | < 10ms (已索引) |
| 全文搜索响应 | < 200ms (已索引) |
| 启动时间 | < 1s (冷启动) |
| 内存占用 | 空闲 < 50MB |

### 4.2 质量

| 指标 | 目标 |
| --- | --- |
| 单元测试覆盖率 | ≥ 80% |
| 集成测试 | 核心流程全覆盖 |
| E2E 测试 | 主要用户场景覆盖 |
| Smoke Test | 每次构建自动运行 |

### 4.3 可维护性

- 六边形架构 (Hexagonal Architecture) + DDD 分层
- MDX/MDD 解析库提取为独立 crate (`mdict`)
- 清晰简洁的命名风格
- 完善的 tracing 链路追踪

---

## 5. 技术架构

### 5.1 整体架构

```
┌──────────────────────────────────────────────────┐
│                   Frontend                        │
│   React + TypeScript + TailwindCSS + Material 3   │
│   Pastel Color Palette + Fluid Animations         │
└──────────────────┬───────────────────────────────┘
                   │ Tauri IPC (invoke / event)
┌──────────────────▼───────────────────────────────┐
│                   Backend (Rust)                  │
│  ┌─────────────────────────────────────────────┐  │
│  │           Application Layer                  │  │
│  │  Commands / Queries / Event Handlers         │  │
│  ├─────────────────────────────────────────────┤  │
│  │           Domain Layer                       │  │
│  │  Dictionary / WordBook / Review Aggregates   │  │
│  ├─────────────────────────────────────────────┤  │
│  │           Port Layer (Traits)                │  │
│  │  DictRepo / WordBookRepo / SearchEngine      │  │
│  ├─────────────────────────────────────────────┤  │
│  │           Infrastructure Layer               │  │
│  │  mdict crate / SQLite(sqlx) / FileSystem     │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 5.2 技术栈

**前端**
- React 19 + TypeScript 5
- TailwindCSS 4
- Material UI 3 (Material You) 风格
- Framer Motion (动画)
- Zustand (状态管理)

**后端**
- Tauri 2
- Rust (latest stable)
- tokio (异步运行时)
- sqlx + SQLite (本地数据库)
- anyhow (错误处理)
- jiff (时间处理)
- tracing + tracing-subscriber (日志追踪)
- parking_lot (高性能锁)
- dashmap (并发哈希表)

**独立 crate: `mdict`**
- 零拷贝 MDX/MDD 解析
- 支持 v1.x / v2.0 格式
- zlib / lzo 解压缩
- RIPEMD128 解密
- 编码转换 (UTF-8, UTF-16LE, GBK, GB18030)
- B-Tree / FST 索引构建与查询

### 5.3 数据模型

```
Dictionary
├── id: String (hash of file paths)
├── name: String
├── path: String
├── encoding: String
├── word_count: u64
├── lang_from: String
├── lang_to: String
└── description: String

DictGroup
├── id: i64
├── name: String
├── icon: String
└── dictionaries: Vec<DictGroupItem>

WordBook
├── id: i64
├── name: String (e.g. "CET-4", "JLPT N1")
├── lang: String
└── words: Vec<WordEntry>

ReviewRecord
├── id: i64
├── word_id: i64
├── ease_factor: f64
├── interval: i64
├── due_date: DateTime
├── review_count: i32
└── last_review: DateTime
```

---

## 6. 里程碑计划

| 阶段 | 目标 | 预计周期 |
| --- | --- | --- |
| M0 - 基础设施 | 项目脚手架、CI、mdict crate 骨架 | 1 周 |
| M1 - 词典引擎 | MDX/MDD 解析、索引、搜索 | 3 周 |
| M2 - 查词 UI | 搜索框、候选列表、HTML 渲染、多词典展示 | 2 周 |
| M3 - 词典管理 | 导入、分组、排序、切换 | 1 周 |
| M4 - 背单词 | 词库、间隔重复、复习卡片 | 2 周 |
| M5 - 打磨 | 动画、主题、性能优化、E2E 测试 | 2 周 |
