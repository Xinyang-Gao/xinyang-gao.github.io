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
    navToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = navMobileDropdown.classList.toggle('open');
        navToggle.classList.toggle('active', isOpen);
    });
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 640) {
            if (navMobileDropdown.classList.contains('open') && !topNav.contains(e.target) && !navMobileDropdown.contains(e.target)) {
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
    hintClose.addEventListener('click', function() {
        hint.classList.add('hiding');
        setTimeout(() => {
            hint.classList.remove('show', 'hiding');
        }, 500);
    });
    window.addEventListener('resize', function() {
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
//  判断是否应显示印章
// ============================================================
function shouldShowSeal(item) {
    if (!item) return false;
    if (item.id === "hero") return true;
    if (item.type === "placeholder" || item.id === "other_teacher_placeholder") return false;
    if (item.type === "classmate" || item.id === "classmates") return false;
    const lines = item.poemLines || [];
    if (lines.length === 0) return false;
    const first = lines[0] || '';
    if (first.includes("未完待续") || first.includes("未完成喵")) return false;
    return true;
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
//  构建竖排内容
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
            colsHtml += `<div class="verse-column type-divider"></div>`;
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
        const safeContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        colsHtml += `<div class="verse-column type-${type}${extraClass}">${safeContent}</div>`;
    });
    return `<div class="scroll-content">${colsHtml}</div>`;
}

// ============================================================
//  渲染主函数
// ============================================================
function renderContent(item) {
    if (!dynamicCard) return;

    if (item.type === "hero" || item.id === "hero") {
        const heroColumns = [
            { type: 'hero-title', content: '师恩长 · 行远思源' },
            { type: 'hero-sub', content: '献给每一位照亮前路的恩师与同窗' },
            { type: 'hero-body', content: '三载春秋，笔墨书不尽谆谆教诲；数度晨昏，背影承无数殷殷目光。' },
            { type: 'hero-body', content: '老师，是您引我们穿越迷雾，以知识与爱陪伴成长。' },
            { type: 'hero-body', content: '今当毕业，将心中感激化作拙词数阙，嵌名入句，愿情谊留驻。' },
            { type: 'hero-body', content: '窗外梧桐已亭亭，师恩似海永长存。左侧名录，敬呈诸位恩师；同窗篇章，亦为青春见证。' },
            { type: 'hero-sign', content: '—— 九年级学子 敬上' }
        ];
        if (shouldShowSeal(item)) {
            heroColumns.push({ type: 'seal', content: 'LOGO.png' });
        }
        dynamicCard.innerHTML = buildScrollContent(heroColumns);
        return;
    }

    const columns = [];
    let titleDisplay = item.titleMain;
    if (!titleDisplay && item.id === "classmates") titleDisplay = "致同窗";
    if (!titleDisplay && item.id === "other_teacher_placeholder") titleDisplay = "师恩未歇";
    if (titleDisplay && titleDisplay !== "NULL:JSON_titleMain") {
        columns.push({ type: 'title', content: titleDisplay });
    }
    if (item.teacherName && item.teacherName !== "NULL:JSON_teacherName") {
        columns.push({ type: 'author', content: item.teacherName });
    }
    if (item.role && item.role !== "NULL:JSON_role") {
        columns.push({ type: 'author', content: item.role, small: true });
    }

    const lines = (item.poemLines || []).filter(l => l.trim() !== '');
    const dividerIdx = getDividerIndex(item);

    lines.forEach((line, idx) => {
        if (dividerIdx !== -1 && idx === dividerIdx) {
            columns.push({ type: 'divider', content: '' });
        }
        columns.push({ type: 'verse', content: line });
    });

    const annotation = item.annotation && item.annotation !== "NULL:JSON_annotation" ? item.annotation : null;
    const extraNote = item.extraNote && item.extraNote !== "NULL:JSON_extraNote" ? item.extraNote : null;
    if (annotation) {
        columns.push({ type: 'annotation', content: annotation });
    }
    if (extraNote && !annotation) {
        columns.push({ type: 'annotation', content: extraNote });
    } else if (extraNote && annotation) {
        columns.push({ type: 'annotation', content: extraNote });
    }

    columns.push({ type: 'signature', content: '—— 高新炀 敬赠' });

    if (shouldShowSeal(item)) {
        columns.push({ type: 'seal', content: 'LOGO.png' });
    }

    dynamicCard.innerHTML = buildScrollContent(columns);
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
//  初始化：从外部 JSON 加载数据
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
            // 显示错误提示
            dynamicCard.innerHTML = `<div class="scroll-content" style="padding:2rem;color:#9e8a7a;">数据加载失败，请检查 data.json 文件是否存在。</div>`;
        });
}

// 启动
init();

// 窗口resize时保持滚动位置
window.addEventListener('resize', () => {});