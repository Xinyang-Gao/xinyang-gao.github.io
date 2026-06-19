// ==================== 完整诗词数据 ====================
const poemsData = [
    {
        id: "hero",
        navLabel: "首页 · 长念",
        type: "hero",
        title: "青春致意",
        sub: "毕业季 · 敬献恩师与同窗",
        heroContent: true
    },
    {
        id: "shi_zhenping",
        navLabel: "史镇萍 老师",
        teacherName: "史镇萍老师",
        role: "英语老师 · 班主任",
        titleMain: "师恩咏",
        poemLines: [
            "史笔殷勤记岁年，",
            "镇日躬耕桃李前。",
            "萍影初逢秋月圆，",
            "恩波浩荡润心泉。",
            "师门初掌志犹坚，",
            "严规偶震似惊弦。",
            "慈语频传如暖烟，",
            "相陪三载共书篇。",
            "济世何须八百言，",
            "润物无声夜雨绵。",
            "无言桃李自芳妍，",
            "声绕杏梁忆昔年。",
        ],
        annotation: "NULL:JSON_annotation",
        extraNote: "NULL:JSON_extraNote"
    },
    {
        id: "song_meilian",
        navLabel: "宋玫莲 老师",
        teacherName: "宋玫莲老师",
        role: "语文老师",
        titleMain: "鹧鸪天·赠宋玫莲老师",
        poemLines: [
            "宋雨无声润杏坛，玫魂一缕落毫端。",
            "莲心不染尘中垢，烛泪长明夜未阑。",
            "传汉赋，解楚兰，春秋笔墨写悲欢。",
            "三年立雪程门外，回首春风满故山。"
        ],
        annotation: "NULL:JSON_annotation",
        extraNote: "NULL:JSON_extraNote"
    },
    {
        id: "lyu_hui",
        navLabel: "吕辉 老师",
        teacherName: "吕辉老师",
        role: "数学老师",
        titleMain: "鹧鸪天·谢吕辉老师",
        poemLines: [
            "吕师授业解玄机，两载春秋未肯迟。",
            "心疾虽缠犹奋力，暮年守坛不言疲。",
            "辉渐隐，爱难移。",
            "纵然半路辞君去，基石深埋已稳基。",
            "且看桃李自成蹊。"
        ],
        annotation: "NULL:JSON_annotation",
        extraNote: "NULL:JSON_extraNote"
    },
    {
        id: "zhang_cuiping",
        navLabel: "张翠萍 老师",
        teacherName: "张翠萍老师",
        role: "九年级数学老师",
        titleMain: "临江仙·赠张翠萍老师",
        poemLines: [
            "张袖拂开迷雾，翠枝垂下浓阴。",
            "萍踪常伴数形深。",
            "卷间朱笔暖，灯下墨痕深。",
            "巧语解开心锁，难题化做微吟。",
            "细心批改到宵沉。",
            "不言桃李满，但记此时心。"
        ],
        annotation: "NULL:JSON_annotation",
        extraNote: "NULL:JSON_extraNote"
    },
    {
        id: "chen_gang",
        navLabel: "陈刚 老师",
        teacherName: "陈刚老师",
        role: "地理老师 · 安全办主任",
        titleMain: "南歌子·赠陈刚老师",
        poemLines: [
            "陈说山河趣，板书天地宽。",
            "一腔幽默解千难。",
            "笑语满堂飞过、万重山。",
            "刚柔皆妙语，安全系两端。",
            "课时生动不曾闲。",
            "最喜此间活跃、似春澜。"
        ],
        annotation: "NULL:JSON_annotation",
        extraNote: "笑声满堂，知识常新。"
    },
    {
        id: "other_teacher_placeholder",
        navLabel: "未完待续",
        type: "placeholder",
        teacherName: "NULL:JSON_teacherName",
        role: "NULL:JSON_role",
        titleMain: "NULL:JSON_titleMain",
        poemLines: [ "未完待续" ],
        annotation: "NULL:JSON_annotation",
        extraNote: "NULL:JSON_extraNote"
    },
    {
        id: "classmates",
        navLabel: "同学",
        type: "classmate",
        teacherName: "致 六班每一个同学",
        role: "NULL:JSON_role",
        titleMain: "NULL:JSON_titleMain",
        poemLines: [ "给每个同学写一首诗，未完成喵" ],
        annotation: "感谢彼此陪伴，愿前程似锦，友谊常青。",
        extraNote: "毕业不是终点，是星河的起点。"
    }
];

// DOM 引用
const navListEl = document.getElementById('navList');
const dynamicCard = document.getElementById('dynamicCard');
let currentId = "hero";

// ===== 移动端导航切换 =====
const navToggle = document.getElementById('navToggle');
const navSidebar = document.getElementById('navSidebar');
if (navToggle && navSidebar) {
    navToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        navSidebar.classList.toggle('expanded');
        navToggle.classList.toggle('active');
    });
    // 点击外部可关闭（可选）
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 640 && navSidebar.classList.contains('expanded')) {
            if (!navSidebar.contains(e.target)) {
                navSidebar.classList.remove('expanded');
                navToggle.classList.remove('active');
            }
        }
    });
}

// ===== 横屏提示关闭 =====
const hint = document.getElementById('rotateHint');
const hintClose = document.getElementById('hintClose');
if (hint && hintClose) {
    // 检测是否为移动端（宽度小于640px且可能竖屏）
    function checkMobile() {
        return window.innerWidth <= 640;
    }
    if (checkMobile()) {
        hint.classList.add('show');
        // 5秒后自动淡出
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
    // 窗口变化时重新判断（横竖屏切换）
    window.addEventListener('resize', function() {
        if (checkMobile()) {
            if (!hint.classList.contains('show') && !hint.classList.contains('hiding')) {
                hint.classList.add('show');
                // 重新计时
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
//  判断是否应显示印章（排除占位和同学页面）
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
//  获取上下片分隔位置（用于词牌）
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
//  构建竖排内容（返回纯内容 HTML，无卡片包裹）
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
//  渲染主函数 — 全部竖排，直接显示在背景上
// ============================================================
function renderContent(item) {
    if (!dynamicCard) return;

    // ----- Hero 全屏竖排 -----
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

    // ----- 普通诗词 / 占位 / 同学 -----
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
}

function createNavItem(id, label) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-id', id);
    const span = document.createElement('span');
    span.innerText = label;
    btn.appendChild(span);
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
        // 移动端点击后自动收起导航
        if (window.innerWidth <= 640 && navSidebar.classList.contains('expanded')) {
            navSidebar.classList.remove('expanded');
            navToggle.classList.remove('active');
        }
    });
    li.appendChild(btn);
    return li;
}

function setActive(activeId) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const id = btn.getAttribute('data-id');
        btn.classList.toggle('active', id === activeId);
    });
}

// ============================================================
//  初始化
// ============================================================
function init() {
    buildNavigation();
    const heroData = getItemById("hero");
    renderContent(heroData);
    currentId = "hero";
    setActive("hero");
    const wrapper = document.getElementById('scrollWrapper');
    if (wrapper) wrapper.scrollLeft = 0;
}

// 启动
init();

// 窗口resize时保持滚动位置
window.addEventListener('resize', () => {});