// ===== 后台: 打卡管理 (admin) =====
// 拉所有 checkin 记录 (admin 用, 含 shotUrl 缩略图)
(function () {
  'use strict';

  const API = window.CAMPSITE_API_BASE || '/api';
  const TOKEN = 'campsite-nav-2026';

  let allCheckins = [];
  let usersCache = {};   // userId -> { phone, nickname }
  let lastFilter = { user: '', type: 'all', q: '' };

  async function fetchCheckins() {
    try {
      const res = await fetch(API + '/checkins', {
        headers: { 'Authorization': 'Bearer ' + TOKEN },
        cache: 'no-store'
      });
      if (!res.ok) {
        console.warn('[Admin Checkin] 拉取失败', res.status);
        return [];
      }
      const j = await res.json();
      return (j.data && j.data.checkins) || [];
    } catch (e) {
      console.warn('[Admin Checkin] 拉取异常', e);
      return [];
    }
  }

  // 拉取所有用户, 用于把 userId 映射成手机号
  async function fetchUsers() {
    try {
      const res = await fetch(API + '/users', {
        headers: { 'Authorization': 'Bearer ' + TOKEN },
        cache: 'no-store'
      });
      if (!res.ok) return {};
      const j = await res.json();
      const list = (j.data && j.data.users) || [];
      const m = {};
      list.forEach(u => {
        m[u.id] = { phone: u.phone, nickname: u.nickname || '' };
      });
      return m;
    } catch (e) {
      return {};
    }
  }

  function renderCheckins() {
    const tbody = document.getElementById('checkinTable');
    if (!tbody) return;

    // 过滤
    const q = (lastFilter.q || '').trim().toLowerCase();
    const rows = allCheckins.filter(c => {
      if (lastFilter.type === 'with-photo' && !c.shotUrl) return false;
      if (lastFilter.type === 'no-photo' && c.shotUrl) return false;
      if (lastFilter.type === 'normal' && c.kind === 'other') return false;
      if (lastFilter.type === 'other' && c.kind !== 'other') return false;
      if (lastFilter.user && c.userId !== lastFilter.user) return false;
      if (q) {
        const phone = usersCache[c.userId] && usersCache[c.userId].phone || '';
        const hay = (c.pointName + ' ' + c.userId + ' ' + phone).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:14px">暂无打卡记录</td></tr>';
      return;
    }

    // 新的在前
    const sorted = rows.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    tbody.innerHTML = sorted.map(c => {
      const t = new Date(c.timestamp).toLocaleString('zh-CN', { hour12: false });
      const user = usersCache[c.userId] || {};
      const phone = user.phone ? `<a href="tel:${user.phone}">${user.phone}</a>` : `<span style="color:#999">${CampData.escapeHtml(c.userId)}</span>`;
      const kindTag = c.kind === 'other'
        ? '<span class="bk-st" style="font-size:10px;background:#FFE0B2;color:#E65100">主动</span>'
        : '<span class="bk-st bk-ok" style="font-size:10px">到点</span>';
      const shotThumb = c.shotUrl
        ? `<a href="${c.shotUrl}" target="_blank" title="点击查看大图"><img src="${c.shotUrl}" style="width:60px;height:60px;border-radius:4px;object-fit:cover;cursor:pointer" onerror="this.style.background='#f0f0f0';this.alt='图加载失败'"/></a>`
        : '<span style="color:#999;font-size:11px">—</span>';
      const latLng = (c.userLat && c.userLng)
        ? `<a href="https://www.google.com/maps?q=${c.userLat},${c.userLng}" target="_blank" style="font-size:11px">${c.userLat.toFixed(4)},${c.userLng.toFixed(4)}</a>`
        : '<span style="color:#999">—</span>';
      const dist = c.distance != null ? `${Math.round(c.distance)}m` : '-';
      return `
        <tr>
          <td style="white-space:nowrap;font-size:12px">${t}</td>
          <td>${phone}${user.nickname ? `<br><span style="font-size:10px;color:#999">${CampData.escapeHtml(user.nickname)}</span>` : ''}</td>
          <td>${kindTag} ${CampData.escapeHtml(c.pointName || '-')}</td>
          <td style="font-size:11px">${dist}</td>
          <td>${latLng}</td>
          <td>${shotThumb}</td>
          <td style="font-size:10px;color:#999">${CampData.escapeHtml(c.id || '')}</td>
        </tr>
      `;
    }).join('');
  }

  function renderUserFilter() {
    const sel = document.getElementById('checkinUserFilter');
    if (!sel) return;
    const current = sel.value;
    const users = Object.keys(usersCache);
    sel.innerHTML = '<option value="">📋 全部用户</option>' +
      users.map(uid => {
        const u = usersCache[uid];
        const label = u.phone ? u.phone + (u.nickname ? ` (${u.nickname})` : '') : uid;
        return `<option value="${uid}">${CampData.escapeHtml(label)}</option>`;
      }).join('');
    sel.value = current || lastFilter.user;
    lastFilter.user = sel.value;
  }

  function renderStats() {
    const totalEl = document.getElementById('checkinStatTotal');
    const photoEl = document.getElementById('checkinStatPhoto');
    const userEl = document.getElementById('checkinStatUser');
    if (totalEl) totalEl.textContent = allCheckins.length;
    if (photoEl) photoEl.textContent = allCheckins.filter(c => c.shotUrl).length;
    if (userEl) userEl.textContent = new Set(allCheckins.map(c => c.userId)).size;
  }

  async function refreshCheckins() {
    usersCache = await fetchUsers();
    allCheckins = await fetchCheckins();
    renderUserFilter();
    renderStats();
    renderCheckins();
    if (window.CampAdminShell && window.CampAdminShell.showSyncMsg) {
      window.CampAdminShell.showSyncMsg(`✓ 刷新 ${allCheckins.length} 条打卡`, 'success');
    }
  }

  function setupCheckinControls() {
    const refreshBtn = document.getElementById('refreshCheckinBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshCheckins);

    const userSel = document.getElementById('checkinUserFilter');
    if (userSel) userSel.addEventListener('change', () => {
      lastFilter.user = userSel.value;
      renderCheckins();
    });

    const typeSel = document.getElementById('checkinTypeFilter');
    if (typeSel) typeSel.addEventListener('change', () => {
      lastFilter.type = typeSel.value;
      renderCheckins();
    });

    const searchInput = document.getElementById('checkinSearch');
    if (searchInput) searchInput.addEventListener('input', () => {
      lastFilter.q = searchInput.value;
      renderCheckins();
    });
  }

  // ===== 启动 =====
  function init() {
    setupCheckinControls();
    refreshCheckins();
  }

  const WATCH_HASHES = ['checkin'];
  function _bootWhenReady() {
    init();
    document.addEventListener('admin-section-enter', (e) => {
      if (WATCH_HASHES.includes(e.detail.hash)) {
        try { refreshCheckins(); } catch (er) { console.error('admin-checkin.js refresh failed', er); }
      }
    });
  }
  if (window.CampAdminShell) {
    if (sessionStorage.getItem('campsite_admin_authed') === '1' && document.getElementById('adminContent') && document.getElementById('adminContent').style.display !== 'none') {
      _bootWhenReady();
    } else {
      const _watch = setInterval(() => {
        if (document.getElementById('adminContent') && document.getElementById('adminContent').style.display !== 'none') {
          clearInterval(_watch);
          _bootWhenReady();
        }
      }, 100);
    }
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
