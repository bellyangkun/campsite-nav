// ===== P0 实用功能 (3-5) =====
// P0-3 一键呼叫 / P0-5 AI 客服 (P0-4 紧急疏散 v0.6.4 移除)
// 依赖: window.CampData (data.js)
(function () {
  'use strict';

  const HOTEL_PHONE = '021-59978686';  // 鹿营乡悦华亭度假村预约热线
  // 紧急疏散已移除 (v0.6.4)

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

  // ===== P0-5 AI 客服 (调 minimax API) =====
  // 知识库: 度假村 FAQ, 从后端 /api/faqs 动态加载
  let FAQ_CACHE = null;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  async function loadFaqs(force) {
    if (!force && FAQ_CACHE) return FAQ_CACHE;
    try {
      const res = await fetch(window.CAMPSITE_API_BASE + '/faqs');
      const json = await res.json();
      FAQ_CACHE = (json && Array.isArray(json.data)) ? json.data : [];
    } catch (e) {
      console.error('[FAQ] 加载失败', e);
      if (!FAQ_CACHE) FAQ_CACHE = [];
    }
    return FAQ_CACHE;
  }

  function setupAI() {
    loadFaqs(); // 预加载
    const btn = document.getElementById('toolAiBtn');
    if (!btn) return;
    btn.addEventListener('click', () => showAIChat());
  }

  async function showAIChat() {
    if (document.getElementById('aiChatModal')) return;
    const faqs = await loadFaqs(true);
    const visibleFaqs = faqs.map((f, i) => ({ f, i })).filter(({ f }) => f.show !== false);
    const faqList = visibleFaqs.length > 0
      ? visibleFaqs.map(({ f, i }) => `<button class="ai-faq-btn" data-idx="${i}">${escapeHtml(f.q)}</button>`).join('')
      : '<span style="color:#999;font-size:12px;">暂无常见问题</span>';
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

  async function askFAQ(idx, body, input) {
    const faqs = await loadFaqs();
    const f = faqs[idx];
    if (!f) return;
    appendMsg(body, 'user', f.q);
    const loading = appendMsg(body, 'bot', '思考中...');
    const prompt = `用户问题: ${f.q}`;
    fetch(window.CAMPSITE_API_BASE + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, faqs })
    })
    .then(r => r.json())
    .then(j => {
      loading.textContent = j.answer || (j.message || f.a);
    })
    .catch(e => {
      loading.textContent = f.a;
      console.error('[AI]', e);
    });
  }

  async function askLLM(text, body, input) {
    if (!text) return;
    appendMsg(body, 'user', text);
    input.value = '';
    const loading = appendMsg(body, 'bot', '思考中...');
    // 直接发用户原文 + FAQ 列表给后端关键词匹配
    const prompt = `用户问题: ${text}`;

    // 调后端 /api/ai (后端会自己读 FAQ, 前端也传一份保持兼容)
    const faqs = await loadFaqs();
    fetch(window.CAMPSITE_API_BASE + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, faqs })
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
    setupAI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
