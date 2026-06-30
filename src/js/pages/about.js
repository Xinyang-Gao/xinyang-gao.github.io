// /js/pages/about.js
import { initTwikoo, destroyTwikoo } from '/js/core/twikoo-manager.js';

// ---------- 配置 ----------
const BIRTHDAY = new Date(2010, 11, 21);

// DOM 引用
const levelDisplay = document.getElementById('levelDisplay');
const titleDisplay = document.getElementById('titleDisplay');
const expFill = document.getElementById('expFill');
const expPercent = document.getElementById('expPercent');
const expEarnedDisplay = document.getElementById('expEarnedDisplay');
const expTotalDisplay = document.getElementById('expTotalDisplay');
const uptimeDisplay = document.getElementById('uptimeDisplay');
const nextLevelInfo = document.getElementById('nextLevelInfo');

// ---------- 定时器管理 ----------
let updateTimer = null;          // 经验值更新定时器
let flipAbortController = null;  // 翻转卡片事件控制器
let resizeTimer = null;          // 窗口 resize 防抖

// ---------- 辅助函数 ----------
function getAge(birthday) {
    const now = new Date();
    let age = now.getFullYear() - birthday.getFullYear();
    const m = now.getMonth() - birthday.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthday.getDate())) {
        age--;
    }
    return age;
}

function getTitle(age) {
    if (age < 12) return '小萌新';
    if (age < 14) return '见习勇者';
    if (age < 16) return '勇者学徒';
    if (age < 18) return '初级勇者';
    if (age < 22) return '中级勇者';
    return '传奇勇者';
}

function getThisYearBirthday(birthday) {
    const now = new Date();
    const year = now.getFullYear();
    return new Date(year, birthday.getMonth(), birthday.getDate());
}

function getNextBirthday(birthday) {
    const now = new Date();
    const thisYear = getThisYearBirthday(birthday);
    if (thisYear > now) {
        return thisYear;
    } else {
        return new Date(now.getFullYear() + 1, birthday.getMonth(), birthday.getDate());
    }
}

function getStartBirthday(birthday) {
    const now = new Date();
    const thisYear = getThisYearBirthday(birthday);
    if (thisYear <= now) {
        return thisYear;
    } else {
        return new Date(now.getFullYear() - 1, birthday.getMonth(), birthday.getDate());
    }
}

// ---------- UI 更新 ----------
function updateUI() {
    const now = new Date();
    const age = getAge(BIRTHDAY);
    const title = getTitle(age);
    if (levelDisplay) levelDisplay.textContent = 'LV.' + age;
    if (titleDisplay) titleDisplay.textContent = title;

    const startBday = getStartBirthday(BIRTHDAY);
    const nextBday = getNextBirthday(BIRTHDAY);
    const totalMs = nextBday.getTime() - startBday.getTime();
    const elapsedMs = now.getTime() - startBday.getTime();
    const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

    if (expFill) expFill.style.width = progress + '%';
    if (expPercent) expPercent.textContent = Math.floor(progress) + '%';

    const totalXp = Math.floor(totalMs / 60000);
    const earnedXp = Math.floor(elapsedMs / 60000);
    if (expEarnedDisplay) expEarnedDisplay.textContent = earnedXp.toLocaleString();
    if (expTotalDisplay) expTotalDisplay.textContent = totalXp.toLocaleString();

    const dateStr = nextBday.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    if (nextLevelInfo) {
        nextLevelInfo.innerHTML = `<i class="fas fa-info-circle"></i> 下一级解锁: ${dateStr}`;
    }

    const uptimeMs = now.getTime() - BIRTHDAY.getTime();
    const uptimeHours = Math.floor(uptimeMs / 3600000);
    if (uptimeDisplay) uptimeDisplay.textContent = uptimeHours.toLocaleString() + ' 小时';
}

function scheduleUpdate() {
    clearTimeout(updateTimer);
    const delay = 5000 + Math.random() * 10000;
    updateTimer = setTimeout(() => {
        updateUI();
        scheduleUpdate();
    }, delay);
}

// ---------- 翻转卡片 ----------
function initFlipCard() {
    // 取消旧的监听
    if (flipAbortController) {
        flipAbortController.abort();
        flipAbortController = null;
    }
    const controller = new AbortController();
    flipAbortController = controller;

    const flipBtn = document.getElementById('flipCardBtn');
    const flipCard = document.getElementById('aboutFlipCard');
    const flipBtnLabel = document.getElementById('flipBtnLabel');
    if (!flipBtn || !flipCard) return;

    flipBtn.addEventListener('click', function () {
        const isFlipped = flipCard.classList.toggle('flipped');
        if (flipBtnLabel) {
            flipBtnLabel.textContent = isFlipped ? '翻转卡片 · 回到主页' : '翻转卡片 · 查看关于我';
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
            setTimeout(updateFlipHeight, 80);
        });
    }, { signal: controller.signal });

    flipCard.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'transform' || e.propertyName === 'min-height') {
            updateFlipHeight();
        }
    }, { signal: controller.signal });

    // 重置 resize 监听
    if (resizeTimer) clearTimeout(resizeTimer);
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateFlipHeight, 150);
    }, { signal: controller.signal });

    // 初始化高度
    setTimeout(updateFlipHeight, 200);
}

function updateFlipHeight() {
    const flipCard = document.getElementById('aboutFlipCard');
    const inner = flipCard?.querySelector('.flip-card-inner');
    const front = flipCard?.querySelector('.flip-card-front');
    const back = flipCard?.querySelector('.flip-card-back');
    if (!inner || !front || !back) return;
    inner.style.height = 'auto';
    let targetHeight;
    if (flipCard.classList.contains('flipped')) {
        targetHeight = back.scrollHeight;
    } else {
        targetHeight = front.scrollHeight;
    }
    if (targetHeight > 0) {
        const finalHeight = targetHeight + 4;
        inner.style.height = finalHeight + 'px';
        flipCard.style.minHeight = finalHeight + 'px';
    }
}

// ---------- 评论 ----------
function initComments() {
    const container = document.getElementById('twikoo-comments');
    if (container) {
        destroyTwikoo(container);   // 清除旧初始化标记
        initTwikoo(container).catch(console.warn);
    }
}

// ---------- GitHub 贡献图 ----------
function initGithubContrib() {
    const ghContainer = document.getElementById('gh');
    if (ghContainer && typeof window.GhContribGraph !== 'undefined') {
        try {
            // 有些库会自动初始化，但无刷新后需要重新调用
            window.GhContribGraph.init();
            console.log('[About] GitHub 贡献图已重新初始化');
        } catch (e) {
            console.warn('[About] GitHub 贡献图初始化失败:', e);
        }
    }
}

// ---------- 导出初始化函数（供路由调用） ----------
export function initAboutPage() {
    // 清除旧定时器
    clearTimeout(updateTimer);
    // 更新 UI
    updateUI();
    scheduleUpdate();
    // 翻转卡片
    initFlipCard();
    // 评论
    initComments();
    // GitHub 贡献图
    initGithubContrib();
}

// ---------- 直接加载页面（非 SPA）时自动初始化 ----------
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initAboutPage();
} else {
    document.addEventListener('DOMContentLoaded', initAboutPage);
}

// 暴露高度更新函数（调试用）
window.updateFlipHeight = updateFlipHeight;