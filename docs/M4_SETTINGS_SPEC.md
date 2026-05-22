# M4 — Settings & Dictionary Management 设计规格

---

## 1. 页面入口

| 入口 | 方式 |
|---|---|
| Sidebar → Settings | 点击导航项 `/settings` |
| Settings → Dictionaries → Manage | 跳转 `/settings/dicts` |
| 单个词典详情 | `/settings/dicts/:id` |

---

## 2. Settings 页面 (`/settings`)

### 布局

```
┌─ Header ───────────────────────────────────────────────────────┐
│  Settings                                                      │
└────────────────────────────────────────────────────────────────┘
┌─ Content (max-w 640px, centered) ──────────────────────────────┐
│                                                                │
│  APPEARANCE                                                    │
│  ──────────────────────────────────────────────────────────    │
│  Theme                               [Light | Dark | System]   │
│  Dictionary font size                [14 / 16 / 18 / 20]      │
│  UI language                         [Auto ▾]                  │
│                                                                │
│  DICTIONARIES                                                  │
│  ──────────────────────────────────────────────────────────    │
│  Manage dictionaries                 [N dicts loaded] [→]      │
│  Dict groups                         [N groups] [→]            │
│                                                                │
│  SEARCH                                                        │
│  ──────────────────────────────────────────────────────────    │
│  Fuzzy search threshold              [0.6 ▾]                   │
│  Max results                         [30  ]                    │
│  Auto-lookup first match             [toggle on]               │
│                                                                │
│  REVIEW                                                        │
│  ──────────────────────────────────────────────────────────    │
│  Algorithm                           [SM-2 ▾]                  │
│  New cards per day                   [20   ]                   │
│  Review cards per day                [100  ]                   │
│                                                                │
│  DATA                                                          │
│  ──────────────────────────────────────────────────────────    │
│  Index rebuild                       [Rebuild All]             │
│  Clear history                       [Clear]                   │
│  Export data                         [Export...]               │
│                                                                │
│  ABOUT                                                         │
│  ──────────────────────────────────────────────────────────    │
│  Version                             0.1.0                     │
│  Source                              [GitHub (ExternalLink)]   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 组件规格

| 元素 | 规格 |
|---|---|
| Section header | text-xs, font-semibold, uppercase, tracking-wide, text-secondary, mb-2 |
| Setting row | h-12, flex justify-between items-center, border-b border-border |
| Label | text-base, text-primary |
| Description (可选) | text-xs, text-tertiary, 显示在 label 下方 |
| Control: Dropdown | h-8, radius-sm, border, px-3, text-sm, ChevronDown 12px |
| Control: Input | h-8, radius-sm, border, px-3, w-20, text-sm, text-right |
| Control: Toggle | 36px × 20px, radius-full, 200ms ease-out-quart |
| Control: Button | h-8, radius-sm, px-4, text-sm, font-medium |
| Segment control | h-8, radius-sm, bg-surface-sunken, 内部按钮 radius-sm |
| Arrow link | h-12, hover:bg-surface-sunken, 右侧 ChevronRight 16px |
| Page max-width | 640px |
| Page padding | px-6, py-4 |

### 交互

- Theme segment 切换: 即时生效, CSS transition 300ms
- Font size: 即时预览 (body font-size 变量)
- Toggle: 200ms slide + track color shift
- Rebuild index: 弹确认 popover → 执行中显示 inline spinner → 完成 checkmark

---

## 3. 词典管理页面 (`/settings/dicts`)

### 布局

```
┌─ Header ───────────────────────────────────────────────────────┐
│  [Back] Dictionaries                        [+ Add Dictionary] │
└────────────────────────────────────────────────────────────────┘
┌─ Dict List (max-w 720px) ──────────────────────────────────────┐
│                                                                │
│  ┌─ Dict Card ───────────────────────────────────────────────┐ │
│  │  [dict-icon]  Oxford Advanced Learner's Dictionary        │ │
│  │               45,230 entries  •  MDX + MDD  •  12.3 MB    │ │
│  │               Custom CSS: yes  •  Custom JS: no           │ │
│  │                                              [Edit] [Del] │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─ Dict Card ───────────────────────────────────────────────┐ │
│  │  [dict-icon]  Longman Dictionary of Contemporary English  │ │
│  │               38,100 entries  •  MDX only  •  8.7 MB      │ │
│  │               Custom CSS: no  •  Custom JS: no            │ │
│  │                                              [Edit] [Del] │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  (Empty state: "No dictionaries imported yet")                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Dict Card 组件

| 属性 | 规格 |
|---|---|
| 容器 | radius-md, border, bg-surface-raised, p-4, hover:border-accent/30 |
| Dict icon | 40×40, radius-sm, bg-accent-subtle, text-accent, 首字母 |
| Title | text-base, font-medium, text-primary |
| Subtitle | text-sm, text-secondary, 用 `•` 分隔元数据 |
| Tags line | text-xs, text-tertiary, badge-style indicators |
| Actions | 右侧, Edit (Pencil icon) + Delete (Trash2 icon), hover 显示 |

### 操作

- **[+ Add Dictionary]**: 打开导入流程 (见第4节)
- **[Edit]**: 导航到 `/settings/dicts/:id` (词典详情)
- **[Del]**: Popover 确认 → 调用 `remove_dict` → 卡片 fade-out 移除

---

## 4. 添加词典流程 (`/settings/dicts/import`)

### Step 1: 选择文件夹

```
┌─ Import Dictionary ────────────────────────────────────────────┐
│                                                                │
│  [folder-icon]                                                 │
│  Select a folder containing .mdx dictionary files              │
│                                                                │
│  [Browse Folder...]                                            │
│                                                                │
│  Or drag & drop a folder / .mdx file here                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- Browse 点击: Tauri `dialog.open({ directory: true })`
- 拖拽支持: `tauri-plugin-drag-drop` 或 webview HTML5 drag

### Step 2: 扫描结果

```
┌─ Import Dictionary ────────────────────────────────────────────┐
│                                                                │
│  Found 5 dictionary files in /path/to/dicts                    │
│                                                                │
│  [x] Oxford Advanced (OALD.mdx)               45,230 entries  │
│  [x] Longman Contemporary (LDOCE.mdx)         38,100 entries  │
│  [ ] Collins COBUILD (collins.mdx)             32,500 entries  │
│  [x] Merriam-Webster (mw.mdx)                 28,000 entries  │
│  [ ] WordNet 3.1 (wordnet.mdx)                147,000 entries │
│                                                                │
│  Selected: 3                    [Cancel]  [Import Selected]    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

| 元素 | 规格 |
|---|---|
| 文件行 | h-11, flex, gap-3, hover:bg-surface-sunken |
| Checkbox | 16×16, radius-sm, accent when checked |
| 文件名 | text-base, text-primary |
| MDX 文件名 | text-xs, text-tertiary, mono font |
| 词条数 | text-sm, text-secondary, right-aligned |
| Import 按钮 | bg-accent, text-accent-text, radius-sm, h-9, px-4 |

### Step 3: 导入进度

```
┌─ Import Dictionary ────────────────────────────────────────────┐
│                                                                │
│  Importing dictionaries...                                     │
│                                                                │
│  [check] Oxford Advanced              Complete                 │
│  [=====>                  ] Longman    Building index... 45%   │
│  [    pending            ] Merriam-W  Waiting...               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

| 状态 | 视觉 |
|---|---|
| Pending | text-tertiary, "Waiting..." |
| Indexing | 3px progress bar (accent), 百分比, shimmer |
| Complete | Check icon (green/success), "Complete" |
| Error | AlertCircle icon (error), error message, [Retry] 按钮 |

### Step 4: 完成 → 自动跳转到词典列表

---

## 5. 词典详情/配置页面 (`/settings/dicts/:id`)

### 布局

```
┌─ Header ───────────────────────────────────────────────────────┐
│  [Back] Oxford Advanced Learner's Dictionary                   │
└────────────────────────────────────────────────────────────────┘
┌─ Content (max-w 720px) ────────────────────────────────────────┐
│                                                                │
│  INFORMATION                                                   │
│  ──────────────────────────────────────────────────────────    │
│  Title           Oxford Advanced Learner's Dictionary           │
│  Description     OALD 9th edition for English learners          │
│  Encoding        UTF-8                                          │
│  Entries         45,230                                         │
│  File            /Users/.../OALD.mdx                            │
│  MDD             Yes (OALD.mdd)                                 │
│  File size       12.3 MB                                        │
│  Imported        2024-03-15 14:30                               │
│                                                                │
│  DISPLAY                                                       │
│  ──────────────────────────────────────────────────────────    │
│  Display name    [Oxford Advanced           ]  (editable)      │
│  Priority        [1 ▾]  (1=highest, within group)              │
│  Dark mode       [Auto | Invert | Custom CSS | Off]            │
│                                                                │
│  CUSTOM CSS                                                    │
│  ──────────────────────────────────────────────────────────    │
│  ┌─ Code Editor ────────────────────────────────────────────┐  │
│  │  /* Custom styles injected into article iframe */         │  │
│  │  .entry-body { font-size: 15px; }                         │  │
│  │  .phonetic { color: oklch(0.545 0.18 280); }              │  │
│  │  img.thumb { display: none; }                             │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [Reset to Default]                                 [Save CSS] │
│                                                                │
│  CUSTOM JS                                                     │
│  ──────────────────────────────────────────────────────────    │
│  [toggle: Enable custom JS]                                    │
│  ┌─ Code Editor ────────────────────────────────────────────┐  │
│  │  // Runs inside article iframe after HTML loads           │  │
│  │  // Use for DOM manipulation, collapsing sections, etc.   │  │
│  │  document.querySelectorAll('.example').forEach(el => {     │  │
│  │    el.addEventListener('click', () => {                    │  │
│  │      el.classList.toggle('collapsed');                     │  │
│  │    });                                                    │  │
│  │  });                                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [Reset to Default]                                  [Save JS] │
│                                                                │
│  PREVIEW                                                       │
│  ──────────────────────────────────────────────────────────    │
│  Preview word: [apple          ] [Preview]                     │
│  ┌─ Preview Frame ──────────────────────────────────────────┐  │
│  │  (iframe preview with CSS + JS applied)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
│  DANGER ZONE                                                   │
│  ──────────────────────────────────────────────────────────    │
│  Rebuild index               [Rebuild]                         │
│  Remove dictionary           [Remove Dictionary]               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 5.1 Information Section

只读信息面板, 展示词典元数据:

| 字段 | 来源 | 格式 |
|---|---|---|
| Title | DictMeta.title | text |
| Description | DictMeta.description | text, 空时显示 "—" |
| Encoding | DictMeta.encoding | badge |
| Entries | DictMeta.word_count | number, 千位逗号 |
| File | DictMeta.path | mono font, truncate, hover 显示全路径 tooltip |
| MDD | DictMeta.has_mdd | Yes/No badge |
| File size | 文件系统读取 | 格式化 (KB/MB/GB) |
| Imported | 数据库记录时间 | relative time + absolute tooltip |

### 5.2 Display Section

| 设置 | 控件 | 说明 |
|---|---|---|
| Display name | text input | 自定义展示名称, 默认同 title |
| Priority | dropdown (1-10) | 同组内排序, 1=最高优先级 |
| Dark mode | segment control | Auto=跟随系统, Invert=CSS filter, Custom CSS=使用暗色 CSS, Off=不处理 |

### 5.3 Custom CSS Section

**用途**: 注入自定义 CSS 到文章 iframe, 用于:
- 修改字体大小/行高
- 隐藏不需要的元素 (广告、无用图标)
- 调整颜色/间距
- 暗色模式适配

**Code Editor 组件**:

| 属性 | 规格 |
|---|---|
| 高度 | min-h 120px, max-h 300px, resizable (drag bottom edge) |
| 字体 | font-mono (JetBrains Mono), 13px |
| 背景 | surface-sunken |
| 边框 | border, radius-md |
| 行号 | 左侧, text-tertiary, w-8 |
| 语法高亮 | CSS 关键词着色 (可用 lightweight highlighter) |
| 保存 | Cmd+S 快捷键 + [Save CSS] 按钮 |
| 重置 | 恢复为空字符串 |

**存储**: 存储在 SQLite `dict_config` 表:
```sql
CREATE TABLE dict_config (
  dict_id TEXT PRIMARY KEY,
  display_name TEXT,
  priority INTEGER DEFAULT 5,
  dark_mode TEXT DEFAULT 'auto',
  custom_css TEXT DEFAULT '',
  custom_js TEXT DEFAULT '',
  js_enabled INTEGER DEFAULT 0,
  FOREIGN KEY (dict_id) REFERENCES dicts(id)
);
```

### 5.4 Custom JS Section

**用途**: 注入自定义 JavaScript 到文章 iframe, 用于:
- 折叠/展开词典内部分区
- 自动展开特定元素
- DOM 后处理 (移除元素、重排结构)
- 添加交互行为

**安全模型**:
- JS 仅在 iframe 内执行 (sandbox="allow-scripts allow-same-origin")
- 与主应用完全隔离
- 用户必须手动启用 toggle (默认关闭)
- 启用时显示警告提示: "Custom JS runs inside the article frame. Only use trusted scripts."

**执行时机**: HTML 加载完成后 (`DOMContentLoaded` 在 iframe 内)

| 属性 | 规格 |
|---|---|
| Toggle | 顶部启用开关, 关闭时 editor 灰显 (opacity 0.5, pointer-events none) |
| Editor | 同 CSS editor 规格, 语法高亮为 JS |
| 保存 | Cmd+S + [Save JS] |
| 警告 | info-style banner, 蓝色 accent |

### 5.5 Preview Section

| 属性 | 规格 |
|---|---|
| Preview input | text input, 默认值 "apple" |
| Preview button | h-8, 触发 lookup 单本词典 |
| Preview frame | 与正式 ArticleFrame 相同, 应用 custom CSS + JS |
| 高度 | min-h 200px, max-h 400px |
| 边框 | border, radius-md |

**功能**: 输入单词 → 调用后端 lookup (限定该词典) → 渲染 HTML + 注入 CSS/JS → 实时预览效果

### 5.6 Danger Zone

| 操作 | 控件 | 行为 |
|---|---|---|
| Rebuild index | Button (warning style) | 删除缓存重建 FST, 显示进度 |
| Remove dictionary | Button (error style) | Popover 确认 → 删除数据库记录 + unload → 返回列表 |

---

## 6. 组件清单

### 新增 Pages

| 组件 | 路由 | 职责 |
|---|---|---|
| `SettingsPage` | `/settings` | 设置列表 |
| `DictListPage` | `/settings/dicts` | 词典列表 + 添加入口 |
| `DictDetailPage` | `/settings/dicts/:id` | 词典详情/配置 |
| `DictImportPage` | `/settings/dicts/import` | 导入流程 |

### 新增 Components

| 组件 | 文件 | 职责 |
|---|---|---|
| `SettingRow` | `components/settings/SettingRow.tsx` | 单行设置 (label + control) |
| `SettingSection` | `components/settings/SettingSection.tsx` | 设置分组 (header + rows) |
| `SegmentControl` | `components/ui/SegmentControl.tsx` | 分段选择器 |
| `Toggle` | `components/ui/Toggle.tsx` | 开关切换 |
| `Select` | `components/ui/Select.tsx` | 下拉选择 |
| `DictCard` | `components/settings/DictCard.tsx` | 词典卡片 |
| `CodeEditor` | `components/settings/CodeEditor.tsx` | 轻量代码编辑器 |
| `ImportStepper` | `components/settings/ImportStepper.tsx` | 导入步骤进度 |
| `ImportFileItem` | `components/settings/ImportFileItem.tsx` | 扫描结果文件行 |
| `PreviewFrame` | `components/settings/PreviewFrame.tsx` | 词典预览 iframe |
| `ConfirmPopover` | `components/ui/ConfirmPopover.tsx` | 确认操作弹窗 |

---

## 7. 新增后端接口需求

### 需要新增的 Tauri Commands

```rust
// 词典配置 CRUD
#[tauri::command]
fn get_dict_config(dict_id: String) -> Result<DictConfig>;

#[tauri::command]
fn update_dict_config(dict_id: String, config: DictConfigUpdate) -> Result<()>;

// 词典信息扩展
#[tauri::command]
fn get_dict_file_info(dict_id: String) -> Result<DictFileInfo>;

// 重建单个词典索引
#[tauri::command]
fn rebuild_dict_index(dict_id: String) -> Result<()>;

// 重建所有索引
#[tauri::command]
fn rebuild_all_indexes() -> Result<()>;
```

### 新增数据结构

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictConfig {
    pub dict_id: DictId,
    pub display_name: Option<String>,
    pub priority: i32,
    pub dark_mode: DarkModeStrategy,
    pub custom_css: String,
    pub custom_js: String,
    pub js_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DarkModeStrategy {
    Auto,       // 跟随系统设置
    Invert,     // CSS filter: invert(1) hue-rotate(180deg)
    CustomCss,  // 使用 custom_css 中的暗色样式
    Off,        // 不处理
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictConfigUpdate {
    pub display_name: Option<String>,
    pub priority: Option<i32>,
    pub dark_mode: Option<DarkModeStrategy>,
    pub custom_css: Option<String>,
    pub custom_js: Option<String>,
    pub js_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictFileInfo {
    pub file_size: u64,
    pub mdd_file_size: Option<u64>,
    pub imported_at: String,
    pub last_indexed_at: Option<String>,
}
```

---

## 8. ArticleFrame 更新

当前 ArticleFrame 需要扩展以支持 per-dict CSS/JS 注入:

```ts
interface ArticleFrameProps {
  html: string;
  dictId: string;
  customCss?: string;    // 新增: 注入 CSS
  customJs?: string;     // 新增: 注入 JS
  jsEnabled?: boolean;   // 新增: JS 是否启用
  className?: string;
}
```

**注入顺序** (在 processHtml 中):
1. Base styles (已有)
2. Custom CSS (`<style>` tag)
3. HTML content
4. Custom JS (`<script>` tag, 仅 jsEnabled=true 且 sandbox 含 allow-scripts)

**iframe sandbox 调整**:
- 无 JS: `sandbox="allow-same-origin"`
- 有 JS: `sandbox="allow-same-origin allow-scripts"`

---

## 9. 设置持久化 (Zustand persist)

```ts
// stores/settingsStore.ts
interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  dictFontSize: number;   // 14 | 16 | 18 | 20
  uiLanguage: string;     // 'auto' | 'en' | 'zh'
  fuzzyThreshold: number; // 0.4 - 0.9
  maxResults: number;     // 10 - 100
  autoLookupFirst: boolean;
  reviewAlgorithm: 'sm2' | 'fsrs';
  newCardsPerDay: number;
  reviewCardsPerDay: number;
}
```

使用 `zustand/middleware` 的 `persist` 将设置存入 localStorage (或 Tauri fs):

```ts
import { persist } from 'zustand/middleware';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({ /* ... */ }),
    { name: 'memowords-settings' }
  )
);
```

---

## 10. 动画规格

| 元素 | 动画 | 时长 | 曲线 |
|---|---|---|---|
| Page transition (settings sub-routes) | slideX 8px + opacity | 250ms | ease-out-expo |
| Dict card hover | border-color shift | 150ms | ease-out-quart |
| Dict card remove | height→0 + opacity→0 | 300ms | ease-out-expo |
| Import progress bar | width animate | continuous | linear |
| Toggle switch | knob translateX + track bg | 200ms | ease-out-quart |
| Segment indicator | left + width | 200ms | ease-out-expo |
| Code editor focus | border-color → accent | 120ms | ease-out-quart |
| Preview load | opacity 0→1 | 200ms | ease-out-quart |

---

## 11. 路由结构

```ts
// App.tsx routes addition
<Route path="settings" element={<SettingsPage />} />
<Route path="settings/dicts" element={<DictListPage />} />
<Route path="settings/dicts/import" element={<DictImportPage />} />
<Route path="settings/dicts/:id" element={<DictDetailPage />} />
```

---

## 12. 实现顺序

| Phase | 任务 | 依赖 |
|---|---|---|
| M4.1 | UI 基础组件 (Toggle, Select, SegmentControl, ConfirmPopover) | — |
| M4.2 | SettingsPage + settingsStore (persist) | M4.1 |
| M4.3 | DictListPage + DictCard | M4.2 |
| M4.4 | DictImportPage (3-step flow) | M4.3 |
| M4.5 | 后端: dict_config 表 + CRUD commands | — |
| M4.6 | DictDetailPage (info + display settings) | M4.3, M4.5 |
| M4.7 | CodeEditor component | — |
| M4.8 | CSS/JS 注入 + ArticleFrame 升级 | M4.6, M4.7 |
| M4.9 | Preview + 实时预览 | M4.8 |
| M4.10 | Dict group editor (drag-and-drop) | M4.3 |

---

## 13. 待决策项

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| 1 | Code Editor 实现 | textarea + 手动行号 vs CodeMirror 6 vs Monaco | **textarea + 行号** (轻量, 文件小, 够用) |
| 2 | 设置存储位置 | localStorage vs SQLite | **localStorage** (前端设置), SQLite (dict_config) |
| 3 | 导入进度通信 | polling vs Tauri event | **Tauri event** (emit progress) |
| 4 | 拖拽排序库 | @dnd-kit vs react-beautiful-dnd | **@dnd-kit** (更现代, 支持好) |
