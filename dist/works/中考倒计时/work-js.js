// ========== 核心配置 ==========
const TARGET_DATE = new Date(2026, 5, 22, 8, 20, 0);
const TOTAL_STUDENTS = 70000;
const PLAN_TOTAL = 28000;
const ADMISSION_RATE = PLAN_TOTAL / TOTAL_STUDENTS;
const COMPETITION_BASE = Math.min(1.48, Math.max(1.0, 1 + (1 - ADMISSION_RATE) * 0.75));

// 学生分类比例
const BOARDING_RATIO = 0.22;
const NON_CITY_RATIO = 0.03;
const ELITE_CLASS_RATIO = 0.20;
const DELAY_CLASS_RATIO = 0.90;
const NORMAL_ONLY_RATIO = 1.0 - DELAY_CLASS_RATIO;

const LONG_HISTORY_SIZE = 288; //36为3小时，288为24小时
let chartHistoryData = [];
let lastSmoothedInSchool = null;
let lastSmoothedAtHome = null;
let instantInSchoolQueue = [];
let instantAtHomeQueue = [];
let fiveMinInSchoolWindow = [];
let fiveMinAtHomeWindow = [];

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
const inSchoolDisplay = document.getElementById('inSchoolDisplay');
const atHomeDisplay = document.getElementById('atHomeDisplay');
const timerDisplay = document.getElementById('currentTimeDisplay'); // 修改ID
const greetingIconSpan = document.getElementById('greetingIcon');
const greetingTextSpan = document.getElementById('greetingText');
const sayingElement = document.getElementById('dynamicSaying');
const lateNightAlertDiv = document.getElementById('lateNightAlert');
const influenceHintSpan = document.getElementById('influenceFactorHint');
let canvasEl, canvasCtx;
let prevDigits = { days: -1, hours: -1, minutes: -1, seconds: -1 };
let sessionStart = Date.now();
let longTermInterval = null,
    realtimePeerInterval = null,
    secondTickHandler = null;

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

// ---------- 基于当天 seed 的确定性伪随机函数 ----------
// 使用线性同余生成器 (LCG)，给定种子返回 [0,1) 之间的伪随机数
function lcgRandom(seed) {
    // 参数取自 glibc 的典型 LCG
    const a = 1103515245;
    const c = 12345;
    const m = 2147483648;
    let state = (seed * a + c) % m;
    return state / m;
}

// 根据日期和时间生成确定性种子
// 种子组成：年*10000 + 月*100 + 日，再乘以 1440 加上当天分钟，确保不同分钟不同值，同一天内相同分钟种子一致
function getDeterministicSeed(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const minutesSinceMidnight = date.getHours() * 60 + date.getMinutes();
    // 基础种子：日期唯一
    const dateSeed = year * 366 + month * 31 + day;
    // 最终种子，考虑分钟级别，保证同一天不同分钟结果不同
    return dateSeed * 1440 + minutesSinceMidnight;
}

// 产生基于当前时刻的伪随机波动系数，范围 [-maxFactor, +maxFactor] 之间均匀分布
function getNoiseFactor(date, maxFactor) {
    const seed = getDeterministicSeed(date);
    // 使用两个不同的LCG偏移，得到独立的正负波动
    let r1 = lcgRandom(seed);
    let r2 = lcgRandom(seed + 1234567);
    // 让波动在 [-maxFactor, maxFactor] 内均匀分布
    const noise = (r1 * 2 - 1) * maxFactor;
    // 再乘以一个与分钟相关的细微变化，避免不同变量间完全线性相关
    const extra = (r2 - 0.5) * 0.1;
    return noise + extra;
}

// ---------- 平滑时段学习率（用于周末/假期在家学习比例，线性插值避免突变）----------
const TIME_RATE_POINTS = [
    { t: 0 * 60, rate: 0.062 },     // 00:00 深夜
    { t: 1 * 60, rate: 0.035 },
    { t: 2 * 60, rate: 0.008 },
    { t: 2 * 60 + 30, rate: 0.008 },
    { t: 3 * 60, rate: 0.017 },
    { t: 4 * 60, rate: 0.034 },
    { t: 5 * 60, rate: 0.06 },
    { t: 5 * 60 + 30, rate: 0.062 }, // 05:30 深夜结束
    { t: 6 * 60 + 30, rate: 0.21 }, // 06:30 清晨起床
    { t: 7 * 60, rate: 0.35 },      // 07:00 晨读
    { t: 8 * 60, rate: 0.53 },      // 08:00 黄金上午
    { t: 9 * 60, rate: 0.6 },
    { t: 10 * 60, rate: 0.62 },
    { t: 11 * 60 + 30, rate: 0.7 },// 11:30 午前
    { t: 12 * 60, rate: 0.4 },     // 12:00 午餐
    { t: 12 * 60 + 30, rate: 0.35 },
    { t: 13 * 60, rate: 0.3 },     // 13:00 午休尾声
    { t: 13 * 60 + 30, rate: 0.4 },// 13:30 下午高效
    { t: 14 * 60, rate: 0.5 },
    { t: 15 * 60, rate: 0.6 },
    { t: 16 * 60, rate: 0.62 },
    { t: 17 * 60 + 30, rate: 0.65 },// 17:30 傍晚前
    { t: 18 * 60, rate: 0.44 },     // 18:00 晚餐
    { t: 19 * 60, rate: 0.4 },     // 19:00 晚间开始
    { t: 20 * 60, rate: 0.5 },     // 20:00 晚自习高峰
    { t: 21 * 60, rate: 0.53 },
    { t: 22 * 60, rate: 0.6 },     // 22:00 晚自习结束
    { t: 23 * 60, rate: 0.2 },     // 23:00 准备休息
    { t: 24 * 60, rate: 0.07 }      // 24:00 深夜
];

function getSmoothHomeStudyRate(totalMinutes) {
    let t = totalMinutes % 1440;
    let prevPoint = TIME_RATE_POINTS[0];
    let nextPoint = TIME_RATE_POINTS[TIME_RATE_POINTS.length - 1];
    for (let i = 0; i < TIME_RATE_POINTS.length - 1; i++) {
        if (t >= TIME_RATE_POINTS[i].t && t <= TIME_RATE_POINTS[i + 1].t) {
            prevPoint = TIME_RATE_POINTS[i];
            nextPoint = TIME_RATE_POINTS[i + 1];
            break;
        }
    }
    const delta = nextPoint.t - prevPoint.t;
    if (delta === 0) return prevPoint.rate;
    const ratio = (t - prevPoint.t) / delta;
    return prevPoint.rate + (nextPoint.rate - prevPoint.rate) * ratio;
}

// ---------- 五一假期判断 ----------
function isMayDayHoliday(date) {
    const month = date.getMonth(); // 0-indexed, 4 = May
    const day = date.getDate();
    if (month === 4) { // May
        return day >= 1 && day <= 5;
    }
    return false;
}

// 假期模式：极低在校人数 + 在家学习人数平滑变化，使用确定性噪声
function getHolidayDistribution(now) {
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const boardingCount = Math.floor(TOTAL_STUDENTS * BOARDING_RATIO);
    const dayStudentCount = TOTAL_STUDENTS - boardingCount;

    // ---------- 大幅降低五一假期在校比例 ----------
    let schoolRatio = 0.002;                     // 基础比例极低
    if (totalMinutes >= 8 * 60 && totalMinutes < 20 * 60) {
        schoolRatio = 0.016;                     // 白天最高也仅 0.8%
    } else if (totalMinutes >= 22 * 60 || totalMinutes < 6 * 60) {
        schoolRatio = 0.002;                     // 深夜更低
    } else if (totalMinutes >= 6 * 60 && totalMinutes < 8 * 60) {
        schoolRatio = 0.006;                     // 清晨少量
    }

    // 住校生在校人数
    let inSchool = Math.floor(boardingCount * schoolRatio);
    // 走读生几乎不留校（系数从0.003大幅降到0.0002）
    inSchool += Math.floor(dayStudentCount * 0.0005);
    inSchool = Math.min(TOTAL_STUDENTS, Math.max(0, inSchool));   // 下限5人，上限仍受全局控制

    // 在家学习率复用正常时段曲线（符合假期自主复习规律）
    const homeStudyRate = getSmoothHomeStudyRate(totalMinutes);
    let atHome = Math.floor(dayStudentCount * homeStudyRate);
    // 住校生中未在校的部分，部分转为在家学习
    const boardingAtHome = Math.floor(boardingCount * (1 - schoolRatio) * homeStudyRate * 0.85);
    atHome += boardingAtHome;
    // 确保总人数不溢出，且在家人数不少于200（保持数据显示合理）
    let maxPossibleHome = TOTAL_STUDENTS - inSchool;
    atHome = Math.min(maxPossibleHome, Math.max(200, atHome));

    // 确定性波动幅度由 0.02 降至 0.01，避免极端值
    const noiseSchoolFactor = getNoiseFactor(now, 0.01);
    const noiseHomeFactor = getNoiseFactor(now, 0.01);
    let finalInSchool = Math.floor(inSchool * (1 + noiseSchoolFactor));
    let finalAtHome = Math.floor(atHome * (1 + noiseHomeFactor));

    // 额外加一道安全上限：假期在校人数不超过300人，在家不超过总人数
    finalInSchool = Math.min(500, Math.max(5, finalInSchool));
    finalAtHome = Math.min(TOTAL_STUDENTS - finalInSchool, Math.max(200, finalAtHome));

    return { inSchool: finalInSchool, atHome: finalAtHome };
}

function isSummerSchedule(now) {
    const month = now.getMonth() + 1;
    const day = now.getDate();
    if (month >= 5 && month <= 9) {
        if (month === 5 && day < 1) return false;
        if (month === 9 && day > 30) return false;
        return true;
    }
    return false;
}

function getScheduleKeyTimes(now) {
    const isSummer = isSummerSchedule(now);
    const dayOfWeek = now.getDay();
    const isFriday = dayOfWeek === 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const BOARDING_SLEEP_TIME = 22 * 60;
    if (isSummer) {
        return {
            schoolStartMin: 7 * 60,
            schoolStartMax: 7 * 60 + 30,
            normalEndMin: 17 * 60,
            normalEndMax: 17 * 60 + 30,
            delayEndMin: 19 * 60 + 10,
            delayEndMax: 19 * 60 + 40,
            eliteEndWeekday: 20 * 60 + 40,
            eliteEndFriday: 20 * 60 + 20,
            eliteEndSpecial: 21 * 60,
            nonCityEnd: 22 * 60,
            boardingDormTime: 21 * 60 + 30,
            boardingSleepTime: BOARDING_SLEEP_TIME,
            isSummer: true,
            commuteMinutesCity: 18,
            commuteMinutesNonCity: 40,
            settleMinutes: 20
        };
    } else {
        return {
            schoolStartMin: 7 * 60 + 30,
            schoolStartMax: 8 * 60,
            normalEndMin: 16 * 60 + 30,
            normalEndMax: 17 * 60,
            delayEndMin: 18 * 60 + 40,
            delayEndMax: 19 * 60 + 10,
            eliteEndWeekday: 20 * 60 + 10,
            eliteEndFriday: 19 * 60 + 50,
            eliteEndSpecial: 20 * 60 + 30,
            nonCityEnd: 21 * 60 + 30,
            boardingDormTime: 21 * 60,
            boardingSleepTime: BOARDING_SLEEP_TIME,
            isSummer: false,
            commuteMinutesCity: 16,
            commuteMinutesNonCity: 35,
            settleMinutes: 18
        };
    }
}

function getLateNightStudyRate(totalMinutes) {
    if (totalMinutes >= 3 * 60 && totalMinutes < 5 * 60 + 30) return 0.01;
    if (totalMinutes >= 1 * 60 && totalMinutes < 3 * 60) return 0.02;
    if (totalMinutes < 1 * 60) return 0.06;
    if (totalMinutes < 24 * 60 && totalMinutes >= 23 * 60) return 0.15;
    if (totalMinutes < 23 * 60) return 0.35;
    return 0.01;
}

// 主分布计算（假期优先，然后是周末特殊处理，最后工作日）
function calculateStudentDistribution(now) {
    if (isMayDayHoliday(now)) {
        return getHolidayDistribution(now);
    }

    const sched = getScheduleKeyTimes(now);
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
        const boardingCount = Math.floor(TOTAL_STUDENTS * BOARDING_RATIO);
        const dayStudentCount = TOTAL_STUDENTS - boardingCount;
        let schoolRatio = 0.30;
        if (totalMinutes < 8 * 60 || totalMinutes >= 21 * 60) schoolRatio = 0.20;
        else if (totalMinutes >= 12 * 60 && totalMinutes < 14 * 60) schoolRatio = 0.35;
        let inSchool = Math.floor(boardingCount * schoolRatio);
        inSchool += Math.floor(dayStudentCount * 0.01);
        inSchool = Math.min(TOTAL_STUDENTS, Math.max(80, inSchool));

        const weekendHomeRate = getSmoothHomeStudyRate(totalMinutes);
        let atHome = Math.floor(dayStudentCount * weekendHomeRate);
        const boardingAtHome = Math.floor(boardingCount * (1 - schoolRatio) * weekendHomeRate * 0.9);
        atHome += boardingAtHome;
        atHome = Math.min(TOTAL_STUDENTS - inSchool, Math.max(600, atHome));

        // 确定性波动 (±3%)
        const noiseSchoolFactor = getNoiseFactor(now, 0.03);
        const noiseHomeFactor = getNoiseFactor(now, 0.03);
        let finalInSchool = Math.floor(inSchool * (1 + noiseSchoolFactor));
        let finalAtHome = Math.floor(atHome * (1 + noiseHomeFactor));
        finalInSchool = Math.min(TOTAL_STUDENTS, Math.max(50, finalInSchool));
        finalAtHome = Math.min(TOTAL_STUDENTS, Math.max(300, finalAtHome));
        return { inSchool: finalInSchool, atHome: finalAtHome };
    }

    // 工作日过渡带逻辑
    const EVENING_TRANS_START = 21 * 60 + 50;
    const EVENING_TRANS_END = 22 * 60 + 10;
    const MORNING_TRANS_START = 5 * 60 + 20;
    const MORNING_TRANS_END = 5 * 60 + 40;
    const inEveningTransition = totalMinutes >= EVENING_TRANS_START && totalMinutes <= EVENING_TRANS_END;
    const inMorningTransition = totalMinutes >= MORNING_TRANS_START && totalMinutes <= MORNING_TRANS_END;
    const inTransition = inEveningTransition || inMorningTransition;

    if (inTransition) {
        let deepWeight;
        if (inEveningTransition) {
            deepWeight = (totalMinutes - EVENING_TRANS_START) / (EVENING_TRANS_END - EVENING_TRANS_START);
        } else {
            deepWeight = 1 - (totalMinutes - MORNING_TRANS_START) / (MORNING_TRANS_END - MORNING_TRANS_START);
        }
        deepWeight = Math.max(0, Math.min(1, deepWeight));
        const deepResult = computeDeepSleepResult(now, totalMinutes);
        const normalResult = computeNormalResult(now, totalMinutes, dayOfWeek, false, sched);
        return {
            inSchool: Math.round(deepResult.inSchool * deepWeight + normalResult.inSchool * (1 - deepWeight)),
            atHome: Math.round(deepResult.atHome * deepWeight + normalResult.atHome * (1 - deepWeight))
        };
    }

    const isDeepSleep = totalMinutes >= (22 * 60) || totalMinutes < (5 * 60 + 30);
    if (isDeepSleep) {
        return computeDeepSleepResult(now, totalMinutes);
    }
    return computeNormalResult(now, totalMinutes, dayOfWeek, false, sched);
}

// 深睡时段计算（使用确定性噪声，幅度 ±3.5%）
function computeDeepSleepResult(now, totalMinutes) {
    const boardingCount = Math.floor(TOTAL_STUDENTS * BOARDING_RATIO);
    const dayStudentCount = TOTAL_STUDENTS - boardingCount;
    let inSchool = Math.floor(boardingCount * 0.008) + Math.floor(dayStudentCount * 0.002);
    let atHome = Math.floor(dayStudentCount * getLateNightStudyRate(totalMinutes)) +
        Math.floor(boardingCount * 0.01 * getLateNightStudyRate(totalMinutes));
    inSchool = Math.min(TOTAL_STUDENTS, Math.max(15, inSchool));
    atHome = Math.min(TOTAL_STUDENTS, Math.max(40, atHome));

    const noiseSchoolFactor = getNoiseFactor(now, 0.035);
    const noiseHomeFactor = getNoiseFactor(now, 0.035);
    let finalInSchool = Math.floor(inSchool * (1 + noiseSchoolFactor));
    let finalAtHome = Math.floor(atHome * (1 + noiseHomeFactor));
    finalInSchool = Math.min(TOTAL_STUDENTS, Math.max(8, finalInSchool));
    finalAtHome = Math.min(TOTAL_STUDENTS, Math.max(30, finalAtHome));
    return { inSchool: finalInSchool, atHome: finalAtHome };
}

// 工作日正常时段计算（确定性噪声 ±3%）
function computeNormalResult(now, totalMinutes, dayOfWeek, isWeekend, sched) {
    const boardingCount = Math.floor(TOTAL_STUDENTS * BOARDING_RATIO);
    const nonCityCount = Math.floor(TOTAL_STUDENTS * NON_CITY_RATIO);
    const dayStudentCount = TOTAL_STUDENTS - boardingCount;
    const normalOnlyCount = Math.floor(TOTAL_STUDENTS * NORMAL_ONLY_RATIO);
    const eliteCount = Math.floor(TOTAL_STUDENTS * ELITE_CLASS_RATIO);
    const delayOnlyCount = Math.floor(TOTAL_STUDENTS * (DELAY_CLASS_RATIO - ELITE_CLASS_RATIO));

    let inSchool = 0, atHome = 0;
    const isBoardingAtSchool = (() => {
        if (isWeekend) return false;
        if (dayOfWeek === 5 && totalMinutes >= 16 * 60 + 30) return false;
        return true;
    })();

    if (totalMinutes < sched.schoolStartMin) {
        inSchool = isBoardingAtSchool ? Math.floor(boardingCount * 0.9) : Math.floor(boardingCount * 0.2);
        atHome = Math.floor(dayStudentCount * 0.22);
    } else if (totalMinutes < sched.schoolStartMax) {
        const progress = (totalMinutes - sched.schoolStartMin) / (sched.schoolStartMax - sched.schoolStartMin);
        const arrivingStudents = Math.floor(dayStudentCount * progress);
        inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + arrivingStudents;
        atHome = Math.floor((dayStudentCount - arrivingStudents) * 0.15);
    } else if (totalMinutes < sched.normalEndMin) {
        inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + Math.floor(dayStudentCount * 0.97);
        atHome = Math.floor(dayStudentCount * 0.02);
    } else if (totalMinutes < sched.normalEndMax) {
        const progress = (totalMinutes - sched.normalEndMin) / (sched.normalEndMax - sched.normalEndMin);
        const normalOnlyLeaving = Math.floor(normalOnlyCount * progress);
        const stillInSchool = dayStudentCount - normalOnlyLeaving;
        inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + stillInSchool;
        const arrivedHome = Math.floor(normalOnlyLeaving * Math.max(0, progress - 0.3));
        atHome = Math.floor(arrivedHome * 0.6);
    } else if (totalMinutes < sched.delayEndMin) {
        const delayStudents = delayOnlyCount + eliteCount;
        inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + delayStudents;
        atHome = Math.floor(normalOnlyCount * 0.55);
    } else if (totalMinutes < sched.delayEndMax) {
        const progress = (totalMinutes - sched.delayEndMin) / (sched.delayEndMax - sched.delayEndMin);
        const delayOnlyLeaving = Math.floor(delayOnlyCount * progress);
        const stillInSchool = eliteCount + (delayOnlyCount - delayOnlyLeaving);
        inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + stillInSchool;
        const arrivedHomeFromDelay = Math.floor(delayOnlyLeaving * Math.max(0, progress - 0.25));
        atHome = Math.floor(normalOnlyCount * 0.62) + Math.floor(arrivedHomeFromDelay * 0.55);
    } else {
        const eliteEndTime = (dayOfWeek === 5) ? sched.eliteEndFriday : sched.eliteEndWeekday;
        if (totalMinutes < eliteEndTime) {
            inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + eliteCount;
            atHome = Math.floor((normalOnlyCount + delayOnlyCount) * 0.7);
        } else if (totalMinutes < sched.eliteEndSpecial) {
            const specialStillIn = Math.floor(eliteCount * 0.35);
            inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + specialStillIn + nonCityCount;
            atHome = Math.floor((normalOnlyCount + delayOnlyCount + (eliteCount - specialStillIn - nonCityCount)) * 0.72);
        } else if (totalMinutes < sched.nonCityEnd) {
            inSchool = (isBoardingAtSchool ? boardingCount : Math.floor(boardingCount * 0.7)) + nonCityCount;
            atHome = Math.floor((TOTAL_STUDENTS - inSchool) * 0.68);
        } else {
            inSchool = isBoardingAtSchool ? Math.floor(boardingCount * 0.4) : Math.floor(boardingCount * 0.2);
            atHome = Math.floor(dayStudentCount * 0.45);
        }
    }
    const daysLeft = Math.max(0, (TARGET_DATE - now) / (1000 * 3600 * 24));
    const examProximityBoost = daysLeft < 30 ? 1.08 : (daysLeft < 60 ? 1.05 : (daysLeft < 90 ? 1.03 : 1.0));
    atHome = Math.floor(atHome * examProximityBoost);
    const weatherFactor = 0.97 + (getNoiseFactor(now, 0.02) * 0.5); // 天气因子也改用确定性噪声，范围±1%
    atHome = Math.floor(atHome * (0.97 + weatherFactor * 0.04));

    // 确定性噪声 ±3%
    const noiseSchoolFactor = getNoiseFactor(now, 0.03);
    const noiseHomeFactor = getNoiseFactor(now, 0.03);
    let finalInSchool = Math.floor(inSchool * (1 + noiseSchoolFactor));
    let finalAtHome = Math.floor(atHome * (1 + noiseHomeFactor));
    finalInSchool = Math.min(TOTAL_STUDENTS, Math.max(150, finalInSchool));
    finalAtHome = Math.min(TOTAL_STUDENTS, Math.max(200, finalAtHome));
    return { inSchool: finalInSchool, atHome: finalAtHome };
}

// ---------- 补丁：作业冲刺（周日或假期最后一天的22:00-03:00）----------
function isLastDayOfHoliday(now) {
    if (!isMayDayHoliday(now)) return false;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return !isMayDayHoliday(tomorrow);
}

function isCramDeadline(now) {
    const dayOfWeek = now.getDay();
    const isSunday = dayOfWeek === 0;
    const isHolidayEnd = isLastDayOfHoliday(now);
    if (!isSunday && !isHolidayEnd) return false;
    const hour = now.getHours();
    // 22:00 到次日 03:00
    return hour >= 22 || hour < 3;
}

function applyDeadlineBoost(distribution, now) {
    if (!isCramDeadline(now)) return distribution;
    let { inSchool, atHome } = distribution;
    const boostFactor = 1.5; // 赶作业人数激增
    let boostedAtHome = Math.floor(atHome * boostFactor);
    // 在家最多不超过总学生减去在校最低保留数
    let maxHome = TOTAL_STUDENTS - Math.floor(inSchool * 0.7);
    boostedAtHome = Math.min(boostedAtHome, maxHome);
    // 调整在校人数，部分住校生也可能熬夜赶作业
    let newInSchool = Math.max(100, Math.floor(inSchool * 0.85));
    const totalAfter = newInSchool + boostedAtHome;
    if (totalAfter > TOTAL_STUDENTS) {
        boostedAtHome = TOTAL_STUDENTS - newInSchool;
    }
    return { inSchool: newInSchool, atHome: boostedAtHome };
}

function getPatchedDistribution(now) {
    const raw = calculateStudentDistribution(now);
    return applyDeadlineBoost(raw, now);
}

// 实时平滑推送
function pushInstantPrediction() {
    const now = new Date();
    const raw = getPatchedDistribution(now);
    if (lastSmoothedInSchool === null) lastSmoothedInSchool = raw.inSchool;
    else lastSmoothedInSchool = Math.floor(lastSmoothedInSchool * 0.72 + raw.inSchool * 0.28);
    const finalInSchool = Math.min(TOTAL_STUDENTS, Math.max(100, lastSmoothedInSchool));
    if (lastSmoothedAtHome === null) lastSmoothedAtHome = raw.atHome;
    else lastSmoothedAtHome = Math.floor(lastSmoothedAtHome * 0.72 + raw.atHome * 0.28);
    const finalAtHome = Math.min(TOTAL_STUDENTS, Math.max(100, lastSmoothedAtHome));
    instantInSchoolQueue.push(finalInSchool);
    instantAtHomeQueue.push(finalAtHome);
    if (instantInSchoolQueue.length > 30) instantInSchoolQueue.shift();
    if (instantAtHomeQueue.length > 30) instantAtHomeQueue.shift();
    fiveMinInSchoolWindow.push(finalInSchool);
    fiveMinAtHomeWindow.push(finalAtHome);
    return { inSchool: finalInSchool, atHome: finalAtHome };
}

function getCurrentRealtimeInSchool() {
    if (instantInSchoolQueue.length === 0) return Math.floor(TOTAL_STUDENTS * 0.3);
    const sum = instantInSchoolQueue.reduce((a, b) => a + b, 0);
    return Math.round(sum / instantInSchoolQueue.length);
}

function getCurrentRealtimeAtHome() {
    if (instantAtHomeQueue.length === 0) return Math.floor(TOTAL_STUDENTS * 0.15);
    const sum = instantAtHomeQueue.reduce((a, b) => a + b, 0);
    return Math.round(sum / instantAtHomeQueue.length);
}

function recordLongTermPoint() {
    let avgInSchool = 0, avgAtHome = 0;
    if (fiveMinInSchoolWindow.length > 0) {
        avgInSchool = Math.round(fiveMinInSchoolWindow.reduce((a, b) => a + b, 0) / fiveMinInSchoolWindow.length);
        avgAtHome = Math.round(fiveMinAtHomeWindow.reduce((a, b) => a + b, 0) / fiveMinAtHomeWindow.length);
    } else {
        avgInSchool = getCurrentRealtimeInSchool();
        avgAtHome = getCurrentRealtimeAtHome();
    }
    fiveMinInSchoolWindow = [];
    fiveMinAtHomeWindow = [];
    chartHistoryData.push({ inSchool: avgInSchool, atHome: avgAtHome, timestamp: Date.now() });
    if (chartHistoryData.length > LONG_HISTORY_SIZE) chartHistoryData.shift();
    drawTrendChart();
    if (influenceHintSpan) {
        const now = new Date();
        const sched = getScheduleKeyTimes(now);
        influenceHintSpan.innerText = `🔥 冲刺系数${COMPETITION_BASE.toFixed(2)}x · ${sched.isSummer ? '夏季' : '冬季'}作息 · 每5min聚合`;
    }
}

function fillPastHistory() {
    chartHistoryData = [];
    const now = new Date();
    let prevInSchool = null, prevAtHome = null;
    for (let i = LONG_HISTORY_SIZE - 1; i >= 0; i--) {
        const pointDate = new Date(now.getTime() - (i * 5 * 60 * 1000));
        const raw = getPatchedDistribution(pointDate);
        if (prevInSchool !== null) {
            raw.inSchool = Math.floor(prevInSchool * 0.65 + raw.inSchool * 0.35);
            raw.atHome = Math.floor(prevAtHome * 0.65 + raw.atHome * 0.35);
        }
        prevInSchool = raw.inSchool;
        prevAtHome = raw.atHome;
        chartHistoryData.push({ inSchool: raw.inSchool, atHome: raw.atHome, timestamp: pointDate.getTime() });
    }
}

function drawTrendChart() {
    if (!canvasEl || !canvasCtx) return;
    const canvas = canvasEl;
    const ctx = canvasCtx;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w;
    canvas.height = h;
    if (chartHistoryData.length === 0) { ctx.clearRect(0, 0, w, h); return; }
    const allValues = [];
    chartHistoryData.forEach(p => { allValues.push(p.inSchool); allValues.push(p.atHome); });
    const maxVal = Math.max(...allValues, 3000);
    const minVal = Math.min(...allValues, 500);
    const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;
    const paddingLeft = 48, paddingRight = 20, paddingTop = 22, paddingBottom = 28;
    const drawW = w - paddingLeft - paddingRight, drawH = h - paddingTop - paddingBottom;
    if (drawW <= 0 || drawH <= 0) return;
    ctx.clearRect(0, 0, w, h);
    const gridColor = getComputedStyle(document.body).getPropertyValue('--canvas-grid') || '#E9EFF4';
    const textColor = getComputedStyle(document.body).getPropertyValue('--canvas-text') || '#6B7C93';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.6;
    for (let i = 0; i <= 4; i++) {
        const y = paddingTop + (drawH * i / 4);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(w - paddingRight, y);
        ctx.stroke();
    }
    ctx.fillStyle = textColor;
    ctx.font = "10px Inter";
    for (let i = 0; i <= 4; i++) {
        const yVal = Math.round(maxVal - (i / 4) * range);
        const y = paddingTop + (drawH * i / 4);
        ctx.fillText(yVal.toLocaleString(), 5, y + 3);
    }
    const labelStep = Math.max(1, Math.floor(chartHistoryData.length / 6));
    for (let i = 0; i < chartHistoryData.length; i += labelStep) {
        const x = paddingLeft + (drawW * i / (chartHistoryData.length - 1));
        const offsetMins = (chartHistoryData.length - 1 - i) * 5;
        let label = offsetMins === 0 ? "现在" : (offsetMins >= 60 ? `-${Math.floor(offsetMins / 60)}h` : `-${offsetMins}m`);
        ctx.fillText(label, x - 14, h - paddingBottom + 13);
    }
    const lineColorSchool = getComputedStyle(document.body).getPropertyValue('--canvas-line') || '#3B82F6';
    const lineColorHome = getComputedStyle(document.body).getPropertyValue('--canvas-line-home') || '#F97316';
    const pointColorSchool = getComputedStyle(document.body).getPropertyValue('--canvas-point') || '#1E40AF';
    const pointColorHome = getComputedStyle(document.body).getPropertyValue('--canvas-point-home') || '#EA580C';
    const drawLine = (key, col, ptCol) => {
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        let first = true;
        for (let i = 0; i < chartHistoryData.length; i++) {
            const x = paddingLeft + (drawW * i / (chartHistoryData.length - 1));
            const y = paddingTop + drawH - ((chartHistoryData[i][key] - minVal) / range) * drawH;
            if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (let i = 0; i < chartHistoryData.length; i++) {
            const x = paddingLeft + (drawW * i / (chartHistoryData.length - 1));
            const y = paddingTop + drawH - ((chartHistoryData[i][key] - minVal) / range) * drawH;
            ctx.beginPath();
            ctx.arc(x, y, 2.8, 0, 2 * Math.PI);
            ctx.fillStyle = ptCol;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 1.3, 0, 2 * Math.PI);
            ctx.fillStyle = "white";
            ctx.fill();
        }
    };
    drawLine('inSchool', lineColorSchool, pointColorSchool);
    drawLine('atHome', lineColorHome, pointColorHome);
    const last = chartHistoryData[chartHistoryData.length - 1];
    ctx.fillStyle = lineColorSchool;
    ctx.font = "bold 10px 'Space Grotesk'";
    ctx.fillText(`在校:${last.inSchool.toLocaleString()}`, paddingLeft + 4, paddingTop - 4);
    ctx.fillStyle = lineColorHome;
    ctx.fillText(`在家:${last.atHome.toLocaleString()}`, paddingLeft + 120, paddingTop - 4);
}

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

    // 获取选中的颜色
    const selectedColorOption = document.querySelector('.color-option.active');
    if (selectedColorOption) {
        const selectedColor = selectedColorOption.dataset.color;

        // 更新主题色
        document.documentElement.style.setProperty('--accent-blue', selectedColor);
        document.documentElement.style.setProperty('--accent-light', selectedColor);
        document.documentElement.style.setProperty('--badge-text', selectedColor);
        document.documentElement.style.setProperty('--saying-border-left', selectedColor);
        document.documentElement.style.setProperty('--legend-school-dot', selectedColor);
        document.documentElement.style.setProperty('--card-accent-school', selectedColor);
        document.documentElement.style.setProperty('--canvas-line', selectedColor);
        document.documentElement.style.setProperty('--canvas-point', selectedColor);

        // 更新进度条颜色
        document.documentElement.style.setProperty('--progress-fill', `linear-gradient(105deg, ${selectedColor} 0%, ${adjustColor(selectedColor, -20)} 20%, ${adjustColor(selectedColor, 20)} 80%, ${selectedColor} 100%)`);
    }
}

// 颜色调整辅助函数
function adjustColor(hex, percent) {
    // 将十六进制颜色转换为RGB
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    // 调整颜色
    R = Math.min(255, Math.max(0, R + Math.floor(R * percent / 100)));
    G = Math.min(255, Math.max(0, G + Math.floor(G * percent / 100)));
    B = Math.min(255, Math.max(0, B + Math.floor(B * percent / 100)));

    // 返回新的十六进制颜色
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

    // 重置颜色选择
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

            // 设置颜色
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
function updateRealtimePeerDisplay() {
    if (inSchoolDisplay) {
        const realtimeInSchool = getCurrentRealtimeInSchool();
        inSchoolDisplay.innerText = realtimeInSchool.toLocaleString();
        inSchoolDisplay.classList.add('pulse-stat');
        setTimeout(() => inSchoolDisplay.classList.remove('pulse-stat'), 200);
    }
    if (atHomeDisplay) {
        const realtimeAtHome = getCurrentRealtimeAtHome();
        atHomeDisplay.innerText = realtimeAtHome.toLocaleString();
        atHomeDisplay.classList.add('pulse-stat');
        setTimeout(() => atHomeDisplay.classList.remove('pulse-stat'), 200);
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
    if (canvasCtx && chartHistoryData.length) drawTrendChart();
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
    if (canvasCtx && chartHistoryData.length) drawTrendChart();
}
function init() {
    canvasEl = document.getElementById('trendCanvas');
    if (canvasEl) canvasCtx = canvasEl.getContext('2d');
    sessionStart = Date.now();
    for (let i = 0; i < 20; i++) pushInstantPrediction();
    fillPastHistory();
    drawTrendChart();
    realtimePeerInterval = setInterval(() => { updateRealtimePeerDisplay(); }, 5000);
    secondTickHandler = setInterval(() => {
        pushInstantPrediction();
        updateCountdownUI(getRemainingTime());
        updateProgressBars();
        updateLiveClock();
        updateCurrentTime(); // 更新当前时间
        updateGreetingAndHealth();
    }, 1000);
    longTermInterval = setInterval(() => { recordLongTermPoint(); }, 5 * 60 * 1000);
    document.getElementById('refreshSayingBtn')?.addEventListener('click', refreshSaying);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const wallpaperBtn = document.getElementById('wallpaperToggleBtn');
    if (wallpaperBtn) wallpaperBtn.addEventListener('click', toggleWallpaper);
    const fullscreenBtn = document.getElementById('fullscreenToggleBtn');
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

    // 设置面板事件监听
    settingsToggleBtn.addEventListener('click', showSettingsPanel);
    closeSettingsBtn.addEventListener('click', hideSettingsPanel);
    saveSettingsBtn.addEventListener('click', saveSettings);
    resetSettingsBtn.addEventListener('click', resetSettings);

    // 滑块事件监听
    blurSlider.addEventListener('input', function () {
        blurValue.textContent = this.value;
    });

    saturationSlider.addEventListener('input', function () {
        saturationValue.textContent = this.value;
    });

    brightnessSlider.addEventListener('input', function () {
        brightnessValue.textContent = this.value;
    });

    // 颜色选择事件监听
    colorOptions.forEach(option => {
        option.addEventListener('click', function () {
            colorOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            updateCSSVariables(); // 点击颜色选项后立即更新主题色
        });
    });

    // 初始化壁纸
    const savedBgUrl = localStorage.getItem('backgroundImageUrl');
    if (savedBgUrl) {
        document.documentElement.style.setProperty('--wallpaper-url', `url('${savedBgUrl}')`);
        document.body.classList.add('has-wallpaper');
    } else {
        applyRandomBackgroundImage();
    }

    // 加载保存的设置
    loadSettings();

    window.addEventListener('resize', () => drawTrendChart());
    refreshSaying();
    initTheme();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();