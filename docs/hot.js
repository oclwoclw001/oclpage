const BOARD = document.body.dataset.board;
const lastUpdated = document.getElementById("last-updated");

const API_PATHS = {
  baidu: "api/baidu.json",
  sina: "api/sina.json",
  zibo: "api/zibo.json"
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function setUpdatedTime(value) {
  if (lastUpdated) {
    lastUpdated.textContent = formatTime(value);
  }
}

function renderList(target, items, showMeta = true) {
  if (!target) return;
  if (!items || !items.length) {
    target.innerHTML = '<li class="empty">暂时没有数据，等下一轮 GitHub Actions 刷新。</li>';
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

async function loadSingleBoard(name) {
  const status = document.getElementById("board-status");
  const list = document.getElementById("board-list");
  status.textContent = "正在读取服务器快照…";

  try {
    const data = await fetchJson(API_PATHS[name]);
    renderList(list, data.items, true);
    setUpdatedTime(data.updatedAt);
    status.textContent = `已更新 ${data.count} 条`;
  } catch (error) {
    renderList(list, [], true);
    status.textContent = `数据读取失败：${error.message}`;
  }
}

async function loadZibo() {
  const localStatus = document.getElementById("zibo-local-status");
  const localList = document.getElementById("zibo-local-list");
  const provinceStatus = document.getElementById("zibo-province-status");
  const provinceList = document.getElementById("zibo-province-list");

  localStatus.textContent = "正在读取淄博热点快照…";
  provinceStatus.textContent = "正在读取淄博热点快照…";

  try {
    const data = await fetchJson(API_PATHS.zibo);
    const local = data.sections?.find((section) => section.key === "local")?.items || [];
    const province = data.sections?.find((section) => section.key === "province")?.items || [];

    renderList(localList, local, true);
    renderList(provinceList, province, true);
    setUpdatedTime(data.updatedAt);
    localStatus.textContent = `已更新 ${local.length} 条`;
    provinceStatus.textContent = `已更新 ${province.length} 条`;
  } catch (error) {
    renderList(localList, [], true);
    renderList(provinceList, [], true);
    localStatus.textContent = `淄博本地数据读取失败：${error.message}`;
    provinceStatus.textContent = `省级聚合读取失败：${error.message}`;
  }
}

async function loadCurrentBoard() {
  if (BOARD === "zibo") {
    await loadZibo();
    return;
  }

  if (BOARD === "baidu" || BOARD === "sina") {
    await loadSingleBoard(BOARD);
  }
}

const refreshButton = document.getElementById("refresh-all");
if (refreshButton) refreshButton.addEventListener("click", loadCurrentBoard);

if (BOARD) {
  loadCurrentBoard();
}
