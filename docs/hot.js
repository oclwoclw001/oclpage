const BOARD = document.body.dataset.board;
const lastUpdated = document.getElementById("last-updated");

const SOURCES = {
  baidu: {
    url: "https://r.jina.ai/http://top.baidu.com/board?tab=realtime",
    load: loadBaidu
  },
  sina: {
    url: "https://r.jina.ai/http://news.sina.com.cn/",
    load: loadSina
  },
  zibo: {
    load: loadZibo
  }
};

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function setUpdatedTime() {
  if (lastUpdated) {
    lastUpdated.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
  }
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

function cleanTitle(title) {
  return title
    .replace(/\*\*/g, "")
    .replace(/^_+|_+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+(热|新)$/, "")
    .trim();
}

function renderList(target, items, showMeta = true) {
  if (!target) return;
  if (!items.length) {
    target.innerHTML = '<li class="empty">暂时没有拉到数据，稍后再试。</li>';
    return;
  }
  target.innerHTML = items.map((item) => `
    <li class="rank-item">
      <span class="rank-num">${item.rank}</span>
      <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      ${showMeta ? `<span class="heat">${item.meta || ""}</span>` : ""}
    </li>
  `).join("");
}

function parseBaidu(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  let pendingHeat = "";

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
      title,
      url: match[2],
      meta: pendingHeat || "--",
      rank: items.length + 1
    });

    pendingHeat = "";
    if (items.length >= 20) break;
  }

  return items;
}

function parseSina(text) {
  const focusSection = text.split("1.   [热榜]")[1] || text;
  const beforeMore = focusSection.split("点击查看更多实时热点")[0] || focusSection;
  const pattern = /\*\s+\[([^\]]{4,80})\]\((https?:\/\/[^)]+)\)/g;
  const items = [];

  for (const match of beforeMore.matchAll(pattern)) {
    const title = cleanTitle(match[1]);
    const url = match[2];
    const okUrl = /s\.weibo\.com|news\.sina\.com\.cn|news\.sina\.cn|k\.sina\.com\.cn|video\.sina\.com\.cn/.test(url);
    if (!okUrl) continue;
    if (/点击查看更多|新浪首页|新闻图片|热榜|Image|黑猫|客户端/.test(title)) continue;
    if (title.length < 5 || title.length > 42) continue;
    items.push({ title, url, meta: /s\.weibo\.com/.test(url) ? "话题" : "新闻", rank: items.length + 1 });
    if (items.length >= 20) break;
  }

  return uniqueByTitle(items).slice(0, 20).map((item, index) => ({ ...item, rank: index + 1 }));
}

function parseGenericLinks(text, { allowedDomains = [], requiredKeyword = "", blocked = [] }) {
  const pattern = /\[([^\]\n]{5,90})\]\((https?:\/\/[^\s)]+)\)/g;
  const items = [];

  for (const match of text.matchAll(pattern)) {
    const title = cleanTitle(match[1]);
    const url = match[2];
    if (!allowedDomains.some((domain) => url.includes(domain))) continue;
    if (blocked.some((word) => title.includes(word))) continue;
    if (/Image|javascript:|登录|首页|导航|更多|专题|视频|图片/.test(title)) continue;
    if (requiredKeyword && !title.includes(requiredKeyword) && !url.includes(encodeURIComponent(requiredKeyword))) continue;
    items.push({ title, url, meta: new URL(url).hostname.replace(/^www\./, ""), rank: items.length + 1 });
    if (items.length >= 18) break;
  }

  return uniqueByTitle(items).slice(0, 18).map((item, index) => ({ ...item, rank: index + 1 }));
}

async function loadBaidu() {
  const status = document.getElementById("board-status");
  const list = document.getElementById("board-list");
  status.textContent = "正在刷新百度热搜…";
  try {
    const text = await fetchText(SOURCES.baidu.url);
    const items = parseBaidu(text);
    renderList(list, items, true);
    status.textContent = `已更新 ${items.length} 条`;
  } catch (error) {
    status.textContent = `百度热搜加载失败：${error.message}`;
    renderList(list, [], true);
  }
}

async function loadSina() {
  const status = document.getElementById("board-status");
  const list = document.getElementById("board-list");
  status.textContent = "正在刷新新浪热点…";
  try {
    const text = await fetchText(SOURCES.sina.url);
    const items = parseSina(text);
    renderList(list, items, true);
    status.textContent = `已更新 ${items.length} 条`;
  } catch (error) {
    status.textContent = `新浪热点加载失败：${error.message}`;
    renderList(list, [], true);
  }
}

async function loadZibo() {
  const localStatus = document.getElementById("zibo-local-status");
  const localList = document.getElementById("zibo-local-list");
  const provinceStatus = document.getElementById("zibo-province-status");
  const provinceList = document.getElementById("zibo-province-list");

  localStatus.textContent = "正在刷新淄博本地媒体…";
  provinceStatus.textContent = "正在刷新省级媒体报道…";

  const localUrl = "https://r.jina.ai/http://www.zbnews.net/";
  const provinceUrl = "https://r.jina.ai/http://www.baidu.com/s?tn=news&rtt=1&bsst=1&wd=%E6%B7%84%E5%8D%9A";

  const [localResult, provinceResult] = await Promise.allSettled([fetchText(localUrl), fetchText(provinceUrl)]);

  if (localResult.status === "fulfilled") {
    const items = parseGenericLinks(localResult.value, {
      allowedDomains: ["zbnews.net", "zbnc.tv", "article"],
      blocked: ["版权", "联系我们", "广告", "投稿", "融媒", "淄博新闻网", "民生·社会", "淄博日报", "淄博晚报"]
    }).filter((item) => /content\/\d{4}-\d{2}\//.test(item.url));
    renderList(localList, items, true);
    localStatus.textContent = `已更新 ${items.length} 条`;
  } else {
    renderList(localList, [], true);
    localStatus.textContent = `淄博新闻网加载失败：${localResult.reason.message}`;
  }

  if (provinceResult.status === "fulfilled") {
    const items = parseGenericLinks(provinceResult.value, {
      allowedDomains: ["baijiahao.baidu.com", "news.10jqka.com.cn", "iqilu.com", "dzwww.com"],
      requiredKeyword: "淄博",
      blocked: ["去网页搜", "属于几线城市", "地图", "景区", "女人特点"]
    });
    renderList(provinceList, items, true);
    provinceStatus.textContent = `已更新 ${items.length} 条`;
  } else {
    renderList(provinceList, [], true);
    provinceStatus.textContent = `省级媒体聚合失败：${provinceResult.reason.message}`;
  }
}

async function loadCurrentBoard() {
  const source = SOURCES[BOARD];
  if (!source) return;
  await source.load();
  setUpdatedTime();
}

const refreshButton = document.getElementById("refresh-all");
if (refreshButton) refreshButton.addEventListener("click", loadCurrentBoard);

if (BOARD) {
  loadCurrentBoard();
  setInterval(loadCurrentBoard, 180000);
}
