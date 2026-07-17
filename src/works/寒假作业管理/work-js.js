const AppState = {
    homeworkData: [],
    homeworkMetadata: [],
    currentSelectedTask: null,
    isDarkMode: false,
    tomatoTimer: null,
    tomatoTimeLeft: 25 * 60,
    tomatoTotalTime: 25 * 60,
    tomatoBreakTime: 5 * 60,
    isWorking: true,
    tomatoSessions: 0,
    isTomatoRunning: false,
    isTomatoMode: false,
    currentDate: new Date(),
    currentMonthView: new Date(),
    subjectConfigMap: {},// 科目配置映射 - 从metadata动态构建，不再硬编码

    init() {
        this.loadHomeworkData()
            .then(() => {
                // 从metadata构建配置映射
                this.buildSubjectConfigMap();
                this.applySavedTheme();
                this.generateDatePicker();
                this.updateTimeDisplay();
                this.setupEventListeners();
                this.startTimers();

                const currentDate = this.getCurrentDate();
                this.selectDate(currentDate, this.formatDate(currentDate));
            })
            .catch(error => {
                console.error('初始化失败:', error);
                this.handleDataLoadError(error);
            });
    },

    buildSubjectConfigMap() {
        this.subjectConfigMap = {};
        this.homeworkMetadata.forEach(item => {
            this.subjectConfigMap[item.name] = {
                name: item.name + '作业',
                icon: item.icon || item.name.charAt(0),
                color: item.color || '#666'
            };
        });
    },

    async loadHomeworkData() {
        try {
            const response = await fetch('data.json');

            if (response.status === 404) {
                const mockData = this.getMockData();
                this.homeworkData = mockData.data;
                this.homeworkMetadata = mockData.metadata;
            } else {
                const jsonData = await response.json();
                this.homeworkData = jsonData.data;
                this.homeworkMetadata = jsonData.metadata || [
                    { name: '语文', icon: '语', color: '#e74c3c' },
                    { name: '英语', icon: '英', color: '#f39c12' },
                    { name: '数学', icon: '数', color: '#3498db' },
                    { name: '化学', icon: '化', color: '#9b59b6' },
                    { name: '历史', icon: '历', color: '#27ae60' }
                ];
            }
        } catch (error) {
            console.error('加载作业数据失败:', error);
            const mockData = this.getMockData();
            this.homeworkData = mockData.data;
            this.homeworkMetadata = mockData.metadata;
        }

        return Promise.resolve();
    },

    getMockData() {
        return {
            metadata: [
                { name: '语文', icon: '语', color: '#e74c3c' },
                { name: '英语', icon: '英', color: '#f39c12' },
                { name: '数学', icon: '数', color: '#3498db' },
                { name: '化学', icon: '化', color: '#9b59b6' },
                { name: '历史', icon: '历', color: '#27ae60' }
            ],
            data: [
                {
                    id: 0,
                    date: "0000/00/00",
                    items: {
                        "语文": "语文",
                        "英语": "英语",
                        "数学": "数学",
                        "化学": "化学",
                        "历史": "历史"
                    }
                }
            ]
        };
    },

    handleDataLoadError(error) {
        document.getElementById('tasks').innerHTML = `
                    <div class="no-tasks">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>无法加载作业数据: ${error.message}</div>
                        <div>请确保data.json文件存在于同目录下</div>
                    </div>
                `;
        this.generateDatePicker();
    },

    getCurrentDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    },

    updateTimeDisplay() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const timeString = `今天是${year}年${month}月${day}日 ${weekday} ${hours}:${minutes}:${seconds}`;
        document.getElementById('current-time').textContent = timeString;

        const currentDate = this.getCurrentDate();
        document.getElementById('currentDateDisplay').textContent = this.formatDate(currentDate);

        this.updateDailyDeadline();
        this.updateWinterEndCountdown();
    },

    updateDailyDeadline() {
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentSeconds = now.getSeconds();

        let targetHour = 22;
        let targetMinute = 30;

        if (currentHours > targetHour || (currentHours === targetHour && currentMinutes > targetMinute)) {
            document.getElementById('daily-deadline').textContent = '今日打卡已截止';
            document.getElementById('daily-deadline').className = 'deadline warning';
            return;
        }

        let remainingHours = targetHour - currentHours;
        let remainingMinutes = targetMinute - currentMinutes;
        let remainingSeconds = 60 - currentSeconds;

        if (remainingMinutes < 0) {
            remainingHours--;
            remainingMinutes += 60;
        }

        if (remainingSeconds >= 60) {
            remainingMinutes++;
            remainingSeconds -= 60;
        }

        if (remainingMinutes < 0) {
            remainingHours--;
            remainingMinutes += 60;
        }

        const deadlineText = `距今日打卡截至还剩下 ${remainingHours}小时${remainingMinutes}分钟${remainingSeconds}秒`;
        document.getElementById('daily-deadline').textContent = deadlineText;

        const deadlineElement = document.getElementById('daily-deadline');
        deadlineElement.className = 'deadline';
        if (remainingHours <= 1) {
            deadlineElement.classList.add('warning');
        } else if (remainingHours <= 3) {
            deadlineElement.classList.add('normal');
        } else {
            deadlineElement.classList.add('normal');
        }
    },

    updateWinterEndCountdown() {
        const winterEndDate = new Date('2026/3/4 23:59:59');
        const now = new Date();

        const diff = winterEndDate - now;

        if (diff <= 0) {
            document.getElementById('winter-end-countdown').textContent = '寒假已结束';
            document.getElementById('winter-end-countdown').className = 'deadline warning';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / (1000));

        const countdownText = `据寒假结束还剩下 ${days}天${hours}小时${minutes}分钟${seconds}秒`;
        document.getElementById('winter-end-countdown').textContent = countdownText;

        const countdownElement = document.getElementById('winter-end-countdown');
        countdownElement.className = 'deadline normal';
        if (days <= 1) {
            countdownElement.classList.remove('normal');
            countdownElement.classList.add('warning');
        } else if (days <= 3) {
            countdownElement.classList.remove('normal');
            countdownElement.classList.add('warning');
        }
    },

    formatDate(dateStr) {
        const [year, month, day] = dateStr.split('/');
        const date = new Date(year, month - 1, day);
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        return date.toLocaleDateString('zh-CN', options);
    },

    calculateDateDifference(targetDateStr, referenceDateStr) {
        const targetDate = new Date(targetDateStr);
        const referenceDate = new Date(referenceDateStr);

        targetDate.setHours(0, 0, 0, 0);
        referenceDate.setHours(0, 0, 0, 0);

        const diffInMs = targetDate - referenceDate;
        const diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));

        if (diffInDays === 0) {
            return '今天';
        } else if (diffInDays === 1) {
            return '明天';
        } else if (diffInDays === 2) {
            return '后天';
        } else if (diffInDays > 0) {
            return `${diffInDays}天后`;
        } else if (diffInDays === -1) {
            return '昨天';
        } else if (diffInDays === -2) {
            return '前天';
        } else {
            return `${Math.abs(diffInDays)}天前`;
        }
    },

    toggleMode() {
        document.body.classList.add('theme-transition');

        this.isDarkMode = !this.isDarkMode;
        const modeToggle = document.getElementById('modeToggle');
        const body = document.body;

        if (this.isDarkMode) {
            body.classList.add('dark-mode');
            modeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            modeToggle.title = '切换到浅色模式';
        } else {
            body.classList.remove('dark-mode');
            modeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            modeToggle.title = '切换到深色模式';
        }

        localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');

        setTimeout(() => {
            document.body.classList.remove('theme-transition');
        }, 300);
    },

    applySavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        const modeToggle = document.getElementById('modeToggle');
        const body = document.body;

        if (savedTheme === 'dark') {
            this.isDarkMode = true;
            body.classList.add('dark-mode');
            modeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            modeToggle.title = '切换到浅色模式';
        } else {
            modeToggle.title = '切换到深色模式';
        }
    },

    generateDatePicker() {
        const datePickerInput = document.getElementById('datePickerInput');
        const dateOptions = document.getElementById('dateOptions');
        const currentMonthYear = document.getElementById('currentMonthYear');

        const dates = [...new Set(this.homeworkData.map(item => item.date))].sort((a, b) => new Date(a) - new Date(b));

        const year = this.currentMonthView.getFullYear();
        const month = this.currentMonthView.getMonth() + 1;
        currentMonthYear.textContent = `${year}年${month}月`;

        dateOptions.innerHTML = '';

        dates.forEach(date => {
            const dateObj = new Date(date);
            const dateYear = dateObj.getFullYear();
            const dateMonth = dateObj.getMonth() + 1;

            if (dateYear === year && dateMonth === month) {
                const option = document.createElement('div');
                option.className = 'date-picker-option';

                const currentDateStr = this.getCurrentDate();
                if (date === currentDateStr) {
                    option.classList.add('selected');
                }

                const formattedDate = this.formatDate(date);
                const dateHint = this.calculateDateDifference(date, currentDateStr);

                option.innerHTML = `
                            <span class="date-text">${formattedDate}</span>
                            <span class="date-hint">${dateHint}</span>
                        `;

                option.dataset.dateValue = date;

                option.addEventListener('click', () => {
                    this.selectDate(date, formattedDate);
                    this.hideDatePicker();
                });

                dateOptions.appendChild(option);
            }
        });

        if (dateOptions.children.length === 0) {
            dateOptions.innerHTML = '<div class="date-picker-option">该月份暂无作业安排</div>';
        }
    },

    selectDate(date, formattedDate) {
        const datePickerInput = document.getElementById('datePickerInput');
        const dateHint = this.calculateDateDifference(date, this.getCurrentDate());

        datePickerInput.value = `${formattedDate} (${dateHint})`;
        this.showTasks(date);
    },

    showDatePicker() {
        const dropdown = document.getElementById('datePickerDropdown');
        dropdown.classList.add('date-picker-open');
    },

    hideDatePicker() {
        const dropdown = document.getElementById('datePickerDropdown');
        dropdown.classList.remove('date-picker-open');
    },

    updateStats(date) {
        let totalTasks = 0;
        let completedTasks = 0;

        const subjectNames = this.homeworkMetadata.map(m => m.name);

        subjectNames.forEach(subjectName => {
            const content = this.getSubjectContentByDate(date, subjectName);
            if (!content || content.trim() === '') return;

            const taskItems = content.split('<br>');
            taskItems.forEach((task, index) => {
                if (!task.trim()) return;

                const taskId = `task-${date}-${subjectName}-${index}`;
                totalTasks++;

                if (localStorage.getItem(taskId) === 'true') {
                    completedTasks++;
                }
            });
        });

        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        document.getElementById('totalTasks').textContent = totalTasks;
        document.getElementById('completedTasks').textContent = completedTasks;
        document.getElementById('completionRate').textContent = `${completionRate}%`;
        document.getElementById('progressFill').style.width = `${completionRate}%`;
    },

    getSubjectContentByDate(date, subjectName) {
        const entry = this.homeworkData.find(item => item.date === date);
        if (!entry) return '';

        // 新格式：从 items 中获取
        if (entry.items) {
            const content = entry.items[subjectName];
            if (content === '' || content === undefined || content === null) {
                return '';
            }

            // 如果内容是一个数字（指向其他日期的ID）
            if (typeof content === 'number' || !isNaN(content)) {
                const targetId = parseInt(content);
                const targetEntry = this.homeworkData.find(item => item.id === targetId);
                if (targetEntry && targetEntry.items && targetEntry.items[subjectName]) {
                    return this.getSubjectContentByDate(targetEntry.date, subjectName);
                }
                return '';
            }

            return content;
        }

        // 兼容旧格式（如果还有旧格式数据）
        const content = entry[subjectName];
        if (content === '' || content === undefined || content === null) {
            return '';
        }

        if (typeof content === 'number' || !isNaN(content)) {
            const targetId = parseInt(content);
            const targetEntry = this.homeworkData.find(item => item.id === targetId);
            if (targetEntry && targetEntry[subjectName]) {
                return this.getSubjectContentByDate(targetEntry.date, subjectName);
            }
            return '';
        }

        return content;
    },

    generateSubjectConfig(subjectName) {
        // 从metadata中查找
        const meta = this.homeworkMetadata.find(m => m.name === subjectName);
        if (meta) {
            return {
                name: meta.name + '作业',
                icon: meta.icon || meta.name.charAt(0),
                color: meta.color || '#666'
            };
        }

        // 如果metadata中没有，生成动态配置
        const colors = [
            '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#27ae60',
            '#1abc9c', '#d35400', '#c0392b', '#8e44ad', '#16a085'
        ];
        const colorIndex = Math.abs(this.hashCode(subjectName)) % colors.length;

        return {
            name: subjectName + '作业',
            icon: subjectName.charAt(0),
            color: colors[colorIndex]
        };
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

    showTasks(date) {
        const tasksContainer = document.getElementById('tasks');
        tasksContainer.innerHTML = '';

        const entry = this.homeworkData.find(item => item.date === date);
        if (!entry) {
            tasksContainer.innerHTML = `
                        <div class="no-tasks">
                            <i class="fas fa-exclamation-triangle"></i>
                            <div>未找到该日期的作业</div>
                        </div>
                    `;
            this.updateStats(date);
            return;
        }

        // 从metadata获取科目列表
        const subjects = this.homeworkMetadata.map(meta => {
            return {
                name: meta.name,
                ...this.generateSubjectConfig(meta.name)
            };
        });

        let hasTasks = false;

        subjects.forEach(subject => {
            const content = this.getSubjectContentByDate(date, subject.name);
            if (!content || content.trim() === '') return;

            hasTasks = true;
            const taskItems = content.split('<br>');

            const subjectDiv = document.createElement('div');
            subjectDiv.className = 'subject-title';

            const subjectHeader = document.createElement('div');
            subjectHeader.className = 'subject-header';

            subjectHeader.innerHTML = `
                        <div class="subject-icon" style="background-color: ${subject.color}">
                            ${subject.icon}
                        </div>
                        <div class="subject-name">${subject.name}作业</div>
                    `;

            const taskList = document.createElement('ul');
            taskList.className = 'task-list';

            taskItems.forEach((task, index) => {
                if (!task.trim()) return;

                const taskItem = document.createElement('li');
                taskItem.className = 'task-item';

                const taskId = `task-${date}-${subject.name}-${index}`;
                const isCompleted = localStorage.getItem(taskId) === 'true';

                // 检测是否为引用内容并添加提示
                let taskHint = '';
                const entryData = this.homeworkData.find(item => item.date === date);
                if (entryData && entryData.items && typeof entryData.items[subject.name] === 'number') {
                    const referencedEntry = this.homeworkData.find(item => item.id === entryData.items[subject.name]);
                    if (referencedEntry) {
                        taskHint = `<div class="task-hint" style="font-size: 0.8em; color: var(--md-sys-color-secondary); margin-top: 4px; font-style: italic;">
                <继承自 ${referencedEntry.date} 的任务>
            </div>`;
                    }
                }

                taskItem.innerHTML = `
                            <input type="checkbox" class="task-checkbox" id="${taskId}" ${isCompleted ? 'checked' : ''}>
                            <div class="task-content">${task}</div>
                            ${taskHint}
                            <div class="task-footer">
                                <span>任务 ${index + 1}</span>
                            </div>
                        `;

                taskItem.classList.toggle('completed', isCompleted);

                const checkbox = taskItem.querySelector('.task-checkbox');
                checkbox.addEventListener('change', () => {
                    localStorage.setItem(taskId, checkbox.checked);
                    taskItem.classList.toggle('completed', checkbox.checked);
                    this.updateStats(date);
                });

                taskItem.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('task-checkbox')) {
                        if (this.currentSelectedTask) {
                            this.currentSelectedTask.classList.remove('selected');
                        }

                        this.currentSelectedTask = taskItem;
                        this.currentSelectedTask.classList.add('selected');

                        this.showSelectionFeedback();

                        const taskText = task.replace(/<[^>]*>/g, '').trim();
                        this.setCurrentTomatoTask(taskText);
                    }
                });

                taskList.appendChild(taskItem);
            });

            subjectDiv.appendChild(subjectHeader);
            subjectDiv.appendChild(taskList);
            tasksContainer.appendChild(subjectDiv);
        });

        if (!hasTasks) {
            const today = new Date();
            const isWeekend = today.getDay() === 0 || today.getDay() === 6;
            const message = isWeekend
                ? '好好休息一下吧！'
                : '今天没有作业安排，可以复习之前的内容或预习新课。';

            tasksContainer.innerHTML = `
                        <div class="no-tasks">
                            <i class="fas fa-calendar-check"></i>
                            <div class="empty-title">今天没有作业</div>
                            <div class="empty-message">${message}</div>
                        </div>
                    `;
        }

        this.updateStats(date);
    },

    showSelectionFeedback() {
        const feedback = document.getElementById('selectionFeedback');
        feedback.classList.add('show');

        setTimeout(() => {
            feedback.classList.remove('show');
        }, 1500);
    },

    setCurrentTomatoTask(taskText) {
        document.getElementById('tomatoCurrentTask').textContent = taskText;
    },

    updateTomatoProgress() {
        const progressFill = document.getElementById('tomatoProgressFill');
        const progressBar = document.getElementById('tomatoProgressBar');

        const totalTime = this.isWorking ? this.tomatoTotalTime : this.tomatoBreakTime;
        const progressPercent = ((totalTime - this.tomatoTimeLeft) / totalTime) * 100;

        let rotation;
        if (progressPercent <= 50) {
            rotation = (progressPercent / 50) * 180;
            progressBar.classList.remove('full');
            progressFill.style.transform = `rotate(${rotation}deg)`;
        } else {
            rotation = ((progressPercent - 50) / 50) * 180;
            progressBar.classList.add('full');
            progressFill.style.transform = `rotate(${rotation}deg)`;
        }

        if (progressPercent > 90) {
            progressFill.style.background = this.isWorking ? 'var(--warning-color)' : 'var(--success-color)';
        } else {
            progressFill.style.background = this.isWorking ? 'var(--md-sys-color-primary)' : 'var(--success-color)';
        }
    },

    updateTomatoDisplay() {
        const minutes = Math.floor(this.tomatoTimeLeft / 60);
        const seconds = this.tomatoTimeLeft % 60;

        document.getElementById('tomatoTimer').textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        document.getElementById('timerStatus').textContent =
            this.isWorking ? '专注时间' : '休息时间';

        document.getElementById('sessionCounter').textContent = this.tomatoSessions;

        this.updateTomatoProgress();
    },

    startTomato() {
        if (this.isTomatoRunning) return;

        this.isTomatoRunning = true;
        document.getElementById('startTomatoBtn').classList.add('active');

        this.updateTomatoProgress();

        this.tomatoTimer = setInterval(() => {
            this.tomatoTimeLeft--;

            if (this.tomatoTimeLeft <= 0) {
                this.completeTomatoSession();
            } else {
                this.updateTomatoDisplay();
            }
        }, 1000);
    },

    pauseTomato() {
        if (!this.isTomatoRunning) return;

        this.isTomatoRunning = false;
        clearInterval(this.tomatoTimer);
        document.getElementById('startTomatoBtn').classList.remove('active');
    },

    resetTomato() {
        this.pauseTomato();

        if (this.isWorking) {
            this.tomatoTimeLeft = this.tomatoTotalTime;
        } else {
            this.tomatoTimeLeft = this.tomatoBreakTime;
        }

        const progressFill = document.getElementById('tomatoProgressFill');
        const progressBar = document.getElementById('tomatoProgressBar');
        progressBar.className = 'tomato-progress-bar';
        progressFill.style.transform = 'rotate(0deg)';

        this.updateTomatoDisplay();
        document.getElementById('startTomatoBtn').classList.remove('active');
    },

    skipTomato() {
        this.completeTomatoSession();
    },

    completeTomatoSession() {
        this.pauseTomato();

        if (this.isWorking) {
            this.isWorking = false;
            this.tomatoTimeLeft = this.tomatoBreakTime;
            this.tomatoSessions++;
            this.showNotification('专注时间结束！开始休息 5 分钟', 'success');

            const progressBar = document.getElementById('tomatoProgressBar');
            const progressFill = document.getElementById('tomatoProgressFill');
            progressBar.classList.remove('full');
            progressFill.style.transform = 'rotate(0deg)';

        } else {
            this.isWorking = true;
            this.tomatoTimeLeft = this.tomatoTotalTime;
            this.showNotification('休息时间结束！继续专注学习', 'info');
        }

        this.updateTomatoDisplay();
    },

    enterTomatoMode() {
        this.isTomatoMode = true;
        document.getElementById('tasksContainer').classList.add('hidden');
        document.getElementById('tomatoContainer').classList.add('active');
        document.getElementById('startTomatoModeBtn').style.display = 'none';
        document.getElementById('backToTasksBtn').style.display = 'block';
        this.resetTomato();
    },

    exitTomatoMode() {
        this.isTomatoMode = false;
        this.pauseTomato();
        document.getElementById('tasksContainer').classList.remove('hidden');
        document.getElementById('tomatoContainer').classList.remove('active');
        document.getElementById('startTomatoModeBtn').style.display = 'block';
        document.getElementById('backToTasksBtn').style.display = 'none';
    },

    setupEventListeners() {
        document.querySelector('.floating-action').addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        const datePickerInput = document.getElementById('datePickerInput');
        const datePickerDropdown = document.getElementById('datePickerDropdown');

        datePickerInput.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDatePicker();
        });

        document.addEventListener('click', (e) => {
            if (!datePickerDropdown.contains(e.target) && !datePickerInput.contains(e.target)) {
                this.hideDatePicker();
            }
        });

        document.getElementById('prevMonth').addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentMonthView.setMonth(this.currentMonthView.getMonth() - 1);
            this.generateDatePicker();
        });

        document.getElementById('nextMonth').addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentMonthView.setMonth(this.currentMonthView.getMonth() + 1);
            this.generateDatePicker();
        });

        document.getElementById('startTomatoModeBtn').addEventListener('click', () => {
            this.enterTomatoMode();
        });

        document.getElementById('backToTasksBtn').addEventListener('click', () => {
            this.exitTomatoMode();
        });

        document.getElementById('modeToggle').addEventListener('click', () => {
            this.toggleMode();
        });

        document.getElementById('startTomatoBtn').addEventListener('click', () => {
            this.startTomato();
        });

        document.getElementById('pauseTomatoBtn').addEventListener('click', () => {
            this.pauseTomato();
        });

        document.getElementById('resetTomatoBtn').addEventListener('click', () => {
            this.resetTomato();
        });

        document.getElementById('skipTomatoBtn').addEventListener('click', () => {
            this.skipTomato();
        });
    },

    startTimers() {
        setInterval(() => {
            this.updateTimeDisplay();
        }, 1000);
    },

    extractDateFromInput(inputValue) {
        if (!inputValue) return null;

        const match = inputValue.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
        return match ? match[0] : null;
    },

    showNotification(message, type = 'info') {
        let container = document.querySelector('.notification-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
                    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'bell'}"></i>
                    <span>${message}</span>
                `;

        container.insertBefore(notification, container.firstChild);

        const notificationId = Date.now();
        notification.dataset.id = notificationId;

        setTimeout(() => {
            this.removeNotification(notificationId);
        }, 3000);

        return notificationId;
    },

    removeNotification(notificationId) {
        const notification = document.querySelector(`[data-id="${notificationId}"]`);
        if (notification) {
            notification.classList.add('fade-out');

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }

                const container = document.querySelector('.notification-container');
                if (container && container.children.length === 0) {
                    container.remove();
                }
            }, 300);
        }
    },
};

window.addEventListener('load', () => {
    AppState.init();
});