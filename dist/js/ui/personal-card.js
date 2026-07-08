var e=null;function t(){return`
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-avatar-wrapper">
          <img
            src="/assets/avatar.webp"
            alt="高新炀的头像"
            class="profile-avatar"
            fetchpriority="high"
            onerror="this.src='https://via.placeholder.com/120?text=GXY'"
          >
        </div>
        <h2 class="profile-name">高新炀</h2>
        <p class="profile-bio">一个15岁爱探索的小孩子~</p>
      </div>

      <div class="profile-body">
        <div class="profile-info-item">
          <i class="fas fa-quote-left" aria-hidden="true"></i>
          <span>Where there's a will, there's a way</span>
        </div>
        <div class="profile-info-item">
          <i class="fas fa-envelope" aria-hidden="true"></i>
          <a href="mailto:gao-xinyang@foxmail.com">gao-xinyang@foxmail.com</a>
        </div>
        <div class="profile-info-item">
          <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
          <span>中国 · 河南</span>
        </div>
        <div class="profile-info-item">
          <i class="fas fa-code" aria-hidden="true"></i>
          <span>Java / Python</span>
        </div>
      </div>

      <div class="profile-social">
        <a
          href="https://github.com/Xinyang-Gao"
          target="_blank"
          class="social-link"
          aria-label="GitHub"
          rel="noopener noreferrer"
        >
          <i class="fab fa-github"></i>
        </a>
        <a
          href="https://space.bilibili.com/1064600697"
          target="_blank"
          class="social-link"
          aria-label="Bilibili"
          rel="noopener noreferrer"
        >
          <i class="fab fa-bilibili"></i>
        </a>
        <a
          href="mailto:gao_xinyang@foxmail.com"
          class="social-link"
          aria-label="邮箱"
        >
          <i class="fas fa-envelope"></i>
        </a>
        <a
          href="https://user.qzone.qq.com/2489083744/"
          target="_blank"
          class="social-link"
          aria-label="QQ"
          rel="noopener noreferrer"
        >
          <i class="fab fa-qq"></i>
        </a>
        <a
          href="/rss.xml"
          target="_blank"
          class="social-link"
          aria-label="RSS"
          rel="noopener noreferrer"
        >
          <i class="fas fa-rss"></i>
        </a>
      </div>

      <div class="profile-travelling">
        <a
          href="https://www.travellings.cn/go.html"
          target="_blank"
          rel="noopener"
          title="开往-友链接力"
        >
          <img
            class="travelling-img travelling-light"
            data-viewer-exclude="true"
            src="https://www.travellings.cn/assets/w.png"
            alt="开往-友链接力（浅色）"
            width="120"
            loading="lazy"
          >
          <img
            class="travelling-img travelling-dark"
            data-viewer-exclude="true"
            src="https://www.travellings.cn/assets/b.png"
            alt="开往-友链接力（深色）"
            width="120"
            loading="lazy"
          >
        </a>
      </div>

      <div class="profile-tags">
        <span class="tag tag-interest">Python</span>
        <span class="tag tag-interest">Html</span>
        <span class="tag tag-interest">Scratch</span>
        <span class="tag tag-interest">绘画</span>
        <span class="tag tag-interest">轮滑</span>
        <span class="tag tag-interest">Minecraft</span>
      </div>
    </div>
  `}function n(){let n=document.getElementById(`personal-card-container`);if(n)if(e||=t(),n.innerHTML!==e){n.innerHTML=e;let t=n.querySelector(`.profile-card`);t&&requestAnimationFrame(()=>{t.classList.add(`visible`)})}else{let e=n.querySelector(`.profile-card`);e&&!e.classList.contains(`visible`)&&requestAnimationFrame(()=>{e.classList.add(`visible`)})}}if(typeof window<`u`){let e=()=>n();document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,e):e(),window.addEventListener(`ajax:navigation`,e)}export{t as generatePersonalCardHTML,n as renderPersonalCard};