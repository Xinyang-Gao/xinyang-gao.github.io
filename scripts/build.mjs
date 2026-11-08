/**
 * 统一构建入口：内容侧（Python）+ 前端侧（Vite）。
 *
 * 过去是 `python run.py` 作为主进程、内部再 spawn `npm run build`，
 * 两套运行时互相嵌套。现在反转为主从关系：
 *   1. python run.py      生成 HTML / RSS / sitemap / JSON，并同步 src/public
 *   2. vite build         编译 TypeScript、压缩并合并 CSS
 *
 * 两个步骤都写 dist，但互不覆盖：Python 负责文本产物与 publicDir 原样文件，
 * Vite 只写 dist/js 与 dist/css（emptyOutDir: false）。
 *
 * GitHub Actions 会自动注入 CI=true，脚本据此给 Python 加 --ci 严格模式。
 *
 * 透传参数：`npm run build -- --clean` / `-- --offline` / `-- --no-parallel`
 * 会原样交给 `python run.py`，方便发布前做干净全量构建。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

/** 只转发约定的内容侧开关，避免无关参数被误传给 Python */
const PASSTHROUGH = new Set(['--clean', '--offline', '--force', '--no-parallel', '--no-strict']);
const extra = process.argv.slice(2).filter((arg) => PASSTHROUGH.has(arg));

function run(command, args, label) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    console.error(`[build] ${label} 无法启动: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[build] ${label} 失败（退出码 ${result.status}）`);
    process.exit(result.status || 1);
  }
}

// 1) 内容侧：HTML / RSS / sitemap / 统计 JSON / 静态资源
run(process.env.PYTHON || 'python', ['run.py', ...(CI ? ['--ci'] : []), ...extra], '内容构建');

// 2) 前端侧：TypeScript 打包 + CSS 压缩合并。
//    直接调用 vite 的 bin 而不是 npm run，跨 Windows 无需处理 .cmd 后缀。
run(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], '前端构建');

console.log('\n[build] 全部完成');
