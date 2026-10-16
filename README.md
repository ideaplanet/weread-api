# weread-api

微信读书 Agent API Gateway 的 TypeScript SDK，完整实现官方 Skill（[Tencent/WeChatReading](https://github.com/Tencent/WeChatReading) v1.0.5）定义的**全部 17 个接口**：书城搜索、书籍信息、章节目录、阅读进度、书架同步、笔记划线、热门划线、阅读统计、公开点评、个性化推荐、相似书推荐等。

- **零运行时依赖**：仅使用 Node.js 18+ 原生 `fetch`
- **完整类型定义**：17 个接口的请求/回包 TypeScript 类型，覆盖官方文档全部字段说明
- **协议级实现对齐**：参数平铺、`skill_version` 上报、`errcode` / `upgrade_info` 处理、游标分页等官方规范细节均已落地
- **单文件代码**：`src/weread.ts` 一个文件包含全部实现，`src/weread.test.ts` 一个文件包含全部测试

## 安装

```bash
npm install        # 安装 dev 依赖（typescript / @types/node）
npm run build      # 构建到 dist/
```

作为依赖引入（发布后）：

```bash
npm install weread-api
```

## 获取 API Key

1. 打开官方配置页 <https://weread.qq.com/r/weread-skills>，扫码登录微信读书
2. 复制 API Key（格式 `wrk-xxxxxxxx`）
3. 设置环境变量：

```bash
export WEREAD_API_KEY=wrk-xxxxxxxx
```

API Key 绑定用户身份（vid），需要用户身份的接口由网关自动注入，无需手动传 vid。

## 快速开始

```typescript
import { WereadClient, SearchScope, ReadDataMode } from 'weread-api';

const client = new WereadClient(); // 自动读取环境变量 WEREAD_API_KEY

// 搜索书籍（明确找书用 scope=EBook）
const search = await client.search({ keyword: '三体', scope: SearchScope.EBook, count: 5 });
const book = search.results[0]?.books[0]?.bookInfo;

// 书架同步（总数口径：books + albums + mp，专辑/有声书也计入）
const shelf = await client.shelfSync();
const total = shelf.books.length + shelf.albums.length + (shelf.mp ? 1 : 0);

// 阅读进度（progress 为 0-100 整数，1 表示 1%）
const progress = await client.bookGetProgress(book!.bookId);
console.log(`已读 ${progress.book.progress}%`);

// 阅读统计（时长单位均为秒）
const stats = await client.readDataDetail({ mode: ReadDataMode.Monthly });
console.log(`本月阅读 ${stats.totalReadTime! / 3600} 小时，${stats.readDays} 天`);
```

直接运行内置全链路示例（覆盖搜索、书籍、书架、笔记、统计、点评、推荐）：

```bash
npm run example
```

## API 一览（17 个接口）

| 方法 | api_name | 说明 |
|---|---|---|
| `listApis()` | `/_list` | 元接口：列出所有可用接口及参数定义 |
| `search(params)` | `/store/search` | 书城搜索（9 种 scope：电子书/网文/听书/作者/全文/书单/公众号/文章） |
| `bookInfo(bookId)` | `/book/info` | 书籍基本信息（书名/作者/评分/ISBN/字数等） |
| `bookChapterInfo(bookId)` | `/book/chapterinfo` | 章节目录（chapterUid、层级、字数、付费状态） |
| `bookGetProgress(bookId)` | `/book/getprogress` | 单书阅读进度与累计时长 |
| `shelfSync()` | `/shelf/sync` | 书架同步（books + albums + mp + archive 书单） |
| `userNotebooks(params)` | `/user/notebooks` | 笔记本概览（count + lastSort 游标分页） |
| `bookBookmarkList(bookId)` | `/book/bookmarklist` | 单本书划线列表（自动过滤书签） |
| `reviewListMine(params)` | `/review/list/mine` | 单本书个人想法与点评（划线想法/章节点评/书评） |
| `bookUnderlines(params)` | `/book/underlines` | 章节划线热度统计（人数/得分，无文本） |
| `bookBestBookmarks(params)` | `/book/bestbookmarks` | 热门划线（含原文与人数，固定前 20 条） |
| `bookReadReviews(params)` | `/book/readreviews` | 指定划线范围下的想法/评论（reviews 数组参数） |
| `reviewSingle(params)` | `/review/single` | 单条想法详情（含评论与点赞） |
| `readDataDetail(params)` | `/readdata/detail` | 阅读统计（周/月/年/总计） |
| `reviewList(params)` | `/review/list` | 书籍公开点评（全部/推荐/不行/最新/一般） |
| `bookRecommend(params)` | `/book/recommend` | 个性化推荐（App 首页「为你推荐」） |
| `bookSimilar(params)` | `/book/similar` | 相似书推荐（默认 count=12、maxIdx=0） |

另有公开的 `client.request(apiName, params)` 可直接调用 SDK 尚未封装的新接口。

## 分页遍历

各接口分页机制不同（`maxIdx` / `lastSort` / `synckey` / `sessionId`），SDK 提供官方游标规则的异步生成器：

```typescript
// 笔记本概览：lastSort 游标翻页，直到 hasMore=0
const notebooks = [];
for await (const page of client.userNotebooksPages({ count: 20 })) {
  notebooks.push(...page.books);
}

// 搜索：hasMore=1 时用最后一条 searchIdx 作为下一页 maxIdx
for await (const page of client.searchPages({ keyword: '三体', scope: SearchScope.EBook })) {
  console.log(page.results);
}

// 公开点评：maxIdx（上一页最后一条 idx）+ synckey
for await (const page of client.reviewListPages({ bookId, reviewListType: 1 })) {
  console.log(page.reviews);
}

// 个人想法：synckey 游标
for await (const page of client.reviewListMinePages({ bookId })) {
  console.log(page.reviews);
}
```

所有生成器均带游标不推进保护，不会死循环。`/book/recommend`、`/book/similar` 回包无 `hasMore` 标记，请按 `searchIdx` / `idx + sessionId` 手动翻页。

## 错误处理

| 错误类 | 触发条件 |
|---|---|
| `WereadError` | 基础错误（如缺少 API Key） |
| `WereadHttpError` | 网关返回非 2xx（401 通常表示 API Key 无效或过期） |
| `WereadNetworkError` | 网络异常（超时、DNS、连接失败） |
| `WereadApiError` | 回包 `errcode` 非 0，含 `errcode` / `apiName` / `raw` |
| `WereadUpgradeError` | 回包出现 `upgrade_info`（官方规范：必须先升级再重试） |

```typescript
import { WereadApiError, WereadUpgradeError } from 'weread-api';

try {
  await client.shelfSync();
} catch (err) {
  if (err instanceof WereadUpgradeError) {
    // 按 err.upgradeInfo.message 升级，或调高 options.skillVersion 后重试
  } else if (err instanceof WereadApiError) {
    console.error(err.apiName, err.errcode, err.message);
  }
}
```

## 关键业务口径（易错点）

- **参数平铺**：业务参数必须在 body 顶层，与 `api_name` / `skill_version` 同级；禁止包在 `params` 里（SDK 已处理）
- **书架总数**：`books.length + albums.length + (mp 非空 ? 1 : 0)`，专辑/有声书也是书架里的书
- **笔记统计**：单本书总笔记数 = `reviewCount + noteCount + bookmarkCount`；`noteCount` 是划线数，不是总笔记数
- **阅读进度**：`progress` 为 0-100 整数，`1` 表示 1% 而非 100%；仅 `100`（且有 `finishTime`）代表读完
- **时长单位**：所有阅读时长字段单位为**秒**（`totalReadTime` 为总量主口径）
- **评分**：`star` 为 20 分制（20=一星 … 100=五星）；`newRating` 为 0-100 百分制
- **双层嵌套**：`/review/list` 回包的点评内容位于 `reviews[].review.review`
- **scope 语义**：请求参数 `scope` 与回包 `results[].scope` 不同（电子书分组回包常为 17）
- **时间展示**：Unix 时间戳建议转为 `YYYY-MM-DD`；价格单位为分

## 开发与测试

```bash
npm run build      # TypeScript 编译（strict 模式）
npm test           # 构建并运行 16 个单元测试（mock fetch，无需真实 API Key）
npm run typecheck  # 仅类型检查
```

测试覆盖：统一入口与鉴权、参数平铺与 `skill_version`、参数映射（`bookId → bookid`）与默认值（`/book/similar` 的 count/maxIdx）、四类游标分页遍历、`errcode` / `upgrade_info` / HTTP / 网络错误处理。

## 项目结构

```
weread-api/
├── src/
│   ├── weread.ts        # 全部实现：类型 + 错误 + WereadClient + 使用示例（1342 行）
│   └── weread.test.ts   # 全部测试（288 行）
├── dist/                # 构建产物
├── package.json
└── tsconfig.json
```

## 参考

- 官方 Skill 仓库：<https://github.com/Tencent/WeChatReading>
- API Key 配置页：<https://weread.qq.com/r/weread-skills>
- 网关统一入口：`POST https://i.weread.qq.com/api/agent/gateway`

## License

MIT
