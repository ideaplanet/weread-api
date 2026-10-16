/**
 * 微信读书 API 单元测试（单文件）
 *
 * mock fetch 验证网关协议：统一入口、Bearer 鉴权、业务参数平铺、skill_version、
 * 参数映射与默认值、分页游标遍历、错误与升级处理。
 *
 * 运行：npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WereadClient,
  WereadApiError,
  WereadError,
  WereadHttpError,
  WereadNetworkError,
  WereadUpgradeError,
} from './weread.js';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** 构造使用 mock fetch 的客户端；handler 根据捕获的请求体返回回包 */
function makeClient(handler: (captured: Captured) => Record<string, unknown>) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const captured: Captured = {
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    calls.push(captured);
    return new Response(JSON.stringify(handler(captured)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const client = new WereadClient({ apiKey: 'wrk-test', fetchImpl });
  return { client, calls };
}

// ---------- 网关协议 ----------

test('统一入口 + Bearer 鉴权 + 业务参数平铺在顶层 + 携带 skill_version', async () => {
  const { client, calls } = makeClient(() => ({ errcode: 0, hasMore: 0, results: [] }));
  await client.search({ keyword: '三体', scope: 10, count: 5 });

  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.url, 'https://i.weread.qq.com/api/agent/gateway');
  assert.equal(call.headers.Authorization, 'Bearer wrk-test');
  assert.deepEqual(call.body, {
    api_name: '/store/search',
    skill_version: '1.0.5',
    keyword: '三体',
    scope: 10,
    count: 5,
  });
});

test('未传的可选参数不会出现在请求体中', async () => {
  const { client, calls } = makeClient(() => ({ errcode: 0, books: [] }));
  await client.bookRecommend({ count: 12 });
  assert.deepEqual(calls[0].body, {
    api_name: '/book/recommend',
    skill_version: '1.0.5',
    count: 12,
  });
});

test('自定义 skillVersion 会覆盖默认版本号', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ errcode: 0, books: [], albums: [] }), { status: 200 });
  }) as typeof fetch;
  const client = new WereadClient({ apiKey: 'wrk-test', fetchImpl, skillVersion: '9.9.9' });
  await client.shelfSync();
  assert.equal(bodies[0].skill_version, '9.9.9');
});

// ---------- 参数映射与默认值 ----------

test('reviewListMine 将 bookId 映射为网关的小写参数 bookid', async () => {
  const { client, calls } = makeClient(() => ({ errcode: 0, reviews: [], hasMore: 0, synckey: 0 }));
  await client.reviewListMine({ bookId: '3300045871', count: 20 });
  assert.deepEqual(calls[0].body, {
    api_name: '/review/list/mine',
    skill_version: '1.0.5',
    bookid: '3300045871',
    count: 20,
  });
});

test('bookSimilar 未传 count/maxIdx 时默认 12/0（底层要求显式传值）', async () => {
  const { client, calls } = makeClient(() => ({
    errcode: 0,
    booksimilar: { sessionId: 's1', books: [] },
  }));
  await client.bookSimilar({ bookId: 'b1' });
  assert.deepEqual(calls[0].body, {
    api_name: '/book/similar',
    skill_version: '1.0.5',
    bookId: 'b1',
    count: 12,
    maxIdx: 0,
  });

  await client.bookSimilar({ bookId: 'b1', count: 5, maxIdx: 7, sessionId: 's0' });
  assert.deepEqual(calls[1].body, {
    api_name: '/book/similar',
    skill_version: '1.0.5',
    bookId: 'b1',
    count: 5,
    maxIdx: 7,
    sessionId: 's0',
  });
});

test('bookBestBookmarks 未传 chapterUid 时默认 0（全部章节）', async () => {
  const { client, calls } = makeClient(() => ({ errcode: 0, synckey: 0, totalCount: 0, items: [], chapters: [] }));
  await client.bookBestBookmarks({ bookId: 'b1' });
  assert.deepEqual(calls[0].body, {
    api_name: '/book/bestbookmarks',
    skill_version: '1.0.5',
    bookId: 'b1',
    chapterUid: 0,
  });
});

test('bookReadReviews 按文档允许 reviews 数组作为业务参数', async () => {
  const { client, calls } = makeClient(() => ({ errcode: 0, bookId: 'b1', chapterUid: 1, reviews: [] }));
  await client.bookReadReviews({
    bookId: 'b1',
    chapterUid: 1,
    reviews: [{ range: '393-401', maxIdx: 0, count: 20 }],
  });
  assert.deepEqual(calls[0].body, {
    api_name: '/book/readreviews',
    skill_version: '1.0.5',
    bookId: 'b1',
    chapterUid: 1,
    reviews: [{ range: '393-401', maxIdx: 0, count: 20 }],
  });
});

// ---------- 分页遍历 ----------

test('userNotebooksPages：首页不传 lastSort，之后用上一页最后一条 sort 作为游标', async () => {
  const { client, calls } = makeClient(({ body }) => {
    if (body.lastSort === 111) {
      return { errcode: 0, totalBookCount: 2, totalNoteCount: 9, hasMore: 0, books: [] };
    }
    return {
      errcode: 0,
      totalBookCount: 2,
      totalNoteCount: 9,
      hasMore: 1,
      books: [
        { bookId: 'a', reviewCount: 1, noteCount: 2, bookmarkCount: 3, sort: 110 },
        { bookId: 'b', reviewCount: 1, noteCount: 2, bookmarkCount: 3, sort: 111 },
      ],
    };
  });

  const pages = [];
  for await (const page of client.userNotebooksPages({ count: 20 })) pages.push(page);
  assert.equal(pages.length, 2);

  assert.equal('lastSort' in calls[0].body, false);
  assert.deepEqual(calls[0].body, {
    api_name: '/user/notebooks',
    skill_version: '1.0.5',
    count: 20,
  });
  assert.equal(calls[1].body.lastSort, 111);
});

test('searchPages：hasMore=1 时用最后一条 searchIdx 作为下一页 maxIdx', async () => {
  const { client, calls } = makeClient(({ body }) => {
    if (body.maxIdx === 5) {
      return { errcode: 0, hasMore: 0, results: [] };
    }
    return {
      errcode: 0,
      hasMore: 1,
      results: [
        {
          title: '电子书',
          scope: 17, // 回包分组 scope 与请求参数 scope 语义不同
          books: [
            { searchIdx: 4, bookInfo: { bookId: 'x', title: 'X' } },
            { searchIdx: 5, bookInfo: { bookId: 'y', title: 'Y' } },
          ],
        },
      ],
    };
  });

  const pages = [];
  for await (const page of client.searchPages({ keyword: '三体', scope: 10 })) pages.push(page);
  assert.equal(pages.length, 2);
  assert.equal(calls[1].body.maxIdx, 5);
});

test('reviewListPages：maxIdx 用上一页最后一条 idx，并携带 synckey', async () => {
  const { client, calls } = makeClient(({ body }) => {
    if (body.maxIdx === 9) {
      return { errcode: 0, synckey: 77, reviewsHasMore: 0, reviews: [] };
    }
    return {
      errcode: 0,
      synckey: 66,
      reviewsHasMore: 1,
      reviews: [{ idx: 9, review: { review: { reviewId: 'r1', content: '好看' } } }],
    };
  });

  const pages = [];
  for await (const page of client.reviewListPages({ bookId: 'b1', reviewListType: 1 })) pages.push(page);
  assert.equal(pages.length, 2);
  assert.equal(calls[1].body.maxIdx, 9);
  assert.equal(calls[1].body.synckey, 66);
});

test('reviewListMinePages：synckey 游标推进，hasMore=0 终止', async () => {
  const { client, calls } = makeClient(({ body }) => {
    if (body.synckey === 88) {
      return { errcode: 0, reviews: [], hasMore: 0, synckey: 99 };
    }
    return { errcode: 0, reviews: [], hasMore: 1, synckey: 88 };
  });

  const pages = [];
  for await (const page of client.reviewListMinePages({ bookId: 'b1' })) pages.push(page);
  assert.equal(pages.length, 2);
  assert.equal('synckey' in calls[0].body, false);
  assert.equal(calls[1].body.synckey, 88);
});

// ---------- 错误与升级处理 ----------

test('回包 errcode 非 0 抛出 WereadApiError（含 errcode 与中文提示）', async () => {
  const { client } = makeClient(() => ({ errcode: -2012, errmsg: '书籍不存在' }));
  await assert.rejects(
    () => client.bookInfo('bad-id'),
    (err: unknown) => {
      assert.ok(err instanceof WereadApiError);
      assert.equal(err.errcode, -2012);
      assert.equal(err.apiName, '/book/info');
      assert.match(err.message, /书籍不存在/);
      return true;
    },
  );
});

test('回包出现 upgrade_info 抛出 WereadUpgradeError', async () => {
  const { client } = makeClient(() => ({ errcode: 0, upgrade_info: { message: '请升级到 1.0.6' } }));
  await assert.rejects(
    () => client.shelfSync(),
    (err: unknown) => {
      assert.ok(err instanceof WereadUpgradeError);
      assert.equal(err.upgradeInfo.message, '请升级到 1.0.6');
      return true;
    },
  );
});

test('HTTP 非 2xx 抛出 WereadHttpError', async () => {
  const fetchImpl = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
  const client = new WereadClient({ apiKey: 'wrk-bad', fetchImpl });
  await assert.rejects(() => client.shelfSync(), WereadHttpError);
});

test('网络异常抛出 WereadNetworkError', async () => {
  const fetchImpl = (async () => {
    throw new Error('connection reset');
  }) as unknown as typeof fetch;
  const client = new WereadClient({ apiKey: 'wrk-test', fetchImpl });
  await assert.rejects(() => client.shelfSync(), WereadNetworkError);
});

test('缺少 API Key 时构造即抛错', () => {
  assert.throws(() => new WereadClient({ apiKey: '' }), WereadError);
});
