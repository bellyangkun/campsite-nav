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
      const shotTag = c.shotUrl ? ' <span class="bk-st" style="font-size:9px;background:#FFE0B2;color:#E65100">📸</span>' : '';
      const shotThumb = c.shotUrl ? `<img src="${API}${c.shotUrl}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;vertical-align:middle;margin-left:6px" />` : '';
      return `<div class="ck-log-item">🏆 ${CampData.escapeHtml(c.pointName)}${autoTag}${shotTag} <span class="muted">${t}</span>${shotThumb}</div>`;
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
          📍 拍照打卡: 进入 POI ${RADIUS}m 范围 + 停留 ${DWELL_REQUIRED}s, 弹拍照模态 → 拍照+贴图 → 提交得印章
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
    let rewardLine;
    if (userTotal == null) {
      rewardLine = '已记录本次打卡';
    } else {
      const next = REWARDS.find(r => r.n > userTotal);
      rewardLine = next
        ? `还差 ${next.n - userTotal} 个印章 → ${next.icon} ${next.name}`
        : `🏆 已达成全部奖励!`;
    }
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

  // 当前弹出的拍照打卡模态 (避免重复弹)
  let activePromptPointId = null;
  async function checkDwell() {
    if (!userLat || !userLng || !lastPoints) return;
    const submitted = getSubmittedSet();
    const now = Date.now();
    for (const p of lastPoints) {
      if (submitted.has(p.id)) continue;  // 24h 已打过
      // 如果已经在弹该 POI 的模态, 跳过
      if (activePromptPointId === p.id) continue;
      const d = haversine(userLat, userLng, p.lat, p.lng);
      const state = dwellState.get(p.id);
      if (d <= RADIUS) {
        // 在范围内
        if (!state) {
          // 首次进入
          dwellState.set(p.id, { enteredAt: now, dwellMs: 0, submitted: false, prompted: false });
        } else if (!state.prompted) {
          state.dwellMs = now - state.enteredAt;
          // 达 30s → 弹拍照模态 (v0.9.2 新逻辑: 拍照才算打卡)
          if (state.dwellMs >= DWELL_REQUIRED * 1000) {
            state.prompted = true;
            activePromptPointId = p.id;
            showPhotoCheckinPrompt(p);
          }
        }
      } else {
        // 离开范围 → 清零 (但已经弹过模态的 POI 暂不重弹, 避免短时间内重复)
        if (state && !state.prompted) dwellState.delete(p.id);
      }
    }
  }

  // ===== 弹拍照打卡模态: 复用 ar.js 的 showArModal, 拍照完回调 =====
  function showPhotoCheckinPrompt(point) {
    // 关已有
    if (document.getElementById('photoCheckinModal')) {
      document.getElementById('photoCheckinModal').remove();
    }
    const m = document.createElement('div');
    m.id = 'photoCheckinModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card pc-card">
        <div class="ai-header" style="background:linear-gradient(135deg,#FF6F00,#FF8F00)">
          <span>🏆 打卡 ${CampData.escapeHtml(point.name)}</span>
          <button class="ai-close" id="pcCloseBtn">✕</button>
        </div>
        <div class="pc-body" id="pcBody">
          <div style="text-align:center;padding:20px 0">
            <div style="font-size:48px">📍</div>
            <div style="font-size:16px;font-weight:600;margin:10px 0">您已在 ${CampData.escapeHtml(point.name)} 停留 30 秒</div>
            <div class="muted" style="font-size:13px;margin-bottom:16px">拍照 + 选贴图 即可完成打卡<br>获得 1 枚印章 + 奖励梯度</div>
            <button id="pcOpenCamera" class="btn" style="width:100%;font-size:15px;padding:14px;background:linear-gradient(135deg,#FF6F00,#FF8F00);color:#fff;border:none;border-radius:8px;cursor:pointer">📸 开始拍照打卡</button>
            <button id="pcSkip" class="btn" style="width:100%;margin-top:8px;background:none;border:1px solid #ddd;color:#888;border-radius:8px;padding:10px;cursor:pointer;font-size:13px">稍后再说</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#pcCloseBtn').addEventListener('click', () => { m.remove(); activePromptPointId = null; });
    m.querySelector('#pcSkip').addEventListener('click', () => { m.remove(); activePromptPointId = null; });
    m.addEventListener('click', (e) => { if (e.target === m) { m.remove(); activePromptPointId = null; } });
    m.querySelector('#pcOpenCamera').addEventListener('click', () => {
      // 关提示, 调 ar.js showArModal(锁定 pointId), 拍完回调
      m.remove();
      openArForCheckin(point);
    });
  }

  // 调 ar.js 拍照模态, 拍完后 callback submitCheckin
  function openArForCheckin(point) {
    if (window.ArShoot && typeof window.ArShoot.showArModal === 'function') {
      window.ArShoot.showArModal({
        pointId: point.id,
        checkinCtx: { point, userLat, userLng, dwellMs: DWELL_REQUIRED * 1000 }
      });
    } else {
      console.warn('[Checkin] window.ArShoot.showArModal 不存在, 请确认 ar.js 加载顺序');
      showLightToast(point, null);
    }
  }

  // 拍照后由 ar.js 回调 (window.campAppSubmitCheckin = submitCheckin)
  async function submitCheckin(ctx) {
    const { point, shotUrl, shotFrameId, userLat: ulat, userLng: ulng, dwellMs } = ctx;
    const userId = getUserId();
    try {
      const res = await fetch(API + '/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          pointId: point.id,
          userLat: ulat,
          userLng: ulng,
          dwellTime: Math.round((dwellMs || DWELL_REQUIRED * 1000) / 1000),
          auto: true,
          shotUrl,
          shotFrameId
        })
      });
      const j = await res.json();
      if (j.code === 0) {
        markSubmitted(point.id);
        showLightToast(point, j.userTotal);
        document.dispatchEvent(new CustomEvent('campsite-checkin-success', { detail: { point, userTotal: j.userTotal, shotUrl } }));
        return j;
      } else if (j.code === 409) {
        markSubmitted(point.id);
        showLightToast(point, null);  // 已打过, 不增 total
        return j;
      } else {
        showLightToast(point, null);
        console.warn('[Checkin] submit fail', j);
        return j;
      }
    } catch (e) {
      console.warn('[Checkin] submit net err', e);
      throw e;
    } finally {
      activePromptPointId = null;
    }
  }
  // 暴露给 ar.js 在拍完后回调
  window.campAppSubmitCheckin = submitCheckin;

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
