// ===== P1 活动预约 (顾客端) =====
(function () {
  'use strict';

  const API = window.CAMPSITE_API_BASE || '/api';

  let activities = [];
  let bookings = [];  // 当前用户在本地提交的预约记录
  let currentKind = 'all';

  // 加载本地预约记录
  function loadLocalBookings() {
    try {
      const raw = localStorage.getItem('campsite_my_bookings');
      bookings = raw ? JSON.parse(raw) : [];
    } catch (e) { bookings = []; }
  }
  function saveLocalBookings() {
    localStorage.setItem('campsite_my_bookings', JSON.stringify(bookings));
  }

  async function fetchActivities() {
    try {
      const res = await fetch(API + '/activities', { cache: 'no-store' });
      if (!res.ok) return [];
      const j = await res.json();
      return (j.data && j.data.activities) || [];
    } catch (e) {
      console.warn('[Booking] 拉活动失败', e);
      return [];
    }
  }

  // ===== 工具栏按钮: 活动预约 =====
  function setupBookingBtn() {
    // 用现有的"工具栏"区追加按钮 (动态插入)
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-booking';
    btn.id = 'toolBookingBtn';
    btn.title = '活动预约 / 餐饮';
    btn.innerHTML = '<span class="tool-icon">📅</span><span class="tool-label">预约</span>';
    btn.addEventListener('click', showBookingList);
    tb.appendChild(btn);
  }

  // ===== 弹窗: 预约列表 (含 kind 过滤) =====
  async function showBookingList() {
    if (document.getElementById('bookingModal')) return;
    activities = await fetchActivities();
    const m = document.createElement('div');
    m.id = 'bookingModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card booking-card">
        <div class="ai-header">
          <span>📅 预约中心</span>
          <button class="ai-close" id="bookCloseBtn">✕</button>
        </div>
        <div class="booking-tabs">
          <button class="book-tab active" data-kind="all">全部</button>
          <button class="book-tab" data-kind="activity">⛺ 活动</button>
          <button class="book-tab" data-kind="catering">🍽️ 餐饮</button>
          <button class="book-tab" data-kind="hotel">🏨 酒店</button>
          <button class="book-tab" data-kind="event">🎉 主题</button>
          <button class="book-tab" data-tab="mine" data-kind="mine">📋 我的 (${bookings.length})</button>
        </div>
        <div class="booking-body" id="bookingBody"></div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#bookCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    m.querySelectorAll('.book-tab').forEach(t => {
      t.addEventListener('click', () => {
        m.querySelectorAll('.book-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentKind = t.dataset.kind;
        renderTab(currentKind === 'mine' ? 'mine' : 'list', m);
      });
    });
    renderTab('list', m);
  }

  function renderTab(tab, m) {
    const body = m.querySelector('#bookingBody');
    body.innerHTML = '';
    if (tab === 'list') {
      renderList(body);
    } else {
      renderMine(body);
    }
  }

  function renderList(body) {
    if (!activities.length) {
      body.innerHTML = '<div class="empty-tip">暂无可预约项目<br><span class="muted">客服会不定期发布活动/餐饮/酒店</span></div>';
      return;
    }
    // 按 kind 过滤
    const filtered = currentKind === 'all' ? activities : activities.filter(a => (a.kind || 'activity') === currentKind);
    if (!filtered.length) {
      body.innerHTML = '<div class="empty-tip">该分类暂无项目</div>';
      return;
    }
    body.innerHTML = filtered.map(a => {
      const slots = (a.slots || []).slice(0, 6).join(' / ') || '暂未排期';
      const kindMap = { activity: '⛺ 活动', catering: '🍽️ 餐饮', hotel: '🏨 酒店', event: '🎉 主题' };
      const kindLabel = kindMap[a.kind] || '活动';
      return `
        <div class="book-item">
          <div class="book-head">
            <div class="book-name">${CampData.escapeHtml(a.name)}</div>
            <div class="book-cap">${kindLabel} · ${a.capacity || 0} 人/期</div>
          </div>
          <div class="book-desc">${CampData.escapeHtml(a.description || '')}</div>
          <div class="book-meta">
            <span>💰 ¥${a.price || 0}/人</span>
            <span>📅 ${slots}</span>
          </div>
          <button class="book-go" data-id="${a.id}">立即预约</button>
        </div>
      `;
    }).join('');
    body.querySelectorAll('.book-go').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = activities.find(x => x.id === btn.dataset.id);
        showBookForm(a);
      });
    });
  }

  function renderMine(body) {
    if (!bookings.length) {
      body.innerHTML = '<div class="empty-tip">还没有预约记录</div>';
      return;
    }
    // 新的在前
    const sorted = bookings.slice().reverse();
    body.innerHTML = sorted.map(b => {
      const st = { pending: '⏳ 待确认', confirmed: '✓ 已确认', cancelled: '✕ 已取消' }[b.status] || b.status;
      const stCls = 'book-status-' + b.status;
      return `
        <div class="book-mine">
          <div class="book-mine-head">
            <div class="book-name">${CampData.escapeHtml(b.activityName)}</div>
            <div class="book-status ${stCls}">${st}</div>
          </div>
          <div class="book-mine-meta">
            📅 ${b.date} · 👥 ${b.count} 人 · ${CampData.escapeHtml(b.name)} · ${CampData.escapeHtml(b.phone)}
          </div>
          ${b.note ? '<div class="book-mine-note">备注: ' + CampData.escapeHtml(b.note) + '</div>' : ''}
          <div class="book-mine-time">提交于 ${new Date(b.createdAt).toLocaleString('zh-CN')}</div>
        </div>
      `;
    }).join('');
  }

  // ===== 弹窗: 预约表单 =====
  function showBookForm(a) {
    if (document.getElementById('bookFormModal')) return;
    const slots = a.slots || [];
    const m = document.createElement('div');
    m.id = 'bookFormModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card bookform-card">
        <div class="ai-header">
          <span>📅 预约 - ${CampData.escapeHtml(a.name)}</span>
          <button class="ai-close" id="formCloseBtn">✕</button>
        </div>
        <form id="bookForm">
          <label class="form-label">选择日期 *</label>
          <div class="slot-grid">
            ${slots.map(s => `<label class="slot-item"><input type="radio" name="date" value="${s}" required /><span>${s}</span></label>`).join('')}
          </div>
          <label class="form-label">人数 *</label>
          <input type="number" name="count" min="1" max="${a.capacity || 50}" value="2" required />
          <label class="form-label">姓名 *</label>
          <input type="text" name="name" maxlength="20" required placeholder="联系人姓名" />
          <label class="form-label">手机 *</label>
          <input type="tel" name="phone" pattern="1[3-9][0-9]{9}" maxlength="11" required placeholder="11 位手机号" />
          <label class="form-label">备注 (可选)</label>
          <textarea name="note" maxlength="200" placeholder="特殊需求, 如带宠物/儿童座椅等"></textarea>
          <div class="modal-actions">
            <button type="button" class="btn-close" id="formCancelBtn">取消</button>
            <button type="submit" class="btn-copy">提交预约</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#formCloseBtn').addEventListener('click', () => m.remove());
    m.querySelector('#formCancelBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    m.querySelector('#bookForm').addEventListener('submit', (e) => {
      e.preventDefault();
      submitBooking(a, m);
    });
  }

  async function submitBooking(a, modal) {
    const fd = new FormData(modal.querySelector('#bookForm'));
    const payload = {
      activityId: a.id,
      name: fd.get('name'),
      phone: fd.get('phone'),
      date: fd.get('date'),
      count: parseInt(fd.get('count'), 10),
      note: fd.get('note') || ''
    };
    const submitBtn = modal.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';
    try {
      const res = await fetch(API + '/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (j.code !== 0) throw new Error(j.message || '提交失败');
      // 存本地
      bookings.push(j.booking);
      saveLocalBookings();
      modal.remove();
      showSuccess(j.message, j.booking);
    } catch (e) {
      alert('预约失败: ' + e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '提交预约';
    }
  }

  function showSuccess(msg, booking) {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card success-card">
        <div class="success-icon">✅</div>
        <h3>预约已提交</h3>
        <p>${CampData.escapeHtml(msg)}</p>
        <div class="success-detail">
          <div>活动: <strong>${CampData.escapeHtml(booking.activityName)}</strong></div>
          <div>日期: <strong>${booking.date}</strong></div>
          <div>人数: <strong>${booking.count}</strong></div>
          <div>状态: <strong>⏳ 待确认</strong></div>
        </div>
        <p class="muted">预约 ID: ${booking.id}</p>
        <div class="modal-actions">
          <button class="btn-copy" id="succOkBtn">好的</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#succOkBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  // ===== 启动 =====
  function init() {
    loadLocalBookings();
    setupBookingBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
