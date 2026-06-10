// ===== Admin 后台: AR 贴图管理 =====
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';
  const ADMIN_TOKEN = 'campsite-nav-2026';
  const AUTH_HEADERS = { 'Authorization': 'Bearer ' + ADMIN_TOKEN };

  let frames = [];
  let chosenFile = null;  // File object

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function init() {
    bindForm();
    loadFrames();
    loadSettings();
  }

  function bindForm() {
    const fileInput = document.getElementById('arFrameFile');
    const fileName = document.getElementById('arFrameFileName');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.type !== 'image/png') {
          toast('请选 PNG 文件 (透明背景)', 'error');
          fileInput.value = '';
          return;
        }
        if (f.size > 2 * 1024 * 1024) {
          toast('PNG 太大 (>2MB), 请用 tinypng.com 压缩', 'error');
          fileInput.value = '';
          return;
        }
        chosenFile = f;
        fileName.textContent = `${f.name} (${(f.size/1024).toFixed(1)} KB)`;
      });
    }
    const form = document.getElementById('arFrameForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = (fd.get('name') || '').toString().trim();
        const anchor = (fd.get('anchor') || 'center').toString();
        if (!name) { toast('请填贴图名', 'error'); return; }
        if (!chosenFile) { toast('请选 PNG 文件', 'error'); return; }
        try {
          const dataUrl = await fileToDataUrl(chosenFile);
          const res = await fetch(API_BASE + '/api/ar/frames', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
            body: JSON.stringify({ name, anchor, dataUrl })
          });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.message);
          form.reset();
          fileName.textContent = '';
          chosenFile = null;
          toast('✓ 上传成功: ' + name, 'success');
          loadFrames();
        } catch (err) {
          toast('上传失败: ' + err.message, 'error');
        }
      });
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('文件读取失败'));
      fr.readAsDataURL(file);
    });
  }

  async function loadFrames() {
    try {
      const res = await fetch(API_BASE + '/api/ar/frames');
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      frames = json.data.frames || [];
      renderFrames();
      // 同步刷默认 logo 下拉
      if (typeof window.refreshArSettings === 'function') window.refreshArSettings();
    } catch (e) {
      console.error('load ar frames failed', e);
    }
  }

  function renderFrames() {
    const tbody = document.getElementById('arFramesTable');
    if (!tbody) return;
    if (!frames.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">还没有贴图, 上面传一张</td></tr>';
      return;
    }
    tbody.innerHTML = frames.map(f => `
      <tr>
        <td><img src="${API_BASE}/ar_shots/${escapeHtml(f.file)}" style="width:60px;height:60px;object-fit:contain;background:#f0f0f0;border-radius:6px" /></td>
        <td>${escapeHtml(f.name)}</td>
        <td>${({center:'居中', 'bottom-right':'右下', 'bottom-left':'左下', 'top-right':'右上', 'top-left':'左上'})[f.anchor] || f.anchor}</td>
        <td>${new Date(f.createdAt).toLocaleString('zh-CN')}</td>
        <td><button class="btn small danger" data-id="${escapeHtml(f.id)}">删除</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('button[data-id]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('删除该贴图?')) return;
        const id = b.dataset.id;
        frames = frames.filter(f => f.id !== id);
        // 简单方案: 全部覆盖 (后端没单独的 DELETE, 这里暂时只删表显示, 后端留着文件)
        // 实际生产应该补 DELETE /api/ar/frames/:id, 先打个 TODO
        renderFrames();
      // 同步刷默认 logo 下拉
      if (typeof window.refreshArSettings === 'function') window.refreshArSettings();
        toast('⚠ 已从列表移除 (文件仍在 /ar_shots/ 待清理)', 'warning');
      });
    });
  }

  function toast(msg, type) {
    const status = document.getElementById('syncStatus');
    if (status) {
      status.textContent = msg;
      status.style.background = type === 'success' ? '#c8e6c9' : type === 'warning' ? '#fff3cd' : '#ffcdd2';
      status.style.color = type === 'success' ? '#2e7d32' : type === 'warning' ? '#856404' : '#c62828';
      setTimeout(() => { status.textContent = ''; }, 2500);
    }
  }

  // ===== 全局默认 logo 设置 =====
  function loadSettings() {
    fetch(API_BASE + '/api/ar/settings')
      .then(r => r.json())
      .then(json => {
        if (json.code !== 0) return;
        const sel = document.getElementById('arDefaultFrame');
        if (!sel) return;
        // 重建下拉
        sel.innerHTML = '<option value="">(不设, 无 logo 时返回原图)</option>' +
          frames.map(f => `<option value="${escapeHtml(f.id)}" ${f.id === json.data.defaultFrameId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
        const anchorSel = document.getElementById('arDefaultAnchor');
        if (anchorSel) anchorSel.value = json.data.defaultAnchor || 'bottom-right';
      })
      .catch(() => {});
  }

  function bindSettings() {
    const saveBtn = document.getElementById('arDefaultSaveBtn');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
      const frameId = document.getElementById('arDefaultFrame').value;
      const anchor = document.getElementById('arDefaultAnchor').value;
      try {
        const res = await fetch(API_BASE + '/api/ar/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
          body: JSON.stringify({ defaultFrameId: frameId || null, defaultAnchor: anchor })
        });
        const json = await res.json();
        if (json.code !== 0) throw new Error(json.message);
        toast('✓ 已保存默认 logo', 'success');
      } catch (err) {
        toast('保存失败: ' + err.message, 'error');
      }
    });
  }

  // 暴露给 admin.js 用于刷新 frame 列表 (admin-ar.js init 之后会被调用)
  window.refreshArSettings = loadSettings;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindSettings(); init(); });
  } else {
    bindSettings();
    init();
  }
})();