/**
 * 百度地图 BMap JS API 集成
 *
 * 用法:
 *   1. HTML 引入 <script src="https://api.map.baidu.com/api?v=3.0&ak=..."></script>
 *   2. 用 BaiduMap.ready(() => { ... }) 包裹所有 BMap 调用
 *
 * 坐标系约定:
 *   - 数据存储 WGS-84
 *   - 渲染 BD-09 (BMap 默认)
 *   - 通过 Wgs84ToBd09 转换
 */
(function (global) {
  'use strict';

  /**
   * 等待 BMap 就绪 (百度 JS API 加载是异步的, getscript 注入 <script>)
   * @param {function} callback
   */
  function ready(callback) {
    // 已经在
    if (typeof BMap !== 'undefined' && BMap.Map) {
      // Safari 兼容性: 用 setTimeout 推到下一个 tick, 避免初始化时序问题
      setTimeout(() => tryCallback(callback), 0);
      return;
    }
    // 轮询等待
    let attempts = 0;
    const maxAttempts = 100;  // 10s
    const timer = setInterval(() => {
      attempts++;
      if (typeof BMap !== 'undefined' && BMap.Map) {
        clearInterval(timer);
        tryCallback(callback);
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        console.error('[BaiduMap] 等待 BMap 加载超时 (10s)');
        if (global.BaiduMap._onError) global.BaiduMap._onError('百度地图 JS API 加载超时, 请检查网络/AK. 但表单功能仍可用');
      }
    }, 100);
  }

  // 用 try/catch 包裹, 防止 BMap 内部抛错拖死调用方
  function tryCallback(cb) {
    try {
      cb();
    } catch (e) {
      console.error('[BaiduMap] ready 回调异常:', e);
      if (global.BaiduMap._onError) global.BaiduMap._onError('百度地图初始化失败: ' + e.message);
    }
  }

  function isReady() {
    return typeof BMap !== 'undefined' && !!BMap.Map;
  }

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

  function addDivMarker(map, wgsLng, wgsLat, html, anchor) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    const point = new BMap.Point(bdLng, bdLat);
    const overlay = new DivOverlay(point, html, anchor);
    map.addOverlay(overlay);
    return overlay;
  }

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

  function setCenter(map, wgsLng, wgsLat, zoom) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    map.centerAndZoom(new BMap.Point(bdLng, bdLat), zoom || map.getZoom());
  }

  function panTo(map, wgsLng, wgsLat) {
    const [bdLng, bdLat] = Wgs84ToBd09.wgs84ToBd09(wgsLng, wgsLat);
    map.panTo(new BMap.Point(bdLng, bdLat));
  }

  function clearOverlays(map) {
    map.clearOverlays();
  }

  global.BaiduMap = {
    ready,
    initBaiduMap,
    addDivMarker,
    addPolyline,
    setCenter,
    panTo,
    clearOverlays,
    DivOverlay,
    _onError: null
  };
})(window);
