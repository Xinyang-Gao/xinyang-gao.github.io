---
title: 将 Bing 每日壁纸变成你网站的背景
description: Bing 壁纸 API 的调用、壁纸存档库以及实现方法
author: 高新炀
date: 2026-05-02
tag: [分享][网站]
---

Bing 搜索引擎每天都会更新一张精美的首页背景图片，这些图片来自全球各地的摄影师和艺术家之手，涵盖自然风光、人文建筑、动物趣闻等丰富题材。很多站长都希望将自己网站的背景也换成 Bing 的每日一图——既省去了自己找素材的功夫，又能让网站每天都有新鲜感。这篇文章我会分享如何实现，同时也介绍一些宝藏级的 Bing 壁纸历史归档网站。

## 一、Bing 壁纸 URL 参数解析

要接入 Bing 壁纸，先得明白 Bing 官方图片地址的结构。下面是一个 Bing 壁纸请求链接：

![https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp&w=3840&h=2160&rs=1&c=4](https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp&w=3840&h=2160&rs=1&c=4)

```
https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp&w=3840&h=2160&rs=1&c=4
```

**th**：即 "thumbnail"（缩略图）的缩写，表示这是一个图片资源请求。

**id**：图片的唯一标识符，整体结构为 `OHR.图片名称_区域_随机串_分辨率.jpg`，其中 `OHR` 代表 "One Happy Reminder"，是 Bing 壁纸系列的固定前缀；`ZH-CN` 表示区域为中国（简体中文）；末尾的 `UHD.jpg` 表示超高清图片。正是这个 `id` 参数，配合上 Bing 的不同存储节点，共同构成了Bing图片域名的直链。

**rf**：即 "Referer"（引用来源）的缩写，通常是一个备用文件名，`LaDigue_UHD.jpg` 就是这张图片在 Bing 服务器上的另一个名称标识。

**pid**：即 "Product ID"（产品标识），表示这次请求的来源场景，`hp` 代表这是从 Bing 首页（HomePage）发起的。

**w** 和 **h**：分别代表宽度（Width）和高度（Height），单位是像素。这里 `w=3840`、`h=2160` 正是 4K 超高清分辨率。

**rs**：即 "Resizing Strategy"（缩放策略），`rs=1` 表示在调整图片大小时按照一定的优先级进行处理。

**c**：即 "Cropping"（裁剪模式）。`c=4` 代表 Blind Ratio（盲切），即按图片中心进行比例裁剪；`c=7` 则代表 Smart Ratio（智能裁剪），Bing 会根据画面中识别到的主体内容进行智能裁剪。如果 Bing 无法确定图片的关注区域，就会回退到 Blind Ratio 模式。

微软官方也提供了调优指南：如果你只想调整缩略图的大小，建议只保留 `id` 和 `pid` 两个参数，然后只添加 `w` 或 `h` 其中之一，Bing 会自动保持图片的原始宽高比。

## 二、Bing 历史壁纸网站

如果你需要查找过往的 Bing 壁纸，或者希望嵌入特定的壁纸，下面这几个网站比较实用。

### 1. bing.wdbyte.com

 [bing.wdbyte.com](https://bing.wdbyte.com) 是一个保持了极简的 Bing 壁纸归档站。它每天都会同步抓取必应当天的壁纸，界面非常干净，零广告，不收费，最早可以回溯到 2023 年 2 月的历史壁纸。
 站点导航清晰，可以按月浏览历史壁纸，也支持不同分辨率的下载，对于想一边欣赏历年壁纸一边从中挑选素材的站长来说非常方便。

### 2. bing.img.run

[bing.img.run](https://bing.img.run) 是一个纯手工更新收录的 Bing 壁纸库，不仅收录了 UHD 超高清原图，还有 1920×1080 的高清壁纸、1366×768 的普清壁纸以及 1080×1920 的竖版手机壁纸等多种规格。
它还提供了**开放的 API 接口**，支持直接以图片链接的形式调用。

**今日壁纸接口**：
```html
<!-- 4K 超高清原图 -->
<img src="https://bing.img.run/uhd.php">

<!-- 1080P 高清 -->
<img src="https://bing.img.run/1920x1080.php">

<!-- 手机竖版 1080×1920 -->
<img src="https://bing.img.run/m.php">
```

**随机历史壁纸接口**（收录范围从 2020 年 9 月至今）：
```html
<!-- 随机 4K 超高清原图 -->
<img src="https://bing.img.run/rand_uhd.php">

<!-- 随机 1080P 高清 -->
<img src="https://bing.img.run/rand.php">
```

### 3. 更多值得关注的 Bing 壁纸资源

如果你想进一步扩展素材库，下面这几个站点也值得去看看：

- **wallpaperhub.app**：除了 Bing 每日壁纸外，还收录了大量微软系壁纸，风格多样。
- **DailyWallpaperHub**：一个基于 GitHub 免费资源构建的开源项目，自动聚合 Bing 与 Unsplash 的每日精选壁纸，每张图片还会生成约 500 字的 AI 地理文化故事。

无论是想翻看某年某月某日出现的特定壁纸，还是想获取一个现成的图片链接直接嵌入网站，这些工具都能大大降低访问和获取Bing海量精美壁纸的门槛。

## 三、将 Bing 壁纸集成到你的网站背景

拿到图片 URL 之后，如何让它真正成为网站背景呢？这里有几种方案，按复杂度从低到高排序。

### 方案一：直接使用第三方 API（最简单）

如果你追求最简单直接的方案，可以用上面提到的现成 API：

```css
body {
    background-image: url('https://bing.img.run/uhd.php');
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
}
```

每次用户访问网站时都会加载最新的 Bing 壁纸，无需任何后端代码。

### 方案二：通过 PHP 重定向获取官方图片

如果你希望直接从 Bing 官方获取，可以使用一段极简的 PHP 代码：

```php
<?php
$api_url = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1';
$json = file_get_contents($api_url);
$data = json_decode($json, true);
$image_url = 'https://cn.bing.com' . $data['images'][0]['url'];
header("Location: $image_url");
?>
```

将这段代码保存为 `bing.php`，然后在网站背景中直接引用 `/bing.php` 即可。

### 方案三：使用官方 API 获取元数据

对于有更多定制需求的用户，可以直接调用 Bing 官方的图片归档接口：

```
https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN
```

返回的 JSON 数据中包含了壁纸的 URL、版权信息、标题故事等内容：

```json
{
  "images": [
    {
      "startdate": "20260501",
      "fullstartdate": "202605011600",
      "enddate": "20260502",
      "url": "/th?id=OHR.GreenJasper_ZH-CN3030401138_1920x1080.jpg&rf=LaDigue_1920x1080.jpg&pid=hp",
      "urlbase": "/th?id=OHR.GreenJasper_ZH-CN3030401138",
      "copyright": "阿尔伯塔省贾斯珀国家公园中的小型湖泊与湿地，加拿大 (© Don White/Getty Images)",
      "copyrightlink": "https://www.bing.com/search?q=%E9%98%BF%E5%B0%94%E4%BC%AF%E5%A1%94%E7%9C%81%E8%B4%BE%E6%96%AF%E7%8F%80%E5%9B%BD%E5%AE%B6%E5%85%AC%E5%9B%AD&form=hpcapt&mkt=zh-cn",
      "title": "贾斯珀的自然魅力",
      "quiz": "/search?q=Bing+homepage+quiz&filters=WQOskey:%22HPQuiz_20260501_GreenJasper%22&FORM=HPQUIZ",
      "wp": true,
      "hsh": "5f4e193dc4f1e0ca4ebb8e153d0f05cf",
      "drk": 1,
      "top": 1,
      "bot": 1,
      "hs": []
    }
  ],
  "tooltips": {
    "loading": "正在加载...",
    "previous": "上一个图像",
    "next": "下一个图像",
    "walle": "此图片不能下载用作壁纸。",
    "walls": "下载今日美图。仅限用作桌面壁纸。"
  }
}
```

关键参数说明：
- **`idx`**：图片索引。`idx=0` 为当天，`idx=1` 为前一天，以此类推，最多可以追溯到 16 天前的图片。
- **`n`**：返回图片数量，1-8 张。
- **`mkt`**：市场区域，`zh-CN` 为中国区。

你可以结合前端 JavaScript 定时请求这个接口，实现背景图片的动态轮换，还可以把壁纸的版权信息展示在页面角落。

### 本站的实现方法

预置多张 Bing 4K 壁纸 URL，每次访问随机选取一张，既保证视觉新鲜感，又避免了第三方 API 的不可控因素。

```javascript
// 预置的高清 Bing 壁纸列表（均为 4K UHD 直链）
const BACKGROUND_IMAGE_URLS = [
    'https://cn.bing.com/th?id=OHR.MayLaborDayY26_ZH-CN7554485395_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.OloupenaFalls_ZH-CN2980118660_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.LoganCreek_ZH-CN5372283365_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.PeggysLighthouse_ZH-CN5730463973_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.MendenhallCave_ZH-CN1850649760_UHD.jpg&pid=hp',
    'https://cn.bing.com/th?id=OHR.FanetteIsland_ZH-CN6466809551_UHD.jpg&pid=hp'
];

function applyRandomBackgroundImage() {
    const randomIndex = Math.floor(Math.random() * BACKGROUND_IMAGE_URLS.length);
    const imageUrl = BACKGROUND_IMAGE_URLS[randomIndex];
    document.body.style.backgroundImage = `url('${imageUrl}')`;
}
```