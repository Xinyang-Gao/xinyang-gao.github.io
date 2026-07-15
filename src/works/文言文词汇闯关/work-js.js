// ========== 配置常量 ==========
const CONFIG = {
  MAX_PAIRS: 18,
  LEVEL_TIME: 180,
  DATA_URL: 'data.json'
};

// ========== DOM 引用 ==========
const $ = (id) => document.getElementById(id);
const els = {
  score: $('scoreValue'),
  time: $('timeValue'),
  mistake: $('mistakeValue'),
  level: $('levelInfo'),
  grid: $('cardsGrid'),
  msg: $('gameMessage'),
  lessonBtns: $('lessonButtons'),
  mistakePanel: $('mistakePanel'),
  toggleBtn: $('mistakeToggleBtn'),
  badge: $('mistakeCountBadge'),
  clearBtn: $('clearMistakesBtn'),
  mistakeList: $('mistakeListContainer'),
  resetBtn: $('resetGameBtn'),
  headerToggle: $('mistakeHeaderToggle')
};

// ========== 游戏状态 ==========
let state = {
  data: {},
  currentLesson: '',
  allPairs: [],
  levels: [],
  totalLevels: 0,
  levelIndex: 0,
  cards: [],
  score: 0,
  mistakes: 0,
  timeLeft: CONFIG.LEVEL_TIME,
  active: true,
  win: false,
  timer: null,
  selected: null,
  mistakeList: [],
  animating: false,
  panelVisible: false
};

// ========== 工具函数 ==========
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const esc = (s) => s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] || m);

// ========== 数据加载 ==========
async function loadData() {
  try {
    const res = await fetch(CONFIG.DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    return true;
  } catch (e) {
    console.error('加载失败:', e);
    els.grid.innerHTML = `<div class="error-tip"><p>数据加载失败，请检查网络或 data.json</p><button onclick="location.reload()">重新加载</button></div>`;
    return false;
  }
}

// ========== 数据转换 ==========
function buildPairs(raw) {
  const pairs = [];
  raw.forEach(item => Object.entries(item).forEach(([k, v]) => k && v && pairs.push({ term: k.trim(), annotation: v.trim() })));
  return pairs;
}

function buildLevels(pairs) {
  const levels = [];
  for (let i = 0; i < pairs.length; i += CONFIG.MAX_PAIRS) {
    levels.push(pairs.slice(i, i + CONFIG.MAX_PAIRS).map((_, idx) => i + idx));
  }
  return levels;
}

function generateCards(levelIdx) {
  const ids = state.levels[levelIdx] || [];
  const cards = [];
  ids.forEach(pid => {
    const p = state.allPairs[pid];
    if (p) {
      cards.push({ id: cards.length, pairId: pid, type: 'term', text: p.term, matched: false });
      cards.push({ id: cards.length, pairId: pid, type: 'anno', text: p.annotation, matched: false });
    }
  });
  return shuffle(cards);
}

// ========== UI 刷新 ==========
function refreshUI() {
  const { score, mistakes, timeLeft, levelIndex, totalLevels, mistakeList } = state;
  els.score.textContent = score;
  els.mistake.textContent = mistakes;
  els.time.textContent = fmt(timeLeft);
  els.level.textContent = `${levelIndex+1} / ${totalLevels}`;
  els.badge.textContent = mistakeList.length;
  if (state.panelVisible) renderMistakeList();
}

// ========== 修复：直接操作 DOM，确保事件绑定 ==========
function renderCards() {
  const grid = els.grid;
  grid.innerHTML = ''; // 清空

  state.cards.forEach((card, idx) => {
    const div = document.createElement('div');
    div.className = `card ${card.type === 'term' ? 'term-card' : 'anno-card'}${card.matched ? ' matched' : ''}${state.selected === idx && !card.matched && state.active ? ' selected' : ''}`;
    div.textContent = card.text;
    // 绑定点击事件
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onCardClick(idx);
    });
    grid.appendChild(div);
  });
}

function renderMistakeList() {
  const list = state.mistakeList;
  els.mistakeList.innerHTML = list.length ? list.map(item => `
    <div class="mistake-item">
      <div class="wrong-pair">你配对的： 「${esc(item.termText)}」 ↔ 「${esc(item.annoText)}」</div>
      <div class="correct-pair">
        <div class="correct-line"><span class="correct-badge">正确</span><span><span class="term-word">「${esc(item.termText)}」</span> 的正确注释 → <span class="anno-text">${esc(item.termCorrectAnno)}</span></span></div>
        <div class="correct-line"><span class="correct-badge">正确</span><span><span class="term-word">「${esc(item.annoText)}」</span> 对应的原词 → <span class="anno-text">${esc(item.annoCorrectTerm)}</span></span></div>
      </div>
    </div>
  `).join('') : '<div class="empty-mistake">暂无错题，继续研习</div>';
}

// ========== 游戏逻辑 ==========
function onCardClick(idx) {
  const { cards, active, win, animating, selected } = state;
  if (!active || win || animating || cards[idx].matched) return;
  if (selected === null) {
    state.selected = idx;
    renderCards();
    els.msg.textContent = `已选中: ${cards[idx].type === 'term' ? '原词' : '注释'} “${cards[idx].text.substring(0, 32)}”，再点击对应卡片配对`;
    return;
  }
  if (selected === idx) {
    state.selected = null;
    renderCards();
    els.msg.textContent = '已取消选择';
    return;
  }
  const a = cards[selected], b = cards[idx];
  if (a.matched) { state.selected = null; renderCards(); return; }
  const correct = a.pairId === b.pairId && a.type !== b.type;
  const termCard = a.type === 'term' ? a : b;
  const annoCard = a.type === 'anno' ? a : b;
  state.animating = true;
  const elems = document.querySelectorAll('.card');
  const el1 = elems[selected], el2 = elems[idx];
  if (el1 && el2) {
    const cls = correct ? 'correct-animate' : 'wrong-animate';
    el1.classList.add(cls); el2.classList.add(cls);
    setTimeout(() => { el1?.classList.remove(cls); el2?.classList.remove(cls); }, correct ? 500 : 450);
  }
  setTimeout(() => {
    if (correct) {
      a.matched = true; b.matched = true;
      state.score += 10;
      state.selected = null;
      state.cards = state.cards.filter(c => !c.matched);
      renderCards();
      els.msg.textContent = '配对正确！ +10分';
      setTimeout(() => { if (state.active && !state.win && state.cards.length) els.msg.textContent = '继续研读，慧心配对'; }, 900);
      checkLevelComplete();
    } else {
      state.mistakes++;
      const tp = state.allPairs[a.pairId], ap = state.allPairs[b.pairId];
      state.mistakeList.push({
        termText: termCard.text,
        annoText: annoCard.text,
        termCorrectAnno: tp ? tp.annotation : '（无法获取）',
        annoCorrectTerm: ap ? ap.term : '（无法获取）'
      });
      state.selected = null;
      renderCards();
      renderMistakeList();
      els.msg.textContent = '配对错误！已收录错题本';
      setTimeout(() => { if (state.active && !state.win) els.msg.textContent = '再试一次，仔细对照注释'; }, 1200);
    }
    refreshUI();
    state.animating = false;
  }, 330);
}

function checkLevelComplete() {
  if (state.cards.some(c => !c.matched) || !state.active || state.win) return;
  if (state.levelIndex + 1 < state.totalLevels) {
    state.levelIndex++;
    els.msg.textContent = `过关！进入第${state.levelIndex+1}/${state.totalLevels}关，再接再厉`;
    loadLevel(state.levelIndex);
  } else {
    state.win = true; state.active = false;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    els.msg.textContent = `大获全胜！《${state.currentLesson}》全部通关！文心宗师！`;
    document.getElementById('gameContainer').classList.add('game-inactive');
    renderCards();
  }
}

// ========== 关卡与计时 ==========
function loadLevel(idx) {
  if (state.timer) clearInterval(state.timer);
  state.cards = generateCards(idx);
  state.selected = null;
  state.timeLeft = CONFIG.LEVEL_TIME;
  state.active = true;
  state.win = false;
  state.animating = false;
  refreshUI();
  renderCards();
  startTimer();
  const cnt = state.levels[idx].length;
  els.msg.textContent = `第${idx+1}/${state.totalLevels}关 · ${cnt}组词句，配对正确+10分`;
  document.getElementById('gameContainer').classList.remove('game-inactive');
}

function startTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (!state.active) return;
    if (state.timeLeft <= 1) {
      clearInterval(state.timer); state.timer = null;
      state.timeLeft = 0;
      refreshUI();
      state.active = false;
      state.win = false;
      els.msg.textContent = '时间耗尽... 点击「重新闯关」继续研习吧';
      document.getElementById('gameContainer').classList.add('game-inactive');
      renderCards();
    } else {
      state.timeLeft--;
      refreshUI();
    }
  }, 1000);
}

// ========== 重置与切换 ==========
function resetGame() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.score = 0;
  state.mistakes = 0;
  state.mistakeList = [];
  state.levelIndex = 0;
  state.active = true;
  state.win = false;
  state.selected = null;
  state.animating = false;
  state.allPairs = buildPairs(state.data[state.currentLesson]);
  state.levels = buildLevels(state.allPairs);
  state.totalLevels = state.levels.length;
  refreshUI();
  renderMistakeList();
  loadLevel(0);
  document.getElementById('gameContainer').classList.remove('game-inactive');
  els.msg.textContent = `重新闯关《${state.currentLesson}》，共 ${state.totalLevels} 关，加油`;
}

function switchLesson(key) {
  if (!state.data[key]) return;
  if (key === state.currentLesson) { resetGame(); return; }
  state.currentLesson = key;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.score = 0; state.mistakes = 0; state.mistakeList = [];
  state.levelIndex = 0; state.active = true; state.win = false;
  state.selected = null; state.animating = false;
  state.allPairs = buildPairs(state.data[key]);
  state.levels = buildLevels(state.allPairs);
  state.totalLevels = state.levels.length;
  refreshUI();
  renderMistakeList();
  loadLevel(0);
  document.getElementById('gameContainer').classList.remove('game-inactive');
  els.msg.textContent = `已切换至《${key}》，共 ${state.totalLevels} 关，文心配对`;
  document.querySelectorAll('.lesson-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lesson === key);
  });
  if (state.panelVisible) { mistakePanel.style.display = 'block'; renderMistakeList(); }
  else mistakePanel.style.display = 'none';
}

// ========== 构建篇目按钮 ==========
function buildLessonBtns() {
  els.lessonBtns.innerHTML = '';
  Object.keys(state.data).forEach(key => {
    const btn = document.createElement('button');
    btn.className = `lesson-btn${key === state.currentLesson ? ' active' : ''}`;
    btn.dataset.lesson = key;
    btn.textContent = key;
    btn.addEventListener('click', () => switchLesson(key));
    els.lessonBtns.appendChild(btn);
  });
}

// ========== 错题本面板 ==========
function togglePanel() {
  state.panelVisible = !state.panelVisible;
  els.mistakePanel.style.display = state.panelVisible ? 'block' : 'none';
  if (state.panelVisible) renderMistakeList();
}

function clearMistakes() {
  state.mistakeList = [];
  renderMistakeList();
  refreshUI();
  els.msg.textContent = '错题本已清空，砥砺前行';
  setTimeout(() => { if (state.active && !state.win) els.msg.textContent = '再试一次，仔细对照注释'; }, 1200);
}

// ========== 初始化 ==========
async function init() {
  const ok = await loadData();
  if (!ok) return;
  const keys = Object.keys(state.data);
  if (!keys.length) { els.grid.innerHTML = '<div class="error-tip">数据为空，请检查 data.json</div>'; return; }
  state.currentLesson = keys[0];
  buildLessonBtns();
  state.allPairs = buildPairs(state.data[state.currentLesson]);
  state.levels = buildLevels(state.allPairs);
  state.totalLevels = state.levels.length;
  state.mistakeList = [];
  refreshUI();
  renderMistakeList();
  loadLevel(0);
  els.mistakePanel.style.display = 'none';
  state.panelVisible = false;

  // 事件绑定
  els.resetBtn.addEventListener('click', resetGame);
  els.toggleBtn.addEventListener('click', togglePanel);
  els.clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearMistakes(); });
  els.headerToggle?.addEventListener('click', (e) => { if (e.target !== els.clearBtn) togglePanel(); });
}

init();