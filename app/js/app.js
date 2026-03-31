// ========================================
// 떠리몰 - 체화재고 경매 플랫폼
// ========================================

(function () {
  'use strict';

  // --- 데이터 저장소 ---
  const STORAGE_KEY = 'tteori_data';

  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return { auctions: [], transactions: [] };
  }

  function saveData(d) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  }

  let data = loadData();

  // --- 유틸리티 ---
  function formatPrice(num) {
    return Number(num).toLocaleString('ko-KR') + '원';
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeRemaining(endTime) {
    const diff = new Date(endTime) - new Date();
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return days + '일 ' + hours + '시간';
    if (hours > 0) return hours + '시간 ' + minutes + '분';
    return minutes + '분';
  }

  function isActive(auction) {
    return new Date(auction.endTime) > new Date();
  }

  function getHighestBid(auction) {
    if (!auction.bids || auction.bids.length === 0) return null;
    return auction.bids.reduce((max, b) => b.amount > max.amount ? b : max, auction.bids[0]);
  }

  function discountRate(original, final) {
    if (!original || original === 0) return '0%';
    return Math.round((1 - final / original) * 100) + '%';
  }

  // --- 토스트 알림 ---
  function showToast(message, isError) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.innerHTML =
      '<span class="material-icons-round">' + (isError ? 'error_outline' : 'check_circle') + '</span>' +
      '<span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // --- 경매 종료 처리 ---
  function processEndedAuctions() {
    let changed = false;
    data.auctions.forEach(auction => {
      if (auction.settled || isActive(auction)) return;
      auction.settled = true;
      changed = true;

      const highest = getHighestBid(auction);
      if (highest && highest.amount >= auction.minPrice) {
        auction.winner = highest.bidder;
        auction.winPrice = highest.amount;
        data.transactions.push({
          id: generateId(),
          auctionId: auction.id,
          productName: auction.productName,
          supplierName: auction.supplierName,
          quantity: auction.quantity,
          originalPrice: auction.originalPrice,
          winPrice: highest.amount,
          winner: highest.bidder,
          completedAt: new Date().toISOString()
        });
      }
    });
    if (changed) saveData(data);
  }

  // --- 네비게이션 ---
  const navItems = document.querySelectorAll('.nav-item:not(.nav-item-danger)');
  const views = document.querySelectorAll('.view');

  function switchView(viewId) {
    navItems.forEach(n => n.classList.remove('active'));
    document.querySelector('[data-view="' + viewId + '"]').classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    refreshView(viewId);
    closeMobileMenu();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  // 전체보기 링크
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.goto));
  });

  function refreshView(viewId) {
    processEndedAuctions();
    if (viewId === 'dashboard') renderDashboard();
    else if (viewId === 'auctions') renderAuctions();
    else if (viewId === 'transactions') renderTransactions();
  }

  // --- 모바일 메뉴 ---
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const menuToggle = document.getElementById('menu-toggle');

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('hidden');
  });

  overlay.addEventListener('click', closeMobileMenu);

  function closeMobileMenu() {
    sidebar.classList.remove('open');
    overlay.classList.add('hidden');
  }

  // --- 대시보드 ---
  function renderDashboard() {
    const activeCount = data.auctions.filter(a => isActive(a)).length;
    const totalAmount = data.transactions.reduce((sum, t) => sum + t.winPrice * t.quantity, 0);

    document.getElementById('stat-inventory').textContent = data.auctions.length;
    document.getElementById('stat-active').textContent = activeCount;
    document.getElementById('stat-completed').textContent = data.transactions.length;
    document.getElementById('stat-total').textContent = formatPrice(totalAmount);

    const container = document.getElementById('recent-auctions');
    const recent = [...data.auctions]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);

    if (recent.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<span class="material-icons-round">inventory</span>' +
        '<p>등록된 경매가 없습니다</p>' +
        '<p class="sub">재고 등록 탭에서 첫 경매를 시작해보세요</p>' +
        '</div>';
      return;
    }
    container.innerHTML = recent.map(renderAuctionCard).join('');
    attachBidButtons();
  }

  // --- 경매 카드 ---
  function renderAuctionCard(auction) {
    const active = isActive(auction);
    const highest = getHighestBid(auction);
    const bidCount = auction.bids ? auction.bids.length : 0;
    const remaining = timeRemaining(auction.endTime);

    let cardClass = 'auction-card';
    let badge = '';
    if (active) {
      badge = '<span class="badge badge-active">진행중</span>';
    } else if (auction.winner) {
      cardClass += ' won';
      badge = '<span class="badge badge-won">낙찰</span>';
    } else {
      cardClass += ' ended';
      badge = '<span class="badge badge-ended">유찰</span>';
    }

    let bidHistoryHtml = '';
    if (auction.bids && auction.bids.length > 0) {
      const recentBids = [...auction.bids].sort((a, b) => b.amount - a.amount).slice(0, 3);
      bidHistoryHtml =
        '<div class="bid-history"><div class="bid-history-title">입찰 현황</div>' +
        recentBids.map((b, i) =>
          '<div class="bid-entry' + (i === 0 ? ' winning' : '') + '">' +
          '<span>' + escapeHtml(b.bidder) + '</span>' +
          '<span>' + formatPrice(b.amount) + '</span></div>'
        ).join('') + '</div>';
    }

    return '<div class="' + cardClass + '">' +
      '<div class="card-top-bar"></div>' +
      '<div class="card-body">' +
        '<div class="card-header">' +
          '<span class="card-title">' + escapeHtml(auction.productName) + '</span>' +
          badge +
        '</div>' +
        '<div class="card-meta">' +
          '<span class="meta-item"><span class="material-icons-round">business</span>' + escapeHtml(auction.supplierName) + '</span>' +
          '<span class="meta-divider"></span>' +
          '<span class="meta-item"><span class="material-icons-round">category</span>' + escapeHtml(auction.category) + '</span>' +
          '<span class="meta-divider"></span>' +
          '<span class="meta-item"><span class="material-icons-round">inventory_2</span>' + auction.quantity + '개</span>' +
        '</div>' +
        (auction.reason ? '<span class="card-reason"><span class="material-icons-round" style="font-size:12px">label</span>' + escapeHtml(auction.reason) + '</span>' : '') +
        (auction.description ? '<div class="card-desc">' + escapeHtml(auction.description) + '</div>' : '') +
        '<div class="price-grid">' +
          '<div class="price-item"><span class="price-label">정상가</span><span class="price-value original">' + formatPrice(auction.originalPrice) + '</span></div>' +
          '<div class="price-item"><span class="price-label">최소 희망가</span><span class="price-value">' + formatPrice(auction.minPrice) + '</span></div>' +
          '<div class="price-item"><span class="price-label">현재 최고가</span><span class="price-value current">' + (highest ? formatPrice(highest.amount) : '-') + '</span></div>' +
        '</div>' +
        bidHistoryHtml +
        '<div class="card-footer">' +
          '<div class="bid-count"><span class="material-icons-round">people</span>입찰 ' + bidCount + '건</div>' +
          (active && remaining
            ? '<div class="timer"><span class="material-icons-round">timer</span>' + remaining + ' 남음</div>'
            : '') +
          (auction.winner
            ? '<div class="winner-info"><span class="material-icons-round">emoji_events</span>' + escapeHtml(auction.winner) + ' / ' + formatPrice(auction.winPrice) + '</div>'
            : '') +
          (active
            ? '<button class="btn btn-primary btn-sm bid-btn" data-id="' + auction.id + '"><span class="material-icons-round" style="font-size:16px">gavel</span>입찰</button>'
            : '') +
        '</div>' +
      '</div></div>';
  }

  // --- 경매장 ---
  function renderAuctions() {
    const cat = document.getElementById('filter-category').value;
    const status = document.getElementById('filter-status').value;

    let filtered = [...data.auctions];
    if (cat !== 'all') filtered = filtered.filter(a => a.category === cat);
    if (status === 'active') filtered = filtered.filter(a => isActive(a));
    else if (status === 'ended') filtered = filtered.filter(a => !isActive(a));

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    document.getElementById('filter-result').textContent = filtered.length + '건';

    const container = document.getElementById('auction-list');
    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<span class="material-icons-round">search_off</span>' +
        '<p>해당하는 경매가 없습니다</p>' +
        '<p class="sub">필터를 변경하거나 새 경매를 등록해보세요</p>' +
        '</div>';
      return;
    }
    container.innerHTML = filtered.map(renderAuctionCard).join('');
    attachBidButtons();
  }

  document.getElementById('filter-category').addEventListener('change', renderAuctions);
  document.getElementById('filter-status').addEventListener('change', renderAuctions);

  // --- 거래 내역 ---
  function renderTransactions() {
    const tbody = document.getElementById('transaction-tbody');
    if (data.transactions.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:3rem">' +
        '<div class="empty-state" style="padding:1rem">' +
        '<span class="material-icons-round">receipt_long</span>' +
        '<p>거래 내역이 없습니다</p>' +
        '<p class="sub">경매가 낙찰되면 여기에 표시됩니다</p>' +
        '</div></td></tr>';
      return;
    }

    const sorted = [...data.transactions].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    tbody.innerHTML = sorted.map(t => {
      const d = new Date(t.completedAt);
      const dateStr = d.getFullYear() + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0');
      return '<tr>' +
        '<td>' + dateStr + '</td>' +
        '<td><strong>' + escapeHtml(t.productName) + '</strong></td>' +
        '<td>' + escapeHtml(t.supplierName) + '</td>' +
        '<td class="text-right">' + t.quantity.toLocaleString() + '</td>' +
        '<td class="text-right" style="color:var(--text-tertiary);text-decoration:line-through">' + formatPrice(t.originalPrice) + '</td>' +
        '<td class="text-right"><strong>' + formatPrice(t.winPrice) + '</strong></td>' +
        '<td class="text-right discount-rate">' + discountRate(t.originalPrice, t.winPrice) + '</td>' +
        '<td>' + escapeHtml(t.winner) + '</td>' +
      '</tr>';
    }).join('');
  }

  // --- 재고 등록 ---
  const originalPriceInput = document.getElementById('original-price');
  const minPriceInput = document.getElementById('min-price');
  const pricePreview = document.getElementById('price-preview');
  const previewRate = document.getElementById('preview-rate');

  function updatePricePreview() {
    const orig = parseInt(originalPriceInput.value);
    const min = parseInt(minPriceInput.value);
    if (orig > 0 && min > 0 && min < orig) {
      pricePreview.classList.remove('hidden');
      previewRate.textContent = discountRate(orig, min);
    } else {
      pricePreview.classList.add('hidden');
    }
  }

  originalPriceInput.addEventListener('input', updatePricePreview);
  minPriceInput.addEventListener('input', updatePricePreview);

  document.getElementById('register-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const durationHours = parseInt(document.getElementById('auction-duration').value);
    const endTime = new Date(Date.now() + durationHours * 3600000).toISOString();

    const auction = {
      id: generateId(),
      supplierName: document.getElementById('supplier-name').value.trim(),
      productName: document.getElementById('product-name').value.trim(),
      category: document.getElementById('category').value,
      quantity: parseInt(document.getElementById('quantity').value),
      originalPrice: parseInt(document.getElementById('original-price').value),
      minPrice: parseInt(document.getElementById('min-price').value),
      description: document.getElementById('description').value.trim(),
      reason: document.getElementById('reason').value,
      endTime: endTime,
      createdAt: new Date().toISOString(),
      bids: [],
      settled: false,
      winner: null,
      winPrice: null
    };

    data.auctions.push(auction);
    saveData(data);

    this.reset();
    pricePreview.classList.add('hidden');
    showToast('경매가 성공적으로 등록되었습니다');
    switchView('auctions');
  });

  // --- 입찰 ---
  const bidModal = document.getElementById('bid-modal');
  let currentBidAuctionId = null;

  function attachBidButtons() {
    document.querySelectorAll('.bid-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const auction = data.auctions.find(a => a.id === this.dataset.id);
        if (!auction || !isActive(auction)) return;

        currentBidAuctionId = auction.id;
        const highest = getHighestBid(auction);
        const minBid = highest ? highest.amount + 1 : auction.minPrice;

        document.getElementById('bid-item-info').innerHTML =
          '<strong>' + escapeHtml(auction.productName) + '</strong><br>' +
          '거래처: ' + escapeHtml(auction.supplierName) + '<br>' +
          '수량: ' + auction.quantity.toLocaleString() + '개<br>' +
          '최소 희망가: ' + formatPrice(auction.minPrice) + '<br>' +
          '현재 최고 입찰가: ' + (highest ? formatPrice(highest.amount) : '없음') + '<br>' +
          '<span class="highlight">최소 입찰가: ' + formatPrice(minBid) + '</span>';

        const bidInput = document.getElementById('bid-amount');
        bidInput.value = '';
        bidInput.min = minBid;
        bidInput.placeholder = formatPrice(minBid) + ' 이상';
        document.getElementById('bidder-name').value = '';
        bidModal.classList.remove('hidden');
      });
    });
  }

  function closeModal() {
    bidModal.classList.add('hidden');
  }

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-bid').addEventListener('click', closeModal);
  bidModal.addEventListener('click', function (e) {
    if (e.target === bidModal) closeModal();
  });

  document.getElementById('submit-bid').addEventListener('click', function () {
    const amount = parseInt(document.getElementById('bid-amount').value);
    const bidder = document.getElementById('bidder-name').value.trim();

    if (!bidder) { showToast('입찰자명을 입력해주세요', true); return; }
    if (!amount || isNaN(amount)) { showToast('입찰 금액을 입력해주세요', true); return; }

    const auction = data.auctions.find(a => a.id === currentBidAuctionId);
    if (!auction || !isActive(auction)) {
      showToast('이 경매는 이미 종료되었습니다', true);
      closeModal();
      return;
    }

    const highest = getHighestBid(auction);
    const minBid = highest ? highest.amount + 1 : auction.minPrice;
    if (amount < minBid) {
      showToast('최소 입찰가(' + formatPrice(minBid) + ') 이상이어야 합니다', true);
      return;
    }

    auction.bids.push({
      bidder: bidder,
      amount: amount,
      bidAt: new Date().toISOString()
    });

    saveData(data);
    closeModal();
    showToast(formatPrice(amount) + '에 입찰 완료!');

    const activeView = document.querySelector('.nav-item.active').dataset.view;
    refreshView(activeView);
  });

  // --- 데이터 초기화 ---
  document.getElementById('reset-data').addEventListener('click', function () {
    if (!confirm('모든 데이터를 초기화하시겠습니까?\n(샘플 데이터가 다시 로드됩니다)')) return;
    localStorage.removeItem(STORAGE_KEY);
    data = { auctions: [], transactions: [] };
    loadSampleData();
    showToast('데이터가 초기화되었습니다');
    refreshView('dashboard');
  });

  // --- 타이머 자동 갱신 ---
  setInterval(function () {
    const activeView = document.querySelector('.nav-item.active').dataset.view;
    if (activeView === 'dashboard' || activeView === 'auctions') {
      refreshView(activeView);
    }
  }, 30000);

  // --- 샘플 데이터 ---
  function loadSampleData() {
    if (data.auctions.length > 0) return;

    const now = Date.now();
    data.auctions = [
      {
        id: generateId(),
        supplierName: '한국식품',
        productName: '프리미엄 견과류 선물세트',
        category: '식품',
        quantity: 500,
        originalPrice: 35000,
        minPrice: 8000,
        description: '2026년 설 시즌 재고. 유통기한 2026.09.30. 포장 상태 양호.',
        reason: '시즌종료',
        endTime: new Date(now + 24 * 3600000).toISOString(),
        createdAt: new Date(now - 2 * 3600000).toISOString(),
        bids: [
          { bidder: '마트왕', amount: 9000, bidAt: new Date(now - 3600000).toISOString() },
          { bidder: '할인매장', amount: 10500, bidAt: new Date(now - 1800000).toISOString() }
        ],
        settled: false, winner: null, winPrice: null
      },
      {
        id: generateId(),
        supplierName: '패션코리아',
        productName: '여성 겨울 패딩 자켓 (M/L/XL)',
        category: '의류',
        quantity: 1200,
        originalPrice: 89000,
        minPrice: 15000,
        description: '2025 F/W 시즌 잔여분. 색상: 블랙, 네이비. 전 사이즈 보유.',
        reason: '시즌종료',
        endTime: new Date(now + 48 * 3600000).toISOString(),
        createdAt: new Date(now - 5 * 3600000).toISOString(),
        bids: [
          { bidder: '아울렛마트', amount: 18000, bidAt: new Date(now - 10800000).toISOString() }
        ],
        settled: false, winner: null, winPrice: null
      },
      {
        id: generateId(),
        supplierName: '뷰티랩',
        productName: '비타민C 세럼 50ml',
        category: '화장품',
        quantity: 3000,
        originalPrice: 28000,
        minPrice: 5000,
        description: '리뉴얼로 인한 구버전 재고 소진. 제조일 2025.06. 품질 이상 없음.',
        reason: '리뉴얼',
        endTime: new Date(now + 6 * 3600000).toISOString(),
        createdAt: new Date(now - 3600000).toISOString(),
        bids: [],
        settled: false, winner: null, winPrice: null
      },
      {
        id: generateId(),
        supplierName: '테크마트',
        productName: 'LED 스탠드 조명',
        category: '가전',
        quantity: 800,
        originalPrice: 45000,
        minPrice: 10000,
        description: '신모델 출시로 구모델 재고 처분. 정상 작동. 박스 포장 완료.',
        reason: '리뉴얼',
        endTime: new Date(now + 72 * 3600000).toISOString(),
        createdAt: new Date(now - 36000000).toISOString(),
        bids: [
          { bidder: '다이소팜', amount: 11000, bidAt: new Date(now - 28800000).toISOString() },
          { bidder: '생활할인', amount: 12500, bidAt: new Date(now - 21600000).toISOString() },
          { bidder: '다이소팜', amount: 13000, bidAt: new Date(now - 14400000).toISOString() }
        ],
        settled: false, winner: null, winPrice: null
      },
      {
        id: generateId(),
        supplierName: '홈리빙',
        productName: '대나무 수납 바구니 세트 (3종)',
        category: '생활용품',
        quantity: 2000,
        originalPrice: 22000,
        minPrice: 6000,
        description: '과잉 생산분. 대/중/소 3종 세트. 미개봉 신품.',
        reason: '과잉생산',
        endTime: new Date(now + 36 * 3600000).toISOString(),
        createdAt: new Date(now - 7200000).toISOString(),
        bids: [
          { bidder: '할인매장', amount: 7000, bidAt: new Date(now - 5400000).toISOString() },
          { bidder: '마트왕', amount: 7500, bidAt: new Date(now - 3600000).toISOString() }
        ],
        settled: false, winner: null, winPrice: null
      }
    ];
    saveData(data);
  }

  // --- 초기화 ---
  loadSampleData();
  renderDashboard();
})();
