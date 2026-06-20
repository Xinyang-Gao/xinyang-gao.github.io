// ==================== 数据加载 ====================
let poemsData = [];

// ===== DOM 引用 =====
const navListEl = document.getElementById('navList');
const navMobileDropdown = document.getElementById('navMobileDropdown');
const dynamicCard = document.getElementById('dynamicCard');
let currentId = "hero";

// ===== 移动端导航切换 =====
const navToggle = document.getElementById('navToggle');
const topNav = document.getElementById('topNav');

if (navToggle) {
    navToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = navMobileDropdown.classList.toggle('open');
        navToggle.classList.toggle('active', isOpen);
    });
    document.addEventListener('click', function (e) {
        if (window.innerWidth <= 640) {
            if (navMobileDropdown.classList.contains('open') && !topNav.contains(e.target) && !navMobileDropdown
                .contains(e.target)) {
                navMobileDropdown.classList.remove('open');
                navToggle.classList.remove('active');
            }
        }
    });
}

// ===== 横屏提示 =====
const hint = document.getElementById('rotateHint');
const hintClose = document.getElementById('hintClose');
if (hint && hintClose) {
    function checkMobile() {
        return window.innerWidth <= 640;
    }
    if (checkMobile()) {
        hint.classList.add('show');
        setTimeout(() => {
            hint.classList.add('hiding');
            setTimeout(() => {
                hint.classList.remove('show', 'hiding');
            }, 500);
        }, 5000);
    }
    hintClose.addEventListener('click', function () {
        hint.classList.add('hiding');
        setTimeout(() => {
            hint.classList.remove('show', 'hiding');
        }, 500);
    });
    window.addEventListener('resize', function () {
        if (checkMobile()) {
            if (!hint.classList.contains('show') && !hint.classList.contains('hiding')) {
                hint.classList.add('show');
                setTimeout(() => {
                    hint.classList.add('hiding');
                    setTimeout(() => {
                        hint.classList.remove('show', 'hiding');
                    }, 500);
                }, 5000);
            }
        } else {
            hint.classList.remove('show', 'hiding');
        }
    });
}

// ============================================================
//  判断是否应显示印章（数据驱动）
// ============================================================
function shouldShowSeal(item) {
    return item.showSeal === true;
}

// ============================================================
//  获取上下片分隔位置
// ============================================================
function getDividerIndex(item) {
    const title = item.titleMain || '';
    const lines = item.poemLines || [];
    if (title.includes('鹧鸪天')) {
        const idx = lines.findIndex(line => {
            const clean = line.replace(/[，。、！？\s]/g, '');
            return clean.length <= 6 && line.includes('，');
        });
        if (idx !== -1 && idx < lines.length - 1) return idx + 1;
        return -1;
    }
    if (title.includes('临江仙') && lines.length === 6) return 3;
    if (title.includes('南歌子') && lines.length === 6) return 3;
    return -1;
}

// ============================================================
//  构建竖排内容（返回 HTML 字符串，字符用 span 包裹）
// ============================================================
function buildScrollContent(columns) {
    if (!columns || columns.length === 0) {
        return `<div class="scroll-content" style="padding:2rem;color:#9e8a7a;">暂无内容</div>`;
    }
    let colsHtml = '';
    columns.forEach(col => {
        const type = col.type || 'verse';
        const content = col.content || '';
        const extraClass = col.small ? ' small' : '';
        if (type === 'divider') {
            const beforeCount = col.beforeCount || 0;
            colsHtml += `<div class="verse-column type-divider divider-hidden" data-before-count="${beforeCount}"></div>`;
            return;
        }
        if (type === 'seal') {
            colsHtml += `
                <div class="verse-column type-seal">
                    <img src="${content}" alt="古风印章" />
                </div>
            `;
            return;
        }
        const chars = content.split('');
        const charSpans = chars.map(ch => `<span class="char-span">${ch}</span>`).join('');
        colsHtml += `<div class="verse-column type-${type}${extraClass}">${charSpans}</div>`;
    });
    return `<div class="scroll-content">${colsHtml}</div>`;
}

// ============================================================
//  渲染主函数（含动画控制、打断、已显示标记）
// ============================================================
let exitTimer = null;          // 整体完成定时器（标记已显示 + 印章按压）
let dividerTimers = [];        // 各分割线显示定时器
const alreadyShown = new Set(); // 记录已完整显示过的篇目 id

function renderContent(item) {
    if (!dynamicCard) return;

    // ---- 1. 打断：清除所有正在进行的定时器 ----
    if (exitTimer) clearTimeout(exitTimer);
    dividerTimers.forEach(t => clearTimeout(t));
    dividerTimers = [];

    const id = item.id;
    const columns = [];
    let charCount = 0;   // 累计非分割/印章列的字符总数

    // ---- 标题 ----
    if (item.titleMain && item.titleMain.trim() !== '') {
        columns.push({ type: 'title', content: item.titleMain });
        charCount += item.titleMain.length;
    }
    // ---- 作者 ----
    if (item.teacherName && item.teacherName.trim() !== '') {
        columns.push({ type: 'author', content: item.teacherName });
        charCount += item.teacherName.length;
    }
    if (item.role && item.role.trim() !== '') {
        columns.push({ type: 'author', content: item.role, small: true });
        charCount += item.role.length;
    }

    // ---- 诗句 ----
    const lines = (item.poemLines || []).filter(l => l.trim() !== '');
    const dividerIdx = getDividerIndex(item);

    lines.forEach((line, idx) => {
        if (dividerIdx !== -1 && idx === dividerIdx) {
            // 插入分割线，记录当前已累计的字符数
            columns.push({ type: 'divider', content: '', beforeCount: charCount });
            // 分割线本身不增加字符计数
        }
        columns.push({ type: 'verse', content: line });
        charCount += line.length;
    });

    // ---- 注释 ----
    if (item.annotation && item.annotation.trim() !== '') {
        columns.push({ type: 'annotation', content: item.annotation });
        charCount += item.annotation.length;
    }
    if (item.extraNote && item.extraNote.trim() !== '') {
        columns.push({ type: 'annotation', content: item.extraNote });
        charCount += item.extraNote.length;
    }

    // ---- 落款 ----
    const signature = item.signature || '—— 高新炀 敬赠';
    columns.push({ type: 'signature', content: signature });
    charCount += signature.length;

    // ---- 印章 ----
    if (shouldShowSeal(item)) {
        columns.push({ type: 'seal', content: 'LOGO.png' });
        // 印章不计入字符数
    }

    // ---- 生成 HTML ----
    const html = buildScrollContent(columns);
    dynamicCard.innerHTML = html;
    const scrollContent = dynamicCard.querySelector('.scroll-content');
    if (!scrollContent) return;

    // ---- 2. 判断是否已显示过 ----
    if (alreadyShown.has(id)) {
        // 已显示过：无动画，直接显示所有内容
        scrollContent.classList.add('no-anim');

        // 显示分割线
        scrollContent.querySelectorAll('.verse-column.type-divider').forEach(el => {
            el.classList.add('divider-visible');
            el.classList.remove('divider-hidden');
        });

        // 显示印章（移除按压类，直接可见）
        const sealImg = scrollContent.querySelector('.verse-column.type-seal img');
        if (sealImg) {
            sealImg.style.opacity = '1';
            sealImg.classList.remove('press');
        }

        return;
    }

    // ---- 3. 首次显示：应用非线性字符动画 ----
    const chars = scrollContent.querySelectorAll('.char-span');
    const total = chars.length;
    const linearStep = 0.020;      // 可调：每字符基础间隔
    const quadStep = 0.0005;       // 可调：二次缓动系数
    chars.forEach((span, idx) => {
        const delay = idx * linearStep + idx * idx * quadStep;
        span.style.animationDelay = delay + 's';
    });

    // 计算最大延迟
    let maxDelay = 0;
    if (total > 0) {
        const lastIdx = total - 1;
        maxDelay = lastIdx * linearStep + lastIdx * lastIdx * quadStep + 1 ;
    }
    const animDuration = 0.3;      // 同时缩短单字淡入时间
    const totalTime = maxDelay + animDuration;

    // ---- 4. 整体完成定时器：标记已显示 + 印章按压 ----
    exitTimer = setTimeout(() => {
        alreadyShown.add(id);

        // 印章按压动画
        const sealImg = scrollContent.querySelector('.verse-column.type-seal img');
        if (sealImg) {
            sealImg.classList.add('press');
        }
        exitTimer = null;
    }, totalTime * 1000 + 100);

    // ---- 5. 分割线逐列显现 ----
    const dividers = scrollContent.querySelectorAll('.verse-column.type-divider');
    dividers.forEach(divEl => {
        const beforeCount = parseInt(divEl.dataset.beforeCount, 10);
        let delay = 0;
        if (beforeCount > 0) {
            const idx = beforeCount - 1;                // 该分割线前的最后一个字符索引
            delay = idx * 0.035 + idx * idx * 0.001 + animDuration;
        }
        const timer = setTimeout(() => {
            divEl.classList.add('divider-visible');
            divEl.classList.remove('divider-hidden');
        }, delay * 1000 + 50);
        dividerTimers.push(timer);
    });
}

// ============================================================
//  数据查询 & 导航构建
// ============================================================
function getItemById(id) {
    return poemsData.find(p => p.id === id) || null;
}

function createNavItem(id, label) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-id', id);
    btn.innerText = label;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentId === id) return;
        currentId = id;
        setActive(id);
        const target = getItemById(id);
        if (target) renderContent(target);
        else renderContent(poemsData[0]);
        const wrapper = document.getElementById('scrollWrapper');
        if (wrapper) wrapper.scrollLeft = 0;
        if (window.innerWidth <= 640) {
            navMobileDropdown.classList.remove('open');
            navToggle.classList.remove('active');
        }
    });
    li.appendChild(btn);
    return li;
}

function buildNavigation() {
    navListEl.innerHTML = '';
    const hero = poemsData.find(p => p.id === "hero");
    if (hero) {
        navListEl.appendChild(createNavItem(hero.id, hero.navLabel));
    }
    poemsData.filter(p => p.id !== "hero").forEach(item => {
        navListEl.appendChild(createNavItem(item.id, item.navLabel));
    });
    setActive(currentId);

    navMobileDropdown.innerHTML = '';
    poemsData.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.setAttribute('data-id', item.id);
        btn.innerText = item.navLabel;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentId === item.id) {
                navMobileDropdown.classList.remove('open');
                navToggle.classList.remove('active');
                return;
            }
            currentId = item.id;
            setActive(item.id);
            const target = getItemById(item.id);
            if (target) renderContent(target);
            else renderContent(poemsData[0]);
            const wrapper = document.getElementById('scrollWrapper');
            if (wrapper) wrapper.scrollLeft = 0;
            navMobileDropdown.classList.remove('open');
            navToggle.classList.remove('active');
        });
        navMobileDropdown.appendChild(btn);
    });
    setActive(currentId);
}

function setActive(activeId) {
    document.querySelectorAll('#navList .nav-btn').forEach(btn => {
        const id = btn.getAttribute('data-id');
        btn.classList.toggle('active', id === activeId);
    });
    document.querySelectorAll('#navMobileDropdown .nav-btn').forEach(btn => {
        const id = btn.getAttribute('data-id');
        btn.classList.toggle('active', id === activeId);
    });
}

// ============================================================
//  初始化
// ============================================================
function init() {
    fetch('data.json')
        .then(response => {
            if (!response.ok) throw new Error('无法加载数据文件');
            return response.json();
        })
        .then(data => {
            poemsData = data;
            buildNavigation();
            const heroData = getItemById("hero");
            renderContent(heroData);
            currentId = "hero";
            setActive("hero");
            const wrapper = document.getElementById('scrollWrapper');
            if (wrapper) wrapper.scrollLeft = 0;
        })
        .catch(error => {
            console.error('加载诗词数据失败:', error);
            dynamicCard.innerHTML =
                `<div class="scroll-content" style="padding:2rem;color:#9e8a7a;">数据加载失败，请检查 data.json 文件是否存在。</div>`;
        });
}

init();
window.addEventListener('resize', () => { });