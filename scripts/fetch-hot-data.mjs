import { mkdir, writeFile } from 'node:fs/promises';

const API_DIR = new URL('../docs/api/', import.meta.url);

const endpoints = {
  baidu: 'https://r.jina.ai/http://top.baidu.com/board?tab=realtime',
  sina: 'https://r.jina.ai/http://news.sina.com.cn/',
  ziboLocal: 'https://r.jina.ai/http://www.zbnews.net/',
  ziboProvince: 'https://r.jina.ai/http://www.baidu.com/s?tn=news&rtt=1&bsst=1&wd=%E6%B7%84%E5%8D%9A'
};

function cleanTitle(title) {
  return title
    .replace(/\*\*/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+(热|新)$/, '')
    .trim();
}

function uniqueByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; oclpage-hot-bot/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function parseBaidu(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  let pendingHeat = '';

  for (const line of lines) {
    if (/^\d{6,8}$/.test(line)) {
      pendingHeat = line;
      continue;
    }

    const match = line.match(/^\[([^\]]{2,80})\]\((https?:\/\/www\.baidu\.com\/s\?[^)]+)\)$/);
    if (!match) continue;

    const title = cleanTitle(match[1]);
    if (!title || /^!?\[?Image/.test(title) || /查看更多/.test(title)) continue;
    if (items.some((item) => item.title === title)) continue;

    items.push({
      rank: items.length + 1,
      title,
      url: match[2],
      meta: pendingHeat || '--'
    });

    pendingHeat = '';
    if (items.length >= 20) break;
  }

  return items;
}

function parseSina(text) {
  const focusSection = text.split('1.   [热榜]')[1] || text;
  const beforeMore = focusSection.split('点击查看更多实时热点')[0] || focusSection;
  const pattern = /\*\s+\[([^\]]{4,80})\]\((https?:\/\/[^)]+)\)/g;
  const items = [];

  for (const match of beforeMore.matchAll(pattern)) {
    const title = cleanTitle(match[1]);
    const url = match[2];
    const okUrl = /s\.weibo\.com|news\.sina\.com\.cn|news\.sina\.cn|k\.sina\.com\.cn|video\.sina\.com\.cn/.test(url);
    if (!okUrl) continue;
    if (/点击查看更多|新浪首页|新闻图片|热榜|Image|黑猫|客户端/.test(title)) continue;
    if (title.length < 2 || title.length > 42) continue;
    items.push({
      rank: items.length + 1,
      title,
      url,
      meta: /s\.weibo\.com/.test(url) ? '话题' : '新闻'
    });
    if (items.length >= 20) break;
  }

  return uniqueByTitle(items).slice(0, 20).map((item, index) => ({ ...item, rank: index + 1 }));
}

function parseGenericLinks(text, { allowedDomains = [], requiredKeyword = '', blocked = [], limit = 18, urlFilter = null }) {
  const pattern = /\[([^\]\n]{2,90})\]\((https?:\/\/[^\s)]+)\)/g;
  const items = [];

  for (const match of text.matchAll(pattern)) {
    const title = cleanTitle(match[1]);
    const url = match[2];
    if (!title) continue;
    if (!allowedDomains.some((domain) => url.includes(domain))) continue;
    if (blocked.some((word) => title.includes(word))) continue;
    if (/Image|javascript:|登录|首页|导航|更多|专题|视频|图片/.test(title)) continue;
    if (requiredKeyword && !title.includes(requiredKeyword) && !decodeURIComponent(url).includes(requiredKeyword)) continue;
    if (urlFilter && !urlFilter(url)) continue;

    items.push({
      rank: items.length + 1,
      title,
      url,
      meta: new URL(url).hostname.replace(/^www\./, '')
    });

    if (items.length >= limit) break;
  }

  return uniqueByTitle(items).slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

function buildPayload(name, items, extra = {}) {
  return {
    source: name,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
    ...extra
  };
}

async function writeJson(name, payload) {
  const path = new URL(`${name}.json`, API_DIR);
  await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function main() {
  await mkdir(API_DIR, { recursive: true });

  const [baiduText, sinaText, ziboLocalText, ziboProvinceText] = await Promise.all([
    fetchText(endpoints.baidu),
    fetchText(endpoints.sina),
    fetchText(endpoints.ziboLocal),
    fetchText(endpoints.ziboProvince)
  ]);

  const baiduItems = parseBaidu(baiduText);
  const sinaItems = parseSina(sinaText);
  const ziboLocalItems = parseGenericLinks(ziboLocalText, {
    allowedDomains: ['zbnews.net', 'zbnc.tv'],
    blocked: ['版权', '联系我们', '广告', '投稿', '融媒', '淄博新闻网', '民生·社会', '淄博日报', '淄博晚报', '关于本站', '媒体合作', '版权声明'],
    limit: 12,
    urlFilter: (url) => /content\/202\d-\d{2}\//.test(url)
  });
  const ziboProvinceItems = parseGenericLinks(ziboProvinceText, {
    allowedDomains: ['baijiahao.baidu.com', 'news.10jqka.com.cn', 'iqilu.com', 'dzwww.com'],
    requiredKeyword: '淄博',
    blocked: ['去网页搜', '属于几线城市', '地图', '景区', '女人特点'],
    limit: 12
  });

  await Promise.all([
    writeJson('baidu', buildPayload('baidu', baiduItems)),
    writeJson('sina', buildPayload('sina', sinaItems)),
    writeJson(
      'zibo',
      buildPayload('zibo', [...ziboLocalItems, ...ziboProvinceItems], {
        sections: [
          { key: 'local', title: '淄博新闻网', items: ziboLocalItems },
          { key: 'province', title: '省级媒体里的淄博', items: ziboProvinceItems }
        ]
      })
    )
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
