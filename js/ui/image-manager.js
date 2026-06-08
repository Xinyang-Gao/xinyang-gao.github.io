// /js/ui/image-manager.js
// 图片延迟加载与全局图片查看器管理

export class LazyImageLoader {
  static init() {
    if (!('IntersectionObserver' in window)) {
      console.warn('[LazyImageLoader] 浏览器不支持 IntersectionObserver，跳过懒加载');
      return;
    }

    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('loaded');
            delete img.dataset.src;
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '50px 0px', threshold: 0.01 });

    const lazyImages = document.querySelectorAll('img[data-src]');
    lazyImages.forEach(img => imageObserver.observe(img));
  }
}

export class GlobalImageManager {
  static init() {
    document.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (!img) return;
      if (img.closest('.no-image-viewer') || img.classList.contains('no-image-viewer')) return;
      if (img.closest('.modern-image-viewer')) return;
      if (img.closest('.list-item, .recent-item')) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.ImageViewer === 'undefined') {
        const script = document.createElement('script');
        script.src = '/js/ui/image-viewer.js';
        script.onload = () => this.openViewerForImage(img);
        document.head.appendChild(script);
      } else {
        this.openViewerForImage(img);
      }
    });
  }

  static openViewerForImage(clickedImg) {
    let container = clickedImg.closest('#mainContent, .article-body, .post-content, .list-item, main, .container, body');
    if (!container) container = document.body;
    const allImgs = container.querySelectorAll('img:not(.no-image-viewer):not(.viewer-image)');
    const gallery = [];
    let currentIndex = 0;

    allImgs.forEach((img, idx) => {
      const src = img.dataset.src || img.src;
      if (!src || (src.startsWith('data:') && src.length < 100)) return;
      if (img === clickedImg) currentIndex = gallery.length;
      gallery.push({ src, alt: img.alt || img.title || '' });
    });

    if (!gallery.length) {
      console.warn('[ImageViewer] 未找到可展示的图片');
      return;
    }

    const needPreload = clickedImg.dataset.src && (!clickedImg.src || clickedImg.src === '');
    if (needPreload) {
      const tempImg = new Image();
      tempImg.onload = () => {
        clickedImg.src = clickedImg.dataset.src;
        clickedImg.classList.remove('lazy-loading');
        clickedImg.classList.add('loaded');
        delete clickedImg.dataset.src;
        new window.ImageViewer(gallery, currentIndex);
      };
      tempImg.src = clickedImg.dataset.src;
    } else {
      new window.ImageViewer(gallery, currentIndex);
    }
  }
}
