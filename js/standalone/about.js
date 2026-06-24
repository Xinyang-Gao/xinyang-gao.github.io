(function () {
    'use strict';

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

        // 计算经验值（单位：分钟）
        const totalXp = Math.floor(totalMs / 60000);
        const earnedXp = Math.floor(elapsedMs / 60000);

        // 更新已有 / 总计 XP
        expEarnedDisplay.textContent = earnedXp.toLocaleString();
        expTotalDisplay.textContent = totalXp.toLocaleString();

        // 下一级日期
        const dateStr = nextBday.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        nextLevelInfo.innerHTML = `<i class="fas fa-info-circle"></i> 下一级解锁: ${dateStr}`;

        // 在线时长
        const uptimeMs = now.getTime() - BIRTHDAY.getTime();
        const uptimeHours = Math.floor(uptimeMs / 3600000);
        uptimeDisplay.textContent = uptimeHours.toLocaleString() + ' 小时';
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

(function initFlipCard() {
    const flipBtn = document.getElementById('flipCardBtn');
    const flipCard = document.getElementById('aboutFlipCard');
    const flipBtnLabel = document.getElementById('flipBtnLabel');

    if (!flipBtn || !flipCard) return;

    // 更新卡片高度，适配当前可见面
    function updateFlipHeight() {
        const inner = flipCard.querySelector('.flip-card-inner');
        const front = flipCard.querySelector('.flip-card-front');
        const back = flipCard.querySelector('.flip-card-back');
        if (!inner || !front || !back) return;

        // 临时重置高度，获取真实 scrollHeight
        inner.style.height = 'auto';

        let targetHeight;
        if (flipCard.classList.contains('flipped')) {
            targetHeight = back.scrollHeight;
        } else {
            targetHeight = front.scrollHeight;
        }

        // 加上 2px 余量防止滚动条闪动
        if (targetHeight > 0) {
            const finalHeight = targetHeight + 4;
            inner.style.height = finalHeight + 'px';
            flipCard.style.minHeight = finalHeight + 'px';
        }
    }

    // 翻转点击事件
    flipBtn.addEventListener('click', function () {
        const isFlipped = flipCard.classList.toggle('flipped');

        // 更新按钮文字
        if (flipBtnLabel) {
            flipBtnLabel.textContent = isFlipped ? '翻转卡片 · 回到主页' : '翻转卡片 · 查看关于我';
        }

        window.scrollTo({
            top: 0,
            behavior: 'smooth'  // 平滑滚动
        });

        // 延迟执行高度更新，让浏览器先应用旋转样式
        requestAnimationFrame(() => {
            // 等待过渡启动
            setTimeout(updateFlipHeight, 80);
        });
    });

    // 监听过渡结束，微调高度
    flipCard.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'transform' || e.propertyName === 'min-height') {
            updateFlipHeight();
        }
    });

    // 窗口大小变化时重新计算高度
    let resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateFlipHeight, 150);
    });

    // 页面完全加载后初始化高度（确保所有图片/字体加载完毕）
    if (document.readyState === 'complete') {
        setTimeout(updateFlipHeight, 200);
    } else {
        window.addEventListener('load', function () {
            setTimeout(updateFlipHeight, 300);
        });
    }

    // DOM 内容加载完后也执行一次
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(updateFlipHeight, 100);
        });
    } else {
        setTimeout(updateFlipHeight, 100);
    }

    // 暴露方法给控制台调试（可选）
    window.updateFlipHeight = updateFlipHeight;
})();