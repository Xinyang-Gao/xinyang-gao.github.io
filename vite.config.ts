import { defineConfig } from 'vite';
import { resolve } from 'path';

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
      },
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      }
    }
  },
  server: {
    root: 'dist',  // 开发时以 dist 为根目录（需确保已构建）
  }
});