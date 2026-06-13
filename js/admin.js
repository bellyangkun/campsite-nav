(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';
  const AUTH_HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer campsite-nav-2026' };

  let map;
  let pickMarker = null;
  let points = [];
  let booted = false;

  // ===== 工具: toast (从 admin-shell 拿) =====
  const toast = (msg, type) => {
    if (window.CampAdminShell && typeof window.CampAdminShell.showSyncMsg === 'function') {
      window.CampAdminShell.showSyncMsg(msg, type);
    } else {
      console.log('[toast]', type, msg);
    }
  };

  // ===== BD-09 -> WGS-84 反向 =====
  function bd09ToWgs84(bdLng, bdLat) {
    const xPi = (bdLng * Math.PI) * 3000.0 / 180.0;
    const z = Math.sqrt(bdLng * bdLng + bdLat * bdLat) - 0.00002 * Math.sin(xPi);
    const theta = Math.atan2(bdLat, bdLng) - 0.000003 * Math.cos(xPi);
    const gcjLng = z * Math.cos(theta) - 0.0065;
    const gcjLat = z * Math.sin(theta) - 0.006;
    return gcj02ToWgs84(gcjLng, gcjLat);
  }
  function gcj02ToWgs84(lng, lat) {
    if (typeof outOfChina === 'function' && outOfChina(lng, lat)) return [lng, lat];
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - 0.00669342162296594323 * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (6378245.0 / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lng - dLng, lat - dLat];
  }
  function transformLat(x, y) {
    const PI = 3.1415926535897932384626;
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLng(x, y) {
    const PI = 3.1415926535897932384626;
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }
  function outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  // ===== WiFi 设置 =====
  async function loadWifiSettings() {
    try {
      const res = await fetch(API_BASE + '/api/settings/wifi');
      const j = await res.json();
      if (j.code === 0 && j.data) {
        const ssidEl = $('#wifiSsid');
        const pwdEl = $('#wifiPassword');
        if (ssidEl) ssidEl.value = j.data.ssid || '';
        if (pwdEl) pwdEl.value = j.data.password || '';
      }
    } catch (e) {
      console.warn('[admin] 加载 WiFi 配置失败', e);
    }
  }

  // ===== Boot (shell 登录通过后调用) =====
  function boot() {
    if (booted) return;
    booted = true;
    try {
      points = CampData.getPointsSync();
      renderTable();
      bindEvents();

      // 地图异步加载
      BaiduMap._onError = (msg) => {
        console.error('[admin] 地图错误:', msg);
        const el = document.getElementById('pickMap');
        if (el) el.innerHTML = '<div style="padding:20px;color:#c62828;background:#ffebee">⚠️ ' + msg + '<br><br><small>(表单功能仍可用, 添加活动点请直接填坐标)</small></div>';
      };
      BaiduMap.ready(() => {
        try { initMap(); } catch (e) {
          console.error('[admin] initMap 失败:', e);
          BaiduMap._onError('地图初始化失败: ' + e.message);
        }
      });

      // 数据同步完成后刷新
      document.addEventListener('campsite-sync-done', (e) => {
        console.log('[admin] sync 完成, 数据源:', e.detail.source);
        points = CampData.getPointsSync();
        if (map) try { refreshMapMarkers(); } catch (er) { console.error(er); }
        renderTable();
        const sourceLabel = { server: '☁️ 服务器', local: '💾 本地缓存', default: '🆕 默认' }[e.detail.source] || e.detail.source;
        toast(`数据源: ${sourceLabel} (${points.length} 个活动点)`, 'success');
      });
    } catch (e) {
      console.error('[admin] boot 失败:', e);
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px;background:#ffcdd2;color:#c62828;z-index:99999;text-align:center';
      banner.textContent = '⚠️ 初始化失败: ' + e.message;
      document.body.prepend(banner);
    }
  }

  function initMap() {
    const first = points[0] || { lat: 31.485759, lng: 121.297886 };
    map = BaiduMap.initBaiduMap('pickMap', { lng: first.lng, lat: first.lat, zoom: 15 });
    refreshMapMarkers();
    map.addEventListener('click', (e) => {
      const wgs84 = bd09ToWgs84(e.point.lng, e.point.lat);
      $('input[name="lat"]').value = wgs84[1].toFixed(6);
      $('input[name="lng"]').value = wgs84[0].toFixed(6);
      placePickMarker(wgs84[0], wgs84[1]);
    });
  }

  function refreshMapMarkers() {
    if (!map) return;
    BaiduMap.clearOverlays(map);
    pickMarker = null;
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const html = `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`;
      BaiduMap.addDivMarker(map, p.lng, p.lat, html, { x: 16, y: 16 });
    });
  }

  function placePickMarker(lng, lat) {
    if (!map) return;
    if (pickMarker) map.removeOverlay(pickMarker);
    const html = '<div class="pick-marker">📌</div>';
    pickMarker = BaiduMap.addDivMarker(map, lng, lat, html, { x: 12, y: 24 });
  }

  function renderTable() {
    const tbody = $('#pointsTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    let arFrames = [];
    Promise.all([
      fetch(API_BASE + '/api/ar/frames').then(r => r.json()).catch(() => ({ code: 0, data: { frames: [] } })),
      fetch(API_BASE + '/api/ar/settings').then(r => r.json()).catch(() => ({ code: 0, data: {} }))
    ]).then(([f, s]) => {
      arFrames = (f.code === 0 ? f.data.frames : []) || [];
      renderRows();
    });
    function renderRows() {
      const sorted = CampData.getSortedPoints();
      sorted.forEach((p, i) => {
        const meta = CampData.getTypeMeta(p.type);
        const tr = document.createElement('tr');
        tr.draggable = true;
        tr.dataset.id = p.id;
        const currentLogo = (p.logoFrameId === undefined || p.logoFrameId === '') ? '' :
                            (p.logoFrameId === null ? '__none__' : p.logoFrameId);
        const opts = ['<option value="">(全局默认)</option>', '<option value="__none__">(不贴图)</option>'];
        arFrames.forEach(f => {
          const sel = (currentLogo === f.id) ? ' selected' : '';
          opts.push(`<option value="${CampData.escapeHtml(f.id)}"${sel}>${CampData.escapeHtml(f.name)}</option>`);
        });
        if (currentLogo === '__none__') opts[1] = '<option value="__none__" selected>(不贴图)</option>';
        tr.innerHTML = `
          <td>
            <div style="display:flex;align-items:center;gap:4px">
              <button class="btn-icon move-up" data-id="${p.id}" data-dir="up" ${i === 0 ? 'disabled' : ''} title="上移">▲</button>
              <button class="btn-icon move-down" data-id="${p.id}" data-dir="down" ${i === sorted.length - 1 ? 'disabled' : ''} title="下移">▼</button>
              <span style="color:#999;font-size:11px;margin-left:2px">${(typeof p.order === 'number') ? p.order : '—'}</span>
            </div>
          </td>
          <td>${meta.icon} ${meta.label}</td>
          <td>${CampData.escapeHtml(p.name)}</td>
          <td>${p.lat.toFixed(6)}</td>
          <td>${p.lng.toFixed(6)}</td>
          <td>${CampData.escapeHtml(p.description || '')}</td>
          <td>
            <select class="logo-select" data-id="${CampData.escapeHtml(p.id)}" style="max-width:140px;padding:4px;font-size:12px">
              ${opts.join('')}
            </select>
          </td>
          <td><button class="btn small danger" data-id="${p.id}" data-action="delete">删除</button></td>
        `;
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('确认删除该活动点？')) return;
          try {
            points = await CampData.deletePoint(id);
            refreshMapMarkers();
            renderTable();
            toast('✓ 已删除', 'success');
          } catch (err) { alert('删除失败：' + err.message); }
        });
      });
      tbody.querySelectorAll('button[data-dir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const dir = btn.getAttribute('data-dir');
          if (btn.disabled) return;
          try {
            points = await CampData.movePoint(id, dir);
            if (map) try { refreshMapMarkers(); } catch (er) { console.error(er); }
            renderTable();
            toast('✓ 已' + (dir === 'up' ? '上移' : '下移'), 'success');
          } catch (err) { alert('排序失败：' + err.message); }
        });
      });
      tbody.querySelectorAll('select.logo-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const id = sel.dataset.id;
          let v = sel.value;
          if (v === '' || v === '__none__') {
            await patchLogo(id, { logoFrameId: null });
          } else {
            await patchLogo(id, { logoFrameId: v });
          }
        });
      });
      bindDragReorder(tbody, sorted);
    }
  }

  async function patchLogo(pointId, body) {
    try {
      const res = await fetch(API_BASE + '/api/points/' + encodeURIComponent(pointId) + '/logo', {
        method: 'PATCH',
        headers: AUTH_HEADERS,
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      const p = points.find(x => x.id === pointId);
      if (p) {
        if (body.logoFrameId === null) { delete p.logoFrameId; delete p.logoAnchor; }
        else if (body.logoFrameId) { p.logoFrameId = body.logoFrameId; }
      }
      toast('✓ logo 已更新', 'success');
    } catch (err) {
      alert('logo 更新失败: ' + err.message);
      renderTable();
    }
  }

  // ===== 拖拽重排 =====
  let dragSrcId = null;
  function bindDragReorder(tbody, sorted) {
    tbody.querySelectorAll('tr[draggable="true"]').forEach(tr => {
      tr.addEventListener('dragstart', (e) => {
        dragSrcId = tr.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcId);
        tr.style.opacity = '0.4';
      });
      tr.addEventListener('dragend', () => { tr.style.opacity = ''; });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tr.style.borderTop = '2px solid #2196F3';
      });
      tr.addEventListener('dragleave', () => { tr.style.borderTop = ''; });
      tr.addEventListener('drop', async (e) => {
        e.preventDefault();
        tr.style.borderTop = '';
        const srcId = e.dataTransfer.getData('text/plain');
        const dstId = tr.dataset.id;
        if (!srcId || !dstId || srcId === dstId) return;
        try {
          const points2 = CampData.getPointsSync().slice();
          const src = points2.find(p => p.id === srcId);
          const dst = points2.find(p => p.id === dstId);
          if (!src || !dst) return;
          const sortedNow = CampData.getSortedPoints();
          const dstIdx = sortedNow.findIndex(p => p.id === dstId);
          if (dstIdx === -1) return;
          let newOrder;
          if (dstIdx === 0) {
            newOrder = (typeof sortedNow[0].order === 'number' ? sortedNow[0].order : 100) - 1;
          } else {
            const prev = sortedNow[dstIdx - 1];
            const cur = sortedNow[dstIdx];
            const prevOrder = (typeof prev.order === 'number') ? prev.order : 0;
            const curOrder = (typeof cur.order === 'number') ? cur.order : prevOrder + 100;
            if (curOrder - prevOrder >= 2) {
              newOrder = prevOrder + Math.floor((curOrder - prevOrder) / 2);
            } else {
              await CampData.normalizeOrder();
              const reSorted = CampData.getSortedPoints();
              const newDstIdx = reSorted.findIndex(p => p.id === dstId);
              const newPrev = reSorted[newDstIdx - 1];
              const newCur = reSorted[newDstIdx];
              newOrder = (newPrev.order + newCur.order) / 2;
            }
          }
          await CampData.updatePoint(srcId, { order: newOrder });
          points = await CampData.getPoints();
          if (map) try { refreshMapMarkers(); } catch (er) { console.error(er); }
          renderTable();
          toast('✓ 已重排', 'success');
        } catch (err) { alert('拖拽排序失败：' + err.message); }
      });
    });
  }

  function bindEvents() {
    $('#pointForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const newPoint = {
        id: 'p' + Date.now(),
        name: fd.get('name'),
        type: fd.get('type'),
        lat: parseFloat(fd.get('lat')),
        lng: parseFloat(fd.get('lng')),
        description: fd.get('description') || '',
        petFriendly: fd.get('petFriendly') === '1'
      };
      try {
        points = await CampData.addPoint(newPoint);
        e.target.reset();
        refreshMapMarkers();
        renderTable();
        toast('✓ 已添加并同步到服务器', 'success');
      } catch (err) { alert('添加失败：' + err.message); }
    });

    const useLocBtn = $('#useMyLocationBtn');
    if (useLocBtn) useLocBtn.addEventListener('click', useMyLocation);

    const normBtn = $('#normalizeOrderBtn');
    if (normBtn) {
      normBtn.addEventListener('click', async () => {
        if (!confirm('把所有活动点的 order 规整化为 100/200/300... (不会改变当前顺序)?')) return;
        try {
          points = await CampData.normalizeOrder();
          refreshMapMarkers();
          renderTable();
          toast('✓ 已重置排序', 'success');
        } catch (err) { alert('重置排序失败：' + err.message); }
      });
    }

    $('#resetBtn').addEventListener('click', async () => {
      if (!confirm('恢复为默认 7 活动点？现有自定义数据会丢失。')) return;
      try {
        points = await CampData.resetToDefault();
        refreshMapMarkers();
        renderTable();
        toast('✓ 已重置为默认', 'success');
      } catch (err) { alert('重置失败：' + err.message); }
    });

    $('#exportBtn').addEventListener('click', () => {
      const json = CampData.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'campsite-points.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          points = await CampData.importJSON(reader.result);
          refreshMapMarkers();
          renderTable();
          toast('✓ 已导入并同步到服务器', 'success');
        } catch (err) { alert('导入失败：' + err.message); }
      };
      reader.readAsText(file);
    });

    // WiFi 设置表单
    const wifiForm = $('#wifiForm');
    if (wifiForm) {
      wifiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ssid = $('#wifiSsid').value.trim();
        const password = $('#wifiPassword').value;
        if (!ssid) { alert('请输入 WiFi 名称'); return; }
        try {
          const res = await fetch(API_BASE + '/api/settings/wifi', {
            method: 'POST',
            headers: AUTH_HEADERS,
            body: JSON.stringify({ ssid, password })
          });
          const j = await res.json();
          if (!res.ok || j.code !== 0) throw new Error(j.message || '保存失败');
          toast('✓ WiFi 配置已保存', 'success');
        } catch (err) { alert('保存失败：' + err.message); }
      });
    }
  }

  // ===== 定位 =====
  function useMyLocation() {
    const btn = $('#useMyLocationBtn');
    const status = $('#locateStatus');
    const statusMsg = status.querySelector('.locate-status-msg');
    const statusIcon = status.querySelector('.locate-status-icon');

    if (!navigator.geolocation) {
      setLocateStatus('error', '❌', '浏览器不支持定位 (没有 Geolocation API)');
      return;
    }
    btn.disabled = true;
    setLocateStatus('loading', '⏳', '正在获取位置, 请在浏览器弹窗中授权...');
    const timer = setTimeout(() => {
      btn.disabled = false;
      setLocateStatus('error', '⏱️', '定位超时, 请到室外或窗边重试');
    }, 20000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        btn.disabled = false;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const latInput = $('#latInput');
        const lngInput = $('#lngInput');
        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);
        [latInput, lngInput].forEach(el => {
          if (el) { el.style.background = '#fff3e0'; setTimeout(() => { el.style.background = ''; }, 1500); }
        });
        if (pickMarker) map.removeOverlay(pickMarker);
        pickMarker = BaiduMap.addDivMarker(map, lng, lat, '<div class="pick-marker">📍</div>', { x: 12, y: 24 });
        BaiduMap.setCenter(map, lng, lat, 17);
        let accText = '';
        if (typeof accuracy === 'number' && accuracy < 1000) accText = ` (精度 ±${Math.round(accuracy)}m)`;
        else if (typeof accuracy === 'number') accText = ` (精度 ±${(accuracy/1000).toFixed(1)}km, 建议在开阔地重试)`;
        setLocateStatus('success', '✅', `已填入坐标${accText}`);
      },
      (err) => {
        clearTimeout(timer);
        btn.disabled = false;
        let msg = '未知错误';
        switch (err.code) {
          case 1: msg = '权限被拒绝, 请在浏览器设置中允许位置访问'; break;
          case 2: msg = '位置不可用, 请检查 GPS / 移到窗边或室外'; break;
          case 3: msg = '定位超时, 请重试'; break;
          default: msg = err.message || ('code=' + err.code);
        }
        setLocateStatus('error', '❌', msg);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 18000 }
    );
  }
  function setLocateStatus(type, icon, msg) {
    const status = $('#locateStatus');
    const statusMsg = status.querySelector('.locate-status-msg');
    const statusIcon = status.querySelector('.locate-status-icon');
    if (!status) return;
    status.className = 'locate-status ' + type;
    if (statusIcon) statusIcon.textContent = icon;
    if (statusMsg) statusMsg.textContent = msg;
  }

  // ===== 暴露给 shell =====
  window.CampAdmin = {
    boot: boot,
    // onEnter: 进入 section 时调用, 通知其他模块刷新
    onEnter: function (hash) {
      if (hash === 'wifi') loadWifiSettings();
      // 通知子模块 (admin-booking / coupons / ar / users) 进入某 section
      window.dispatchEvent(new CustomEvent('admin-section-enter', { detail: { hash } }));
    }
  };
})();
