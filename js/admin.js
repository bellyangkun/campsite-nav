(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let map;
  let pickMarker = null;
  let points = [];

  function init() {
    points = CampData.getPoints();
    initMap();
    renderTable();
    bindEvents();
  }

  function initMap() {
    const first = points[0] || { lat: 31.465, lng: 121.236 };
    map = L.map('pickMap').setView([first.lat, first.lng], 16);
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '&copy; 高德地图'
    }).addTo(map);

    // 将现有活动点显示在管理地图上
    refreshMapMarkers();

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      setFormCoords(lat, lng);
      setPickMarker(lat, lng);
    });
  }

  function refreshMapMarkers() {
    // 简单实现：清除所有非底图图层并重新添加（pickMarker 除外）
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });
    pickMarker = null;
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'camp-marker-wrap',
          html: `<div class="camp-marker-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        })
      }).addTo(map).bindPopup(`<b>${p.name}</b>`);
    });
  }

  function setPickMarker(lat, lng) {
    if (pickMarker) map.removeLayer(pickMarker);
    pickMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'camp-marker-wrap',
        html: `<div class="camp-marker-icon" style="color:#E91E63;border-color:#E91E63">✏</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })
    }).addTo(map);
  }

  function setFormCoords(lat, lng) {
    const form = $('#pointForm');
    form.lat.value = lat.toFixed(6);
    form.lng.value = lng.toFixed(6);
  }

  function bindEvents() {
    $('#pointForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const lat = parseFloat(f.lat.value);
      const lng = parseFloat(f.lng.value);
      const type = f.type.value;
      const description = f.description.value.trim();
      if (!name || isNaN(lat) || isNaN(lng)) return alert('请填写完整信息');

      CampData.addPoint({ name, lat, lng, type, description });
      f.reset();
      refresh();
    });

    $('#resetBtn').addEventListener('click', () => {
      if (confirm('确定重置为默认数据吗？当前自定义数据将丢失。')) {
        CampData.resetToDefault();
        refresh();
      }
    });

    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([CampData.exportJSON()], { type: 'application/json' });
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
      reader.onload = (ev) => {
        try {
          CampData.importJSON(ev.target.result);
          alert('导入成功');
          refresh();
        } catch (err) {
          alert('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  function refresh() {
    points = CampData.getPoints();
    renderTable();
    refreshMapMarkers();
  }

  function renderTable() {
    const tbody = $('#pointsTable');
    tbody.innerHTML = '';
    if (!points.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">暂无活动点</td></tr>';
      return;
    }
    points.forEach((p) => {
      const meta = CampData.getTypeMeta(p.type);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="color:${meta.color};font-weight:700">${meta.icon} ${meta.label}</span></td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.lat.toFixed(6)}</td>
        <td>${p.lng.toFixed(6)}</td>
        <td>${escapeHtml(p.description || '')}</td>
        <td>
          <button class="btn danger small" data-id="${p.id}">删除</button>
        </td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        if (confirm('确定删除“' + p.name + '”吗？')) {
          CampData.deletePoint(p.id);
          refresh();
        }
      });
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
