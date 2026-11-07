// =========================================================================
// 👥 المحرك المستقل لإدارة العملاء، المديونيات، البلاك ليست، ونقاط الولاء (www/customers.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// =========================================================================

(function () {
    // 1. حالة الفلاتر والفرز في شاشة أرشيف العملاء
    window.custFilterState = {
        segment: 'all',      // 'all' | 'vip' | 'dormant' | 'debt' | 'points' | 'new' | 'risk'
        zone: 'all',         // 'all' | zoneName
        sortBy: 'spent_desc' // 'spent_desc' | 'orders_desc' | 'debt_desc' | 'recent_desc'
    };

    // خريطة الذكاء التحليلي للعملاء المحسوبة من الطلبات الحية
    window._customerIntelMap = {};

    function safeNormPhone(p) {
        if (!p) return '';
        return typeof window.normalizePhone === 'function' ? window.normalizePhone(p) : String(p).replace(/\D/g, '');
    }

    // =========================================================================
    // 🧠 أولاً: محرك تحليل بيانات وسلوك كل عميل من الطلبات (Customer DNA Engine)
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
                    lastOrderMs: 0,
                    lastOrderDateStr: '',
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

            if (ordMs >= rec.lastOrderMs) {
                rec.lastOrderMs = ordMs;
                rec.lastOrderDateStr = o.orderDate || (ordMs ? new Date(ordMs).toLocaleDateString('en-US') : '');
            }

            if (o.status === 'completed') {
                rec.completedOrders++;
                rec.realTotalSpent += (Number(o.total) || 0);
                if (Array.isArray(o.items)) {
                    o.items.forEach(i => {
                        const cleanName = (i.name || '').replace(/\(.*?\)/g, '').trim();
                        if (cleanName) {
                            rec.itemsCountMap[cleanName] = (rec.itemsCountMap[cleanName] || 0) + (Number(i.quantity) || 0);
                        }
                    });
                }
            } else if (o.status === 'canceled') {
                rec.canceledOrders++;
            } else {
                rec.activeOrders++;
            }
        });

        // تحديد الصنف المفضل لكل عميل
        Object.values(intel).forEach(rec => {
            const itemsKeys = Object.keys(rec.itemsCountMap);
            if (itemsKeys.length > 0) {
                itemsKeys.sort((a, b) => rec.itemsCountMap[b] - rec.itemsCountMap[a]);
                rec.favoriteItem = itemsKeys[0];
            } else {
                rec.favoriteItem = '';
            }
        });

        window._customerIntelMap = intel;
        return intel;
    };

    // =========================================================================
    // 🎛️ ثانياً: شريط الفلترة والتقسيم الذكي في شاشة أرشيف العملاء
    // =========================================================================

    window.initSmartCustomersToolbar = function () {
        const custView = document.getElementById('view-customers');
        if (!custView || document.getElementById('smart-customers-toolbar')) return;

        const topSearchCard = custView.firstElementChild;
        if (!topSearchCard) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'smart-customers-toolbar';
        toolbar.className = 'mb-4 space-y-2.5 shrink-0';

        toolbar.innerHTML = `
            <!-- أزرار تقسيم شرائح العملاء + فلتر المنطقة والترتيب -->
            <div class="bg-white p-3.5 rounded-2xl shadow-soft border border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-1.5">
                    <button onclick="setCustomerSegmentFilter('all')" id="cf-seg-all" class="cust-seg-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-sm transition-all">👥 كل العملاء</button>
                    <button onclick="setCustomerSegmentFilter('vip')" id="cf-seg-vip" class="cust-seg-btn bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all">💎 كبار العملاء VIP</button>
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

    // =========================================================================
    // 🔄 ثالثاً: تحديث وبناء جدول أرشيف العملاء الذكي
    // =========================================================================

    window.refreshCustomersData = function () {
        if (typeof db === 'undefined') return;
        db.collection('customers').get().then(snap => {
            const rawMap = {};
            snap.forEach(doc => {
                const d = doc.data() || {};
                const normP = safeNormPhone(d.phone || doc.id);
                if (normP) {
                    rawMap[normP] = { ...d, phone: d.phone || doc.id };
                }
            });

            // دمج أي عميل له طلبات في allOrdersRaw ولم يكن له مستند في customers بعد
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

            let dashCust = document.getElementById('dash-customers');
            if (dashCust) dashCust.innerText = customersData.length;

            window.renderCustomersTableUI();
            window.renderDebtsUI();
            if (typeof window.renderBlacklistUI === 'function') window.renderBlacklistUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
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

        // تحديث قائمة المناطق في الفلتر
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

        // تجهيز البيانات المدمجة لكل عميل
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

            return {
                raw: c,
                normPhone: normP,
                name: c.name || inf.name || 'عميل',
                phone: c.phone || inf.phone || '',
                zone: c.zone || inf.zone || '',
                address: c.address || inf.address || '',
                ordersCount: calcOrders,
                totalSpent: calcSpent,
                debt: debtVal,
                walletPoints: ptsVal,
                lastOrderMs: lastMs,
                lastOrderDateStr: inf.lastOrderDateStr || '',
                favoriteItem: inf.favoriteItem || '',
                isVip,
                isDormant,
                isRisk
            };
        });

        // قراءة نص البحث
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

        // تطبيق الفلترة
        const filtered = enrichedList.filter(item => {
            if (seg === 'vip' && !item.isVip) return false;
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

        // الترتيب
        const sortBy = window.custFilterState.sortBy;
        filtered.sort((a, b) => {
            if (sortBy === 'orders_desc') return b.ordersCount - a.ordersCount;
            if (sortBy === 'debt_desc') return b.debt - a.debt;
            if (sortBy === 'recent_desc') return b.lastOrderMs - a.lastOrderMs;
            return b.totalSpent - a.totalSpent;
        });

        // تحديث إحصائيات الشريط الأسود
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

        tbEl.innerHTML = filtered.map(item => {
            const c = item.raw;
            const location = (item.zone ? item.zone : '') + (item.address ? ' - ' + item.address : '');
            const stickyHtml = c.stickyNote ? `<div class="text-[10px] text-yellow-900 font-black mt-1 max-w-[230px] truncate mx-auto bg-yellow-200/80 px-2 py-0.5 rounded border border-yellow-400" title="${c.stickyNote}"><i class="fa-solid fa-thumbtack text-yellow-700"></i> ${c.stickyNote}</div>` : '';
            const details = c.notebook ? `<div class="text-[10px] text-amber-600 font-bold mt-1 max-w-[200px] truncate mx-auto bg-amber-50 px-2 py-0.5 rounded" title="${c.notebook}"><i class="fa-solid fa-book"></i> ${c.notebook}</div>` : '';
            const trustBadge = window.getCustomerTrustBadgeHTML ? window.getCustomerTrustBadgeHTML(c) : '';

            // شارة المديونية التفاعلية (تفتح السداد بضغطة واحدة)
            const debtBadgeHtml = item.debt > 0
                ? `<span onclick="event.stopPropagation(); quickSettleCustomerDebt('${item.phone}', 'choose')" class="cursor-pointer bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded-md text-[10px] font-black inline-flex items-center gap-1 shadow-sm transition-transform hover:scale-105" title="اضغط لتسديد أو تعديل مديونية العميل فوراً">📕 عليه ${item.debt} ج</span>`
                : '';

            // شارة نقاط المحفظة
            const ptsCash = Math.round(item.walletPoints * pointVal);
            const pointsBadgeHtml = item.walletPoints > 0
                ? `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[9px] font-black">🪙 ${item.walletPoints} نقطة (${ptsCash} ج)</span>`
                : '';

            // معلومات الحمض النووي (الصنف المفضل + آخر طلب)
            let dnaSubLine = '';
            if (item.favoriteItem || item.lastOrderMs) {
                const daysAgo = item.lastOrderMs ? Math.floor((nowMs - item.lastOrderMs) / (1000 * 60 * 60 * 24)) : null;
                const lastStr = daysAgo !== null ? (daysAgo === 0 ? 'اليوم' : `منذ ${daysAgo} يوم`) : '';
                dnaSubLine = `<div class="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-bold text-slate-400">
                    ${item.favoriteItem ? `<span class="text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">🥩 يفضل: ${item.favoriteItem}</span>` : ''}
                    ${lastStr ? `<span class="${daysAgo > 20 ? 'text-rose-500' : 'text-slate-400'}">🕒 آخر طلب: ${lastStr}</span>` : ''}
                </div>`;
            }

            const waPhone = (item.phone || '').startsWith('0') ? '2' + item.phone : item.phone;

            return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 customer-row ${c.isBlacklisted ? 'bg-red-50/40' : ''}">
                <td class="py-3.5 px-5">
                    <div class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary transition-colors flex flex-wrap items-center gap-1.5" onclick="openCustomerCard('${item.phone}')">
                        <span>${item.name}</span>
                        ${trustBadge}
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
                    <span class="block text-[9px] text-slate-400 font-bold">طلب</span>
                </td>
                <td class="py-3.5 px-5 text-center">
                    <span class="font-black text-emerald-600 text-base">${item.totalSpent.toLocaleString()} <span class="text-[10px]">ج</span></span>
                    ${item.ordersCount > 0 ? `<span class="block text-[9px] text-slate-400 font-bold">متوسط: ${Math.round(item.totalSpent / item.ordersCount)} ج</span>` : ''}
                </td>
                <td class="py-3.5 px-5 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openCustomerCard('${item.phone}')" class="bg-indigo-50 text-indigo-600 px-3.5 py-2 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm">الملف والأرشيف</button>
                        <button onclick="openModal('add-order-modal'); document.getElementById('no-phone').value='${item.phone}'; checkCustomerExists();" class="bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white w-8 h-8 rounded-xl text-xs flex items-center justify-center transition-all" title="إنشاء أوردر سريع لهذا العميل"><i class="fa-solid fa-cart-plus"></i></button>
                        <a href="https://wa.me/${waPhone}" target="_blank" class="bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366] hover:text-white w-8 h-8 rounded-xl text-sm flex items-center justify-center transition-all" title="مراسلة واتساب"><i class="fa-brands fa-whatsapp"></i></a>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };

    window.filterCustomers = function () {
        window.renderCustomersTableUI();
    };

    // =========================================================================
    // 📕 رابعاً: مركز إدارة وتحصيل المديونيات التفاعلي السريع (#view-debts)
    // =========================================================================

    // دالة سريعة لتسديد أو تعديل مديونية أي عميل بضغطة واحدة من أي مكان في الموقع
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

            // إذا تم السداد الكامل، نصفر حقل debt في الطلبات القديمة الخاصة به حتى لا تظل معلقة
            if (mode === 'full') {
                const debtOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => safeNormPhone(o.customerPhone) === normP && Number(o.debt) > 0);
                for (const ord of debtOrders) {
                    ord.debt = 0;
                    db.collection('orders').doc(ord.id).update({ debt: 0 }).catch(() => {});
                }
            }

            if (c) c.debt = Math.max(0, currentDebt + deltaAmount);
            if (document.getElementById('cm-debt') && !document.getElementById('customer-modal').classList.contains('hidden')) {
                document.getElementById('cm-debt').innerText = Math.max(0, currentDebt + deltaAmount) + ' ج';
            }

            window.refreshCustomersData();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم تحديث حساب (${custName}) بنجاح!`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء تحديث المديونية!');
        }
    };

    // إرسال رسالة تذكير لطيفة بالمديونية عبر واتساب
    window.sendDebtReminderWhatsApp = function (phone) {
        const normP = safeNormPhone(phone);
        const c = customersData.find(x => safeNormPhone(x.phone) === normP);
        if (!c || !(Number(c.debt) > 0)) return alert('لا توجد مديونية مسجلة على هذا العميل!');

        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const msg = `أهلاً بحضرتك يا ${c.name || 'فندم'} 🌹\nنتمنى تكون بخير وبأفضل حال.\n\nتذكير بسيط من حسابات "سمان ههيا" بوجود رصيد متبقي في الحساب بقيمة: *${c.debt} ج.م*\n\nيمكنك تحويله في أي وقت مناسب لحضرتك على فودافون كاش / إنستاباي على الرقم:\n*${storePhone}*\nأو مع المندوب في طلبك القادم إن شاء الله.\nشكراً لذوقك وتعاملك معنا 🤍`;

        const waPhone = normP.startsWith('0') ? '2' + normP : normP;
        window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // إضافة مديونية سريعة لعميل من داخل شاشة المديونيات
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

        // إضافة زر "+ تسجيل مديونية سريعة" في رأس شاشة المديونيات إن لم يكن موجوداً
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
    // 👤 خامساً: نافذة ملف العميل الفورية المطورة (#customer-modal)
    // =========================================================================

    // تعديل رصيد نقاط الولاء للعميل يدوياً عند الحاجة
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

    window.openCustomerCard = async function (phone) {
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

        document.getElementById('cm-name').innerText = c.name || 'غير مسجل';
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

        // إضافة شريط أزرار التحكم المباشر في المديونية والنقاط والحمض النووي (واضح على الموبايل والكمبيوتر بدون ماوس)
        const debtCardEl = document.getElementById('cm-debt')?.closest('.grid');
        if (debtCardEl && debtCardEl.parentElement) {
            let dnaBar = document.getElementById('cm-smart-dna-actions');
            if (!dnaBar) {
                dnaBar = document.createElement('div');
                dnaBar.id = 'cm-smart-dna-actions';
                dnaBar.className = 'mt-4 pt-4 border-t border-slate-100 space-y-3';
                debtCardEl.parentElement.appendChild(dnaBar);
            }

            dnaBar.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/70 text-xs font-black">
                    <span>🪙 محفظة الولاء: <strong class="text-amber-600">${displayPts} نقطة</strong> (تساوي ${ptsCash} ج)</span>
                    ${inf.favoriteItem ? `<span class="text-teal-700">🥩 الصنف المفضل: ${inf.favoriteItem}</span>` : ''}
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button type="button" onclick="quickSettleCustomerDebt('${c.phone}', 'add')" class="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"><i class="fa-solid fa-plus"></i> إضافة دين</button>
                    <button type="button" onclick="quickSettleCustomerDebt('${c.phone}', 'choose')" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"><i class="fa-solid fa-check-double"></i> سداد مديونية</button>
                    <button type="button" onclick="adjustCustomerPointsManually('${c.phone}')" class="bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white border border-amber-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"><i class="fa-solid fa-coins"></i> تعديل النقاط</button>
                </div>
            `;
        }

        // جلب الطلبات فوراً من الذاكرة الحية (شامل الرقم الأساسي والبديل والأرقام الإضافية)
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

        // في حال لم تكن الطلبات محملة في الذاكرة بعد، نجلبها من فايربيس كاحتياط
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
            tlDiv.innerHTML = '<div class="w-full text-center py-6 text-slate-400 font-bold border border-dashed border-slate-200 rounded-xl bg-white">لا يوجد سجل تاريخي لهذا العميل.</div>';
        } else {
            tlDiv.innerHTML = timeline.map((item, index) => {
                if (item.type === 'general' || item.type === 'note') {
                    let dStr = item.date || (item.timestamp > 1000 ? new Date(item.timestamp).toLocaleString('ar-EG') : 'ملاحظة مسجلة');
                    return `
                    <div class="relative mb-6 pl-4">
                        <span class="absolute -right-[21px] top-1 w-3 h-3 bg-amber-400 border-4 border-white rounded-full shadow-sm"></span>
                        <div class="bg-white border border-slate-100 p-4 rounded-xl shadow-soft">
                            <div class="flex justify-between items-center mb-2"><span class="text-xs font-black text-amber-600"><i class="fa-solid fa-thumbtack mr-1"></i> ملاحظة إدارية</span><span class="text-[9px] text-slate-400 font-bold">${dStr}</span></div>
                            <p class="text-xs font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">${item.text}</p>
                            <div class="mt-3 pt-2 border-t border-slate-50 flex gap-3">
                                <button onclick="editTimelineNote('${c.phone}', '${item.id}')" class="text-[10px] text-blue-500 hover:text-blue-700 font-black transition-colors"><i class="fa-solid fa-pen"></i> تعديل</button>
                                <button onclick="deleteTimelineNote('${c.phone}', '${item.id}')" class="text-[10px] text-red-400 hover:text-red-600 font-black transition-colors"><i class="fa-solid fa-trash"></i> حذف</button>
                            </div>
                        </div>
                    </div>`;
                } else {
                    let o = item.data;
                    let itemsHtml = o.items && o.items.length > 0 ? o.items.map(i => `<div class="flex justify-between text-[11px] font-bold text-slate-600 border-b border-slate-50 py-2 last:border-0"><span class="flex items-center gap-1.5"><span class="bg-slate-100 text-slate-500 px-1.5 rounded">${i.quantity}x</span> ${i.name}</span><span class="text-slate-400">${i.price * i.quantity} ج</span></div>`).join('') : '<p class="text-xs text-slate-400">لا توجد تفاصيل</p>';
                    let statusAr = o.status === 'new' ? 'جديد' : (o.status === 'processing' ? 'قيد التجهيز' : (o.status === 'dispatched' ? 'في الطريق' : (o.status === 'deferred' ? 'مؤجل' : (o.status === 'no_answer' ? 'لم يتم الرد' : (o.status === 'completed' ? 'مكتمل' : 'ملغي')))));
                    let statusColor = o.status === 'new' ? 'text-blue-600 bg-blue-50 border-blue-100' : (o.status === 'processing' ? 'text-amber-600 bg-amber-50 border-amber-100' : (o.status === 'completed' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-50 border-slate-200'));
                    let noteHtml = o.adminNote ? `<div class="mt-3 bg-amber-50/50 border border-amber-100/50 rounded-xl p-3 text-xs font-bold text-amber-800 leading-relaxed"><i class="fa-solid fa-pen-to-square text-amber-400 mr-1"></i> <strong>ملاحظات الأوردر:</strong><br>${o.adminNote}</div>` : '';

                    return `
                    <div class="relative mb-6 pl-4 group">
                        <span class="absolute -right-[21px] top-4 w-3 h-3 bg-brand-primary border-4 border-white rounded-full shadow-sm"></span>
                        <div class="bg-white rounded-2xl border border-slate-100 shadow-soft overflow-hidden transition-all hover:shadow-md">
                            <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50/80 transition-colors" onclick="toggleOrderDetails('cm-order-details-${index}', 'cm-icon-${index}')">
                                <div class="flex flex-col gap-1.5">
                                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider"><i class="fa-solid fa-box text-slate-300 mr-1"></i> أوردر | ${o.orderDate || ''} ${o.batchName && o.batchName !== 'undefined' ? '• ' + o.batchName : ''}</span>
                                    <span class="text-[10px] font-black px-2.5 py-0.5 rounded-lg border ${statusColor} w-max">${statusAr}</span>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-left font-black text-brand-primary text-base">${o.total} <span class="text-xs">ج</span></div>
                                    <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100"><i id="cm-icon-${index}" class="fa-solid fa-chevron-down text-slate-400 text-xs transition-transform duration-300"></i></div>
                                </div>
                            </div>
                            <div id="cm-order-details-${index}" class="hidden border-t border-slate-50 bg-slate-50/30 p-4">
                                <div class="bg-white border border-slate-100 rounded-xl p-3 mb-2">${itemsHtml}</div>
                                ${noteHtml}
                                <div class="mt-2 flex justify-end">
                                    <button onclick="closeModal('customer-modal'); openEditOrderModal('${o.id}');" class="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-black"><i class="fa-solid fa-pen mr-1"></i> فتح وتعديل الأوردر</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            }).join('');
        }

        if (typeof window.renderAltPhonesList === 'function') {
            window.renderAltPhonesList(c.phone);
        }
        if (typeof openModal === 'function') openModal('customer-modal');
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
