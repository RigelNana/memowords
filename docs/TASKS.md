# MemoWords — 任务分解表

## 阶段总览

| 阶段 | 名称 | 分支策略 | 预估 |
| --- | --- | --- | --- |
| M0 | 基础设施搭建 | `main` 直接提交 | 1 周 |
| M1 | mdict 解析引擎 | `feat/mdict-crate` | 3 周 |
| M2 | 后端核心 (查词服务) | `feat/dict-backend` | 2 周 |
| M3 | 前端查词 UI | `feat/search-ui` | 2 周 |
| M4 | 词典管理 | `feat/dict-manage` | 1 周 |
| M5 | 背单词模块 | `feat/vocab` | 2 周 |
| M6 | 打磨与测试 | `feat/polish` | 2 周 |

---

## M0 — 基础设施搭建

### M0.1 项目初始化
- [ ] `T-001` 初始化 Git 仓库，创建 `.gitignore`
- [ ] `T-002` 创建 Tauri 2 + React + TypeScript 项目脚手架
- [ ] `T-003` 配置 TailwindCSS 4
- [ ] `T-004` 配置 ESLint + Prettier (前端)
- [ ] `T-005` 配置 Rust workspace（根 Cargo.toml + crates 目录）

### M0.2 Rust Workspace 结构
- [ ] `T-006` 创建 `crates/mdict` — 独立 MDX/MDD 解析 crate
- [ ] `T-007` 创建 `src-tauri/` — Tauri 后端主应用
- [ ] `T-008` 配置 workspace 依赖：tokio, anyhow, jiff, sqlx, tracing, parking_lot, dashmap
- [ ] `T-009` 配置 tracing + tracing-subscriber 日志输出 (控制台 + 文件轮转)
- [ ] `T-010` 配置 SQLite (sqlx) 连接池 + migration 框架

### M0.3 六边形架构骨架
- [ ] `T-011` 定义 domain 层模块结构 (dictionary, wordbook, review)
- [ ] `T-012` 定义 port 层核心 trait (DictRepo, SearchEngine, WordBookRepo)
- [ ] `T-013` 定义 adapter/infra 层骨架 (sqlite adapter, fs adapter)
- [ ] `T-014` 定义 app 层 Tauri command 骨架

### M0.4 CI/测试基础
- [ ] `T-015` 配置 `cargo test` smoke test
- [ ] `T-016` 添加前端 Vitest 配置
- [ ] `T-017` 创建测试用 MDX/MDD 样本文件 (或文档说明如何获取)
- [ ] `T-018` 首次提交：项目骨架 + 空跑通过

**提交点**：`init: project scaffold with tauri + react + rust workspace`

---

## M1 — mdict 解析引擎 (`feat/mdict-crate`)

### M1.1 基础解析
- [ ] `T-101` 实现 MDX Header 解析 (XML 属性提取)
  - 编码、版本、标题、描述、StyleSheet、加密标记、RTL
  - 测试：正常 header / 空 header / 异常编码
- [ ] `T-102` 实现数字类型读取 (v1.x: u32, v2.0: u64)
  - 测试：两种版本数字读取
- [ ] `T-103` 实现 Key Block Info 解析
  - 解析块数量、词条数、块信息大小
  - Adler32 校验
  - 测试：校验通过 / 校验失败
- [ ] `T-104` 实现 Key Block Info 解码 (v1.x / v2.0 分支)
  - 首/末词头读取，compressed/decompressed size 对
  - 测试：v1.x 和 v2.0 词典

### M1.2 解压缩与解密
- [ ] `T-105` 实现压缩块解析 (type + checksum + payload)
  - 0x00 — 无压缩 + Adler32 校验
  - 0x02 — zlib 解压
  - 测试：各压缩类型 + 校验失败
- [ ] `T-106` 实现 LZO1X 解压支持
  - 调研 minilzo-rs 或 lzo1x-sys
  - 测试：LZO 压缩的词典
- [ ] `T-107` 实现 RIPEMD128 解密 Key Block Index
  - 字节旋转 + XOR 解密算法
  - 测试：加密词典 vs 非加密词典

### M1.3 词条与记录解析
- [ ] `T-108` 实现 Key Block 读取 (headword + offset)
  - UTF-8 / UTF-16LE 编码处理
  - 测试：不同编码词典
- [ ] `T-109` 实现 Record Block Info 解析
  - compressed/decompressed size 对，shadow position 计算
  - 测试：记录块索引构建正确性
- [ ] `T-110` 实现 Record Block 读取 (二分查找 + 解压)
  - 测试：随机访问多个词条
- [ ] `T-111` 实现 `@@@LINK=` 内部重定向
  - 递归跟踪 + 防环
  - 测试：单层重定向 / 多层重定向 / 循环重定向

### M1.4 CSS 与资源
- [ ] `T-112` 实现 StyleSheet 替换 (`` `N` `` → prefix/suffix)
  - 测试：有样式表 / 无样式表 / 嵌套样式
- [ ] `T-113` 实现 MDD 资源文件解析
  - 路径归一化 (`\` 前缀，Windows 路径)
  - 测试：加载图片 / CSS / 音频资源
- [ ] `T-114` 实现多 MDD 分卷支持 (dict.mdd, dict.1.mdd ...)
  - 测试：主 MDD + 分卷

### M1.5 编码处理
- [ ] `T-115` 实现编码转换模块 (UTF-8, UTF-16LE, GBK/GB18030)
  - 使用 encoding_rs crate
  - 测试：各编码转换正确性
- [ ] `T-116` 实现 CSS 文件编码检测 (BOM → UTF-8 验证 → 词典编码 → fallback)
  - 测试：有 BOM / 无 BOM / 非 UTF-8

### M1.6 索引
- [ ] `T-117` 设计索引结构 (B-Tree 或 FST)
  - 折叠 (case fold + diacritics fold) 作为索引 key
  - 测试：折叠正确性
- [ ] `T-118` 实现索引构建 (从解析结果生成)
  - 测试：构建 + 序列化 + 反序列化
- [ ] `T-119` 实现索引持久化 (bincode/postcard 序列化)
  - 文件头版本号 + 源文件 mtime 检查
  - 测试：版本不匹配触发重建
- [ ] `T-120` 实现前缀搜索 (基于索引)
  - 测试：精确匹配 / 前缀匹配 / 无结果
- [ ] `T-121` 实现模糊搜索 (Levenshtein distance)
  - 测试：不同距离阈值
- [ ] `T-122` 实现词干匹配 (suffix variation)
  - 测试：动词变位等形态变化

### M1.7 API 与 Benchmark
- [ ] `T-123` 设计并实现公共 API (`DictParser` trait + 具体实现)
  - `open`, `meta`, `lookup`, `prefix_search`, `fuzzy_search`, `resource`
- [ ] `T-124` 编写 criterion benchmark
  - open / index_build / prefix_search / exact_lookup / fuzzy_search / resource_load / decompress
- [ ] `T-125` 编写 README.md for mdict crate (API 文档 + 使用示例)
- [ ] `T-126` 集成测试：用真实 MDX/MDD 词典跑完整流程
- [ ] `T-127` 边缘测试：空词典 / 损坏文件 / 超大词典 / 仅 MDD 无 MDX
- [ ] `T-128` 压力测试：10 万+ 词条词典并发查询

**提交点**：`feat(mdict): complete mdict parsing crate with benchmarks`
**合并**：`feat/mdict-crate` → `main`

---

## M2 — 后端核心服务 (`feat/dict-backend`)

### M2.1 Domain 层
- [ ] `T-201` 定义 Dictionary aggregate (id, name, path, meta, group)
- [ ] `T-202` 定义 DictGroup aggregate (id, name, items, sort_order)
- [ ] `T-203` 定义 SearchResult value object (word, weight, source_dict)
- [ ] `T-204` 定义 domain events (DictImported, GroupCreated, etc.)

### M2.2 Port 层 (Traits)
- [ ] `T-205` 定义 `DictRepository` trait (CRUD 词典记录)
- [ ] `T-206` 定义 `DictGroupRepository` trait (CRUD 分组)
- [ ] `T-207` 定义 `SearchEngine` trait (prefix/fuzzy/fts search)
- [ ] `T-208` 定义 `ResourceProvider` trait (图片/音频/CSS)

### M2.3 Infrastructure 层
- [ ] `T-209` 实现 SQLite migration (sqlx migrate)
  - dictionaries, dict_groups, dict_group_items, search_history, settings
- [ ] `T-210` 实现 `SqliteDictRepository`
  - 测试：CRUD 操作
- [ ] `T-211` 实现 `SqliteDictGroupRepository`
  - 测试：分组 CRUD + 排序
- [ ] `T-212` 实现 `MdictSearchEngine` (桥接 mdict crate)
  - 管理多词典实例的加载/卸载
  - 测试：多词典搜索合并去重
- [ ] `T-213` 实现 `MdictResourceProvider`
  - MDD 资源加载 + 本地文件 fallback
  - 测试：加载各类资源

### M2.4 Application 层 (Tauri Commands)
- [ ] `T-214` 实现 `scan_dicts` command (扫描目录)
- [ ] `T-215` 实现 `import_dict` command (导入单个词典)
- [ ] `T-216` 实现 `search` command (前缀/模糊搜索)
- [ ] `T-217` 实现 `lookup` command (精确查词，返回 HTML)
- [ ] `T-218` 实现 `get_resource` command (获取资源数据)
- [ ] `T-219` 实现 `list_groups` / `create_group` / `update_group` / `delete_group`
- [ ] `T-220` 实现 HTML 过滤与链接重写 pipeline
  - `<html>/<body>/<head>` 替换
  - `entry://`, `sound://` 链接重写
  - CSS 隔离 (scope selector)
  - `@font-face` url 重写
- [ ] `T-221` 实现搜索历史记录 CRUD

### M2.5 后端测试
- [ ] `T-222` 单元测试：各 repository 实现
- [ ] `T-223` 集成测试：Tauri command 端到端 (mock IPC)
- [ ] `T-224` 压力测试：并发搜索 100+ 个词典

**提交点**：`feat(backend): dictionary service with hex arch`
**合并**：`feat/dict-backend` → `main`

---

## M3 — 前端查词 UI (`feat/search-ui`)

### M3.1 基础框架
- [ ] `T-301` 搭建 React Router 路由结构
- [ ] `T-302` 配置 Zustand 状态管理 (dictStore, searchStore, uiStore)
- [ ] `T-303` 实现 Tauri IPC 调用封装层 (`invoke` wrapper + 类型定义)
- [ ] `T-304` 实现 Material 3 Pastel 主题配置 (TailwindCSS design tokens)

### M3.2 布局
- [ ] `T-305` 实现 AppShell (sidebar + main content 双栏布局)
- [ ] `T-306` 实现 Sidebar 导航 (查词/背单词/词库/历史/设置)
- [ ] `T-307` 实现 Sidebar 词典分组列表 + 切换
- [ ] `T-308` 实现响应式布局 (sidebar 可折叠)

### M3.3 搜索
- [ ] `T-309` 实现 SearchBar 组件 (输入框 + 防抖 300ms + 清空)
- [ ] `T-310` 实现 CandidateList 组件 (搜索候选词列表)
  - stagger 入场动画
  - 键盘上下导航 + Enter 确认
- [ ] `T-311` 实现搜索结果排序 (精确 > 前缀 > 模糊)
- [ ] `T-312` 实现搜索无结果 fallback (模糊搜索建议)

### M3.4 释义展示
- [ ] `T-313` 实现 ArticleView 组件 (安全渲染词典 HTML)
  - iframe sandbox 或 DOMPurify
- [ ] `T-314` 实现 DictSection 组件 (单词典释义区域 + 折叠/展开)
  - spring 动画
- [ ] `T-315` 实现多词典滚动视图 (DictSection 纵向排列)
- [ ] `T-316` 实现词典标签栏 (快速跳转到指定词典区域)
- [ ] `T-317` 实现图片资源渲染 (bres:// 协议拦截)
- [ ] `T-318` 实现音频播放按钮 (gdau:// 协议)
- [ ] `T-319` 实现词典内链接跳转 (entry:// → 重新查词)
- [ ] `T-320` 实现查词历史记录展示页

### M3.5 前端测试
- [ ] `T-321` Vitest 单元测试：SearchBar, CandidateList 组件
- [ ] `T-322` Vitest 单元测试：状态管理 store
- [ ] `T-323` E2E 测试 (Playwright/Tauri driver)：查词完整流程

**提交点**：`feat(ui): search interface with multi-dict display`
**合并**：`feat/search-ui` → `main`

---

## M4 — 词典管理 (`feat/dict-manage`)

### M4.1 管理界面
- [ ] `T-401` 实现词典列表页 (显示所有已导入词典)
  - 名称、词条数、语言、路径、索引状态
- [ ] `T-402` 实现词典导入对话框 (选择目录 → 扫描 → 确认导入)
  - 进度条展示索引构建进度
- [ ] `T-403` 实现词典详情/编辑 (重命名、查看描述)
- [ ] `T-404` 实现词典删除 (确认对话框)

### M4.2 分组管理
- [ ] `T-405` 实现分组 CRUD UI (创建/重命名/删除)
- [ ] `T-406` 实现分组内词典排序 (拖拽 DnD)
  - @dnd-kit 拖拽库
- [ ] `T-407` 实现词典启用/禁用 toggle
- [ ] `T-408` 实现分组切换 (下拉菜单/侧栏)

### M4.3 测试
- [ ] `T-409` 单元测试：分组 CRUD store
- [ ] `T-410` E2E 测试：导入 → 分组 → 切换 → 查词

**提交点**：`feat(manage): dictionary import and group management`
**合并**：`feat/dict-manage` → `main`

---

## M5 — 背单词模块 (`feat/vocab`)

### M5.1 后端
- [ ] `T-501` 实现 WordBook domain aggregate
- [ ] `T-502` 实现 ReviewRecord domain (SM-2 算法)
- [ ] `T-503` 实现 SQLite migration (word_books, word_entries, review_records)
- [ ] `T-504` 实现 `SqliteWordBookRepository`
- [ ] `T-505` 实现 `SqliteReviewRepository`
- [ ] `T-506` 实现 Tauri commands: list_books / create_book / add_word / get_due_words / submit_review
- [ ] `T-507` 实现内置词库数据导入 (CET4/6, TEM8, JLPT N1/N2)
- [ ] `T-508` 实现查词收藏 command (add_to_favorites)

### M5.2 前端
- [ ] `T-509` 实现词库列表页 (内置 + 自定义)
- [ ] `T-510` 实现词库详情页 (词条列表 + 进度)
- [ ] `T-511` 实现复习卡片页 (正面/翻转/评分)
  - 3D flip 动画
- [ ] `T-512` 实现每日复习入口 (Today's Review: X new + Y review)
- [ ] `T-513` 实现学习统计页 (图表: recharts)
- [ ] `T-514` 实现查词页收藏按钮

### M5.3 测试
- [ ] `T-515` 单元测试：SM-2 算法正确性
- [ ] `T-516` 单元测试：WordBook / Review repository
- [ ] `T-517` 集成测试：复习流程 (add → due → review → reschedule)
- [ ] `T-518` E2E 测试：背单词完整流程

**提交点**：`feat(vocab): vocabulary learning with spaced repetition`
**合并**：`feat/vocab` → `main`

---

## M6 — 打磨与测试 (`feat/polish`)

### M6.1 UI 打磨
- [ ] `T-601` 全局动画调优 (过渡、加载、micro-interactions)
- [ ] `T-602` 深色/浅色主题切换
- [ ] `T-603` 快捷键支持 (全局呼出、Ctrl+F 搜索、Esc 关闭)
- [ ] `T-604` 骨架屏 / 加载状态优化
- [ ] `T-605` 错误状态 UI (网络错误、词典损坏等)

### M6.2 性能优化
- [ ] `T-606` 前端虚拟列表 (大候选列表)
- [ ] `T-607` 后端搜索结果缓存 (LRU)
- [ ] `T-608` 词典延迟加载优化 (启动时只加载元信息)
- [ ] `T-609` Tauri IPC 大数据传输优化

### M6.3 全面测试
- [ ] `T-610` Smoke Test 自动化 (CI 集成)
- [ ] `T-611` 增加边缘 case 单元测试
- [ ] `T-612` mdict crate 压力测试报告
- [ ] `T-613` E2E 全流程测试 (查词 → 背单词 → 管理)
- [ ] `T-614` 测试覆盖率检查 (cargo-llvm-cov ≥ 80%)

### M6.4 文档
- [ ] `T-615` 项目 README.md (功能介绍、截图、安装、开发指南)
- [ ] `T-616` mdict crate 文档完善 (rustdoc + examples)
- [ ] `T-617` ARCHITECTURE.md (六边形架构 + DDD 说明)
- [ ] `T-618` CONTRIBUTING.md

**提交点**：`chore: polish ui, optimize performance, complete tests`
**合并**：`feat/polish` → `main`

---

## 任务统计

| 阶段 | 任务数 |
| --- | --- |
| M0 — 基础设施 | 18 |
| M1 — mdict 引擎 | 28 |
| M2 — 后端核心 | 24 |
| M3 — 查词 UI | 23 |
| M4 — 词典管理 | 10 |
| M5 — 背单词 | 18 |
| M6 — 打磨测试 | 18 |
| **总计** | **139** |
