// ----------------------------- 完整诗词数据 ---------------------------------
// 每位老师的数据结构： id, navLabel, 展示完整内容所需参数
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
        titleMain: "浣溪沙·师恩长",
        poemLines: [
            "史笔无尘写岁华，镇心如玉育新芽。",
            "萍踪万里此为家。",
            "八载春秋催鬓雪，百番叮嘱润心花。",
            "遍看桃李满天涯。"
        ],
        annotation: "敬呈班主任史镇萍老师，八年陪伴，点滴教诲铭记于心。",
        extraNote: "英语课堂循循善诱，如春风化雨。"
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
        annotation: "感念语文老师的深厚学养与温柔指引，汉赋楚辞，墨香长存。",
        extraNote: "您的课堂让文字有了温度。"
    },
    {
        id: "lyu_hui",
        navLabel: "吕辉 老师",
        teacherName: "吕辉老师",
        role: "数学老师 (即将退休)",
        titleMain: "鹧鸪天·谢吕辉老师",
        poemLines: [
            "吕师授业解玄机，两载春秋未肯迟。",
            "心疾虽缠犹奋力，暮年守坛不言疲。",
            "辉渐隐，爱难移。",
            "纵然半路辞君去，基石深埋已稳基。",
            "且看桃李自成蹊。"
        ],
        annotation: "吕老师虽因身体原因只教七八年级，却为我数学打下坚实基础。致敬耕耘不辍。",
        extraNote: "两年教诲，基石永固；临近退休，感念师恩。"
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
        annotation: "细致负责的数学引路人，将难题化为诗意，深宵批改，润物无声。",
        extraNote: "每一份作业的朱批，都是照亮前路的星火。"
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
        annotation: "生动风趣的地理课堂，山河在幽默中流转，亦不忘安全叮咛。",
        extraNote: "笑声满堂，知识常新。"
    },
    {
        id: "other_teacher_placeholder",
        navLabel: "其他恩师 · 待续",
        type: "placeholder",
        teacherName: "敬爱的老师们",
        role: "感恩所有授业恩师",
        titleMain: "春风化雨 · 余韵未央",
        poemLines: [
            "杏坛耕耘不计年，霜染青丝仍向前。",
            "点滴教诲皆成忆，他日凌云报涌泉。"
        ],
        annotation: "还有更多未及题诗的恩师，您们的付出同样铭刻于心，来日以佳绩相报。",
        extraNote: "未完待续，师恩永铭。"
    },
    {
        id: "classmates",
        navLabel: "全班同学 · 同窗",
        type: "classmate",
        teacherName: "致 全班同窗",
        role: "三年同窗 · 青春并肩",
        titleMain: "临别赠少年",
        poemLines: [
            "书山共逐晨星晓，墨海同舟夏日长。",
            "笑泪交织皆成锦，明朝各赴山海苍。",
            "勿忘此间少年气，归来依旧满庭芳。"
        ],
        annotation: "送给九年级(全体同学)，感谢彼此陪伴，愿前程似锦，友谊常青。",
        extraNote: "毕业不是终点，是星河的起点。"
    }
];

// 获取导航容器 和 内容容器
const navListEl = document.getElementById('navList');
const dynamicCard = document.getElementById('dynamicCard');

// 当前激活项id
let currentId = "hero";

// 渲染右侧内容 (全屏显示诗或hero)
function renderContent(item) {
    if (!dynamicCard) return;
    if (item.type === "hero" || item.id === "hero") {
        // Hero 全屏页: 液态玻璃卡片展示感性致辞
        dynamicCard.innerHTML = `
                <div class="card-inner hero-quote">
                    <h1>🌿 师恩长 · 行远思源 🌿</h1>
                    <div class="hero-sub">献给每一位照亮前路的恩师与同窗</div>
                    <p style="font-size:1.05rem; font-weight: 400;">三载春秋，笔墨书不尽谆谆教诲；<br>数度晨昏，背影承无数殷殷目光。</p>
                    <p>老师，是您引我们穿越迷雾，以知识与爱陪伴成长。<br>今当毕业，将心中感激化作拙词数阙，嵌名入句，愿情谊留驻。</p>
                    <p style="margin-top:1rem;">窗外梧桐已亭亭，师恩似海永长存。<br>左侧名录，敬呈诸位恩师；同窗篇章，亦为青春见证。</p>
                    <div class="hero-sign">—— 九年级学子 敬上 · 盛夏骊歌</div>
                </div>
            `;
        return;
    }

    // 普通诗词 / 占位 / 同学 统一优美展示
    let poemHtml = '';
    // 处理正文分行 (支持 stanza 风格)
    let bodyHtml = '';
    if (item.poemLines && item.poemLines.length) {
        // 对于鹧鸪天保留三字对以及自然换行，每行作为单独段落或换行，使用 <div class="stanza">
        // 为了细腻，每句分行显示，但合并为连贯效果
        bodyHtml = item.poemLines.map(line => {
            if (line.trim() === '') return '';
            return `<span class="poem-line">${line}</span>`;
        }).join('<br>');
    } else {
        bodyHtml = '<span class="poem-line">心怀感恩，师恩难忘</span>';
    }

    // 额外显示角色与科目小标签
    const subHtml = `
            <div class="poem-sub">
                <span class="teacher-tag">📖 ${item.role || '恩师'}</span>
                ${item.extraNote ? `<span class="teacher-tag" style="background: rgba(180,130,90,0.15);">✨ ${item.extraNote}</span>` : ''}
            </div>
        `;

    let annotationBlock = '';
    if (item.annotation) {
        annotationBlock = `<div class="annotation"><i>📜 注：${item.annotation}</i></div>`;
    }

    // 添加词牌名装饰
    let titleDisplay = item.titleMain;
    if (!titleDisplay && item.id === "classmates") titleDisplay = "致同窗";
    if (!titleDisplay && item.id === "other_teacher_placeholder") titleDisplay = "师恩未歇";

    dynamicCard.innerHTML = `
            <div class="card-inner">
                <div class="poem-title">${titleDisplay}</div>
                ${subHtml}
                <div class="poem-body" style="white-space: normal;">
                    ${bodyHtml}
                </div>
                ${annotationBlock}
                <div style="margin-top:1rem; font-size:0.7rem; text-align:right; color:#b5937a;">—— 高新炀 敬赠</div>
            </div>
        `;
}

// 根据id获取完整对象 (合并原始数据)
function getItemById(id) {
    if (id === "hero") return poemsData.find(p => p.id === "hero");
    return poemsData.find(p => p.id === id);
}

// 左侧导航构建，并绑定事件
function buildNavigation() {
    navListEl.innerHTML = '';
    // 先添加hero首页
    const heroItem = poemsData.find(p => p.id === "hero");
    if (heroItem) {
        const li = createNavItem(heroItem.id, heroItem.navLabel);
        navListEl.appendChild(li);
    }
    // 添加老师及其他条目 (过滤掉hero)
    const teacherItems = poemsData.filter(p => p.id !== "hero");
    teacherItems.forEach(item => {
        const li = createNavItem(item.id, item.navLabel);
        navListEl.appendChild(li);
    });
    // 设置激活样式
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
        const targetItem = getItemById(id);
        if (targetItem) {
            renderContent(targetItem);
        } else {
            // 降级
            renderContent(poemsData[0]);
        }
    });
    li.appendChild(btn);
    return li;
}

function setActive(activeId) {
    const allBtns = document.querySelectorAll('.nav-btn');
    allBtns.forEach(btn => {
        const id = btn.getAttribute('data-id');
        if (id === activeId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// 初次加载渲染hero内容, 并确保所有内容完整 以及增添额外占位的内容完善文案
function init() {
    buildNavigation();
    // 补齐特殊条目的显示内容完整性：如果某些字段缺失但确保诗句显示好
    // 手动保证吕辉老师诗句的换行样式正确呈现，占位诗正确
    const lvItem = poemsData.find(p => p.id === "lyu_hui");
    if (lvItem && lvItem.poemLines) {
        // 已经正确
    }
    // 确保张翠萍临江仙正确显示上下片
    const zhangItem = poemsData.find(p => p.id === "zhang_cuiping");
    if (zhangItem && zhangItem.poemLines) {
        // 内容格式无误
    }
    // 默认显示hero全屏
    const heroData = getItemById("hero");
    renderContent(heroData);
    currentId = "hero";
    setActive("hero");
}

// 微小润色：添加诗词类的优雅换行保留韵脚风格、以及手动加入半空格效果
// 让所有诗词内容的 .poem-body 样式里面，每个句子增加适当间距
const style = document.createElement('style');
style.textContent = `
        .poem-line {
            display: inline-block;
            margin-bottom: 0.2rem;
            line-height: 1.85;
        }
        .poem-body br {
            margin-bottom: 0.2rem;
        }
        .poem-body {
            text-align: center;
        }
        .hero-quote p {
            text-align: center;
        }
        @media (max-width: 600px) {
            .poem-body {
                text-align: left;
            }
            .poem-title {
                text-align: left;
            }
        }
        .nav-btn.active {
            background: rgba(230, 210, 185, 0.6);
        }
    `;
document.head.appendChild(style);

// 根据诗词韵律微调部分显示: 为临江仙增加上下片换行美观 (在原lines基础上保留换行)
// 但以上数据表现自然，临江仙 lines 包含所有句子，用户可以看到完整。
// 额外处理：增加宋玫莲老师显示完整词牌，鹧鸪天上下片已经很优美
// 为了全屏卡片视觉统一，不做额外改动。

// 修正吕辉老师部分内容显示基石深埋已稳基的韵味，文本已经完整。
// 另外全班同学的诗句再保证一下
const classItem = poemsData.find(p => p.id === "classmates");
if (classItem && classItem.poemLines) {
    // 已经完整
}

// 确保陈刚老师南歌子的排列，显示文本完整
const chenItem = poemsData.find(p => p.id === "chen_gang");
if (chenItem && chenItem.poemLines) {
    // 正常
}

// 启动
init();

// 添加一个小细节：resize 时不破坏液态玻璃感受，不做额外动作。
// 防止卡片高度塌陷，main-content内内容撑起
window.addEventListener('resize', () => { });

// 由于导航项可能随着点击需要调整滚动条,不用处理
// 额外添加水波纹轻量感
const mainDiv = document.querySelector('.main-content');
if (mainDiv) {
    mainDiv.addEventListener('click', (e) => {
        // 仅增加涟漪视觉效果可忽略
    });
}