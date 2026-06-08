(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let map;
  let pickMarker = null;
  let points = [];

  function init() {
    // 渲染用 WGS-84 输入, BMap 内部转 BD-09
    points = CampData.getPoints();
    initMap();
    renderTable();
    bindEvents();
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
    BaiduMap.clearOverlays(map);
    pickMarker = null;
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const html = `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`;
      BaiduMap.addDivMarker(map, p.lng, p.lat, html, { x: 16, y: 16 });
    });
  }

  function placePickMarker(lng, lat) {
    if (pickMarker) {
      map.removeOverlay(pickMarker);
    }
    const html = '<div class="pick-marker">📌</div>';
    pickMarker = BaiduMap.addDivMarker(map, lng, lat, html, { x: 12, y: 24 });
  }

  function renderTable() {
    const tbody = $('#pointsTable');
    tbody.innerHTML = '';
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${meta.icon} ${meta.label}</td>
        <td>${CampData.escapeHtml(p.name)}</td>
        <td>${p.lat.toFixed(6)}</td>
        <td>${p.lng.toFixed(6)}</td>
        <td>${CampData.escapeHtml(p.description || '')}</td>
        <td><button class="btn small danger" data-id="${p.id}">删除</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('确认删除该活动点？')) return;
        points = CampData.deletePoint(id);
        refreshMapMarkers();
        renderTable();
      });
    });
  }

  function bindEvents() {
    $('#pointForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const newPoint = {
        id: 'p' + Date.now(),
        name: fd.get('name'),
        type: fd.get('type'),
        lat: parseFloat(fd.get('lat')),
        lng: parseFloat(fd.get('lng')),
        description: fd.get('description') || ''
      };
      try {
        points = CampData.addPoint(newPoint);
        e.target.reset();
        refreshMapMarkers();
        renderTable();
        alert('✓ 已添加');
      } catch (err) {
        alert('添加失败：' + err.message);
      }
    });

    // 使用我的位置按钮
    const useLocBtn = $('#useMyLocationBtn');
    if (useLocBtn) {
      useLocBtn.addEventListener('click', useMyLocation);
    }

    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('恢复为默认 6 活动点？现有自定义数据会丢失。')) return;
      points = CampData.resetToDefault();
      refreshMapMarkers();
      renderTable();
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
      reader.onload = () => {
        try {
          CampData.importJSON(reader.result);
          points = CampData.getPoints();
          refreshMapMarkers();
          renderTable();
          alert('✓ 导入成功');
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
