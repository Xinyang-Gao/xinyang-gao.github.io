// /js/ui/loading-overlay-manager.ts
// 加载覆盖层：版本检测、数据预加载、更新提示

import { CONFIG, storageController, Utils } from '/js/core/core.js';

export class LoadingOverlayManager {
  private overlay: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private logContainer: HTMLElement | null = null;
  private logBuffer: { module: string; msg: string; indent: number; time: string }[] = [];
  private logIndex = 0;

  private async fetchData(endpoints: Array<{ key: string; url: string }>) {
    const results = await Promise.allSettled(
      endpoints.map(({ url }) =>
        fetch(url, { cache: 'no-store' })
          .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      )
    );
    const dataMap: Record<string, any> = {};
    results.forEach((result, idx) => {
      const key = endpoints[idx].key;
      if (result.status === 'fulfilled') dataMap[key] = result.value;
      else {
        console.warn(`[LoadingOverlay] ${key} 加载失败`, result.reason);
        dataMap[key] = null;
      }
    });
    return dataMap;
  }

  private addLog(module: string, msg: string, indent = 0) {
    const time = new Date().toLocaleTimeString();
    this.logBuffer.push({ module, msg, indent, time });
  }

  private flushLogs() {
    if (!this.logContainer || this.logBuffer.length === 0) return;
    const fragment = document.createDocumentFragment();
    this.logBuffer.forEach(({ module, msg, indent, time }) => {
      const line = document.createElement('div');
      line.className = `log-entry log-module-${module}`;
      const indentStr = '│ '.repeat(indent) + (indent > 0 ? '├── ' : '');
      line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-module-name">[${module}]</span> ${indentStr}${msg}`;
      line.style.animationDelay = (this.logIndex * 0.035) + 's';
      fragment.appendChild(line);
      this.logIndex++;
    });
    this.logContainer.appendChild(fragment);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    this.logBuffer = [];
  }

  private restoreScroll() {
    document.body.classList.remove('loading');
    document.body.style.overflow = '';
  }

  /**
   * 显示加载覆盖层，返回 Promise，在用户点击后 resolve
   */
  public show(): Promise<void> {
    return new Promise((resolve) => {
      this.overlay = document.getElementById('loading-overlay');
      if (!this.overlay) {
        console.warn('[LoadingOverlay] #loading-overlay 不存在，跳过');
        resolve();
        return;
      }

      document.body.style.overflow = 'hidden';

      this.logContainer = this.overlay.querySelector('.loading-log');
      if (!this.logContainer) {
        this.logContainer = document.createElement('div');
        this.logContainer.className = 'loading-log';
        this.overlay.appendChild(this.logContainer);
      } else {
        this.logContainer.innerHTML = '';
      }

      this.content = document.getElementById('loading-content');

      // 1. 初始系统日志
      this.addLog('System', '加载覆盖层已启动');
      this.addLog('System', `浏览器标识: ${navigator.userAgent.split(' ').slice(0, 3).join(' ')}`);
      this.addLog('System', `当前页面: ${window.location.href}`);
      this.addLog('System', '主题偏好: 从本地存储读取或根据时段自动选择');
      this.addLog('System', '本地存储已授权 (默认同意)');
      this.addLog('System', '加载核心配置参数...');
      this.addLog('System', '配置加载完成 (API端点、白名单、背景图列表等)');
      this.flushLogs();

      // 2. 网络请求
      const endpoints = [
        { key: 'statistics', url: `${CONFIG.API.STATISTICS}?t=${Date.now()}` },
        { key: 'articles', url: `${CONFIG.API.ARTICLES}?t=${Date.now()}` },
        { key: 'works', url: `${CONFIG.API.WORKS}?t=${Date.now()}` },
        { key: 'code', url: '/json/code_analysis.json?t=' + Date.now() },
        { key: 'friends', url: '/json/friends.json?t=' + Date.now() },
        { key: 'version', url: '/json/version.json?t=' + Date.now() },
      ];

      this.addLog('Data', '检查网络连接状态...');
      this.addLog('Data', '网络连接正常，开始并行请求关键数据');
      this.addLog('Data', '发起请求: 统计信息、文章列表、作品列表、代码分析、友链、版本信息');
      this.flushLogs();

      this.fetchData(endpoints).then((dataMap) => {
        // 3. 解析统计数据
        const stats = dataMap.statistics || null;
        let currentVersion = stats?.version ? String(stats.version).trim() : null;
        if (stats) {
          this.addLog('Data', '解析统计信息...');
          this.addLog('Data', `  版本号: ${currentVersion || '未知'}`, 1);
          this.addLog('Data', `  文章总数: ${stats.total_articles || 0}`, 1);
          this.addLog('Data', `  作品总数: ${stats.total_works || 0}`, 1);
          this.addLog('Data', `  总字数: ${(stats.total_word_count || 0).toLocaleString()}`, 1);
          this.addLog('Data', `  文章标签数: ${stats.total_article_tags || 0}`, 1);
          this.addLog('Data', `  作品标签数: ${stats.total_work_tags || 0}`, 1);
          this.addLog('Data', `  最后更新: ${stats.last_updated || '未知'}`, 1);
        }

        const articlesData = dataMap.articles || null;
        if (articlesData) {
          const count = articlesData.total_articles || articlesData.articles?.length || 0;
          this.addLog('Data', `文章列表加载成功 (${count} 篇)`);
          if (articlesData.articles?.length) {
            const latest = articlesData.articles[0]?.title || '无';
            const oldest = articlesData.articles[articlesData.articles.length - 1]?.title || '无';
            this.addLog('Data', `  最近文章: ${latest}`, 1);
            this.addLog('Data', `  最早文章: ${oldest}`, 1);
            const cats = new Set();
            articlesData.articles.forEach(a => { if (a.category) cats.add(a.category); });
            if (cats.size) this.addLog('Data', `  文章分类: ${Array.from(cats).join(', ')}`, 1);
          }
        }

        const worksData = dataMap.works || null;
        if (worksData) {
          const count = worksData.works?.length || 0;
          this.addLog('Data', `作品列表加载成功 (${count} 个)`);
          if (worksData.works?.length) {
            const tags = new Set();
            worksData.works.forEach(w => {
              const t = w.tag || w.tags || [];
              (Array.isArray(t) ? t : []).forEach(tag => tags.add(tag));
            });
            if (tags.size) this.addLog('Data', `  作品标签: ${Array.from(tags).join(', ')}`, 1);
          }
        }

        const codeData = dataMap.code || null;
        if (codeData) {
          this.addLog('Data', `代码分析加载成功 (${codeData.total_files || 0} 个文件)`);
          this.addLog('Data', `  总代码行数: ${(codeData.total_lines || 0).toLocaleString()}`, 1);
          this.addLog('Data', `  非空行数: ${(codeData.non_empty_lines || 0).toLocaleString()}`, 1);
          if (codeData.by_extension?.length) {
            const topExt = codeData.by_extension.sort((a, b) => b.count - a.count)[0];
            this.addLog('Data', `  主要文件类型: ${topExt.extension} (${topExt.count} 个文件)`, 1);
          }
        }

        const friendsData = dataMap.friends || null;
        if (friendsData) {
          const count = Array.isArray(friendsData) ? friendsData.length : 0;
          this.addLog('Data', `友链加载成功 (${count} 个好友)`);
          if (count) {
            const names = friendsData.slice(0, 3).map(f => f.name).join('、');
            this.addLog('Data', `  友链示例: ${names}${count > 3 ? ' 等' : ''}`, 1);
          }
        }
        this.flushLogs();

        // 4. UI 组件状态
        this.addLog('UI', '用户界面组件初始化完成');
        const cursorEnabled = localStorage.getItem('settings_cursor_enabled') !== 'false';
        this.addLog('UI', `  自定义光标: ${cursorEnabled ? '启用' : '已禁用'}`, 1);
        this.addLog('UI', `  外链拦截: ${localStorage.getItem('settings_link_warning_enabled') !== 'false' ? '启用' : '已禁用'}`, 1);
        this.addLog('Player', '音乐播放器模块已就绪');
        this.addLog('Chart', '统计图表渲染完成');
        this.flushLogs();

        // 5. 版本检测
        const versionData = dataMap.version || null;
        let allVersions: any[] = [];
        let latestWebVersion: string | null = null;
        if (versionData && Array.isArray(versionData.versions)) {
          allVersions = versionData.versions.slice().sort((a, b) => a.id - b.id);
          if (allVersions.length) latestWebVersion = allVersions[allVersions.length - 1].version;
        }

        this.addLog('Version', '读取本地存储的网站版本...');
        let storedVersion: string | null = null;
        if (storageController.isAllowed()) {
          storedVersion = storageController.getItem('siteVersion');
        }
        this.addLog('Version', `本地版本: ${storedVersion || '无'}`);
        this.addLog('Version', `远程最新版本: ${latestWebVersion || '无'}`);

        const needUpdate = !storedVersion || (latestWebVersion && storedVersion !== latestWebVersion);
        this.addLog('Version', `版本比对结果: ${needUpdate ? '需要更新' : '版本一致'}`);

        if (!needUpdate) {
          this.addLog('Version', '版本一致，加载完成，即将进入页面');
          this.flushLogs();
          this.overlay!.classList.add('hidden');
          this.restoreScroll();
          this.addLog('System', '覆盖层已关闭，页面可交互');
          this.flushLogs();
          resolve();
          return;
        }

        // 6. 生成更新信息
        this.addLog('Version', '检测到版本更新，准备生成更新提示');
        let startIdx = 0;
        if (storedVersion) {
          const foundIdx = allVersions.findIndex(v => v.version === storedVersion);
          if (foundIdx !== -1) startIdx = foundIdx + 1;
          else startIdx = Math.max(0, allVersions.length - 3);
        } else {
          startIdx = Math.max(0, allVersions.length - 3);
        }
        const relevantVersions = allVersions.slice(startIdx);

        let versionMsg = '';
        if (storedVersion && relevantVersions.length > 0) {
          const firstVer = relevantVersions[0].version;
          const lastVer = relevantVersions[relevantVersions.length - 1].version;
          if (relevantVersions.length === 1) {
            versionMsg = `网站已从版本 ${storedVersion} 更新到 ${lastVer}`;
          } else {
            versionMsg = `网站已从版本 ${storedVersion} 更新到 ${lastVer}，共 ${relevantVersions.length} 个版本更新`;
          }
        } else if (relevantVersions.length > 0) {
          const lastVer = relevantVersions[relevantVersions.length - 1].version;
          versionMsg = `当前版本：${lastVer}（最近 ${relevantVersions.length} 个版本）`;
        } else {
          versionMsg = '版本信息暂未获取，欢迎访问';
        }

        if (storageController.isAllowed() && latestWebVersion) {
          storageController.setItem('siteVersion', latestWebVersion);
          this.addLog('Version', `已存储最新版本: ${latestWebVersion}`);
        }

        let awayText = '';
        let record: any = {};
        if (storageController.isAllowed()) {
          const raw = storageController.getItem(CONFIG.STORAGE_KEYS.VISIT_RECORD);
          if (raw) {
            try { record = JSON.parse(raw); } catch { /* ignore */ }
          }
        }
        const lastVisit = record.lastVisit ? Number(record.lastVisit) : null;
        if (lastVisit) {
          const diff = Date.now() - lastVisit;
          const seconds = Math.floor(diff / 1000);
          if (seconds < 60) awayText = `你刚刚离开 ${seconds} 秒`;
          else if (seconds < 3600) awayText = `你已经离开 ${Math.floor(seconds / 60)} 分钟`;
          else if (seconds < 86400) awayText = `你已经离开 ${Math.floor(seconds / 3600)} 小时`;
          else awayText = `你已经离开 ${Math.floor(seconds / 86400)} 天`;
        } else {
          awayText = '欢迎首次访问本站';
        }
        this.addLog('Version', `离开时长: ${awayText}`);
        this.addLog('Version', `版本摘要: ${versionMsg}`);
        this.flushLogs();

        // 7. 渲染更新界面
        let changesHTML = '';
        if (relevantVersions.length > 0) {
          const items = relevantVersions.map(v => {
            const versionLabel = v.version || `v${v.id}`;
            const changeItems = (v.changes || []).slice(0, 5).map((c: any) => {
              const type = Utils.escapeHtml(c.type || '');
              const desc = Utils.escapeHtml(c.description || '');
              return `<li><span class="change-type">[${type}]</span> ${desc}</li>`;
            }).join('');
            if (changeItems) {
              return `<li class="version-header">${versionLabel}</li><ul class="changes-list">${changeItems}</ul>`;
            }
            return '';
          }).filter(s => s).join('');
          if (items) {
            changesHTML = `<div class="changes-container"><h4>📋 更新内容</h4><ul class="changes-list">${items}</ul></div>`;
          }
        }

        this.addLog('UI', '正在渲染更新提示界面...');
        this.flushLogs();

        if (this.content) {
          this.content.classList.add('updated');
          const oldInfo = this.content.querySelector('.update-info');
          if (oldInfo) oldInfo.remove();

          const infoDiv = document.createElement('div');
          infoDiv.className = 'update-info';
          infoDiv.innerHTML = `
            <div class="version-badge">${versionMsg}</div>
            <div class="welcome-message">${awayText}</div>
            ${changesHTML}
            <div class="click-hint">点击任意位置继续</div>
          `;
          this.content.appendChild(infoDiv);
        }

        this.addLog('UI', '更新界面已渲染，等待用户交互');
        this.flushLogs();

        // 8. 点击关闭
        const handler = () => {
          this.overlay!.classList.add('hidden');
          this.restoreScroll();
          window.dispatchEvent(new CustomEvent('welcomeOverlayDismissed'));
          this.overlay!.removeEventListener('click', handler);
          this.addLog('System', '覆盖层已关闭，页面可交互');
          this.flushLogs();
          resolve();
        };
        this.overlay!.addEventListener('click', handler);
        this.addLog('System', '覆盖层就绪，等待用户操作');
        this.flushLogs();
      });
    });
  }
}