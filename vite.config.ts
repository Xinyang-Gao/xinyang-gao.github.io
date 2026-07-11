import { defineConfig } from 'vite';
import { resolve } from 'path';
import copy from 'rollup-plugin-copy';

export default defineConfig({
  root: './',
  resolve: {
    alias: {
      '/js': resolve(__dirname, 'src/js'),          // 将 /js 映射到 src/js
      '/css': resolve(__dirname, 'src/css'),        // 如果 CSS 在 JS 中被导入，同样处理
      '/assets': resolve(__dirname, 'src/assets'),  // 图片等静态资源（如果有导入）
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'js/entry/main': resolve(__dirname, 'src/js/entry/main.ts'),
        'js/standalone/changelog': resolve(__dirname, 'src/js/standalone/changelog.js'),
        'js/standalone/404': resolve(__dirname, 'src/js/standalone/404.js'),
        'js/data/sw': resolve(__dirname, 'src/js/data/sw.js'),
        'js/data/settings': resolve(__dirname, 'src/js/data/settings.ts'),
        'js/data/searchWorker': resolve(__dirname, 'src/js/data/searchWorker.ts'),
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
          targets: [
            { src: 'src/js/vendor/*.min.js', dest: 'dist/js/vendor' }   // ← 只复制 .min.js
          ],
          verbose: true,
        })
      ]
    }
  },
  server: {
    root: 'dist',
  }
});