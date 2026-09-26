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
      input: {
        'js/entry/main': r('src/js/entry/main.ts'),
        'js/standalone/404': r('src/js/pages/404.ts'),
        'js/data/sw': r('src/js/data/sw.js'),
        'js/ui/personal-card': r('src/js/ui/personal-card.ts'),
      },
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
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
