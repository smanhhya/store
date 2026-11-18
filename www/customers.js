// =========================================================================
// 👥 المحرك البريميوم الشامل لإدارة العملاء 360°، المديونيات، البلاك ليست، ونقاط الولاء (www/customers.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة الشاملة الكاملة
// =========================================================================

(function () {
    // 1. حالة الفلاتر والفرز في شاشة أرشيف العملاء + تبويبات ملف العميل 360
    window.custFilterState = {
        segment: 'all',      // 'all' | 'vip' | 'dormant' | 'debt' | 'points' | 'active_now' | 'risk'
        zone: 'all',         // 'all' | zoneName
        sortBy: 'spent_desc',// 'spent_desc' | 'orders_desc' | 'debt_desc' | 'recent_desc'
        modalSection: 'all'  // 'all' | 'orders' | 'trust_info' | 'notebook'
    };

    // خريطة الذكاء التحليلي للعملاء المحسوبة من الطلبات الحية والمؤرشفة
    window._customerIntelMap = {};

    function safeNormPhone(p) {
        if (!p) return '';
        return typeof window.normalizePhone === 'function' ? window.normalizePhone(p) : String(p).replace(/\D/g, '');
    }

    // =========================================================================
    // 🧠 أولاً: محرك تحليل بيانات وسلوك كل عميل الشامل (Customer 360° DNA Engine)
    // =========================================================================
    window.buildCustomerIntelligenceMap = function () {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const intel = {};

        ordersList.forEach(o => {
            if (!o || o.status === 'trash') return;
            const p1 = safeNormPhone(o.customerPhone);
            if (!p1) return;

            if (!intel[p1]) {
                intel[p1] = {
                    phone: o.customerPhone,
                    normPhone: p1,
                    name: o.customerName || 'عميل',
                    zone: o.zone || '',
                    address: o.customerAddress || '',
                    completedOrders: 0,
                    activeOrders: 0,
                    canceledOrders: 0,
                    realTotalSpent: 0,
                    totalNetProductsSpent: 0,
                    totalDiscountsTaken: 0,
                    totalQuailPlates: 0,
                    firstOrderMs: 0,
                    firstOrderDateStr: '',
                    lastOrderMs: 0,
                    lastOrderDateStr: '',
                    lastOrderObj: null,
                    preferredPayment: 'cash',
                    onlinePayCount: 0,
                    cashPayCount: 0,
                    itemsCountMap: {},
                    ordersList: []
                };
            }

            const rec = intel[p1];
            rec.ordersList.push(o);

            if (o.customerName && (!rec.name || rec.name === 'عميل')) rec.name = o.customerName;
            if (o.zone && !rec.zone) rec.zone = o.zone;
            if (o.customerAddress && !rec.address) rec.address = o.customerAddress;

            let ordMs = 0;
            if (o.createdAt && typeof o.createdAt.toMillis === 'function') {
                ordMs = o.createdAt.toMillis();
            } else if (o.orderDate) {
                const parsed = new Date(o.orderDate);
                if (!isNaN(parsed.getTime())) ordMs = parsed.getTime();
            }

            if (ordMs > 0 && (rec.firstOrderMs === 0 || ordMs < rec.firstOrderMs)) {
                rec.firstOrderMs = ordMs;
                rec.firstOrderDateStr = o.orderDate || new Date(ordMs).toLocaleDateString('ar-EG');
            }

            if (ordMs >= rec.lastOrderMs) {
                rec.lastOrderMs = ordMs;
                rec.lastOrderDateStr = o.orderDate || (ordMs ? new Date(ordMs).toLocaleDateString('en-US') : '');
                if (o.status !== 'canceled') rec.lastOrderObj = o;
            }

            if (o.status === 'completed') {
                rec.completedOrders++;
                const ordTotal = Number(o.total) || 0;
                const ordDel = Number(o.deliveryFee) || 0;
                const ordDisc = Number(o.discount) || 0;
                rec.realTotalSpent += ordTotal;
                rec.totalNetProductsSpent += Math.max(0, ordTotal - ordDel);
                rec.totalDiscountsTaken += ordDisc;

                if (o.paymentMethod === 'online' || o.paymentMethod === 'split') rec.onlinePayCount++;
                else rec.cashPayCount++;

                if (Array.isArray(o.items)) {
                    o.items.forEach(i => {
                        const qty = Number(i.quantity) || 0;
                        const cleanName = (i.name || '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
                        if (cleanName) {
                            rec.itemsCountMap[cleanName] = (rec.itemsCountMap[cleanName] || 0) + qty;
                        }
                        const lowName = cleanName.toLowerCase();
                        if (!lowName.includes('بيض') && !lowName.includes('كتكوت') && !lowName.includes('كتاكيت')) {
                            rec.totalQuailPlates += qty;
                        }
                    });
                }
            } else if (o.status === 'canceled') {
                rec.canceledOrders++;
            } else {
                rec.activeOrders++;
                if (!rec.lastOrderObj) rec.lastOrderObj = o;
            }
        });

        // تحديد الأصناف المفضلة وطريقة الدفع المعتادة لكل عميل
        Object.values(intel).forEach(rec => {
            const itemsKeys = Object.keys(rec.itemsCountMap);
            if (itemsKeys.length > 0) {
                itemsKeys.sort((a, b) => rec.itemsCountMap[b] - rec.itemsCountMap[a]);
                rec.favoriteItem = itemsKeys[0];
                rec.secondFavoriteItem = itemsKeys[1] || '';
            } else {
                rec.favoriteItem = '';
                rec.secondFavoriteItem = '';
            }
            rec.preferredPayment = rec.onlinePayCount > rec.cashPayCount ? 'أونلاين / محفظة 💳' : 'كاش عند الاستلام 💵';
        });

        window._customerIntelMap = intel;
        return intel;
    };

    // =========================================================================
    // 🎛️ ثانياً: شريط الفلترة والتقسيم الذكي في شاشة أرشيف العملاء (#view-customers)
    // =========================================================================
    window.initSmartCustomersToolbar = function () {
        const custView = document.getElementById('view-customers');
        if (!custView || document.getElementById('smart-customers-toolbar')) return;

        const topSearchCard = custView.firstElementChild;
        if (!topSearchCard) return;

        // إضافة زر "+ إضافة عميل جديد" في شريط البحث العلوي بجوار استيراد الداتا وإحصائيات النقاط
        const topBtnsContainer = topSearchCard.querySelector('.flex.gap-2');
        if (topBtnsContainer && !document.getElementById('btn-add-new-customer-direct')) {
            const addCustBtn = document.createElement('button');
            addCustBtn.type = 'button';
            addCustBtn.id = 'btn-add-new-customer-direct';
            addCustBtn.onclick = () => window.openQuickAddCustomerModal();
            addCustBtn.className = 'w-full md:w-auto bg-brand-primary text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-md hover:bg-emerald-800 flex items-center justify-center gap-2 transition-all shrink-0';
            addCustBtn.innerHTML = '<i class="fa-solid fa-user-plus text-amber-300"></i> <span>إضافة عميل</span>';
            topBtnsContainer.insertBefore(addCustBtn, topBtnsContainer.firstChild);
        }

        const toolbar = document.createElement('div');
        toolbar.id = 'smart-customers-toolbar';
        toolbar.className = 'mb-3 space-y-2 shrink-0';

        toolbar.innerHTML = `
            <!-- أزرار تقسيم شرائح العملاء + فلتر المنطقة والترتيب -->
            <div class="bg-white p-3 rounded-2xl shadow-soft border border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-1.5">
                    <button onclick="setCustomerSegmentFilter('all')" id="cf-seg-all" class="cust-seg-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-sm transition-all">👥 كل العملاء</button>
                    <button onclick="setCustomerSegmentFilter('vip')" id="cf-seg-vip" class="cust-seg-btn bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">💎 كبار العملاء VIP</button>
                    <button onclick="setCustomerSegmentFilter('active_now')" id="cf-seg-active_now" class="cust-seg-btn bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">🔥 لهم طلب حي الآن</button>
                    <button onclick="setCustomerSegmentFilter('dormant')" id="cf-seg-dormant" class="cust-seg-btn bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">💤 غائبين (+14 يوم)</button>
                    <button onclick="setCustomerSegmentFilter('debt')" id="cf-seg-debt" class="cust-seg-btn bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">📕 عليهم مديونية</button>
                    <button onclick="setCustomerSegmentFilter('points')" id="cf-seg-points" class="cust-seg-btn bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">🪙 لديهم نقاط محفظة</button>
                    <button onclick="setCustomerSegmentFilter('risk')" id="cf-seg-risk" class="cust-seg-btn bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">⚠️ متعب / بلاك ليست</button>
                </div>

                <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <select id="cf-zone-select" onchange="setCustomerZoneFilter(this.value)" class="flex-1 lg:flex-none border border-slate-200 bg-slate-50 rounded-xl px-3 py-1.5 text-xs font-black text-indigo-800 outline-none focus:bg-white">
                        <option value="all">📍 كل المناطق</option>
                    </select>

                    <select id="cf-sort-select" onchange="setCustomerSortBy(this.value)" class="flex-1 lg:flex-none border border-slate-200 bg-slate-50 rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 outline-none focus:bg-white">
                        <option value="spent_desc">💰 الترتيب: الأعلى إنفاقاً</option>
                        <option value="orders_desc">📦 الترتيب: الأكثر طلباً</option>
                        <option value="debt_desc">📕 الترتيب: الأعلى مديونية</option>
                        <option value="recent_desc">🕒 الترتيب: الأحدث طلباً</option>
                    </select>
                </div>
            </div>

            <!-- شريط إحصائيات الشريحة المعروضة -->
            <div class="bg-slate-900 text-white px-4 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] font-black shadow-sm">
                <div class="flex flex-wrap items-center gap-3">
                    <span>👥 المعروض: <strong id="cf-stat-count" class="text-amber-400">0</strong> عميل</span>
                    <span class="text-slate-600">|</span>
                    <span>💎 VIP: <strong id="cf-stat-vips" class="text-emerald-400">0</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>📕 إجمالي مديونيتهم: <strong id="cf-stat-debt" class="text-rose-400">0 ج</strong></span>
                </div>
                <div>
                    <span>💰 إجمالي إنفاق المعروضين: <strong id="cf-stat-spent" class="text-amber-400 text-xs">0 ج</strong></span>
                </div>
            </div>
        `;

        custView.insertBefore(toolbar, topSearchCard.nextSibling);
    };

    window.setCustomerSegmentFilter = function (seg) {
        window.custFilterState.segment = seg;
        document.querySelectorAll('.cust-seg-btn').forEach(btn => {
            btn.className = 'cust-seg-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-xl text-xs font-black transition-all';
        });
        const activeBtn = document.getElementById('cf-seg-' + seg);
        if (activeBtn) {
            activeBtn.className = 'cust-seg-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-sm transition-all';
        }
        window.renderCustomersTableUI();
    };

    window.setCustomerZoneFilter = function (zoneVal) {
        window.custFilterState.zone = zoneVal;
        window.renderCustomersTableUI();
    };

    window.setCustomerSortBy = function (sortVal) {
        window.custFilterState.sortBy = sortVal;
        window.renderCustomersTableUI();
    };

    // إضافة عميل جديد مباشرة للأرشيف
    window.openQuickAddCustomerModal = async function () {
        const phoneRaw = prompt('👤 إضافة عميل جديد للأرشيف:\n\nأدخل رقم موبايل العميل الأساسي:');
        if (!phoneRaw) return;
        const normP = safeNormPhone(phoneRaw);
        if (normP.length < 10) return alert('برجاء إدخال رقم موبايل صحيح (10 أرقام على الأقل)!');

        const cleanPhoneDb = normP.startsWith('0') ? normP : '0' + normP;
        const existing = customersData.find(c => safeNormPhone(c.phone) === normP);
        if (existing) {
            alert(`هذا العميل مسجل بالفعل باسم (${existing.name})! سيتم فتح ملفه الشامل الآن.`);
            return window.openCustomerCard(cleanPhoneDb);
        }

        const name = prompt('اكتب اسم العميل ثلاثي أو واضح:') || 'عميل جديد';
        const zone = prompt('اكتب منطقة العميل (مثال: ههيا / الزقازيق / أبو كبير):', 'ههيا') || '';
        const address = prompt('اكتب العنوان التفصيلي للعميل:') || '';
        const stickyNote = prompt('هل توجد ملاحظة ثابتة عن هذا العميل؟ (اختياري):') || '';

        try {
            const newCustObj = {
                name: name.trim(),
                phone: cleanPhoneDb,
                zone: zone.trim(),
                address: address.trim(),
                stickyNote: stickyNote.trim(),
                ordersCount: 0,
                totalSpent: 0,
                debt: 0,
                walletPoints: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('customers').doc(cleanPhoneDb).set(newCustObj, { merge: true });
            customersData.unshift(newCustObj);
            window.renderCustomersTableUI();
            window.openCustomerCard(cleanPhoneDb);
            if (typeof window.showToast === 'function') window.showToast(`✅ تم تسجيل العميل (${name}) وفتح ملفه الشامل!`);
        } catch (e) {
            alert('حدث خطأ أثناء حفظ العميل الجديد!');
        }
    };

    // =========================================================================
    // 🔄 ثالثاً: تحديث وبناء جدول أرشيف العملاء الشامل
    // =========================================================================
    window._customersLoadedFromServerOnce = false;
    window._lastCustomersFetchMs = 0;

    try {
        const cachedCustStr = localStorage.getItem('sman_customers_fast_cache');
        if (cachedCustStr) {
            const parsedCust = JSON.parse(cachedCustStr);
            if (Array.isArray(parsedCust) && parsedCust.length > 0 && (!customersData || customersData.length === 0)) {
                customersData = parsedCust;
            }
        }
    } catch (e) {}

    window.refreshCustomersData = function (forceServerFetch = false) {
        if (typeof db === 'undefined') return;
        const activeTab = window.smanCurrentActiveTab || 'dashboard';
        const nowMs = Date.now();

        if (!forceServerFetch && window._customersLoadedFromServerOnce && (nowMs - window._lastCustomersFetchMs < 45000)) {
            window._trustCacheTime = 0;
            if (activeTab === 'customers') window.renderCustomersTableUI();
            else if (activeTab === 'debts') window.renderDebtsUI();
            else if (activeTab === 'blacklist' && typeof window.renderBlacklistUI === 'function') window.renderBlacklistUI();
            else if (activeTab === 'orders' && typeof window.renderOrdersList === 'function') window.renderOrdersList();
            else if (activeTab === 'dashboard' && typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
            return;
        }

        window._lastCustomersFetchMs = nowMs;
        db.collection('customers').get().then(snap => {
            window._customersLoadedFromServerOnce = true;
            const rawMap = {};
            snap.forEach(doc => {
                const d = doc.data() || {};
                const normP = safeNormPhone(d.phone || doc.id);
                if (normP) {
                    rawMap[normP] = { ...d, phone: d.phone || doc.id };
                }
            });

            const intelMap = window.buildCustomerIntelligenceMap();
            Object.keys(intelMap).forEach(normP => {
                const inf = intelMap[normP];
                if (!rawMap[normP] && normP.length >= 10) {
                    rawMap[normP] = {
                        name: inf.name,
                        phone: inf.phone,
                        zone: inf.zone,
                        address: inf.address,
                        ordersCount: inf.completedOrders + inf.activeOrders,
                        totalSpent: inf.realTotalSpent,
                        debt: 0
                    };
                }
            });

            customersData = Object.values(rawMap);
            window._trustCacheTime = 0;

            try {
                localStorage.setItem('sman_customers_fast_cache', JSON.stringify(customersData));
            } catch (e) {}

            let dashCust = document.getElementById('dash-customers');
            if (dashCust) dashCust.innerText = customersData.length;

            const curTab = window.smanCurrentActiveTab || 'dashboard';
            if (curTab === 'customers') window.renderCustomersTableUI();
            else if (curTab === 'debts') window.renderDebtsUI();
            else if (curTab === 'blacklist' && typeof window.renderBlacklistUI === 'function') window.renderBlacklistUI();
            else if (curTab === 'orders' && typeof window.renderOrdersList === 'function') window.renderOrdersList();
            else if (curTab === 'dashboard' && typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            if (typeof window.updateLiveHeaderAndSidebar === 'function') {
                window.updateLiveHeaderAndSidebar();
            }
        }).catch(err => console.log('خطأ في جلب الأرشيف: ', err));
    };

    window.renderCustomersTableUI = function () {
        window.initSmartCustomersToolbar();
        const tbEl = document.getElementById('customers-tbody');
        if (!tbEl) return;

        const intelMap = window.buildCustomerIntelligenceMap();
        const nowMs = Date.now();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
        const pointVal = Number(storeSettings?.pointValueInEGP) || 0.40;

        const zoneSel = document.getElementById('cf-zone-select');
        if (zoneSel) {
            const curZ = window.custFilterState.zone;
            const zCounts = {};
            customersData.forEach(c => {
                const z = (c.zone || '').trim();
                if (z) zCounts[z] = (zCounts[z] || 0) + 1;
            });
            let zOpts = `<option value="all">📍 كل المناطق</option>`;
            Object.keys(zCounts).sort((a, b) => zCounts[b] - zCounts[a]).forEach(z => {
                zOpts += `<option value="${z}" ${curZ === z ? 'selected' : ''}>📍 ${z} (${zCounts[z]})</option>`;
            });
            zoneSel.innerHTML = zOpts;
            zoneSel.value = curZ;
        }

        const enrichedList = customersData.map(c => {
            const normP = safeNormPhone(c.phone);
            const inf = intelMap[normP] || {};
            const calcOrders = Math.max(Number(c.ordersCount) || 0, (inf.completedOrders || 0) + (inf.activeOrders || 0));
            const calcSpent = Math.max(Number(c.totalSpent) || 0, inf.realTotalSpent || 0);
            const debtVal = Number(c.debt) || 0;
            const ptsVal = Number(c.walletPoints) || 0;
            const lastMs = inf.lastOrderMs || (c.lastOrder && typeof c.lastOrder.toMillis === 'function' ? c.lastOrder.toMillis() : 0);
            const isVip = c.trustRating === 'vip' || calcOrders >= 5 || calcSpent >= 2000;
            const isDormant = (calcOrders >= 2 || calcSpent >= 500) && (!lastMs || (nowMs - lastMs) >= fourteenDaysMs);
            const isRisk = Boolean(c.isBlacklisted || c.trustRating === 'blacklist' || c.trustRating === 'tiring');
            const hasActiveNow = (inf.activeOrders || 0) > 0;

            return {
                raw: c,
                normPhone: normP,
                name: c.name || inf.name || 'عميل',
                phone: c.phone || inf.phone || '',
                zone: c.zone || inf.zone || '',
                address: c.address || inf.address || '',
                ordersCount: calcOrders,
                completedOrders: inf.completedOrders || 0,
                activeOrders: inf.activeOrders || 0,
                totalQuailPlates: inf.totalQuailPlates || 0,
                totalSpent: calcSpent,
                debt: debtVal,
                walletPoints: ptsVal,
                lastOrderMs: lastMs,
                lastOrderDateStr: inf.lastOrderDateStr || '',
                favoriteItem: inf.favoriteItem || '',
                hasLastOrderObj: Boolean(inf.lastOrderObj),
                isVip,
                isDormant,
                isRisk,
                hasActiveNow
            };
        });

        const searchInput = document.getElementById('search-customer');
        let rawFilter = '';
        if (searchInput) {
            const orig = searchInput.value;
            const conv = orig.replace(/[\u0660-\u0669]/g, ch => ch.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, ch => ch.charCodeAt(0) - 0x06F0);
            if (orig !== conv) searchInput.value = conv;
            rawFilter = conv.toLowerCase().trim();
        }
        const filterWords = rawFilter.split(' ').filter(w => w.trim() !== '');

        const seg = window.custFilterState.segment;
        const zoneFilter = window.custFilterState.zone;

        const filtered = enrichedList.filter(item => {
            if (seg === 'vip' && !item.isVip) return false;
            if (seg === 'active_now' && !item.hasActiveNow) return false;
            if (seg === 'dormant' && !item.isDormant) return false;
            if (seg === 'debt' && item.debt <= 0) return false;
            if (seg === 'points' && item.walletPoints <= 0) return false;
            if (seg === 'risk' && !item.isRisk) return false;

            if (zoneFilter !== 'all' && item.zone.trim() !== zoneFilter) return false;

            if (filterWords.length > 0) {
                const altStr = (item.raw.altPhones || []).join(' ');
                const hay = `${item.name} ${item.phone} ${item.normPhone} ${altStr} ${item.zone} ${item.address} ${item.raw.notebook || ''} ${item.raw.stickyNote || ''} ${item.favoriteItem}`.toLowerCase();
                return filterWords.every(w => {
                    const nw = safeNormPhone(w);
                    return hay.includes(w) || (nw.length >= 5 && hay.includes(nw));
                });
            }
            return true;
        });

        const sortBy = window.custFilterState.sortBy;
        filtered.sort((a, b) => {
            if (sortBy === 'orders_desc') return b.ordersCount - a.ordersCount;
            if (sortBy === 'debt_desc') return b.debt - a.debt;
            if (sortBy === 'recent_desc') return b.lastOrderMs - a.lastOrderMs;
            return b.totalSpent - a.totalSpent;
        });

        let statVips = 0, statDebt = 0, statSpent = 0;
        filtered.forEach(item => {
            if (item.isVip) statVips++;
            statDebt += item.debt;
            statSpent += item.totalSpent;
        });
        if (document.getElementById('cf-stat-count')) document.getElementById('cf-stat-count').innerText = filtered.length;
        if (document.getElementById('cf-stat-vips')) document.getElementById('cf-stat-vips').innerText = statVips;
        if (document.getElementById('cf-stat-debt')) document.getElementById('cf-stat-debt').innerText = statDebt.toLocaleString() + ' ج';
        if (document.getElementById('cf-stat-spent')) document.getElementById('cf-stat-spent').innerText = statSpent.toLocaleString() + ' ج';

        if (filtered.length === 0) {
            tbEl.innerHTML = `<tr><td colspan="5" class="text-center p-12 text-slate-400 font-bold text-sm">لا يوجد عملاء مطابقون لهذا الفلتر حالياً.</td></tr>`;
            return;
        }

        const custLimit = window.customersRenderLimit || 50;
        const visibleCusts = filtered.slice(0, custLimit);
        const remCusts = filtered.length - visibleCusts.length;

        let rowsHtml = visibleCusts.map(item => {
            const c = item.raw;
            const location = (item.zone ? item.zone : '') + (item.address ? ' - ' + item.address : '');
            const stickyHtml = c.stickyNote ? `<div class="text-[10px] text-yellow-900 font-black mt-1 max-w-[240px] truncate mx-auto bg-yellow-200/80 px-2 py-0.5 rounded border border-yellow-400" title="${c.stickyNote}"><i class="fa-solid fa-thumbtack text-yellow-700"></i> ${c.stickyNote}</div>` : '';
            const details = c.notebook ? `<div class="text-[10px] text-amber-600 font-bold mt-1 max-w-[220px] truncate mx-auto bg-amber-50 px-2 py-0.5 rounded" title="${c.notebook}"><i class="fa-solid fa-book"></i> ${c.notebook}</div>` : '';
            const trustBadge = window.getCustomerTrustBadgeHTML ? window.getCustomerTrustBadgeHTML(c) : '';

            const debtBadgeHtml = item.debt > 0
                ? `<span onclick="event.stopPropagation(); quickSettleCustomerDebt('${item.phone}', 'choose')" class="cursor-pointer bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded-md text-[10px] font-black inline-flex items-center gap-1 shadow-sm transition-transform hover:scale-105" title="اضغط لتسديد أو تعديل مديونية العميل فوراً">📕 عليه ${item.debt} ج</span>`
                : '';

            const activeNowBadgeHtml = item.hasActiveNow
                ? `<span class="bg-blue-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black animate-pulse">🔥 له ${item.activeOrders} طلب حي</span>`
                : '';

            const ptsCash = Math.round(item.walletPoints * pointVal);
            const pointsBadgeHtml = item.walletPoints > 0
                ? `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[9px] font-black">🪙 ${item.walletPoints} نقطة (${ptsCash} ج)</span>`
                : '';

            let dnaSubLine = '';
            if (item.favoriteItem || item.lastOrderMs || item.totalQuailPlates > 0) {
                const daysAgo = item.lastOrderMs ? Math.floor((nowMs - item.lastOrderMs) / (1000 * 60 * 60 * 24)) : null;
                const lastStr = daysAgo !== null ? (daysAgo === 0 ? 'اليوم' : `منذ ${daysAgo} يوم`) : '';
                dnaSubLine = `<div class="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-bold text-slate-400">
                    ${item.favoriteItem ? `<span class="text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">🥩 يفضل: ${item.favoriteItem}</span>` : ''}
                    ${item.totalQuailPlates > 0 ? `<span class="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">📦 إجمالي: ${Number(item.totalQuailPlates.toFixed(1))} طبق</span>` : ''}
                    ${lastStr ? `<span class="${daysAgo > 20 ? 'text-rose-500 font-black' : 'text-slate-400'}">🕒 آخر طلب: ${lastStr}</span>` : ''}
                </div>`;
            }

            const waPhone = (item.phone || '').startsWith('0') ? '2' + item.phone : item.phone;

            return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 customer-row ${c.isBlacklisted ? 'bg-red-50/40' : ''}">
                <td class="py-3.5 px-5">
                    <div class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary transition-colors flex flex-wrap items-center gap-1.5" onclick="openCustomerCard('${item.phone}')">
                        <span>${item.name}</span>
                        ${trustBadge}
                        ${activeNowBadgeHtml}
                        ${debtBadgeHtml}
                        ${pointsBadgeHtml}
                    </div>
                    <div class="text-[11px] text-slate-500 font-bold mt-0.5" dir="ltr">${item.phone}</div>
                    ${dnaSubLine}
                </td>
                <td class="py-3.5 px-5 text-center">
                    <div class="text-xs font-bold text-slate-700">${location || '<span class="text-slate-400">غير مسجل</span>'}</div>
                    ${stickyHtml}${details}
                </td>
                <td class="py-3.5 px-5 text-center">
                    <span class="font-black text-slate-800 text-base">${item.ordersCount}</span>
                    <span class="block text-[9px] text-slate-400 font-bold">${item.completedOrders} مسلم ${item.activeOrders > 0 ? `• ${item.activeOrders} حي` : ''}</span>
                </td>
                <td class="py-3.5 px-5 text-center">
                    <span class="font-black text-emerald-600 text-base">${item.totalSpent.toLocaleString()} <span class="text-[10px]">ج</span></span>
                    ${item.ordersCount > 0 ? `<span class="block text-[9px] text-slate-400 font-bold">متوسط: ${Math.round(item.totalSpent / item.ordersCount)} ج</span>` : ''}
                </td>
                <td class="py-3.5 px-5 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openCustomerCard('${item.phone}')" class="bg-slate-900 hover:bg-brand-primary text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5"><i class="fa-solid fa-id-card text-amber-300"></i> الملف 360°</button>
                        ${item.hasLastOrderObj ? `<button onclick="repeatLastOrderForCustomer('${item.phone}')" class="bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-500 hover:text-white w-8 h-8 rounded-xl text-xs flex items-center justify-center transition-all" title="تكرار آخر طلب لهذا العميل بضغطة واحدة"><i class="fa-solid fa-rotate-right"></i></button>` : ''}
                        <button onclick="safeOpenAddOrderModalForCustomer('${item.phone}')" class="bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white w-8 h-8 rounded-xl text-xs flex items-center justify-center transition-all" title="إنشاء أوردر جديد لهذا العميل"><i class="fa-solid fa-cart-plus"></i></button>
                        <a href="https://wa.me/${waPhone}" target="_blank" class="bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366] hover:text-white w-8 h-8 rounded-xl text-sm flex items-center justify-center transition-all" title="مراسلة واتساب"><i class="fa-brands fa-whatsapp"></i></a>
                    </div>
                </td>
            </tr>`;
        }).join('');

        if (remCusts > 0) {
            rowsHtml += `
            <tr>
                <td colspan="5" class="p-3 text-center bg-slate-50">
                    <button type="button" onclick="window.customersRenderLimit = (window.customersRenderLimit || 50) + 50; renderCustomersTableUI();" class="w-full py-2.5 bg-white hover:bg-indigo-50 text-indigo-600 font-black text-xs rounded-xl border border-dashed border-indigo-300 shadow-sm transition-all">
                        <i class="fa-solid fa-angles-down mr-1"></i> عرض المزيد من العملاء (متبقي ${remCusts} عميل)
                    </button>
                </td>
            </tr>`;
        }

        tbEl.innerHTML = rowsHtml;
    };

    window.filterCustomers = function () {
        window.renderCustomersTableUI();
    };

    // فتح نافذة إنشاء طلب جديد مع تعبئة بيانات العميل فوراً
    window.safeOpenAddOrderModalForCustomer = function (phone) {
        if (typeof closeModal === 'function') closeModal('customer-modal');
        if (typeof window.safeOpenAddOrderModal === 'function') {
            window.safeOpenAddOrderModal();
        } else if (typeof openModal === 'function') {
            openModal('add-order-modal');
        }
        setTimeout(() => {
            const pInp = document.getElementById('no-phone');
            if (pInp) {
                pInp.value = phone;
                if (typeof window.checkCustomerExists === 'function') window.checkCustomerExists();
            }
        }, 80);
    };

    // 🔄 ميزة تكرار آخر طلب أو أي طلب سابق للعميل بضغطة زر واحدة (1-Tap Re-Order)
    window.repeatLastOrderForCustomer = function (phone, specificOrderId = null) {
        const normP = safeNormPhone(phone);
        const intel = window._customerIntelMap[normP] || window.buildCustomerIntelligenceMap()[normP];
        let targetOrder = null;

        if (specificOrderId) {
            targetOrder = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === specificOrderId);
        } else if (intel && intel.lastOrderObj) {
            targetOrder = intel.lastOrderObj;
        }

        if (!targetOrder || !Array.isArray(targetOrder.items) || targetOrder.items.length === 0) {
            return window.safeOpenAddOrderModalForCustomer(phone);
        }

        if (typeof closeModal === 'function') closeModal('customer-modal');
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        if (typeof openModal === 'function') openModal('add-order-modal');

        setTimeout(() => {
            const pInp = document.getElementById('no-phone');
            const nInp = document.getElementById('no-name');
            const zInp = document.getElementById('no-zone');
            const aInp = document.getElementById('no-address');

            if (pInp) pInp.value = targetOrder.customerPhone || phone;
            if (nInp) nInp.value = targetOrder.customerName || '';
            if (zInp) zInp.value = targetOrder.zone || '';
            if (aInp) aInp.value = targetOrder.customerAddress || '';
            if (typeof window.autoSetDeliveryPrice === 'function') window.autoSetDeliveryPrice();
            if (typeof window.checkCustomerExists === 'function') window.checkCustomerExists();

            // تصفير جميع الخانات أولاً ثم تعبئة أصناف الطلب السابق
            Object.keys(typeof storeProducts !== 'undefined' ? storeProducts : {}).forEach(id => {
                const qEl = document.getElementById(`no-q-${id}`);
                if (qEl) qEl.value = '';
                if (typeof window.styleNewOrderItemCard === 'function') window.styleNewOrderItemCard(id, 0);
            });

            let filledCount = 0;
            targetOrder.items.forEach(item => {
                let pId = item.id;
                if (!pId && typeof storeProducts !== 'undefined') {
                    const cleanName = (item.name || '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
                    pId = Object.keys(storeProducts).find(k => storeProducts[k]?.name === cleanName);
                }
                if (pId && storeProducts[pId] && !storeProducts[pId].isWeightBased) {
                    const qEl = document.getElementById(`no-q-${pId}`);
                    if (qEl) {
                        qEl.value = item.quantity;
                        filledCount++;
                        if (typeof window.styleNewOrderItemCard === 'function') window.styleNewOrderItemCard(pId, item.quantity);
                        // فتح درج الأصناف الإضافية إن كان الصنف بداخله
                        const drawer = document.getElementById('no-unpinned-items-drawer');
                        if (drawer && drawer.contains(qEl)) drawer.classList.remove('hidden');
                    }
                }
            });

            if (typeof window.calcTotal === 'function') window.calcTotal('no');
            if (typeof window.showToast === 'function') {
                window.showToast(`🔄 تم استنساخ طلب (${targetOrder.customerName}) بـ ${filledCount} أصناف جاهزة للحفظ!`);
            }
        }, 120);
    };

    // =========================================================================
    // 📕 رابعاً: مركز إدارة وتحصيل المديونيات التفاعلي السريع (#view-debts)
    // =========================================================================
    window.quickSettleCustomerDebt = async function (phone, mode = 'full') {
        if (!phone) return;
        const normP = safeNormPhone(phone);
        const c = customersData.find(x => safeNormPhone(x.phone) === normP);
        const currentDebt = c ? (Number(c.debt) || 0) : 0;
        const custName = c ? (c.name || phone) : phone;

        if (mode === 'choose') {
            const ch = prompt(`📕 إدارة مديونية العميل (${custName})\nالمديونية الحالية: ${currentDebt} ج.م\n\nاختر الإجراء:\n1 = ✅ تسديد المبلغ بالكامل (${currentDebt} ج)\n2 = 💵 تسديد جزء من المبلغ\n3 = ➕ إضافة مديونية جديدة على العميل`, '1');
            if (!ch) return;
            if (ch.trim() === '1') mode = 'full';
            else if (ch.trim() === '2') mode = 'partial';
            else if (ch.trim() === '3') mode = 'add';
            else return;
        }

        let deltaAmount = 0;
        let actionLogText = '';

        if (mode === 'full') {
            if (currentDebt <= 0) return alert('لا توجد مديونية مسجلة على هذا العميل!');
            if (!confirm(`✅ هل تؤكد استلام مبلغ (${currentDebt} ج.م) بالكامل من العميل (${custName}) وتصفير مديونيته؟`)) return;
            deltaAmount = -currentDebt;
            actionLogText = `سداد كامل المديونية بمبلغ ${currentDebt} ج`;
        } else if (mode === 'partial') {
            const paidStr = prompt(`المديونية الحالية على (${custName}): ${currentDebt} ج\n\nأدخل المبلغ الذي سدده العميل الآن:`, '');
            if (!paidStr) return;
            const paidVal = parseInt(paidStr);
            if (isNaN(paidVal) || paidVal <= 0) return alert('برجاء إدخال مبلغ صحيح!');
            if (paidVal > currentDebt) return alert('المبلغ المدخل أكبر من المديونية الحالية!');
            deltaAmount = -paidVal;
            actionLogText = `سداد جزء من المديونية بمبلغ ${paidVal} ج (المتبقي: ${currentDebt - paidVal} ج)`;
        } else if (mode === 'add') {
            const addStr = prompt(`أدخل المبلغ المراد إضافته كمديونية جديدة على العميل (${custName}):`, '');
            if (!addStr) return;
            const addVal = parseInt(addStr);
            if (isNaN(addVal) || addVal <= 0) return alert('برجاء إدخال مبلغ صحيح!');
            deltaAmount = addVal;
            actionLogText = `إضافة مديونية جديدة بمبلغ ${addVal} ج`;
        }

        try {
            const cleanPhoneDb = normP.startsWith('0') ? normP : '0' + normP;
            const noteEntry = {
                id: 'debt_' + Date.now(),
                text: `[${new Date().toLocaleDateString('ar-EG')}] ${actionLogText}.`,
                type: 'note',
                timestamp: Date.now()
            };

            await db.collection('customers').doc(cleanPhoneDb).set({
                phone: cleanPhoneDb,
                name: custName,
                debt: firebase.firestore.FieldValue.increment(deltaAmount),
                timelineNotes: firebase.firestore.FieldValue.arrayUnion(noteEntry)
            }, { merge: true });

            if (mode === 'full') {
                const debtOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => safeNormPhone(o.customerPhone) === normP && Number(o.debt) > 0);
                for (const ord of debtOrders) {
                    ord.debt = 0;
                    db.collection('orders').doc(ord.id).update({ debt: 0 }).catch(() => {});
                }
            }

            if (c) c.debt = Math.max(0, currentDebt + deltaAmount);
            const modalEl = document.getElementById('customer-modal');
            if (modalEl && !modalEl.classList.contains('hidden')) {
                window.openCustomerCard(cleanPhoneDb);
            }

            window.refreshCustomersData();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم تحديث حساب (${custName}) بنجاح!`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء تحديث المديونية!');
        }
    };

    window.sendDebtReminderWhatsApp = function (phone) {
        const normP = safeNormPhone(phone);
        const c = customersData.find(x => safeNormPhone(x.phone) === normP);
        if (!c || !(Number(c.debt) > 0)) return alert('لا توجد مديونية مسجلة على هذا العميل!');

        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const msg = `أهلاً بحضرتك يا ${c.name || 'فندم'} 🌹\nنتمنى تكون بخير وبأفضل حال.\n\nتذكير بسيط من حسابات "سمان ههيا" بوجود رصيد متبقي في الحساب بقيمة: *${c.debt} ج.م*\n\nيمكنك تحويله في أي وقت مناسب لحضرتك على فودافون كاش / إنستاباي على الرقم:\n*${storePhone}*\nأو مع المندوب في طلبك القادم إن شاء الله.\nشكراً لذوقك وتعاملك معنا 🤍`;

        const waPhone = normP.startsWith('0') ? '2' + normP : normP;
        window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    window.openAddStandaloneDebtPrompt = async function () {
        const phoneInput = prompt('📕 تسجيل مديونية سريعة على عميل:\n\nأدخل رقم موبايل العميل:');
        if (!phoneInput) return;
        const normP = safeNormPhone(phoneInput);
        if (normP.length < 10) return alert('برجاء إدخال رقم موبايل صحيح!');

        let c = customersData.find(x => safeNormPhone(x.phone) === normP);
        let custName = c ? c.name : '';
        if (!custName) {
            custName = prompt('هذا الرقم غير مسجل بالأرشيف، اكتب اسم العميل:') || 'عميل';
        }

        const amountStr = prompt(`أدخل مبلغ المديونية المتبقي على (${custName}) بالجنيه:`);
        if (!amountStr) return;
        const amount = parseInt(amountStr);
        if (isNaN(amount) || amount <= 0) return alert('برجاء إدخال مبلغ صحيح!');

        const cleanPhoneDb = normP.startsWith('0') ? normP : '0' + normP;
        try {
            await db.collection('customers').doc(cleanPhoneDb).set({
                name: custName,
                phone: cleanPhoneDb,
                debt: firebase.firestore.FieldValue.increment(amount),
                timelineNotes: firebase.firestore.FieldValue.arrayUnion({
                    id: 'debt_' + Date.now(),
                    text: `[${new Date().toLocaleDateString('ar-EG')}] تسجيل مديونية بمبلغ ${amount} ج.`,
                    type: 'note',
                    timestamp: Date.now()
                })
            }, { merge: true });

            window.refreshCustomersData();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم تسجيل مديونية (${amount} ج) على ${custName}`);
        } catch (e) {
            alert('حدث خطأ أثناء الحفظ!');
        }
    };

    window.renderDebtsUI = function () {
        const tbody = document.getElementById('debts-tbody');
        if (!tbody) return;

        const debtsHeader = document.querySelector('#view-debts > div:first-child');
        if (debtsHeader && !document.getElementById('btn-quick-add-debt')) {
            const btn = document.createElement('button');
            btn.id = 'btn-quick-add-debt';
            btn.onclick = window.openAddStandaloneDebtPrompt;
            btn.className = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 shrink-0';
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> تسجيل مديونية على عميل';
            debtsHeader.appendChild(btn);
        }

        const searchTerm = (document.getElementById('search-debts')?.value || '').toLowerCase().trim();
        let totalMarketDebt = 0;

        let indebtedCustomers = customersData.filter(c => (Number(c.debt) || 0) > 0);
        indebtedCustomers.forEach(c => { totalMarketDebt += (Number(c.debt) || 0); });

        if (searchTerm) {
            indebtedCustomers = indebtedCustomers.filter(c =>
                (c.name || '').toLowerCase().includes(searchTerm) ||
                (c.phone || '').includes(searchTerm) ||
                (c.zone || '').toLowerCase().includes(searchTerm)
            );
        }

        indebtedCustomers.sort((a, b) => (Number(b.debt) || 0) - (Number(a.debt) || 0));

        let html = '';
        indebtedCustomers.forEach(c => {
            const currentDebt = Number(c.debt) || 0;
            const cNormPhone = safeNormPhone(c.phone);
            const debtOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => safeNormPhone(o.customerPhone) === cNormPhone && Number(o.debt) > 0);

            let debtSourcesHtml = '';
            if (debtOrders.length > 0) {
                debtSourcesHtml = '<div class="mt-1.5 flex flex-wrap gap-1">';
                debtOrders.forEach(o => {
                    debtSourcesHtml += `<span onclick="openOrderTracking('${o.id}')" class="bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1 cursor-pointer hover:bg-red-600 hover:text-white transition-all shadow-sm"><i class="fa-solid fa-link"></i> أوردر (${o.orderDate}) باقي: ${o.debt} ج</span>`;
                });
                debtSourcesHtml += '</div>';
            } else {
                debtSourcesHtml = '<div class="mt-1"><span class="bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold">مسجل في رصيد العميل</span></div>';
            }

            html += `
            <tr class="hover:bg-red-50/30 transition-colors border-b border-slate-100">
                <td class="py-4 px-6 align-top">
                    <div class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary transition-colors" onclick="openCustomerCard('${c.phone}')">${c.name || 'عميل غير مسجل'}</div>
                    <div class="text-[11px] text-slate-500 font-bold mt-0.5" dir="ltr">${c.phone}</div>
                    ${debtSourcesHtml}
                </td>
                <td class="py-4 px-6 text-center font-bold text-slate-600 text-xs align-middle">${c.zone || '<span class="text-slate-300">غير مسجل</span>'}</td>
                <td class="py-4 px-6 text-center align-middle">
                    <span class="bg-red-50 text-red-700 px-3.5 py-1.5 rounded-xl font-black text-base shadow-sm border border-red-200 inline-block min-w-[90px] text-center">${currentDebt.toLocaleString()} ج</span>
                </td>
                <td class="py-4 px-6 text-center align-middle">
                    <div class="flex flex-wrap items-center justify-center gap-1.5">
                        <button onclick="quickSettleCustomerDebt('${c.phone}', 'full')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1" title="استلام كامل المبلغ وتصفير المديونية"><i class="fa-solid fa-check-double"></i> سداد كامل</button>
                        <button onclick="quickSettleCustomerDebt('${c.phone}', 'partial')" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1" title="تسديد جزء من المديونية"><i class="fa-solid fa-coins"></i> سداد جزء</button>
                        <button onclick="sendDebtReminderWhatsApp('${c.phone}')" class="bg-[#25D366] hover:bg-green-600 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1" title="إرسال تذكير لطيف عبر واتساب"><i class="fa-brands fa-whatsapp"></i> مطالبة</button>
                        <button onclick="openCustomerCard('${c.phone}')" class="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm" title="فتح ملف وكشف حساب العميل"><i class="fa-solid fa-folder-open"></i></button>
                    </div>
                </td>
            </tr>`;
        });

        if (indebtedCustomers.length === 0) {
            html = `<tr><td colspan="4" class="text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem] m-4">الحمد لله.. لا توجد مديونيات متأخرة في السوق حالياً.</td></tr>`;
        }

        tbody.innerHTML = html;

        const debtTotalEl = document.getElementById('total-market-debt');
        if (debtTotalEl) debtTotalEl.innerText = totalMarketDebt.toLocaleString();
    };

    // =========================================================================
    // 👤 خامساً: مركز قيادة ملف العميل الشامل 360° (#customer-modal)
    // =========================================================================
    window.adjustCustomerPointsManually = async function (phone) {
        const normP = safeNormPhone(phone);
        const c = customersData.find(x => safeNormPhone(x.phone) === normP);
        const curPts = c ? (Number(c.walletPoints) || 0) : 0;

        const newPtsStr = prompt(`🪙 تعديل رصيد نقاط الولاء للعميل (${c?.name || phone}):\nالرصيد الحالي: ${curPts} نقطة\n\nأدخل الرصيد الإجمالي الجديد للنقاط:`, curPts);
        if (newPtsStr === null || newPtsStr.trim() === '') return;
        const newPts = parseInt(newPtsStr);
        if (isNaN(newPts) || newPts < 0) return alert('برجاء إدخال رقم صحيح!');

        try {
            const cleanPhoneDb = normP.startsWith('0') ? normP : '0' + normP;
            await db.collection('customers').doc(cleanPhoneDb).set({ walletPoints: newPts }, { merge: true });
            if (c) c.walletPoints = newPts;
            window.openCustomerCard(phone);
            window.refreshCustomersData();
            if (typeof window.showToast === 'function') window.showToast(`🪙 تم تحديث نقاط العميل إلى ${newPts} نقطة`);
        } catch (e) {
            alert('حدث خطأ أثناء تعديل النقاط!');
        }
    };

    // إرسال إشعار برصيد نقاط الولاء والكاش باك للعميل عبر واتساب
    window.sendCustomerPointsWhatsApp = function (phone, name, pts, cashVal) {
        const normP = safeNormPhone(phone);
        const waPhone = normP.startsWith('0') ? '2' + normP : normP;
        const msg = `أهلاً بحضرتك يا ${name || 'فندم'} في *سمان ههيا* 🌹\n\nيسعدنا إبلاغك بأن رصيد محفظة نقاط الولاء الخاص بحضرتك لدينا هو:\n🪙 *${pts} نقطة* (تساوي خصم نقدي فوري بقيمة *${cashVal} ج.م* على طلبك القادم!).\n\nاطلب في أي وقت من متجرنا أو عبر الواتساب واستمتع بالخصم فوراً 🤍`;
        window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // فتح وتبديل محرر بيانات العميل الأساسي داخل ملف العميل (الاسم، المنطقة، العنوان)
    window.toggleCustomerProfileEditForm = function () {
        const formBox = document.getElementById('cm-inline-profile-editor');
        if (formBox) formBox.classList.toggle('hidden');
    };

    window.saveCustomerProfileBasicInfo = async function (origPhone) {
        const normP = safeNormPhone(origPhone);
        const cleanPhoneDb = normP.startsWith('0') ? normP : '0' + normP;
        const newName = (document.getElementById('cm-edit-name-inp')?.value || '').trim();
        const newZone = (document.getElementById('cm-edit-zone-inp')?.value || '').trim();
        const newAddr = (document.getElementById('cm-edit-addr-inp')?.value || '').trim();

        if (!newName) return alert('برجاء كتابة اسم العميل!');

        try {
            await db.collection('customers').doc(cleanPhoneDb).set({
                name: newName,
                phone: cleanPhoneDb,
                zone: newZone,
                address: newAddr
            }, { merge: true });

            // تحديث البيانات في الذاكرة وفي الطلبات الحية المرتبطة بالعميل
            const c = customersData.find(x => safeNormPhone(x.phone) === normP);
            if (c) {
                c.name = newName;
                c.zone = newZone;
                c.address = newAddr;
            }

            const batch = db.batch();
            let updatedOrdersCount = 0;
            (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
                if (o && safeNormPhone(o.customerPhone) === normP) {
                    o.customerName = newName;
                    if (newZone) o.zone = newZone;
                    if (newAddr) o.customerAddress = newAddr;
                    if (!['completed', 'canceled', 'trash'].includes(o.status) && updatedOrdersCount < 50) {
                        batch.update(db.collection('orders').doc(o.id), {
                            customerName: newName,
                            zone: newZone || o.zone || '',
                            customerAddress: newAddr || o.customerAddress || ''
                        });
                        updatedOrdersCount++;
                    }
                }
            });
            if (updatedOrdersCount > 0) await batch.commit().catch(() => {});

            window.openCustomerCard(cleanPhoneDb);
            window.renderCustomersTableUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.showToast === 'function') window.showToast('✅ تم حفظ وتحديث بيانات العميل وعنوانه بنجاح!');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ بيانات العميل!');
        }
    };

    // التبديل السريع بين أقسام ملف العميل الشامل 360° لمنع التمرير الطويل
    window.switchCustomerModalSection = function (secName) {
        window.custFilterState.modalSection = secName;
        ['all', 'orders', 'trust_info', 'notebook'].forEach(s => {
            const btn = document.getElementById('cm-tab-btn-' + s);
            if (btn) {
                btn.className = (s === secName)
                    ? 'px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all whitespace-nowrap'
                    : 'px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all whitespace-nowrap';
            }
        });

        const modalBody = document.querySelector('#customer-modal .overflow-y-auto');
        if (!modalBody) return;

        const addressCard = document.getElementById('cm-address')?.closest('.bg-white');
        const trustCard = document.getElementById('cm-trust-rating')?.closest('.bg-white');
        const notebookCard = document.getElementById('cm-notebook')?.closest('.bg-amber-50\\/80') || document.getElementById('cm-notebook')?.parentElement;
        const addNoteCard = document.getElementById('cm-new-note')?.closest('.bg-white');
        const timelineWrap = document.getElementById('cm-timeline-list')?.parentElement;

        const showAll = (secName === 'all');
        if (addressCard) addressCard.classList.toggle('hidden', !(showAll || secName === 'trust_info'));
        if (trustCard) trustCard.classList.toggle('hidden', !(showAll || secName === 'trust_info'));
        if (notebookCard) notebookCard.classList.toggle('hidden', !(showAll || secName === 'notebook'));
        if (addNoteCard) addNoteCard.classList.toggle('hidden', !(showAll || secName === 'notebook'));
        if (timelineWrap) timelineWrap.classList.toggle('hidden', !(showAll || secName === 'orders' || secName === 'notebook'));
    };

    window.openCustomerCard = async function (phone) {
        if (typeof openModal === 'function') openModal('customer-modal');

        // توسيع نافذة ملف العميل لتبدو كلوحة قيادة بريميوم 360°
        const modalInner = document.querySelector('#customer-modal > div');
        if (modalInner) {
            modalInner.classList.remove('max-w-2xl');
            modalInner.classList.add('max-w-4xl');
        }

        const normTarget = safeNormPhone(phone);
        const intelMap = window.buildCustomerIntelligenceMap();
        const inf = intelMap[normTarget] || {};

        let c = customersData.find(x => safeNormPhone(x.phone) === normTarget);
        if (!c) {
            c = {
                name: inf.name || 'عميل',
                phone: phone,
                zone: inf.zone || '',
                address: inf.address || '',
                ordersCount: (inf.completedOrders || 0) + (inf.activeOrders || 0),
                totalSpent: inf.realTotalSpent || 0,
                debt: 0,
                walletPoints: 0
            };
        }

        const displayOrdersCount = Math.max(Number(c.ordersCount) || 0, (inf.completedOrders || 0) + (inf.activeOrders || 0));
        const displaySpent = Math.max(Number(c.totalSpent) || 0, inf.realTotalSpent || 0);
        const displayDebt = Number(c.debt) || 0;
        const displayPts = Number(c.walletPoints) || 0;
        const ptVal = Number(storeSettings?.pointValueInEGP) || 0.40;
        const ptsCash = Math.round(displayPts * ptVal);
        const avgOrderVal = displayOrdersCount > 0 ? Math.round(displaySpent / displayOrdersCount) : 0;
        const daysSinceLast = inf.lastOrderMs ? Math.floor((Date.now() - inf.lastOrderMs) / (1000 * 60 * 60 * 24)) : null;

        document.getElementById('cm-name').innerHTML = `
            <span class="inline-flex flex-wrap items-center gap-2">
                <span>${c.name || 'غير مسجل'}</span>
                ${window.getCustomerTrustBadgeHTML ? window.getCustomerTrustBadgeHTML(c) : ''}
                <button type="button" onclick="toggleCustomerProfileEditForm()" class="bg-slate-100 hover:bg-slate-800 text-slate-600 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors" title="تعديل اسم وعنوان ومنطقة العميل">
                    <i class="fa-solid fa-user-pen ml-1"></i> تعديل البيانات
                </button>
            </span>
        `;
        document.getElementById('cm-phone').innerText = c.phone || phone;
        document.getElementById('cm-address').innerText = (c.zone ? c.zone + ' - ' : '') + (c.address || 'لم يتم تسجيل عنوان تفصيلي');
        document.getElementById('cm-ltv').innerText = `${displaySpent.toLocaleString()} ج`;
        document.getElementById('cm-orders').innerText = displayOrdersCount;
        document.getElementById('cm-debt').innerText = `${displayDebt} ج`;

        document.getElementById('cm-btn-wa').href = `https://wa.me/${(c.phone || '').startsWith('0') ? '2' + c.phone : c.phone}`;
        document.getElementById('cm-btn-call').href = `tel:${c.phone}`;
        document.getElementById('cm-notebook').value = c.notebook || '';

        if (typeof window.populateCustomerTrustModal === 'function') {
            window.populateCustomerTrustModal(c);
        }

        // 1. حقن شريط التبويبات السريع وأزرار الإجراءات الفورية ومحرر البيانات في أعلى نافذة ملف العميل
        const startOrderBtn = document.querySelector('#customer-modal button[onclick*="startOrderForCustomer"]');
        if (startOrderBtn && startOrderBtn.parentElement) {
            startOrderBtn.classList.add('hidden'); // نستبدله بشريط الإجراءات المزدوج الأقوى

            let topControlHub = document.getElementById('cm-360-top-hub');
            if (!topControlHub) {
                topControlHub = document.createElement('div');
                topControlHub.id = 'cm-360-top-hub';
                topControlHub.className = 'space-y-3';
                startOrderBtn.parentElement.insertBefore(topControlHub, startOrderBtn);
            }

            let zoneOptionsHtml = `<option value="${c.zone || ''}">${c.zone || '-- اختر المنطقة --'}</option>`;
            (storeSettings?.deliveryZones || []).forEach(z => {
                if (z.name && z.name !== c.zone) {
                    zoneOptionsHtml += `<option value="${z.name}">${z.name} (${z.price} ج)</option>`;
                }
            });

            const safeNameForJs = (c.name || '').replace(/'/g, "\\'");

            topControlHub.innerHTML = `
                <!-- فورم تعديل بيانات العميل المباشر (مخفي افتراضياً ويفتح بضغطة زر) -->
                <div id="cm-inline-profile-editor" class="hidden bg-slate-900 text-white p-4 rounded-2xl shadow-lg space-y-3 border border-slate-700">
                    <div class="flex justify-between items-center border-b border-white/10 pb-2">
                        <span class="text-xs font-black text-amber-300"><i class="fa-solid fa-user-pen ml-1"></i> تعديل البيانات الأساسية للعميل</span>
                        <button type="button" onclick="toggleCustomerProfileEditForm()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">اسم العميل</label>
                            <input type="text" id="cm-edit-name-inp" value="${c.name || ''}" class="w-full bg-slate-800 border border-slate-600 rounded-xl p-2 text-xs font-black text-white outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">المنطقة</label>
                            <select id="cm-edit-zone-inp" class="w-full bg-slate-800 border border-slate-600 rounded-xl p-2 text-xs font-black text-amber-300 outline-none">${zoneOptionsHtml}</select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">العنوان التفصيلي</label>
                            <input type="text" id="cm-edit-addr-inp" value="${c.address || ''}" class="w-full bg-slate-800 border border-slate-600 rounded-xl p-2 text-xs font-bold text-white outline-none">
                        </div>
                    </div>
                    <button type="button" onclick="saveCustomerProfileBasicInfo('${c.phone}')" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2 rounded-xl text-xs shadow-md transition-all">
                        💾 حفظ التعديلات وتحديث الأرشيف والطلبات
                    </button>
                </div>

                <!-- أزرار الطلب السريع وتكرار آخر طلب -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button type="button" onclick="startOrderForCustomer()" class="bg-brand-primary hover:bg-emerald-800 text-white py-3 px-4 rounded-xl font-black text-xs sm:text-sm shadow-md shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <i class="fa-solid fa-cart-plus text-amber-300"></i> إنشاء أوردر جديد لهذا العميل
                    </button>
                    <button type="button" onclick="repeatLastOrderForCustomer('${c.phone}')" class="${inf.lastOrderObj ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' : 'bg-slate-200 text-slate-500 cursor-not-allowed'} py-3 px-4 rounded-xl font-black text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95" ${inf.lastOrderObj ? '' : 'disabled'}>
                        <i class="fa-solid fa-rotate-right"></i> تكرار آخر طلب بضغطة واحدة ${inf.lastOrderObj ? `(${inf.lastOrderObj.total} ج)` : ''}
                    </button>
                </div>

                <!-- لوحة البصمة الشرائية والحمض النووي للعميل (360° DNA) -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 rounded-2xl shadow-md space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                        <span class="text-xs font-black text-amber-300"><i class="fa-solid fa-dna ml-1"></i> البصمة الشرائية الشاملة للعميل (Customer 360° DNA)</span>
                        <span class="text-[10px] bg-white/10 text-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                            ${daysSinceLast !== null ? (daysSinceLast === 0 ? '🟢 طلب اليوم' : `🕒 آخر طلب منذ ${daysSinceLast} يوم (${inf.lastOrderDateStr})`) : 'لا توجد طلبات سابقة'}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div class="bg-white/10 p-2.5 rounded-xl border border-white/10">
                            <span class="text-[9px] text-slate-300 font-bold block">إجمالي أطباق السمان</span>
                            <span class="text-sm sm:text-base font-black text-emerald-300">${Number((inf.totalQuailPlates || 0).toFixed(1))} طبق</span>
                        </div>
                        <div class="bg-white/10 p-2.5 rounded-xl border border-white/10">
                            <span class="text-[9px] text-slate-300 font-bold block">متوسط قيمة الفاتورة</span>
                            <span class="text-sm sm:text-base font-black text-amber-300">${avgOrderVal.toLocaleString()} ج.م</span>
                        </div>
                        <div class="bg-white/10 p-2.5 rounded-xl border border-white/10">
                            <span class="text-[9px] text-slate-300 font-bold block">الصنف المفضل الأول</span>
                            <span class="text-xs font-black text-sky-300 truncate block mt-0.5">${inf.favoriteItem || 'غير محدد'}</span>
                        </div>
                        <div class="bg-white/10 p-2.5 rounded-xl border border-white/10">
                            <span class="text-[9px] text-slate-300 font-bold block">طريقة الدفع المعتادة</span>
                            <span class="text-[11px] font-black text-purple-200 block mt-0.5">${inf.preferredPayment || 'كاش'}</span>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] font-black pt-1 text-slate-300">
                        <span>📊 تفصيل الطلبات: <strong class="text-emerald-400">✅ ${inf.completedOrders || 0} مكتمل</strong> • <strong class="text-amber-300">⏳ ${inf.activeOrders || 0} حي الآن</strong> • <strong class="text-rose-400">❌ ${inf.canceledOrders || 0} ملغي</strong></span>
                        ${inf.totalDiscountsTaken > 0 ? `<span class="text-amber-200">🎁 إجمالي خصومات حصل عليها: ${inf.totalDiscountsTaken} ج</span>` : ''}
                    </div>
                </div>

                <!-- شريط تبويبات التنقل السريع داخل ملف العميل -->
                <div class="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1">
                    <button type="button" id="cm-tab-btn-all" onclick="switchCustomerModalSection('all')" class="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all whitespace-nowrap">🌐 عرض الملف بالكامل</button>
                    <button type="button" id="cm-tab-btn-orders" onclick="switchCustomerModalSection('orders')" class="px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all whitespace-nowrap">🛒 سجل الطلبات والفواتير (${displayOrdersCount})</button>
                    <button type="button" id="cm-tab-btn-trust_info" onclick="switchCustomerModalSection('trust_info')" class="px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all whitespace-nowrap">🛡️ العنوان والثقة والأرقام</button>
                    <button type="button" id="cm-tab-btn-notebook" onclick="switchCustomerModalSection('notebook')" class="px-3 py-1.5 rounded-xl text-xs font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all whitespace-nowrap">📒 الكشكول والملاحظات</button>
                </div>
            `;
        }

        // 2. تحديث شريط أزرار المديونية ومحفظة النقاط المباشر
        const debtCardEl = document.getElementById('cm-debt')?.closest('.grid');
        if (debtCardEl && debtCardEl.parentElement) {
            let dnaBar = document.getElementById('cm-smart-dna-actions');
            if (!dnaBar) {
                dnaBar = document.createElement('div');
                dnaBar.id = 'cm-smart-dna-actions';
                dnaBar.className = 'mt-4 pt-4 border-t border-slate-100 space-y-3';
                debtCardEl.parentElement.appendChild(dnaBar);
            }

            const safeNameForJs = (c.name || '').replace(/'/g, "\\'");

            dnaBar.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-2 bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 text-xs font-black">
                    <div>
                        <span>🪙 رصيد محفظة الولاء: <strong class="text-amber-700 text-sm">${displayPts} نقطة</strong> (تساوي خصم <strong class="text-emerald-700">${ptsCash} ج.م</strong>)</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${displayPts > 0 ? `<button type="button" onclick="sendCustomerPointsWhatsApp('${c.phone}', '${safeNameForJs}', ${displayPts}, ${ptsCash})" class="bg-[#25D366] hover:bg-green-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm"><i class="fa-brands fa-whatsapp"></i> إرسال الرصيد للعميل</button>` : ''}
                        <button type="button" onclick="adjustCustomerPointsManually('${c.phone}')" class="bg-white border border-amber-300 text-amber-900 hover:bg-amber-500 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors">تعديل النقاط</button>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button type="button" onclick="quickSettleCustomerDebt('${c.phone}', 'add')" class="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"><i class="fa-solid fa-plus"></i> إضافة دين</button>
                    <button type="button" onclick="quickSettleCustomerDebt('${c.phone}', 'choose')" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"><i class="fa-solid fa-check-double"></i> سداد مديونية</button>
                    <button type="button" onclick="sendDebtReminderWhatsApp('${c.phone}')" class="bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"><i class="fa-brands fa-whatsapp text-emerald-600"></i> مطالبة بالدين</button>
                </div>
            `;
        }

        // 3. جلب كل الطلبات الخاصة بالعميل (بالرقم الأساسي أو البديل أو الإضافي) وعرضها بتفاصيل شاملة مكشوفة
        const allKnownNormPhones = new Set([
            normTarget,
            safeNormPhone(c.phone2),
            ...(c.altPhones || []).map(p => safeNormPhone(p))
        ].filter(Boolean));

        let orders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => {
            if (!o || o.status === 'trash') return false;
            const op1 = safeNormPhone(o.customerPhone);
            const op2 = safeNormPhone(o.customerPhone2);
            return (op1 && allKnownNormPhones.has(op1)) || (op2 && allKnownNormPhones.has(op2));
        });

        if (orders.length === 0 && typeof db !== 'undefined') {
            try {
                const snap = await db.collection('orders').where('customerPhone', '==', c.phone).get();
                snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
            } catch (e) {}
        }

        const tlDiv = document.getElementById('cm-timeline-list');
        const targetSelect = document.getElementById('cm-note-target');
        targetSelect.innerHTML = '<option value="general">إضافة كملاحظة عامة على بروفايل العميل</option>';

        orders.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)).forEach(o => {
            targetSelect.innerHTML += `<option value="${o.id}">ربط بأوردر يوم ${o.orderDate} (${o.total}ج)</option>`;
        });

        let timeline = [];
        if (c.timelineNotes && Array.isArray(c.timelineNotes)) {
            timeline = [...c.timelineNotes];
        } else if (c.adminNotes) {
            timeline.push({ id: 'old_note', text: c.adminNotes, date: 'ملاحظة سابقة', type: 'general', timestamp: 1 });
        }

        orders.forEach(o => {
            timeline.push({ id: o.id, type: 'order', dateStr: o.orderDate, timestamp: (o.createdAt?.toMillis() || 0), data: o });
        });
        timeline.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (timeline.length === 0) {
            tlDiv.innerHTML = '<div class="w-full text-center py-8 text-slate-400 font-bold border border-dashed border-slate-200 rounded-xl bg-white">لا يوجد سجل تاريخي أو طلبات سابقة لهذا العميل حتى الآن.</div>';
        } else {
            tlDiv.innerHTML = timeline.map((item, index) => {
                if (item.type === 'general' || item.type === 'note') {
                    let dStr = item.date || (item.timestamp > 1000 ? new Date(item.timestamp).toLocaleString('ar-EG') : 'ملاحظة مسجلة');
                    return `
                    <div class="relative mb-4 pl-3">
                        <span class="absolute -right-[21px] top-3 w-3 h-3 bg-amber-400 border-4 border-white rounded-full shadow-sm"></span>
                        <div class="bg-amber-50/40 border border-amber-200/80 p-3.5 rounded-2xl shadow-sm">
                            <div class="flex justify-between items-center mb-1.5">
                                <span class="text-xs font-black text-amber-800"><i class="fa-solid fa-thumbtack mr-1"></i> ملاحظة في سجل العميل</span>
                                <span class="text-[10px] text-slate-400 font-bold">${dStr}</span>
                            </div>
                            <p class="text-xs font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">${item.text}</p>
                            <div class="mt-2 pt-2 border-t border-amber-200/50 flex gap-3">
                                <button onclick="editTimelineNote('${c.phone}', '${item.id}')" class="text-[10px] text-blue-600 hover:text-blue-800 font-black"><i class="fa-solid fa-pen"></i> تعديل</button>
                                <button onclick="deleteTimelineNote('${c.phone}', '${item.id}')" class="text-[10px] text-red-500 hover:text-red-700 font-black"><i class="fa-solid fa-trash"></i> حذف</button>
                            </div>
                        </div>
                    </div>`;
                } else {
                    let o = item.data;
                    let itemsPillsHtml = (o.items && o.items.length > 0)
                        ? o.items.map(i => `<span class="bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1 rounded-xl text-xs font-black inline-flex items-center gap-1"><strong class="text-brand-primary">${i.quantity}x</strong> ${i.name} <span class="text-[10px] text-slate-500">(${i.price}ج)</span></span>`).join('')
                        : '<span class="text-xs text-slate-400">لا توجد تفاصيل أصناف</span>';

                    let statusAr = o.status === 'new' ? '🆕 جديد' : (o.status === 'processing' ? '⏳ قيد التجهيز' : (o.status === 'dispatched' ? '🛵 في الطريق' : (o.status === 'deferred' ? '📅 مؤجل' : (o.status === 'no_answer' ? '📵 لم يتم الرد' : (o.status === 'completed' ? '✅ مكتمل' : '❌ ملغي')))));
                    let statusColor = o.status === 'new' ? 'text-blue-700 bg-blue-50 border-blue-200' : (o.status === 'processing' ? 'text-amber-800 bg-amber-50 border-amber-200' : (o.status === 'completed' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : (o.status === 'dispatched' ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-rose-700 bg-rose-50 border-rose-200')));

                    const batchTitle = (typeof window.resolveOrderBatchName === 'function')
                        ? window.resolveOrderBatchName(o)
                        : ((o.batchName && o.batchName !== 'undefined') ? o.batchName : '');

                    const payBadge = o.paymentMethod === 'online'
                        ? '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg text-[10px] font-black">💳 خالص أونلاين</span>'
                        : (o.paymentMethod === 'split'
                            ? `<span class="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-lg text-[10px] font-black">⚖️ نص ونص (${o.paidCash || 0} كاش + ${o.paidOnline || 0} محفظة)</span>`
                            : '<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-black">💵 كاش</span>');

                    const noteHtml = (o.adminNote || o.driverNote) ? `
                        <div class="mt-2 bg-amber-50/70 border border-amber-200/70 rounded-xl p-2.5 text-[11px] font-bold text-amber-900 space-y-1">
                            ${o.adminNote ? `<div><i class="fa-solid fa-lock text-amber-600 ml-1"></i> <strong>إداري:</strong> ${o.adminNote.replace(/\n---\n/g, ' | ')}</div>` : ''}
                            ${o.driverNote ? `<div><i class="fa-solid fa-motorcycle text-blue-600 ml-1"></i> <strong>للمندوب:</strong> ${o.driverNote.replace(/\n---\n/g, ' | ')}</div>` : ''}
                        </div>` : '';

                    return `
                    <div class="relative mb-4 pl-3 group">
                        <span class="absolute -right-[21px] top-4 w-3.5 h-3.5 ${o.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'} border-4 border-white rounded-full shadow-sm"></span>
                        <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:border-brand-primary transition-all p-4 space-y-2.5">
                            <!-- رأس كارت الطلب داخل ملف العميل -->
                            <div class="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-100">
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="text-xs font-black px-2.5 py-0.5 rounded-lg border ${statusColor}">${statusAr}</span>
                                    <span class="text-xs font-black text-slate-700">📅 ${o.orderDate || ''}</span>
                                    ${batchTitle ? `<span class="bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-lg text-[10px] font-black"><i class="fa-solid fa-layer-group ml-1"></i>${batchTitle}</span>` : '<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[10px] font-bold">طلب فوري</span>'}
                                    ${o.driverName ? `<span class="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg text-[10px] font-black">🛵 ${o.driverName}</span>` : ''}
                                    ${payBadge}
                                    ${Number(o.debt) > 0 ? `<span class="bg-red-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black">📕 آجل: ${o.debt} ج</span>` : ''}
                                </div>
                                <div class="text-left">
                                    <span class="font-black text-brand-primary text-base sm:text-lg">${o.total || 0} <span class="text-xs">ج.م</span></span>
                                    <span class="block text-[10px] font-bold text-slate-400">(${o.subtotal || o.total || 0} منتجات + ${o.deliveryFee || 0} شحن${o.discount > 0 ? ` - ${o.discount} خصم` : ''})</span>
                                </div>
                            </div>

                            <!-- الأصناف مكشوفة بالكامل بدون الحاجة لضغط إضافي -->
                            <div class="flex flex-wrap gap-1.5">
                                ${itemsPillsHtml}
                            </div>

                            ${noteHtml}

                            <!-- أزرار التحكم المباشر في الطلب من داخل ملف العميل -->
                            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                <span class="text-[10px] font-bold text-slate-400"><i class="fa-solid fa-location-dot ml-1"></i> ${o.zone || ''} ${o.customerAddress ? ' - ' + o.customerAddress : ''}</span>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <button type="button" onclick="repeatLastOrderForCustomer('${c.phone}', '${o.id}')" class="bg-amber-50 hover:bg-amber-500 text-amber-900 hover:text-white border border-amber-200 px-2.5 py-1 rounded-xl text-[10px] font-black transition-colors flex items-center gap-1">
                                        <i class="fa-solid fa-rotate-right"></i> تكرار هذا الطلب
                                    </button>
                                    <button type="button" onclick="closeModal('customer-modal'); printSingleOrderWaybill('${o.id}');" class="bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white px-2.5 py-1 rounded-xl text-[10px] font-black transition-colors flex items-center gap-1">
                                        <i class="fa-solid fa-print"></i> بوليصة
                                    </button>
                                    <button type="button" onclick="closeModal('customer-modal'); openEditOrderModal('${o.id}');" class="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded-xl text-[10px] font-black transition-colors flex items-center gap-1">
                                        <i class="fa-solid fa-pen"></i> فتح وتعديل
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            }).join('');
        }

        window.switchCustomerModalSection('all');

        if (typeof window.renderAltPhonesList === 'function') {
            window.renderAltPhonesList(c.phone);
        }
    };

    // تهيئة شريط العملاء عند التحميل
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            window.initSmartCustomersToolbar();
            setTimeout(() => window.renderCustomersTableUI(), 500);
        });
    } else {
        window.initSmartCustomersToolbar();
        setTimeout(() => window.renderCustomersTableUI(), 500);
    }
})();
