// /js/ui/friend-link-manager.ts
import { bindJumpTriggers } from '/js/ui/jump-dialog.js';

class FriendLinkManager {
  private initialized = false;

  init() {
    if (this.initialized) return;
    const container = document.body; // 或更具体的容器
    bindJumpTriggers(container, {
      triggerSelector: '.friend-card',
      nameSelector: '.friend-name',
      descSelector: '.friend-desc',
      avatarSelector: '.avatar-img, .avatar-placeholder',
      urlAttr: 'href',
      dialogDefaults: {
        countdown: 3,
        redirectTarget: '_blank',
        // 保留原有放大动画：传入 anchorElement 自动从卡片位置展开
        // bindJumpTriggers 会自动将触发器作为 anchorElement
        // 因此无需额外配置
      }
    });
    this.initialized = true;
  }

  refresh() {
    this.initialized = false;
    this.init();
  }
}

export const friendLinkManager = new FriendLinkManager();
// 自动初始化...