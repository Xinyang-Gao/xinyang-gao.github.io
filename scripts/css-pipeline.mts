/**
 * CSS 构建管线（Vite 插件，仅 build 生效）。
 *
 * 原先 CSS 由 Python 侧 `rcssmin` 遍历压缩、再手工合并 core.css；现在统一交给
 * Vite 自带的 Lightning CSS（Vite 8 的直接依赖，版本由 package-lock 锁定）：
 *   - `src/css/**\/*.css` 逐个压缩，原样保持目录结构输出到 `dist/css/**\/*.css`
 *   - 按层叠顺序合并 6 个 core 文件为 `dist/css/core.css`
 *
 * 产物路径与旧流程完全一致，因此 HTML 的 `<link>` 与 JS 里动态注入的
 * `/css/components/*.css` 都不需要改动。
 *
 * 注意：插件里显式关掉 @import / url() 的重写（不传 targets、不 bundle），
 * 因为站点 CSS 里的资源引用都是 `/assets/...` 开头的绝对路径，且产物
 * 目录结构与源码一致，交给 Lightning CSS 解析反而可能改写路径。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';
import type { Plugin } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS_SRC = join(ROOT, 'src/css');
const CSS_DIST = join(ROOT, 'dist/css');

/** core 合并顺序 = 各页面原先 <link> 的引用顺序；变量必须最先，顺序错会破坏层叠 */
const CORE_ORDER = [
  'core/variables.css',
  'core/base.css',
  'core/sky-backdrop.css',
  'core/ground.css',
  'core/layout.css',
  'core/components.css',
] as const;

function walkCss(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkCss(full, rel));
    } else if (entry.name.endsWith('.css')) {
      out.push(rel);
    }
  }
  return out.sort();
}

/** 内容一致则不写盘，避免 dist 的 mtime 抖动影响增量判断 */
function writeIfChanged(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  try {
    if (readFileSync(file, 'utf8') === content) return;
  } catch {
    // 目标不存在，正常写入
  }
  writeFileSync(file, content, 'utf8');
}

export function cssPipeline(): Plugin {
  return {
    name: 'site-css-pipeline',
    apply: 'build',
    writeBundle() {
      const files = walkCss(CSS_SRC);
      const minified = new Map<string, string>();

      for (const rel of files) {
        const source = readFileSync(join(CSS_SRC, rel), 'utf8');
        const css = transform({
          filename: rel,
          code: Buffer.from(source),
          minify: true,
        }).code.toString();
        minified.set(rel, css);
        writeIfChanged(join(CSS_DIST, rel), css);
      }

      const missing = CORE_ORDER.filter((rel) => !minified.has(rel));
      if (missing.length) {
        throw new Error(`[css] core 合并缺少源文件: ${missing.join(', ')}`);
      }
      const bundle = CORE_ORDER.map((rel) => minified.get(rel)).join('\n');
      writeIfChanged(join(CSS_DIST, 'core.css'), bundle);

      console.log(`[css] ${files.length} 个样式已压缩，core.css 已合并（${bundle.length} 字节）`);
    },
  };
}
