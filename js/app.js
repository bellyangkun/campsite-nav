(function () {
  'use strict';

  // ===== 工具函数 =====
  const $ = (sel) => document.querySelector(sel);
  const DEG = 180 / Math.PI;
  const RAD = Math.PI / 180;

  function toRad(d) { return d * RAD; }
  function toDeg(r) { return r * DEG; }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // 从 (lat1,lng1) 到 (lat2,lng2) 的方位角（正北为0，顺时针）
  function bearing(lat1, lng1, lat2, lng2) {
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δλ = toRad(lng2 - lng1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (toDeg(θ) + 360) % 360;
  }

  function cardinal(deg) {
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北', '北'];
    return dirs[Math.round(deg / 45)];
  }

  // 中文方向 + 箭头 icon (用于 dir-icon)
  function cardinalWithIcon(deg) {
    const icon = ['⬆', '↗', '➤', '↘', '⬇', '↙', '⬅', '↖'][Math.round(deg / 45) % 8];
    const dir = cardinal(deg);
    return { icon, dir, text: `${dir} ${Math.round(deg)}°` };
  }

  // 距离 + 单位 (用于 stat-num + stat-unit)
  function formatDistParts(m) {
    if (m == null || isNaN(m)) return { num: '-', unit: '' };
    if (m < 1000) return { num: Math.round(m), unit: '米' };
    if (m < 100) return { num: (m / 1000).toFixed(2), unit: '公里' };
    return { num: Math.round(m / 1000), unit: '公里' };
  }

  // 步行时间估算 (按 5km/h = 83米/分)
  function formatWalkTime(m) {
    if (m == null || isNaN(m)) return '-';
    const min = m / 83;  // 5 km/h
    if (min < 1) return '< 1 分钟';
    if (min < 60) return Math.round(min) + ' 分钟';
    const h = Math.floor(min / 60);
    const m2 = Math.round(min % 60);
    return h + ' 小时' + (m2 > 0 ? ' ' + m2 + ' 分' : '');
  }

  function formatDist(m) {
    if (m == null || isNaN(m)) return '-';
    if (m < 1000) return Math.round(m) + ' 米';
    return (m / 1000).toFixed(2) + ' 公里';
  }

  // ===== 状态 =====
  let map;
  let userMarker = null;
  let userArrowEl = null;
  let routeLine = null;
  let destMarker = null;
  let points = [];           // 全部活动点
  let visiblePoints = [];    // 当前可见（按搜索+类型过滤后）
  let userLatLng = null;
  let lastPos = null;
  let lastMoveTime = 0;
  let lastMoveHeading = null;
  let currentHeading = null;
  let movementHeading = null;
  let selectedDestId = null;
  let watchId = null;
  let orientationActive = false;
  let compassHeading = null;
  let activeTypeFilter = 'all';
  let mapOverlays = {};      // { pointId: overlay } 用于显隐

  // ===== 初始化 =====
  function init() {
    try {
      showLoading();
      // 首次渲染用 sync 数据 (localStorage 或默认)
      points = CampData.getPointsSync();
      // 默认中心用第一个点的真实位置 (WGS-84)
      const first = points[0] || { lat: 31.485759, lng: 121.297886 };

      // 绑定 UI 事件 (不依赖地图)
      $('#destSelect').addEventListener('change', onDestChange);
      $('#locateBtn').addEventListener('click', locateMe);
      $('#enableCompassBtn').addEventListener('click', requestOrientation);

      // 定位失败 banner 按钮
      const retryBtn = $('#locateRetryBtn');
      const dismissBtn = $('#locateDismissBtn');
      if (retryBtn) retryBtn.addEventListener('click', () => { hideLocateError(); startGeolocation(); });
      if (dismissBtn) dismissBtn.addEventListener('click', hideLocateError);

      populateSelect();

      // 搜索 + 类型过滤
      setupTypeFilter();

      // 百度地图 API 异步加载, 等就绪再 init
      BaiduMap._onError = (msg) => {
        console.error('[app] 地图错误:', msg);
        const el = document.getElementById('map');
        if (el) el.innerHTML = '<div style="padding:20px;color:#fff;background:#c62828">⚠️ ' + msg + '</div>';
        hideLoading();
      };
      BaiduMap.ready(() => {
        try {
          map = BaiduMap.initBaiduMap('map', {
            lng: first.lng,
            lat: first.lat,
            zoom: 15,
            enableScrollWheelZoom: true
          });
          renderPoints();
          createUserMarker(first.lat, first.lng);
          // 智能调度: fitBounds 全部活动点 (不用 flyTo 单一目标)
          fitBoundsToAllPoints();
          hideLoading();
        } catch (e) {
          console.error('[app] initMap 失败:', e);
          BaiduMap._onError('地图初始化失败: ' + e.message);
          hideLoading();
        }
      });

      startGeolocation();
      setupOrientation();

      // 服务器同步完成后, 如果新数据有变化则重渲染
      document.addEventListener('campsite-sync-done', (e) => {
        const newPoints = CampData.getPointsSync();
        if (newPoints.length !== points.length || newPoints.some((p, i) => p.id !== (points[i] && points[i].id))) {
          console.log('[app] 服务器数据有变化, 重新渲染');
          points = newPoints;
          populateSelect();
          if (map) {
            BaiduMap.clearOverlays(map);
            mapOverlays = {};
            renderPoints();
            fitBoundsToAllPoints();
          }
        }
      });
    } catch (e) {
      console.error('[app] init 失败:', e);
      hideLoading();
    }
  }

  function showLoading() {
    const el = $('#loadingIndicator');
    if (el) el.classList.remove('hidden');
  }
  function hideLoading() {
    const el = $('#loadingIndicator');
    if (el) el.classList.add('hidden');
  }

  // 显示在地图上
  function fitBoundsToAllPoints() {
    if (!map) return;
    if (visiblePoints.length === 0) return;
    try {
      const pts = visiblePoints.map(p => {
        const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(p.lng, p.lat);
        return new BMap.Point(bdLng, bdLat);
      });
      const viewport = map.getViewport(pts);
      map.setViewport(viewport, { margins: [80, 60, 200, 60] });  // 上右下左
    } catch (e) {
      console.warn('fitBounds 失败', e);
    }
  }

  // ===== 类型过滤 =====
  function setupTypeFilter() {
    const chips = document.querySelectorAll('#typeChips .chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeTypeFilter = chip.dataset.type;
        applyFilters();
      });
    });
  }

  function applyFilters() {
    // 过滤点
    visiblePoints = points.filter(p => {
      if (activeTypeFilter !== 'all' && p.type !== activeTypeFilter) return false;
      return true;
    });
    // 更新地图标记显隐
    if (map) {
      Object.keys(mapOverlays).forEach(id => {
        const isVisible = visiblePoints.some(p => p.id === id);
        try { mapOverlays[id]._div.style.display = isVisible ? '' : 'none'; } catch (e) {}
      });
    }
    // 更新下拉框
    populateSelect();
  }

  function renderPoints() {
    if (!map) return;
    visiblePoints = points.slice();  // 默认全部可见
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const html = `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`;
      const overlay = BaiduMap.addDivMarker(map, p.lng, p.lat, html, { x: 16, y: 16 });
      mapOverlays[p.id] = overlay;
      // BMap 没有原生 popup, 改用 click 事件
      overlay._div.addEventListener('click', () => {
        const info = new BMap.InfoWindow(
          `<b>${CampData.escapeHtml(p.name)}</b><br/>${CampData.escapeHtml(p.description || '')}<br/><small>${meta.label}</small>`,
          { width: 220, height: 80 }
        );
        map.openInfoWindow(info, new BMap.Point(
          ...Wgs84ToBd09.wgs84ToBd09(p.lng, p.lat)
        ));
      });
    });
  }

  function populateSelect() {
    const sel = $('#destSelect');
    sel.innerHTML = '<option value="">-- 请选择 --</option>';
    points.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${CampData.getTypeMeta(p.type).icon} ${p.name}`;
      sel.appendChild(opt);
    });
  }

  function createUserMarker(lat, lng) {
    const html = '<div class="user-marker-icon"><div class="user-arrow" id="userArrow"></div><div class="user-dot"></div></div>';
    userMarker = BaiduMap.addDivMarker(map, lng, lat, html, { x: 12, y: 12 });
    userArrowEl = document.getElementById('userArrow');
  }

  // ===== 路线与方向 =====
  function onDestChange() {
    selectedDestId = $('#destSelect').value || null;
    drawRoute();
  }

  function getSelectedPoint() {
    return points.find((p) => p.id === selectedDestId) || null;
  }

  function drawRoute() {
    if (routeLine) { map.removeOverlay(routeLine); routeLine = null; }
    if (destMarker) { map.removeOverlay(destMarker); destMarker = null; }

    const dest = getSelectedPoint();
    if (!dest) {
      $('#routeInfo').classList.add('hidden');
      return;
    }

    // 目标标记高亮
    const destHtml = '<div class="camp-marker-icon" style="color:#E91E63;border-color:#E91E63;font-size:26px;width:38px!important;height:38px!important">🏁</div>';
    destMarker = BaiduMap.addDivMarker(map, dest.lng, dest.lat, destHtml, { x: 19, y: 19 });

    if (userLatLng) {
      routeLine = BaiduMap.addPolyline(map,
        { lng: userLatLng[1], lat: userLatLng[0] },
        { lng: dest.lng, lat: dest.lat },
        { strokeColor: '#2196F3', strokeWeight: 5, strokeOpacity: 0.85, strokeStyle: 'dashed' }
      );
      // fitBounds 包含用户 + 目标 (智能调度, 让用户看全路线)
      try {
        const [bdLng1, bdLat1] = Wgs84ToBd09.wgs84ToBd09(userLatLng[1], userLatLng[0]);
        const [bdLng2, bdLat2] = Wgs84ToBd09.wgs84ToBd09(dest.lng, dest.lat);
        const pts = [new BMap.Point(bdLng1, bdLat1), new BMap.Point(bdLng2, bdLat2)];
        const viewport = map.getViewport(pts);
        map.setViewport(viewport, { margins: [80, 60, 200, 60] });
      } catch (e) { console.warn('fitBounds 失败', e); }
    } else {
      // 没有用户位置, fitBounds 度假村中心 + 目标
      try {
        const [bdLng1, bdLat1] = Wgs84ToBd09.wgs84ToBd09(31.481527, 121.286954);
        const [bdLng2, bdLat2] = Wgs84ToBd09.wgs84ToBd09(dest.lng, dest.lat);
        const pts = [new BMap.Point(bdLng1, bdLat1), new BMap.Point(bdLng2, bdLat2)];
        const viewport = map.getViewport(pts);
        map.setViewport(viewport, { margins: [80, 60, 200, 60] });
      } catch (e) {
        BaiduMap.setCenter(map, dest.lng, dest.lat, 17);
      }
    }

    $('#routeInfo').classList.remove('hidden');
    updateRouteInfo();
  }

  function updateRouteInfo() {
    const dest = getSelectedPoint();
    if (!dest) return;

    // 距离 + 步行时间
    const distTextEl = $('#distText');
    const distUnitEl = $('#distUnit');
    const timeTextEl = $('#timeText');
    if (userLatLng) {
      const d = haversine(userLatLng[0], userLatLng[1], dest.lat, dest.lng);
      const distParts = formatDistParts(d);
      distTextEl.textContent = distParts.num;
      if (distUnitEl) distUnitEl.textContent = distParts.unit;
      if (timeTextEl) timeTextEl.textContent = formatWalkTime(d);
    } else {
      distTextEl.textContent = '—';
      if (distUnitEl) distUnitEl.textContent = '定位中';
      if (timeTextEl) timeTextEl.textContent = '—';
    }

    // 目标方向 (高亮卡片)
    const dirIconEl = $('#dirIcon');
    const dirTextEl = $('#dirText');
    if (userLatLng) {
      const b = bearing(userLatLng[0], userLatLng[1], dest.lat, dest.lng);
      const ci = cardinalWithIcon(b);
      if (dirIconEl) dirIconEl.textContent = ci.icon;
      if (dirTextEl) dirTextEl.textContent = ci.text;
    } else {
      if (dirIconEl) dirIconEl.textContent = '➤';
      if (dirTextEl) dirTextEl.textContent = '定位中…';
    }

    // 当前朝向
    const headTextEl = $('#headText');
    if (currentHeading != null) {
      headTextEl.textContent = cardinalWithIcon(currentHeading).text;
    } else {
      headTextEl.textContent = '计算中…';
    }
    // 移动方向
    const moveTextEl = $('#moveText');
    if (movementHeading != null) {
      moveTextEl.textContent = cardinalWithIcon(movementHeading).text;
    } else {
      moveTextEl.textContent = '静止';
    }
  }

  // ===== 定位 =====
  function startGeolocation() {
    if (!navigator.geolocation) {
      showLocateError('浏览器不支持定位', '当前浏览器没有 Geolocation API, 无法获取位置。请用 Chrome / Safari / Edge 访问。');
      return;
    }
    // 显示"定位中"状态
    $('#distText').textContent = '定位中…';
    $('#dirText').textContent = '定位中…';

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    watchId = navigator.geolocation.watchPosition(
      onPosition,
      onPositionError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function onPositionError(err) {
    let title = '定位失败';
    let msg = '请检查 GPS / 位置权限';
    switch (err.code) {
      case 1: // PERMISSION_DENIED
        title = '定位权限被拒绝';
        msg = '请在浏览器设置中允许位置访问 (通常在地址栏左侧的锁形图标)。';
        break;
      case 2: // POSITION_UNAVAILABLE
        title = '位置不可用';
        msg = '设备无法获取当前位置, 请检查:\n• GPS / 定位服务是否开启\n• 室内可能信号弱, 移到窗边或室外\n• 关闭飞行模式';
        break;
      case 3: // TIMEOUT
        title = '定位超时';
        msg = '获取位置超过 15 秒未响应, 请检查网络/GPS 信号, 或点击"重试"。';
        break;
      default:
        msg = '未知错误: ' + (err.message || err.code);
    }
    showLocateError(title, msg);
    // 用户位置标记变灰
    if (userMarker && userMarker._div) {
      const icon = userMarker._div.querySelector('.user-marker-icon');
      if (icon) icon.classList.add('failed');
    }
  }

  function showLocateError(title, msg) {
    const banner = $('#locateErrorBanner');
    const titleEl = banner.querySelector('.locate-error-title');
    const msgEl = $('#locateErrorMsg');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) {
      msgEl.textContent = msg;
      msgEl.style.whiteSpace = 'pre-line';
    }
    banner.classList.remove('hidden');
  }

  function hideLocateError() {
    $('#locateErrorBanner').classList.add('hidden');
  }

  function onPosition(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const heading = (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) ? pos.coords.heading : null;
    const accuracy = pos.coords.accuracy || 0;

    // 第一次成功, 隐藏错误 banner, 解除 marker 灰显
    if (userLatLng === null) {
      hideLocateError();
      if (userMarker && userMarker._div) {
        const icon = userMarker._div.querySelector('.user-marker-icon');
        if (icon) icon.classList.remove('failed');
      }
    }

    userLatLng = [lat, lng];

    // 移动 user marker 到新位置
    if (userMarker) {
      // 移除旧的, 加新的 (BMap divOverlay 不易移动, 用更简单办法: clearOverlays + 重画)
      map.removeOverlay(userMarker);
      createUserMarker(lat, lng);
    }

    // 移动方向
    if (lastPos) {
      const dist = haversine(lastPos[0], lastPos[1], lat, lng);
      if (dist > 1.5) {
        movementHeading = bearing(lastPos[0], lastPos[1], lat, lng);
        lastMoveTime = Date.now();
        lastMoveHeading = movementHeading;
      } else if (Date.now() - lastMoveTime > 5000) {
        movementHeading = null;
      }
    }
    lastPos = [lat, lng];

    if (heading !== null) {
      setHeading(heading, 'GPS');
    } else if (movementHeading !== null) {
      setHeading(movementHeading, '移动');
    }

    if (selectedDestId) {
      // 重画路线 (BMap Polyline 移动端支持 setPath, 但旧版本不直接支持, 用 redraw)
      if (routeLine) {
        map.removeOverlay(routeLine);
        const dest = getSelectedPoint();
        routeLine = BaiduMap.addPolyline(map,
          { lng: lng, lat: lat },
          { lng: dest.lng, lat: dest.lat }
        );
      }
      updateRouteInfo();
    }
  }

  function locateMe() {
    if (!userLatLng) return;
    BaiduMap.setCenter(map, userLatLng[1], userLatLng[0], 18);
  }

  // ===== 方向/指南针 =====
  function setupOrientation() {
    if (typeof window.DeviceOrientationEvent === 'undefined') return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      $('#permBanner').classList.remove('hidden');
    } else {
      enableOrientationListener();
    }
  }

  function requestOrientation() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state === 'granted') {
            $('#permBanner').classList.add('hidden');
            enableOrientationListener();
          } else {
            alert('未获得方向传感器权限，将使用GPS移动方向进行导航。');
          }
        })
        .catch((err) => {
          console.warn('请求方向权限失败', err);
          alert('无法启用指南针：' + err.message);
        });
    }
  }

  function enableOrientationListener() {
    if (orientationActive) return;
    orientationActive = true;
    window.addEventListener('deviceorientation', onOrientation, true);
    $('#compass').classList.remove('hidden');
  }

  function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading;
    } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
      h = (360 - e.alpha) % 360;
      if (h < 0) h += 360;
    }
    if (h === null) return;
    compassHeading = h;
    if (!movementHeading) {
      setHeading(compassHeading, '指南针');
    }
    updateCompassUI(compassHeading);
  }

  function setHeading(heading, source) {
    currentHeading = heading;
    updateArrowUI(heading);
  }

  function updateArrowUI(deg) {
    if (!userArrowEl) return;
    userArrowEl.style.transform = `rotate(${deg}deg)`;
  }

  function updateCompassUI(deg) {
    const arrow = $('#compass .arrow');
    if (arrow) arrow.style.transform = `rotate(${deg}deg)`;
  }

  // ===== 启动 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
