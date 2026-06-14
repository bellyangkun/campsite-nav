// ===== Admin 后台: AI 客服 FAQ 配置 =====
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';
  const ADMIN_TOKEN = 'campsite-nav-2026';
  const AUTH_HEADERS = { 'Authorization': 'Bearer ' + ADMIN_TOKEN };

  let faqs = [];
  let loaded = false;
  let bound = false;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function toast(msg, type) {
    if (window.CampAdmin && window.CampAdmin.toast) {
      window.CampAdmin.toast(msg, type);
    } else {
      alert(msg);
    }
  }

  async function loadFaqs() {
    try {
      const res = await fetch(API_BASE + '/api/faqs');
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      faqs = Array.isArray(json.data) ? json.data : [];
      render();
      loaded = true;
    } catch (e) {
      console.error('[admin-faqs] 加载失败', e);
      toast('加载 FAQ 失败: ' + e.message, 'error');
    }
  }

  function render() {
    const tbody = document.getElementById('faqTable');
    if (!tbody) return;
    if (faqs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:#999;text-align:center">暂无 FAQ，请添加</td></tr>';
      return;
    }
    tbody.innerHTML = faqs.map((f, i) => `
      <tr data-idx="${i}">
        <td style="text-align:center"><input type="checkbox" class="faq-edit-show" ${f.show !== false ? 'checked' : ''} /></td>
        <td><input type="text" class="faq-edit-q" value="${escapeHtml(f.q)}" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px" /></td>
        <td><input type="text" class="faq-edit-a" value="${escapeHtml(f.a)}" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px" /></td>
        <td>
          <button type="button" class="btn small secondary faq-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn small secondary faq-down" data-idx="${i}" ${i === faqs.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn small danger faq-del" data-idx="${i}">删除</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.faq-edit-show').forEach((input, i) => {
      input.addEventListener('change', () => { faqs[i].show = input.checked; });
    });
    tbody.querySelectorAll('.faq-edit-q').forEach((input, i) => {
      input.addEventListener('change', () => { faqs[i].q = input.value.trim(); });
    });
    tbody.querySelectorAll('.faq-edit-a').forEach((input, i) => {
      input.addEventListener('change', () => { faqs[i].a = input.value.trim(); });
    });
    tbody.querySelectorAll('.faq-up').forEach(btn => {
      btn.addEventListener('click', () => { move(parseInt(btn.dataset.idx, 10), -1); });
    });
    tbody.querySelectorAll('.faq-down').forEach(btn => {
      btn.addEventListener('click', () => { move(parseInt(btn.dataset.idx, 10), 1); });
    });
    tbody.querySelectorAll('.faq-del').forEach(btn => {
      btn.addEventListener('click', () => { removeItem(parseInt(btn.dataset.idx, 10)); });
    });
  }

  function move(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= faqs.length) return;
    const tmp = faqs[idx];
    faqs[idx] = faqs[newIdx];
    faqs[newIdx] = tmp;
    render();
  }

  function removeItem(idx) {
    if (!confirm('确定删除这条 FAQ？')) return;
    faqs.splice(idx, 1);
    render();
  }

  function bind() {
    if (bound) return;
    bound = true;
    const addBtn = document.getElementById('faqAddBtn');
    const saveBtn = document.getElementById('faqSaveBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const qInput = document.getElementById('faqQ');
        const aInput = document.getElementById('faqA');
        const q = (qInput.value || '').trim();
        const a = (aInput.value || '').trim();
        if (!q || !a) {
          toast('请填写问题和答案', 'error');
          return;
        }
        faqs.push({ q, a, show: true });
        qInput.value = '';
        aInput.value = '';
        render();
        toast('已添加，记得保存到服务器', 'success');
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        // 同步当前输入框中的修改
        document.querySelectorAll('#faqTable tr').forEach((tr, i) => {
          const q = tr.querySelector('.faq-edit-q');
          const a = tr.querySelector('.faq-edit-a');
          if (q && a && faqs[i]) {
            faqs[i].q = q.value.trim();
            faqs[i].a = a.value.trim();
          }
        });
        // 过滤空项，保留 show 字段（默认 true）
        const payload = faqs.filter(f => f.q && f.a).map(f => ({ q: f.q, a: f.a, show: f.show !== false }));
        const status = document.getElementById('faqSaveStatus');
        if (status) status.textContent = '保存中...';
        try {
          const res = await fetch(API_BASE + '/api/faqs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
            body: JSON.stringify({ faqs: payload })
          });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.message);
          faqs = payload;
          render();
          toast('✓ FAQ 已保存到服务器', 'success');
        } catch (e) {
          console.error('[admin-faqs] 保存失败', e);
          toast('保存失败: ' + e.message, 'error');
        } finally {
          if (status) status.textContent = '';
        }
      });
    }
  }

  function init() {
    bind();
    if (!loaded) loadFaqs();
  }

  // 注册到 admin-shell 的 hash 路由
  if (!window.CampAdmin) window.CampAdmin = {};
  const oldOnEnter = window.CampAdmin.onEnter;
  window.CampAdmin.onEnter = function (hash) {
    if (hash === 'faqs') init();
    if (typeof oldOnEnter === 'function') oldOnEnter(hash);
  };
})();
