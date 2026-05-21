# mdict crate — 解析引擎详细设计

> 基于 GoldenDict-ng 参考实现的完整逆向分析、对比设计与优化方案。
> 参考文件：`ref/goldendict-ng/src/dict/mdictparser.{cc,hh}`, `mdx.cc`, `globalregex.cc`, `decompress.cc`, `ripemd.{cc,hh}`, `iconv.cc`

---

## 目录

1. [GoldenDict-ng 实现全景分析](#1-goldendict-ng-实现全景分析)
2. [对比设计：GoldenDict vs MemoWords](#2-对比设计goldendict-vs-memowords)
3. [优化空间分析](#3-优化空间分析)
4. [模块拆分与 Phase 规划](#4-模块拆分与-phase-规划)
5. [测试策略](#5-测试策略)

---

## 1. GoldenDict-ng 实现全景分析

### 1.1 架构概览

GoldenDict-ng 的 MDX 实现分为两层：

| 层 | 文件 | 职责 |
|---|---|---|
| **低层解析器** | `mdictparser.{cc,hh}` (872 行) | 二进制格式解析：Header / Key Block / Record Block |
| **高层字典** | `mdx.cc` (1673 行) | 索引构建 (BTree)、文章加载、HTML 过滤、资源加载、CSS 隔离 |
| **辅助** | `decompress.cc`, `ripemd.cc`, `iconv.cc`, `globalregex.cc` | 解压缩、加密、编码转换、正则模式 |

### 1.2 MdictParser 类 — 低层二进制解析

```
MdictParser 状态机:
  open() → readHeader() → readHeadWordBlockInfos() → readRecordBlockInfos()
  然后迭代: readNextHeadWordIndex() → readRecordBlock()
```

#### 1.2.1 readHeader() — Header 解析 (mdictparser.cc:287-387)

```
流程:
  1. read_i32_be → headerTextSize
  2. read_bytes(headerTextSize) → UTF-16LE 编码的 XML 文本
  3. read_u32_le → Adler32 checksum (小端!)
  4. verify Adler32
  5. 用 Qt DOM 解析 XML 属性

特殊处理:
  - StyleSheet 属性先用正则提取 (绕过 Qt XML 解析 bug QTBUG-102612)
  - 删除 Unicode 控制字符后再解析 XML (Qt6 兼容)
  - Encoding: GBK/GB2312 → GB18030; 空/UTF-16 → UTF-16LE
  - version < 2.0 → numberTypeSize = 4 (u32); >= 2.0 → 8 (i64)
  - Encrypted: 位掩码, bit 1 = header encrypted, bit 2 = key index encrypted
  - Title: 含 HTML 则去标签; 空/"Title (No HTML code allowed)" → 用文件名
  - StyleSheet: 以 \n 分隔的三元组 (id, prefix, suffix), HTML 实体解码
```

#### 1.2.2 readHeadWordBlockInfos() — Key Block 元信息 (mdictparser.cc:389-449)

```
流程:
  1. 读取固定头部:
     v2.0: 5 个 i64 = numBlocks, numEntries, decompressedSize, infoSize, blockSize
     v1.x: 4 个 u32 = numBlocks, numEntries, infoSize, blockSize (无 decompressedSize)
  2. v2.0: read_u32_be → Adler32 校验上述头部
  3. 读取 infoSize 字节的 headWordBlockInfo
  4. v2.0 且 encrypted & 0x02: RIPEMD128 解密
  5. v2.0: parseCompressedBlock 解压
  6. decodeHeadWordBlockInfo 解码为 BlockInfoVector
```

#### 1.2.3 decodeHeadWordBlockInfo() (mdictparser.cc:486-531)

```
每条 Block Info 结构:
  v2.0:
    numKeywords:    i64
    firstHeadSize:  u16 (字符数)
    firstHead:      text + null (UTF-16LE 时 ×2 字节)
    lastHeadSize:   u16 (字符数)
    lastHead:       text + null
    compressedSize: i64
    decompressedSize: i64
  v1.x:
    numKeywords:    u32
    firstHeadSize:  u8
    firstHead:      text + null
    lastHeadSize:   u8
    lastHead:       text + null
    compressedSize: u32
    decompressedSize: u32

GoldenDict 注意: 只提取 (compressedSize, decompressedSize) 对
                  firstHead / lastHead 被跳过 (不用于范围搜索!)
```

#### 1.2.4 readNextHeadWordIndex() — 逐块读取词头 (mdictparser.cc:131-158)

```
流程:
  1. mmap compressedSize 字节
  2. parseCompressedBlock 解压
  3. splitHeadWordBlock 拆分为 (offset, headword) 对列表
  4. 推进迭代器
```

#### 1.2.5 splitHeadWordBlock() — 词头拆分 (mdictparser.cc:533-560)

```
块内结构 (重复):
  headWordId:  i64 (v2.0) 或 u32 (v1.x), 大端
  headWord:    null-terminated 字符串
               UTF-16LE: u16StrSize 找到 null 终止符, 长度 (len+1)*2 字节
               其他编码: strlen 找到 null 终止符, 长度 len+1 字节
  → 用 encoding_ 解码为 QString
```

#### 1.2.6 readRecordBlockInfos() — 记录块索引 (mdictparser.cc:452-484)

```
流程:
  1. seek 到 headWordBlockInfoPos + headWordBlockInfoSize + headWordBlockSize
  2. 读取: numRecordBlocks, numRecords (skip), recordInfoSize, totalRecordsSize
  3. 对每个 record block:
     compressedSize, decompressedSize → 计算 startPos/endPos (真实偏移) 和
     shadowStartPos/shadowEndPos (解压后逻辑偏移)
  4. recordPos_ = file pos + recordInfoSize (记录块数据的起始位置)
```

#### 1.2.7 readRecordBlock() — 记录块读取 + RecordInfo 构建 (mdictparser.cc:562-598)

```
对每个 headword (已排序):
  1. 二分查找 shadowStartPos ≤ headWordId < shadowEndPos
  2. recordSize = next.headWordId - current.headWordId
     (最后一个: shadowEndPos - headWordId)
  3. 构建 RecordInfo:
     compressedBlockPos   = recordPos_ + recordIndex.startPos
     recordOffset         = headWordId - recordIndex.shadowStartPos
     decompressedBlockSize = recordIndex.decompressedSize
     compressedBlockSize   = recordIndex.compressedSize
     recordSize            = 计算值
  4. 回调 recordHandler.handleRecord(headWord, recordInfo)
```

#### 1.2.8 parseCompressedBlock() — 压缩块解析 (mdictparser.cc:198-257)

```
块格式: [type: u32_be] [checksum: u32_be] [payload...]

type:
  0x00000000 → 无压缩, Adler32 校验 payload
  0x01000000 → LZO1X 解压, lzo_adler32 校验
  0x02000000 → zlib (deflate) 解压, 内部 adler32 校验

GoldenDict 注意:
  - compressedBlockSize <= 8 → 直接失败 (块太小)
  - LZO 使用 lzo1x_decompress_safe (安全模式)
  - zlib 使用 zlibDecompress (chunked, 2048 字节块)
```

#### 1.2.9 decryptHeadWordIndex() — RIPEMD128 解密 (mdictparser.cc:176-196)

```
算法:
  1. key = RIPEMD128(buffer[4..8] + b"\x95\x36\x00\x00")  → 16 字节
  2. 从 buffer[8] 开始, 对每个字节 i:
     byte = buffer[i]
     decoded = (byte >> 4 | byte << 4) ^ prev ^ (i & 0xFF) ^ key[i % 16]
     prev = buffer[i] (原始值, 解密前)
     buffer[i] = decoded
  3. 初始 prev = 0x36
```

#### 1.2.10 substituteStylesheet() (mdictparser.cc:600-636)

```
正则: `(\d+)`   ← 匹配 `` `N` `` 形式的样式引用

替换逻辑:
  找到 styleId → 插入 styleSheets[id].first (prefix)
               → 累积 styleSheets[id].second (suffix) 到 endStyle
  未找到 styleId → 输出累积的 endStyle, 清空
  结尾追加最后的 endStyle
```

### 1.3 MdxDictionary — 高层字典操作

#### 1.3.1 索引构建 — makeDictionaries() (mdx.cc:1469-1671)

```
流程:
  1. 筛选 .mdx 文件
  2. findResourceFiles: 查找 .mdd 和 .N.mdd 分卷
  3. 判断索引是否需要重建 (签名/版本/mtime)
  4. MdictParser::open() 解析词典
  5. 每个 MDD 也 open 一次
  6. 写入自定义索引文件 (.gd_index):
     - IdxHeader (签名, 版本, 词条数等)
     - 词典名称 + 编码
     - ChunkedStorage: 描述 + RecordInfo 块
     - BtreeIndexing: 构建 B-Tree 索引 (folded words → offset)
     - StyleSheets: (key, prefix, suffix) 序列化
     - MDD IndexInfos: (filename, btreeMaxElements, rootOffset)
     - 语言对 (langFrom, langTo)
     - sourceLastModified
  7. 回填 IdxHeader
```

#### 1.3.2 文章加载 — loadArticle() (mdx.cc:888-924)

```
流程:
  1. chunks.getBlock(offset) → 取出 RecordInfo
  2. mmap compressedBlockPos, compressedBlockSize
  3. parseCompressedBlock 解压
  4. toUtf16(encoding, decompressed + recordOffset, recordSize) → article
  5. 若非 noFilter:
     substituteStylesheet → filterResource
```

#### 1.3.3 文章查询 — MdxArticleRequest::run() (mdx.cc:544-641)

```
流程:
  1. findArticles(word) + 对所有 alts 也 findArticles
  2. 去重: offset 集合 + MD5 hash 集合
  3. 对每个 unique article:
     - loadArticle
     - 若以 "@@@LINK=" 开头: 提取目标词, findArticles 追加到 chain
     - 否则: 包裹 <div class="mdict"> + HTML cleaner
  4. 结尾追加 N 个 </div> (修复未闭合标签)
```

#### 1.3.4 资源加载 — MddResourceRequest::run() (mdx.cc:764-838)

```
流程:
  1. loadResourceFile(resourceName, data)
  2. 检查 @@@LINK= 重定向 (UTF-16LE 编码!):
     pattern = "@\0@\0@\0L\0I\0N\0K\0=\0" (16 字节)
     若匹配: 解码 UTF-16LE 得到新资源名, 循环继续
  3. 防环: set<u32string> resourceIncluded
  4. CSS 文件: isolate_css()
     - 检测编码 (BOM → UTF-8 验证 → 词典编码 → 降级 UTF-8)
     - 重写 url() 中的链接 → bres://{id}/
     - isolateCSS 作用域隔离
  5. TIFF 文件: 转换为 PNG/JPEG
```

#### 1.3.5 资源文件查找 — loadResourceFile() (mdx.cc:1334-1358)

```
路径归一化:
  1. '/' → '\\' (Windows 分隔符)
  2. 去除前导 '.'
  3. 确保以 '\\' 开头
优先级:
  1. 本地文件 (词典目录下同名文件)
  2. 遍历所有 mddResources, 首个匹配者胜出
```

#### 1.3.6 HTML 过滤 — filterResource() (mdx.cc:926-950)

```
1. 协议相对 URL (//) → https://
2. replaceLinks: 重写所有 HTML 标签中的链接
   - <a>/<area>: sound:// → gdau://, entry:// → gdlookup://localhost/
   - <link>: href → bres://{id}/
   - <script>: 跳过 inline script, 外部 src → bres://
   - <img>/<source>/<video>: src → bres://, source → gdvideo://
   - <img>/<source> srcset: 逐项重写
   - <object> data: 重写
3. html/body/head → gd-section-html/body/head (防 DOM 提升)
4. replaceStyleInHtml: <style> 块中的 @font-face url → bres://
5. isolateStyleCssInHtml: <style> 块 CSS 作用域隔离
```

### 1.4 辅助模块

#### 1.4.1 解压缩 (decompress.cc)
- **zlib**: chunked inflate (2048 字节), Adler32 校验
- **LZO**: lzo1x_decompress_safe, lzo_adler32 校验
- **bzip2** / **lzma2**: 也支持但 MDX 未使用

#### 1.4.2 加密 (ripemd.cc)
- RIPEMD-128 实现 (从 libavutil 移植)
- 仅用于 Key Block Info 解密 (encrypted & 0x02)

#### 1.4.3 编码转换 (iconv.cc)
- 基于 POSIX iconv 的通用编码转换
- UTF-8 / UTF-16LE / GB18030 (GBK/GB2312 统一映射)

#### 1.4.4 正则模式 (globalregex.cc)
- 13 个预编译正则用于 HTML 链接重写
- 覆盖: audio, cross-link, style, script, src, srcset, fontFace 等

### 1.5 GoldenDict 未写测试

**GoldenDict-ng 没有任何 MDX 相关的单元测试或集成测试**。所有验证都依赖手动运行。

---

## 2. 对比设计：GoldenDict vs MemoWords

| 维度 | GoldenDict-ng (C++ / Qt) | MemoWords (Rust) | 优化点 |
|---|---|---|---|
| **文件 I/O** | QFile + mmap (ScopedMemMap) | `memmap2` crate, 零拷贝 | ✅ 避免 QByteArray 拷贝 |
| **内存管理** | QByteArray 频繁拷贝 | `&[u8]` 切片 + 生命周期 | ✅ 零拷贝解析 |
| **数字读取** | QDataStream (运行时分支) | 编译期泛型 `ReadNum<V1>` / `ReadNum<V2>` | ✅ 消除运行时分支 |
| **解压缩** | zlib (chunked 2KB) + lzo (C) | `flate2` + `minilzo-rs` 或 `lzo1x-1` | ✅ Rust safe API |
| **加密** | 自写 RIPEMD128 | `ripemd` crate (RustCrypto) | ✅ 经过审计的实现 |
| **编码转换** | iconv (POSIX) | `encoding_rs` (Chrome 同源) | ✅ 更安全, 无 FFI |
| **XML 解析** | QDomDocument (完整 DOM) | `quick-xml` 事件解析 | ✅ 不构建 DOM, 内存极低 |
| **索引** | BtreeIndexing (自写) | `fst` (FST 有限状态转换器) | ✅ 内存更小, 前缀搜索原生支持 |
| **索引持久化** | 自定义二进制 (.gd_index) | `postcard` / `bincode` + 文件头 | ✅ 版本化, 自描述 |
| **并发** | QMutex + QtConcurrent | `tokio` + `parking_lot::RwLock` | ✅ 异步, 更细粒度锁 |
| **HTML 过滤** | 13 个 QRegularExpression | `lol_html` (Cloudflare LOLHTML) 或 `html5ever` | ✅ 流式, O(n), 不回溯 |
| **CSS 隔离** | 字符串替换 | Shadow DOM 或 `@scope` | ✅ 前端层面隔离更彻底 |
| **错误处理** | 异常 + qWarning | `thiserror` + `Result<T, E>` | ✅ 编译期检查 |
| **测试** | ❌ 无 | ✅ 全面的 TDD | — |
| **Adler32** | zlib 的 adler32() | `adler` crate | ✅ 纯 Rust |
| **链接重写** | 运行时多次正则替换 | Tauri IPC + 前端 `<base>` + CSP | ✅ 后端不做 HTML 重写 |

### 2.1 关键架构差异

**GoldenDict 的痛点**:
1. **双重索引**: 解析 MDX → 构建 .gd_index → 再读索引查文章。两步 I/O。
2. **全量解压**: loadArticle 解压整个 record block, 只取其中一段。
3. **HTML 重写过重**: 13 个正则对每篇文章跑一遍, O(n×m)。
4. **QByteArray 拷贝**: 解压结果 → QString → std::string, 三次拷贝。
5. **MDD 路径 Windows 化**: 所有路径强制转 `\`, 平台不友好。

**MemoWords 的策略**:
1. **直接 mmap MDX**: 不构建自定义索引文件, 直接 mmap + FST 索引。
2. **延迟解压 + 缓存**: 只解压需要的 record block, LRU 缓存最近使用的块。
3. **前端链接重写**: 后端返回原始 HTML, 前端通过 Tauri IPC protocol 处理资源。
4. **零拷贝**: `&[u8]` → `encoding_rs` → `String`, 最少一次拷贝。
5. **跨平台路径**: 内部统一用 `/`, 仅在 MDD 查找时转换。

---

## 3. 优化空间分析

### 3.1 零拷贝解析 (P0 — 核心)

GoldenDict: `file → QByteArray → mmap → QByteArray(decompressed) → QString → std::string`
MemoWords:  `file → mmap(&[u8]) → decompress(Vec<u8>) → encoding_rs → String`

**方案**: Header / Key Block Info / Record Block Info 全部在 mmap 上原地解析, 使用 `nom` 或手写解析器直接操作 `&[u8]`。只有解压后的内容需要新分配。

### 3.2 Record Block 延迟解压 + LRU 缓存 (P0)

GoldenDict 每次 loadArticle 都解压整个 record block (可能几十 MB)。

**方案**: `dashmap::DashMap<(dict_id, block_idx), Arc<Vec<u8>>>` + LRU 淘汰。热点 block 只解压一次。

### 3.3 FST 替代 B-Tree (P1)

GoldenDict 使用自写 BtreeIndexing, 索引文件大, 前缀搜索需遍历。

**方案**: `fst::Map` — 压缩率高 (通常比 B-Tree 小 5-10×), 天然支持前缀/范围迭代, 构建后不可变 (适合词典场景)。

### 3.4 流式 HTML 处理 (P1)

GoldenDict 的 13 个正则是 O(n×m) 的多趟处理。

**方案**: 
- **后端**: 仅做 `@@@LINK` 重定向 + StyleSheet 替换。
- **前端**: Tauri `asset:` protocol 处理资源 URL, `<iframe sandbox>` 或 Shadow DOM 隔离词典 CSS。
- 不在后端做 HTML rewrite, 省去所有正则。

### 3.5 编码检测优化 (P2)

GoldenDict 的 CSS 编码检测: BOM → UTF-8 验证 → 词典编码 → 降级。

**方案**: `encoding_rs` 内建 BOM sniffing + 流式解码, 一步完成。

### 3.6 RIPEMD128 (P2)

GoldenDict 使用自写 RIPEMD128 (从 libavutil 移植)。

**方案**: RustCrypto 的 `ripemd` crate, 经过安全审计, API 统一。

---

## 4. 模块拆分与 Phase 规划

### 模块结构

```
crates/mdict/
├── src/
│   ├── lib.rs              # 公共 API: MdxDict, MddResource
│   ├── error.rs            # 错误类型 (thiserror)
│   ├── types.rs            # 共享类型: Version, Encoding, NumberSize
│   ├── header.rs           # Phase 1: Header 解析
│   ├── number.rs           # Phase 1: 版本化数字读取
│   ├── checksum.rs         # Phase 1: Adler32 校验
│   ├── decrypt.rs          # Phase 2: RIPEMD128 解密
│   ├── decompress.rs       # Phase 2: 压缩块解析 (none/zlib/lzo)
│   ├── key_block.rs        # Phase 3: Key Block Info + Key Block 读取
│   ├── record_block.rs     # Phase 3: Record Block Info + Record Block 读取
│   ├── encoding.rs         # Phase 4: 编码转换 (encoding_rs)
│   ├── stylesheet.rs       # Phase 4: StyleSheet 替换
│   ├── link.rs             # Phase 4: @@@LINK 重定向 + 防环
│   ├── mdd.rs              # Phase 5: MDD 资源文件解析
│   ├── index.rs            # Phase 6: FST 索引构建 + 持久化
│   ├── search.rs           # Phase 6: 前缀搜索 + 模糊搜索
│   └── dict.rs             # Phase 7: 顶层 MdxDict 组装
├── tests/
│   ├── header_test.rs
│   ├── decompress_test.rs
│   ├── key_block_test.rs
│   ├── record_block_test.rs
│   ├── encoding_test.rs
│   ├── stylesheet_test.rs
│   ├── link_test.rs
│   ├── mdd_test.rs
│   ├── index_test.rs
│   └── integration_test.rs
└── benches/
    └── parse.rs
```

### Phase 1 — 基础解析 (Header + 数字 + 校验)

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P1-T1 | `types.rs`: Version enum (V1/V2), NumberSize, Encoding enum | `version_`, `numberTypeSize_` | 类型单元测试 |
| P1-T2 | `number.rs`: `read_number(version) → u64`, `read_u8_or_u16(version)` | `readNumber()`, `readU8OrU16()` | 手写字节 → 值测试 |
| P1-T3 | `checksum.rs`: `verify_adler32(buf, expected) → Result<()>` | `checkAdler32()` | 正确/错误校验和 |
| P1-T4 | `header.rs`: 从 `&[u8]` 解析 Header XML → `HeaderInfo` 结构 | `readHeader()` | 正常/空/异常编码/含HTML标题/特殊StyleSheet |

**P1 产出**: `HeaderInfo { version, encoding, encrypted, title, description, stylesheets, rtl }`

### Phase 2 — 解压缩与解密

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P2-T1 | `decompress.rs`: 解析压缩块 header (type + checksum), 分发解压 | `parseCompressedBlock()` | 各类型 + 校验失败 |
| P2-T2 | `decompress.rs`: zlib 解压 (flate2) | `zlibDecompress()` | zlib 压缩数据 |
| P2-T3 | `decompress.rs`: LZO1X 解压 | `lzo1x_decompress_safe()` | LZO 压缩数据 |
| P2-T4 | `decrypt.rs`: RIPEMD128 密钥派生 + 字节旋转 XOR | `decryptHeadWordIndex()` | 加密/非加密对比 |

**P2 产出**: `decompress_block(compressed: &[u8], expected_size: usize) → Result<Vec<u8>>`

### Phase 3 — 词条与记录解析

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P3-T1 | `key_block.rs`: 解析 Key Block Header (5/4 个数字 + Adler32) | `readHeadWordBlockInfos()` | v1/v2 header |
| P3-T2 | `key_block.rs`: 解码 Key Block Info → `Vec<(compressed, decompressed)>` | `decodeHeadWordBlockInfo()` | 不同编码/版本 |
| P3-T3 | `key_block.rs`: 解析单个 Key Block → `Vec<(offset, headword)>` | `splitHeadWordBlock()` | UTF-8/UTF-16LE |
| P3-T4 | `record_block.rs`: 解析 Record Block Info → `Vec<RecordIndex>` | `readRecordBlockInfos()` | shadow position 计算 |
| P3-T5 | `record_block.rs`: 二分查找 + 解压 → 文章内容 | `readRecordBlock()`, `RecordIndex::bsearch()` | 随机访问多词条 |

**P3 产出**: `read_article(entries: &[KeyEntry], record_blocks: &[RecordIndex], data: &[u8]) → String`

### Phase 4 — 编码与内容处理

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P4-T1 | `encoding.rs`: 编码转换 (UTF-8/UTF-16LE/GB18030), BOM 检测 | `toUtf16()`, `Iconv`, `detectCssEncoding()` | 各编码 round-trip |
| P4-T2 | `stylesheet.rs`: `` `N` `` → prefix/suffix 替换 | `substituteStylesheet()` | 有/无/嵌套样式 |
| P4-T3 | `link.rs`: `@@@LINK=target` 解析 + 递归跟踪 + 防环 | `MdxArticleRequest` 中 @@@LINK 处理 | 单层/多层/循环 |

**P4 产出**: 文章内容后处理管线

### Phase 5 — MDD 资源文件

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P5-T1 | `mdd.rs`: MDD 文件解析 (复用 Key/Record Block 逻辑) | `IndexedMdd` | MDD 加载资源 |
| P5-T2 | `mdd.rs`: 路径归一化 (去 `.` 前缀, 确保 `\` 开头, 大小写不敏感) | `loadResourceFile()` | 各种路径格式 |
| P5-T3 | `mdd.rs`: 多分卷支持 (dict.mdd, dict.1.mdd, ...) | `findResourceFiles()` | 0/1/N 个 MDD |
| P5-T4 | `mdd.rs`: MDD `@@@LINK=` 重定向 (UTF-16LE) + 防环 | `MddResourceRequest::run()` | 重定向/循环 |

**P5 产出**: `load_resource(name: &str) → Result<Vec<u8>>`

### Phase 6 — 索引与搜索

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P6-T1 | `index.rs`: case fold + diacritics fold 为索引 key | `Folding` 模块 | fold 正确性 |
| P6-T2 | `index.rs`: FST 索引构建 (从解析结果) | `BtreeIndexing::buildIndex()` | 构建 + 序列化 |
| P6-T3 | `index.rs`: 索引持久化 (文件头 + mtime 检查) | `indexIsOldOrBad()` | 版本不匹配 → 重建 |
| P6-T4 | `search.rs`: 前缀搜索 (FST range) | `BtreeIndex::findArticles()` | 精确/前缀/无结果 |
| P6-T5 | `search.rs`: 模糊搜索 (Levenshtein) | 无 (GoldenDict 用 FTS) | 不同距离阈值 |

**P6 产出**: `prefix_search(query, limit) → Vec<SearchHit>`, `fuzzy_search(query, distance, limit) → Vec<SearchHit>`

### Phase 7 — 顶层 API + Benchmark

| Task | 内容 | 对应 GoldenDict | 测试 |
|---|---|---|---|
| P7-T1 | `dict.rs`: `MdxDict::open(path)` — 组装所有模块 | `MdictParser::open()` + `makeDictionaries()` | 端到端 open |
| P7-T2 | `dict.rs`: `MdxDict::lookup(word)` | `getArticle()` | 查词完整流程 |
| P7-T3 | `dict.rs`: `MdxDict::resource(name)` | `getResource()` | 资源加载 |
| P7-T4 | bench: criterion benchmark 全覆盖 | 无 | — |
| P7-T5 | 边缘测试: 空词典/损坏文件/超大词典 | 无 | — |

---

## 5. 测试策略

### 5.1 GoldenDict 无测试 — 我们需要从头构建

GoldenDict-ng 完全没有 MDX 相关测试，所有验证依赖手动运行词典。

### 5.2 TDD 测试金字塔

```
            ┌──────────────┐
            │ Integration  │  ← 真实 MDX/MDD 端到端
            │   (少量)      │
            ├──────────────┤
            │  Component   │  ← 模块组合: header→key→record
            │   (中量)      │
            ├──────────────┤
            │    Unit      │  ← 每个函数独立测试
            │   (大量)      │
            └──────────────┘
```

### 5.3 测试数据来源

1. **手写字节**: 用 Rust `&[u8]` 字面量构造最小有效输入
   - Header: 手写 UTF-16LE XML + Adler32
   - 压缩块: 用 `flate2::write::ZlibEncoder` 生成测试数据
   - 加密块: 用已知 key 加密再解密验证 round-trip

2. **Golden 文件**: 从已知词典提取的二进制片段 (存为 `.bin` fixture)
   - 一个 v1.x 的 header + key block
   - 一个 v2.0 的 header + key block
   - 一个加密的 key block info

3. **生成器**: Python `mdict-utils` 生成最小词典
   ```bash
   pip install mdict-utils
   echo -e "hello\t<p>world</p>" > test.txt
   mdict -a test.txt test.mdx
   ```

4. **真实词典**: gitignored, 用 `#[ignore]` 标注的集成测试

### 5.4 每个 Phase 的测试清单

#### Phase 1 测试

```rust
// P1-T1: types
#[test] fn version_from_f64_below_2();
#[test] fn version_from_f64_at_2();
#[test] fn encoding_normalize_gbk();
#[test] fn encoding_normalize_utf16();

// P1-T2: number
#[test] fn read_u32_be_from_bytes();
#[test] fn read_i64_be_from_bytes();
#[test] fn read_u8_single_byte();
#[test] fn read_u16_two_bytes();

// P1-T3: checksum
#[test] fn adler32_valid();
#[test] fn adler32_invalid();
#[test] fn adler32_empty_input();

// P1-T4: header
#[test] fn parse_header_v2_utf8();
#[test] fn parse_header_v1_gbk();
#[test] fn parse_header_with_stylesheet();
#[test] fn parse_header_empty_title_uses_filename();
#[test] fn parse_header_html_title_strips_tags();
#[test] fn parse_header_bad_checksum_errors();
#[test] fn parse_header_truncated_errors();
```

#### Phase 2 测试

```rust
// P2-T1/T2/T3: decompress
#[test] fn decompress_uncompressed_with_adler32();
#[test] fn decompress_uncompressed_bad_checksum();
#[test] fn decompress_zlib();
#[test] fn decompress_zlib_bad_checksum();
#[test] fn decompress_lzo();
#[test] fn decompress_unknown_type_errors();
#[test] fn decompress_too_small_block_errors();

// P2-T4: decrypt
#[test] fn ripemd128_key_derivation();
#[test] fn decrypt_roundtrip();
#[test] fn decrypt_known_vector();
```

#### Phase 3 测试

```rust
// P3-T1: key block header
#[test] fn parse_key_block_header_v2();
#[test] fn parse_key_block_header_v1();
#[test] fn parse_key_block_header_bad_checksum();

// P3-T2: key block info decode
#[test] fn decode_key_block_info_v2_utf8();
#[test] fn decode_key_block_info_v2_utf16le();
#[test] fn decode_key_block_info_v1();

// P3-T3: key block split
#[test] fn split_headwords_utf8_v2();
#[test] fn split_headwords_utf16le_v2();
#[test] fn split_headwords_utf8_v1();

// P3-T4: record block info
#[test] fn parse_record_block_info();
#[test] fn shadow_positions_accumulate_correctly();

// P3-T5: record lookup
#[test] fn bsearch_exact_match();
#[test] fn bsearch_not_found();
#[test] fn read_article_at_offset();
#[test] fn read_article_last_in_block();
```

#### Phase 4 测试

```rust
// P4-T1: encoding
#[test] fn decode_utf8();
#[test] fn decode_utf16le();
#[test] fn decode_gb18030();
#[test] fn detect_bom_utf8();
#[test] fn detect_bom_utf16le();
#[test] fn detect_no_bom_valid_utf8();
#[test] fn detect_no_bom_fallback_dict_encoding();

// P4-T2: stylesheet
#[test] fn substitute_single_style();
#[test] fn substitute_nested_styles();
#[test] fn substitute_unknown_id();
#[test] fn substitute_no_styles();
#[test] fn substitute_trailing_suffix();

// P4-T3: link
#[test] fn parse_link_simple();
#[test] fn parse_link_with_whitespace();
#[test] fn follow_link_chain();
#[test] fn detect_link_cycle();
```

#### Phase 5 测试

```rust
// P5-T1/T2: mdd
#[test] fn normalize_path_leading_dot();
#[test] fn normalize_path_forward_slash();
#[test] fn normalize_path_backslash_prefix();
#[test] fn normalize_path_case_insensitive();

// P5-T3: multi-volume
#[test] fn find_mdd_none();
#[test] fn find_mdd_single();
#[test] fn find_mdd_volumes();

// P5-T4: mdd link redirect
#[test] fn mdd_link_utf16le();
#[test] fn mdd_link_cycle_detection();
```

#### Phase 6 测试

```rust
// P6-T1: fold
#[test] fn fold_lowercase();
#[test] fn fold_diacritics();
#[test] fn fold_combined();

// P6-T2/T3: index
#[test] fn build_fst_index();
#[test] fn serialize_deserialize_index();
#[test] fn index_version_mismatch_triggers_rebuild();

// P6-T4/T5: search
#[test] fn prefix_search_exact();
#[test] fn prefix_search_partial();
#[test] fn prefix_search_empty();
#[test] fn fuzzy_search_distance_1();
#[test] fn fuzzy_search_distance_2();
#[test] fn fuzzy_search_no_match();
```

### 5.5 Rust 代码规范 (rust-skills)

按 `.agents/skills/rust-skills/rules/` 中的规则:

- **error**: `thiserror` 枚举, 每个变体有描述性消息
- **types**: 使用 newtype (`DictId(String)`) 避免 stringly-typed
- **ownership**: `&[u8]` 优先, `Cow<str>` 用于可能需要 decode 的场景
- **performance**: `Vec::with_capacity` 预分配, `extend` 批量, 迭代优于索引
- **testing**: `#[cfg(test)] mod tests`, arrange-act-assert, 描述性命名
- **project**: workspace deps, `pub(crate)` 内部可见性, feature 分模块

---

## 6. 依赖清单 (crates/mdict/Cargo.toml 补充)

```toml
[dependencies]
thiserror.workspace = true
tracing.workspace = true

# 解压缩
flate2 = "1"                    # zlib
minilzo-rs = "0.5"              # LZO1X (纯 Rust)

# 加密
ripemd = "0.1"                  # RIPEMD-128 (RustCrypto)

# 校验和
adler = "1"                     # Adler32

# 编码
encoding_rs = "0.8"             # UTF-8/UTF-16LE/GB18030 等

# XML 解析
quick-xml = "0.37"              # Header XML 解析

# 索引
fst = "0.4"                     # FST 有限状态转换器
unicode-normalization = "0.1"   # Unicode fold

# 文件映射
memmap2 = "0.9"                 # 零拷贝 mmap

# 序列化
postcard = { version = "1", features = ["alloc"] }  # 索引持久化

[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }
tempfile = "3"
```
