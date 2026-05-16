
        (function initTheme() {
            const themeToggle = document.getElementById('themeToggleCheckbox');
            if (!themeToggle) return;

            // 读取本地存储或系统偏好
            const storedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            let isDark = false;
            if (storedTheme === 'dark') {
                isDark = true;
            } else if (storedTheme === 'light') {
                isDark = false;
            } else {
                isDark = prefersDark;
            }

            const applyTheme = (dark) => {
                if (dark) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    if (themeToggle) themeToggle.checked = true;
                    localStorage.setItem('theme', 'dark');
                } else {
                    document.documentElement.setAttribute('data-theme', 'light');
                    if (themeToggle) themeToggle.checked = false;
                    localStorage.setItem('theme', 'light');
                }
            };
            applyTheme(isDark);

            if (themeToggle) {
                themeToggle.addEventListener('change', (e) => {
                    applyTheme(e.target.checked);
                });
            }
        })();

        document.addEventListener('DOMContentLoaded', function() {
            const mobileToggle = document.querySelector('.mobile-toggle');
            const navItems = document.querySelector('.nav-items');
            if (mobileToggle && navItems) {
                mobileToggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    this.classList.toggle('active');
                    navItems.classList.toggle('active');
                });
                // 点击导航项后自动关闭菜单
                const navItemLinks = document.querySelectorAll('.nav-item');
                navItemLinks.forEach(item => {
                    item.addEventListener('click', () => {
                        if (navItems.classList.contains('active')) {
                            navItems.classList.remove('active');
                            mobileToggle.classList.remove('active');
                        }
                    });
                });
            }
        });

        const calculateBtn = document.getElementById('calculateBtn');
        const numbersInput = document.getElementById('numbers');
        const errorDiv = document.getElementById('errorMessage');
        const resultsContainer = document.getElementById('results');

        // 辅助：显示错误信息
        function showError(message) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            resultsContainer.innerHTML = `
                <div class="result-item"><span class="result-label">和：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">平均值：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">中位数：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">众数：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">总体方差：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">总体标准差：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">极差：</span><span class="result-value">—</span></div>
                <div class="result-item"><span class="result-label">最小值 / 最大值：</span><span class="result-value">— / —</span></div>
            `;
        }

        // 格式化数字：保留最多6位小数
        function formatNumber(value) {
            if (value === undefined || value === null || isNaN(value)) return '—';
            // 处理特别大的整数或极小值，使用 toFixed(6) 去除冗余尾零
            let rounded = Number(value);
            if (Math.abs(rounded) > 1e12) {
                // 科学计数法更合适
                return rounded.toExponential(6);
            }
            // 保留6位有效小数，同时剔除无意义的0
            let fixed = rounded.toFixed(6);
            // 去掉尾随的零以及可能的多余小数点
            fixed = fixed.replace(/\.?0+$/, '');
            if (fixed === '') fixed = '0';
            // 如果原本是整数，不加小数点
            return fixed;
        }

        // 众数专用格式化：保持每个数字统一精度
        function formatModeValue(num) {
            if (num === undefined) return '';
            let val = Number(num);
            if (Math.abs(val) > 1e12) return val.toExponential(6);
            let fixed = val.toFixed(6).replace(/\.?0+$/, '');
            return fixed === '' ? '0' : fixed;
        }

        // 主计算函数
        function calculateStatistics() {
            // 隐藏错误信息
            errorDiv.style.display = 'none';
            const rawInput = numbersInput.value.trim();
            if (!rawInput) {
                showError('请输入数字，使用空格分隔。');
                return;
            }

            // 解析数字 (支持负号、小数、科学计数法)
            const parts = rawInput.split(/\s+/);
            const numbers = [];
            for (let part of parts) {
                if (part === '') continue;
                const num = parseFloat(part);
                if (isNaN(num)) {
                    showError(`无效数字: "${part}"，请确保只输入数字和空格。`);
                    return;
                }
                numbers.push(num);
            }

            if (numbers.length === 0) {
                showError('未检测到有效数字，请检查输入格式。');
                return;
            }

            const n = numbers.length;
            const sum = numbers.reduce((acc, v) => acc + v, 0);
            const mean = sum / n;

            // 排序数组用于中位数/极值
            const sorted = [...numbers].sort((a, b) => a - b);
            const minVal = sorted[0];
            const maxVal = sorted[n - 1];
            const rangeVal = maxVal - minVal;

            // 中位数
            let median;
            if (n % 2 === 0) {
                median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
            } else {
                median = sorted[Math.floor(n / 2)];
            }

            // 众数
            const freqMap = new Map();
            let maxFreq = 0;
            for (const num of numbers) {
                // 由于浮点键可能不精确，使用字符串保留原值进行频率统计，但比较时使用原数值
                const key = String(num);
                const count = (freqMap.get(key) || 0) + 1;
                freqMap.set(key, count);
                if (count > maxFreq) maxFreq = count;
            }
            let modeValues = [];
            if (maxFreq > 1) {
                for (let [key, count] of freqMap.entries()) {
                    if (count === maxFreq) {
                        modeValues.push(parseFloat(key));
                    }
                }
            }
            // 如果所有数字出现频率相同且maxFreq===1 或众数个数等于总数 -> 无众数
            let modeDisplay = '';
            if (modeValues.length === 0 || modeValues.length === numbers.length) {
                modeDisplay = '无众数';
            } else {
                // 众数格式化，逗号连接
                modeDisplay = modeValues.map(v => formatModeValue(v)).join(', ');
            }

            // 总体方差 & 标准差 (总体)
            let variance = 0;
            for (let val of numbers) {
                variance += Math.pow(val - mean, 2);
            }
            variance = variance / n;
            const stdDev = Math.sqrt(variance);

            resultsContainer.innerHTML = `
                <div class="result-item">
                    <span class="result-label">和：</span>
                    <span class="result-value">${formatNumber(sum)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">平均值：</span>
                    <span class="result-value">${formatNumber(mean)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">中位数：</span>
                    <span class="result-value">${formatNumber(median)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">众数：</span>
                    <span class="result-value">${modeDisplay}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">总体方差：</span>
                    <span class="result-value">${formatNumber(variance)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">总体标准差：</span>
                    <span class="result-value">${formatNumber(stdDev)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">极差：</span>
                    <span class="result-value">${formatNumber(rangeVal)}</span>
                </div>
                <div class="result-item">
                    <span class="result-label">最小值 / 最大值：</span>
                    <span class="result-value">${formatNumber(minVal)} / ${formatNumber(maxVal)}</span>
                </div>
            `;
        }

        // 绑定计算事件
        calculateBtn.addEventListener('click', calculateStatistics);

        // 允许回车快捷计算
        numbersInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                calculateStatistics();
            }
        });

        // 占位
        if (!numbersInput.value.trim()) {
            numbersInput.placeholder = "例如: 12.5 8 20.3 15 8 9.6";
        }