// ===== P1 admin 用户列表 =====
(function () {
  'use strict';
  const API = window.CAMPSITE_API_BASE || '/api';
  const TOKEN = 'campsite-nav-2026';

  let users = [];

  async function fetchUsers() {
    try {
      const res = await fetch(API + '/users', {
        headers: { 'Authorization': 'Bearer ' + TOKEN },
        cache: 'no-store'
      });
      if (!res.ok) return [];
      const j = await res.json();
      return (j.data && j.data.users) || [];
    } catch (e) {
      console.warn('[Admin Users]', e);
      return [];
    }
  }

  function renderUsers() {
    const tbody = document.getElementById('usersTable');
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:14px">暂无注册用户<br><span style="font-size:12px">用户在前端完成手机号登录后出现在这里</span></td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => {
      const reg = new Date(u.createdAt).toLocaleDateString('zh-CN');
      const last = u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('zh-CN', { hour12: false }) : '-';
      // 原始手机号 (没脱敏的) 用于 tel: 链接
      return `
        <tr>
          <td><a href="tel:${u.phone}" style="color:#9C27B0;font-weight:600">${u.phoneMasked || u.phone}</a></td>
          <td>${CampData.escapeHtml(u.nickname || '-')}</td>
          <td><strong style="color:#9C27B0">${u.checkinCount || 0}</strong> 印章</td>
          <td style="font-size:12px">${reg}</td>
          <td style="font-size:12px">${last}</td>
        </tr>
      `;
    }).join('');
  }

  async function refreshUsers() {
    users = await fetchUsers();
    renderUsers();
  }

  function setupBtn() {
    const btn = document.getElementById('refreshUsersBtn');
    if (btn) btn.addEventListener('click', refreshUsers);
  }

  function init() {
    setupBtn();
    refreshUsers();
    setInterval(refreshUsers, 60000);
  }
  // 等 shell boot + 监听 section-enter 自动刷新
  function _bootWhenReady() {
    init();
    // 进入本模块对应的 section 时, 自动刷一次数据
    document.addEventListener('admin-section-enter', (e) => {
      const myHash = 'admin-users.js'.replace('admin-', '').replace('.js', '');
      // admin-booking.js 对应 #activities 和 #bookings (因为都涉及预约)
      const watch = WATCH_HASHES || [myHash];
      if (watch.includes(e.detail.hash)) {
        try { onSectionEnter && onSectionEnter(e.detail.hash); } catch (er) { console.error('admin-users.js section-enter refresh failed', er); }
      }
    });
  }
  if (window.CampAdminShell) {
    // shell 已加载, 但还没 boot, 等 shell boot 完
    if (sessionStorage.getItem('campsite_admin_authed') === '1' && document.getElementById('adminContent') && document.getElementById('adminContent').style.display !== 'none') {
      _bootWhenReady();
    } else {
      // 等登录通过后 shell 会触发
      const _watch = setInterval(() => {
        if (document.getElementById('adminContent') && document.getElementById('adminContent').style.display !== 'none') {
          clearInterval(_watch);
          _bootWhenReady();
        }
      }, 100);
    }
  } else {
    // shell 还没加载 (老版 admin.html?), 退回 DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
