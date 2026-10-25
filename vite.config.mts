import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import copy from 'rollup-plugin-copy';

/**
 * 以配置文件自身位置为基准解析路径，
 * 避免依赖 `process.cwd()`（CI 与本地的工作目录可能不同）。
 */
const root = fileURLToPath(new URL('.', import.meta.url));
const r = (...parts: string[]) => resolve(root, ...parts);

export default defineConfig({
  root,
  base: '/',
  resolve: {
    alias: {
      '/js': r('src/js'),
      '/css': r('src/css'),
      '/assets': r('src/assets'),
    },
  },
  build: {
    /**
     * ⚠️ 构建时会有两条 `INEFFECTIVE_DYNAMIC_IMPORT` 警告，属**预期行为**，不要"修"：
     *   · `button-manager.ts` → `import('/js/data/settings.js')`
     *   · `settings.ts` → `import('/js/ui/ui-effects.js')`
     * 这两个模块同时被别处静态导入，所以动态导入不会把它们切成独立 chunk
     * （代码已在主包里，运行时正常）。
     * 之所以保留动态写法，是因为 settings ↔ ui-effects 相互引用，
     * 用动态 import **打破循环依赖** —— 改成静态 import 会真的产生循环。
     */
    outDir: 'dist',
    /**
     * 必须保持 false：本项目的 dist 由 Python 构建系统（run.py）与其他生成器共同写入，
     * Vite 只是其中一步，清空会删除已生成的 HTML / JSON / RSS。
     * 需要干净构建请使用 `python run.py --clean`。
     */
    emptyOutDir: false,
    target: 'es2020',
    assetsDir: 'assets',
    sourcemap: false,
    // 产物体积统计需要额外压缩计算，CI 上无意义且拖慢构建
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      /**
       * 入口 = 所有被 HTML / Python 生成器**硬编码引用**的产物路径。
       *
       * 以前用 `preserveModules: true`，靠"源码路径 == 产物路径"这层巧合让
       * 硬编码的 `/js/pages/about.js` 之类成立，代价是 47 个模块原样输出、
       * 首屏要发几十个请求。改成真正打包后必须显式声明这些入口，
       * 并配合 `entryFileNames: '[name].js'` 固定输出路径，硬编码才继续有效。
       *
       * 其余页面脚本（home-manager / search-render / stats-manager / friends-manager /
       * image-viewer / twikoo-manager / privacy-content 等）由 router 动态 import，
       * Rollup 会自动切成独立 chunk 并改写引用，无需在此声明。
       */
      input: {
        'js/entry/main': r('src/js/entry/main.ts'),
        'js/pages/404': r('src/js/pages/404.ts'),
        'js/pages/about': r('src/js/pages/about.ts'),
        'js/pages/article': r('src/js/pages/article.ts'),
        'js/pages/timeline': r('src/js/pages/timeline.ts'),
        // Service Worker 必须独立：它有自己全局作用域，不能与页面代码共享 chunk
        'js/data/sw': r('src/js/data/sw.js'),
      },
      output: {
        // 固定文件名（不带 hash）：HTML 与生成器里是硬编码路径，改名即 404。
        // 缓存失效靠 HTML 上的 ?v= 参数与 SW 的 Stale-While-Revalidate，
        // SW 注释里也明确写着"产物无 hash"，这里保持一致。
        entryFileNames: '[name].js',
        chunkFileNames: 'js/chunk/[name].js',
        assetFileNames: '[name].[ext]',
      },
      plugins: [
        copy({
          // 仅在构建阶段生效（serve 时 hook 为 undefined），避免 dev 期重复复制
          hook: 'writeBundle',
          targets: [{ src: 'src/js/vendor/*.min.js', dest: 'dist/js/vendor' }],
          verbose: true,
        }),
      ],
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    open: false,
    fs: {
      // 允许访问工作区根目录下的 src / dist，便于 dev 调试构建产物
      allow: [r('src'), r('dist')],
      strict: true,
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
