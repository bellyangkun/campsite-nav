// ===== 优惠券 (P1 入园领券) =====
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';
  const STORAGE_KEY = 'campsite_coupons_cache_v1';

  function getUserId() {
    // 优先用登录后的 userId, 否则用 anonymousId
    try {
      const auth = JSON.parse(localStorage.getItem('campsite_user_auth') || 'null');
      if (auth && auth.user && auth.user.id) return auth.user.id;
    } catch (e) {}
    let anon = localStorage.getItem('campsite_anon_id');
    if (!anon) {
      anon = 'u_anon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      localStorage.setItem('campsite_anon_id', anon);
    }
    return anon;
  }

  // ===== 工具栏按钮 =====
  function setupCouponsBtn() {
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    if (document.getElementById('toolCouponsBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-coupons';
    btn.id = 'toolCouponsBtn';
    btn.title = '优惠券';
    btn.innerHTML = '<span class="tool-icon">🎫</span><span class="tool-label">优惠券</span>';
    btn.addEventListener('click', showCouponsModal);
    tb.appendChild(btn);
  }

  // ===== 弹窗: 优惠券中心 =====
  let currentTpls = [];
  let currentMine = [];

  async function showCouponsModal() {
    if (document.getElementById('couponsModal')) return;
    const m = document.createElement('div');
    m.id = 'couponsModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card coupons-card">
        <div class="ai-header">
          <span>🎫 优惠券中心</span>
          <button class="ai-close" id="couponsCloseBtn">✕</button>
        </div>
        <div class="coupons-tabs">
          <button class="coupon-tab active" data-tab="all">可领取</button>
          <button class="coupon-tab" data-tab="mine">我的券 (—)</button>
        </div>
        <div class="coupons-body" id="couponsBody">
          <div style="text-align:center;padding:30px;color:#999">加载中...</div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#couponsCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });

    // 初始: 可领取列表
    try {
      currentTpls = await fetchTemplates();
      renderAll();
    } catch (e) {
      document.getElementById('couponsBody').innerHTML =
        '<div style="text-align:center;padding:30px;color:#c62828">加载失败: ' + escapeHtml(e.message) + '</div>';
    }

    // 切换 tab
    m.querySelectorAll('.coupon-tab').forEach(t => {
      t.addEventListener('click', async () => {
        m.querySelectorAll('.coupon-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        if (t.dataset.tab === 'all') renderAll();
        else renderMine();
      });
    });
  }

  async function fetchTemplates() {
    const res = await fetch(API_BASE + '/api/coupons/templates');
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || 'HTTP ' + res.status);
    return json.data.templates || [];
  }

  async function fetchMine() {
    const userId = getUserId();
    const res = await fetch(API_BASE + '/api/coupons/my?userId=' + encodeURIComponent(userId));
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || 'HTTP ' + res.status);
    return json.data.coupons || [];
  }

  async function issueCoupon(templateId) {
    const userId = getUserId();
    const res = await fetch(API_BASE + '/api/coupons/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, templateId })
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || 'HTTP ' + res.status);
    return json.data.coupon;
  }

  function renderAll() {
    const body = document.getElementById('couponsBody');
    if (!body) return;
    if (!currentTpls.length) {
      body.innerHTML = '<div style="text-align:center;padding:30px;color:#999">暂无可领取优惠券</div>';
      return;
    }
    body.innerHTML = currentTpls.map(t => {
      const kindBadge = {
        discount: '折扣',
        cash: '代金',
        gift: '体验'
      }[t.kind] || t.kind;
      const valueText = t.kind === 'discount' ? (t.discount * 10) + ' 折'
                       : t.kind === 'cash' ? '¥' + t.value
                       : t.kind === 'gift' ? '免费'
                       : '';
      const minSpend = t.minSpend ? `<div class="coupon-meta">满 ¥${t.minSpend} 可用</div>` : '';
      return `
        <div class="coupon-card">
          <div class="coupon-left">
            <div class="coupon-value">${escapeHtml(valueText)}</div>
            <div class="coupon-kind">${escapeHtml(kindBadge)}</div>
          </div>
          <div class="coupon-right">
            <div class="coupon-name">${escapeHtml(t.name)}</div>
            <div class="coupon-scope">📍 ${escapeHtml(t.scope || '全场通用')}</div>
            <div class="coupon-meta">有效 ${t.validDays || 30} 天 · 每用户 ${t.maxPerUser || 1} 张</div>
            ${minSpend}
            <div class="coupon-desc">${escapeHtml(t.description || '')}</div>
            <button class="coupon-issue-btn" data-tpl="${escapeHtml(t.id)}">立即领取</button>
          </div>
        </div>
      `;
    }).join('');
    body.querySelectorAll('.coupon-issue-btn').forEach(b => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = '领取中...';
        try {
          const coupon = await issueCoupon(b.dataset.tpl);
          b.textContent = '✓ 已领取';
          showToast('✓ 已领取: ' + coupon.code, 'success');
          // 刷新我的券数
          updateMineCount();
        } catch (e) {
          b.disabled = false;
          b.textContent = '立即领取';
          showToast('领取失败: ' + e.message, 'error');
        }
      });
    });
  }

  async function renderMine() {
    const body = document.getElementById('couponsBody');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#999">加载中...</div>';
    try {
      currentMine = await fetchMine();
    } catch (e) {
      body.innerHTML = '<div style="text-align:center;padding:30px;color:#c62828">加载失败: ' + escapeHtml(e.message) + '</div>';
      return;
    }
    if (!currentMine.length) {
      body.innerHTML = '<div style="text-align:center;padding:30px;color:#999">还没有券, 去"可领取"看看</div>';
      return;
    }
    const now = Date.now();
    body.innerHTML = currentMine.map(c => {
      const valueText = c.tplKind === 'discount' ? (c.tplDiscount * 10) + ' 折'
                       : c.tplKind === 'cash' ? '¥' + c.tplValue
                       : c.tplKind === 'gift' ? '免费'
                       : '';
      const daysLeft = Math.max(0, Math.ceil((c.expiresAt - now) / 86400000));
      let statusBadge;
      if (c.status === 'used') statusBadge = '<span class="coupon-status used">已使用</span>';
      else if (c.status === 'expired') statusBadge = '<span class="coupon-status expired">已过期</span>';
      else if (daysLeft <= 3) statusBadge = '<span class="coupon-status soon">剩 ' + daysLeft + ' 天</span>';
      else statusBadge = '<span class="coupon-status active">有效</span>';
      const codeText = c.status === 'active' ? c.code : (c.code + ' (' + statusBadge.match(/>([^<]+)</)[1] + ')');
      return `
        <div class="coupon-card coupon-mine ${c.status !== 'active' ? 'is-disabled' : ''}">
          <div class="coupon-left">
            <div class="coupon-value">${escapeHtml(valueText)}</div>
            <div class="coupon-kind">${escapeHtml(c.tplName)}</div>
          </div>
          <div class="coupon-right">
            <div class="coupon-name">${escapeHtml(c.tplScope || '')}</div>
            <div class="coupon-code-row">
              <span class="coupon-code-label">券码</span>
              <span class="coupon-code">${escapeHtml(c.code)}</span>
              ${c.status === 'active' ? `<button class="coupon-copy-btn" data-code="${escapeHtml(c.code)}">复制</button>` : ''}
            </div>
            <div class="coupon-meta">
              ${c.status === 'used' ? '已使用于 ' + new Date(c.usedAt).toLocaleString('zh-CN')
                : c.status === 'expired' ? '已过期'
                : '有效期至 ' + new Date(c.expiresAt).toLocaleDateString('zh-CN') + ' (' + daysLeft + ' 天)'}
              ${statusBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');
    body.querySelectorAll('.coupon-copy-btn').forEach(b => {
      b.addEventListener('click', async () => {
        const code = b.dataset.code;
        try {
          await navigator.clipboard.writeText(code);
          showToast('✓ 券码已复制: ' + code, 'success');
        } catch (e) {
          // 兜底: 选中
          const ta = document.createElement('textarea');
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          showToast('✓ 券码已复制: ' + code, 'success');
        }
      });
    });
  }

  async function updateMineCount() {
    try {
      const mine = await fetchMine();
      const active = mine.filter(c => c.status === 'active').length;
      const tab = document.querySelector('.coupon-tab[data-tab="mine"]');
      if (tab) tab.textContent = `我的券 (${active})`;
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function showToast(msg, type) {
    if (window.CampApp && typeof window.CampApp.toast === 'function') {
      window.CampApp.toast(msg, type);
      return;
    }
    // 兜底: 简单 div
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:' + (type === 'error' ? '#c62828' : '#2e7d32') + ';color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCouponsBtn);
  } else {
    setupCouponsBtn();
  }
})();