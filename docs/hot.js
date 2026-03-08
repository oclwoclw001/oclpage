const BAIDU_PROXY = "https://r.jina.ai/http://top.baidu.com/board?tab=realtime";
const SINA_PROXY = "https://r.jina.ai/http://top.news.sina.com.cn/";

const baiduList = document.getElementById("baidu-list");
const sinaList = document.getElementById("sina-list");
const baiduStatus = document.getElementById("baidu-status");
const sinaStatus = document.getElementById("sina-status");
const lastUpdated = document.getElementById("last-updated");

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
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

function parseBaidu(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  let pendingHeat = "";

  for (const line of lines) {
    if (/^\d{6,8}$/.test(line)) {
      pendingHeat = line;
      continue;
    }

    const match = line.match(/^\[([^\]]{2,60})\]\((https?:\/\/www\.baidu\.com\/s\?[^)]+)\)$/);
    if (!match) continue;

    const title = match[1].trim();
    if (/^!?\[?Image|查看更多/.test(title)) continue;
    if (items.some((item) => item.title === title)) continue;

    items.push({
      title,
      url: match[2],
      heat: pendingHeat || "--",
      rank: items.length + 1
    });

    pendingHeat = "";
    if (items.length >= 20) break;
  }

  return items;
}

function parseSina(text) {
  const linkPattern = /\[([^\]\n]{4,80})\]\((https?:\/\/[^\s)]+)\)/g;
  const items = [];
  for (const match of text.matchAll(linkPattern)) {
    const title = match[1].trim();
    const url = match[2];
    const isNewsUrl = /news\.sina\.com\.cn\/.+|k\.sina\.com\.cn\/article|video\.sina\.com\.cn\/p\/news|news\.sina\.cn\/zt_d\//.test(url);
    if (!isNewsUrl) continue;
    if (/Image|首页|新闻|体育|财经|博客|更多|登录|注册|导航|客户端|微博|图片|视频|黑猫投诉/.test(title)) continue;
    if (/^[*_\-\s]+$/.test(title)) continue;
    if (title.length < 5 || title.length > 42) continue;
    items.push({ title, url, heat: "新浪", rank: items.length + 1 });
    if (items.length >= 20) break;
  }
  return uniqueByTitle(items).slice(0, 20).map((item, index) => ({ ...item, rank: index + 1 }));
}

function renderList(target, items, heatLabel = true) {
  if (!items.length) {
    target.innerHTML = '<li class="empty">暂时没有拉到数据，稍后再试。</li>';
    return;
  }
  target.innerHTML = items.map((item) => `
    <li class="rank-item">
      <span class="rank-num">${item.rank}</span>
      <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      ${heatLabel ? `<span class="heat">${item.heat}</span>` : ""}
    </li>
  `).join("");
}

async function loadBaidu() {
  baiduStatus.textContent = "正在刷新百度热搜…";
  try {
    const text = await fetchText(BAIDU_PROXY);
    const items = parseBaidu(text);
    renderList(baiduList, items, true);
    baiduStatus.textContent = `已更新 ${items.length} 条`;
  } catch (error) {
    baiduStatus.textContent = `百度热搜加载失败：${error.message}`;
    renderList(baiduList, [], true);
  }
}

async function loadSina() {
  sinaStatus.textContent = "正在刷新新浪热点…";
  try {
    const text = await fetchText(SINA_PROXY);
    const items = parseSina(text);
    renderList(sinaList, items, false);
    sinaStatus.textContent = `已更新 ${items.length} 条`;
  } catch (error) {
    sinaStatus.textContent = `新浪热点加载失败：${error.message}`;
    renderList(sinaList, [], false);
  }
}

async function loadAll() {
  lastUpdated.textContent = "刷新中…";
  await Promise.allSettled([loadBaidu(), loadSina()]);
  lastUpdated.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
}

document.getElementById("refresh-all").addEventListener("click", loadAll);
document.querySelectorAll("[data-source]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.source === "baidu") loadBaidu();
    if (button.dataset.source === "sina") loadSina();
  });
});

loadAll();
setInterval(loadAll, 180000);
