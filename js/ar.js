// ===== AR 拍照框 (P1 入园拍照) =====
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';

  function getUserId() {
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
  function setupArBtn() {
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    if (document.getElementById('toolArBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-ar';
    btn.id = 'toolArBtn';
    btn.title = 'AR 合影';
    btn.innerHTML = '<span class="tool-icon">📸</span><span class="tool-label">AR 合影</span>';
    btn.addEventListener('click', showArModal);
    tb.appendChild(btn);
  }

  let currentFrames = [];
  let chosenFrame = null;

  async function showArModal() {
    if (document.getElementById('arModal')) return;
    const m = document.createElement('div');
    m.id = 'arModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card ar-card">
        <div class="ai-header">
          <span>📸 AR 合影</span>
          <button class="ai-close" id="arCloseBtn">✕</button>
        </div>
        <div class="ar-body" id="arBody">
          <div style="text-align:center;padding:30px;color:#999">加载贴图中...</div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#arCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });

    try {
      currentFrames = await fetchFrames();
    } catch (e) {
      document.getElementById('arBody').innerHTML =
        '<div style="text-align:center;padding:30px;color:#c62828">加载失败: ' + escapeHtml(e.message) + '</div>';
      return;
    }
    renderChooser();
  }

  async function fetchFrames() {
    const res = await fetch(API_BASE + '/api/ar/frames');
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || 'HTTP ' + res.status);
    return json.data.frames || [];
  }

  function renderChooser() {
    const body = document.getElementById('arBody');
    if (!currentFrames.length) {
      body.innerHTML = `
        <div style="text-align:center;padding:40px 20px">
          <div style="font-size:48px;margin-bottom:16px">📸</div>
          <div style="color:#c62828;font-size:15px;font-weight:600;margin-bottom:8px">暂无可用贴图</div>
          <div style="color:#666;font-size:13px;line-height:1.6;margin-bottom:12px">需要先在 <b>admin 后台</b> 上传贴图</div>
          <div style="color:#999;font-size:12px;line-height:1.6">
            路径: admin.html (密码 8888) → 滚到最底<br>
            → <b>"📸 AR 合影贴图"</b> → 上传透明背景 PNG (推荐 500x500)
          </div>
        </div>
      `;
      return;
    }
    body.innerHTML = `
      <div class="ar-instructions">
        <div>1️⃣ 选一个贴图</div>
        <div>2️⃣ 拍照或上传照片</div>
        <div>3️⃣ 服务器自动合成 → 长按保存 / 分享</div>
      </div>
      <div class="ar-frames" id="arFrames">
        ${currentFrames.map(f => `
          <div class="ar-frame" data-id="${escapeHtml(f.id)}">
            <img src="${API_BASE}/ar_shots/${escapeHtml(f.file)}" alt="${escapeHtml(f.name)}" />
            <div class="ar-frame-name">${escapeHtml(f.name)}</div>
          </div>
        `).join('')}
      </div>
    `;
    body.querySelectorAll('.ar-frame').forEach(el => {
      el.addEventListener('click', () => {
        body.querySelectorAll('.ar-frame').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        chosenFrame = currentFrames.find(f => f.id === el.dataset.id);
        showCameraStage();
      });
    });
  }

  function showCameraStage() {
    const body = document.getElementById('arBody');
    body.innerHTML = `
      <div class="ar-stage">
        <div class="ar-frame-preview">
          <img src="${API_BASE}/ar_shots/${escapeHtml(chosenFrame.file)}" />
          <div>贴图: ${escapeHtml(chosenFrame.name)}</div>
        </div>
        <div class="ar-inputs">
          <label class="ar-input-btn">
            📷 拍一张
            <input type="file" id="arCameraInput" accept="image/*" capture="environment" style="display:none" />
          </label>
          <label class="ar-input-btn secondary">
            🖼️ 从相册选
            <input type="file" id="arFileInput" accept="image/*" style="display:none" />
          </label>
        </div>
        <div class="ar-result" id="arResult" style="display:none">
          <img id="arResultImg" />
          <div class="ar-result-actions">
            <button id="arRetryBtn" class="btn secondary">🔄 重拍</button>
            <button id="arSaveBtn" class="btn">💾 长按保存</button>
          </div>
          <div class="ar-result-tip">提示: 在图片上长按 → 保存到相册 / 转发给朋友</div>
        </div>
        <div class="ar-progress" id="arProgress" style="display:none">
          <div class="spinner"></div>
          <div>合成中...</div>
        </div>
      </div>
    `;
    body.querySelector('#arCameraInput').addEventListener('change', (e) => onPhotoChosen(e));
    body.querySelector('#arFileInput').addEventListener('change', (e) => onPhotoChosen(e));
    body.querySelector('#arRetryBtn').addEventListener('click', () => renderChooser());
    body.querySelector('#arSaveBtn').addEventListener('click', () => {
      const img = document.getElementById('arResultImg');
      if (img) showToast('👆 在图片上长按 → 保存 / 分享', 'success');
    });
  }

  async function onPhotoChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showToast('请选图片文件 (HEIC 手机可能不支持, 请到相册选 JPEG/PNG)', 'error');
      reportDiag('bad-type', '非 image/*', { type: file.type, name: file.name, size: file.size });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('图片太大 (>10MB), 请压缩后再试', 'error');
      return;
    }
    document.getElementById('arProgress').style.display = '';
    document.getElementById('arResult').style.display = 'none';
    try {
      reportDiag('photo-chosen', 'start', { type: file.type, size: file.size });
      // 客户端缩放到 1080 宽 (减少 base64 体积, 后端合成更快)
      const dataUrl = await resizeAndToDataUrl(file, 1080);
      reportDiag('resize-ok', 'compressed', { len: dataUrl.length });
      const url = await shootWithFrame(dataUrl, chosenFrame.id);
      const img = document.getElementById('arResultImg');
      img.src = API_BASE + url;
      img.dataset.fullUrl = API_BASE + url;
      document.getElementById('arProgress').style.display = 'none';
      document.getElementById('arResult').style.display = '';
    } catch (err) {
      document.getElementById('arProgress').style.display = 'none';
      showToast('合成失败: ' + err.message, 'error');
      reportDiag('shoot-fail', err.message, { stack: err.stack });
    }
  }

  function resizeAndToDataUrl(file, maxW) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxW) {
            h = Math.round(h * maxW / w);
            w = maxW;
          }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = () => {
          // HEIC / 不支持的格式 — canvas 没法解码
          reject(new Error('图片格式不支持 (iPhone HEIC 需先到相册转 JPEG)'));
        };
        img.src = fr.result;
      };
      fr.onerror = () => reject(new Error('文件读取失败'));
      fr.readAsDataURL(file);
    });
  }

  async function shootWithFrame(photoDataUrl, frameId) {
    const userId = getUserId();
    const res = await fetch(API_BASE + '/api/ar/shoot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, frameId, photoDataUrl })
    });
    let json;
    try { json = await res.json(); }
    catch (e) { throw new Error('服务端响应非 JSON (HTTP ' + res.status + ')'); }
    if (json.code !== 0) throw new Error(json.message || 'HTTP ' + res.status);
    return json.data.url;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function showToast(msg, type) {
    if (window.CampApp && typeof window.CampApp.toast === 'function') {
      window.CampApp.toast(msg, type);
      return;
    }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:' + (type === 'error' ? '#c62828' : '#2e7d32') + ';color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // 自动上报错误到 /api/diag, 方便排查
  function reportDiag(kind, message, extra) {
    try {
      fetch(API_BASE + '/api/diag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'ar-' + kind, message, extra, ua: navigator.userAgent, ts: Date.now() }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  // 全局错误兜底
  window.addEventListener('error', (e) => {
    if (String(e.filename || '').indexOf('ar.js') >= 0 || String(e.message || '').indexOf('AR') >= 0) {
      reportDiag('window-error', e.message, { file: e.filename, line: e.lineno, stack: e.error && e.error.stack });
    }
  });

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupArBtn);
  } else {
    setupArBtn();
  }
})();