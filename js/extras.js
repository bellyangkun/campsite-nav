// ===== P0 实用功能 (3-4-5) =====
// P0-3 一键呼叫 / P0-4 紧急疏散 / P0-5 AI 客服
// 依赖: window.CampData (data.js), window.BaiduMap (baidu-map.js)
(function () {
  'use strict';

  const HOTEL_PHONE = '021-59978686';  // 鹿营乡悦华亭度假村预约热线
  const EVAC_GATHER = [
    { id: 'eg1', name: '正门集合点', lat: 31.481502, lng: 121.28726, note: '主入口停车场旁' },
    { id: 'eg2', name: '西门集合点', lat: 31.479885, lng: 121.289259, note: '西门停车场' },
    { id: 'eg3', name: '中央草坪集合点', lat: 31.481916, lng: 121.287555, note: '中央草坪' }
  ];

  // ===== P0-3 一键呼叫 =====
  function setupCall() {
    const btn = document.getElementById('toolCallBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // 微信内会拦截 tel: 用模态确认, 其他环境直接拨号
      const ua = navigator.userAgent.toLowerCase();
      const isWechat = /micromessenger/.test(ua);
      if (isWechat) {
        showCallModal();
      } else {
        window.location.href = 'tel:' + HOTEL_PHONE;
      }
    });
  }

  function showCallModal() {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card">
        <h3>📞 呼叫前台</h3>
        <p>鹿营乡悦华亭度假村 预约热线</p>
        <div class="modal-phone">${HOTEL_PHONE}</div>
        <p class="modal-hint">微信内无法直接拨号, 请复制号码后到手机键盘拨打:</p>
        <div class="modal-actions">
          <button class="btn-copy" id="copyPhoneBtn">📋 复制号码</button>
          <button class="btn-close" id="closeCallBtn">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#copyPhoneBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(HOTEL_PHONE).then(() => {
        m.querySelector('#copyPhoneBtn').textContent = '✓ 已复制';
        setTimeout(() => m.remove(), 1500);
      }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = HOTEL_PHONE;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        m.querySelector('#copyPhoneBtn').textContent = '✓ 已复制';
        setTimeout(() => m.remove(), 1500);
      });
    });
    m.querySelector('#closeCallBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  // ===== P0-4 紧急疏散 =====
  let evacMode = false;
  let evacOverlays = [];

  function setupEvac() {
    const btn = document.getElementById('toolEvacBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (evacMode) {
        clearEvac();
        return;
      }
      showEvac();
    });
  }

  function showEvac() {
    evacMode = true;
    const map = window.__campsiteMap;
    if (!map) {
      alert('地图尚未加载, 请稍候再试');
      return;
    }
    // 切换按钮文案
    const btn = document.getElementById('toolEvacBtn');
    btn.innerHTML = '<span class="tool-icon">✕</span><span class="tool-label">关闭疏散</span>';

    // 1. 画 3 个红色集合点
    EVAC_GATHER.forEach(g => {
      const html = `<div class="evac-marker">
        <div class="evac-icon">🆘</div>
        <div class="evac-label">${g.name}</div>
      </div>`;
      const overlay = BaiduMap.addDivMarker(map, g.lng, g.lat, html, { x: 16, y: 16 });
      evacOverlays.push(overlay);
    });

    // 2. 显示疏散说明模态
    showEvacModal();

    // 3. fitBounds 让所有点都可见
    const allPts = EVAC_GATHER.map(g => new BMap.Point(g.lng, g.lat));
    try {
      const viewport = map.getViewport(allPts);
      map.setViewport(viewport, { margins: [80, 60, 200, 60] });
    } catch (e) {}
  }

  function showEvacModal() {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card evac-card">
        <h3 style="color:#C62828">🚨 紧急疏散</h3>
        <p>如遇紧急情况 (火灾/医疗), 请:</p>
        <ol class="evac-steps">
          <li>保持冷静, 听从工作人员指挥</li>
          <li>沿主路向 3 个红色集合点撤离</li>
          <li>不要返回取物品, 优先保证人身安全</li>
          <li>到达集合点后清点人数</li>
        </ol>
        <p class="evac-phone">紧急联系: <strong>${HOTEL_PHONE}</strong></p>
        <div class="modal-actions">
          <button class="btn-call-emerg" id="callEmergencyBtn">📞 立即呼叫</button>
          <button class="btn-close" id="closeEvacBtn">我已了解</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#callEmergencyBtn').addEventListener('click', () => {
      window.location.href = 'tel:' + HOTEL_PHONE;
    });
    m.querySelector('#closeEvacBtn').addEventListener('click', () => m.remove());
  }

  function clearEvac() {
    evacMode = false;
    const btn = document.getElementById('toolEvacBtn');
    btn.innerHTML = '<span class="tool-icon">🚨</span><span class="tool-label">紧急疏散</span>';
    evacOverlays.forEach(o => {
      try { o._div.remove(); } catch (e) {}
    });
    evacOverlays = [];
  }

  // ===== P0-5 AI 客服 (调 minimax API) =====
  // 知识库: 度假村 FAQ 写死在前端, 通过后端代理调 LLM
  const FAQ = [
    { q: '营业时间', a: '度假村全年开放, 9:00-21:00。酒店 24 小时。' },
    { q: '地址', a: '上海市青浦区霜竹公路 518 号 (乡悦华亭度假村), 近联康路。' },
    { q: '预约', a: '预约电话 021-59978686, 5 月 1 日起开业。' },
    { q: '皮划艇', a: '湖边露营区提供, 单人 ¥80/小时, 双人 ¥150/小时, 需提前预约。' },
    { q: 'CS 团建', a: '丛林 CS 在东北角, 50 人团建套餐 ¥200/人起, 含教练 + 装备。' },
    { q: '宠物', a: '宠物可在中央草坪、东侧环路活动, 餐厅/酒店禁止宠物进入。' },
    { q: '停车', a: '正门停车场 100 个车位 (免费), VIP 停车场 30 个, 西门停车场 50 个。' },
    { q: '餐饮', a: '麓苑中餐厅 (本帮菜, 11:00-21:00) + 一尺花园咖啡馆 (9:00-19:00) + 如院茶馆 (10:00-22:00)。' },
    { q: '酒店', a: '东方新麓乡悦华亭度假酒店, 房型 ¥688-¥2880, 订房 021-59978686。' },
    { q: '儿童乐园', a: 'Neverland 儿童乐园 5700㎡, 9:00-18:00, 1.2m 以下儿童免门票。' }
  ];

  function setupAI() {
    const btn = document.getElementById('toolAiBtn');
    if (!btn) return;
    btn.addEventListener('click', () => showAIChat());
  }

  function showAIChat() {
    if (document.getElementById('aiChatModal')) return;
    const faqList = FAQ.map((f, i) => `<button class="ai-faq-btn" data-idx="${i}">${f.q}</button>`).join('');
    const m = document.createElement('div');
    m.id = 'aiChatModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card ai-card">
        <div class="ai-header">
          <span>🤖 鹿营 AI 客服</span>
          <button class="ai-close" id="aiCloseBtn">✕</button>
        </div>
        <div class="ai-body" id="aiBody">
          <div class="ai-msg bot">你好, 我是鹿营小助手。可以问营业时间/活动/餐饮/酒店, 也可以点下方常见问题。</div>
        </div>
        <div class="ai-faq-row">${faqList}</div>
        <div class="ai-input-row">
          <input type="text" id="aiInput" placeholder="输入你的问题..." maxlength="200" />
          <button id="aiSendBtn">发送</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    const body = m.querySelector('#aiBody');
    const input = m.querySelector('#aiInput');
    const send = m.querySelector('#aiSendBtn');

    m.querySelector('#aiCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });

    m.querySelectorAll('.ai-faq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        askFAQ(idx, body, input);
      });
    });

    send.addEventListener('click', () => askLLM(input.value.trim(), body, input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') askLLM(input.value.trim(), body, input);
    });

    setTimeout(() => input.focus(), 200);
  }

  function askFAQ(idx, body, input) {
    const f = FAQ[idx];
    appendMsg(body, 'user', f.q);
    setTimeout(() => appendMsg(body, 'bot', f.a), 400);
  }

  function askLLM(text, body, input) {
    if (!text) return;
    appendMsg(body, 'user', text);
    input.value = '';
    const loading = appendMsg(body, 'bot', '思考中...');
    // 直接发用户原文 + FAQ 列表给后端关键词匹配
    const prompt = `用户问题: ${text}`;

    // 调后端 /api/ai (本地 FAQ 关键词匹配, 腾讯云无 mavis CLI)
    fetch(window.CAMPSITE_API_BASE + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, faqs: FAQ })
    })
    .then(r => r.json())
    .then(j => {
      loading.textContent = j.answer || (j.message || '服务暂时不可用, 请联系前台 021-59978686');
    })
    .catch(e => {
      loading.textContent = '网络错误, 请联系前台 021-59978686';
      console.error('[AI]', e);
    });
  }

  function appendMsg(body, role, text) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  // ===== 启动 =====
  function init() {
    setupCall();
    setupEvac();
    setupAI();
    // 暴露 map 给疏散用
    document.addEventListener('campsite-map-ready', (e) => {
      window.__campsiteMap = e.detail.map;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
