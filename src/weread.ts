/**
 * 微信读书 Agent API Gateway TypeScript SDK（单文件实现）
 *
 * 完整实现官方 Skill（Tencent/WeChatReading v1.0.5）定义的全部 17 个接口：
 *   元接口：/_list
 *   搜索：/store/search
 *   书籍：/book/info、/book/chapterinfo、/book/getprogress
 *   书架：/shelf/sync
 *   笔记：/user/notebooks、/book/bookmarklist、/review/list/mine、/book/underlines、
 *         /book/bestbookmarks、/book/readreviews、/review/single
 *   统计：/readdata/detail
 *   点评：/review/list
 *   推荐：/book/recommend、/book/similar
 *
 * 接入说明：
 * - API Key 在 https://weread.qq.com/r/weread-skills 扫码登录获取（格式 wrk-xxxxxxxx），
 *   通过 options.apiKey 或环境变量 WEREAD_API_KEY 提供
 * - 所有请求走统一网关 POST https://i.weread.qq.com/api/agent/gateway
 * - 业务参数平铺在 body 顶层，与 api_name、skill_version 同级（禁止嵌套包裹）
 * - 回包 errcode 非 0 表示错误；出现 upgrade_info 必须先升级再重试
 * - 需要 Node.js 18+（使用原生 fetch）
 *
 * 直接运行本文件可执行使用示例（需设置环境变量 WEREAD_API_KEY）：node dist/weread.js
 */
import { pathToFileURL } from 'node:url';

// ============================================================
// 一、类型定义（依据官方 Skill 仓库 v1.0.5 接口文档）
// ============================================================

// ---------- 通用 ----------

/** 网关回包中的升级提示（出现时必须按 message 指引升级后重试） */
export interface UpgradeInfo {
  message?: string;
  [key: string]: unknown;
}

/** 评分标签 */
export interface RatingDetail {
  /** 如「神作」「力荐」 */
  title?: string;
  [key: string]: unknown;
}

/** /_list 元接口回包：所有可用接口及参数定义（结构以实际回包为准） */
export type ApiListResponse = Record<string, unknown>;

// ---------- 搜索 /store/search ----------

/** 搜索类型（请求参数；回包分组 scope 语义不同，电子书分组常为 17） */
export const SearchScope = {
  /** 全部：综合搜索，results 返回多个分组 */
  All: 0,
  /** 电子书（不含网文；服务端默认值） */
  EBook: 10,
  /** 网文小说 */
  WebNovel: 16,
  /** 微信听书：有声书/专辑/播客 */
  AudioBook: 14,
  /** 作者 */
  Author: 6,
  /** 全文：搜索书籍正文内容 */
  FullText: 12,
  /** 书单 */
  BookList: 13,
  /** 公众号 */
  OfficialAccount: 2,
  /** 文章：公众号文章 */
  Article: 4,
} as const;
export type SearchScope = (typeof SearchScope)[keyof typeof SearchScope];

export interface SearchParams {
  /** 搜索关键词 */
  keyword: string;
  /** 搜索类型；不传时服务端默认 10（电子书） */
  scope?: SearchScope;
  /** 翻页偏移，默认 0；下一页传上一页最后一条的 searchIdx */
  maxIdx?: number;
  /** 每页数量，服务端默认 15 */
  count?: number;
}

export interface SearchBookInfo {
  bookId: string;
  title: string;
  author?: string;
  cover?: string;
  intro?: string;
  publisher?: string;
  category?: string;
  payType?: string | number;
  /** 价格，单位：分 */
  price?: number;
  /** 是否下架（1=下架，需标注） */
  soldout?: 0 | 1;
  /** 阅读器跳转链接 */
  readerLink?: string;
  /** 书籍详情跳转链接 */
  deepLink?: string;
}

export interface SearchBookItem {
  /** 搜索序号，翻页时作为下一页 maxIdx */
  searchIdx: number;
  /** 在读人数 */
  readingCount?: number;
  /** 评分（0-100 百分制） */
  newRating?: number;
  /** 评分人数 */
  newRatingCount?: number;
  newRatingDetail?: RatingDetail;
  bookInfo: SearchBookInfo;
}

export interface SearchResultGroup {
  /** 分组标题，如「电子书」「作者」 */
  title: string;
  /** 回包分组类型，不保证等于请求参数 scope */
  scope: number;
  /** 该分组总结果数 */
  scopeCount?: number;
  /** 本次返回数量 */
  currentCount?: number;
  books: SearchBookItem[];
}

export interface SearchResponse {
  /** 搜索会话 ID */
  sid?: string;
  /** 是否有更多（1=有，0=无） */
  hasMore: 0 | 1;
  /** 搜索结果分组数组；scope=0 时返回多个分组 */
  results: SearchResultGroup[];
}

// ---------- 书籍 /book/info、/book/chapterinfo、/book/getprogress ----------

export interface BookInfo {
  bookId: string;
  title: string;
  author?: string;
  translator?: string;
  cover?: string;
  intro?: string;
  category?: string;
  publisher?: string;
  publishTime?: string;
  isbn?: string;
  /** 总字数 */
  wordCount?: number;
  /** 评分（百分制） */
  newRating?: number;
  newRatingCount?: number;
  newRatingDetail?: RatingDetail;
  readerLink?: string;
  deepLink?: string;
}

export interface ChapterAnchor {
  title?: string;
  [key: string]: unknown;
}

export interface Chapter {
  /** 章节 UID，是 /book/underlines、/book/bestbookmarks 等接口的必要参数 */
  chapterUid: number;
  /** 章节序号 */
  chapterIdx: number;
  title: string;
  /** 章节字数 */
  wordCount?: number;
  /** 目录层级（1=一级标题，2=二级，依此类推） */
  level?: number;
  updateTime?: number;
  /** 章节价格（0=免费） */
  price?: number;
  /** 是否已购买（1=已购买） */
  paid?: 0 | 1;
  /** 是否公众号章节（1=是） */
  isMPChapter?: 0 | 1;
  /** 章节内锚点/子标题数组 */
  anchors?: ChapterAnchor[];
}

export interface ChapterInfoResponse {
  bookId: string;
  /** 同步 key（版本号） */
  synckey: number;
  chapterUpdateTime?: number;
  chapters: Chapter[];
}

export interface BookProgressInfo {
  /** 当前阅读章节 UID */
  chapterUid?: number;
  /** 当前章节内偏移 */
  chapterOffset?: number;
  /** 阅读进度百分比（0-100 整数）。注意：1 表示 1% 而非 100%，仅 100 代表读完 */
  progress: number;
  /** 最后阅读时间（Unix 时间戳） */
  updateTime?: number;
  /** 累计阅读时长（秒） */
  recordReadingTime?: number;
  /** 读完时间（仅 progress=100 时存在） */
  finishTime?: number;
  isStartReading?: 0 | 1;
}

export interface BookProgressResponse {
  bookId: string;
  book: BookProgressInfo;
  /** 服务端时间戳 */
  timestamp?: number;
}

// ---------- 书架 /shelf/sync ----------

export interface ShelfBook {
  bookId: string;
  title: string;
  author?: string;
  cover?: string;
  category?: string;
  readerLink?: string;
  deepLink?: string;
  /** 最近阅读时间（Unix 时间戳） */
  readUpdateTime?: number;
  /** 是否读完（1=读完） */
  finishReading?: 0 | 1;
  /** 书籍更新时间 */
  updateTime?: number;
  /** 是否置顶（1=置顶） */
  isTop?: 0 | 1;
  /** 是否私密（1=私密） */
  secret?: 0 | 1;
}

export interface ShelfAlbumInfo {
  /** 专辑唯一标识 */
  albumId: string | number;
  /** 专辑名称 */
  name: string;
  /** 演播/作者 */
  authorName?: string;
  cover?: string;
  /** 音频集数 */
  trackCount?: number;
  /** 完结状态文案，如「已完结」 */
  finishStatus?: string;
  /** 是否完结（1=完结） */
  finish?: 0 | 1;
  payType?: string | number;
  intro?: string;
  updateTime?: number;
}

export interface ShelfAlbumExtra {
  /** 是否私密（1=私密） */
  secret?: 0 | 1;
  /** 是否已购买（1=已购买） */
  lecturePaid?: 0 | 1;
  /** 最近收听时间（Unix 时间戳） */
  lectureReadUpdateTime?: number;
  isTop?: 0 | 1;
}

/** 专辑 = 有声书，与 books 完全独立 */
export interface ShelfAlbum {
  albumInfo: ShelfAlbumInfo;
  albumInfoExtra: ShelfAlbumExtra;
}

/** 文章收藏入口；非空即表示书架有 1 个「文章收藏」条目（不含具体文章内容） */
export type ShelfMpEntry = Record<string, unknown>;

export interface ShelfArchive {
  /** 书单名称 */
  name?: string;
  /** 书单内 bookId 列表 */
  bookIds?: string[];
}

export interface ShelfSyncResponse {
  /** 电子书/导入书/公众号类书籍条目数组（不含 albums 与 mp） */
  books: ShelfBook[];
  /** 专辑/有声书数组 */
  albums: ShelfAlbum[];
  /** 文章收藏入口；非空表示书架有 1 个文章收藏条目 */
  mp?: ShelfMpEntry | null;
  /** 书单 */
  archive?: ShelfArchive[];
  /** 可枚举电子书数量，通常等于 books.length；不含 albums 与 mp */
  bookCount?: number;
}

// ---------- 笔记与划线 ----------

/** /user/notebooks 请求参数（仅支持 count + lastSort 游标分页，禁止 offset/limit） */
export interface UserNotebooksParams {
  /** 每页数量，默认 20 */
  count?: number;
  /** 翻页游标（上一页最后一条的 sort 值）；首页不传 */
  lastSort?: number;
}

export interface NotebookBookBrief {
  bookId?: string;
  title?: string;
  author?: string;
  cover?: string;
  [key: string]: unknown;
}

export interface NotebookEntry {
  bookId: string;
  book?: NotebookBookBrief;
  /** 想法/点评数（含划线想法、书评想法/个人点评、书摘、非书籍想法） */
  reviewCount: number;
  /** 划线数（高亮标注的原文条数）。注意：字段名易误读，不是单本书总笔记数 */
  noteCount: number;
  /** 书签数（仅数量统计，接口不导出书签内容） */
  bookmarkCount: number;
  readingProgress?: number;
  /** 标记状态（1=读完，0=在读） */
  markedStatus?: 0 | 1;
  /** 排序值（最近笔记时间），翻页游标 */
  sort: number;
}

export interface UserNotebooksResponse {
  /** 有笔记的书籍总数 */
  totalBookCount: number;
  /** 笔记总条数（reviewCount + noteCount + bookmarkCount 汇总） */
  totalNoteCount: number;
  hasMore: 0 | 1;
  books: NotebookEntry[];
}

/** /book/bookmarklist 划线条目（服务端已过滤书签 type=0，只返回划线 type=1） */
export interface Bookmark {
  bookmarkId: string;
  bookId: string;
  chapterUid: number;
  /** 划线原文 */
  markText: string;
  createTime?: number;
  type?: number;
  /** 位置范围，如 "393-401" */
  range?: string;
  colorStyle?: number;
}

export interface BookmarkChapterBrief {
  chapterUid: number;
  chapterIdx?: number;
  title?: string;
}

export interface BookmarkListResponse {
  /** 划线数组 */
  updated: Bookmark[];
  /** 章节信息数组，用于定位划线所属章节 */
  chapters: BookmarkChapterBrief[];
  book?: Record<string, unknown>;
}

/** /review/list/mine 请求参数（网关参数名为小写 bookid，SDK 已统一为 bookId） */
export interface MyReviewsParams {
  bookId: string;
  /** 翻页游标，默认 0 */
  synckey?: number;
  /** 每页数量，默认 20 */
  count?: number;
}

export interface MyReview {
  reviewId: string;
  /** 想法内容文本 */
  content?: string;
  /** 对应的划线原文；仅能定位原文的内容有值（整本书评/章节点评可能为空） */
  abstract?: string;
  /** 划线原文位置范围，如 "2959-3007" */
  range?: string;
  chapterUid?: number;
  chapterIdx?: number;
  createTime?: number;
  /** 评分（0-5，-1=无评分） */
  star?: number;
  /** 所在章节名（章节点评时有值，书评为空） */
  chapterName?: string;
  /** 是否读完（书评时有值） */
  isFinish?: 0 | 1;
}

export interface MyReviewItem {
  review: MyReview;
}

export interface MyReviewsResponse {
  reviews: MyReviewItem[];
  /** 总条数 */
  totalCount?: number;
  hasMore: 0 | 1;
  /** 翻页游标（下次请求传入） */
  synckey: number;
}

/** /book/underlines 请求参数 */
export interface UnderlinesParams {
  bookId: string;
  /** 章节 UID（从 /book/chapterinfo 获取） */
  chapterUid: number;
  /** 增量同步 key，默认 0 */
  synckey?: number;
}

export interface Underline {
  /** 划线位置范围，如 "393-401" */
  range: string;
  /** 划线人数 */
  count: number;
  /** 热度分数 */
  score?: number;
  /** 划线类型 */
  type?: number;
}

export interface UnderlinesResponse {
  bookId: string;
  chapterUid: number;
  underlines: Underline[];
  synckey: number;
}

/** /book/bestbookmarks 请求参数 */
export interface BestBookmarksParams {
  bookId: string;
  /** 章节 UID；0=全部章节（默认 0） */
  chapterUid?: number;
  /** 增量同步 key，默认 0 */
  synckey?: number;
}

export interface BestBookmark {
  bookId: string;
  /** 代表用户 VID */
  userVid?: string | number;
  bookmarkId: string;
  chapterUid: number;
  /** 划线位置范围，如 "393-401" */
  range: string;
  /** 划线原文 */
  markText: string;
  /** 划线人数 */
  totalCount: number;
  /** 简体书籍 range（繁简体书专属） */
  simplifiedRange?: string;
  /** 繁体书籍 range（繁简体书专属） */
  traditionalRange?: string;
}

export interface BestBookmarkChapter {
  bookId?: string;
  chapterUid: number;
  chapterIdx?: number;
  title?: string;
}

export interface BestBookmarksResponse {
  /** 数据版本号 */
  synckey: number;
  /** 热门划线总数 */
  totalCount: number;
  /** 热门划线数组（固定前 20 条，按热度排序，不支持分页） */
  items: BestBookmark[];
  chapters: BestBookmarkChapter[];
}

/** /book/readreviews 请求参数中 reviews 数组的元素 */
export interface ReadReviewRangeParam {
  /** 划线位置范围（从 /book/bestbookmarks 获取） */
  range: string;
  /** 翻页偏移，默认 0 */
  maxIdx?: number;
  /** 每页数量，服务端上限 20，超过自动截断 */
  count?: number;
  /** 翻页游标，默认 0 */
  synckey?: number;
}

export interface ReadReviewsParams {
  bookId: string;
  chapterUid: number;
  /** 要查询的划线范围数组（网关允许的对象型业务参数） */
  reviews: ReadReviewRangeParam[];
}

export interface ReviewAuthor {
  userVid?: string | number;
  name?: string;
  avatar?: string;
}

export interface PageReview {
  reviewId: string;
  review: {
    /** 划线原文（想法对应的划线内容） */
    abstract?: string;
    /** 想法内容 */
    content?: string;
    range?: string;
    createTime?: number;
    author?: ReviewAuthor;
    [key: string]: unknown;
  };
}

export interface ReadReviewGroup {
  range: string;
  /** 该范围下想法总数 */
  totalCount: number;
  hasMore: 0 | 1;
  maxIdx: number;
  synckey: number;
  pageReviews: PageReview[];
}

export interface ReadReviewsResponse {
  bookId: string;
  chapterUid: number;
  /** 每个 range 一组的想法列表 */
  reviews: ReadReviewGroup[];
}

/** /review/single 请求参数 */
export interface ReviewSingleParams {
  reviewId: string;
  /** 拉取评论数量，默认 10 */
  commentsCount?: number;
  /** 评论排序方向：0=倒序（默认），1=正序 */
  commentsDirection?: 0 | 1;
  /** 拉取点赞数量，默认 10 */
  likesCount?: number;
  /** 点赞排序方向：0=倒序 */
  likesDirection?: 0 | 1;
  /** 增量同步 key，默认 0 */
  synckey?: number;
}

export interface ReviewSingleResponse {
  reviewId: string;
  review: {
    content?: string;
    bookId?: string;
    chapterUid?: number;
    createTime?: number;
    author?: ReviewAuthor;
    [key: string]: unknown;
  };
  /** 富文本内容 */
  htmlContent?: string;
  synckey?: number;
}

// ---------- 阅读统计 /readdata/detail ----------

export const ReadDataMode = {
  /** 本周（自然周，baseTime 归一到周一 00:00） */
  Weekly: 'weekly',
  /** 本月（自然月，默认） */
  Monthly: 'monthly',
  /** 本年（自然年，baseTime 归一到年初 00:00；只返回该自然年数据） */
  Annually: 'annually',
  /** 全部历史（baseTime 固定 0） */
  Overall: 'overall',
} as const;
export type ReadDataMode = (typeof ReadDataMode)[keyof typeof ReadDataMode];

export interface ReadDataParams {
  /** 统计维度，默认 monthly */
  mode?: ReadDataMode;
  /** 基准时间戳；0=当前周期；传历史时间戳查该时间所在周期；overall 固定 0 */
  baseTime?: number;
}

export interface ReadLongestItem {
  /** 电子书信息（排行条目为电子书时返回） */
  book?: { bookId?: string; title?: string; author?: string; cover?: string; [key: string]: unknown };
  /** 有声内容信息（排行条目为有声书/专辑时返回） */
  albumInfo?: Record<string, unknown>;
  /** 该内容在统计范围内的阅读/收听时长（秒） */
  readTime: number;
  /** 朗读/记录类阅读时长（秒），存在时才返回 */
  recordReadingTime?: number;
  /** 标签，如「笔记最多」「单日阅读最久」 */
  tags?: string[];
}

export interface ReadStatItem {
  /** 统计项名称：读过/读完/阅读/笔记 */
  stat: string;
  /** 统计值文案，如「12本」「45天」「120条」 */
  counts: string;
  /** 对应统计项的 App 跳转链接，可能为空 */
  scheme?: string;
}

export interface PreferCategory {
  categoryId?: string | number;
  categoryTitle: string;
  parentCategoryId?: string | number;
  parentCategoryTitle?: string;
  /** 分类偏好权重（按最高分类阅读时长归一化，图表展示用） */
  val?: number;
  /** 该分类阅读时长（秒） */
  readingTime?: number;
  /** 该分类阅读本数 */
  readingCount?: number;
  /** 分类类型标记（普通分类为 0） */
  categoryType?: number;
}

export interface PreferAuthor {
  authorId?: string | number;
  name: string;
  /** 阅读该作者的书本数 */
  count?: number;
  /** 阅读时长（格式化字符串，如「5小时30分钟」，不是秒数） */
  readTime?: string;
  user?: Record<string, unknown>;
}

export interface ReadDataResponse {
  /** 统计周期基准时间戳 */
  baseTime?: number;
  /** 分桶总时长（key=分桶起始时间戳，value=秒）：周/月按天、年按月、总计按年 */
  readTimes?: Record<string, number>;
  /** 年度模式可能返回的每日时长明细（秒），用于日历展示与边界日级扣减 */
  dailyReadTimes?: Record<string, number>;
  /** 有效阅读天数（当前规则：单日阅读满 1 分钟） */
  readDays?: number;
  /** 当前周期总阅读/收听时长（秒），统计总量的主口径字段 */
  totalReadTime?: number;
  /** 日均时长（秒）；分母是周期内自然日数，不是 readDays */
  dayAverageReadTime?: number;
  /** 与上一周期日均对比比例；0.2 = 约增长 20%；仅当前周期且上期数据足够时返回 */
  compare?: number;
  /** 读得最多的书/有声内容排行（最多 10 条，按 readTime 降序，低于 5 分钟过滤） */
  readLongest?: ReadLongestItem[];
  /** 阅读统计摘要 */
  readStat?: ReadStatItem[];
  /** 偏好分类（最多 8 个） */
  preferCategory?: PreferCategory[];
  /** 偏好分类文案，如「偏好阅读文学」 */
  preferCategoryWord?: string;
  /** 24 小时时段分布（秒）。注意：顺序从 6 点开始到次日 5 点，不是从 0 点开始 */
  preferTime?: number[];
  /** 偏好时段文案；总时长不足 10 小时可能不返回 */
  preferTimeWord?: string;
  /** 偏好作者（数据达阈值才返回） */
  preferAuthor?: PreferAuthor[];
  /** 符合统计条件的作者总数 */
  authorCount?: number;
  /** 偏好出版社（至少 3 个出版社且达阈值才返回） */
  preferPublisher?: Array<{ name: string; count?: number }>;
  /** 偏好版权方（满足阈值才返回） */
  preferCp?: Array<{ count?: number; copyrightInfo?: Record<string, unknown> }>;
  /** 文字阅读占比（%），约 wrReadTime/(wrReadTime+wrListenTime)*100；不足 1 小时或占比过高时不返回 */
  readRate?: number;
  /** 文字阅读时长（秒），仅 readRate 可展示时返回 */
  wrReadTime?: number;
  /** 听书/TTS/有声内容时长（秒），仅 readRate 可展示时返回 */
  wrListenTime?: number;
  /** 本周好友阅读排行（仅当前周且未隐藏时返回） */
  rank?: { text?: string; scheme?: string };
  /** 注册时间戳 */
  registTime?: number;
  /** 勋章数组（可展示勋章不少于 3 个时返回） */
  medals?: Array<Record<string, unknown>>;
  /** 偏好阅读书籍卡片（随活动配置变化） */
  preferBooks?: Array<Record<string, unknown>>;
  /** 年度报告入口（随活动配置变化） */
  yearReport?: Array<Record<string, unknown>>;
  /** 总朗读/记录类阅读时长（秒），主要在 overall 模式汇总返回 */
  recordReadingTime?: number;
  readRecordsWord?: string;
  readDistributionWord?: string;
  /** 阅读时长档位，当前为 [60, 1800, 3600, 10800, 18000] */
  readTimeGears?: number[];
  styleType?: string;
  [key: string]: unknown;
}

// ---------- 公开点评 /review/list ----------

export const ReviewListType = {
  /** 全部（默认） */
  All: 0,
  /** 推荐 */
  Recommend: 1,
  /** 不行（差评） */
  NotRecommended: 2,
  /** 最新 */
  Newest: 3,
  /** 一般 */
  Neutral: 4,
} as const;
export type ReviewListType = (typeof ReviewListType)[keyof typeof ReviewListType];

export interface ReviewListParams {
  bookId: string;
  /** 筛选类型，默认 0（全部） */
  reviewListType?: ReviewListType;
  /** 每页数量，默认 20 */
  count?: number;
  /** 翻页偏移，传上一页最后一条的 idx */
  maxIdx?: number;
  /** 翻页游标，默认 0 */
  synckey?: number;
}

/** 评分（20 分制）：20=一星，40=二星，60=三星，80=四星，100=五星 */
export type StarRating = 20 | 40 | 60 | 80 | 100;

export interface PublicReview {
  reviewId: string;
  content?: string;
  /** 点评 HTML 富文本 */
  htmlContent?: string;
  star?: StarRating;
  /** 是否读完此书 */
  isFinish?: 0 | 1;
  createTime?: number;
  /** 所在章节名（章节点评时有值） */
  chapterName?: string;
  author?: ReviewAuthor;
  book?: { bookId?: string; title?: string; author?: string };
}

/** 列表条目。注意：存在双层 review 嵌套，点评内容字段位于 review.review */
export interface PublicReviewItem {
  /** 序号，翻页时作为下一页 maxIdx */
  idx: number;
  review: { review: PublicReview };
}

export interface FriendCommentUser {
  userVid?: string | number;
  name?: string;
  avatar?: string;
}

export interface ReviewListResponse {
  /** 翻页游标（下次请求传入） */
  synckey?: number;
  /** 点评总数 */
  reviewsCnt?: number;
  /** 最新点评数 */
  recentTotalCnt?: number;
  /** 是否有更多点评（1=有） */
  reviewsHasMore?: 0 | 1;
  /** 是否有五星推荐点评（1=有） */
  reviewsHas5Star?: 0 | 1;
  /** 是否有一星差评（1=有） */
  reviewsHas1Star?: 0 | 1;
  /** 是否有最新点评（1=有） */
  reviewsHasRecent?: 0 | 1;
  /** 好友点评数 */
  friendCommentCount?: number;
  /** 点评好友数 */
  friendUniqueCount?: number;
  friendCommentUsers?: FriendCommentUser[];
  /** 资深会员推荐摘要，如「2337 个资深会员点评」 */
  deepVRecommendInfo?: { title?: string; subtitle?: string };
  /** 资深会员推荐比例（862 = 86.2%） */
  deepVRecommendValue?: number;
  /** 点评资深会员数 */
  deepVUniqueCount?: number;
  reviews: PublicReviewItem[];
}

// ---------- 推荐发现 /book/recommend、/book/similar ----------

export interface RecommendParams {
  /** 每页数量，默认 12 */
  count?: number;
  /** 翻页偏移，传上一页最后一条的 searchIdx */
  maxIdx?: number;
}

export interface RecommendBook {
  bookId: string;
  title: string;
  author?: string;
  cover?: string;
  intro?: string;
  category?: string;
  /** 推荐理由 */
  reason?: string;
  readingCount?: number;
  /** 结果序号（用于翻页） */
  searchIdx?: number;
  newRating?: number;
  newRatingCount?: number;
  newRatingDetail?: RatingDetail;
  /** 价格（分） */
  price?: number;
  payType?: string | number;
  /** 书籍类型（0=电子书） */
  type?: number;
  readerLink?: string;
  deepLink?: string;
}

export interface RecommendResponse {
  books: RecommendBook[];
}

export interface SimilarParams {
  bookId: string;
  /** 每页数量；底层要求显式传值，SDK 未传时默认 12 */
  count?: number;
  /** 翻页偏移；首页传 0，翻页传上一页最后一条的 idx；SDK 未传时默认 0 */
  maxIdx?: number;
  /** 翻页会话 ID；首次不传，翻页传回包中的值 */
  sessionId?: string;
}

export interface SimilarBook {
  /** 结果序号，下次请求 maxIdx 传最后一条的 idx */
  idx: number;
  book: {
    bookInfo: {
      bookId: string;
      title?: string;
      author?: string;
      cover?: string;
      readerLink?: string;
      deepLink?: string;
    };
  };
}

export interface SimilarResponse {
  booksimilar: {
    /** 会话 ID（翻页时传入下次请求） */
    sessionId: string;
    books: SimilarBook[];
  };
}

// ============================================================
// 二、错误定义
// ============================================================

/** 微信读书 SDK 基础错误 */
export class WereadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WereadError';
  }
}

/** HTTP 层错误（网关返回非 2xx 状态码，如 401 表示 API Key 无效） */
export class WereadHttpError extends WereadError {
  readonly status: number;
  readonly apiName: string;

  constructor(status: number, apiName: string, bodyText: string) {
    const detail = bodyText ? `：${bodyText.slice(0, 200)}` : '';
    super(`[weread] 请求 ${apiName} 失败：HTTP ${status}${detail}（401 通常表示 API Key 无效或过期）`);
    this.name = 'WereadHttpError';
    this.status = status;
    this.apiName = apiName;
  }
}

/** 网络层错误（请求未到达网关：超时、DNS、连接失败等） */
export class WereadNetworkError extends WereadError {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`[weread] 网络请求失败：${detail}`);
    this.name = 'WereadNetworkError';
    this.cause = cause;
  }
}

/** 网关业务错误（回包 errcode 非 0） */
export class WereadApiError extends WereadError {
  readonly errcode: number;
  readonly apiName: string;
  /** 原始回包（便于排查） */
  readonly raw: Record<string, unknown>;

  constructor(apiName: string, errcode: number, errmsg: string, raw: Record<string, unknown>) {
    super(`[weread] 接口 ${apiName} 返回错误 errcode=${errcode}：${errmsg}`);
    this.name = 'WereadApiError';
    this.errcode = errcode;
    this.apiName = apiName;
    this.raw = raw;
  }
}

/**
 * 网关要求升级 Skill 版本（回包出现 upgrade_info）。
 * 按官方规范：必须立即暂停当前操作，按 upgradeInfo.message 完成升级后再重新执行请求。
 * 可通过升级 SDK（更新 SKILL_VERSION 对应的 skill_version）或临时传入更高的
 * options.skillVersion 解决。
 */
export class WereadUpgradeError extends WereadError {
  readonly upgradeInfo: UpgradeInfo;

  constructor(upgradeInfo: UpgradeInfo) {
    super(`[weread] 网关要求升级：${upgradeInfo.message ?? JSON.stringify(upgradeInfo)}`);
    this.name = 'WereadUpgradeError';
    this.upgradeInfo = upgradeInfo;
  }
}

// ============================================================
// 三、网关客户端
// ============================================================

/** 网关统一入口地址（不含路径） */
const DEFAULT_BASE_URL = 'https://i.weread.qq.com';
const GATEWAY_PATH = '/api/agent/gateway';
const DEFAULT_TIMEOUT_MS = 15_000;

/** 当前 Skill 版本，对应官方仓库 skills/SKILL.md 的 version 字段；每次请求自动携带 */
export const SKILL_VERSION = '1.0.5';

export interface WereadClientOptions {
  /** 微信读书 API Key（格式 wrk-xxxxxxxx）；缺省时读取环境变量 WEREAD_API_KEY */
  apiKey?: string;
  /** 网关地址，默认 https://i.weread.qq.com */
  baseUrl?: string;
  /** Skill 版本号，默认 1.0.5；网关通过 upgrade_info 通知升级时需调高此值 */
  skillVersion?: string;
  /** 单次请求超时（毫秒），默认 15000 */
  timeoutMs?: number;
  /** 自定义 fetch 实现（用于测试或代理） */
  fetchImpl?: typeof fetch;
}

export class WereadClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly skillVersion: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WereadClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.WEREAD_API_KEY;
    if (!apiKey) {
      throw new WereadError(
        '缺少微信读书 API Key：请在 https://weread.qq.com/r/weread-skills 扫码登录获取' +
          '（格式 wrk-xxxxxxxx），通过 options.apiKey 传入，或设置环境变量 WEREAD_API_KEY',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.skillVersion = options.skillVersion ?? SKILL_VERSION;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * 网关统一请求。业务参数平铺在 body 顶层，与 api_name、skill_version 同级；
   * 值为 undefined 的参数会在序列化时被丢弃。
   *
   * 该方法公开导出，可用于调用 SDK 尚未封装的新接口：
   * `client.request('/new/api', { foo: 1 })`
   */
  async request<T>(apiName: string, params: Record<string, unknown> = {}): Promise<T> {
    const body: Record<string, unknown> = {
      api_name: apiName,
      skill_version: this.skillVersion,
      ...params,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${GATEWAY_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new WereadNetworkError(err);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new WereadHttpError(response.status, apiName, text);
    }

    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new WereadError(`[weread] 接口 ${apiName} 返回了非 JSON 响应`);
    }

    // 官方规范：回包出现 upgrade_info 时必须立即暂停并升级，不得忽略
    if (json.upgrade_info) {
      throw new WereadUpgradeError(json.upgrade_info as UpgradeInfo);
    }

    const errcode = json.errcode ?? json.errCode;
    if (typeof errcode === 'number' && errcode !== 0) {
      const errmsg = (json.errmsg ?? json.errMsg ?? '未知错误') as string;
      throw new WereadApiError(apiName, errcode, errmsg, json);
    }

    return json as T;
  }

  // ---------- 元接口 ----------

  /** /_list — 列出网关所有可用接口及参数定义 */
  listApis(): Promise<ApiListResponse> {
    return this.request('/_list');
  }

  // ---------- 搜索 ----------

  /**
   * /store/search — 书城搜索。
   * scope 决定搜索类型（见 SearchScope 常量）；回包为分页片段，不代表全量结果。
   * 注意：请求参数 scope 与回包 results[].scope 语义不同（电子书分组回包常为 17），
   * 过滤分组请用分组标题，不要用 results[].scope === 10。
   */
  search(params: SearchParams): Promise<SearchResponse> {
    return this.request('/store/search', { ...params });
  }

  /**
   * /store/search 分页遍历：hasMore=1 时，用最后一条 searchIdx 作为下一页 maxIdx。
   *
   * @example
   * for await (const page of client.searchPages({ keyword: '三体', scope: SearchScope.EBook })) {
   *   for (const group of page.results) console.log(group.title, group.books.length);
   * }
   */
  async *searchPages(params: SearchParams): AsyncGenerator<SearchResponse> {
    let maxIdx = params.maxIdx;
    for (;;) {
      const res = await this.search(maxIdx === undefined ? params : { ...params, maxIdx });
      yield res;
      if (res.hasMore !== 1 || res.results.length === 0) return;
      const group = res.results[res.results.length - 1];
      const last = group?.books?.[group.books.length - 1];
      if (!last || typeof last.searchIdx !== 'number' || last.searchIdx === maxIdx) return;
      maxIdx = last.searchIdx;
    }
  }

  // ---------- 书籍信息 ----------

  /** /book/info — 书籍基本信息（书名/作者/评分/ISBN/字数等） */
  bookInfo(bookId: string): Promise<BookInfo> {
    return this.request('/book/info', { bookId });
  }

  /** /book/chapterinfo — 章节目录（chapterUid 是划线热度等接口的必要参数） */
  bookChapterInfo(bookId: string): Promise<ChapterInfoResponse> {
    return this.request('/book/chapterinfo', { bookId });
  }

  /** /book/getprogress — 单书阅读进度与累计时长（progress 为 0-100 整数，1 表示 1%） */
  bookGetProgress(bookId: string): Promise<BookProgressResponse> {
    return this.request('/book/getprogress', { bookId });
  }

  // ---------- 书架 ----------

  /**
   * /shelf/sync — 书架同步（用户身份由 API Key 自动注入）。
   * 书架条目总数口径：books.length + albums.length + (mp 非空 ? 1 : 0)，
   * 专辑/有声书（albums）也是书架里的书，必须计入。
   */
  shelfSync(): Promise<ShelfSyncResponse> {
    return this.request('/shelf/sync');
  }

  // ---------- 笔记与划线 ----------

  /**
   * /user/notebooks — 笔记本概览（所有有笔记的书）。
   * 仅支持 count + lastSort 游标分页；单本书总笔记数 = reviewCount + noteCount + bookmarkCount。
   */
  userNotebooks(params: UserNotebooksParams = {}): Promise<UserNotebooksResponse> {
    return this.request('/user/notebooks', { ...params });
  }

  /**
   * /user/notebooks 分页遍历：hasMore=1 时取本页最后一条 sort 作为下一页 lastSort，
   * 直到 hasMore=0。
   *
   * @example
   * const all = [];
   * for await (const page of client.userNotebooksPages({ count: 20 })) all.push(...page.books);
   */
  async *userNotebooksPages(
    params: Omit<UserNotebooksParams, 'lastSort'> = {},
  ): AsyncGenerator<UserNotebooksResponse> {
    let lastSort: number | undefined;
    for (;;) {
      const res = await this.userNotebooks(lastSort === undefined ? params : { ...params, lastSort });
      yield res;
      if (res.hasMore !== 1 || res.books.length === 0) return;
      const next = res.books[res.books.length - 1]?.sort;
      if (typeof next !== 'number' || next === lastSort) return;
      lastSort = next;
    }
  }

  /** /book/bookmarklist — 单本书划线列表（服务端已过滤书签，只返回划线；书签仅有数量统计） */
  bookBookmarkList(bookId: string): Promise<BookmarkListResponse> {
    return this.request('/book/bookmarklist', { bookId });
  }

  /**
   * /review/list/mine — 单本书个人想法与点评（划线想法、章节点评、整本书评）。
   * 注意：网关参数名为小写 bookid，SDK 已统一映射为 bookId。
   */
  reviewListMine(params: MyReviewsParams): Promise<MyReviewsResponse> {
    return this.request('/review/list/mine', {
      bookid: params.bookId,
      synckey: params.synckey,
      count: params.count,
    });
  }

  /** /review/list/mine 分页遍历（synckey 游标），直到 hasMore=0 */
  async *reviewListMinePages(
    params: Omit<MyReviewsParams, 'synckey'>,
  ): AsyncGenerator<MyReviewsResponse> {
    let synckey: number | undefined;
    for (;;) {
      const res = await this.reviewListMine({ ...params, synckey });
      yield res;
      if (res.hasMore !== 1) return;
      const next = res.synckey;
      if (typeof next !== 'number' || next === synckey) return;
      synckey = next;
    }
  }

  /** /book/underlines — 章节划线热度统计（人数/得分/类型，不含划线文本） */
  bookUnderlines(params: UnderlinesParams): Promise<UnderlinesResponse> {
    return this.request('/book/underlines', { ...params });
  }

  /** /book/bestbookmarks — 热门划线（含原文与人数，固定前 20 条，不支持分页）；chapterUid 缺省 0 表示全部章节 */
  bookBestBookmarks(params: BestBookmarksParams): Promise<BestBookmarksResponse> {
    return this.request('/book/bestbookmarks', {
      bookId: params.bookId,
      chapterUid: params.chapterUid ?? 0,
      synckey: params.synckey,
    });
  }

  /** /book/readreviews — 查询指定划线范围下的想法/评论（reviews 为允许的对象数组参数） */
  bookReadReviews(params: ReadReviewsParams): Promise<ReadReviewsResponse> {
    return this.request('/book/readreviews', {
      bookId: params.bookId,
      chapterUid: params.chapterUid,
      reviews: params.reviews,
    });
  }

  /** /review/single — 单条想法详情（含评论与点赞） */
  reviewSingle(params: ReviewSingleParams): Promise<ReviewSingleResponse> {
    return this.request('/review/single', { ...params });
  }

  // ---------- 阅读统计 ----------

  /**
   * /readdata/detail — 阅读统计（时长单位均为秒，展示时自行转换为「X小时Y分钟」）。
   * 只支持固定自然周期（weekly/monthly/annually/overall），不支持任意起止日期；
   * 跨周期区间需按自然周期组合计算（totalReadTime 为总量主口径，边界用 dailyReadTimes 扣减）。
   */
  readDataDetail(params: ReadDataParams = {}): Promise<ReadDataResponse> {
    return this.request('/readdata/detail', { ...params });
  }

  // ---------- 公开点评 ----------

  /**
   * /review/list — 书籍公开点评。
   * 注意：回包存在双层 review 嵌套，点评内容字段位于 reviews[].review.review。
   */
  reviewList(params: ReviewListParams): Promise<ReviewListResponse> {
    return this.request('/review/list', { ...params });
  }

  /** /review/list 分页遍历：maxIdx ← 上一页最后一条 idx，并携带回包 synckey */
  async *reviewListPages(
    params: Omit<ReviewListParams, 'maxIdx' | 'synckey'>,
  ): AsyncGenerator<ReviewListResponse> {
    let maxIdx = 0;
    let synckey: number | undefined;
    for (;;) {
      const page: ReviewListParams = synckey === undefined ? { ...params, maxIdx } : { ...params, maxIdx, synckey };
      const res = await this.reviewList(page);
      yield res;
      if (res.reviewsHasMore !== 1 || res.reviews.length === 0) return;
      const nextIdx = res.reviews[res.reviews.length - 1]?.idx;
      if (typeof nextIdx !== 'number' || nextIdx === maxIdx) return;
      maxIdx = nextIdx;
      synckey = res.synckey ?? synckey;
    }
  }

  // ---------- 推荐发现 ----------

  /** /book/recommend — 个性化推荐（与 App 首页「为你推荐」一致）；翻页用 searchIdx 作为下一页 maxIdx */
  bookRecommend(params: RecommendParams = {}): Promise<RecommendResponse> {
    return this.request('/book/recommend', { ...params });
  }

  /**
   * /book/similar — 相似书推荐（与 App 书籍详情页「相似推荐」一致）。
   * 底层转发 /book/detailinfo?listtypes=2&synckey=0，要求 count、maxIdx 显式传值，
   * SDK 未传时默认 count=12、maxIdx=0；翻页时传上一页最后一条 idx，并带上回包 sessionId。
   */
  bookSimilar(params: SimilarParams): Promise<SimilarResponse> {
    return this.request('/book/similar', {
      bookId: params.bookId,
      count: params.count ?? 12,
      maxIdx: params.maxIdx ?? 0,
      sessionId: params.sessionId,
    });
  }
}

// ============================================================
// 四、使用示例（直接运行本文件时执行：node dist/weread.js）
// ============================================================

/** 秒 → 「X 小时 Y 分钟」 */
function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0 分钟';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}

/** 使用示例：覆盖搜索、书籍、书架、笔记、统计、点评、推荐全链路 */
async function runExample(): Promise<void> {
  // 构造时自动读取环境变量 WEREAD_API_KEY；也可 new WereadClient({ apiKey: 'wrk-xxx' })
  const client = new WereadClient();

  // 1. 元接口：查看网关所有可用接口
  // const apiList = await client.listApis();

  // 2. 搜索书籍（明确找书用 scope=EBook）
  const search = await client.search({ keyword: '三体', scope: SearchScope.EBook, count: 5 });
  const group = search.results.find((g) => g.books.length > 0);
  const book = group?.books[0]?.bookInfo;
  if (!book) {
    console.log('没有找到相关书籍');
    return;
  }
  console.log(`搜到《${book.title}》（${book.author}），bookId=${book.bookId}`);

  // 3. 书籍详情 / 章节目录 / 阅读进度
  const info = await client.bookInfo(book.bookId);
  console.log(`评分 ${info.newRating}，共 ${info.wordCount} 字，ISBN ${info.isbn}`);
  const chapters = await client.bookChapterInfo(book.bookId);
  console.log(`共 ${chapters.chapters.length} 章`);
  const progress = await client.bookGetProgress(book.bookId);
  console.log(
    `阅读进度 ${progress.book.progress}%，累计 ${formatDuration(progress.book.recordReadingTime)}`,
  );

  // 4. 书架（总数口径：books + albums + mp，专辑/有声书也计入）
  const shelf = await client.shelfSync();
  const total = shelf.books.length + shelf.albums.length + (shelf.mp ? 1 : 0);
  console.log(
    `书架共 ${total} 个条目：${shelf.books.length} 本电子书 + ${shelf.albums.length} 个专辑/有声书` +
      (shelf.mp ? ' + 1 个文章收藏' : ''),
  );

  // 5. 笔记概览：分页遍历所有有笔记的书（游标 lastSort）
  const notebooks = [];
  for await (const page of client.userNotebooksPages({ count: 20 })) {
    notebooks.push(...page.books);
  }
  console.log(`有笔记的书共 ${notebooks.length} 本`);

  // 6. 单本书笔记：划线 + 想法/点评（两种口径见类型注释）
  const highlights = await client.bookBookmarkList(book.bookId);
  console.log(`《${book.title}》划线 ${highlights.updated.length} 条`);
  for await (const page of client.reviewListMinePages({ bookId: book.bookId, count: 20 })) {
    for (const item of page.reviews) {
      const quote = item.review.abstract ? `（关于：${item.review.abstract.slice(0, 20)}…）` : '';
      console.log(`  想法${quote}：${item.review.content?.slice(0, 40)}`);
    }
  }

  // 7. 阅读统计（时长单位为秒）
  const stats = await client.readDataDetail({ mode: ReadDataMode.Monthly });
  console.log(
    `本月阅读 ${formatDuration(stats.totalReadTime)}，有效阅读 ${stats.readDays} 天` +
      (stats.compare !== undefined ? `，日均较上月 ${(stats.compare * 100).toFixed(0)}%` : ''),
  );

  // 8. 公开点评（双层 review 嵌套：item.review.review）
  const reviews = await client.reviewList({ bookId: book.bookId, count: 3 });
  console.log(`《${book.title}》共 ${reviews.reviewsCnt} 条公开点评`);
  for (const item of reviews.reviews) {
    const r = item.review.review;
    console.log(`  ${r.author?.name ?? '匿名'}（${(r.star ?? 0) / 20} 星）：${r.content?.slice(0, 40)}`);
  }

  // 9. 推荐：个性化推荐 + 相似书推荐
  const recommend = await client.bookRecommend({ count: 3 });
  recommend.books.forEach((b, i) => {
    console.log(`  为你推荐 ${i + 1}. 《${b.title}》—— ${b.reason ?? b.intro?.slice(0, 30) ?? ''}`);
  });
  const similar = await client.bookSimilar({ bookId: book.bookId }); // 默认 count=12, maxIdx=0
  similar.booksimilar.books.forEach((s) => {
    console.log(`  相似书籍：《${s.book.bookInfo.title}》`);
  });
}

// 仅在直接运行本文件时执行示例（被 import 时不执行）
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runExample().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
