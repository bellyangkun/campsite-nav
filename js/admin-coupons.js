// ===== Admin 后台: 优惠券配置 + 核销 =====
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';
  // 后台用同样的 Bearer token (与 admin.js 一致)
  const ADMIN_TOKEN = 'campsite-nav-2026';
  const AUTH_HEADERS = { 'Authorization': 'Bearer ' + ADMIN_TOKEN };

  let coupons = [];
  let redemptions = [];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function init() {
    bindForm();
    bindRedeem();
    loadCoupons();
    loadRedemptions();
    setInterval(loadRedemptions, 15000);  // 15s 自动刷
  }

  function bindForm() {
    // 表单字段联动: 折扣类型只填 discount, 代金类型只填 value
    const form = document.getElementById('couponTplForm');
    if (!form) return;
    const kindEl = form.elements['kind'];
    const discEl = form.elements['discount'];
    const valEl = form.elements['value'];
    function syncFields() {
      const k = kindEl.value;
      discEl.disabled = (k !== 'discount');
      valEl.disabled = (k === 'discount');
      discEl.required = (k === 'discount');
      valEl.required = (k === 'cash');
    }
    kindEl.addEventListener('change', syncFields);
    syncFields();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const tpl = {
        id: 'cp_' + Date.now().toString(36),
        name: fd.get('name'),
        kind: fd.get('kind'),
        scope: fd.get('scope') || '',
        minSpend: parseInt(fd.get('minSpend')) || 0,
        validDays: parseInt(fd.get('validDays')) || 30,
        maxPerUser: parseInt(fd.get('maxPerUser')) || 1,
        description: fd.get('description') || ''
      };
      if (tpl.kind === 'discount') tpl.discount = parseFloat(fd.get('discount')) || 0.8;
      else if (tpl.kind === 'cash') tpl.value = parseInt(fd.get('value')) || 10;

      try {
        coupons.push(tpl);
        await saveTemplates(coupons);
        form.reset();
        syncFields();
        renderCoupons();
        toast('✓ 已添加: ' + tpl.name, 'success');
      } catch (err) {
        coupons.pop();  // 回滚
        toast('保存失败: ' + err.message, 'error');
      }
    });
  }

  function bindRedeem() {
    const btn = document.getElementById('redeemBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const code = document.getElementById('redeemCode').value.trim().toUpperCase();
      const note = document.getElementById('redeemNote').value.trim();
      if (!code) {
        toast('请输入券码', 'error');
        return;
      }
      const resultEl = document.getElementById('redeemResult');
      resultEl.innerHTML = '<div style="color:#999">核销中...</div>';
      try {
        const res = await fetch(API_BASE + '/api/coupons/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
          body: JSON.stringify({ code, note })
        });
        const json = await res.json();
        if (json.code !== 0) throw new Error(json.message);
        const c = json.data.coupon;
        resultEl.innerHTML = `
          <div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:14px;border-radius:8px">
            <div style="font-weight:600;color:#2e7d32;font-size:15px">✓ 核销成功</div>
            <div style="margin-top:6px;color:#555">${escapeHtml(c.tplName)} · 用户 ${escapeHtml(c.userId)} · ${escapeHtml(c.tplScope || '')}</div>
          </div>
        `;
        document.getElementById('redeemCode').value = '';
        document.getElementById('redeemNote').value = '';
        loadRedemptions();
        toast('✓ 核销成功', 'success');
      } catch (err) {
        resultEl.innerHTML = `
          <div style="background:#ffebee;border-left:4px solid #c62828;padding:14px;border-radius:8px;color:#c62828">
            ✗ 核销失败: ${escapeHtml(err.message)}
          </div>
        `;
      }
    });
    document.getElementById('redeemCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  }

  async function loadCoupons() {
    try {
      const res = await fetch(API_BASE + '/api/coupons/templates');
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      coupons = json.data.templates || [];
      renderCoupons();
    } catch (e) {
      console.error('load coupons failed', e);
    }
  }

  async function saveTemplates(arr) {
    const res = await fetch(API_BASE + '/api/coupons/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify({ templates: arr })
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message);
    return json;
  }

  function renderCoupons() {
    const tbody = document.getElementById('couponsTable');
    if (!tbody) return;
    if (!coupons.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px">还没有模板, 上面添加一张</td></tr>';
      return;
    }
    tbody.innerHTML = coupons.map(t => {
      const value = t.kind === 'discount' ? (t.discount * 10) + ' 折'
                  : t.kind === 'cash' ? '¥' + t.value
                  : '免费';
      const minSpend = t.minSpend ? ' / 满¥' + t.minSpend : '';
      return `
        <tr>
          <td>${escapeHtml(t.name)}</td>
          <td>${({discount:'折扣',cash:'代金',gift:'体验'})[t.kind] || t.kind}</td>
          <td>${escapeHtml(value)}${escapeHtml(minSpend)}</td>
          <td>${escapeHtml(t.scope || '-')}</td>
          <td>${t.validDays || 30} 天 / 每用户 ${t.maxPerUser || 1}</td>
          <td><button class="btn small danger" data-id="${escapeHtml(t.id)}">删除</button></td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('button[data-id]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('删除该优惠券模板? (历史领取记录会保留)')) return;
        const id = b.dataset.id;
        try {
          coupons = coupons.filter(t => t.id !== id);
          await saveTemplates(coupons);
          renderCoupons();
          toast('✓ 已删除', 'success');
        } catch (err) {
          loadCoupons();  // 回滚
          toast('删除失败: ' + err.message, 'error');
        }
      });
    });
  }

  async function loadRedemptions() {
    try {
      const res = await fetch(API_BASE + '/api/coupons/redemptions', { headers: AUTH_HEADERS });
      const json = await res.json();
      if (json.code !== 0) return;
      redemptions = (json.data.redemptions || []).slice(0, 30);
      renderRedemptions();
    } catch (e) {}
  }

  function renderRedemptions() {
    const tbody = document.getElementById('redemptionsTable');
    if (!tbody) return;
    if (!redemptions.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">还没有核销记录</td></tr>';
      return;
    }
    tbody.innerHTML = redemptions.map(r => `
      <tr>
        <td>${new Date(r.redeemedAt).toLocaleString('zh-CN')}</td>
        <td>${escapeHtml(r.tplName)}</td>
        <td><code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:12px">${escapeHtml(r.userId)}</code></td>
        <td><code style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-weight:600">${escapeHtml(r.code)}</code></td>
        <td>${escapeHtml(r.note || '-')}</td>
      </tr>
    `).join('');
  }

  function toast(msg, type) {
    const status = document.getElementById('syncStatus');
    if (status) {
      status.textContent = msg;
      status.style.background = type === 'success' ? '#c8e6c9' : '#ffcdd2';
      status.style.color = type === 'success' ? '#2e7d32' : '#c62828';
      setTimeout(() => { status.textContent = ''; }, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();