// ===== P1 后台预约管理 (admin) =====
(function () {
  'use strict';

  const API = window.CAMPSITE_API_BASE || '/api';
  const TOKEN = 'campsite-nav-2026';

  let activities = [];
  let bookings = [];

  // ====== 活动管理 ======
  async function fetchActivities() {
    try {
      const res = await fetch(API + '/activities', { cache: 'no-store' });
      if (!res.ok) return [];
      const j = await res.json();
      return (j.data && j.data.activities) || [];
    } catch (e) {
      console.warn('[Admin Booking] 拉活动失败', e);
      return [];
    }
  }

  async function upsertActivity(act) {
    const res = await fetch(API + '/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ action: 'upsert', activity: act })
    });
    return res.json();
  }

  async function deleteActivity(id) {
    const res = await fetch(API + '/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ action: 'delete', id })
    });
    return res.json();
  }

  function renderActivities() {
    const tbody = document.getElementById('activitiesTable');
    if (!tbody) return;
    if (!activities.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:14px">暂无活动, 添加后顾客端可见</td></tr>';
      return;
    }
    tbody.innerHTML = activities.map(a => {
      const slots = (a.slots || []).join(', ') || '-';
      const kindMap = { activity: '⛺ 活动', catering: '🍽️ 餐饮', hotel: '🏨 酒店', event: '🎉 主题' };
      const kindLabel = kindMap[a.kind] || (a.kind || '活动');
      return `
        <tr>
          <td><strong>${CampData.escapeHtml(a.name)}</strong> <span class="bk-st bk-pending" style="font-size:10px">${kindLabel}</span></td>
          <td>¥${a.price || 0}</td>
          <td>${a.capacity || 0} 人</td>
          <td style="font-size:12px">${CampData.escapeHtml(slots)}</td>
          <td>
            <button class="btn-mini btn-edit" data-id="${a.id}">编辑</button>
            <button class="btn-mini btn-del" data-id="${a.id}">删除</button>
          </td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = activities.find(x => x.id === btn.dataset.id);
        if (!a) return;
        const f = document.getElementById('activityForm');
        f.name.value = a.name;
        f.kind.value = a.kind || 'activity';
        f.price.value = a.price || 0;
        f.capacity.value = a.capacity || 20;
        f.slots.value = (a.slots || []).join(',');
        f.dataset.editId = a.id;
        f.querySelector('button[type=submit]').textContent = '✏️ 更新活动';
        f.scrollIntoView({ behavior: 'smooth' });
      });
    });
    tbody.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确认删除此活动? 已有预约也会被清空')) return;
        await deleteActivity(btn.dataset.id);
        await refreshActivities();
      });
    });
  }

  async function refreshActivities() {
    activities = await fetchActivities();
    renderActivities();
  }

  function setupActivityForm() {
    const f = document.getElementById('activityForm');
    if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const slots = (fd.get('slots') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!slots.length) { alert('请填写至少 1 个可预约日期'); return; }
      const act = {
        id: f.dataset.editId || undefined,
        name: fd.get('name').trim(),
        kind: fd.get('kind') || 'activity',
        price: parseInt(fd.get('price'), 10) || 0,
        capacity: parseInt(fd.get('capacity'), 10) || 20,
        description: (fd.get('description') || '').trim(),
        slots
      };
      const r = await upsertActivity(act);
      if (r.code !== 0) { alert('保存失败: ' + r.message); return; }
      f.reset();
      delete f.dataset.editId;
      f.querySelector('button[type=submit]').textContent = '➕ 添加/更新活动';
      await refreshActivities();
    });
  }

  // ====== 预约管理 ======
  async function fetchBookings() {
    try {
      const res = await fetch(API + '/bookings', {
        headers: { 'Authorization': 'Bearer ' + TOKEN },
        cache: 'no-store'
      });
      if (!res.ok) return [];
      const j = await res.json();
      return (j.data && j.data.bookings) || [];
    } catch (e) {
      console.warn('[Admin Booking] 拉预约失败', e);
      return [];
    }
  }

  async function setBookingStatus(id, status) {
    const res = await fetch(API + '/bookings/' + id + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ status })
    });
    return res.json();
  }

  function renderBookings() {
    const tbody = document.getElementById('bookingsTable');
    if (!tbody) return;
    if (!bookings.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:14px">暂无预约</td></tr>';
      return;
    }
    // 新的在前
    const sorted = bookings.slice().reverse();
    tbody.innerHTML = sorted.map(b => {
      const stMap = { pending: '<span class="bk-st bk-pending">⏳ 待确认</span>',
                      confirmed: '<span class="bk-st bk-ok">✓ 已确认</span>',
                      cancelled: '<span class="bk-st bk-cancel">✕ 已取消</span>' };
      const actions = b.status === 'pending' ? `
        <button class="btn-mini btn-confirm" data-id="${b.id}">✓ 确认</button>
        <button class="btn-mini btn-cancel" data-id="${b.id}">✕ 取消</button>
      ` : (b.status === 'cancelled' ? '<span style="color:#999">—</span>' : '<span style="color:#4CAF50">—</span>');
      return `
        <tr>
          <td>${CampData.escapeHtml(b.activityName)}</td>
          <td>${b.date}</td>
          <td>${b.count}</td>
          <td>${CampData.escapeHtml(b.name)}</td>
          <td><a href="tel:${b.phone}">${b.phone}</a></td>
          <td style="font-size:12px;max-width:160px;word-break:break-word">${CampData.escapeHtml(b.note || '')}</td>
          <td>${stMap[b.status] || b.status}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('.btn-confirm').forEach(btn => {
      btn.addEventListener('click', async () => {
        await setBookingStatus(btn.dataset.id, 'confirmed');
        await refreshBookings();
      });
    });
    tbody.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确认取消此预约?')) return;
        await setBookingStatus(btn.dataset.id, 'cancelled');
        await refreshBookings();
      });
    });
  }

  async function refreshBookings() {
    bookings = await fetchBookings();
    renderBookings();
  }

  function setupBookingControls() {
    const btn = document.getElementById('refreshBookingsBtn');
    if (btn) btn.addEventListener('click', refreshBookings);
  }

  // ====== 启动 ======
  function init() {
    setupActivityForm();
    setupBookingControls();
    refreshActivities();
    refreshBookings();
    // 每 30s 自动刷新预约
    setInterval(refreshBookings, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
