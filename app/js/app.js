// 떠리몰 체화재고 경매 플랫폼

(function () {
  'use strict';

  // --- 데이터 저장소 (localStorage) ---
  const STORAGE_KEY = 'tteori_data';

  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return { auctions: [], transactions: [] };
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  let data = loadData();

  // --- 유틸리티 ---
  function formatPrice(num) {
    return Number(num).toLocaleString('ko-KR') + '원';
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function timeRemaining(endTime) {
    const diff = new Date(endTime) - new Date();
    if (diff <= 0) return '종료됨';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return days + '일 ' + (hours % 24) + '시간 남음';
    }
    return hours + '시간 ' + minutes + '분 남음';
  }

  function isAuctionActive(auction) {
    return new Date(auction.endTime) > new Date();
  }

  function getHighestBid(auction) {
    if (!auction.bids || auction.bids.length === 0) return null;
    return auction.bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, auction.bids[0]);
  }

  function discountRate(original, final) {
    if (!original || original === 0) return '0%';
    return Math.round((1 - final / original) * 100) + '%';
  }

  // --- 경매 종료 처리 ---
  function processEndedAuctions() {
    let changed = false;
    data.auctions.forEach(auction => {
      if (auction.settled) return;
      if (isAuctionActive(auction)) return;

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
  const navButtons = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.view;
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      views.forEach(v => v.classList.remove('active'));
      document.getElementById(viewId).classList.add('active');
      refreshView(viewId);
    });
  });

  function refreshView(viewId) {
    processEndedAuctions();
    switch (viewId) {
      case 'dashboard': renderDashboard(); break;
      case 'auctions': renderAuctions(); break;
      case 'transactions': renderTransactions(); break;
    }
  }

  // --- 대시보드 ---
  function renderDashboard() {
    const activeCount = data.auctions.filter(a => isAuctionActive(a)).length;
    const completedCount = data.transactions.length;
    const totalAmount = data.transactions.reduce((sum, t) => sum + t.winPrice * t.quantity, 0);

    document.getElementById('stat-inventory').textContent = data.auctions.length;
    document.getElementById('stat-active').textContent = activeCount;
    document.getElementById('stat-completed').textContent = completedCount;
    document.getElementById('stat-total').textContent = formatPrice(totalAmount);

    const recentContainer = document.getElementById('recent-auctions');
    const recent = [...data.auctions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

    if (recent.length === 0) {
      recentContainer.innerHTML = '<div class="empty-state"><p>등록된 경매가 없습니다</p><p style="font-size:0.9rem">재고 등록 탭에서 첫 경매를 시작해보세요</p></div>';
      return;
    }
    recentContainer.innerHTML = recent.map(a => renderAuctionCard(a)).join('');
    attachBidButtons();
  }

  // --- 경매 카드 렌더링 ---
  function renderAuctionCard(auction) {
    const active = isAuctionActive(auction);
    const highest = getHighestBid(auction);
    const highestAmount = highest ? formatPrice(highest.amount) : '-';
    const bidCount = auction.bids ? auction.bids.length : 0;

    let statusBadge;
    if (active) {
      statusBadge = '<span class="card-badge badge-active">진행중</span>';
    } else if (auction.winner) {
      statusBadge = '<span class="card-badge badge-won">낙찰</span>';
    } else {
      statusBadge = '<span class="card-badge badge-ended">유찰</span>';
    }

    let bidHistory = '';
    if (auction.bids && auction.bids.length > 0) {
      const recentBids = [...auction.bids].sort((a, b) => b.amount - a.amount).slice(0, 3);
      bidHistory = '<div class="bid-history"><div class="bid-history-title">입찰 현황</div>' +
        recentBids.map((b, i) => '<div class="bid-entry' + (i === 0 ? ' winning' : '') + '">' +
          b.bidder + ' - ' + formatPrice(b.amount) + '</div>').join('') +
        '</div>';
    }

    return '<div class="auction-card' + (active ? '' : ' ended') + '">' +
      '<div class="card-header"><span class="card-title">' + escapeHtml(auction.productName) + '</span>' + statusBadge + '</div>' +
      '<div class="card-meta"><span>' + escapeHtml(auction.supplierName) + '</span><span>' + escapeHtml(auction.category) + '</span><span>수량: ' + auction.quantity + '</span></div>' +
      (auction.reason ? '<span class="card-reason">' + escapeHtml(auction.reason) + '</span>' : '') +
      (auction.description ? '<div class="card-desc">' + escapeHtml(auction.description) + '</div>' : '') +
      '<div class="card-prices">' +
        '<div class="price-item"><span class="price-label">정상가</span><span class="price-value original">' + formatPrice(auction.originalPrice) + '</span></div>' +
        '<div class="price-item"><span class="price-label">최소 희망가</span><span class="price-value">' + formatPrice(auction.minPrice) + '</span></div>' +
        '<div class="price-item"><span class="price-label">현재 최고 입찰가</span><span class="price-value current">' + highestAmount + '</span></div>' +
      '</div>' +
      '<div class="card-bids">입찰 ' + bidCount + '건</div>' +
      (active ? '<div class="card-timer">' + timeRemaining(auction.endTime) + '</div>' : '') +
      bidHistory +
      (active ? '<div class="card-actions"><button class="btn btn-primary btn-sm bid-btn" data-id="' + auction.id + '">입찰하기</button></div>' : '') +
      (auction.winner ? '<div class="card-meta" style="margin-top:0.5rem;color:var(--success);font-weight:600">낙찰자: ' + escapeHtml(auction.winner) + ' / ' + formatPrice(auction.winPrice) + ' (' + discountRate(auction.originalPrice, auction.winPrice) + ' 할인)</div>' : '') +
    '</div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- 경매장 ---
  function renderAuctions() {
    const categoryFilter = document.getElementById('filter-category').value;
    const statusFilter = document.getElementById('filter-status').value;

    let filtered = [...data.auctions];
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(a => a.category === categoryFilter);
    }
    if (statusFilter === 'active') {
      filtered = filtered.filter(a => isAuctionActive(a));
    } else if (statusFilter === 'ended') {
      filtered = filtered.filter(a => !isAuctionActive(a));
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const container = document.getElementById('auction-list');
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>해당하는 경매가 없습니다</p></div>';
      return;
    }
    container.innerHTML = filtered.map(a => renderAuctionCard(a)).join('');
    attachBidButtons();
  }

  document.getElementById('filter-category').addEventListener('change', renderAuctions);
  document.getElementById('filter-status').addEventListener('change', renderAuctions);

  // --- 거래 내역 ---
  function renderTransactions() {
    const tbody = document.getElementById('transaction-tbody');
    if (data.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:2rem">거래 내역이 없습니다</td></tr>';
      return;
    }
    const sorted = [...data.transactions].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    tbody.innerHTML = sorted.map(t => {
      const date = new Date(t.completedAt);
      const dateStr = date.getFullYear() + '.' +
        String(date.getMonth() + 1).padStart(2, '0') + '.' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0');
      const rate = discountRate(t.originalPrice, t.winPrice);
      return '<tr>' +
        '<td>' + dateStr + '</td>' +
        '<td>' + escapeHtml(t.productName) + '</td>' +
        '<td>' + escapeHtml(t.supplierName) + '</td>' +
        '<td>' + t.quantity + '</td>' +
        '<td>' + formatPrice(t.winPrice) + '</td>' +
        '<td class="discount-rate">' + rate + '</td>' +
      '</tr>';
    }).join('');
  }

  // --- 재고 등록 ---
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
    alert('경매가 등록되었습니다!');

    // 경매장으로 이동
    document.querySelector('[data-view="auctions"]').click();
  });

  // --- 입찰 ---
  const bidModal = document.getElementById('bid-modal');
  let currentBidAuctionId = null;

  function attachBidButtons() {
    document.querySelectorAll('.bid-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const auctionId = this.dataset.id;
        const auction = data.auctions.find(a => a.id === auctionId);
        if (!auction || !isAuctionActive(auction)) return;

        currentBidAuctionId = auctionId;
        const highest = getHighestBid(auction);
        const minBid = highest ? highest.amount + 1 : auction.minPrice;

        document.getElementById('bid-item-info').innerHTML =
          '<strong>' + escapeHtml(auction.productName) + '</strong><br>' +
          '거래처: ' + escapeHtml(auction.supplierName) + '<br>' +
          '수량: ' + auction.quantity + '개<br>' +
          '최소 희망가: ' + formatPrice(auction.minPrice) + '<br>' +
          '현재 최고 입찰가: ' + (highest ? formatPrice(highest.amount) : '없음') + '<br>' +
          '<strong>최소 입찰가: ' + formatPrice(minBid) + '</strong>';

        document.getElementById('bid-amount').value = '';
        document.getElementById('bid-amount').min = minBid;
        document.getElementById('bid-amount').placeholder = formatPrice(minBid) + ' 이상';
        document.getElementById('bidder-name').value = '';
        bidModal.classList.remove('hidden');
      });
    });
  }

  document.querySelector('.modal-close').addEventListener('click', () => {
    bidModal.classList.add('hidden');
  });

  bidModal.addEventListener('click', function (e) {
    if (e.target === bidModal) bidModal.classList.add('hidden');
  });

  document.getElementById('submit-bid').addEventListener('click', function () {
    const amount = parseInt(document.getElementById('bid-amount').value);
    const bidder = document.getElementById('bidder-name').value.trim();

    if (!bidder) { alert('입찰자명을 입력해주세요.'); return; }
    if (!amount || isNaN(amount)) { alert('입찰 금액을 입력해주세요.'); return; }

    const auction = data.auctions.find(a => a.id === currentBidAuctionId);
    if (!auction || !isAuctionActive(auction)) {
      alert('이 경매는 이미 종료되었습니다.');
      bidModal.classList.add('hidden');
      return;
    }

    const highest = getHighestBid(auction);
    const minBid = highest ? highest.amount + 1 : auction.minPrice;
    if (amount < minBid) {
      alert('최소 입찰가(' + formatPrice(minBid) + ') 이상이어야 합니다.');
      return;
    }

    auction.bids.push({
      bidder: bidder,
      amount: amount,
      bidAt: new Date().toISOString()
    });

    saveData(data);
    bidModal.classList.add('hidden');
    alert(formatPrice(amount) + '에 입찰되었습니다!');

    // 현재 뷰 새로고침
    const activeView = document.querySelector('.nav-btn.active').dataset.view;
    refreshView(activeView);
  });

  // --- 타이머 업데이트 ---
  setInterval(function () {
    const activeView = document.querySelector('.nav-btn.active').dataset.view;
    if (activeView === 'dashboard' || activeView === 'auctions') {
      refreshView(activeView);
    }
  }, 30000);

  // --- 샘플 데이터 (최초 실행 시) ---
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
          { bidder: '마트왕', amount: 9000, bidAt: new Date(now - 1 * 3600000).toISOString() },
          { bidder: '할인매장', amount: 10500, bidAt: new Date(now - 0.5 * 3600000).toISOString() }
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
          { bidder: '아울렛마트', amount: 18000, bidAt: new Date(now - 3 * 3600000).toISOString() }
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
        createdAt: new Date(now - 1 * 3600000).toISOString(),
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
        createdAt: new Date(now - 10 * 3600000).toISOString(),
        bids: [
          { bidder: '다이소팜', amount: 11000, bidAt: new Date(now - 8 * 3600000).toISOString() },
          { bidder: '생활할인', amount: 12500, bidAt: new Date(now - 6 * 3600000).toISOString() },
          { bidder: '다이소팜', amount: 13000, bidAt: new Date(now - 4 * 3600000).toISOString() }
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
