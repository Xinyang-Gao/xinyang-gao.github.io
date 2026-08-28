---
title: 我帮 Tooltip 治好了"强迫换行症"，过程比想象中曲折
date: 2026-08-28
description: 网站的开发日志，Tooltip 组件的一个诡异问题修复经历
author: 高新炀
tag:
  - 分享
  - 技术
  - 网站
category: 分享
last_updated: 2026-08-28
---

### 事情是这样开始的

最近，我在给我的网站添加一个 Tooltip 组件。功能不算复杂——鼠标悬停时弹出一个带逐字动画的气泡提示框。

一顿敲击猛如虎，很快啊，一个 Tooltip 就做好啦！样式、动画、逻辑都没问题。

再完善一下就可以啦，需求很清楚简单：

1. 宽度由内容决定，不要擅自给单行换行
2. 只有在屏幕边缘放不下时才换行
3. 换行后文字不能溢出背景
4. 还有一个小 BUG ——单行文字的意外换行（重点）

![存在的BUG-1.png](https://s41.ax1x.com/2026/08/28/pnCnUJI.png)

![存在的BUG-2.png](https://s41.ax1x.com/2026/08/28/pnCnJdH.png)

看起来是个很"常规"的需求，对吧？我当时也是这么想的。天真的我殊不知，噩梦即将开始……

### 第一次尝试：加 2px 冗余

原来的实现里，宽度是测量后手动设置的。但偶尔会出现一种诡异的情况：一行文本末尾的一两个字符会被"挤"到下一行，而背景的高度却没有跟着增加，导致文字溢出了背景。

我的第一反应是——测量精度问题。

于是我加了一行代码：

```typescript
textEl.style.width = finalWidth + 2 + 'px';
```

加 2px 冗余，给浏览器渲染留点余量。

结果是好了，但没完全好。有些文本依然会溢出，而且溢出的规律完全捉摸不透——有时长中文没问题，有时中文几个字符就出BUG，有时中文+英文+空格混排没问题，有时有问题。

### 问题比我想象的深

我开始怀疑：是不是 `offsetWidth` 不可靠？

于是做了一个实验：同样的文本内容，用 `measure.offsetWidth` 和 `measure.getBoundingClientRect().width` 分别测量，结果居然不一样，而且差得不止一星半点。

> 好家伙，原来我一直在用一个"薛定谔的宽度"做布局（？）

更麻烦的是，`textEl` 是 `position: absolute` 的子元素，在 `width: auto` 的情况下，`offsetWidth` 的返回值受父容器的影响，并不是纯粹的内容宽度。这个值在测量的时候是一个样，真正渲染的时候又是另一个样。

难怪加了冗余还是不稳定。

### 第一次重构：用浏览器自己的布局引擎

我换了一种思路——不量了，让浏览器自己算。

把文本内容先塞进 `textEl`，设置 `opacity: 0` 隐藏，然后读取 `scrollWidth` 和 `offsetHeight`，拿到值之后再固定 `width`。

听起来很合理，对吧？

结果跑起来发现：宽度变成了一个固定值，只有高度在变化。拿到的 `offsetWidth` 始终是一个很窄的值——42px（我到现在仍未搞懂为什么是 42px 不是别的什么，~~不愧是宇宙终极答案~~），而内容明明很长。

```html
<!-- 内容截自控制台：实际渲染出来的宽度只有 42px（width: 42px; height: 578px; ） -->
<div class="tooltip-container" style="position: fixed; pointer-events: none; z-index: 10000; opacity: 1; transition: left 0.18s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.18s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.3s; left: 1131px; top: 10px;"><div class="tooltip-bg" style="position: absolute; top: 0px; left: 0px; width: 42px; height: 578px; background-color: rgba(var(--accent-rgb), 0.85); border-radius: 6px; box-shadow: rgba(0, 0, 0, 0.5) 0px 0px 0px 2px; transition: width 960ms cubic-bezier(0.34, 1.2, 0.64, 1), height 960ms cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.15s, opacity 0.15s; opacity: 1; overflow: visible;"></div><div class="tooltip-text" style="position: absolute; top: 0px; left: 0px; padding: 8px 14px; color: rgb(255, 255, 255); font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; opacity: 1; pointer-events: none; overflow: visible; width: 42px; max-width: none;"><div class="tooltip-line" style="display: block;"><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">A</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">P</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">l</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">a</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">y</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">e</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">r</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">&nbsp;</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">音</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">乐</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">播</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">放</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">器</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">分</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">支</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">（</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">基</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">于</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">&nbsp;</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">V</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">u</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">e</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">3</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">&nbsp;</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">的</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">新</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">U</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">I</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">/</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">U</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">X</span><span class="tooltip-char" style="opacity: 1; transition: opacity 0.1s;">）</span></div></div></div>
```

![长条渲染的tooltip.png](https://s41.ax1x.com/2026/08/28/pnCn0Qf.png)

![长条渲染的tooltip且超出了屏幕.png](https://s41.ax1x.com/2026/08/28/pnCnwSP.png)

文字被挤成了一长条，背景高度撑到 578px，宽度却只有 42px。

这下问题更严重了……事已至此先吃饭罢。

### 冷静分析：根本原因是什么？

花了亿点时间梳理：

1. `offsetWidth` 对 `position: absolute` + `width: auto` 的元素不可靠
2. `scrollWidth` 在某些情况下也会受父容器影响
3. 测量时机、字体加载、回流状态都会影响结果
4. 中英文混排时，不同字体的度量标准不同，测量偏差更大

**核心矛盾**：我需要在一个脱离文档流的元素里，获取"内容自然撑开后的宽度"，但脱离文档流本身就会影响宽度的计算方式。

### 终局方案：独立测量 + 安全冗余

干脆放弃用主 `textEl` 做测量的想法。

我写了一个独立的 `measureText` 函数，每次创建一个新的隐藏元素，用 `display: inline-block` 让内容自然撑开，然后用 `getBoundingClientRect()` 拿精确值。测量完就销毁，完全不污染主布局。

关键代码长这样：

```typescript
private measureText(text: string, maxWidth?: number) {
  const measure = document.createElement('div');
  Object.assign(measure.style, {
    position: 'fixed',
    visibility: 'hidden',
    display: 'inline-block', // ← 关键：让内容自然撑开
    padding: '8px 14px',
    fontSize: '0.9rem',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxWidth: maxWidth !== undefined ? maxWidth + 'px' : 'none',
  });
  measure.textContent = text;
  document.body.appendChild(measure);
  const rect = measure.getBoundingClientRect();
  document.body.removeChild(measure);
  return { width: rect.width, height: rect.height };
}
```

流程变成：

1. 测量自然宽度
2. 判断是否超出屏幕（左边放不下且右边也放不下）
3. 如果超出，用 `maxWidth` 重新测量
4. 拿到精确尺寸后，**再加 2px 安全冗余**
5. 用这个最终值设置主 `textEl` 和背景的宽高

两步测量，互相独立，互不干扰。

### 结果

"几乎完全解决问题了，剩下的零星问题都是文本包含复杂字符的（中文+英文+空格，还有一些标点）"
![复杂混排的问题.png](https://s41.ax1x.com/2026/08/28/pnCnaWt.png)

于是最后一步，在最终宽度上统一加 2px，让浏览器有足够的容错空间。复杂字符混排在 2px 的余量下也乖乖待在自己该待的位置，不再随意换行。
![最终成果-1.png](https://s41.ax1x.com/2026/08/28/pnCnNFA.png)
![最终成果-2.png](https://s41.ax1x.com/2026/08/28/pnCnYod.png)

### 一点感悟

**先说经验**

`offsetWidth` 不是万能的。对脱离文档流的元素，它的返回值经常"仅供参考"。`getBoundingClientRect()` 配合独立的测量容器更可靠。

浏览器在字体渲染、子像素对齐上存在细微差异，留一点余量可以避免很多奇怪的边界情况。

测量和渲染要分离。拿测量元素做渲染、拿渲染元素做测量，都会互相干扰。各司其职更干净。

**再说感受**

一个看起来"很简单"的 Tooltip，折腾了好几轮才彻底解决。过程确实有亿些曲折，但它让我想明白了——

很多时候，技术方案的问题不在"有没有"，而在于"用在哪"。同样的属性、同样的 API，放在不同的上下文里，效果可能完全不一样。理解上下文的差异，比记住 API 的用法更重要。

当然啦，最后 Tooltip 稳定运行了。它现在能正确处理中英混排、各种标点符号、甚至 emoji 也不会溢出。宽度由内容决定，只在真正需要的时候才换行。你可以在我的网站中看到。

看着它终于"正常"了，我长舒了一口气。

*一个 Tooltip 的修复日记，比预期长了三倍，但收获也多了三倍*