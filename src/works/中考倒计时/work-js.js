// ========== 核心配置 ==========
const TARGET_DATE = new Date(2026, 5, 22, 8, 20, 0);

// 壁纸配置
const BACKGROUND_IMAGE_URLS = [
    'https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.OloupenaFalls_ZH-CN2980118660_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.LoganCreek_ZH-CN5372283365_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.PeggysLighthouse_ZH-CN5730463973_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.MendenhallCave_ZH-CN1850649760_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.FanetteIsland_ZH-CN6466809551_UHD.jpg&pid=hp'
];

const daysEl = document.getElementById('daysDigit'),
    hoursEl = document.getElementById('hoursDigit');
const minutesEl = document.getElementById('minutesDigit'),
    secondsEl = document.getElementById('secondsDigit');
const timerDisplay = document.getElementById('currentTimeDisplay');
const greetingIconSpan = document.getElementById('greetingIcon');
const greetingTextSpan = document.getElementById('greetingText');
const sayingElement = document.getElementById('dynamicSaying');
const lateNightAlertDiv = document.getElementById('lateNightAlert');
let prevDigits = { days: -1, hours: -1, minutes: -1, seconds: -1 };
let sessionStart = Date.now();
let secondTickHandler = null;

// 设置面板相关元素
const settingsPanel = document.getElementById('settingsPanel');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const blurSlider = document.getElementById('blurSlider');
const saturationSlider = document.getElementById('saturationSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const blurValue = document.getElementById('blurValue');
const saturationValue = document.getElementById('saturationValue');
const brightnessValue = document.getElementById('brightnessValue');
const colorOptions = document.querySelectorAll('.color-option');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');

// 壁纸功能
function applyRandomBackgroundImage() {
    const randomIndex = Math.floor(Math.random() * BACKGROUND_IMAGE_URLS.length);
    const imageUrl = BACKGROUND_IMAGE_URLS[randomIndex];
    document.documentElement.style.setProperty('--wallpaper-url', `url('${imageUrl}')`);
    document.body.classList.add('has-wallpaper');
    localStorage.setItem('backgroundImageUrl', imageUrl);
}

function toggleWallpaper() {
    applyRandomBackgroundImage();
}

// 全屏功能
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`无法进入全屏模式: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// 设置面板功能
function showSettingsPanel() {
    settingsPanel.style.display = 'block';
}

function hideSettingsPanel() {
    settingsPanel.style.display = 'none';
}

// 更新CSS变量
function updateCSSVariables() {
    document.documentElement.style.setProperty('--glass-blur', `${blurSlider.value}px`);
    document.documentElement.style.setProperty('--saturation-factor', `${saturationSlider.value}%`);
    document.documentElement.style.setProperty('--brightness-factor', `${brightnessSlider.value}%`);

    const selectedColorOption = document.querySelector('.color-option.active');
    if (selectedColorOption) {
        const selectedColor = selectedColorOption.dataset.color;
        document.documentElement.style.setProperty('--accent-blue', selectedColor);
        document.documentElement.style.setProperty('--accent-light', selectedColor);
        document.documentElement.style.setProperty('--badge-text', selectedColor);
        document.documentElement.style.setProperty('--saying-border-left', selectedColor);
        document.documentElement.style.setProperty('--progress-fill', `linear-gradient(105deg, ${selectedColor} 0%, ${adjustColor(selectedColor, -20)} 20%, ${adjustColor(selectedColor, 20)} 80%, ${selectedColor} 100%)`);
    }
}

// 颜色调整辅助函数
function adjustColor(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);
    R = Math.min(255, Math.max(0, R + Math.floor(R * percent / 100)));
    G = Math.min(255, Math.max(0, G + Math.floor(G * percent / 100)));
    B = Math.min(255, Math.max(0, B + Math.floor(B * percent / 100)));
    return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

// 保存设置到localStorage
function saveSettings() {
    const selectedColorOption = document.querySelector('.color-option.active');
    if (!selectedColorOption) return;
    const settings = {
        glassBlur: blurSlider.value,
        saturationFactor: saturationSlider.value,
        brightnessFactor: brightnessSlider.value,
        accentColor: selectedColorOption.dataset.color
    };
    localStorage.setItem('dashboardSettings', JSON.stringify(settings));
    updateCSSVariables();
}

// 恢复默认设置
function resetSettings() {
    blurSlider.value = 10;
    saturationSlider.value = 150;
    brightnessSlider.value = 120;
    blurValue.textContent = 10;
    saturationValue.textContent = 150;
    brightnessValue.textContent = 120;
    colorOptions.forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector('.color-option[data-color="#4e6fd8"]').classList.add('active');
    updateCSSVariables();
}

// 加载保存的设置
function loadSettings() {
    const savedSettings = localStorage.getItem('dashboardSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            blurSlider.value = settings.glassBlur || 10;
            saturationSlider.value = settings.saturationFactor || 150;
            brightnessSlider.value = settings.brightnessFactor || 120;
            blurValue.textContent = blurSlider.value;
            saturationValue.textContent = saturationSlider.value;
            brightnessValue.textContent = brightnessSlider.value;
            colorOptions.forEach(option => {
                option.classList.remove('active');
                if (option.dataset.color === settings.accentColor) {
                    option.classList.add('active');
                }
            });
            updateCSSVariables();
        } catch (e) {
            console.error('加载设置失败:', e);
        }
    }
}

// 辅助函数
function formatNum(n) { return n < 10 ? `0${n}` : `${n}`; }
function shineDigit(el) {
    if (!el) return;
    el.classList.remove('digit-shine');
    void el.offsetWidth;
    el.classList.add('digit-shine');
    setTimeout(() => el.classList.remove('digit-shine'), 200);
}
function getRemainingTime() {
    const now = new Date();
    const diffMs = TARGET_DATE - now;
    const safeDiff = diffMs <= 0 ? 0 : diffMs;
    const totalSeconds = Math.floor(safeDiff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds, isExpired: diffMs <= 0 };
}
function updateCountdownUI({ days, hours, minutes, seconds, isExpired }) {
    let dS = formatNum(days), hS = formatNum(hours), mS = formatNum(minutes), sS = formatNum(seconds);
    if (isExpired) { dS = '00'; hS = '00'; mS = '00'; sS = '00'; }
    if (daysEl.innerText !== dS) { daysEl.innerText = dS; if (prevDigits.days !== days && !isExpired) shineDigit(daysEl); }
    if (hoursEl.innerText !== hS) { hoursEl.innerText = hS; if (prevDigits.hours !== hours && !isExpired) shineDigit(hoursEl); }
    if (minutesEl.innerText !== mS) { minutesEl.innerText = mS; if (prevDigits.minutes !== minutes && !isExpired) shineDigit(minutesEl); }
    if (secondsEl.innerText !== sS) { secondsEl.innerText = sS; if (prevDigits.seconds !== seconds && !isExpired) shineDigit(secondsEl); }
    prevDigits = { days, hours, minutes, seconds };
}
const ProgressCalc = {
    getWeekProgress() {
        const now = new Date();
        let daysToMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - daysToMonday);
        monday.setHours(0, 0, 0, 0);
        const elapsed = now - monday;
        const weekProgress = Math.min(100, (elapsed / (7 * 86400000)) * 100);
        return 100 - weekProgress;
    },
    getDayProgress() {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const dayProgress = Math.min(100, ((now - start) / 86400000) * 100);
        return 100 - dayProgress;
    },
    getHourProgress() {
        const now = new Date();
        const hourProgress = Math.min(100, ((now.getMinutes() * 60 + now.getSeconds()) / 3600) * 100);
        return 100 - hourProgress;
    },
    getMinuteProgress() {
        const minuteProgress = Math.min(100, (new Date().getSeconds() / 60) * 100);
        return 100 - minuteProgress;
    }
};
function updateProgressBars() {
    const wp = ProgressCalc.getWeekProgress(), dp = ProgressCalc.getDayProgress(), hp = ProgressCalc.getHourProgress(), mp = ProgressCalc.getMinuteProgress();
    document.getElementById('weekFill').style.width = `${wp}%`;
    document.getElementById('weekPercent').innerText = `${wp.toFixed(1)}%`;
    document.getElementById('dayFill').style.width = `${dp}%`;
    document.getElementById('dayPercent').innerText = `${dp.toFixed(1)}%`;
    document.getElementById('hourFill').style.width = `${hp}%`;
    document.getElementById('hourPercent').innerText = `${hp.toFixed(1)}%`;
    document.getElementById('minuteFill').style.width = `${mp}%`;
    document.getElementById('minutePercent').innerText = `${mp.toFixed(1)}%`;
}
function updateLiveClock() {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    document.getElementById('liveClockDisplay').innerText = `${y}.${m}.${d} ${w} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}
function updateCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    if (timerDisplay) timerDisplay.innerText = `${hours}:${minutes}:${seconds}`;
}
function updateGreetingAndHealth() {
    const now = new Date();
    const hour = now.getHours();
    let icon, text, isLateNight = false;
    if (hour >= 23 || hour < 5) { icon = "[深夜]"; text = "深夜静心，休息为重，积蓄能量。"; isLateNight = true; }
    else if (hour >= 5 && hour < 6) { icon = "[黎明]"; text = "晨光微熹，早起的人儿最耀眼！"; }
    else if (hour >= 6 && hour < 8) { icon = "[清晨]"; text = "一日之计在于晨，大声朗读唤醒大脑！"; }
    else if (hour >= 8 && hour < 11) { icon = "[上午]"; text = "专注力巅峰，攻克理科或背诵重点。"; }
    else if (hour >= 11 && hour < 13) { icon = "[午间]"; text = "午餐营养均衡，小憩15分钟更高效。"; }
    else if (hour >= 13 && hour < 15) { icon = "[午后]"; text = "午后易犯困，起来走动，坚持复习。"; }
    else if (hour >= 15 && hour < 17) { icon = "[下午]"; text = "黄金复习区，冲刺重难点！"; }
    else if (hour >= 17 && hour < 19) { icon = "[傍晚]"; text = "复盘今日收获，放松片刻再出发。"; }
    else if (hour >= 19 && hour < 21) { icon = "[晚间]"; text = "梳理知识框架，效率巅峰时段。"; }
    else { icon = "[自习]"; text = "稳住心态，中考加油！"; }
    greetingIconSpan.innerText = icon;
    greetingTextSpan.innerText = text;
    if (lateNightAlertDiv) {
        if (isLateNight) { lateNightAlertDiv.innerHTML = `[提醒] 已经深夜了，保证睡眠能高效复习呦。`; lateNightAlertDiv.style.display = "flex"; }
        else lateNightAlertDiv.style.display = "none";
    }
}
const sayingsPool = ["乾坤未定，你我皆是黑马。", "每一道错题，都是未来的基石。", "坚持到今天，你已经很棒了！", "新乡少年，提笔为剑，决胜中考。", "再微小的努力，乘以365天都会发光。",
    "你笔下写过的每一个字，都不会辜负你。", "现在的痛，终将变成未来的勋章。", "中考是盛夏的果实，请用汗水浇灌。", "和时间赛跑，你就是赢家。", "星光不问赶路人，时光不负有心人。",
    "心态稳住，你就战胜了一半对手。", "偶尔深呼吸，调整节奏再出发。"
];
let currentSayingIdx = -1;
function randomSaying() {
    let newIdx = Math.floor(Math.random() * sayingsPool.length);
    while (sayingsPool.length > 1 && newIdx === currentSayingIdx) newIdx = Math.floor(Math.random() * sayingsPool.length);
    currentSayingIdx = newIdx;
    return sayingsPool[currentSayingIdx];
}
function refreshSaying() {
    if (sayingElement) {
        sayingElement.innerText = randomSaying();
        sayingElement.classList.add('pulse-stat');
        setTimeout(() => sayingElement.classList.remove('pulse-stat'), 300);
    }
}
function initTheme() {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored === 'dark' || (stored === null && prefersDark);
    if (isDark) {
        document.body.classList.add('dark');
        document.getElementById('themeToggleBtn').innerText = '☀️';
    } else {
        document.body.classList.remove('dark');
        document.getElementById('themeToggleBtn').innerText = '🌙';
    }
}
function toggleTheme() {
    const body = document.body;
    const btn = document.getElementById('themeToggleBtn');
    if (body.classList.contains('dark')) {
        body.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        btn.innerText = '🌙';
    } else {
        body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        btn.innerText = '☀️';
    }
}
function init() {
    sessionStart = Date.now();
    secondTickHandler = setInterval(() => {
        updateCountdownUI(getRemainingTime());
        updateProgressBars();
        updateLiveClock();
        updateCurrentTime();
        updateGreetingAndHealth();
    }, 1000);
    document.getElementById('refreshSayingBtn')?.addEventListener('click', refreshSaying);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const wallpaperBtn = document.getElementById('wallpaperToggleBtn');
    if (wallpaperBtn) wallpaperBtn.addEventListener('click', toggleWallpaper);
    const fullscreenBtn = document.getElementById('fullscreenToggleBtn');
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

    settingsToggleBtn.addEventListener('click', showSettingsPanel);
    closeSettingsBtn.addEventListener('click', hideSettingsPanel);
    saveSettingsBtn.addEventListener('click', saveSettings);
    resetSettingsBtn.addEventListener('click', resetSettings);

    blurSlider.addEventListener('input', function () {
        blurValue.textContent = this.value;
    });
    saturationSlider.addEventListener('input', function () {
        saturationValue.textContent = this.value;
    });
    brightnessSlider.addEventListener('input', function () {
        brightnessValue.textContent = this.value;
    });
    colorOptions.forEach(option => {
        option.addEventListener('click', function () {
            colorOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            updateCSSVariables();
        });
    });

    const savedBgUrl = localStorage.getItem('backgroundImageUrl');
    if (savedBgUrl) {
        document.documentElement.style.setProperty('--wallpaper-url', `url('${savedBgUrl}')`);
        document.body.classList.add('has-wallpaper');
    } else {
        applyRandomBackgroundImage();
    }

    loadSettings();
    refreshSaying();
    initTheme();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();