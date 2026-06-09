// ===== P0 打卡集章 (顾客端) =====
(function () {
  'use strict';

  const API = window.CAMPSITE_API_BASE || '/api';
  const STORAGE_KEY = 'campsite_user_id';

  // 用户 ID (无登录体系, 随机生成 + 存 localStorage)
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

  // ===== 工具栏按钮 =====
  function setupCheckinBtn() {
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    // 不重复添加
    if (document.getElementById('toolCheckinBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-checkin';
    btn.id = 'toolCheckinBtn';
    btn.title = '打卡集章';
    btn.innerHTML = '<span class="tool-icon">🏆</span><span class="tool-label">打卡集章</span>';
    btn.addEventListener('click', showCheckinPanel);
    // 插到 "AI 客服" 后
    const aiBtn = document.getElementById('toolAiBtn');
    if (aiBtn && aiBtn.nextSibling) tb.insertBefore(btn, aiBtn.nextSibling);
    else tb.appendChild(btn);
  }

  // ===== 弹窗: 打卡集章面板 =====
  async function showCheckinPanel() {
    if (document.getElementById('checkinModal')) return;
    const userId = getUserId();
    // 拉用户打卡统计
    let stats = { unique: 0, pointIds: [], latest: [] };
    try {
      const res = await fetch(API + '/checkins/stats?userId=' + encodeURIComponent(userId), { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        stats = j.data || stats;
      }
    } catch (e) {
      console.warn('[Checkin] 拉统计失败', e);
    }
    // 拉 POI 列表
    const points = await CampData.getPoints();
    const pointMap = {};
    points.forEach(p => { pointMap[p.id] = p; });
    const doneSet = new Set(stats.pointIds);

    // 渲染
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
      return `<div class="ck-log-item">🏆 ${CampData.escapeHtml(c.pointName)} <span class="muted">${t}</span></div>`;
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

  // ===== 自动检测近 POI + 弹打卡提示 =====
  // 每 60s 检查一次, 距离 < 80m 且未打卡过 (24h) 弹气泡
  let checkinPromptShown = new Set();
  let lastCheckTime = 0;

  function setupAutoPrompt() {
    // 监听 app.js 暴露的 my 位置事件 (每秒更新)
    document.addEventListener('campsite-my-location', (e) => {
      const { lat, lng } = e.detail;
      if (!lat || !lng) return;
      const now = Date.now();
      if (now - lastCheckTime < 60000) return;  // 限频 60s
      lastCheckTime = now;
      checkNearby(lat, lng);
    });
  }

  async function checkNearby(lat, lng) {
    try {
      const points = await CampData.getPoints();
      for (const p of points) {
        const d = haversine(lat, lng, p.lat, p.lng);
        if (d > 80) continue;
        if (checkinPromptShown.has(p.id + '_' + Math.floor(Date.now() / 3600000))) continue;  // 同 POI 同小时不弹
        // 24h 防刷
        const userId = getUserId();
        const stats = await fetch(API + '/checkins/stats?userId=' + encodeURIComponent(userId)).then(r => r.json()).catch(() => null);
        if (stats && stats.data && stats.data.pointIds.includes(p.id)) continue;
        // 弹气泡
        showPrompt(p);
        checkinPromptShown.add(p.id + '_' + Math.floor(Date.now() / 3600000));
        break;  // 一次只弹一个
      }
    } catch (e) {
      console.warn('[Checkin] auto-prompt', e);
    }
  }

  function showPrompt(p) {
    const old = document.getElementById('checkinToast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'checkinToast';
    t.className = 'checkin-toast';
    t.innerHTML = `
      <div class="ck-t-icon">🏆</div>
      <div class="ck-t-body">
        <div class="ck-t-title">附近: ${CampData.escapeHtml(p.name)}</div>
        <div class="ck-t-hint">点击打卡, 收集印章换奖励</div>
      </div>
      <button class="ck-t-go" id="ckToastGoBtn">立即打卡</button>
      <button class="ck-t-close" id="ckToastCloseBtn">✕</button>
    `;
    document.body.appendChild(t);
    t.querySelector('#ckToastGoBtn').addEventListener('click', () => doCheckin(p));
    t.querySelector('#ckToastCloseBtn').addEventListener('click', () => t.remove());
    // 5s 自动消失
    setTimeout(() => { if (document.getElementById('checkinToast')) t.remove(); }, 12000);
  }

  async function doCheckin(p) {
    // 拿当前 GPS
    if (!navigator.geolocation) {
      alert('设备不支持定位');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const userId = getUserId();
      try {
        const res = await fetch(API + '/checkins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId, pointId: p.id,
            userLat, userLng
          })
        });
        const j = await res.json();
        if (j.code !== 0) {
          alert('打卡失败: ' + j.message);
          return;
        }
        // 关气泡
        const toast = document.getElementById('checkinToast');
        if (toast) toast.remove();
        // 弹成功
        showSuccess(p, j.userTotal);
      } catch (e) {
        alert('打卡失败: ' + e.message);
      }
    }, (err) => {
      alert('需要定位权限才能打卡: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function showSuccess(p, userTotal) {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    const rewardsUnlocked = REWARDS.filter(r => r.n === userTotal);
    const rewardLine = rewardsUnlocked.length
      ? `<div class="ck-succ-reward">🎉 解锁: ${rewardsUnlocked.map(r => r.icon + ' ' + r.name).join(' + ')}</div>`
      : `<div class="ck-succ-reward">还差 ${REWARDS.find(r => r.n > userTotal).n - userTotal} 个印章, 加油!</div>`;
    m.innerHTML = `
      <div class="modal-card success-card">
        <div class="success-icon">🏆</div>
        <h3>打卡成功</h3>
        <p>${CampData.escapeHtml(p.name)}</p>
        <div class="success-detail">
          <div>累计: <strong>${userTotal}</strong> 个印章</div>
        </div>
        ${rewardLine}
        <div class="modal-actions">
          <button class="btn-copy" id="ckSuccPanelBtn">查看进度</button>
          <button class="btn-close" id="ckSuccCloseBtn">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#ckSuccCloseBtn').addEventListener('click', () => m.remove());
    m.querySelector('#ckSuccPanelBtn').addEventListener('click', () => {
      m.remove();
      // 关所有现存弹窗
      const ck = document.getElementById('checkinModal');
      if (ck) ck.remove();
      showCheckinPanel();
    });
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
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
    setupAutoPrompt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
