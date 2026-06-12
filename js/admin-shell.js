// ===== admin-shell.js =====
// 后台公共: 登录门 + 顶部固定导航条 + hash 路由 + 全局 toast/syncMsg
// 各子模块 (admin.js / admin-booking.js / admin-coupons.js / admin-ar.js / admin-users.js)
// 在 window.CampAdmin 命名空间下注册自己的 section 渲染器, shell 自动按 hash 调用

(function () {
  'use strict';

  // ===== 配置 =====
  const ADMIN_PASSWORD = '8888';
  const AUTH_KEY = 'campsite_admin_authed';
  const SECTIONS = [
    { hash: 'points',     icon: '📍', label: '活动点',   group: 'core' },
    { hash: 'activities', icon: '📅', label: '活动配置', group: 'core' },
    { hash: 'users',      icon: '👥', label: '用户',     group: 'data' },
    { hash: 'bookings',   icon: '📋', label: '预约审批', group: 'data' },
    { hash: 'checkin',    icon: '🏆', label: '打卡',     group: 'data' },
    { hash: 'data',       icon: '💾', label: '导入/导出', group: 'data' },
    { hash: 'coupons',    icon: '🎫', label: '优惠券',   group: 'biz' },
    { hash: 'redeem',     icon: '🎟️', label: '券码核销', group: 'biz' },
    { hash: 'ar',         icon: '📸', label: 'AR 贴图',  group: 'biz' },
    { hash: 'ar-default', icon: '🎯', label: 'AR 默认',  group: 'biz' }
  ];

  // ===== 公共工具 =====
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // ===== 顶部固定导航条 =====
  function renderTopNav() {
    if ($('#adminTopNav')) return;  // 防重复渲染
    const wrap = $('.admin-wrap') || $('#adminContent');
    if (!wrap) return;

    // 创建导航条
    const nav = document.createElement('nav');
    nav.id = 'adminTopNav';
    nav.className = 'admin-topnav';
    nav.innerHTML = `
      <div class="admin-topnav-inner">
        <div class="admin-topnav-brand">
          <span class="admin-topnav-brand-icon">🏕️</span>
          <span class="admin-topnav-brand-text">露营地后台</span>
        </div>
        <button class="admin-topnav-burger" id="adminTopNavBurger" aria-label="菜单">☰</button>
        <div class="admin-topnav-tabs" id="adminTopNavTabs">
          ${SECTIONS.map(s => `
            <a class="admin-topnav-tab" data-hash="${s.hash}" href="#${s.hash}">
              <span class="admin-topnav-tab-icon">${s.icon}</span>
              <span class="admin-topnav-tab-label">${s.label}</span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
    wrap.prepend(nav);

    // 汉堡菜单 (移动端)
    const burger = $('#adminTopNavBurger');
    const tabs = $('#adminTopNavTabs');
    if (burger && tabs) {
      burger.addEventListener('click', () => {
        tabs.classList.toggle('open');
        burger.textContent = tabs.classList.contains('open') ? '✕' : '☰';
      });
    }
  }

  function updateTopNavActive() {
    const hash = location.hash.replace('#', '') || 'points';
    $all('.admin-topnav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.hash === hash);
    });
    // 移动端点 tab 后自动收起
    const tabs = $('#adminTopNavTabs');
    const burger = $('#adminTopNavBurger');
    if (tabs && tabs.classList.contains('open')) {
      tabs.classList.remove('open');
      if (burger) burger.textContent = '☰';
    }
  }

  // ===== hash 路由: 切换 .card 显示 =====
  function showSection(hash) {
    hash = (hash || '').replace('#', '') || 'points';
    $all('.card[data-section]').forEach(c => {
      c.style.display = (c.dataset.section === hash) ? '' : 'none';
    });
    // 通知注册的 section 渲染器 (如果用户之前没访问过, 调用 onEnter)
    if (window.CampAdmin && typeof window.CampAdmin.onEnter === 'function') {
      try { window.CampAdmin.onEnter(hash); } catch (e) { console.error('[shell] onEnter failed:', e); }
    }
    updateTopNavActive();
    // 滚动到顶部
    window.scrollTo(0, 0);
  }

  function setupRouting() {
    window.addEventListener('hashchange', () => showSection(location.hash));
    showSection(location.hash);
  }

  // ===== 登录门 =====
  function setupLoginGate() {
    const gate = $('#loginGate');
    const content = $('#adminContent');
    if (!gate || !content) return;

    if (sessionStorage.getItem(AUTH_KEY) === '1') {
      unlock();
      return;
    }

    const form = $('#loginForm');
    const input = $('#loginPassword');
    const error = $('#loginError');
    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const pwd = input.value;
      if (pwd === ADMIN_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, '1');
        unlock();
      } else {
        if (error) {
          error.classList.remove('hidden');
          input.value = '';
          input.focus();
          setTimeout(() => error.classList.add('hidden'), 2000);
        }
      }
    });
    input.focus();
  }

  function unlock() {
    const gate = $('#loginGate');
    const content = $('#adminContent');
    if (gate) gate.classList.add('hidden');
    if (content) content.style.display = '';

    // 渲染顶部导航
    renderTopNav();
    updateTopNavActive();
    setupRouting();

    // 启动: 通知各模块 boot
    if (window.CampAdmin && typeof window.CampAdmin.boot === 'function') {
      try { window.CampAdmin.boot(); } catch (e) { console.error('[shell] boot failed:', e); }
    }

    // 初始化移动端表格卡片化
    initMobileTables();

    // 触发 resize 让 BMap 重算
    window.dispatchEvent(new Event('resize'));
  }

  // ===== 后台表格：自动给 td 加 data-label，用于移动端卡片化 =====
  function enhanceMobileTables() {
    $all('.table-wrap table').forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      if (!headers.length) return;
      table.querySelectorAll('tbody tr').forEach(tr => {
        tr.querySelectorAll('td').forEach((td, i) => {
          if (headers[i] && !td.getAttribute('data-label')) {
            td.setAttribute('data-label', headers[i]);
          }
        });
      });
    });
  }

  function initMobileTables() {
    enhanceMobileTables();
    // 监听表格内容变化，动态添加 data-label
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(mutations => {
        const hasTableChange = mutations.some(m =>
          m.target.closest && m.target.closest('.table-wrap table')
        );
        if (hasTableChange) enhanceMobileTables();
      });
      $all('.table-wrap').forEach(wrap => {
        observer.observe(wrap, { childList: true, subtree: true });
      });
    }
  }

  // ===== 全局 toast =====
  function showSyncMsg(msg, type) {
    const status = $('#syncStatus');
    if (!status) return;
    status.textContent = msg;
    status.style.background = type === 'success' ? '#c8e6c9' : type === 'error' ? '#ffcdd2' : type === 'warning' ? '#fff3cd' : '#e3f2fd';
    status.style.color = type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : type === 'warning' ? '#856404' : '#1565c0';
    setTimeout(() => {
      status.textContent = '';
    }, 2500);
  }

  // ===== 注入 syncStatus 元素 =====
  function ensureSyncStatus() {
    if ($('#syncStatus')) return;
    const div = document.createElement('div');
    div.id = 'syncStatus';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;text-align:center;padding:6px;background:#e3f2fd;color:#1565c0;font-size:13px;z-index:9999;transition:opacity 0.3s';
    document.body.prepend(div);
  }

  // ===== 暴露 =====
  window.CampAdminShell = {
    SECTIONS,
    showSection,
    showSyncMsg,
    ensureSyncStatus,
    unlock
  };

  // ===== 启动 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureSyncStatus();
      setupLoginGate();
    });
  } else {
    ensureSyncStatus();
    setupLoginGate();
  }
})();
