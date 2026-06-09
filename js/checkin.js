// ===== P0 打卡集章 (顾客端) - 自动版 v0.6 =====
(function () {
  'use strict';

  const API = window.CAMPSITE_API_BASE || '/api';
  const STORAGE_KEY = 'campsite_user_id';
  const RADIUS = 80;          // 检测半径 80m
  const DWELL_REQUIRED = 30;  // 停留 30s 才打卡
  const CHECK_INTERVAL = 5000; // 每 5s 检查一次
  const SUBMITTED_KEY = 'campsite_checkin_submitted_v1';  // 24h 提交过的 POI 缓存

  // 用户 ID
  function getUserId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  // 奖励梯度
  const REWARDS = [
    { n: 6,  name: '咖啡一杯', icon: '☕', desc: '满 6 印章 → 咖啡 1 杯' },
    { n: 12, name: '烧烤 8 折', icon: '🔥', desc: '满 12 印章 → 草坪烧烤 8 折' },
    { n: 18, name: '房券升级', icon: '🏨', desc: '满 18 印章 → 客房升级 1 档' },
    { n: 21, name: '全勤奖', icon: '🏆', desc: '满 21 印章 → 全场 VIP 体验' }
  ];

  // dwell 状态: pointId -> { enteredAt, submittedAt }
  const dwellState = new Map();
  // 24h 内已提交过的 POI (含成功, 含距离 409)
  function getSubmittedSet() {
    try {
      const raw = localStorage.getItem(SUBMITTED_KEY);
      if (!raw) return new Set();
      const obj = JSON.parse(raw);
      // 过滤掉超过 24h 的
      const now = Date.now();
      const fresh = {};
      Object.keys(obj).forEach(k => {
        if (now - obj[k] < 24 * 3600 * 1000) fresh[k] = obj[k];
      });
      localStorage.setItem(SUBMITTED_KEY, JSON.stringify(fresh));
      return new Set(Object.keys(fresh));
    } catch (e) { return new Set(); }
  }
  function markSubmitted(pointId) {
    const set = getSubmittedSet();
    set.add(pointId);
    const obj = {};
    set.forEach(k => { obj[k] = Date.now(); });
    localStorage.setItem(SUBMITTED_KEY, JSON.stringify(obj));
  }

  // ===== 工具栏按钮 =====
  function setupCheckinBtn() {
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    if (document.getElementById('toolCheckinBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-checkin';
    btn.id = 'toolCheckinBtn';
    btn.title = '打卡集章';
    btn.innerHTML = '<span class="tool-icon">🏆</span><span class="tool-label">打卡集章</span>';
    btn.addEventListener('click', showCheckinPanel);
    const aiBtn = document.getElementById('toolAiBtn');
    if (aiBtn && aiBtn.nextSibling) tb.insertBefore(btn, aiBtn.nextSibling);
    else tb.appendChild(btn);
  }

  // ===== 弹窗: 打卡面板 =====
  async function showCheckinPanel() {
    if (document.getElementById('checkinModal')) return;
    const userId = getUserId();
    let stats = { unique: 0, pointIds: [], latest: [] };
    try {
      const res = await fetch(API + '/checkins/stats?userId=' + encodeURIComponent(userId), { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        stats = j.data || stats;
      }
    } catch (e) { console.warn('[Checkin] 拉统计失败', e); }
    const points = await CampData.getPoints();
    const pointMap = {};
    points.forEach(p => { pointMap[p.id] = p; });
    const doneSet = new Set(stats.pointIds);

    const rewardHtml = REWARDS.map(r => {
      const reached = stats.unique >= r.n;
      return `<div class="ck-reward ${reached ? 'reached' : ''}">
        <div class="ck-rw-icon">${r.icon}</div>
        <div class="ck-rw-name">${r.name}</div>
        <div class="ck-rw-desc">${r.desc}</div>
        ${reached ? '<div class="ck-rw-tag">✓ 已达成</div>' : `<div class="ck-rw-tag">差 ${r.n - stats.unique} 个</div>`}
      </div>`;
    }).join('');

    const pointHtml = points.map(p => {
      const done = doneSet.has(p.id);
      return `<div class="ck-pt ${done ? 'done' : ''}">
        <div class="ck-pt-stamp">${done ? '✓' : ''}</div>
        <div class="ck-pt-name">${CampData.escapeHtml(p.name)}</div>
      </div>`;
    }).join('');

    const latestHtml = stats.latest.length ? stats.latest.map(c => {
      const t = new Date(c.timestamp).toLocaleString('zh-CN', { hour12: false });
      const autoTag = c.auto ? ' <span class="bk-st bk-ok" style="font-size:9px">自动</span>' : ' <span class="bk-st bk-pending" style="font-size:9px">手动</span>';
      return `<div class="ck-log-item">🏆 ${CampData.escapeHtml(c.pointName)}${autoTag} <span class="muted">${t}</span></div>`;
    }).join('') : '<div class="empty-tip">还没打卡, 出发吧!</div>';

    const m = document.createElement('div');
    m.id = 'checkinModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card ck-card">
        <div class="ai-header">
          <span>🏆 打卡集章</span>
          <button class="ai-close" id="ckCloseBtn">✕</button>
        </div>
        <div class="ck-progress">
          <div class="ck-prog-num">${stats.unique} <span class="muted">/ ${points.length}</span></div>
          <div class="ck-prog-bar"><div class="ck-prog-fill" style="width:${Math.round(stats.unique / points.length * 100)}%"></div></div>
        </div>
        <p class="muted" style="text-align:center;padding:6px 14px;background:#FFF8E1;font-size:11px">
          📍 自动打卡: 进入 POI ${RADIUS}m 范围 + 停留 ${DWELL_REQUIRED}s 即可, 无需点按钮
        </p>
        <div class="ck-section-title">🎁 奖励梯度</div>
        <div class="ck-rewards">${rewardHtml}</div>
        <div class="ck-section-title">📍 全部 POI (${points.length})</div>
        <div class="ck-points">${pointHtml}</div>
        <div class="ck-section-title">📜 最近打卡</div>
        <div class="ck-logs">${latestHtml}</div>
        <p class="muted" style="text-align:center;margin-top:8px;font-size:11px">用户 ID: ${userId.slice(0, 12)}...</p>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#ckCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  // ===== 轻提示: 自动打卡成功 (不挡路) =====
  function showLightToast(p, userTotal) {
    // 关已有
    const old = document.getElementById('checkinLightToast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'checkinLightToast';
    t.className = 'ck-light-toast';
    const next = REWARDS.find(r => r.n > userTotal);
    const rewardLine = next
      ? `还差 ${next.n - userTotal} 个印章 → ${next.icon} ${next.name}`
      : `🏆 已达成全部奖励!`;
    t.innerHTML = `
      <div class="ck-lt-icon">🏆</div>
      <div class="ck-lt-body">
        <div class="ck-lt-title">${CampData.escapeHtml(p.name)} 已打卡</div>
        <div class="ck-lt-sub">${rewardLine}</div>
      </div>
      <button class="ck-lt-close" id="ckLtCloseBtn">✕</button>
    `;
    document.body.appendChild(t);
    t.querySelector('#ckLtCloseBtn').addEventListener('click', () => t.remove());
    // 5s 自动消失
    setTimeout(() => { if (document.getElementById('checkinLightToast')) t.remove(); }, 5000);
  }

  // ===== 自动检测: 监听 my-location =====
  let lastPoints = null;
  let userLat = null, userLng = null;
  function setupAutoCheckin() {
    document.addEventListener('campsite-my-location', async (e) => {
      userLat = e.detail.lat;
      userLng = e.detail.lng;
      if (!userLat || !userLng) return;
      // 缓存 POI
      if (!lastPoints) {
        try { lastPoints = await CampData.getPoints(); } catch (e) { return; }
      }
    });
    // 5s 检查一次 dwell
    setInterval(checkDwell, CHECK_INTERVAL);
  }

  async function checkDwell() {
    if (!userLat || !userLng || !lastPoints) return;
    const submitted = getSubmittedSet();
    const now = Date.now();
    for (const p of lastPoints) {
      if (submitted.has(p.id)) continue;  // 24h 已打过
      const d = haversine(userLat, userLng, p.lat, p.lng);
      const state = dwellState.get(p.id);
      if (d <= RADIUS) {
        // 在范围内
        if (!state) {
          // 首次进入
          dwellState.set(p.id, { enteredAt: now, dwellMs: 0, submitted: false });
        } else if (!state.submitted) {
          state.dwellMs = now - state.enteredAt;
          // 达 30s → 静默 POST
          if (state.dwellMs >= DWELL_REQUIRED * 1000) {
            state.submitted = true;
            submitAuto(p, state.dwellMs);
          }
        }
      } else {
        // 离开范围 → 清零
        if (state) dwellState.delete(p.id);
      }
    }
  }

  async function submitAuto(p, dwellMs) {
    const userId = getUserId();
    try {
      const res = await fetch(API + '/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          pointId: p.id,
          userLat,
          userLng,
          dwellTime: Math.round(dwellMs / 1000),
          auto: true
        })
      });
      const j = await res.json();
      if (j.code === 0) {
        // 成功
        markSubmitted(p.id);
        showLightToast(p, j.userTotal);
        // 通知地图层 (如果监听)
        document.dispatchEvent(new CustomEvent('campsite-checkin-success', { detail: { point: p, userTotal: j.userTotal } }));
      } else if (j.code === 409) {
        // 24h 已打过
        markSubmitted(p.id);
      } else {
        // 失败: 不标 submitted, 下次 dwell 再试
        const state = dwellState.get(p.id);
        if (state) state.submitted = false;
        console.warn('[Checkin] auto fail', j);
      }
    } catch (e) {
      const state = dwellState.get(p.id);
      if (state) state.submitted = false;
      console.warn('[Checkin] auto net err', e);
    }
  }

  // ===== 工具: haversine =====
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ===== 启动 =====
  function init() {
    setupCheckinBtn();
    setupAutoCheckin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
