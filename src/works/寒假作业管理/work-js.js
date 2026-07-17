// ==================== 配置常量 ====================
const CONFIG = {
  WINTER_END: new Date('2026-03-04T23:59:59'),
  DAILY_DEADLINE: { hour: 22, minute: 30 },
  STORAGE_KEYS: {
    THEME: 'theme',
    TASK_PREFIX: 'task-',
  },
  COLORS: [
    '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#27ae60',
    '#1abc9c', '#d35400', '#c0392b', '#8e44ad', '#16a085',
  ],
  MOCK_DATA: {
    metadata: [
      { name: '语文', icon: '语', color: '#e74c3c' },
      { name: '英语', icon: '英', color: '#f39c12' },
      { name: '数学', icon: '数', color: '#3498db' },
      { name: '化学', icon: '化', color: '#9b59b6' },
      { name: '历史', icon: '历', color: '#27ae60' },
    ],
    data: [
      // 增加一条当天占位数据，确保界面初始有内容
      {
        id: 0,
        date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
        items: {},
      },
    ],
  },
};

// ==================== 工具函数 ====================
const Utils = {
  formatDate(date) {
    const d = new Date(date);
    if (isNaN(d)) return '无效日期';
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  },

  getTodayStr() {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  },

  daysDiff(dateStr1, dateStr2) {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    if (isNaN(d1) || isNaN(d2)) return Infinity;
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
  },

  getDateHint(dateStr, todayStr) {
    const diff = this.daysDiff(dateStr, todayStr);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    if (diff > 0) return `${diff}天后`;
    if (diff === -1) return '昨天';
    if (diff === -2) return '前天';
    if (diff < 0) return `${Math.abs(diff)}天前`;
    return '未知';
  },

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  },

  storage: {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
  },
};

// ==================== 数据管理器 ====================
class DataManager {
  constructor() {
    this.homeworkData = [];
    this.homeworkMetadata = [];
    this.subjectConfigMap = {};
  }

  async load() {
    try {
      const response = await fetch('data.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      this.homeworkData = json.data || [];
      this.homeworkMetadata = json.metadata || CONFIG.MOCK_DATA.metadata;
    } catch (error) {
      console.warn('加载 data.json 失败，使用 mock 数据', error);
      this.homeworkData = CONFIG.MOCK_DATA.data;
      this.homeworkMetadata = CONFIG.MOCK_DATA.metadata;
    }
    this._buildSubjectConfigMap();
  }

  _buildSubjectConfigMap() {
    this.subjectConfigMap = {};
    this.homeworkMetadata.forEach(meta => {
      this.subjectConfigMap[meta.name] = {
        name: meta.name + '作业',
        icon: meta.icon || meta.name.charAt(0),
        color: meta.color || '#666',
      };
    });
  }

  getSubjectConfig(subjectName) {
    return this.subjectConfigMap[subjectName] || {
      name: subjectName + '作业',
      icon: subjectName.charAt(0),
      color: CONFIG.COLORS[Math.abs(Utils.hashCode(subjectName)) % CONFIG.COLORS.length],
    };
  }

  getEntryByDate(date) {
    if (!date) return undefined;
    return this.homeworkData.find(item => item.date === date);
  }

  getSubjectContent(date, subjectName) {
    const entry = this.getEntryByDate(date);
    if (!entry) return '';

    const raw = entry.items?.[subjectName];
    if (raw === undefined || raw === null || raw === '') return '';

    if (typeof raw === 'number' || /^\d+$/.test(raw)) {
      const targetId = parseInt(raw, 10);
      const targetEntry = this.homeworkData.find(item => item.id === targetId);
      if (targetEntry) {
        return this.getSubjectContent(targetEntry.date, subjectName);
      }
      return '';
    }
    return raw;
  }

  get allDates() {
    return [...new Set(this.homeworkData.map(item => item.date).filter(d => d && d !== '0000/00/00'))]
      .sort((a, b) => new Date(a) - new Date(b));
  }
}

// ==================== 主题管理器 ====================
class ThemeManager {
  constructor() {
    this.isDarkMode = false;
    this.toggleBtn = document.getElementById('modeToggle');
    this.body = document.body;
    this._applySaved();
  }

  _applySaved() {
    const saved = Utils.storage.get(CONFIG.STORAGE_KEYS.THEME);
    if (saved === 'dark') {
      this.isDarkMode = true;
      this.body.classList.add('dark-mode');
      this.toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
      this.toggleBtn.title = '切换到浅色模式';
    } else {
      this.toggleBtn.title = '切换到深色模式';
    }
  }

  toggle() {
    this.body.classList.add('theme-transition');
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      this.body.classList.add('dark-mode');
      this.toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
      this.toggleBtn.title = '切换到浅色模式';
    } else {
      this.body.classList.remove('dark-mode');
      this.toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
      this.toggleBtn.title = '切换到深色模式';
    }
    Utils.storage.set(CONFIG.STORAGE_KEYS.THEME, this.isDarkMode ? 'dark' : 'light');
    setTimeout(() => this.body.classList.remove('theme-transition'), 300);
  }
}

// ==================== 番茄钟管理器 ====================
class TomatoTimer {
  constructor() {
    this.timer = null;
    this.isRunning = false;
    this.isWorking = true;
    this.timeLeft = 25 * 60;
    this.totalTime = 25 * 60;
    this.breakTime = 5 * 60;
    this.sessions = 0;
    this.currentTask = '请选择一项任务开始专注学习';

    this.elements = {
      timerDisplay: document.getElementById('tomatoTimer'),
      statusDisplay: document.getElementById('timerStatus'),
      sessionCounter: document.getElementById('sessionCounter'),
      progressFill: document.getElementById('tomatoProgressFill'),
      progressBar: document.getElementById('tomatoProgressBar'),
      currentTask: document.getElementById('tomatoCurrentTask'),
      startBtn: document.getElementById('startTomatoBtn'),
      pauseBtn: document.getElementById('pauseTomatoBtn'),
      resetBtn: document.getElementById('resetTomatoBtn'),
      skipBtn: document.getElementById('skipTomatoBtn'),
    };

    this._bindEvents();
    this.updateDisplay();
  }

  _bindEvents() {
    this.elements.startBtn.addEventListener('click', () => this.start());
    this.elements.pauseBtn.addEventListener('click', () => this.pause());
    this.elements.resetBtn.addEventListener('click', () => this.reset());
    this.elements.skipBtn.addEventListener('click', () => this.skip());
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.elements.startBtn.classList.add('active');
    this._tick();
    this.timer = setInterval(() => this._tick(), 1000);
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.timer);
    this.elements.startBtn.classList.remove('active');
  }

  reset() {
    this.pause();
    this.timeLeft = this.isWorking ? this.totalTime : this.breakTime;
    this._resetProgress();
    this.updateDisplay();
    this.elements.startBtn.classList.remove('active');
  }

  skip() {
    this._completeSession();
  }

  _tick() {
    this.timeLeft--;
    if (this.timeLeft <= 0) {
      this._completeSession();
    } else {
      this.updateDisplay();
    }
  }

  _completeSession() {
    this.pause();
    if (this.isWorking) {
      this.isWorking = false;
      this.timeLeft = this.breakTime;
      this.sessions++;
      this._showNotification('专注时间结束！开始休息 5 分钟', 'success');
    } else {
      this.isWorking = true;
      this.timeLeft = this.totalTime;
      this._showNotification('休息时间结束！继续专注学习', 'info');
    }
    this._resetProgress();
    this.updateDisplay();
  }

  _resetProgress() {
    this.elements.progressBar.className = 'tomato-progress-bar';
    this.elements.progressFill.style.transform = 'rotate(0deg)';
  }

  updateDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    this.elements.timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.elements.statusDisplay.textContent = this.isWorking ? '专注时间' : '休息时间';
    this.elements.sessionCounter.textContent = this.sessions;
    this.elements.currentTask.textContent = this.currentTask;
    this._updateProgress();
  }

  _updateProgress() {
    const total = this.isWorking ? this.totalTime : this.breakTime;
    const progress = total > 0 ? ((total - this.timeLeft) / total) * 100 : 0;
    const fill = this.elements.progressFill;
    const bar = this.elements.progressBar;

    let rotation;
    if (progress <= 50) {
      rotation = (progress / 50) * 180;
      bar.classList.remove('full');
      fill.style.transform = `rotate(${rotation}deg)`;
    } else {
      rotation = ((progress - 50) / 50) * 180;
      bar.classList.add('full');
      fill.style.transform = `rotate(${rotation}deg)`;
    }
    fill.style.background = this.isWorking
      ? (progress > 90 ? 'var(--warning-color)' : 'var(--md-sys-color-primary)')
      : (progress > 90 ? 'var(--warning-color)' : 'var(--success-color)');
  }

  setTask(taskText) {
    this.currentTask = taskText || '请选择一项任务开始专注学习';
    this.elements.currentTask.textContent = this.currentTask;
  }

  _showNotification(message, type) {
    if (window.__showNotification) {
      window.__showNotification(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }
}

// ==================== 日期选择器 ====================
class DatePicker {
  constructor(dataManager, onSelect) {
    this.dataManager = dataManager;
    this.onSelect = onSelect;
    this.currentMonthView = new Date();
    this.input = document.getElementById('datePickerInput');
    this.dropdown = document.getElementById('datePickerDropdown');
    this.optionsContainer = document.getElementById('dateOptions');
    this.monthYearDisplay = document.getElementById('currentMonthYear');
    this.prevBtn = document.getElementById('prevMonth');
    this.nextBtn = document.getElementById('nextMonth');

    this._bindEvents();
    this.render();
  }

  _bindEvents() {
    this.input.addEventListener('click', (e) => {
      e.stopPropagation();
      this.show();
    });
    document.addEventListener('click', (e) => {
      if (!this.dropdown.contains(e.target) && !this.input.contains(e.target)) {
        this.hide();
      }
    });
    this.prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentMonthView.setMonth(this.currentMonthView.getMonth() - 1);
      this.render();
    });
    this.nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentMonthView.setMonth(this.currentMonthView.getMonth() + 1);
      this.render();
    });
  }

  show() {
    this.dropdown.classList.add('date-picker-open');
  }

  hide() {
    this.dropdown.classList.remove('date-picker-open');
  }

  render() {
    const year = this.currentMonthView.getFullYear();
    const month = this.currentMonthView.getMonth() + 1;
    this.monthYearDisplay.textContent = `${year}年${month}月`;

    const today = Utils.getTodayStr();
    const allDates = this.dataManager.allDates;
    const fragment = document.createDocumentFragment();

    allDates.forEach(dateStr => {
      const d = new Date(dateStr);
      if (isNaN(d)) return;
      if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
        const option = document.createElement('div');
        option.className = 'date-picker-option';
        if (dateStr === today) option.classList.add('selected');
        const formatted = Utils.formatDate(dateStr);
        const hint = Utils.getDateHint(dateStr, today);
        option.innerHTML = `<span class="date-text">${formatted}</span><span class="date-hint">${hint}</span>`;
        option.dataset.date = dateStr;
        option.addEventListener('click', () => {
          this.select(dateStr);
          this.hide();
        });
        fragment.appendChild(option);
      }
    });

    if (fragment.children.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'date-picker-option';
      empty.textContent = '该月份暂无作业安排';
      fragment.appendChild(empty);
    }

    this.optionsContainer.innerHTML = '';
    this.optionsContainer.appendChild(fragment);
  }

  select(dateStr) {
    if (!dateStr) return;
    const formatted = Utils.formatDate(dateStr);
    const hint = Utils.getDateHint(dateStr, Utils.getTodayStr());
    this.input.value = `${formatted} (${hint})`;
    this.onSelect(dateStr);
  }

  setDate(dateStr) {
    if (dateStr) this.select(dateStr);
  }
}

// ==================== 统计信息（修正依赖注入） ====================
class Stats {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.totalEl = document.getElementById('totalTasks');
    this.completedEl = document.getElementById('completedTasks');
    this.rateEl = document.getElementById('completionRate');
    this.progressFill = document.getElementById('progressFill');
  }

  update(date) {
    if (!this.dataManager) {
      console.warn('Stats: dataManager 未初始化');
      return;
    }
    let total = 0;
    let completed = 0;
    const subjects = this.dataManager.homeworkMetadata.map(m => m.name);

    subjects.forEach(subjectName => {
      const content = this.dataManager.getSubjectContent(date, subjectName);
      if (!content) return;
      const items = content.split('<br>').filter(t => t.trim());
      items.forEach((_, index) => {
        const taskId = `task-${date}-${subjectName}-${index}`;
        total++;
        if (Utils.storage.get(CONFIG.STORAGE_KEYS.TASK_PREFIX + taskId) === 'true') {
          completed++;
        }
      });
    });

    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    this.totalEl.textContent = total;
    this.completedEl.textContent = completed;
    this.rateEl.textContent = `${rate}%`;
    this.progressFill.style.width = `${rate}%`;
  }
}

// ==================== 任务渲染器 ====================
class TaskRenderer {
  constructor(dataManager, stats, tomatoTimer) {
    this.dataManager = dataManager;
    this.stats = stats;
    this.tomatoTimer = tomatoTimer;
    this.container = document.getElementById('tasks');
    this.currentDate = null;
  }

  render(date) {
    this.currentDate = date;
    if (!date || !this.dataManager) {
      this.container.innerHTML = `<div class="no-tasks"><i class="fas fa-exclamation-triangle"></i><div>日期无效或数据未加载</div></div>`;
      return;
    }

    const entry = this.dataManager.getEntryByDate(date);
    if (!entry) {
      this.container.innerHTML = `
        <div class="no-tasks">
          <i class="fas fa-exclamation-triangle"></i>
          <div>未找到该日期的作业</div>
        </div>
      `;
      this.stats.update(date);
      return;
    }

    const subjects = this.dataManager.homeworkMetadata.map(meta => meta.name);
    let hasTasks = false;
    const fragment = document.createDocumentFragment();

    subjects.forEach(subjectName => {
      const content = this.dataManager.getSubjectContent(date, subjectName);
      if (!content || content.trim() === '') return;
      hasTasks = true;

      const config = this.dataManager.getSubjectConfig(subjectName);
      const subjectDiv = document.createElement('div');
      subjectDiv.className = 'subject-title';

      const header = document.createElement('div');
      header.className = 'subject-header';
      header.innerHTML = `
        <div class="subject-icon" style="background-color: ${config.color}">${config.icon}</div>
        <div class="subject-name">${config.name}</div>
      `;

      const taskList = document.createElement('ul');
      taskList.className = 'task-list';

      const items = content.split('<br>').filter(t => t.trim());
      items.forEach((task, index) => {
        const taskId = `task-${date}-${subjectName}-${index}`;
        const isCompleted = Utils.storage.get(CONFIG.STORAGE_KEYS.TASK_PREFIX + taskId) === 'true';

        const li = document.createElement('li');
        li.className = 'task-item' + (isCompleted ? ' completed' : '');

        let hint = '';
        const raw = entry.items?.[subjectName];
        if (typeof raw === 'number' || /^\d+$/.test(raw)) {
          const targetId = parseInt(raw, 10);
          const targetEntry = this.dataManager.homeworkData.find(item => item.id === targetId);
          if (targetEntry) {
            hint = `<div class="task-hint" style="font-size:0.8em; color:var(--md-sys-color-secondary); margin-top:4px; font-style:italic;"><继承自 ${targetEntry.date} 的任务></div>`;
          }
        }

        li.innerHTML = `
          <input type="checkbox" class="task-checkbox" id="${taskId}" ${isCompleted ? 'checked' : ''}>
          <div class="task-content">${task}</div>
          ${hint}
          <div class="task-footer"><span>任务 ${index + 1}</span></div>
        `;

        const checkbox = li.querySelector('.task-checkbox');
        checkbox.addEventListener('change', () => {
          Utils.storage.set(CONFIG.STORAGE_KEYS.TASK_PREFIX + taskId, checkbox.checked ? 'true' : 'false');
          li.classList.toggle('completed', checkbox.checked);
          this.stats.update(date);
        });

        li.addEventListener('click', (e) => {
          if (e.target.classList.contains('task-checkbox')) return;
          // 移除之前的高亮
          document.querySelectorAll('.task-item.selected').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
          const cleanTask = task.replace(/<[^>]*>/g, '').trim();
          this.tomatoTimer.setTask(cleanTask);
          const feedback = document.getElementById('selectionFeedback');
          feedback.classList.add('show');
          setTimeout(() => feedback.classList.remove('show'), 1500);
        });

        taskList.appendChild(li);
      });

      subjectDiv.appendChild(header);
      subjectDiv.appendChild(taskList);
      fragment.appendChild(subjectDiv);
    });

    if (!hasTasks) {
      const isWeekend = [0, 6].includes(new Date().getDay());
      const message = isWeekend ? '好好休息一下吧！' : '今天没有作业安排，可以复习之前的内容或预习新课。';
      fragment.innerHTML = `
        <div class="no-tasks">
          <i class="fas fa-calendar-check"></i>
          <div class="empty-title">今天没有作业</div>
          <div class="empty-message">${message}</div>
        </div>
      `;
    }

    this.container.innerHTML = '';
    this.container.appendChild(fragment);
    this.stats.update(date);
  }

  getCurrentDate() {
    return this.currentDate;
  }
}

// ==================== 通知系统（全局） ====================
function showNotification(message, type = 'info') {
  let container = document.querySelector('.notification-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'notification-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'check-circle',
    warning: 'exclamation-triangle',
    info: 'bell',
  };
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `<i class="fas fa-${icons[type] || 'bell'}"></i><span>${message}</span>`;

  container.prepend(notification);
  const id = Date.now();
  notification.dataset.id = id;

  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      notification.remove();
      if (container.children.length === 0) container.remove();
    }, 300);
  }, 3000);
}
window.__showNotification = showNotification;

// ==================== 主应用 ====================
class App {
  constructor() {
    this.dataManager = new DataManager();
    this.themeManager = new ThemeManager();
    this.tomatoTimer = new TomatoTimer();
    this.stats = null; // 稍后初始化
    this.taskRenderer = null;
    this.datePicker = null;
    this.today = Utils.getTodayStr();

    this._bindGlobalEvents();
  }

  async init() {
    await this.dataManager.load();

    // 依赖注入：Stats 需要 dataManager
    this.stats = new Stats(this.dataManager);
    this.taskRenderer = new TaskRenderer(this.dataManager, this.stats, this.tomatoTimer);
    this.datePicker = new DatePicker(this.dataManager, (date) => {
      this.taskRenderer.render(date);
    });

    this._updateTimeDisplay();
    this._startTimers();

    // 选择初始日期
    const todayEntry = this.dataManager.getEntryByDate(this.today);
    const allDates = this.dataManager.allDates;

    if (todayEntry) {
      this.datePicker.setDate(this.today);
    } else if (allDates.length > 0) {
      this.datePicker.setDate(allDates[0]);
    } else {
      // 无有效数据，渲染今天（显示无任务）
      this.taskRenderer.render(this.today);
    }

    // 番茄钟模式切换
    document.getElementById('startTomatoModeBtn').addEventListener('click', () => this._enterTomatoMode());
    document.getElementById('backToTasksBtn').addEventListener('click', () => this._exitTomatoMode());
  }

  _bindGlobalEvents() {
    document.querySelector('.floating-action').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('modeToggle').addEventListener('click', () => {
      this.themeManager.toggle();
    });
  }

  _updateTimeDisplay() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[now.getDay()];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('current-time').textContent =
      `今天是${year}年${month}月${day}日 ${weekday} ${hours}:${minutes}:${seconds}`;

    this._updateDailyDeadline(now);
    this._updateWinterEndCountdown(now);
  }

  _updateDailyDeadline(now) {
    const target = CONFIG.DAILY_DEADLINE;
    const targetDate = new Date(now);
    targetDate.setHours(target.hour, target.minute, 0, 0);

    if (now > targetDate) {
      document.getElementById('daily-deadline').textContent = '今日打卡已截止';
      document.getElementById('daily-deadline').className = 'deadline warning';
      return;
    }

    const diffMs = targetDate - now;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    const el = document.getElementById('daily-deadline');
    el.textContent = `距今日打卡截至还剩下 ${hours}小时${minutes}分钟${seconds}秒`;
    el.className = 'deadline' + (hours <= 1 ? ' warning' : ' normal');
  }

  _updateWinterEndCountdown(now) {
    const end = CONFIG.WINTER_END;
    const diffMs = end - now;
    if (diffMs <= 0) {
      document.getElementById('winter-end-countdown').textContent = '寒假已结束';
      document.getElementById('winter-end-countdown').className = 'deadline warning';
      return;
    }
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    const el = document.getElementById('winter-end-countdown');
    el.textContent = `据寒假结束还剩下 ${days}天${hours}小时${minutes}分钟${seconds}秒`;
    el.className = 'deadline' + (days <= 3 ? ' warning' : ' normal');
  }

  _startTimers() {
    setInterval(() => this._updateTimeDisplay(), 1000);
  }

  _enterTomatoMode() {
    document.getElementById('tasksContainer').classList.add('hidden');
    document.getElementById('tomatoContainer').classList.add('active');
    document.getElementById('startTomatoModeBtn').style.display = 'none';
    document.getElementById('backToTasksBtn').style.display = 'block';
    this.tomatoTimer.reset();
  }

  _exitTomatoMode() {
    document.getElementById('tasksContainer').classList.remove('hidden');
    document.getElementById('tomatoContainer').classList.remove('active');
    document.getElementById('startTomatoModeBtn').style.display = 'block';
    document.getElementById('backToTasksBtn').style.display = 'none';
    this.tomatoTimer.pause();
  }
}

// ==================== 启动应用 ====================
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});