// ========================================
// 떠리몰 - 관리자 패널
// ========================================

(function () {
  'use strict';

  const STORAGE_KEY = 'tteori_data';
  const SETTINGS_KEY = 'tteori_settings';
  const BAR_COLORS = ['blue', 'green', 'purple', 'orange', 'red', 'teal'];

  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return { auctions: [], transactions: [] };
  }

  function saveData(d) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  }

  function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
    return {};
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  let data = loadData();

  function formatPrice(n) {
    return Number(n).toLocaleString('ko-KR') + '원';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function isActive(a) { return new Date(a.endTime) > new Date(); }

  function getHighestBid(a) {
    if (!a.bids || a.bids.length === 0) return null;
    return a.bids.reduce((m, b) => b.amount > m.amount ? b : m, a.bids[0]);
  }

  function discountRate(orig, fin) {
    if (!orig || orig === 0) return 0;
    return Math.round((1 - fin / orig) * 100);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function showToast(msg, isError) {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.innerHTML = '<span class="material-icons-round">' + (isError ? 'error_outline' : 'check_circle') + '</span><span>' + escapeHtml(msg) + '</span>';
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // 경매 종료 처리
  function processEnded() {
    let changed = false;
    data.auctions.forEach(a => {
      if (a.settled || isActive(a)) return;
      a.settled = true;
      changed = true;
      const h = getHighestBid(a);
      if (h && h.amount >= a.minPrice) {
        a.winner = h.bidder;
        a.winPrice = h.amount;
        data.transactions.push({
          id: Date.now().toString(36),
          auctionId: a.id,
          productName: a.productName,
          supplierName: a.supplierName,
          quantity: a.quantity,
          originalPrice: a.originalPrice,
          winPrice: h.amount,
          winner: h.bidder,
          completedAt: new Date().toISOString()
        });
      }
    });
    if (changed) saveData(data);
  }

  // --- 네비게이션 ---
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view');

  function switchView(id) {
    navItems.forEach(n => n.classList.remove('active'));
    const target = document.querySelector('[data-view="' + id + '"]');
    if (target) target.classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    refresh(id);
    closeMobile();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  function refresh(id) {
    processEnded();
    data = loadData();
    if (id === 'admin-dashboard') renderDashboard();
    else if (id === 'admin-auctions') renderAdminAuctions();
    else if (id === 'admin-suppliers') renderSuppliers();
    else if (id === 'admin-transactions') renderTransactionAnalysis();
    else if (id === 'admin-settings') renderSettings();
  }

  // 모바일 메뉴
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  document.getElementById('menu-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('hidden');
  });
  overlay.addEventListener('click', closeMobile);
  function closeMobile() {
    sidebar.classList.remove('open');
    overlay.classList.add('hidden');
  }

  // ===== 통계 대시보드 =====
  function renderDashboard() {
    const active = data.auctions.filter(a => isActive(a));
    const settled = data.auctions.filter(a => a.settled);
    const won = settled.filter(a => a.winner);
    const failed = settled.filter(a => !a.winner);
    const totalAmt = data.transactions.reduce((s, t) => s + t.winPrice * t.quantity, 0);

    document.getElementById('ds-total-auctions').textContent = data.auctions.length;
    document.getElementById('ds-active-auctions').textContent = active.length;
    document.getElementById('ds-won-auctions').textContent = won.length;
    document.getElementById('ds-failed-auctions').textContent = failed.length;
    document.getElementById('ds-total-amount').textContent = formatPrice(totalAmt);

    renderCategoryChart();
    renderDiscountChart();
    renderBidderRanking();
  }

  function renderCategoryChart() {
    const cats = {};
    data.auctions.forEach(a => {
      cats[a.category] = (cats[a.category] || 0) + 1;
    });
    const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const max = entries.length > 0 ? entries[0][1] : 1;

    document.getElementById('category-chart').innerHTML = entries.length === 0
      ? '<div class="empty-state" style="padding:2rem"><p>데이터가 없습니다</p></div>'
      : entries.map((e, i) =>
        '<div class="bar-row">' +
          '<span class="bar-label">' + escapeHtml(e[0]) + '</span>' +
          '<div class="bar-track"><div class="bar-fill ' + BAR_COLORS[i % BAR_COLORS.length] + '" style="width:' + Math.max(e[1] / max * 100, 8) + '%"><span>' + e[1] + '건</span></div></div>' +
          '<span class="bar-value">' + e[1] + '</span>' +
        '</div>'
      ).join('');
  }

  function renderDiscountChart() {
    const ranges = { '0~20%': 0, '21~40%': 0, '41~60%': 0, '61~80%': 0, '81~100%': 0 };
    data.transactions.forEach(t => {
      const r = discountRate(t.originalPrice, t.winPrice);
      if (r <= 20) ranges['0~20%']++;
      else if (r <= 40) ranges['21~40%']++;
      else if (r <= 60) ranges['41~60%']++;
      else if (r <= 80) ranges['61~80%']++;
      else ranges['81~100%']++;
    });
    const entries = Object.entries(ranges);
    const max = Math.max(...entries.map(e => e[1]), 1);

    document.getElementById('discount-chart').innerHTML = data.transactions.length === 0
      ? '<div class="empty-state" style="padding:2rem"><p>거래 데이터가 없습니다</p></div>'
      : entries.map((e, i) =>
        '<div class="bar-row">' +
          '<span class="bar-label">' + e[0] + '</span>' +
          '<div class="bar-track"><div class="bar-fill ' + BAR_COLORS[i % BAR_COLORS.length] + '" style="width:' + Math.max(e[1] / max * 100, 4) + '%"><span>' + e[1] + '건</span></div></div>' +
          '<span class="bar-value">' + e[1] + '</span>' +
        '</div>'
      ).join('');
  }

  function renderBidderRanking() {
    const bidders = {};
    data.auctions.forEach(a => {
      if (!a.bids) return;
      a.bids.forEach(b => {
        if (!bidders[b.bidder]) bidders[b.bidder] = { bids: 0, wins: 0, totalWin: 0 };
        bidders[b.bidder].bids++;
      });
    });
    data.transactions.forEach(t => {
      if (!bidders[t.winner]) bidders[t.winner] = { bids: 0, wins: 0, totalWin: 0 };
      bidders[t.winner].wins++;
      bidders[t.winner].totalWin += t.winPrice * t.quantity;
    });

    const sorted = Object.entries(bidders).sort((a, b) => b[1].bids - a[1].bids).slice(0, 10);
    const tbody = document.getElementById('bidder-ranking');

    if (sorted.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-tertiary)">입찰 데이터가 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = sorted.map((e, i) =>
      '<tr>' +
        '<td><strong>' + (i + 1) + '</strong></td>' +
        '<td>' + escapeHtml(e[0]) + '</td>' +
        '<td class="text-right">' + e[1].bids + '회</td>' +
        '<td class="text-right">' + e[1].wins + '회</td>' +
        '<td class="text-right">' + formatPrice(e[1].totalWin) + '</td>' +
      '</tr>'
    ).join('');
  }

  // ===== 경매 관리 =====
  function getAuctionStatus(a) {
    if (isActive(a)) return 'active';
    if (a.winner) return 'won';
    return 'failed';
  }

  function renderAdminAuctions() {
    const statusFilter = document.getElementById('admin-filter-status').value;
    const catFilter = document.getElementById('admin-filter-category').value;
    const search = document.getElementById('admin-search').value.trim().toLowerCase();

    let filtered = [...data.auctions];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => getAuctionStatus(a) === statusFilter);
    }
    if (catFilter !== 'all') {
      filtered = filtered.filter(a => a.category === catFilter);
    }
    if (search) {
      filtered = filtered.filter(a =>
        a.productName.toLowerCase().includes(search) ||
        a.supplierName.toLowerCase().includes(search)
      );
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('admin-auction-count').textContent = filtered.length + '건';

    const tbody = document.getElementById('admin-auction-tbody');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:3rem;color:var(--text-tertiary)">해당하는 경매가 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(a => {
      const status = getAuctionStatus(a);
      const h = getHighestBid(a);
      const statusHtml = {
        active: '<span class="status-badge status-active">진행중</span>',
        won: '<span class="status-badge status-won">낙찰</span>',
        failed: '<span class="status-badge status-failed">유찰</span>'
      }[status];

      let actions = '';
      if (status === 'active') {
        actions =
          '<button class="action-btn" title="기간 연장" data-action="extend" data-id="' + a.id + '"><span class="material-icons-round">more_time</span></button>' +
          '<button class="action-btn danger" title="강제 종료" data-action="close" data-id="' + a.id + '"><span class="material-icons-round">stop_circle</span></button>';
      }
      actions += '<button class="action-btn danger" title="삭제" data-action="delete" data-id="' + a.id + '"><span class="material-icons-round">delete</span></button>';

      return '<tr>' +
        '<td>' + statusHtml + '</td>' +
        '<td><strong>' + escapeHtml(a.productName) + '</strong></td>' +
        '<td>' + escapeHtml(a.supplierName) + '</td>' +
        '<td>' + escapeHtml(a.category) + '</td>' +
        '<td class="text-right">' + a.quantity.toLocaleString() + '</td>' +
        '<td class="text-right">' + formatPrice(a.originalPrice) + '</td>' +
        '<td class="text-right">' + formatPrice(a.minPrice) + '</td>' +
        '<td class="text-right">' + (h ? formatPrice(h.amount) : '-') + '</td>' +
        '<td class="text-right">' + (a.bids ? a.bids.length : 0) + '</td>' +
        '<td>' + formatDate(a.endTime) + '</td>' +
        '<td><div class="action-group">' + actions + '</div></td>' +
      '</tr>';
    }).join('');

    attachActionButtons();
  }

  document.getElementById('admin-filter-status').addEventListener('change', renderAdminAuctions);
  document.getElementById('admin-filter-category').addEventListener('change', renderAdminAuctions);
  document.getElementById('admin-search').addEventListener('input', renderAdminAuctions);

  // 경매 관리 액션
  const actionModal = document.getElementById('auction-action-modal');
  let pendingAction = null;

  function openActionModal(title, bodyHtml, onConfirm) {
    document.getElementById('modal-action-title').textContent = title;
    document.getElementById('action-modal-body').innerHTML = bodyHtml;
    pendingAction = onConfirm;
    actionModal.classList.remove('hidden');
  }

  function closeActionModal() {
    actionModal.classList.add('hidden');
    pendingAction = null;
  }

  document.getElementById('action-modal-close').addEventListener('click', closeActionModal);
  document.getElementById('action-modal-cancel').addEventListener('click', closeActionModal);
  actionModal.addEventListener('click', e => { if (e.target === actionModal) closeActionModal(); });

  document.getElementById('action-modal-confirm').addEventListener('click', () => {
    if (pendingAction) pendingAction();
    closeActionModal();
  });

  function attachActionButtons() {
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const action = this.dataset.action;
        const id = this.dataset.id;
        const auction = data.auctions.find(a => a.id === id);
        if (!auction) return;

        if (action === 'extend') {
          openActionModal('경매 기간 연장',
            '<div class="modal-info-row"><span class="modal-info-label">상품명</span><span class="modal-info-value">' + escapeHtml(auction.productName) + '</span></div>' +
            '<div class="modal-info-row"><span class="modal-info-label">현재 종료일</span><span class="modal-info-value">' + formatDate(auction.endTime) + '</span></div>' +
            '<div class="form-group" style="margin-top:1rem"><label>연장 시간</label><select id="extend-hours">' +
              '<option value="1">1시간</option><option value="6">6시간</option><option value="24" selected>24시간</option><option value="72">3일</option><option value="168">7일</option>' +
            '</select></div>',
            function () {
              const hours = parseInt(document.getElementById('extend-hours').value);
              auction.endTime = new Date(new Date(auction.endTime).getTime() + hours * 3600000).toISOString();
              saveData(data);
              showToast(hours + '시간 연장되었습니다');
              renderAdminAuctions();
            }
          );
        } else if (action === 'close') {
          openActionModal('경매 강제 종료',
            '<div class="modal-info-row"><span class="modal-info-label">상품명</span><span class="modal-info-value">' + escapeHtml(auction.productName) + '</span></div>' +
            '<div class="modal-info-row"><span class="modal-info-label">현재 최고 입찰가</span><span class="modal-info-value">' + (getHighestBid(auction) ? formatPrice(getHighestBid(auction).amount) : '없음') + '</span></div>' +
            '<p style="margin-top:1rem;font-size:0.88rem;color:var(--text-secondary)">이 경매를 즉시 종료합니다. 최고 입찰가가 최소 희망가 이상이면 낙찰 처리됩니다.</p>',
            function () {
              auction.endTime = new Date(Date.now() - 1000).toISOString();
              saveData(data);
              processEnded();
              data = loadData();
              showToast('경매가 종료되었습니다');
              renderAdminAuctions();
            }
          );
        } else if (action === 'delete') {
          openActionModal('경매 삭제',
            '<div class="modal-info-row"><span class="modal-info-label">상품명</span><span class="modal-info-value">' + escapeHtml(auction.productName) + '</span></div>' +
            '<div class="modal-info-row"><span class="modal-info-label">거래처</span><span class="modal-info-value">' + escapeHtml(auction.supplierName) + '</span></div>' +
            '<p style="margin-top:1rem;font-size:0.88rem;color:var(--primary);font-weight:600">이 경매를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>',
            function () {
              data.auctions = data.auctions.filter(a => a.id !== id);
              data.transactions = data.transactions.filter(t => t.auctionId !== id);
              saveData(data);
              showToast('경매가 삭제되었습니다');
              renderAdminAuctions();
            }
          );
        }
      });
    });
  }

  // ===== 거래처 관리 =====
  function renderSuppliers() {
    const suppliers = {};
    data.auctions.forEach(a => {
      if (!suppliers[a.supplierName]) {
        suppliers[a.supplierName] = { auctions: 0, active: 0, won: 0, totalBids: 0, totalAmount: 0 };
      }
      const s = suppliers[a.supplierName];
      s.auctions++;
      if (isActive(a)) s.active++;
      if (a.winner) s.won++;
      s.totalBids += a.bids ? a.bids.length : 0;
    });
    data.transactions.forEach(t => {
      if (suppliers[t.supplierName]) {
        suppliers[t.supplierName].totalAmount += t.winPrice * t.quantity;
      }
    });

    const container = document.getElementById('supplier-list');
    const entries = Object.entries(suppliers).sort((a, b) => b[1].auctions - a[1].auctions);

    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-round">store</span><p>등록된 거래처가 없습니다</p></div>';
      return;
    }

    const avatarColors = ['#E53935', '#1E88E5', '#43A047', '#7E57C2', '#FB8C00', '#00897B'];
    container.innerHTML = '<div class="card-grid">' + entries.map((e, i) => {
      const name = e[0];
      const s = e[1];
      const color = avatarColors[i % avatarColors.length];
      return '<div class="supplier-card">' +
        '<div class="supplier-header">' +
          '<div class="supplier-avatar" style="background:' + color + '">' + escapeHtml(name.charAt(0)) + '</div>' +
          '<div><div class="supplier-name">' + escapeHtml(name) + '</div>' +
          '<div class="supplier-sub">경매 ' + s.auctions + '건 등록</div></div>' +
        '</div>' +
        '<div class="supplier-stats">' +
          '<div class="supplier-stat"><span class="supplier-stat-value">' + s.active + '</span><span class="supplier-stat-label">진행중</span></div>' +
          '<div class="supplier-stat"><span class="supplier-stat-value">' + s.won + '</span><span class="supplier-stat-label">낙찰</span></div>' +
          '<div class="supplier-stat"><span class="supplier-stat-value">' + formatPrice(s.totalAmount) + '</span><span class="supplier-stat-label">총 거래액</span></div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // ===== 거래 분석 =====
  function renderTransactionAnalysis() {
    const txs = data.transactions;
    const settled = data.auctions.filter(a => a.settled);
    const successRate = settled.length > 0 ? Math.round(txs.length / settled.length * 100) : 0;

    if (txs.length > 0) {
      const avgDiscount = Math.round(txs.reduce((s, t) => s + discountRate(t.originalPrice, t.winPrice), 0) / txs.length);
      const totalSaved = txs.reduce((s, t) => s + (t.originalPrice - t.winPrice) * t.quantity, 0);
      const avgAmount = Math.round(txs.reduce((s, t) => s + t.winPrice, 0) / txs.length);

      document.getElementById('tx-avg-discount').textContent = avgDiscount + '%';
      document.getElementById('tx-total-saved').textContent = formatPrice(totalSaved);
      document.getElementById('tx-avg-amount').textContent = formatPrice(avgAmount);
    } else {
      document.getElementById('tx-avg-discount').textContent = '0%';
      document.getElementById('tx-total-saved').textContent = '0원';
      document.getElementById('tx-avg-amount').textContent = '0원';
    }
    document.getElementById('tx-success-rate').textContent = successRate + '%';

    // 카테고리별 분석
    const cats = {};
    txs.forEach(t => {
      const auction = data.auctions.find(a => a.id === t.auctionId);
      const cat = auction ? auction.category : '기타';
      if (!cats[cat]) cats[cat] = { count: 0, total: 0, discountSum: 0, quantity: 0 };
      cats[cat].count++;
      cats[cat].total += t.winPrice * t.quantity;
      cats[cat].discountSum += discountRate(t.originalPrice, t.winPrice);
      cats[cat].quantity += t.quantity;
    });

    const catTbody = document.getElementById('tx-category-tbody');
    const catEntries = Object.entries(cats).sort((a, b) => b[1].total - a[1].total);
    if (catEntries.length === 0) {
      catTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-tertiary)">거래 데이터가 없습니다</td></tr>';
    } else {
      catTbody.innerHTML = catEntries.map(e =>
        '<tr>' +
          '<td><strong>' + escapeHtml(e[0]) + '</strong></td>' +
          '<td class="text-right">' + e[1].count + '건</td>' +
          '<td class="text-right">' + formatPrice(e[1].total) + '</td>' +
          '<td class="text-right discount-rate">' + Math.round(e[1].discountSum / e[1].count) + '%</td>' +
          '<td class="text-right">' + e[1].quantity.toLocaleString() + '개</td>' +
        '</tr>'
      ).join('');
    }

    // 전체 거래 내역
    const detailTbody = document.getElementById('tx-detail-tbody');
    if (txs.length === 0) {
      detailTbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-tertiary)">거래 내역이 없습니다</td></tr>';
    } else {
      const sorted = [...txs].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
      detailTbody.innerHTML = sorted.map(t =>
        '<tr>' +
          '<td>' + formatDate(t.completedAt) + '</td>' +
          '<td><strong>' + escapeHtml(t.productName) + '</strong></td>' +
          '<td>' + escapeHtml(t.supplierName) + '</td>' +
          '<td>' + escapeHtml(t.winner) + '</td>' +
          '<td class="text-right">' + t.quantity.toLocaleString() + '</td>' +
          '<td class="text-right" style="text-decoration:line-through;color:var(--text-tertiary)">' + formatPrice(t.originalPrice) + '</td>' +
          '<td class="text-right"><strong>' + formatPrice(t.winPrice) + '</strong></td>' +
          '<td class="text-right discount-rate">' + discountRate(t.originalPrice, t.winPrice) + '%</td>' +
          '<td class="text-right"><strong>' + formatPrice(t.winPrice * t.quantity) + '</strong></td>' +
        '</tr>'
      ).join('');
    }
  }

  // ===== 시스템 설정 =====
  function renderSettings() {
    const s = loadSettings();
    if (s.defaultDuration) document.getElementById('setting-default-duration').value = s.defaultDuration;
    if (s.minIncrement) document.getElementById('setting-min-increment').value = s.minIncrement;
    if (s.maxDuration) document.getElementById('setting-max-duration').value = s.maxDuration;
  }

  // 설정 자동 저장
  ['setting-default-duration', 'setting-min-increment', 'setting-max-duration'].forEach(id => {
    document.getElementById(id).addEventListener('change', function () {
      const s = loadSettings();
      if (id === 'setting-default-duration') s.defaultDuration = this.value;
      else if (id === 'setting-min-increment') s.minIncrement = this.value;
      else if (id === 'setting-max-duration') s.maxDuration = this.value;
      saveSettings(s);
      showToast('설정이 저장되었습니다');
    });
  });

  // 데이터 내보내기
  document.getElementById('export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tteori_data_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('데이터를 내보냈습니다');
  });

  // 데이터 가져오기
  document.getElementById('import-data-btn').addEventListener('click', () => {
    document.getElementById('import-data').click();
  });

  document.getElementById('import-data').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (imported.auctions && imported.transactions) {
          data = imported;
          saveData(data);
          showToast('데이터를 가져왔습니다');
          switchView('admin-dashboard');
        } else {
          showToast('올바른 데이터 형식이 아닙니다', true);
        }
      } catch (err) {
        showToast('파일을 읽을 수 없습니다', true);
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  // 전체 초기화
  document.getElementById('reset-all-data').addEventListener('click', () => {
    if (!confirm('정말 모든 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    data = { auctions: [], transactions: [] };
    showToast('모든 데이터가 초기화되었습니다');
    switchView('admin-dashboard');
  });

  // 타이머
  setInterval(() => {
    const active = document.querySelector('.nav-item.active');
    if (active) refresh(active.dataset.view);
  }, 30000);

  // 초기화
  renderDashboard();
})();
