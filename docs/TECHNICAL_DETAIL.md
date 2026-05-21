# MemoWords — 技术细节设计文档

> 本文档详述 MDX/MDD 解析全流程、资源整合、CSS/JS 处理、安全性、@@@LINK 解析、多词条去重、前端渲染管线等关键实现细节。所有流程均基于 GoldenDict-ng 参考实现的逆向分析。

---

## 1. MDX 二进制格式与解析流程

### 1.1 文件结构总览

```
┌───────────────────────────────────────┐
│  Header Section                       │  ← 字典元信息 (XML)
├───────────────────────────────────────┤
│  Key Block Header                     │  ← 词头块统计信息
├───────────────────────────────────────┤
│  Key Block Info (Compressed)          │  ← 每个块的 compressed/decompressed size
├───────────────────────────────────────┤
│  Key Blocks (N blocks, Compressed)    │  ← 词头 + offset 列表
├───────────────────────────────────────┤
│  Record Block Header                  │  ← 记录块统计信息
├───────────────────────────────────────┤
│  Record Block Info                    │  ← 每条记录的 compressed/decompressed size
├───────────────────────────────────────┤
│  Record Blocks (M blocks, Compressed) │  ← 释义 HTML 内容
└───────────────────────────────────────┘
```

### 1.2 Header 解析

```
读取流程:
  1. read_i32_be()        → header_text_size (字节)
  2. read_bytes(size)     → header_text_utf16le (原始字节)
  3. read_u32_le()        → adler32_checksum
  4. verify adler32(header_text_utf16le) == checksum
  5. decode UTF-16LE → header_text (XML 字符串)
  6. 解析 XML 属性
```

**XML 属性提取表**:

| 属性 | 说明 | 处理逻辑 |
| --- | --- | --- |
| `Encoding` | 词条编码 | `GBK`/`GB2312` → `GB18030`；空/`UTF-16` → `UTF-16LE` |
| `GeneratedByEngineVersion` | 格式版本 | `< 2.0` → 数字用 4 字节 u32；`≥ 2.0` → 8 字节 i64 |
| `Encrypted` | 加密标记 | `& 0x02` 时需要 RIPEMD128 解密 Key Block Info |
| `Title` | 词典标题 | 空或 `"Title (No HTML code allowed)"` → 用文件名；含 HTML → 去标签 |
| `Description` | 词典描述 | 原始 HTML，后续渲染时处理 |
| `StyleSheet` | 内嵌样式表 | 特殊格式，见 §1.3 |
| `Left2Right` | 文字方向 | `"Yes"` → LTR，否则 RTL |

**关键细节**:
- Header text 可能包含 Unicode 控制字符 (`\p{C}`)，必须在 XML 解析前清除，否则 XML parser 会失败
- `StyleSheet` 属性值包含控制字符和嵌套引号，必须用正则 `StyleSheet="([^"]*?)"` 单独提取，**不能**依赖 XML parser 的属性解析

### 1.3 StyleSheet 解析

StyleSheet 是 MDX 独有的 CSS 占位机制，格式为三行一组：

```
styleId\n        ← 整数 ID (1-255)
style.prefix\n   ← 开始标签/CSS（HTML entity 编码）
style.suffix\n   ← 结束标签/CSS（HTML entity 编码）
```

**存储**: `BTreeMap<i32, (String, String)>` — key 为 styleId，value 为 (prefix, suffix)

**运行时替换**: 词条 HTML 中 `` `N` `` (反引号包裹的数字) 会被替换:
```
`1` → prefix_1    (下一个 `M` 之前追加 suffix_1)
`2` → prefix_2
...
```

替换算法要点：
- 逐个匹配 `` `(\d+)` `` 正则
- 遇到新的 styleId 时，先关闭上一个的 suffix，再插入新的 prefix
- 最后拼接末尾的 suffix
- 未匹配的 styleId 仅关闭上一个 suffix

### 1.4 Key Block 解析

#### Key Block Header

```
v2.0:
  read_i64_be() → num_key_blocks       (词头块数量)
  read_i64_be() → num_entries           (总词条数)
  read_i64_be() → decompressed_size     (解压后大小, v2.0 only)
  read_i64_be() → key_block_info_size   (压缩后 info 大小)
  read_i64_be() → key_block_data_size   (所有 key block 数据大小)
  read_u32_be() → adler32_checksum      (header 校验)

v1.x:
  read_u32_be() → num_key_blocks
  read_u32_be() → num_entries
  (无 decompressed_size)
  read_u32_be() → key_block_info_size
  read_u32_be() → key_block_data_size
```

#### Key Block Info 解码

对于 v2.0 加密词典 (`encrypted & 0x02`)：
```
RIPEMD128 解密流程:
  1. ripemd128.update(buffer[4..8])      ← 4 字节
  2. ripemd128.update([0x95, 0x36, 0x00, 0x00])
  3. key = ripemd128.digest()            ← 16 字节密钥
  4. 从 buffer[8..] 开始逐字节解密:
     byte = buffer[i]
     byte = (byte >> 4) | (byte << 4)    ← 高低 4 位互换
     byte = byte ^ prev ^ (i & 0xFF) ^ key[i % 16]
     prev = buffer[i]                    ← 保存原始值
     buffer[i] = byte
```

Key Block Info 解码产出 `Vec<(compressed_size, decompressed_size)>`:
```
for each block:
  skip(number_type_size)                 ← 块内词头数量 (不需要)
  first_word_size = read_u8_or_u16()     ← v2.0 用 u16
  skip(first_word_bytes)                 ← 跳过首词头
  last_word_size = read_u8_or_u16()
  skip(last_word_bytes)                  ← 跳过尾词头
  compressed_size = read_number()
  decompressed_size = read_number()
```

**注意**：UTF-16LE 编码时 word_bytes = `(word_size + terminator) * 2`

#### Key Block 数据读取

每个 Key Block 是一个压缩块，解压后格式：
```
repeat:
  word_id   = read_number()              ← 全局偏移量 (后续关联 Record)
  word_text = read_null_terminated()     ← 词头字符串 (编码取决于 Encoding)
```

产出: `Vec<(word_id: u64, headword: String)>` — **HeadWordIndex**

### 1.5 Record Block 解析

#### Record Block Header

位置 = key_block_info_pos + key_block_info_size + key_block_data_size

```
read_number() → num_record_blocks
read_number() → num_entries (skip)
read_number() → record_info_size
read_number() → total_records_size
```

#### Record Block Index 构建

遍历 `num_record_blocks` 次：
```rust
struct RecordIndex {
    start_pos: u64,          // 压缩块起始 (累加)
    end_pos: u64,            // start_pos + compressed_size
    shadow_start: u64,       // 解压后虚拟起始 (累加)
    shadow_end: u64,         // shadow_start + decompressed_size
    compressed_size: u64,
    decompressed_size: u64,
}
```

`shadow_start/end` 形成连续的虚拟地址空间，用于将 HeadWordIndex 中的 `word_id` 映射到具体的 Record Block。

#### 词条查找流程

```
lookup(word_id):
  1. 二分查找 record_block_index: shadow_start <= word_id < shadow_end
  2. 找到 RecordIndex → 确定物理 compressed block 位置
  3. mmap 读取 compressed block
  4. 解压 → decompressed block
  5. record_offset = word_id - shadow_start
  6. record_size = next_word_id - word_id (或到块尾)
  7. 切片 decompressed[record_offset..record_offset + record_size]
  8. 编码转换 → UTF-8 HTML 字符串
```

### 1.6 压缩块解析 (通用)

所有压缩块（Key Block、Record Block）共用同一格式：

```
┌─────────┬──────────┬──────────────────────┐
│ type u32│ chksum u32│ payload bytes        │
│ (BE)    │ (BE)     │                      │
└─────────┴──────────┴──────────────────────┘
```

| type | 压缩方式 | 校验 |
| --- | --- | --- |
| `0x00000000` | 无压缩 | `adler32(payload) == checksum` |
| `0x01000000` | LZO1X | `lzo_adler32(decompressed) == checksum` |
| `0x02000000` | zlib | zlib 解压后校验 |

**Rust 实现选择**:
- zlib → `flate2` crate (标准)
- LZO → `minilzo-sys` 或 `lzo1x-1` crate (需评估)
- Adler32 → `adler` crate

---

## 2. MDD 资源文件解析

### 2.1 格式关系

MDD 与 MDX **共享完全相同的二进制格式**，区别仅在于语义：
- MDX Key Block → 词头 (word)，Record Block → HTML 释义
- MDD Key Block → 资源路径名，Record Block → 二进制资源数据 (图片/音频/CSS/字体)

### 2.2 MDD 路径规范

MDD 中的资源路径遵循 **Windows 路径格式**：
- 以 `\` 开头
- 使用 `\` 作为路径分隔符
- 示例: `\images\logo.png`, `\style.css`, `\audio\word.mp3`

**路径归一化** (loadResourceFile 逻辑)：
```rust
fn normalize_resource_path(name: &str) -> String {
    let mut path = name.replace('/', "\\");
    // 去掉开头的 '.'
    if path.starts_with('.') {
        path = path[1..].to_string();
    }
    // 确保以 '\' 开头
    if !path.starts_with('\\') {
        path = format!("\\{}", path);
    }
    path
}
```

### 2.3 MDD 分卷

一个 MDX 可以有多个 MDD：
```
dict.mdx        ← 主词典文件
dict.mdd        ← 主资源文件 (第 1 卷)
dict.1.mdd      ← 第 2 卷
dict.2.mdd      ← 第 3 卷
...
dict.N.mdd      ← 第 N+1 卷
```

**发现逻辑**: 基于 MDX 文件名推断:
```rust
fn find_mdd_files(mdx_path: &Path) -> Vec<PathBuf> {
    let stem = mdx_path.file_stem(); // "dict"
    let dir = mdx_path.parent();
    let mut mdds = vec![];
    
    // 主 MDD
    let main_mdd = dir.join(format!("{}.mdd", stem));
    if main_mdd.exists() { mdds.push(main_mdd); }
    
    // 分卷
    for i in 1.. {
        let vol = dir.join(format!("{}.{}.mdd", stem, i));
        if !vol.exists() { break; }
        mdds.push(vol);
    }
    mdds
}
```

### 2.4 MDX + MDD 整合模型

```
MdxDictionary
├── mdx_parser: MdictParser          ← 词条解析
├── mdx_index: BTreeIndex            ← 词头索引
├── mdd_resources: Vec<IndexedMdd>   ← 多个 MDD 实例
│   ├── mdd[0]: IndexedMdd           ← 主 MDD (dict.mdd)
│   ├── mdd[1]: IndexedMdd           ← dict.1.mdd
│   └── mdd[2]: IndexedMdd           ← dict.2.mdd
├── chunks: ChunkedStorage           ← 索引缓存中的 record info
└── stylesheets: BTreeMap<i32, (String, String)>
```

**资源加载优先级** (loadResourceFile):
1. **本地文件优先**：检查 MDX 同目录下是否有同名文件，有则直接读取
2. **MDD 顺序查找**：依次在每个 MDD 的索引中查找，找到即返回
3. 首个匹配的 MDD 胜出，后续 MDD 不再查找

```rust
fn load_resource(&self, name: &str) -> Option<Vec<u8>> {
    let normalized = normalize_resource_path(name);
    
    // 1. 本地文件优先
    let local_path = self.dict_dir.join(name);
    if local_path.exists() {
        return Some(fs::read(local_path).ok()?);
    }
    
    // 2. 遍历 MDD 分卷
    for mdd in &self.mdd_resources {
        if let Some(data) = mdd.load_file(&normalized) {
            return Some(data);
        }
    }
    None
}
```

---

## 3. CSS 整合流程

### 3.1 CSS 来源

词典的 CSS 有三种来源，处理方式不同：

| 来源 | 位置 | 处理阶段 |
| --- | --- | --- |
| StyleSheet 属性 | MDX Header | 词条加载时替换 `` `N` `` |
| `<link>` 外部 CSS | MDD 资源 | 资源请求时处理 |
| `<style>` 内联 CSS | 词条 HTML 中 | filterResource 阶段处理 |

### 3.2 外部 CSS 文件处理 (MDD 中的 .css)

当前端请求 `bres://{dict_id}/style.css` 时，后端加载 CSS 流程：

```
MDD.load("\\style.css")
  │
  ▼
检测编码 (detectCssEncoding):
  1. BOM 检测 → UTF-8/UTF-16LE/UTF-16BE/UTF-32
  2. UTF-8 有效性检测 (内容启发式)
  3. 回退到词典编码 (encoding 属性)
  4. 最终回退 UTF-8
  │
  ▼
解码为 UTF-8 字符串
  │
  ▼
CSS url() 链接重写:
  匹配: url(['"]?path['"]?)
  规则:
  - 含 "://" 或 "data:" → 保持原样 (外部/base64)
  - 以 "//" 开头 → 补 "https:" 前缀
  - 其他相对路径 → 重写为 "bres://{dict_id}/path"
  │
  ▼
@font-face url 重写:
  url("font.woff") → url("bres://{dict_id}/font.woff")
  规则同上 (跳过含 ":" 的绝对路径)
  │
  ▼
CSS 隔离 (isolateCSS):
  所有选择器加上 dict_id 前缀 scope
  防止不同词典的 CSS 互相污染
  │
  ▼
转换回 UTF-8 字节 → 返回前端
```

### 3.3 内联 `<style>` 处理

词条 HTML 中可能包含 `<style>` 标签：

```
isolateStyleCssInHtml(article):
  1. 正则匹配所有 <style[^>]*>(.*?)</style>
  2. 对每个匹配:
     a. 提取 style 内容
     b. 调用 isolateCSS(content) 添加 scope 前缀
     c. 重建 <style> 标签
  3. 拼接回文章
```

### 3.4 CSS 隔离策略

**问题**: 多个词典的 CSS 会互相污染（同名 class、全局选择器等）

**GoldenDict 方案**: `isolateCSS()` 将所有选择器前缀加上词典特定的 wrapper selector

**MemoWords 推荐方案** (二选一):
1. **Scoped Prefix**: 每个词典容器 `<div data-dict-id="{id}">`, CSS 选择器自动前缀 `[data-dict-id="{id}"]`
2. **Shadow DOM**: 每个词典释义渲染在独立 Shadow DOM 中，天然隔离

---

## 4. JS 整合与安全性

### 4.1 词典中的 JavaScript

某些 MDX 词典 HTML 中包含 `<script>` 标签：

**分类处理**:

| 类型 | 识别方式 | 处理策略 |
| --- | --- | --- |
| 内联 script | `<script>...code...</script>` (无 src 属性) | **保留但沙箱化** |
| 外部 script (MDD) | `<script src="xxx.js">` | src 重写为 `bres://{dict_id}/xxx.js`，从 MDD 加载 |
| 外部 script (CDN) | `<script src="https://...">` | **拦截/阻止** (安全考虑) |

**GoldenDict 的处理** (参考):
```
replaceLinks 中:
  1. 匹配 <script> 标签
  2. 如果是 inline script (无 src=) → 原样保留 + 跳过到 </script>
  3. 如果有 src= → 重写路径为 bres:// 协议
```

### 4.2 安全沙箱设计

**威胁模型**:
- 恶意 MDX 词典可能包含 XSS payload
- `<script>` 可能访问 Tauri IPC 接口
- CSS `url()` 可能发起外部请求
- `<a href="javascript:...">` 注入

**防护层次**:

```
Layer 1: HTML 标签过滤
  ├── <html>/<body>/<head> → 替换为自定义标签 (gd-section-*)
  ├── protocol-relative URLs (//) → 补 https: 前缀
  └── 移除 javascript: 伪协议链接

Layer 2: 渲染隔离
  ├── 方案 A: iframe sandbox (推荐)
  │   <iframe sandbox="allow-same-origin allow-popups"
  │           srcdoc="{sanitized_html}">
  │   - 禁止 allow-scripts 完全阻止 JS 执行
  │   - 禁止 allow-top-navigation 防止跳转
  │
  └── 方案 B: Shadow DOM + DOMPurify
      - DOMPurify.sanitize(html, {
          ALLOW_TAGS: [...白名单],
          FORBID_TAGS: ['script', 'iframe', 'form'],
          FORBID_ATTR: ['onerror', 'onload', 'onclick', ...],
        })

Layer 3: CSP (Content Security Policy)
  ├── script-src 'none'           ← 禁止所有脚本
  ├── style-src 'unsafe-inline'   ← 允许内联样式
  ├── img-src bres: data: blob:   ← 仅允许词典资源和 data URI
  └── connect-src 'none'          ← 禁止网络请求

Layer 4: Tauri IPC 保护
  └── 词典渲染页面不注入 __TAURI__ 对象
```

**推荐方案**: iframe sandbox (不含 allow-scripts) + CSP:

```html
<!-- 主页面中渲染词典内容 -->
<iframe
  sandbox="allow-same-origin"
  srcdoc="..."
  style="width:100%; border:none;"
  csp="default-src 'none'; style-src 'unsafe-inline' bres:; img-src bres: data: blob:; font-src bres:;"
/>
```

这样词典中的 JS 完全无法执行，CSS 正常工作，图片/字体正常加载。

### 4.3 需要 JS 执行的词典

部分高级词典依赖 JS 实现交互（折叠/展开、发音按钮等）。

**策略**: 提供用户可选的「受信任词典」模式:
- 默认: sandbox 模式 (无 JS)
- 用户主动标记「信任」: 添加 `allow-scripts` 到 sandbox
- 信任状态持久化到 SQLite settings

---

## 5. @@@LINK 解析

### 5.1 MDX 中的 @@@LINK (词条重定向)

当 Record Block 中的词条内容以 `@@@LINK=` 开头时，表示该词条是另一词条的别名/重定向。

**格式**: `@@@LINK=target_word\0` (UTF-8 编码)

**处理流程**:
```
lookup("colour"):
  1. findArticles("colour") → [offset_1]
  2. loadArticle(offset_1) → "@@@LINK=color"
  3. 检测到 @@@LINK= 前缀
  4. 提取 target = "color" (trim whitespace)
  5. findArticles("color") → [offset_2, offset_3, ...]
  6. 将 offset_2, offset_3 追加到 chain 末尾
  7. 继续处理 chain (跳过当前 @@@LINK 词条本身，不渲染)
  8. loadArticle(offset_2) → 实际 HTML 内容
```

**关键细节**:
- @@@LINK 可以**链式重定向**: A → B → C，需递归跟踪
- 实现方式: 不是递归调用，而是将目标追加到 `chain: Vec` 的末尾，顺序遍历处理
- 这样天然支持多层重定向且不会栈溢出

### 5.2 MDD 中的 @@@LINK (资源重定向)

MDD 资源也支持 @@@LINK，但编码不同：

**格式**: `@@@LINK=target_resource` (**UTF-16LE** 编码!)

```
load_resource("\\old_style.css"):
  1. 从 MDD 加载 raw bytes
  2. 检查前 16 字节是否为 UTF-16LE 编码的 "@@@LINK="
     bytes: [0x40,0x00, 0x40,0x00, 0x40,0x00, 0x4C,0x00, 
             0x49,0x00, 0x4E,0x00, 0x4B,0x00, 0x3D,0x00]
  3. 若匹配 → 解码后续内容为 UTF-16LE → 得到 target 资源名
  4. 重新 load_resource(target)
  5. 防环: 用 Set<String> 记录已访问的资源名，重复则终止
```

**Rust 实现**:
```rust
const LINK_MARKER_UTF16LE: [u8; 16] = [
    0x40, 0x00, 0x40, 0x00, 0x40, 0x00, 0x4C, 0x00,
    0x49, 0x00, 0x4E, 0x00, 0x4B, 0x00, 0x3D, 0x00,
];

fn load_resource_with_redirect(&self, name: &str) -> Option<Vec<u8>> {
    let mut visited: HashSet<String> = HashSet::new();
    let mut current = name.to_string();
    
    loop {
        if !visited.insert(current.clone()) {
            return None; // 循环重定向，终止
        }
        
        let data = self.load_resource_raw(&current)?;
        
        if data.len() > 16 && data[..16] == LINK_MARKER_UTF16LE {
            // UTF-16LE 解码 target
            let target_bytes = &data[16..];
            let target = decode_utf16le(target_bytes).trim().to_string();
            current = target;
            continue;
        }
        
        return Some(data);
    }
}
```

---

## 6. 同词条多链接与去重

### 6.1 问题

一个查询词可能在同一本词典中命中多个 WordArticleLink:
- **同义词 (synonyms)**: 不同词头指向同一文章 offset
- **物理重复**: 不同 offset 但内容完全相同
- **大小写变体**: "Apple" 和 "apple" 可能都有独立条目
- **@@@LINK 扩展**: 重定向产生额外链接

### 6.2 去重策略 (两层过滤)

```rust
struct ArticleCollector {
    // 第 1 层: offset 去重 — 同一 offset 不重复加载
    included_offsets: HashSet<u32>,
    
    // 第 2 层: 内容去重 — MD5 hash 去重物理重复
    included_bodies: HashSet<[u8; 16]>,  // MD5 digests
}

fn collect_articles(&mut self, chain: &[WordArticleLink]) -> Vec<String> {
    let mut results = vec![];
    let mut chain = chain.to_vec();
    let mut i = 0;
    
    while i < chain.len() {
        let link = &chain[i];
        i += 1;
        
        // 第 1 层: offset 已见过 → 跳过
        if !self.included_offsets.insert(link.article_offset) {
            continue;
        }
        
        let body = self.dict.load_article(link.article_offset)?;
        
        // @@@LINK 处理: 追加到 chain 末尾
        if body.starts_with("@@@LINK=") {
            let target = body[8..].trim();
            let new_links = self.dict.find_articles(target);
            chain.extend(new_links);
            continue;
        }
        
        // 第 2 层: 内容 hash 去重
        let hash = md5::compute(&body);
        if !self.included_bodies.insert(hash.0) {
            continue;
        }
        
        results.push(body);
    }
    results
}
```

### 6.3 多词典合并

跨词典查询时，每本词典独立执行上述流程，结果按词典分组排列：

```
query("apple"):
  Dict A (Oxford): [article_a1]
  Dict B (Longman): [article_b1, article_b2]  ← 可能有同义词产生多条
  Dict C (Collins): [article_c1]

最终渲染:
  ┌─ Dict A ──────────┐
  │  article_a1        │
  ├─ Dict B ──────────┤
  │  article_b1        │
  │  article_b2        │
  ├─ Dict C ──────────┤
  │  article_c1        │
  └────────────────────┘
```

---

## 7. HTML 过滤与链接重写管线

### 7.1 完整处理管线

词条从 Record Block 加载到前端渲染，经过以下管线：

```
Raw Bytes (from Record Block)
  │
  ▼
[1] 编码转换 → UTF-8 字符串
  │  (UTF-16LE / GBK / GB18030 → UTF-8)
  │
  ▼
[2] StyleSheet 替换
  │  `N` → prefix/suffix CSS 标签
  │
  ▼
[3] Protocol-relative URL 补全
  │  src="//cdn.." → src="https://cdn.."
  │  href="//..." → href="https://..."
  │
  ▼
[4] 链接重写 (replaceLinks) ← 核心步骤，按标签类型分发
  │
  │  匹配所有: <a|area|img|link|script|source|audio|video|object ...>
  │
  │  ┌─ <a>/<area> 标签 ─────────────────────────────────────┐
  │  │  sound://file.mp3 → gdau://{dict_id}/file.mp3         │
  │  │  entry://word → gdlookup://localhost/word              │
  │  │  entry://word#anchor → gdlookup://localhost/word?anchor│
  │  │  entry://#anchor → 仅保留 #anchor (页内锚点)           │
  │  └──────────────────────────────────────────────────────── ┘
  │
  │  ┌─ <link> 标签 ─────────────────────────────────────────┐
  │  │  href="style.css" → href="bres://{dict_id}/style.css" │
  │  │  跳过: bres:// / https:// / data: / javascript:       │
  │  └───────────────────────────────────────────────────────── ┘
  │
  │  ┌─ <script> 标签 ───────────────────────────────────────┐
  │  │  内联 script (无 src) → 原样保留 + 跳过到 </script>   │
  │  │  外部 src="x.js" → src="bres://{dict_id}/x.js"       │
  │  └───────────────────────────────────────────────────────── ┘
  │
  │  ┌─ <img> 标签 ──────────────────────────────────────────┐
  │  │  src="pic.png" → src="bres://{dict_id}/pic.png"       │
  │  │  srcset="a.png 1x, b.png 2x" → 每个 URL 加 bres://   │
  │  │  跳过: bres:// / https:// / data:                     │
  │  └───────────────────────────────────────────────────────── ┘
  │
  │  ┌─ <audio>/<video>/<source> 标签 ───────────────────────┐
  │  │  <source>: src → gdvideo://{dict_id}/...              │
  │  │  其他: src → bres://{dict_id}/...                     │
  │  └───────────────────────────────────────────────────────── ┘
  │
  │  ┌─ <object> 标签 ───────────────────────────────────────┐
  │  │  data="file.swf" → data="bres://{dict_id}/file.swf"  │
  │  └───────────────────────────────────────────────────────── ┘
  │
  ▼
[5] DOM 标签替换 (防止宿主页面结构被破坏)
  │  <html> → <gd-section-html>   </html> → </gd-section-html>
  │  <body> → <gd-section-body>   </body> → </gd-section-body>
  │  <head> → <gd-section-head>   </head> → </gd-section-head>
  │
  ▼
[6] <style> 标签内 @font-face url 重写
  │  匹配 <style>...</style> 块
  │  提取 url("font.woff") → url("bres://{dict_id}/font.woff")
  │  跳过含 ":" 的绝对路径和 "//" 开头的
  │
  ▼
[7] <style> 标签 CSS 隔离
  │  提取每个 <style> 的内容 → isolateCSS → scope 前缀
  │
  ▼
[8] HTML Cleaner (闭合未关闭标签)
  │  追加 </div> 串用于闭合可能的未闭合 div
  │
  ▼
[9] 包裹词典容器
  │  <div class="mdict" data-dict-id="{id}">
  │    {processed_article}
  │  </div>
  │
  ▼
传输给前端 (Tauri IPC)
```

### 7.2 自定义协议映射 (Tauri)

| 协议 | 用途 | 后端处理 |
| --- | --- | --- |
| `bres://{dict_id}/{path}` | 通用资源 (图片/CSS/JS/字体) | loadResourceFile → MDD 或本地文件 |
| `gdau://{dict_id}/{path}` | 音频资源 | loadResourceFile → 返回音频 bytes |
| `gdvideo://{dict_id}/{path}` | 视频资源 | loadResourceFile → 返回视频 bytes |
| `gdlookup://localhost/{word}` | 词条跳转 | 触发前端重新查词 |

**Tauri 实现**: 注册自定义协议处理器

```rust
// tauri::Builder
.register_asynchronous_uri_scheme_protocol("bres", |_ctx, req, responder| {
    // 解析 dict_id 和 path
    // 加载资源
    // 返回正确的 Content-Type
})
```

---

## 8. 前端渲染 UI 处理

### 8.1 多词典展示架构

```
SearchPage
├── SearchBar (input + debounce 300ms)
├── CandidatePanel (候选词列表)
│   └── CandidateItem[] (word + source_dict badge)
└── ArticlePanel (释义展示区)
    ├── DictTabBar (词典快速跳转标签)
    │   └── TabItem[] (dict_name + icon)
    └── DictScrollView (纵向滚动)
        ├── DictSection[0] (Dict A)
        │   ├── DictHeader (name + icon + collapse toggle)
        │   └── ArticleFrame (iframe sandbox)
        │       └── sanitized HTML
        ├── DictSection[1] (Dict B)
        │   ├── DictHeader
        │   └── ArticleFrame
        └── DictSection[N] ...
```

### 8.2 ArticleFrame 渲染策略

```tsx
function ArticleFrame({ html, dictId }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // 构建完整 HTML 文档
  const doc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        /* 基础样式重置 */
        body { margin: 0; padding: 12px; font-family: inherit; }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `;
  
  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"  // 无 allow-scripts
      srcDoc={doc}
      style={{ width: '100%', border: 'none' }}
      onLoad={handleAutoResize}    // 自动调整高度
    />
  );
}
```

### 8.3 资源请求拦截

前端 iframe 内的资源请求 (`bres://`, `gdau://`) 需要被拦截并路由到后端：

**Tauri 方案**: 注册自定义 URI scheme protocol:
```
bres://{dict_id}/path → Tauri protocol handler → load from MDD/local → response bytes
```

这样 `<img src="bres://xxx/pic.png">` 会自动触发 Tauri 协议处理，无需前端额外拦截。

### 8.4 词典内跳转处理

当用户点击 `<a href="gdlookup://localhost/word">` 时:

```
1. iframe 内的链接点击被 sandbox 拦截 (不允许 top navigation)
2. 前端监听 iframe 的 navigation 事件 / message
3. 解析 URL:
   - gdlookup://localhost/word → 触发查词 "word"
   - gdlookup://localhost/word?gdanchor=section → 查词 + 滚动到锚点
   - gdau://{dict_id}/file.mp3 → 播放音频
4. 更新搜索状态 → 重新查询 → 重新渲染
```

**替代方案** (如果不用 iframe):
```tsx
// 用 DOMPurify + 事件委托
function ArticleView({ html }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a');
      if (!anchor) return;
      
      const href = anchor.getAttribute('href') || '';
      
      if (href.startsWith('gdlookup://')) {
        e.preventDefault();
        const word = decodeURIComponent(href.replace('gdlookup://localhost/', ''));
        searchStore.lookup(word);
      }
      else if (href.startsWith('gdau://')) {
        e.preventDefault();
        audioPlayer.play(href);
      }
      else if (href.startsWith('http')) {
        e.preventDefault();
        // 用系统浏览器打开外部链接
        shell.open(href);
      }
    };
    
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [html]);
  
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### 8.5 折叠/展开动画

```tsx
function DictSection({ dict, html, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  
  return (
    <div className="dict-section">
      <button onClick={() => setOpen(!open)} className="dict-header">
        <DictIcon dict={dict} />
        <span>{dict.name}</span>
        <ChevronIcon className={open ? 'rotate-180' : ''} />
      </button>
      
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ overflow: 'hidden' }}
      >
        <ArticleFrame html={html} dictId={dict.id} />
      </motion.div>
    </div>
  );
}
```

### 8.6 iframe 自动高度

```ts
function handleAutoResize(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  if (!doc) return;
  
  const observer = new ResizeObserver(() => {
    const height = doc.documentElement.scrollHeight;
    iframe.style.height = `${height}px`;
  });
  
  observer.observe(doc.documentElement);
}
```

---

## 9. 完整数据流总结

```
用户输入 "apple"
    │
    ▼
[前端] SearchBar → debounce 300ms → invoke("search", { query, group_id })
    │
    ▼
[Tauri IPC]
    │
    ▼
[后端] SearchEngine.prefix_search("apple", group_id)
    │  遍历该 group 下所有启用的词典
    │  每本词典: index.prefix_match("apple") → Vec<HeadWord>
    │  合并 + 去重 + 排序 (精确 > 前缀)
    │
    ▼
[前端] CandidateList 展示候选词
    │
    ▼ 用户点击 "apple"
    │
[前端] invoke("lookup", { word: "apple", group_id })
    │
    ▼
[后端] 对 group 内每本词典:
    │  1. findArticles("apple") → chain
    │  2. 遍历 chain:
    │     - 跳过已见 offset
    │     - loadArticle(offset) → raw bytes
    │     - 编码转换 → UTF-8 HTML
    │     - 检测 @@@LINK= → 追加 chain
    │     - MD5 去重
    │  3. 过滤管线: stylesheet替换 → 链接重写 → 标签替换 → CSS隔离
    │  4. 包裹 <div class="mdict">
    │
    ▼
[Tauri IPC] 返回 Vec<DictArticle { dict_id, dict_name, html }>
    │
    ▼
[前端] ArticlePanel 渲染:
    │  DictSection[0] → iframe sandbox (Dict A 的 HTML)
    │  DictSection[1] → iframe sandbox (Dict B 的 HTML)
    │  ...
    │
    ▼ iframe 内 <img src="bres://..."> 触发
    │
[Tauri Protocol Handler] bres://{dict_id}/pic.png
    │  → normalize path → 本地文件 || MDD 查找
    │  → 检测 @@@LINK (UTF-16LE) → 递归
    │  → CSS 文件特殊处理 (编码检测 + url重写 + 隔离)
    │  → TIFF → PNG 转换
    │  → 返回 bytes + Content-Type
    │
    ▼
[前端] 图片/CSS/字体正常渲染
```
