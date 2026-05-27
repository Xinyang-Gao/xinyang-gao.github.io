// ==================== /js/page-manager.js ====================
// 页面管理器基类/接口定义，所有页面管理器都应实现 init 和 destroy 方法

export class PageManager {
  init() {
    throw new Error('子类必须实现 init 方法');
  }
  
  destroy() {
    throw new Error('子类必须实现 destroy 方法');
  }
}