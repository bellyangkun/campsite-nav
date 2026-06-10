// ===== AR 拍照合影 (P1 升级: 按位置自动选 logo) =====
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

  // 工具: 距离 (米) — 复用 app.js 的 haversine, 这里简化
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ===== 工具栏按钮 =====
  function setupArBtn() {
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    if (document.getElementById('toolArBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-ar';
    btn.id = 'toolArBtn';
    btn.title = 'AR 合影 (按位置自动选 logo)';
    btn.innerHTML = '<span class="tool-icon">📸</span><span class="tool-label">AR 合影</span>';
    btn.addEventListener('click', () => showArModal());
    tb.appendChild(btn);
  }

  // ===== 模态 =====
  let currentFrames = [];
  let currentSettings = {};
  let chosenPoint = null;  // {id, name, lat, lng, logoFrameId, logoAnchor}
  let currentUserLatLng = null;

  async function showArModal(opts) {
    opts = opts || {};
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
          <div style="text-align:center;padding:30px;color:#999">加载中...</div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#arCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });

    try {
      // 拉 frames + settings
      const [framesRes, settingsRes] = await Promise.all([
        fetch(API_BASE + '/api/ar/frames').then(r => r.json()),
        fetch(API_BASE + '/api/ar/settings').then(r => r.json())
      ]);
      currentFrames = (framesRes.code === 0 ? framesRes.data.frames : []) || [];
      currentSettings = (settingsRes.code === 0 ? settingsRes.data : {}) || {};
    } catch (e) {
      document.getElementById('arBody').innerHTML =
        '<div style="text-align:center;padding:30px;color:#c62828">加载失败: ' + escapeHtml(e.message) + '</div>';
      return;
    }

    // 拉 POI 列表 (用 data.js 的 getPointsSync)
    let points = [];
    try { points = (window.CampData && window.CampData.getPointsSync()) || []; } catch (e) {}
    if (!points.length) {
      document.getElementById('arBody').innerHTML =
        '<div style="text-align:center;padding:30px;color:#c62828">未加载到 POI 数据, 请刷新页面</div>';
      return;
    }

    // 用户位置 (从 app.js 全局状态拿)
    try {
      if (window.CampApp && window.CampApp.userLatLng) {
        currentUserLatLng = window.CampApp.userLatLng;
      } else if (window.userLatLng) {
        currentUserLatLng = window.userLatLng;
      }
    } catch (e) {}

    // 计算每个 POI 的距离, 排序
    const withDist = points.map(p => {
      let d = null;
      if (currentUserLatLng) {
        d = haversine(currentUserLatLng[0], currentUserLatLng[1], p.lat, p.lng);
      }
      return { ...p, _dist: d };
    });
    if (currentUserLatLng) {
      withDist.sort((a, b) => (a._dist || 1e9) - (b._dist || 1e9));
    }

    // 如果从 marker 点了传过来 pointId, 锁定
    if (opts.pointId) {
      chosenPoint = points.find(p => p.id === opts.pointId) || null;
      if (chosenPoint) {
        // 直接进拍照
        showCameraStage();
        return;
      }
    }

    // 否则: 让用户选 POI (默认最近)
    chosenPoint = withDist[0] || null;
    renderPointChooser(withDist);
  }

  function renderPointChooser(points) {
    const body = document.getElementById('arBody');
    if (!body) return;
    const hasLoc = !!currentUserLatLng;
    body.innerHTML = `
      <div class="ar-instructions">
        📍 选择拍照位置<br>
        <span style="color:#888;font-size:12px">${hasLoc ? '已按距离排序, 最近 POI 已预选' : '未开启定位, 按 POI 默认顺序'}</span>
      </div>
      <div class="ar-point-list" id="arPointList">
        ${points.map((p, i) => {
          const distText = p._dist != null ? (p._dist < 1000 ? Math.round(p._dist) + ' 米' : (p._dist / 1000).toFixed(2) + ' 公里') : '—';
          const meta = (window.CampData && window.CampData.getTypeMeta(p.type)) || { label: p.type, color: '#999', icon: '📍' };
          const hasLogo = p.logoFrameId ? '✓ 自有 logo' : (currentSettings.defaultFrameId ? '○ 全局默认' : '⚠ 无 logo');
          return `
            <div class="ar-point ${i === 0 && hasLoc ? 'active' : ''}" data-id="${escapeHtml(p.id)}">
              <div class="ar-point-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>
              <div class="ar-point-info">
                <div class="ar-point-name">${escapeHtml(p.name)}</div>
                <div class="ar-point-meta">
                  <span style="color:${meta.color}">${escapeHtml(meta.label)}</span>
                  · <span class="ar-point-dist">${distText}</span>
                  · <span class="ar-point-logo">${hasLogo}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="ar-point-footer">
        <button id="arConfirmPoint" class="btn" style="width:100%">📷 开始拍照 (选 "${escapeHtml(chosenPoint ? chosenPoint.name : '?')}")</button>
      </div>
    `;
    body.querySelectorAll('.ar-point').forEach(el => {
      el.addEventListener('click', () => {
        body.querySelectorAll('.ar-point').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        chosenPoint = points.find(p => p.id === el.dataset.id);
        const btn = body.querySelector('#arConfirmPoint');
        if (btn && chosenPoint) btn.textContent = '📷 开始拍照 (选 "' + chosenPoint.name + '")';
      });
    });
    body.querySelector('#arConfirmPoint').addEventListener('click', showCameraStage);
  }

  function showCameraStage() {
    if (!chosenPoint) {
      showToast('请先选一个位置', 'error');
      return;
    }
    const body = document.getElementById('arBody');
    // 决定用哪个 frame (preview 展示)
    const previewFrame = resolveFrame(chosenPoint);
    const logoInfo = previewFrame
      ? `<div class="ar-logo-tag">📌 ${escapeHtml(previewFrame.name)}${previewFrame.id === currentSettings.defaultFrameId ? ' (全局默认)' : ' (本景点)'}</div>`
      : `<div class="ar-logo-tag" style="color:#c62828">⚠ 无 logo, 将返回原图</div>`;
    body.innerHTML = `
      <div class="ar-stage">
        <div class="ar-choosen-point">
          <span style="color:#666;font-size:12px">📍</span>
          <span style="font-weight:600">${escapeHtml(chosenPoint.name)}</span>
          <button class="ar-change-point-btn" id="arChangePointBtn">换位置</button>
        </div>
        ${logoInfo}
        <button class="ar-change-logo-btn" id="arChangeLogoBtn">🎨 换 logo (${currentFrames.length} 个可选)</button>
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
    body.querySelector('#arChangePointBtn').addEventListener('click', () => {
      let points = [];
      try { points = (window.CampData && window.CampData.getPointsSync()) || []; } catch (e) {}
      const withDist = points.map(p => ({
        ...p,
        _dist: currentUserLatLng ? haversine(currentUserLatLng[0], currentUserLatLng[1], p.lat, p.lng) : null
      }));
      if (currentUserLatLng) withDist.sort((a, b) => (a._dist || 1e9) - (b._dist || 1e9));
      renderPointChooser(withDist);
    });
    body.querySelector('#arChangeLogoBtn').addEventListener('click', showLogoPicker);
    body.querySelector('#arCameraInput').addEventListener('change', onPhotoChosen);
    body.querySelector('#arFileInput').addEventListener('change', onPhotoChosen);
    body.querySelector('#arRetryBtn').addEventListener('click', () => {
      // 选过的 manual frameId 保留, 回到拍照 stage
      showCameraStage();
    });
    body.querySelector('#arSaveBtn').addEventListener('click', () => {
      showToast('👆 在图片上长按 → 保存 / 分享', 'success');
    });
  }

  function showLogoPicker() {
    const body = document.getElementById('arBody');
    if (!currentFrames.length) {
      showToast('暂无可用 logo, 请联系管理员上传', 'error');
      return;
    }
    body.innerHTML = `
      <div class="ar-stage">
        <div class="ar-choosen-point">
          <span style="color:#666;font-size:12px">📍</span>
          <span style="font-weight:600">${escapeHtml(chosenPoint.name)}</span>
          <button class="ar-change-point-btn" id="arChangePointBtn">换位置</button>
        </div>
        <div class="ar-instructions" style="background:#E3F2FD;color:#1565C0">
          选一个 logo (点 "用全局默认" 恢复自动)
        </div>
        <div class="ar-frames" id="arLogoGrid">
          ${currentFrames.map(f => `
            <div class="ar-frame" data-id="${escapeHtml(f.id)}">
              <img src="${API_BASE}/ar_shots/${escapeHtml(f.file)}" alt="${escapeHtml(f.name)}" />
              <div class="ar-frame-name">${escapeHtml(f.name)}</div>
            </div>
          `).join('')}
        </div>
        <div class="ar-point-footer">
          <button id="arUseAutoBtn" class="btn secondary" style="flex:1">↩ 用全局默认</button>
          <button id="arConfirmLogoBtn" class="btn" style="flex:2" disabled>确认</button>
        </div>
      </div>
    `;
    let pickedFrameId = null;
    body.querySelectorAll('.ar-frame').forEach(el => {
      el.addEventListener('click', () => {
        body.querySelectorAll('.ar-frame').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        pickedFrameId = el.dataset.id;
        body.querySelector('#arConfirmLogoBtn').disabled = false;
        body.querySelector('#arConfirmLogoBtn').textContent = '✓ 用 ' + (currentFrames.find(f => f.id === pickedFrameId) || {}).name;
      });
    });
    body.querySelector('#arUseAutoBtn').addEventListener('click', () => {
      chosenPoint._manualFrameId = null;
      showCameraStage();
    });
    body.querySelector('#arConfirmLogoBtn').addEventListener('click', () => {
      chosenPoint._manualFrameId = pickedFrameId;
      showCameraStage();
    });
    body.querySelector('#arChangePointBtn').addEventListener('click', () => {
      let points = [];
      try { points = (window.CampData && window.CampData.getPointsSync()) || []; } catch (e) {}
      const withDist = points.map(p => ({
        ...p,
        _dist: currentUserLatLng ? haversine(currentUserLatLng[0], currentUserLatLng[1], p.lat, p.lng) : null
      }));
      if (currentUserLatLng) withDist.sort((a, b) => (a._dist || 1e9) - (b._dist || 1e9));
      renderPointChooser(withDist);
    });
  }

  // 解析该 POI 当前该用哪个 frame (按优先级)
  function resolveFrame(point) {
    if (point && point._manualFrameId) {
      return currentFrames.find(f => f.id === point._manualFrameId) || null;
    }
    if (point && point.logoFrameId) {
      return currentFrames.find(f => f.id === point.logoFrameId) || null;
    }
    if (currentSettings.defaultFrameId) {
      return currentFrames.find(f => f.id === currentSettings.defaultFrameId) || null;
    }
    return null;
  }

  async function onPhotoChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showToast('请选图片文件 (HEIC 请到相册转 JPEG)', 'error');
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
      reportDiag('photo-chosen', 'start', { pointId: chosenPoint ? chosenPoint.id : null, type: file.type, size: file.size });
      const dataUrl = await resizeAndToDataUrl(file, 1080);
      reportDiag('resize-ok', 'compressed', { len: dataUrl.length });
      const url = await shootWithFrame(dataUrl, chosenPoint ? chosenPoint.id : null, chosenPoint ? chosenPoint._manualFrameId : null);
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
        img.onerror = () => reject(new Error('图片格式不支持 (iPhone HEIC 需先到相册转 JPEG)'));
        img.src = fr.result;
      };
      fr.onerror = () => reject(new Error('文件读取失败'));
      fr.readAsDataURL(file);
    });
  }

  async function shootWithFrame(photoDataUrl, pointId, manualFrameId) {
    const userId = getUserId();
    const body = { userId, photoDataUrl };
    if (pointId) body.pointId = pointId;
    if (manualFrameId) body.frameId = manualFrameId;
    const res = await fetch(API_BASE + '/api/ar/shoot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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

  window.addEventListener('error', (e) => {
    if (String(e.filename || '').indexOf('ar.js') >= 0 || String(e.message || '').indexOf('AR') >= 0) {
      reportDiag('window-error', e.message, { file: e.filename, line: e.lineno, stack: e.error && e.error.stack });
    }
  });

  // ===== 暴露给外部: 标记点点击触发 =====
  window.ArShoot = {
    openForPoint: (pointId) => showArModal({ pointId })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupArBtn);
  } else {
    setupArBtn();
  }
})();