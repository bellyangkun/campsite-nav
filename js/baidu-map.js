/**
 * 百度地图 BMap JS API 集成
 *
 * 用法:
 *   1. 在 HTML 引入百度 JS API (BMapLoader.js 之前)
 *      <script src="https://api.map.baidu.com/api?v=3.0&ak=YOUR_AK"></script>
 *   2. 调用 initBaiduMap('map', { lng: 121.298, lat: 31.486, zoom: 15 })
 *
 * 坐标系约定:
 *   - 数据存储 WGS-84
 *   - 渲染 BD-09 (BMap 默认)
 *   - 通过 Wgs84ToBd09 转换
 *
 * 注意: 此文件依赖:
 *   - <script src="js/coords.js"></script> (提供 Wgs84ToBd09)
 *   - 百度 JS API 全局 (BMap)
 */
(function (global) {
  'use strict';

  /**
   * 把 HTML 元素变成 BMap 地图
   * @param {string} domId 容器 ID
   * @param {object} opts { lng, lat, zoom, enableScrollWheelZoom }
   * @returns BMap.Map 实例
   */
  function initBaiduMap(domId, opts) {
    opts = opts || {};
    const map = new BMap.Map(domId, { enableMapClick: false });
    const point = new BMap.Point(opts.lng || 121.298, opts.lat || 31.486);
    map.centerAndZoom(point, opts.zoom || 15);
    if (opts.enableScrollWheelZoom !== false) {
      map.enableScrollWheelZoom(true);
    }
    return map;
  }

  /**
   * 在地图上添加一个标注 (WGS-84 输入)
   * @param {BMap.Map} map
   * @param {number} wgsLng
   * @param {number} wgsLat
   * @param {string} html 自定义 DOM (HTML 字符串)
   * @param {object} anchor {x, y} 偏移
   * @returns BMap.Marker
   */
  function addMarker(map, wgsLng, wgsLat, html, anchor) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    const point = new BMap.Point(bdLng, bdLat);
    const marker = new BMap.Marker(point, {
      icon: new BMap.Symbol(html || '📍', {
        // 用 Symbol 的 HTML 模式
      })
    });
    // BMap.Marker 默认是 BMap.Icon, 改用自定义 div 需 setIcon
    if (html) {
      const customIcon = createDivIcon(html, anchor);
      marker.setIcon(customIcon);
    }
    map.addOverlay(marker);
    return marker;
  }

  /**
   * 自定义 DIV 标注 (BMap 没有原生 divIcon, 用 Overlay class)
   */
  class DivOverlay extends BMap.Overlay {
    constructor(point, html, anchor) {
      super();
      this._point = point;
      this._html = html;
      this._anchor = anchor || { x: 0, y: 0 };
    }
    initialize(map) {
      this._map = map;
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.transform = `translate(-${this._anchor.x}px, -${this._anchor.y}px)`;
      div.style.zIndex = '100';
      div.innerHTML = this._html;
      map.getPanes().markerPane.appendChild(div);
      this._div = div;
      return div;
    }
    draw() {
      const pixel = this._map.pointToOverlayPixel(this._point);
      this._div.style.left = pixel.x + 'px';
      this._div.style.top = pixel.y + 'px';
    }
  }

  function createDivIcon(html, anchor) {
    // 兼容旧 API, 直接返回 null
    return null;
  }

  /**
   * 在地图上添加自定义 DIV 标注
   */
  function addDivMarker(map, wgsLng, wgsLat, html, anchor) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    const point = new BMap.Point(bdLng, bdLat);
    const overlay = new DivOverlay(point, html, anchor);
    map.addOverlay(overlay);
    return overlay;
  }

  /**
   * 画两点之间的折线 (WGS-84 输入)
   */
  function addPolyline(map, wgsP1, wgsP2, opts) {
    const [lng1, lat1] = Wgs84ToBd09.wgs84ToBd09(wgsP1.lng, wgsP1.lat);
    const [lng2, lat2] = Wgs84ToBd09.wgs84ToBd09(wgsP2.lng, wgsP2.lat);
    const line = new BMap.Polyline([
      new BMap.Point(lng1, lat1),
      new BMap.Point(lng2, lat2)
    ], Object.assign({
      strokeColor: '#2196F3',
      strokeWeight: 5,
      strokeOpacity: 0.85,
      strokeStyle: 'dashed'
    }, opts || {}));
    map.addOverlay(line);
    return line;
  }

  /**
   * 设置地图中心 (WGS-84)
   */
  function setCenter(map, wgsLng, wgsLat, zoom) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    map.centerAndZoom(new BMap.Point(bdLng, bdLat), zoom || map.getZoom());
  }

  /**
   * 把 GPS 当前位置 (WGS-84) 设为地图中心
   */
  function panTo(map, wgsLng, wgsLat) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    map.panTo(new BMap.Point(bdLng, bdLat));
  }

  /**
   * 在两点间画折线 (覆盖旧)
   */
  function addLineBetween(map, wgs1, wgs2, opts) {
    return addPolyline(map, wgs1, wgs2, opts);
  }

  /**
   * 添加信息窗
   */
  function addInfoWindow(map, wgsLng, wgsLat, content) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    const info = new BMap.InfoWindow(content, { width: 200, height: 80 });
    // 注意: InfoWindow 不直接添加到 map, 而是通过 marker.openInfoWindow 调用
    return { info, point: new BMap.Point(bdLng, bdLat) };
  }

  /**
   * 移除所有覆盖物 (除 tile 外)
   */
  function clearOverlays(map) {
    map.clearOverlays();
  }

  global.BaiduMap = {
    initBaiduMap,
    addDivMarker,
    addPolyline,
    setCenter,
    panTo,
    clearOverlays,
    DivOverlay
  };
})(window);
