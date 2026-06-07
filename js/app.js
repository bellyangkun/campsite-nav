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
  let userMarker;
  let userArrowEl;
  let routeLine = null;
  let destMarker = null;
  let points = [];
  let userLatLng = null;
  let lastPos = null;
  let lastMoveTime = 0;
  let lastMoveHeading = null;
  let currentHeading = null;      // 当前面朝方向（指南针或GPS heading）
  let movementHeading = null;     // 移动方向（由位置变化计算）
  let selectedDestId = null;
  let watchId = null;
  let orientationActive = false;

  // ===== 初始化 =====
  function init() {
    // 渲染坐标用 GCJ-02(高德),用户输入仍是 WGS-84
    points = CampData.getDisplayPoints();
    const first = points[0] || { lat: 31.465, lng: 121.236 };

    map = L.map('map', { zoomControl: false }).setView([first.lat, first.lng], 14);
    // 天地图 街道图(底图)
    const baseUrl = 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileCol={x}&TileRow={y}&TileMatrix={z}';
    // 天地图 中文标注(覆盖在底图上)
    const labelUrl = 'https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileCol={x}&TileRow={y}&TileMatrix={z}';
    L.tileLayer(baseUrl, {
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      maxZoom: 18,
      attribution: '&copy; 天地图'
    }).addTo(map);
    L.tileLayer(labelUrl, {
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      maxZoom: 18,
      pane: 'shadowPane',
      attribution: ''
    }).addTo(map);

    renderPoints();
    populateSelect();
    createUserMarker(first.lat, first.lng);

    $('#destSelect').addEventListener('change', onDestChange);
    $('#locateBtn').addEventListener('click', locateMe);
    $('#enableCompassBtn').addEventListener('click', requestOrientation);

    startGeolocation();
    setupOrientation();
  }

  function renderPoints() {
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const icon = L.divIcon({
        className: 'camp-marker-wrap',
        html: `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
      marker.bindPopup(`<b>${CampData.escapeHtml(p.name)}</b><br/>${CampData.escapeHtml(p.description || '')}<br/><small>${meta.label}</small>`);
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
    const icon = L.divIcon({
      className: 'user-marker-wrap',
      html: '<div class="user-marker-icon"><div class="user-arrow" id="userArrow"></div><div class="user-dot"></div></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    userArrowEl = userMarker.getElement().querySelector('#userArrow');
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
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }

    const dest = getSelectedPoint();
    if (!dest) {
      $('#routeInfo').classList.add('hidden');
      return;
    }

    // 目标标记高亮
    destMarker = L.marker([dest.lat, dest.lng], {
      icon: L.divIcon({
        className: 'camp-marker-wrap',
        html: `<div class="camp-marker-icon" style="color:#E91E63;border-color:#E91E63;font-size:26px;width:38px!important;height:38px!important">🏁</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38]
      }),
      zIndexOffset: 500
    }).addTo(map);

    if (userLatLng) {
      // userLatLng 是 WGS-84,转 GCJ-02 渲染
      const [userLngG, userLatG] = (typeof Wgs84ToGcj02 !== 'undefined') ? Wgs84ToGcj02.wgs84ToGcj02(userLatLng[1], userLatLng[0]) : [userLatLng[1], userLatLng[0]];
      routeLine = L.polyline([[userLatG, userLngG], [dest.lat, dest.lng]], {
        color: '#2196F3',
        weight: 5,
        opacity: 0.85,
        dashArray: '10, 8',
        lineCap: 'round'
      }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [60, 60], maxZoom: 18 });
    } else {
      map.flyTo([dest.lat, dest.lng], 17);
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
    if (!navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      onPosition,
      (err) => console.warn('定位失败', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function onPosition(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const heading = (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) ? pos.coords.heading : null;
    const accuracy = pos.coords.accuracy || 0;

    // GPS 原始 WGS-84,保留用于距离/方位计算
    userLatLng = [lat, lng];
    // 渲染位置:转 GCJ-02
    const [glng, glat] = (typeof Wgs84ToGcj02 !== 'undefined') ? Wgs84ToGcj02.wgs84ToGcj02(lng, lat) : [lng, lat];
    if (userMarker) userMarker.setLatLng([glat, glng]);

    // 移动方向：根据前后两点计算
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

    // 优先使用 GPS heading，否则使用移动方向作为朝向
    if (heading !== null) {
      setHeading(heading, 'GPS');
    } else if (movementHeading !== null) {
      setHeading(movementHeading, '移动');
    }

    if (selectedDestId) {
      if (routeLine) {
        const [userLngG, userLatG] = (typeof Wgs84ToGcj02 !== 'undefined') ? Wgs84ToGcj02.wgs84ToGcj02(userLatLng[1], userLatLng[0]) : [userLatLng[1], userLatLng[0]];
        const dest = getSelectedPoint();
        routeLine.setLatLngs([[userLatG, userLngG], [dest.lat, dest.lng]]);
      }
      updateRouteInfo();
    }
  }

  function locateMe() {
    if (!userLatLng) return;
    map.flyTo(userLatLng, 18);
  }

  // ===== 方向/指南针 =====
  function setupOrientation() {
    if (typeof window.DeviceOrientationEvent === 'undefined') return;
    // iOS 13+ 需要显式请求权限
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
    // iOS webkitCompassHeading 已为正北顺时针
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading;
    } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
      // Android 一般使用 alpha：设备朝北为0，顺时针增大，需取反并校准
      h = (360 - e.alpha) % 360;
      if (h < 0) h += 360;
    }
    if (h === null) return;
    compassHeading = h;
    // 当没有 GPS heading 且未在移动时，使用指南针作为当前朝向
    if (!movementHeading) {
      setHeading(compassHeading, '指南针');
    }
    updateCompassUI(compassHeading);
  }

  function setHeading(heading, source) {
    currentHeading = heading;
    updateArrowUI(heading);
    // 在控制台低频率输出朝向来源，便于调试
    // console.log('heading', source, heading);
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
