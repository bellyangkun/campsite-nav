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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
