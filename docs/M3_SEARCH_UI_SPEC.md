# M3 — 前端查词 UI 功能规格

> 基于 DESIGN_SPEC.md 视觉系统 + 已实现的后端 Tauri Commands

---

## 1. 总览

### 页面结构

```
App
├── AppShell (sidebar + main)
│   ├── Sidebar (已有骨架)
│   └── Routes
│       ├── / → LookupPage (本次重点)
│       ├── /review → ReviewPage (M5)
│       ├── /wordbooks → WordBooksPage (M5)
│       ├── /history → HistoryPage (本次)
│       └── /settings → SettingsPage (M4)
```

### 技术栈 (已配置)

| 类别 | 选型 |
|---|---|
| 框架 | React 19 + TypeScript 5 |
| 路由 | react-router-dom 7 |
| 样式 | TailwindCSS 4 (design tokens via @theme) |
| 动画 | Framer Motion 12 |
| 状态 | Zustand 5 |
| 图标 | Lucide React |
| IPC | @tauri-apps/api invoke |
| 测试 | Vitest + Testing Library |

---

## 2. 状态管理 (Zustand Stores)

### `searchStore`

```ts
interface SearchStore {
  // State
  query: string;
  candidates: SearchCandidate[];
  selectedIndex: number;
  isSearching: boolean;
  searchMode: 'prefix' | 'fuzzy';

  // Article state
  currentWord: string;
  articles: DictArticle[];
  isLoadingArticles: boolean;

  // Actions
  setQuery: (q: string) => void;
  search: (q: string) => Promise<void>;
  selectCandidate: (index: number) => void;
  lookup: (word: string) => Promise<void>;
  clear: () => void;
  moveSelection: (direction: 'up' | 'down') => void;
}
```

### `dictStore`

```ts
interface DictStore {
  dicts: DictMeta[];
  groups: DictGroup[];
  activeGroupId: string | null; // null = all dicts

  loadDicts: () => Promise<void>;
  loadGroups: () => Promise<void>;
  setActiveGroup: (id: string | null) => void;
}
```

### `uiStore`

```ts
interface UiStore {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  theme: 'light' | 'dark' | 'system';

  toggleSidebar: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}
```

---

## 3. Tauri IPC 封装层

```ts
// src/lib/tauri.ts
import { invoke } from '@tauri-apps/api/core';

export const api = {
  scanDicts: (dir: string) => invoke<string[]>('scan_dicts', { dir }),
  importDict: (mdxPath: string) => invoke<DictMeta>('import_dict', { mdxPath }),
  listDicts: () => invoke<DictMeta[]>('list_dicts'),
  removeDict: (dictId: string) => invoke<void>('remove_dict', { dictId }),

  search: (query: string, groupId?: string, limit?: number) =>
    invoke<SearchCandidate[]>('search', { query, groupId, limit }),
  fuzzySearch: (query: string, groupId?: string, limit?: number) =>
    invoke<SearchCandidate[]>('fuzzy_search', { query, groupId, limit }),
  lookup: (word: string, groupId?: string) =>
    invoke<DictArticle[]>('lookup', { word, groupId }),
  getResource: (dictId: string, path: string) =>
    invoke<number[] | null>('get_resource', { dictId, path }),

  listGroups: () => invoke<DictGroup[]>('list_groups'),
  createGroup: (name: string, dictIds: string[]) =>
    invoke<DictGroup>('create_group', { name, dictIds }),
  updateGroup: (id: string, name: string, dictIds: string[]) =>
    invoke<void>('update_group', { id, name, dictIds }),
  deleteGroup: (id: string) => invoke<void>('delete_group', { id }),
};
```

---

## 4. 组件清单

### 4.1 Layout 层 (已有骨架，需完善)

| 组件 | 文件 | 职责 |
|---|---|---|
| `AppShell` | `components/layout/AppShell.tsx` | 全局布局壳 |
| `Sidebar` | `components/layout/Sidebar.tsx` | 导航 + 词典组切换 |
| `DictGroupSwitcher` | `components/layout/DictGroupSwitcher.tsx` | 底部分组选择器 popover |

### 4.2 Search 组件

| 组件 | 文件 | 职责 |
|---|---|---|
| `SearchBar` | `components/search/SearchBar.tsx` | 实际搜索输入框 (sticky) |
| `CommandPalette` | `components/search/CommandPalette.tsx` | ⌘K 全局搜索浮层 |
| `CandidateList` | `components/search/CandidateList.tsx` | 左侧候选词列表 |
| `CandidateItem` | `components/search/CandidateItem.tsx` | 单个候选词行 |

### 4.3 Article 组件

| 组件 | 文件 | 职责 |
|---|---|---|
| `ArticleView` | `components/article/ArticleView.tsx` | 右侧释义容器 |
| `DictTabBar` | `components/article/DictTabBar.tsx` | 词典标签栏 (sticky) |
| `DictSection` | `components/article/DictSection.tsx` | 单词典释义区块 |
| `ArticleFrame` | `components/article/ArticleFrame.tsx` | 沙箱 iframe 渲染 HTML |
| `AudioButton` | `components/article/AudioButton.tsx` | 发音按钮 |

### 4.4 History 组件

| 组件 | 文件 | 职责 |
|---|---|---|
| `HistoryPage` | `pages/HistoryPage.tsx` | 历史记录页面 |
| `HistoryList` | `components/history/HistoryList.tsx` | 按日期分组的历史列表 |
| `HistoryItem` | `components/history/HistoryItem.tsx` | 单条历史记录行 |

### 4.5 通用 UI 组件

| 组件 | 文件 | 职责 |
|---|---|---|
| `Skeleton` | `components/ui/Skeleton.tsx` | 骨架屏 shimmer |
| `EmptyState` | `components/ui/EmptyState.tsx` | 空状态占位 |
| `Kbd` | `components/ui/Kbd.tsx` | 键盘快捷键标签 |
| `Popover` | `components/ui/Popover.tsx` | 弹出气泡层 |

---

## 5. 页面详细设计

### 5.1 LookupPage — 查词主页

**URL**: `/`

**布局**:
```
┌─ SearchBar (sticky top, 48px) ─────────────────────────────┐
│ [Search icon] [input]                                [X]    │
└─────────────────────────────────────────────────────────────┘
┌─ CandidateList (280px) ──┬─ ArticleView (flex-1) ──────────┐
│  候选词列表               │  DictTabBar (sticky)             │
│                          │  DictSection × N                 │
└──────────────────────────┴──────────────────────────────────┘
```

**交互流程**:

1. **初始态** — 空搜索框 + 居中空状态提示 "Type a word to look it up"
2. **输入搜索** — 防抖 200ms，调用 `api.search(query, groupId, 30)`
3. **展示候选** — 左侧填充 CandidateList，第一项自动选中
4. **选中候选** — 自动触发 `api.lookup(word, groupId)` 加载释义
5. **键盘导航** — ↑↓ 切换候选，Enter 确认（已选中则跳到释义），Esc 清空
6. **无结果** — 自动 fallback 到 fuzzy search，显示 "Did you mean..." 建议
7. **收藏** — TopBar 右侧星标按钮，添加到当前词库

**状态机**:
```
idle → searching → has_results / no_results
has_results → selecting → loading_article → showing_article
```

### 5.2 CommandPalette — 全局快速搜索

**触发**: `⌘K` / `Ctrl+K` / 点击 Sidebar 搜索触发区

**行为**:
- 覆盖 overlay，560px 宽，居中偏上 (20% from top)
- 即时搜索（同 SearchBar 逻辑）
- Enter 选中 → 关闭浮层 + 跳转 LookupPage + 执行 lookup
- Esc → 关闭
- 支持 "最近查询" 作为默认列表 (query 为空时)

### 5.3 HistoryPage — 历史页

**URL**: `/history`

**功能**:
- 按日期分组展示（今天 / 昨天 / 更早）
- 点击条目 → 跳转 LookupPage 并执行查询
- 右上角 "Clear All" 按钮 (弹 confirm popover)
- 单条删除 (hover 显示删除按钮 / 左滑)

---

## 6. 关键交互细节

### 6.1 SearchBar

| 属性 | 值 |
|---|---|
| 高度 | 48px |
| Position | sticky top, z-10 |
| 防抖 | 200ms |
| 自动聚焦 | 页面加载时 focus |
| 快捷键 | `/` 聚焦到搜索框, `Esc` 清空并 blur |
| 清空按钮 | 输入非空时右侧显示 X (Lucide `X`) |

### 6.2 CandidateList

| 属性 | 值 |
|---|---|
| 宽度 | 280px (fixed) |
| 滚动 | 独立垂直滚动, 自定义滚动条 (4px) |
| 每项高度 | 36px |
| Loading | 5 个 Skeleton item, shimmer |
| Empty | "No matches found" + "Try a different spelling" |
| 最大显示 | 30 条候选 |
| 入场动画 | stagger fade-slide, 30ms delay, max 8 items |

### 6.3 CandidateItem

| 属性 | 值 |
|---|---|
| 左侧 | headword (text-base, weight 400/500 active) |
| 右侧 | dict name badge (text-xs, pill) — 仅 CommandPalette 显示 |
| Hover | surface-sunken bg, 100ms |
| Active | accent-subtle bg + accent text + 2px left indicator |

### 6.4 ArticleView

| 属性 | 值 |
|---|---|
| DictTabBar | sticky 标签栏, 水平滚动, 底部 2px 指示器滑动 |
| DictSection | 间距 24px, header sticky, 可折叠 |
| 渲染方式 | sandboxed iframe (srcdoc) |
| 最大行宽 | 75ch (prose content) |
| 图片 | max-width 100% |
| 音频 | Volume2 按钮 inline, accent 色 (Lucide `Volume2`) |
| Loading | 每个 DictSection 独立 skeleton |
| 空态 | "No definition available" |

### 6.5 ArticleFrame (iframe 安全渲染)

```ts
interface ArticleFrameProps {
  html: string;        // raw dict HTML
  dictId: string;      // for resource loading
  className?: string;
}
```

**安全策略**:
- `sandbox="allow-same-origin"` (不含 allow-scripts)
- 拦截 `entry://` 链接 → 触发重新查词
- 拦截 `sound://` 链接 → 播放音频资源
- CSS 注入: 基础排版样式 + 暗色模式适配
- 图片 src 重写: 相对路径 → 调用 `api.getResource`

### 6.6 资源协议处理

注册 Tauri 自定义协议 `mdict://`, iframe 中直接通过 URL 访问资源。

**后端注册** (Rust, `lib.rs` setup):
```rust
// 注册 mdict:// 协议
// URL 格式: mdict://{dict_id}/{resource_path}
app.register_uri_scheme_protocol("mdict", |_app, request| {
    // 解析 dict_id + path → load_resource → 返回 response
});
```

**前端重写规则** (ArticleFrame 预处理 HTML):
- `src="xxx.png"` → `src="mdict://{dictId}/xxx.png"`
- `href="xxx.css"` → `href="mdict://{dictId}/xxx.css"`
- `sound://path.mp3` → `mdict://{dictId}/path.mp3` (audio src)

| 协议 | 行为 |
|---|---|
| `mdict://{dictId}/{path}` | Tauri protocol handler → `SearchEngine::load_resource` → HTTP response |
| `entry://word` | 前端拦截 link click → `searchStore.lookup(word)` |
| `sound://path` | 重写为 `mdict://` + `<audio>` 播放 |
| `@@@LINK=target` | 后端已处理, 前端无需关心 |

---

## 7. 键盘快捷键

| 快捷键 | 范围 | 行为 |
|---|---|---|
| `⌘K` / `Ctrl+K` | 全局 | 打开 CommandPalette |
| `Esc` | CommandPalette | 关闭 |
| `Esc` | SearchBar focused | 清空搜索 |
| `/` | 非输入焦点时 | 聚焦 SearchBar |
| `↑` / `↓` | CandidateList | 切换选中候选 |
| `Enter` | CandidateList | 确认查词 |
| `⌘\` / `Ctrl+\` | 全局 | 折叠/展开 Sidebar |
| `⌘[` / `Ctrl+[` | 全局 | 历史后退 (上一个查过的词) |
| `⌘]` / `Ctrl+]` | 全局 | 历史前进 |

---

## 8. 动画规格

| 元素 | 触发 | 动画 | 时长 | 曲线 |
|---|---|---|---|---|
| CommandPalette 开 | ⌘K | scale(0.98→1) + opacity | 250ms | ease-out-expo |
| CommandPalette 关 | Esc | scale(1→0.98) + opacity | 150ms | ease-out-quart |
| Backdrop | 开/关 | opacity | 200ms/150ms | ease-out-quart |
| Candidate items | 新结果 | translateY(4px→0) + opacity, stagger 30ms | 150ms | ease-out-expo |
| DictSection 折叠 | 点击 chevron | grid-template-rows 1fr→0fr | 350ms | ease-out-expo |
| DictTabBar 指示器 | 切换 tab | left + width | 250ms | ease-out-expo |
| Article 内容入场 | 加载完成 | opacity 0→1 | 200ms | ease-out-quart |
| Sidebar 折叠 | toggle | width, label opacity | 350ms | ease-out-expo |

---

## 9. 响应式行为

| 窗口宽度 | 布局 |
|---|---|
| ≥ 1200px | Sidebar 240px + CandidateList 280px + ArticleView |
| 900–1199px | Sidebar 56px (collapsed) + CandidateList + ArticleView |
| < 900px | Sidebar 56px, CandidateList 隐藏 (仅 CommandPalette 搜索), ArticleView 全宽 |

---

## 10. 文件结构规划

```
src/
├── lib/
│   ├── tauri.ts            — IPC invoke 封装 + 类型
│   └── utils.ts            — debounce, classnames 等工具
├── stores/
│   ├── searchStore.ts      — 搜索 + 查词状态
│   ├── dictStore.ts        — 词典/分组状态
│   └── uiStore.ts          — UI 偏好状态
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── DictGroupSwitcher.tsx
│   ├── search/
│   │   ├── SearchBar.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── CandidateList.tsx
│   │   └── CandidateItem.tsx
│   ├── article/
│   │   ├── ArticleView.tsx
│   │   ├── DictTabBar.tsx
│   │   ├── DictSection.tsx
│   │   ├── ArticleFrame.tsx
│   │   └── AudioButton.tsx
│   ├── history/
│   │   ├── HistoryList.tsx
│   │   └── HistoryItem.tsx
│   └── ui/
│       ├── Skeleton.tsx
│       ├── EmptyState.tsx
│       ├── Kbd.tsx
│       └── Popover.tsx
├── pages/
│   ├── LookupPage.tsx
│   ├── HistoryPage.tsx
│   └── SettingsPage.tsx    (stub)
├── hooks/
│   ├── useDebounce.ts
│   ├── useHotkey.ts
│   └── useScrollIntoView.ts
├── types/
│   └── index.ts            — TS 类型 (DictMeta, DictArticle, etc.)
├── styles/
│   └── index.css           — design tokens (已有)
├── App.tsx
└── main.tsx
```

---

## 11. 类型定义

```ts
// src/types/index.ts

export interface DictId {
  id: string;
}

export interface DictMeta {
  id: { "0": string };   // serialized from Rust DictId(String)
  title: string;
  description: string | null;
  encoding: string;
  path: string;
  has_mdd: boolean;
  word_count: number;
}

export interface DictGroup {
  id: { "0": string };
  name: string;
  dict_ids: { "0": string }[];
}

export interface SearchCandidate {
  headword: string;
  dict_id: { "0": string };
  dict_name: string;
}

export interface DictArticle {
  dict_id: { "0": string };
  dict_name: string;
  headword: string;
  html: string;
}
```

---

## 12. 实现顺序 (建议)

| Phase | 任务 | 产出 |
|---|---|---|
| **1** | IPC 封装 + 类型 + Stores | `lib/tauri.ts`, `types/`, `stores/` |
| **2** | SearchBar + CandidateList | 能打字、能展示候选词 |
| **3** | ArticleView + DictSection | 能渲染释义 HTML |
| **4** | CommandPalette (⌘K) | 全局快搜浮层 |
| **5** | 键盘导航 + 动画 | ↑↓ 选词, stagger, 折叠 |
| **6** | ArticleFrame + 资源加载 | iframe 安全渲染 + 图片/音频 |
| **7** | DictGroupSwitcher | Sidebar 分组切换 |
| **8** | HistoryPage | 历史记录 |
| **9** | 响应式 + 暗色模式 | breakpoint 适配 |
| **10** | 测试 | Vitest 组件 + E2E |

---

## 13. 性能要求

| 指标 | 目标 |
|---|---|
| 搜索响应 (输入到候选出现) | < 50ms (后端 < 10ms + IPC + render) |
| Article 渲染 (lookup 到可见) | < 200ms |
| CommandPalette 弹出 | < 16ms (一帧内) |
| CandidateList 虚拟化阈值 | > 100 项时启用 virtualization |
| 内存 (10 词典加载) | < 200MB RSS |

---

## 14. 待决策项

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| 1 | Article 渲染: iframe vs DOMPurify 直出 | iframe 隔离更安全; 直出性能更好 | **iframe** — 词典 CSS 可能冲突主界面 |
| 2 | 资源加载: Tauri protocol handler vs invoke | protocol 更优雅但配置复杂; invoke 简单 | **protocol** — 注册自定义协议, iframe 直接引用 |
| 3 | CandidateList 虚拟滚动库 | @tanstack/virtual vs react-window | @tanstack/virtual (轻量, hooks) |
| 4 | 暗色模式文章适配 | CSS filter invert vs 注入 dark CSS | 可配置 per-dict, 默认 filter |
