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

  function formatDist(m) {
    if (m < 1000) return Math.round(m) + ' 米';
    return (m / 1000).toFixed(2) + ' 公里';
  }

  // ===== 状态 =====
  let map;
  let userMarker = null;
  let userArrowEl = null;
  let routeLine = null;
  let destMarker = null;
  let points = [];
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

  // ===== 初始化 =====
  function init() {
    // 渲染用 BD-09 (百度)
    points = CampData.getPoints();
    // 默认中心用第一个点的真实位置 (WGS-84)
    const first = points[0] || { lat: 31.485759, lng: 121.297886 };

    // 初始化百度地图
    map = BaiduMap.initBaiduMap('map', {
      lng: first.lng,
      lat: first.lat,
      zoom: 15,
      enableScrollWheelZoom: true
    });

    renderPoints();
    populateSelect();
    createUserMarker(first.lat, first.lng);

    $('#destSelect').addEventListener('change', onDestChange);
    $('#locateBtn').addEventListener('click', locateMe);
    $('#enableCompassBtn').addEventListener('click', requestOrientation);

    // 定位失败 banner 按钮
    const retryBtn = $('#locateRetryBtn');
    const dismissBtn = $('#locateDismissBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => { hideLocateError(); startGeolocation(); });
    if (dismissBtn) dismissBtn.addEventListener('click', hideLocateError);

    startGeolocation();
    setupOrientation();
  }

  function renderPoints() {
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const html = `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`;
      const overlay = BaiduMap.addDivMarker(map, p.lng, p.lat, html, { x: 16, y: 16 });
      // BMap 没有原生 popup, 改用 click 事件
      overlay._div.addEventListener('click', () => {
        const info = new BMap.InfoWindow(
          `<b>${CampData.escapeHtml(p.name)}</b><br/>${CampData.escapeHtml(p.description || '')}<br/><small>${meta.label}</small>`,
          { width: 200, height: 80 }
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
      // fitBounds
      const [bdLng1, bdLat1] = Wgs84ToBd09.wgs84ToBd09(userLatLng[1], userLatLng[0]);
      const [bdLng2, bdLat2] = Wgs84ToBd09.wgs84ToBd09(dest.lng, dest.lat);
      const bsw = new BMap.Bounds(
        new BMap.Point(Math.min(bdLng1, bdLng2), Math.min(bdLat1, bdLat2)),
        new BMap.Point(Math.max(bdLng1, bdLng2), Math.max(bdLat1, bdLat2))
      );
      map.setViewport({ center: bsw.getCenter(), zoom: 17 });
    } else {
      BaiduMap.setCenter(map, dest.lng, dest.lat, 17);
    }

    $('#routeInfo').classList.remove('hidden');
    updateRouteInfo();
  }

  function updateRouteInfo() {
    const dest = getSelectedPoint();
    if (!dest) return;
    if (userLatLng) {
      const d = haversine(userLatLng[0], userLatLng[1], dest.lat, dest.lng);
      const b = bearing(userLatLng[0], userLatLng[1], dest.lat, dest.lng);
      $('#distText').textContent = formatDist(d);
      $('#dirText').textContent = cardinal(b) + ' (' + Math.round(b) + '°)';
    } else {
      $('#distText').textContent = '定位中…';
      $('#dirText').textContent = '定位中…';
    }

    if (currentHeading != null) {
      $('#headText').textContent = cardinal(currentHeading) + ' (' + Math.round(currentHeading) + '°)';
    } else {
      $('#headText').textContent = '计算中…';
    }
    if (movementHeading != null) {
      $('#moveText').textContent = cardinal(movementHeading) + ' (' + Math.round(movementHeading) + '°)';
    } else {
      $('#moveText').textContent = '静止';
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
