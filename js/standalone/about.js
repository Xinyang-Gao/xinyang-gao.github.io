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
    levelDisplay.textContent = 'LV.' + age;
    titleDisplay.textContent = title;

    const startBday = getStartBirthday(BIRTHDAY);
    const nextBday = getNextBirthday(BIRTHDAY);
    const totalMs = nextBday.getTime() - startBday.getTime();
    const elapsedMs = now.getTime() - startBday.getTime();
    const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

    expFill.style.width = progress + '%';
    expPercent.textContent = Math.floor(progress) + '%';

    const totalXp = Math.floor(totalMs / 60000);
    const earnedXp = Math.floor(elapsedMs / 60000);
    expEarnedDisplay.textContent = earnedXp.toLocaleString();
    expTotalDisplay.textContent = totalXp.toLocaleString();

    const dateStr = nextBday.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    nextLevelInfo.innerHTML = `<i class="fas fa-info-circle"></i> 下一级解锁: ${dateStr}`;

    const uptimeMs = now.getTime() - BIRTHDAY.getTime();
    const uptimeHours = Math.floor(uptimeMs / 3600000);
    uptimeDisplay.textContent = uptimeHours.toLocaleString() + ' 小时';
}

function scheduleUpdate() {
    const delay = 5000 + Math.random() * 10000;
    setTimeout(() => {
        updateUI();
        scheduleUpdate();
    }, delay);
}

// ---------- 翻转卡片 ----------
let flipAbortController = null;
let resizeTimer = null;

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

// ---------- 评论 ----------
function initComments() {
    const container = document.getElementById('twikoo-comments');
    if (container) {
        destroyTwikoo(container);
        initTwikoo(container).catch(console.warn);
    }
}

// ---------- 页面初始化 ----------
function initAboutPage() {
    initFlipCard();
    initComments();
}

// ---------- 启动 ----------
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    updateUI();
    scheduleUpdate();
    initAboutPage();
} else {
    document.addEventListener('DOMContentLoaded', function () {
        updateUI();
        scheduleUpdate();
        initAboutPage();
    });
}

// 监听 AJAX 导航（无刷新切换页面）
window.addEventListener('ajax:navigation', function (e) {
    if (e.detail && e.detail.page === 'about') {
        initFlipCard();
        initComments();
    }
});

// 暴露高度更新函数方便调试（可选）
window.updateFlipHeight = updateFlipHeight;