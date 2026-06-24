(function () {
    'use strict';

    // ---------- 配置 ----------
    const BIRTHDAY = new Date(2010, 11, 21); // 2010年12月21日

    // DOM 引用
    const levelDisplay = document.getElementById('levelDisplay');
    const titleDisplay = document.getElementById('titleDisplay');
    const expFill = document.getElementById('expFill');
    const expPercent = document.getElementById('expPercent');
    const xpValue = document.getElementById('xpValue');
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
        const bday = new Date(year, birthday.getMonth(), birthday.getDate());
        return bday;
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
        let progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

        expFill.style.width = progress + '%';
        expPercent.textContent = Math.floor(progress) + '%';

        const remainingMs = nextBday.getTime() - now.getTime();
        const xp = Math.floor(remainingMs / 60000);
        xpValue.textContent = xp.toLocaleString();

        const dateStr = nextBday.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        nextLevelInfo.innerHTML = `<i class="fas fa-info-circle"></i> 下一级解锁: ${dateStr}`;

        const uptimeMs = now.getTime() - BIRTHDAY.getTime();
        const uptimeHours = Math.floor(uptimeMs / 3600000);
        uptimeDisplay.textContent = uptimeHours.toLocaleString() + ' 小时' + ' h';
    }

    // ---------- 随机间隔更新 (5-15秒) ----------
    function scheduleUpdate() {
        const delay = 5000 + Math.random() * 10000;
        setTimeout(() => {
            updateUI();
            scheduleUpdate();
        }, delay);
    }

    // ---------- 启动 ----------
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        updateUI();
        scheduleUpdate();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            updateUI();
            scheduleUpdate();
        });
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            updateUI();
        }
    });

})();