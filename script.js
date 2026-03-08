const COLS = 10;
const ROWS = 20;
const VISIBLE_ROWS = 20;
const BLOCK = 36;
const PREVIEW_BLOCK = 24;
const HIDDEN_ROWS = 2;
const STORAGE_KEY = "neon-stack-best";

const COLORS = {
  I: "#5bf7ff",
  O: "#ffe066",
  T: "#c47dff",
  S: "#68f2a3",
  Z: "#ff6d85",
  J: "#73a6ff",
  L: "#ffb36a"
};

const SHAPES = {
  I: [
    [[0,1],[1,1],[2,1],[3,1]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]]
  ],
  O: [
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]]
  ],
  T: [
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]],
    [[1,0],[0,1],[1,1],[1,2]]
  ],
  S: [
    [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]]
  ],
  Z: [
    [[0,0],[1,0],[1,1],[2,1]],
    [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,0],[0,1],[1,1],[0,2]]
  ],
  J: [
    [[0,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[0,2],[1,2]]
  ],
  L: [
    [[2,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]],
    [[0,0],[1,0],[1,1],[1,2]]
  ]
};

const JLSTZ_KICKS = {
  "0>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "1>0": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  "1>2": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  "2>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "2>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  "3>2": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "3>0": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "0>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]]
};

const I_KICKS = {
  "0>1": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  "1>0": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  "1>2": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  "2>1": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  "2>3": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  "3>2": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  "3>0": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  "0>3": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]]
};

const boardCanvas = document.getElementById("board");
const boardCtx = boardCanvas.getContext("2d");
const holdCtx = document.getElementById("hold").getContext("2d");
const nextCtxs = [0,1,2].map((i) => document.getElementById(`next-${i}`).getContext("2d"));
const overlay = document.getElementById("overlay");
const overlayStatus = document.getElementById("overlay-status");
const overlayTitle = document.getElementById("overlay-title");
const playButton = document.getElementById("play-button");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const linesEl = document.getElementById("lines");
const bestEl = document.getElementById("best");

const state = {
  board: createBoard(),
  bag: [],
  queue: [],
  active: null,
  hold: null,
  holdLocked: false,
  score: 0,
  level: 1,
  lines: 0,
  best: Number(localStorage.getItem(STORAGE_KEY) || 0),
  dropAccumulator: 0,
  lastTime: 0,
  running: false,
  paused: true,
  gameOver: false,
  softDrop: false
};

function createBoard() {
  return Array.from({ length: ROWS + HIDDEN_ROWS }, () => Array(COLS).fill(null));
}

function refillBag() {
  const pieces = ["I", "O", "T", "S", "Z", "J", "L"];
  for (let i = pieces.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  state.bag.push(...pieces);
}

function takeFromBag() {
  if (state.bag.length === 0) refillBag();
  return state.bag.shift();
}

function spawnPiece(type = state.queue.shift() || takeFromBag()) {
  while (state.queue.length < 3) state.queue.push(takeFromBag());
  const piece = { type, x: 3, y: 0, rotation: 0 };
  if (collides(piece, piece.x, piece.y, piece.rotation)) {
    setGameOver();
    return null;
  }
  state.active = piece;
  state.holdLocked = false;
  return piece;
}

function cellsFor(piece, x = piece.x, y = piece.y, rotation = piece.rotation) {
  return SHAPES[piece.type][rotation].map(([cx, cy]) => ({ x: x + cx, y: y + cy }));
}

function collides(piece, x, y, rotation) {
  return cellsFor(piece, x, y, rotation).some((cell) => {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS + HIDDEN_ROWS) return true;
    if (cell.y < 0) return false;
    return Boolean(state.board[cell.y][cell.x]);
  });
}

function move(dx, dy) {
  if (!state.active || state.paused || state.gameOver) return false;
  const { x, y, rotation } = state.active;
  if (!collides(state.active, x + dx, y + dy, rotation)) {
    state.active.x += dx;
    state.active.y += dy;
    render();
    return true;
  }
  if (dy > 0) lockPiece();
  return false;
}

function rotate(dir) {
  if (!state.active || state.paused || state.gameOver) return;
  const from = state.active.rotation;
  const to = (from + dir + 4) % 4;
  const kickMap = state.active.type === "I" ? I_KICKS : JLSTZ_KICKS;
  const key = `${from}>${to}`;
  const tests = state.active.type === "O" ? [[0,0]] : kickMap[key] || [[0,0]];
  for (const [dx, dy] of tests) {
    const nx = state.active.x + dx;
    const ny = state.active.y + dy;
    if (!collides(state.active, nx, ny, to)) {
      state.active.x = nx;
      state.active.y = ny;
      state.active.rotation = to;
      render();
      return;
    }
  }
}

function hardDrop() {
  if (!state.active || state.paused || state.gameOver) return;
  let distance = 0;
  while (move(0, 1)) distance += 1;
  state.score += distance * 2;
  updateScore();
}

function holdPiece() {
  if (!state.active || state.holdLocked || state.paused || state.gameOver) return;
  const currentType = state.active.type;
  if (state.hold) {
    const nextType = state.hold;
    state.hold = currentType;
    state.active = { type: nextType, x: 3, y: 0, rotation: 0 };
    if (collides(state.active, state.active.x, state.active.y, state.active.rotation)) {
      setGameOver();
    }
  } else {
    state.hold = currentType;
    spawnPiece();
  }
  state.holdLocked = true;
  render();
}

function mergePiece() {
  for (const cell of cellsFor(state.active)) {
    if (cell.y < 0) {
      setGameOver();
      return;
    }
    state.board[cell.y][cell.x] = state.active.type;
  }
}

function clearLines() {
  let cleared = 0;
  for (let y = state.board.length - 1; y >= 0; y -= 1) {
    if (state.board[y].every(Boolean)) {
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }
  if (cleared > 0) {
    const points = [0, 100, 300, 500, 800];
    state.lines += cleared;
    state.score += points[cleared] * state.level;
    state.level = Math.floor(state.lines / 10) + 1;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }
    updateScore();
  }
}

function lockPiece() {
  if (!state.active) return;
  mergePiece();
  if (state.gameOver) return;
  clearLines();
  spawnPiece();
  render();
}

function ghostY() {
  if (!state.active) return 0;
  let y = state.active.y;
  while (!collides(state.active, state.active.x, y + 1, state.active.rotation)) y += 1;
  return y;
}

function dropInterval() {
  return Math.max(90, 850 - (state.level - 1) * 70);
}

function update(time = 0) {
  const delta = time - state.lastTime;
  state.lastTime = time;
  if (state.running && !state.paused && !state.gameOver) {
    state.dropAccumulator += delta;
    const target = state.softDrop ? 40 : dropInterval();
    if (state.dropAccumulator >= target) {
      state.dropAccumulator = 0;
      move(0, 1);
    }
  }
  render();
  requestAnimationFrame(update);
}

function drawCell(ctx, x, y, color, size, alpha = 1) {
  const px = x * size;
  const py = y * size;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(px + 4, py + 4, size - 8, Math.max(4, size * 0.2));
  ctx.restore();
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 0; y < VISIBLE_ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      boardCtx.strokeStyle = "rgba(255,255,255,0.05)";
      boardCtx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
      const cell = state.board[y + HIDDEN_ROWS][x];
      if (cell) drawCell(boardCtx, x, y, COLORS[cell], BLOCK);
    }
  }

  if (state.active) {
    const ghost = ghostY();
    cellsFor(state.active, state.active.x, ghost, state.active.rotation).forEach((cell) => {
      if (cell.y >= HIDDEN_ROWS) drawCell(boardCtx, cell.x, cell.y - HIDDEN_ROWS, COLORS[state.active.type], BLOCK, 0.2);
    });

    cellsFor(state.active).forEach((cell) => {
      if (cell.y >= HIDDEN_ROWS) drawCell(boardCtx, cell.x, cell.y - HIDDEN_ROWS, COLORS[state.active.type], BLOCK);
    });
  }
}

function drawPreview(ctx, type) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!type) return;
  const shape = SHAPES[type][0];
  const minX = Math.min(...shape.map(([x]) => x));
  const maxX = Math.max(...shape.map(([x]) => x));
  const minY = Math.min(...shape.map(([, y]) => y));
  const maxY = Math.max(...shape.map(([, y]) => y));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const offsetX = (ctx.canvas.width - width * PREVIEW_BLOCK) / 2;
  const offsetY = (ctx.canvas.height - height * PREVIEW_BLOCK) / 2;
  shape.forEach(([x, y]) => {
    const px = offsetX + (x - minX) * PREVIEW_BLOCK;
    const py = offsetY + (y - minY) * PREVIEW_BLOCK;
    ctx.save();
    ctx.translate(px, py);
    drawCell(ctx, 0, 0, COLORS[type], PREVIEW_BLOCK);
    ctx.restore();
  });
}

function updateScore() {
  scoreEl.textContent = state.score;
  levelEl.textContent = state.level;
  linesEl.textContent = state.lines;
  bestEl.textContent = state.best;
}

function updateOverlay() {
  if (!state.running) {
    overlay.classList.remove("hidden");
    overlayStatus.textContent = "Ready";
    overlayTitle.textContent = "点击 Play 开始";
    playButton.textContent = "Play";
    return;
  }
  if (state.gameOver) {
    overlay.classList.remove("hidden");
    overlayStatus.textContent = "Game Over";
    overlayTitle.textContent = `本局 ${state.score} 分`;
    playButton.textContent = "再来一局";
    return;
  }
  if (state.paused) {
    overlay.classList.remove("hidden");
    overlayStatus.textContent = "Paused";
    overlayTitle.textContent = "已暂停";
    playButton.textContent = "继续";
    return;
  }
  overlay.classList.add("hidden");
}

function render() {
  drawBoard();
  drawPreview(holdCtx, state.hold);
  nextCtxs.forEach((ctx, index) => drawPreview(ctx, state.queue[index]));
  updateScore();
  updateOverlay();
}

function resetGame() {
  state.board = createBoard();
  state.bag = [];
  state.queue = [];
  state.active = null;
  state.hold = null;
  state.holdLocked = false;
  state.score = 0;
  state.level = 1;
  state.lines = 0;
  state.dropAccumulator = 0;
  state.gameOver = false;
  while (state.queue.length < 3) state.queue.push(takeFromBag());
  spawnPiece();
  updateScore();
}

function startGame() {
  if (!state.running || state.gameOver) resetGame();
  state.running = true;
  state.paused = false;
  state.lastTime = performance.now();
  render();
}

function togglePause() {
  if (!state.running || state.gameOver) return;
  state.paused = !state.paused;
  render();
}

function setGameOver() {
  state.gameOver = true;
  state.paused = true;
  state.running = true;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(STORAGE_KEY, String(state.best));
  }
  updateScore();
  render();
}

function handleAction(action) {
  switch (action) {
    case "left": move(-1, 0); break;
    case "right": move(1, 0); break;
    case "soft-drop": state.softDrop = true; move(0, 1); break;
    case "hard-drop": hardDrop(); break;
    case "rotate-cw": rotate(1); break;
    case "rotate-ccw": rotate(-1); break;
    case "hold": holdPiece(); break;
    case "pause": togglePause(); break;
    default: break;
  }
}

function releaseAction(action) {
  if (action === "soft-drop") state.softDrop = false;
}

playButton.addEventListener("click", () => {
  if (!state.running || state.gameOver) startGame();
  else state.paused = false;
  render();
});

pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startGame);

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowdown", " ", "z", "x", "c", "p"].includes(key) || event.key === " ") {
    event.preventDefault();
  }
  if (!state.running && key !== "p") startGame();
  if (event.key === "ArrowLeft") move(-1, 0);
  else if (event.key === "ArrowRight") move(1, 0);
  else if (event.key === "ArrowDown") { state.softDrop = true; move(0, 1); }
  else if (event.key === " ") hardDrop();
  else if (key === "z") rotate(-1);
  else if (key === "x" || event.key === "ArrowUp") rotate(1);
  else if (key === "c") holdPiece();
  else if (key === "p") togglePause();
});

document.addEventListener("keyup", (event) => {
  if (event.key === "ArrowDown") state.softDrop = false;
});

document.querySelectorAll(".touch-panel button").forEach((button) => {
  const action = button.dataset.action;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!state.running) startGame();
    handleAction(action);
  });
  button.addEventListener("pointerup", () => releaseAction(action));
  button.addEventListener("pointerleave", () => releaseAction(action));
  button.addEventListener("pointercancel", () => releaseAction(action));
});

updateScore();
render();
requestAnimationFrame(update);
