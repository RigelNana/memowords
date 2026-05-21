# MemoWords — Features Specification

> 详细的技术实现细节（MDX/MDD 解析流程、CSS/JS 整合、安全性、@@@LINK、去重、渲染管线等）请参阅 [TECHNICAL_DETAIL.md](./TECHNICAL_DETAIL.md)

## 模块总览

```
MemoWords
├── mdict (独立 crate)         # MDX/MDD 解析引擎
├── core                       # 领域模型与业务逻辑
├── infra                      # 基础设施 (SQLite, 文件系统)
├── app                        # Tauri 命令层 / 应用服务
└── frontend                   # React UI
```

---

## F1. mdict 解析引擎 (独立 crate)

### F1.1 MDX 文件解析

**格式支持**

- [x] v1.x (4 字节数字类型，无压缩头校验)
- [x] v2.0 (8 字节数字类型，Adler32 校验，压缩头索引)

**解析流程**

```
open(path) → read_header → read_key_block_info → read_record_block_info
                │                    │                      │
                ▼                    ▼                      ▼
          HeaderMeta          KeyBlockIndex           RecordBlockIndex
          (encoding,          (compressed_size,       (start_pos, end_pos,
           version,            decompressed_size)      shadow_start/end)
           title,
           description,
           stylesheets,
           encrypted)
```

**关键特性**

- **Header 解析**：解析 XML 属性 — Encoding, GeneratedByEngineVersion, Encrypted, Title, Description, StyleSheet, Left2Right
- **StyleSheet 解析**：解析 `styleId\nprefix\nsuffix` 三行一组的样式表，运行时替换 `` `N` `` 占位符
- **编码处理**：支持 UTF-8, UTF-16LE, GBK, GB2312 (→GB18030) 编码检测与转换
- **解压缩**：
  - `0x00000000` — 无压缩 (raw bytes + Adler32 校验)
  - `0x01000000` — LZO1X 压缩
  - `0x02000000` — zlib 压缩
- **加密支持**：
  - `encrypted & 0x02` → RIPEMD128 解密 Key Block Index
  - 字节旋转 + XOR 解密算法
- **Memory Map**：大文件使用 mmap 避免全量加载

### F1.2 MDD 资源文件解析

- 与 MDX 共用相同的解析器结构
- 资源键名以 `\` 开头（Windows 路径风格）
- 支持分卷：`dict.mdd`, `dict.1.mdd`, `dict.2.mdd` ...
- 资源类型：CSS, JavaScript, 图片 (PNG/JPG/GIF/SVG/TIFF), 音频 (MP3/OGG/WAV/SPX), 字体 (TTF/WOFF/WOFF2)

### F1.3 索引构建

- **索引结构**：B-Tree（参考 GoldenDict 的 BtreeIndexing）或 FST (fst crate)
- **持久化**：索引序列化到磁盘，避免重复构建
- **增量检查**：比较源文件 mtime 与索引文件 mtime，决定是否重建
- **折叠 (Folding)**：大小写折叠、变音符号折叠用于模糊匹配
- **IndexedWords**：`HashMap<FoldedWord, Vec<WordArticleLink>>`
  - `WordArticleLink { word: String, article_offset: u32, prefix: String }`

### F1.4 API 设计

```rust
// 核心 trait
pub trait DictParser: Send + Sync {
    fn open(path: &Path) -> Result<Self> where Self: Sized;
    fn meta(&self) -> &DictMeta;
    fn lookup(&self, key: &str) -> Result<Option<Article>>;
    fn prefix_search(&self, prefix: &str, max: usize) -> Result<Vec<HeadWord>>;
    fn fuzzy_search(&self, query: &str, max: usize) -> Result<Vec<FuzzyMatch>>;
    fn resource(&self, name: &str) -> Result<Option<Vec<u8>>>;
}

pub struct DictMeta {
    pub title: String,
    pub description: String,
    pub encoding: String,
    pub word_count: u64,
    pub version: f64,
    pub lang_from: String,
    pub lang_to: String,
    pub rtl: bool,
    pub stylesheets: BTreeMap<i32, (String, String)>,
}

pub struct Article {
    pub headword: String,
    pub body: String,        // raw HTML
    pub rendered: String,    // CSS substituted + link rewritten
}

pub struct HeadWord {
    pub word: String,
    pub offset: u64,
}

pub struct FuzzyMatch {
    pub word: String,
    pub distance: u32,       // edit distance
    pub weight: i32,
}
```

### F1.5 Benchmark

- criterion.rs 基准测试覆盖:
  - `bench_open` — 打开词典文件
  - `bench_index_build` — 构建索引
  - `bench_prefix_search` — 前缀搜索
  - `bench_exact_lookup` — 精确查找
  - `bench_fuzzy_search` — 模糊搜索
  - `bench_resource_load` — 加载资源文件
  - `bench_decompress` — 各压缩格式解压性能对比
- 与 GoldenDict 的 C++ 实现做性能对比报告

---

## F2. 词典管理

### F2.1 词典导入

- **目录扫描**：递归扫描指定目录，发现所有 `.mdx` 文件
- **自动关联**：自动发现同目录同名 `.mdd` 文件及分卷
- **索引构建**：首次导入时后台异步构建索引，显示进度
- **延迟初始化**：词典对象创建后延迟加载索引数据，减少启动时间

### F2.2 词典分组

- **CRUD**：创建 / 读取 / 更新 / 删除词典分组
- **多归属**：一个词典可属于多个分组
- **组内排序**：拖拽调整词典在分组内的展示顺序
- **快速切换**：顶部下拉菜单切换当前活跃分组
- **默认分组**：「全部词典」虚拟分组包含所有已导入词典

### F2.3 词典元信息

- 词典名称 (可自定义重命名)
- 词条数量
- 源语言 / 目标语言
- 描述信息 (HTML 渲染)
- 文件路径
- 索引状态 (已索引/索引中/未索引)

---

## F3. 搜索

### F3.1 前缀搜索 (Prefix Match)

- 实时输入匹配，< 10ms 响应
- 结果按相关性排序：精确匹配 > 前缀匹配
- 去重：不同词典的相同词条合并
- 最大返回数量可配置 (默认 40)

### F3.2 模糊搜索 (Fuzzy Match)

- 编辑距离算法 (Levenshtein / Damerau-Levenshtein)
- 结果带距离权重排序
- 当前缀搜索无结果时自动降级为模糊搜索

### F3.3 词干匹配 (Stemmed Match)

- 允许后缀变化的匹配
- `min_length` — 最小匹配长度
- `max_suffix_variation` — 最大后缀变化量
- 用于形态变化丰富的语言 (英语动词变位等)

### F3.4 全文搜索 / 反向搜索 (FTS)

- 搜索词典释义内容 (而非仅词头)
- 基于 SQLite FTS5 或自建倒排索引
- 支持大小写敏感/不敏感
- 支持忽略变音符号
- 异步执行，支持取消

### F3.5 跳转搜索

- `@@@LINK=<target>` 内部重定向
- `entry://<word>` 词条间跳转
- `sound://<file>` 音频资源链接
- 递归重定向防环检测

---

## F4. 释义渲染

### F4.1 HTML 渲染

- 安全渲染词典 HTML 内容（XSS 防护）
- `<html>`, `<body>`, `<head>` 标签替换为自定义标签避免宿主页面干扰
- 内联 `<style>` 标签 CSS 隔离（词典 ID 作为 scope selector）

### F4.2 资源链接重写

| 原始链接 | 重写后 |
| --- | --- |
| `sound://word.mp3` | `gdau://{dict_id}/word.mp3` |
| `entry://word` | `gdlookup://localhost/word` |
| `<img src="pic.png">` | `<img src="bres://{dict_id}/pic.png">` |
| `<link href="style.css">` | `<link href="bres://{dict_id}/style.css">` |
| `//cdn.example.com/...` | `https://cdn.example.com/...` |

### F4.3 CSS 处理

- 词典内嵌 StyleSheet 替换 (`` `N` `` → prefix/suffix)
- CSS 文件编码检测 (BOM → UTF-8 验证 → 词典编码 → UTF-8 fallback)
- CSS 内 `url()` 链接重写为 `bres://` 协议
- `@font-face` 字体链接重写

### F4.4 多词典展示

- **滚动模式**：同一查询词在多个词典的释义纵向排列滚动
- **折叠/展开**：每个词典释义可独立折叠/展开
- **词典标签**：每段释义标注来源词典名称和图标
- **词典顺序**：按分组内排序展示

### F4.5 多媒体

- **图片**：内联渲染 PNG/JPG/GIF/SVG，TIFF 自动转换
- **音频**：MP3/OGG/WAV/SPX 播放，发音按钮
- **视频**：基础 HTML5 video 支持

---

## F5. 背单词

### F5.1 词库

**内置词库**

| 词库 | 语言 | 词数 (约) |
| --- | --- | --- |
| CET-4 | 英语 | 4,500 |
| CET-6 | 英语 | 5,500 |
| TEM-8 | 英语 | 13,000 |
| IELTS | 英语 | 5,000 |
| TOEFL | 英语 | 8,000 |
| GRE | 英语 | 6,000 |
| JLPT N1 | 日语 | 10,000 |
| JLPT N2 | 日语 | 6,000 |

**自定义词库**
- 手动添加单词
- 从 CSV/TXT 导入
- 查词时一键收藏

### F5.2 间隔重复

- **算法**：SM-2 为默认，可选 FSRS
- **参数**：ease_factor, interval, review_count, due_date
- **评分**：Again (1) / Hard (2) / Good (3) / Easy (4)
- **新词/复习词分离**：每日新学数量可配置

### F5.3 复习界面

- **卡片模式**：正面 (单词) → 翻转 → 背面 (释义 + 词典内容)
- **进度条**：当前进度 / 总量
- **批次统计**：本次复习的正确率
- **关联词典**：卡片背面可展示对应词典释义

### F5.4 学习统计

- 每日新学/复习数量折线图
- 掌握程度分布 (新词/学习中/已掌握)
- 连续学习天数 (streak)
- 遗忘曲线可视化

---

## F6. 系统与基础设施

### F6.1 本地存储 (SQLite)

```sql
-- 核心表结构
dictionaries    (id, name, path, encoding, word_count, lang_from, lang_to, ...)
dict_groups     (id, name, icon, sort_order)
dict_group_items(group_id, dict_id, sort_order)
word_books      (id, name, lang, builtin)
word_entries    (id, book_id, word, phonetic, translation)
review_records  (id, entry_id, ease_factor, interval, due_date, review_count, last_review)
search_history  (id, query, dict_group_id, created_at)
favorites       (id, word, dict_id, created_at)
settings        (key, value)
```

### F6.2 日志与链路追踪

- `tracing` crate 结构化日志
- `tracing-subscriber` 配置多层输出:
  - 控制台 (开发环境)
  - 文件 (生产环境，按日期轮转)
- Span 级别追踪：词典加载、索引构建、搜索请求
- 错误链路可追溯 (anyhow context)

### F6.3 错误处理

- `anyhow::Result` 统一错误类型
- 业务错误枚举 (thiserror)
- 前端友好的错误消息展示
- 词典解析错误不阻塞整体加载 (graceful degradation)

### F6.4 并发与性能

- `parking_lot::RwLock` 替代标准库锁
- `dashmap::DashMap` 并发缓存
- 延迟初始化 (Deferred Init) 模式
- 大文件 Memory Map (memmap2)
- Tauri IPC 大数据分块传输

---

## F7. UI/UX 设计规范

### F7.1 设计风格

- **Design System**：Material Design 3 (Material You)
- **配色方案**：Pastel 色调
  - Primary: Soft Lavender (#B8A9C9)
  - Secondary: Pastel Mint (#A8D5BA)
  - Tertiary: Warm Peach (#F5C7A9)
  - Surface: Off-White (#FAF9F6)
  - On-Surface: Charcoal (#2D2D2D)
- **圆角**：统一使用 12px-16px 圆角
- **阴影**：轻量 elevation (0-3 层)
- **字体**：Inter (Latin) / Noto Sans CJK (CJK)

### F7.2 动画设计

- **页面过渡**：Framer Motion shared layout animation
- **列表项**：stagger 入场动画 (50ms 间隔)
- **搜索结果**：fade-in + slide-up
- **卡片翻转**：3D perspective flip (背单词)
- **折叠/展开**：spring animation (stiffness: 300, damping: 30)
- **Tab 切换**：crossfade + scale
- **加载状态**：skeleton shimmer

### F7.3 布局结构

```
┌─────────────────────────────────────────────┐
│  Sidebar        │  Main Content              │
│  ┌───────────┐  │  ┌───────────────────────┐ │
│  │ Dict Groups│  │  │ Search Bar            │ │
│  │ ─ Group 1  │  │  ├───────────────────────┤ │
│  │ ─ Group 2  │  │  │ Candidate List        │ │
│  │ ─ ...      │  │  │ ┌──── word 1 ──────┐  │ │
│  ├───────────┤  │  │ │     word 2         │  │ │
│  │ Navigation │  │  │ └───────────────────┘  │ │
│  │ ─ 查词     │  │  ├───────────────────────┤ │
│  │ ─ 背单词   │  │  │ Dictionary Articles   │ │
│  │ ─ 词库     │  │  │ ┌── Dict A ────────┐  │ │
│  │ ─ 历史     │  │  │ │  (collapsible)    │  │ │
│  │ ─ 设置     │  │  │ ├── Dict B ────────┤  │ │
│  │            │  │  │ │  (collapsible)    │  │ │
│  └───────────┘  │  │ └───────────────────┘  │ │
│                  │  └───────────────────────┘ │
└─────────────────────────────────────────────┘
```
