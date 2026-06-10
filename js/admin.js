(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const API_BASE = (typeof window !== 'undefined' && window.CAMPSITE_API) || '';
  const ADMIN_PASSWORD = '8888';
  const AUTH_KEY = 'campsite_admin_authed';

  // ===== 登录门 =====
  function setupLoginGate() {
    const gate = $('#loginGate');
    const content = $('#adminContent');
    const form = $('#loginForm');
    const input = $('#loginPassword');
    const error = $('#loginError');

    // 已登录过, 直接放行
    if (sessionStorage.getItem(AUTH_KEY) === '1') {
      gate.classList.add('hidden');
      content.style.display = '';
      return;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const pwd = input.value;
      if (pwd === ADMIN_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, '1');
        gate.classList.add('hidden');
        content.style.display = '';
        init();  // 启动后台逻辑
        // 触发 resize 让 BMap 重新计算容器尺寸
        window.dispatchEvent(new Event('resize'));
      } else {
        error.classList.remove('hidden');
        input.value = '';
        input.focus();
        setTimeout(() => error.classList.add('hidden'), 2000);
      }
    });

    input.focus();
  }

  let map;
  let pickMarker = null;
  let points = [];

  function init() {
    try {
      // 首次渲染用 sync 数据 (localStorage 或默认), 后续 sync 完成后重新渲染
      points = CampData.getPointsSync();
      renderTable();
      bindEvents();

      // 百度地图 API 异步加载, 等就绪再 initMap
      BaiduMap._onError = (msg) => {
        console.error('[admin] 地图错误:', msg);
        const el = document.getElementById('pickMap');
        if (el) el.innerHTML = '<div style="padding:20px;color:#c62828;background:#ffebee">⚠️ ' + msg + '<br><br><small>(表单功能仍可用, 添加活动点请直接填坐标)</small></div>';
      };
      BaiduMap.ready(() => {
        try {
          initMap();
        } catch (e) {
          console.error('[admin] initMap 失败:', e);
          BaiduMap._onError('地图初始化失败: ' + e.message);
        }
      });

      // 监听服务器同步完成, 自动重新渲染 (新数据可能比 localStorage 新)
      document.addEventListener('campsite-sync-done', (e) => {
        console.log('[admin] sync 完成, 数据源:', e.detail.source);
        points = CampData.getPointsSync();
        if (map) try { refreshMapMarkers(); } catch (er) { console.error(er); }
        renderTable();
        // 提示用户
        const sourceLabel = { server: '☁️ 服务器', local: '💾 本地缓存', default: '🆕 默认' }[e.detail.source] || e.detail.source;
        const status = $('#syncStatus');
        if (status) {
          status.textContent = `数据源: ${sourceLabel} (${points.length} 个活动点)`;
          setTimeout(() => { status.textContent = ''; }, 3000);
        }
      });
    } catch (e) {
      console.error('[admin] init 失败:', e);
      // 兜底: 至少让用户能看到错误 + 表单仍可用
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px;background:#ffcdd2;color:#c62828;z-index:99999;text-align:center';
      banner.textContent = '⚠️ 初始化失败: ' + e.message;
      document.body.prepend(banner);
    }
  }

  function initMap() {
    const first = points[0] || { lat: 31.485759, lng: 121.297886 };
    map = BaiduMap.initBaiduMap('pickMap', {
      lng: first.lng,
      lat: first.lat,
      zoom: 15
    });

    refreshMapMarkers();

    // BMap 用 addEventListener 监听 click
    map.addEventListener('click', (e) => {
      // e.point 是 BD-09 坐标, 反推 WGS-84 给用户显示
      const bdLng = e.point.lng;
      const bdLat = e.point.lat;
      // BD-09 -> GCJ-02 -> WGS-84
      const wgs84 = bd09ToWgs84(bdLng, bdLat);
      const wgsLat = wgs84[1];
      const wgsLng = wgs84[0];
      $('input[name="lat"]').value = wgsLat.toFixed(6);
      $('input[name="lng"]').value = wgsLng.toFixed(6);
      placePickMarker(wgsLng, wgsLat);
    });
  }

  /**
   * BD-09 -> WGS-84
   * (反向 Wgs84ToBd09)
   */
  function bd09ToWgs84(bdLng, bdLat) {
    const xPi = (bdLng * Math.PI) * 3000.0 / 180.0;
    const z = Math.sqrt(bdLng * bdLng + bdLat * bdLat) - 0.00002 * Math.sin(xPi);
    const theta = Math.atan2(bdLat, bdLng) - 0.000003 * Math.cos(xPi);
    const gcjLng = z * Math.cos(theta) - 0.0065;
    const gcjLat = z * Math.sin(theta) - 0.006;
    // GCJ-02 -> WGS-84 (反向)
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
  // 复用 coords.js 里的 transformLat/Lng
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

  function refreshMapMarkers() {
    if (!map) return;  // 地图未就绪
    BaiduMap.clearOverlays(map);
    pickMarker = null;
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const html = `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`;
      BaiduMap.addDivMarker(map, p.lng, p.lat, html, { x: 16, y: 16 });
    });
  }

  function placePickMarker(lng, lat) {
    if (!map) return;  // 地图未就绪
    if (pickMarker) {
      map.removeOverlay(pickMarker);
    }
    const html = '<div class="pick-marker">📌</div>';
    pickMarker = BaiduMap.addDivMarker(map, lng, lat, html, { x: 12, y: 24 });
  }

  function renderTable() {
    const tbody = $('#pointsTable');
    tbody.innerHTML = '';
    // 拉 AR frames + settings (用于 logo 下拉)
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
      // 删除按钮
      tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('确认删除该活动点？')) return;
          try {
            points = await CampData.deletePoint(id);
            refreshMapMarkers();
            renderTable();
            showSyncMsg('✓ 已删除', 'success');
          } catch (err) {
            alert('删除失败：' + err.message);
          }
        });
      });
      // 上下移按钮
      tbody.querySelectorAll('button[data-dir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const dir = btn.getAttribute('data-dir');
          if (btn.disabled) return;
          try {
            points = await CampData.movePoint(id, dir);
            if (map) try { refreshMapMarkers(); } catch (er) { console.error(er); }
            renderTable();
            showSyncMsg('✓ 已' + (dir === 'up' ? '上移' : '下移'), 'success');
          } catch (err) {
            alert('排序失败：' + err.message);
          }
        });
      });
      // logo 下拉变更: PATCH 后端
      tbody.querySelectorAll('select.logo-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const id = sel.dataset.id;
          let v = sel.value;
          if (v === '') {
            // 删 logoFrameId
            await patchLogo(id, { logoFrameId: null });
          } else if (v === '__none__') {
            // 显式 null (不贴图)
            await patchLogo(id, { logoFrameId: null });
          } else {
            await patchLogo(id, { logoFrameId: v });
          }
        });
      });
      // HTML5 drag/drop (桌面端更好用)
      bindDragReorder(tbody, sorted);
    }
  }

  async function patchLogo(pointId, body) {
    try {
      const res = await fetch(API_BASE + '/api/points/' + encodeURIComponent(pointId) + '/logo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer campsite-nav-2026' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      // 同步本地缓存
      const p = points.find(x => x.id === pointId);
      if (p) {
        if (body.logoFrameId === null) {
          delete p.logoFrameId;
          delete p.logoAnchor;
        } else if (body.logoFrameId) {
          p.logoFrameId = body.logoFrameId;
        }
      }
      showSyncMsg('✓ logo 已更新', 'success');
    } catch (err) {
      alert('logo 更新失败: ' + err.message);
      renderTable();  // 回滚 UI
    }
  }

  // ===== 拖拽重排 (HTML5 drag/drop API) =====
  let dragSrcId = null;
  function bindDragReorder(tbody, sorted) {
    tbody.querySelectorAll('tr[draggable="true"]').forEach(tr => {
      tr.addEventListener('dragstart', (e) => {
        dragSrcId = tr.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcId);
        tr.style.opacity = '0.4';
      });
      tr.addEventListener('dragend', () => {
        tr.style.opacity = '';
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tr.style.borderTop = '2px solid #2196F3';
      });
      tr.addEventListener('dragleave', () => {
        tr.style.borderTop = '';
      });
      tr.addEventListener('drop', async (e) => {
        e.preventDefault();
        tr.style.borderTop = '';
        const srcId = e.dataTransfer.getData('text/plain');
        const dstId = tr.dataset.id;
        if (!srcId || !dstId || srcId === dstId) return;
        try {
          // 把 srcId 移到 dstId 之前 (即 src 排序到 dst 之前)
          const points = CampData.getPointsSync().slice();
          const src = points.find(p => p.id === srcId);
          const dst = points.find(p => p.id === dstId);
          if (!src || !dst) return;
          const srcOrder = (typeof src.order === 'number') ? src.order : 0;
          const dstOrder = (typeof dst.order === 'number') ? dst.order : 0;
          // 直接修改 src.order, 落在 dst 之前
          // 简化策略: 取 dst 的上一个相邻点的 order + 1
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
            // 落在 prev 和 cur 之间
            if (curOrder - prevOrder >= 2) {
              newOrder = prevOrder + Math.floor((curOrder - prevOrder) / 2);
            } else {
              // 间隔 < 2, 整体规整化
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
          showSyncMsg('✓ 已重排', 'success');
        } catch (err) {
          alert('拖拽排序失败：' + err.message);
        }
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
        showSyncMsg('✓ 已添加并同步到服务器', 'success');
      } catch (err) {
        alert('添加失败：' + err.message);
      }
    });

    // 使用我的位置按钮
    const useLocBtn = $('#useMyLocationBtn');
    if (useLocBtn) {
      useLocBtn.addEventListener('click', useMyLocation);
    }

    // 同步状态显示
    if (!$('#syncStatus')) {
      const div = document.createElement('div');
      div.id = 'syncStatus';
      div.style.cssText = 'position:fixed;top:0;left:0;right:0;text-align:center;padding:6px;background:#e3f2fd;color:#1565c0;font-size:13px;z-index:9999;transition:opacity 0.3s';
      document.body.prepend(div);
    }

    // 重置排序按钮
    const normBtn = $('#normalizeOrderBtn');
    if (normBtn) {
      normBtn.addEventListener('click', async () => {
        if (!confirm('把所有活动点的 order 规整化为 100/200/300... (不会改变当前顺序)?')) return;
        try {
          points = await CampData.normalizeOrder();
          refreshMapMarkers();
          renderTable();
          showSyncMsg('✓ 已重置排序', 'success');
        } catch (err) {
          alert('重置排序失败：' + err.message);
        }
      });
    }

    $('#resetBtn').addEventListener('click', async () => {
      if (!confirm('恢复为默认 7 活动点？现有自定义数据会丢失。')) return;
      try {
        points = await CampData.resetToDefault();
        refreshMapMarkers();
        renderTable();
        showSyncMsg('✓ 已重置为默认', 'success');
      } catch (err) {
        alert('重置失败：' + err.message);
      }
    });

    $('#exportBtn').addEventListener('click', () => {
      const json = CampData.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'campsite-points.json';
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
          showSyncMsg('✓ 已导入并同步到服务器', 'success');
        } catch (err) {
          alert('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // ===== 使用我当前位置 =====
  function useMyLocation() {
    const btn = $('#useMyLocationBtn');
    const status = $('#locateStatus');
    const statusMsg = status.querySelector('.locate-status-msg');
    const statusIcon = status.querySelector('.locate-status-icon');

    if (!navigator.geolocation) {
      setLocateStatus('error', '❌', '浏览器不支持定位 (没有 Geolocation API)');
      return;
    }

    // 进入加载状态
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
        const accuracy = pos.coords.accuracy; // 米

        // 填入表单
        const latInput = $('#latInput');
        const lngInput = $('#lngInput');
        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);

        // 表单视觉高亮一下
        [latInput, lngInput].forEach(el => {
          if (el) {
            el.style.background = '#fff3e0';
            setTimeout(() => { el.style.background = ''; }, 1500);
          }
        });

        // 在地图上预览当前位置
        if (pickMarker) map.removeOverlay(pickMarker);
        const html = '<div class="pick-marker">📍</div>';
        pickMarker = BaiduMap.addDivMarker(map, lng, lat, html, { x: 12, y: 24 });
        // 居中到该点
        BaiduMap.setCenter(map, lng, lat, 17);

        // 状态显示
        let accText = '';
        if (typeof accuracy === 'number' && accuracy < 1000) {
          accText = ` (精度 ±${Math.round(accuracy)}m)`;
        } else if (typeof accuracy === 'number') {
          accText = ` (精度 ±${(accuracy/1000).toFixed(1)}km, 建议在开阔地重试)`;
        }
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

  // 启动: 先登录门
  // - 已登录过 (sessionStorage 有标记): 直接放行 + 跑 init
  // - 未登录: 等用户输入密码 + submit, 通过后 init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLoginGate);
  } else {
    setupLoginGate();
  }

  // 顶部状态条消息
  function showSyncMsg(msg, type) {
    const status = $('#syncStatus');
    if (!status) return;
    status.textContent = msg;
    status.style.background = type === 'success' ? '#c8e6c9' : type === 'error' ? '#ffcdd2' : '#e3f2fd';
    status.style.color = type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : '#1565c0';
    setTimeout(() => {
      status.textContent = '';
    }, 2500);
  }
})();
