import { defineConfig } from 'vite';
import { resolve } from 'path';
import copy from 'rollup-plugin-copy';

export default defineConfig({
  root: './',
  resolve: {
    alias: {
      '/js': resolve(import.meta.dirname, 'src/js'),          // 将 /js 映射到 src/js
      '/css': resolve(import.meta.dirname, 'src/css'),        // 如果 CSS 在 JS 中被导入，同样处理
      '/assets': resolve(import.meta.dirname, 'src/assets'),  // 图片等静态资源（如果有导入）
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'js/entry/main': resolve(import.meta.dirname, 'src/js/entry/main.ts'),
        'js/standalone/404': resolve(import.meta.dirname, 'src/js/standalone/404.ts'),
        'js/data/sw': resolve(import.meta.dirname, 'src/js/data/sw.js'),
        'js/ui/personal-card': resolve(import.meta.dirname, 'src/js/ui/personal-card.ts'),
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