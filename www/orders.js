// =========================================================================
// ⚡ المحرك السريع للطلبات الحية، الفلترة الذكية، والتحضير (www/orders.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - نسخة الأداء الفائق والوضوح الكامل
// =========================================================================

(function () {
    // 1. حالة الفلاتر السريعة للطلبات الحية
    window.ordersFilterState = {
        zone: 'all',
        batch: 'all',
        driver: 'all',
        payment: 'all',   // all | cash | online | split | debt
        special: 'all',   // all | vip | high_value | has_notes
        compactMode: false,
        filtersExpanded: false
    };

    window.ordersRenderLimit = 25;
    let _lastDropdownOrdersCount = -1;

    // =========================================================================
    // 🎨 2. تلوين أزرار حالات الطلبات (مكتمل / تجهيز / جديد...) بألوان قوية وواضحة جداً
    // =========================================================================
    const TAB_ACTIVE_STYLES = {
        all:        { btn: 'bg-slate-900 text-white border-slate-900 shadow-md scale-[1.03]',      badge: 'bg-amber-400 text-slate-950' },
        new:        { btn: 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.03]',        badge: 'bg-white text-blue-700' },
        processing: { btn: 'bg-amber-500 text-slate-950 border-amber-500 shadow-md scale-[1.03]',  badge: 'bg-slate-900 text-amber-300' },
        dispatched: { btn: 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.03]',    badge: 'bg-white text-indigo-700' },
        deferred:   { btn: 'bg-orange-600 text-white border-orange-600 shadow-md scale-[1.03]',    badge: 'bg-white text-orange-700' },
        no_answer:  { btn: 'bg-purple-600 text-white border-purple-600 shadow-md scale-[1.03]',    badge: 'bg-white text-purple-700' },
        completed:  { btn: 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.03]',  badge: 'bg-white text-emerald-800' },
        canceled:   { btn: 'bg-rose-600 text-white border-rose-600 shadow-md scale-[1.03]',        badge: 'bg-white text-rose-700' }
    };

    const TAB_INACTIVE_BADGES = {
        new:        'bg-blue-100 text-blue-700',
        processing: 'bg-amber-100 text-amber-800',
        dispatched: 'bg-indigo-100 text-indigo-700',
        deferred:   'bg-orange-100 text-orange-700',
        no_answer:  'bg-purple-100 text-purple-700',
        completed:  'bg-emerald-100 text-emerald-700',
        canceled:   'bg-slate-200 text-slate-700'
    };

    window.applyCrispOrderTabsVisuals = function (activeTabName) {
        const current = activeTabName || (typeof currentOrderTab !== 'undefined' ? currentOrderTab : 'all');
        const allTabs = ['all', 'new', 'processing', 'dispatched', 'deferred', 'no_answer', 'completed', 'canceled'];

        allTabs.forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            const badge = document.getElementById(`badge-${t}`);
            if (!btn) return;

            if (t === current) {
                const st = TAB_ACTIVE_STYLES[t] || TAB_ACTIVE_STYLES.all;
                btn.className = `order-tab active whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-black border-2 transition-transform ${st.btn}`;
                if (badge) {
                    badge.className = `mr-1 px-1.5 py-0.5 rounded-md text-[10px] font-black ${st.badge}`;
                }
            } else {
                btn.className = 'order-tab whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-black bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors';
                if (badge) {
                    badge.className = `mr-1 px-1.5 py-0.5 rounded-md text-[10px] font-black ${TAB_INACTIVE_BADGES[t] || 'bg-slate-100 text-slate-600'}`;
                }
            }
        });
    };

    // ترقية دالة التبديل بين تبويبات الطلبات لتعمل بسرعة البرق وبلون واضح جداً
    window.setOrderTab = function (tab) {
        currentOrderTab = tab;
        window.ordersRenderLimit = 25;
        window.applyCrispOrderTabsVisuals(tab);
        window.renderOrdersList();
    };

    // دالة مساعدة لحساب عمر الطلب الزمني
    function getOrderRelativeAge(o) {
        let ms = 0;
        if (o.createdAt && typeof o.createdAt.toMillis === 'function') {
            ms = o.createdAt.toMillis();
        } else if (o.orderDate) {
            const d = new Date(o.orderDate);
            if (!isNaN(d.getTime())) ms = d.getTime();
        }
        if (!ms) return '';

        const diffMin = Math.floor((Date.now() - ms) / 60000);
        if (diffMin < 1) return 'الآن';
        if (diffMin < 60) return `منذ ${diffMin} د`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `منذ ${diffHours} س`;
        const diffDays = Math.floor(diffHours / 24);
        return `منذ ${diffDays} يوم`;
    }

    // تنسيق اسم الصنف الموزون بشكل نظيف ومقروء
    function formatOrderItemBadgeClean(item) {
        const rawName = String(item.name || 'صنف').trim();
        const bracketMatch = rawName.match(/^(.*?)\s*\[(.*?)\]\s*(?:\((.*?)\))?$/);
        if (bracketMatch) {
            const baseTitle = bracketMatch[1].trim();
            const countKgInfo = bracketMatch[2].trim();
            const gramsInfo = bracketMatch[3] ? bracketMatch[3].trim() : '';
            return {
                isWeighted: true,
                mainText: `${baseTitle} (${countKgInfo})`,
                subGrams: gramsInfo
            };
        }
        return {
            isWeighted: false,
            mainText: `${item.quantity}x ${rawName}`,
            subGrams: ''
        };
    }

    // استرجاع أو خصم أوزان الفرخات بالجرام من مصفوفة المخزن عند الإلغاء أو الإعادة
    function syncOrderWeighedItemsWithMatrix(order, mode = 'restore') {
        if (!order || !Array.isArray(order.items) || typeof storeProducts === 'undefined') return false;
        let matrixChanged = false;

        order.items.forEach(item => {
            const p = storeProducts[item.id];
            if (!p || !p.isWeightBased || !item.name) return;
            const match = String(item.name).match(/\(([^)]*)\s*جم\)/);
            if (!match || !match[1]) return;

            const orderGrams = (typeof window.parseWeightsArray === 'function')
                ? window.parseWeightsArray(match[1])
                : match[1].split('+').map(x => parseFloat(x.trim())).filter(n => !isNaN(n) && n > 0);

            if (orderGrams.length === 0) return;

            let currentMatrix = (typeof window.parseWeightsArray === 'function')
                ? window.parseWeightsArray(p.weightsList)
                : [];

            if (mode === 'restore') {
                orderGrams.forEach(g => currentMatrix.push(g));
                matrixChanged = true;
            } else if (mode === 'deduct') {
                orderGrams.forEach(g => {
                    const idx = currentMatrix.indexOf(g);
                    if (idx !== -1) currentMatrix.splice(idx, 1);
                });
                matrixChanged = true;
            }

            if (matrixChanged) {
                p.weightsList = currentMatrix.join(' ');
                if (typeof storeStock !== 'undefined') {
                    storeStock[item.id] = currentMatrix.length;
                }
            }
        });

        return matrixChanged;
    }

    // =========================================================================
    // 🎛️ 3. بناء شريط الملخص المالي والفلاتر المدمج
    // =========================================================================
    window.safeOpenAddOrderModal = function () {
        if (typeof window.generateDynamicOrderInputs === 'function') {
            window.generateDynamicOrderInputs();
        }
        if (typeof window.openModal === 'function') {
            window.openModal('add-order-modal');
        } else {
            document.getElementById('add-order-modal')?.classList.remove('hidden');
        }
    };

    window.initSmartOrdersToolbar = function () {
        const ordersView = document.getElementById('view-orders');
        if (!ordersView || document.getElementById('smart-orders-toolbar')) return;

        const topWrap = ordersView.firstElementChild;
        if (!topWrap) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'smart-orders-toolbar';
        toolbar.className = 'space-y-2';

        toolbar.innerHTML = `
            <div class="bg-slate-900 text-white px-3.5 py-2 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-2 text-[11px] font-black">
                <div class="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span>📦 المعروض: <strong id="so-count-orders" class="text-amber-400">0</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>🥩 الصافي: <strong id="so-sum-net" class="text-emerald-400">0 ج</strong></span>
                    <span class="text-slate-600 hidden sm:inline">|</span>
                    <span class="hidden sm:inline">💰 الإجمالي: <strong id="so-sum-total" class="text-white">0 ج</strong></span>
                    <span class="text-slate-600 hidden md:inline">|</span>
                    <span class="hidden md:inline">🛵 الشحن: <strong id="so-sum-delivery" class="text-indigo-300">0 ج</strong></span>
                    <span id="so-debt-pill" class="hidden bg-red-500/20 text-red-300 border border-red-400/30 px-2 py-0.5 rounded-md">📕 آجل: <strong id="so-sum-debt">0 ج</strong></span>
                </div>
                <div class="flex items-center gap-1.5 mr-auto sm:mr-0">
                    <button type="button" onclick="toggleAdvancedFiltersDrawer()" id="so-btn-toggle-filters" class="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1">
                        <i class="fa-solid fa-sliders text-amber-400"></i> <span>فلاتر متقدمة</span>
                        <span id="so-active-filters-dot" class="hidden w-2 h-2 rounded-full bg-amber-400"></span>
                    </button>
                    <button type="button" onclick="toggleCompactOrdersMode()" id="so-btn-compact" class="bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1">
                        <i class="fa-solid fa-compress"></i> <span>وضع مضغوط</span>
                    </button>
                </div>
            </div>

            <div id="so-advanced-filters-drawer" class="hidden bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
                <select id="so-filter-zone" onchange="setOrdersQuickFilter('zone', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-slate-700 outline-none">
                    <option value="all">📍 كل المناطق</option>
                </select>

                <select id="so-filter-batch" onchange="setOrdersQuickFilter('batch', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-teal-800 outline-none">
                    <option value="all">🐣 كل الدفعات</option>
                </select>

                <select id="so-filter-driver" onchange="setOrdersQuickFilter('driver', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-indigo-800 outline-none">
                    <option value="all">🛵 كل المناديب</option>
                </select>

                <select id="so-filter-payment" onchange="setOrdersQuickFilter('payment', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-emerald-800 outline-none">
                    <option value="all">💳 كل طرق الدفع</option>
                    <option value="cash">💵 كاش عند الاستلام</option>
                    <option value="online">💳 خالص (فيزا / محفظة)</option>
                    <option value="split">⚖️ نص ونص (كاش + محفظة)</option>
                    <option value="debt">📕 عليه باقي حساب (آجل)</option>
                </select>

                <select id="so-filter-special" onchange="setOrdersQuickFilter('special', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-amber-800 outline-none">
                    <option value="all">⭐ كل الطلبات</option>
                    <option value="vip">💎 عملاء VIP فقط</option>
                    <option value="high_value">🔥 طلبات كبرى (+500 ج)</option>
                    <option value="has_notes">📝 طلبات بها ملاحظات</option>
                </select>

                <button type="button" onclick="resetAllOrdersFilters()" id="so-btn-reset" class="hidden mr-auto bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg text-[10px] font-black">
                    <i class="fa-solid fa-filter-circle-xmark mr-1"></i> مسح الفلاتر
                </button>
            </div>
        `;

        topWrap.insertBefore(toolbar, topWrap.firstChild);
    };

    window.toggleAdvancedFiltersDrawer = function () {
        window.ordersFilterState.filtersExpanded = !window.ordersFilterState.filtersExpanded;
        if (window.ordersFilterState.filtersExpanded) {
            window.refreshOrdersToolbarDropdowns(true);
        }
        const drawer = document.getElementById('so-advanced-filters-drawer');
        const btn = document.getElementById('so-btn-toggle-filters');
        if (drawer) drawer.classList.toggle('hidden', !window.ordersFilterState.filtersExpanded);
        if (btn) {
            btn.className = window.ordersFilterState.filtersExpanded
                ? 'bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/15 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1';
        }
    };

    window.setOrdersQuickFilter = function (key, val) {
        window.ordersFilterState[key] = val;
        window.ordersRenderLimit = 25;
        const hasActive = ['zone', 'batch', 'driver', 'payment', 'special'].some(k => window.ordersFilterState[k] !== 'all');
        document.getElementById('so-btn-reset')?.classList.toggle('hidden', !hasActive);
        document.getElementById('so-active-filters-dot')?.classList.toggle('hidden', !hasActive);
        window.renderOrdersList();
    };

    window.toggleCompactOrdersMode = function () {
        window.ordersFilterState.compactMode = !window.ordersFilterState.compactMode;
        const btn = document.getElementById('so-btn-compact');
        if (btn) {
            if (window.ordersFilterState.compactMode) {
                btn.className = 'bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm';
                btn.innerHTML = '<i class="fa-solid fa-expand"></i> <span>عرض الكروت الكاملة</span>';
            } else {
                btn.className = 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1';
                btn.innerHTML = '<i class="fa-solid fa-compress"></i> <span>وضع مضغوط</span>';
            }
        }
        window.renderOrdersList();
    };

    window.resetAllOrdersFilters = function () {
        window.ordersFilterState.zone = 'all';
        window.ordersFilterState.batch = 'all';
        window.ordersFilterState.driver = 'all';
        window.ordersFilterState.payment = 'all';
        window.ordersFilterState.special = 'all';
        window.ordersRenderLimit = 25;

        ['zone', 'batch', 'driver', 'payment', 'special'].forEach(k => {
            const el = document.getElementById(`so-filter-${k}`);
            if (el) el.value = 'all';
        });
        const searchBox = document.getElementById('search-order');
        if (searchBox) searchBox.value = '';
        document.getElementById('so-btn-reset')?.classList.add('hidden');
        document.getElementById('so-active-filters-dot')?.classList.add('hidden');
        window.renderOrdersList();
    };

    window.refreshOrdersToolbarDropdowns = function (forceRebuild = false) {
        const ordersArray = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        if (!forceRebuild && _lastDropdownOrdersCount === ordersArray.length) return;
        _lastDropdownOrdersCount = ordersArray.length;

        const zSel = document.getElementById('so-filter-zone');
        const bSel = document.getElementById('so-filter-batch');
        const dSel = document.getElementById('so-filter-driver');
        if (!zSel || !bSel || !dSel) return;

        const zonesSet = new Set();
        const batchesSet = new Set();
        const driversSet = new Set();

        (storeSettings?.deliveryZones || []).forEach(z => { if (z?.name) zonesSet.add(z.name.trim()); });
        (storeSettings?.drivers || []).forEach(d => { if (d?.name) driversSet.add(d.name.trim()); });
        Object.values(storeBatches || {}).forEach(b => { if (b?.name && b.name !== 'undefined') batchesSet.add(b.name.trim()); });

        ordersArray.forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (o.zone) zonesSet.add(o.zone.trim());
            if (o.driverName) driversSet.add(o.driverName.trim());
            const bName = (typeof window.resolveOrderBatchName === 'function') ? window.resolveOrderBatchName(o) : (o.batchName || '');
            if (bName && bName !== 'undefined') batchesSet.add(bName.trim());
        });

        const curZ = window.ordersFilterState.zone;
        let zHtml = `<option value="all">📍 كل المناطق</option>`;
        Array.from(zonesSet).forEach(z => { zHtml += `<option value="${z}" ${curZ === z ? 'selected' : ''}>📍 ${z}</option>`; });
        zSel.innerHTML = zHtml;

        const curB = window.ordersFilterState.batch;
        let bHtml = `<option value="all">🐣 كل الدفعات</option><option value="__NONE__" ${curB === '__NONE__' ? 'selected' : ''}>⚡ طلبات فورية (بدون دفعة)</option>`;
        Array.from(batchesSet).forEach(b => { bHtml += `<option value="${b}" ${curB === b ? 'selected' : ''}>🐣 ${b}</option>`; });
        bSel.innerHTML = bHtml;

        const curD = window.ordersFilterState.driver;
        let dHtml = `<option value="all">🛵 كل المناديب</option><option value="__UNASSIGNED__" ${curD === '__UNASSIGNED__' ? 'selected' : ''}>⏳ لم يوجه لمندوب بعد</option>`;
        Array.from(driversSet).forEach(d => { dHtml += `<option value="${d}" ${curD === d ? 'selected' : ''}>🛵 ${d}</option>`; });
        dSel.innerHTML = dHtml;
    };

    // =========================================================================
    // 🚀 4. أزرار الخطوة السريعة وقوالب الواتساب الجاهزة
    // =========================================================================
    window.quickAdvanceOrderStatus = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;
        const st = order.status || 'new';
        if (st === 'new' || st === 'no_answer' || st === 'deferred') {
            window.updateOrderStatus(orderId, 'processing');
        } else if (st === 'processing') {
            window.openDispatchModal();
        } else if (st === 'dispatched') {
            window.updateOrderStatus(orderId, 'completed');
        }
    };

    window.sendQuickWhatsAppOption = function (orderId, templateType) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        let cleanPhone = (order.customerPhone || '').toString().trim();
        let waNumber = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;
        if (!waNumber) return alert('لا يوجد رقم هاتف مسجل للعميل!');

        const itemsText = (order.items && Array.isArray(order.items))
            ? order.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n')
            : 'طلب سمان ههيا';

        const br = (typeof window.getOrderPaymentBreakdown === 'function')
            ? window.getOrderPaymentBreakdown(order)
            : { method: order.paymentMethod || 'cash', cash: order.total || 0, online: 0, total: order.total || 0 };

        const reqCashStr = br.method === 'online'
            ? '0 ج.م (خالص أونلاين ✅)'
            : (br.method === 'split' ? `${br.cash} ج.م كاش (ومدفوع ${br.online} ج محفظة ✅)` : `${order.total || 0} ج.م`);

        let msg = '';
        if (templateType === 'invoice') {
            return window.sendMessageToCustomer(order.customerPhone, orderId);
        } else if (templateType === 'on_way') {
            msg = `أهلاً بك يا ${order.customerName || 'فندم'} 🌹\nطلبك من *سمان ههيا* خرج مع المندوب وفي الطريق إليك الآن 🛵\n\n📦 الطلبات:\n${itemsText}\n💰 المطلوب عند الاستلام: *${reqCashStr}*\n\nيرجى إبقاء الهاتف متاحاً، وتشرفنا بخدمتك!`;
        } else if (templateType === 'no_answer') {
            msg = `أهلاً بك يا ${order.customerName || 'فندم'} 🌹\nحاولنا التواصل مع حضرتك هاتفياً لتأكيد وتسليم أوردر *سمان ههيا* ولكن الهاتف غير متاح 📵\nيرجى الرد علينا أو تأكيد تواجدك في العنوان (${order.zone || ''} - ${order.customerAddress || ''}) لنتمكن من توصيل الطلب طازجاً لحضرتك.`;
        } else if (templateType === 'prepay') {
            msg = `أهلاً بك يا ${order.customerName || 'فندم'} 🌹\nلتأكيد حجز وتجهيز طلبك من *سمان ههيا* (الإجمالي: ${order.total || 0} ج.م)، يرجى تحويل قيمة الطلب مقدماً على محفظة فودافون كاش / إنستا باي على الرقم:\n*${storeSettings?.storePhone || '01208027294'}*\nوإرسال صورة التحويل هنا لتجهيز الطلب فوراً. شكراً لتفهمك!`;
        }

        if (msg) {
            window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
        }
    };

    // =========================================================================
    // 🎨 5. رسم قائمة الطلبات الحية (خفيفة وسريعة جداً وواضحة الألوان)
    // =========================================================================
    window.renderOrdersList = function () {
        window.initSmartOrdersToolbar();
        window.refreshOrdersToolbarDropdowns(false);

        const container = document.getElementById('orders-list-vertical');
        if (!container) return;

        let filterText = (document.getElementById('search-order')?.value || '').toLowerCase();
        let dynamicCounts = { new: 0, processing: 0, dispatched: 0, deferred: 0, no_answer: 0, completed: 0, canceled: 0 };

        let filterWords = [];
        let exactPhrases = [];
        let quotesMatch = filterText.match(/"([^"]+)"/g);
        if (quotesMatch) {
            quotesMatch.forEach(q => {
                exactPhrases.push(q.replace(/"/g, '').trim());
                filterText = filterText.replace(q, '');
            });
        }
        filterWords = filterWords.concat(filterText.split(' ').filter(w => w.trim() !== ''));

        const fState = window.ordersFilterState;
        const ordersArray = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];

        let filteredBase = ordersArray.filter(o => {
            if (!o || o.status === 'trash' || o.isArchived) return false;

            const realBatchTitle = (typeof window.resolveOrderBatchName === 'function')
                ? window.resolveOrderBatchName(o)
                : ((o.batchName && o.batchName !== 'undefined') ? o.batchName : '');

            if (filterWords.length > 0 || exactPhrases.length > 0) {
                let bNameSearch = realBatchTitle ? realBatchTitle : (o.customTag ? `تاج مخصص: ${o.customTag}` : 'أوردرات عادية');
                let itemsString = (o.items && Array.isArray(o.items)) ? o.items.map(i => i.name).join(' ') : '';
                let normPhone1 = window.normalizePhone ? window.normalizePhone(o.customerPhone) : (o.customerPhone || '');
                let normPhone2 = window.normalizePhone ? window.normalizePhone(o.customerPhone2) : (o.customerPhone2 || '');

                let searchStr = `${o.customerName || ''} ${o.customerPhone || ''} ${normPhone1} ${o.customerPhone2 || ''} ${normPhone2} ${bNameSearch} ${o.zone || ''} ${o.customerAddress || ''} ${o.driverName || ''} ${itemsString} ${o.adminNote || ''} ${o.driverNote || ''}`.toLowerCase();
                searchStr = searchStr.replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0);

                let matchSearch = filterWords.every(word => {
                    let engWord = word.replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0);
                    let normWord = window.normalizePhone ? window.normalizePhone(word) : word;
                    return searchStr.includes(engWord) || (normWord !== '' && normWord.length > 5 && searchStr.includes(normWord));
                });

                let matchExact = exactPhrases.every(p => searchStr.includes(p));
                if (!matchSearch || !matchExact) return false;
            }

            if (fState.zone !== 'all' && (o.zone || '').trim() !== fState.zone) return false;
            if (fState.batch !== 'all') {
                if (fState.batch === '__NONE__' && realBatchTitle !== '') return false;
                if (fState.batch !== '__NONE__' && realBatchTitle !== fState.batch) return false;
            }
            if (fState.driver !== 'all') {
                if (fState.driver === '__UNASSIGNED__' && o.driverName) return false;
                if (fState.driver !== '__UNASSIGNED__' && (o.driverName || '').trim() !== fState.driver) return false;
            }
            if (fState.payment !== 'all') {
                if (fState.payment === 'cash' && (o.paymentMethod === 'online' || o.paymentMethod === 'split')) return false;
                if (fState.payment === 'online' && o.paymentMethod !== 'online') return false;
                if (fState.payment === 'split' && o.paymentMethod !== 'split') return false;
                if (fState.payment === 'debt' && !(Number(o.debt) > 0)) return false;
            }
            if (fState.special !== 'all') {
                if (fState.special === 'high_value' && (Number(o.total) || 0) < 500) return false;
                if (fState.special === 'has_notes' && !o.adminNote && !o.driverNote) return false;
                if (fState.special === 'vip') {
                    let normPhone1 = window.normalizePhone ? window.normalizePhone(o.customerPhone) : (o.customerPhone || '');
                    let c = (typeof customersData !== 'undefined' ? customersData : []).find(x => (window.normalizePhone ? window.normalizePhone(x.phone) : x.phone) === normPhone1);
                    if (!c || (c.trustRating !== 'vip' && (c.ordersCount || 0) < 3 && (c.totalSpent || 0) < 1500)) return false;
                }
            }

            const st = o.status || 'new';
            if (dynamicCounts[st] !== undefined) dynamicCounts[st]++;
            return true;
        });

        // تحديث شارات الأعداد وتطبيق الألوان الواضحة على التبويبات
        ['new', 'processing', 'dispatched', 'deferred', 'no_answer', 'completed', 'canceled'].forEach(s => {
            let b = document.getElementById(`badge-${s}`);
            if (b) b.innerText = dynamicCounts[s] || 0;
        });
        const totalNonCanceled = filteredBase.filter(o => o.status !== 'canceled').length;
        const tabAllBtn = document.getElementById('tab-all');
        if (tabAllBtn) {
            tabAllBtn.innerHTML = `الكل <span id="badge-all" class="mr-1 px-1.5 py-0.5 rounded-md text-[10px] font-black">${totalNonCanceled}</span>`;
        }

        const activeTab = (typeof currentOrderTab !== 'undefined') ? currentOrderTab : 'all';
        window.applyCrispOrderTabsVisuals(activeTab);

        let filtered = filteredBase.filter(o => (activeTab === 'all') || (o.status === activeTab));

        const sortDir = (typeof ordersSortDirection !== 'undefined') ? ordersSortDirection : 'desc';
        filtered.sort((a, b) => {
            let timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            let timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return sortDir === 'desc' ? (timeB - timeA) : (timeA - timeB);
        });

        // حساب إجماليات الشريط الأسود العلوي
        let sumTotal = 0, sumNet = 0, sumDel = 0, sumDebt = 0;
        filtered.forEach(o => {
            if (o.status === 'canceled') return;
            const tot = Number(o.total) || 0;
            const del = Number(o.deliveryFee) || 0;
            const net = (typeof window.getAccurateOrderFinancials === 'function')
                ? window.getAccurateOrderFinancials(o).total
                : Math.max(0, tot - del);
            sumTotal += tot;
            sumNet += net;
            sumDel += del;
            sumDebt += (Number(o.debt) || 0);
        });

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        setTxt('so-count-orders', filtered.length);
        setTxt('so-sum-net', `${sumNet.toLocaleString()} ج`);
        setTxt('so-sum-total', `${sumTotal.toLocaleString()} ج`);
        setTxt('so-sum-delivery', `${sumDel.toLocaleString()} ج`);
        setTxt('so-sum-debt', `${sumDebt.toLocaleString()} ج`);
        document.getElementById('so-debt-pill')?.classList.toggle('hidden', sumDebt <= 0);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="text-center text-slate-400 py-14 font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-white space-y-2">
                    <i class="fa-solid fa-box-open text-3xl text-slate-300"></i>
                    <p>لا توجد طلبات مطابقة في هذا القسم حالياً.</p>
                </div>`;
            return;
        }

        if (typeof window.rebuildTrustCacheIfNeeded === 'function') {
            window.rebuildTrustCacheIfNeeded();
        }

        const isCompact = window.ordersFilterState.compactMode;
        const limitCount = window.ordersRenderLimit || 25;
        const visibleOrders = filtered.slice(0, limitCount);
        const remainingCount = filtered.length - visibleOrders.length;

        const statusAccentMap = {
            new:        { border: 'border-r-4 border-r-blue-500',    badge: '<span class="bg-blue-600 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black">🆕 جديد</span>' },
            processing: { border: 'border-r-4 border-r-amber-500',   badge: '<span class="bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-lg text-[10px] font-black">⏳ تجهيز</span>' },
            dispatched: { border: 'border-r-4 border-r-indigo-500',  badge: '<span class="bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black"><i class="fa-solid fa-motorcycle mr-1"></i> بالطريق</span>' },
            deferred:   { border: 'border-r-4 border-r-orange-500',  badge: '<span class="bg-orange-600 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black">📅 مؤجل</span>' },
            no_answer:  { border: 'border-r-4 border-r-purple-500',  badge: '<span class="bg-purple-600 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black">📵 لم يرد</span>' },
            completed:  { border: 'border-r-4 border-r-emerald-500', badge: '<span class="bg-emerald-600 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black">✅ مكتمل</span>' },
            canceled:   { border: 'border-r-4 border-r-rose-500',    badge: '<span class="bg-rose-600 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black">❌ ملغي</span>' }
        };

        let cardsHtml = visibleOrders.map(o => {
            const st = o.status || 'new';
            const stStyle = statusAccentMap[st] || statusAccentMap.new;
            const d = o.orderDate || (o.createdAt?.toMillis ? new Date(o.createdAt.toMillis()).toLocaleDateString('en-US') : 'غير محدد');
            const ageStr = getOrderRelativeAge(o);
            const realBatchTitle = (typeof window.resolveOrderBatchName === 'function')
                ? window.resolveOrderBatchName(o)
                : ((o.batchName && o.batchName !== 'undefined') ? o.batchName : '');

            const trustInfo = (typeof window.fastAnalyzeOrderTrust === 'function')
                ? window.fastAnalyzeOrderTrust(o)
                : { cardClass: 'bg-white border-slate-200/80', badgeHtml: '', bannerHtml: '', stickyHtml: '' };

            const payBr = (typeof window.getOrderPaymentBreakdown === 'function')
                ? window.getOrderPaymentBreakdown(o)
                : { method: o.paymentMethod || 'cash', cash: Number(o.total) || 0, online: 0, total: Number(o.total) || 0 };

            let nextStepBtnHtml = '';
            if (st === 'new' || st === 'no_answer' || st === 'deferred') {
                nextStepBtnHtml = `<button onclick="event.stopPropagation(); quickAdvanceOrderStatus('${o.id}')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm flex items-center gap-1" title="نقل الطلب فوراً إلى قيد التجهيز"><i class="fa-solid fa-fire-burner"></i> لتجهيز</button>`;
            } else if (st === 'processing') {
                nextStepBtnHtml = `<button onclick="event.stopPropagation(); quickAdvanceOrderStatus('${o.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm flex items-center gap-1" title="توجيه الطلب للمندوب"><i class="fa-solid fa-motorcycle"></i> توجيه</button>`;
            } else if (st === 'dispatched') {
                nextStepBtnHtml = `<button onclick="event.stopPropagation(); quickAdvanceOrderStatus('${o.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm flex items-center gap-1" title="تأكيد تسليم الطلب للعميل"><i class="fa-solid fa-check-double"></i> تسليم</button>`;
            }

            // ⚡ 1. الوضع المضغوط السريع (Compact Mode)
            if (isCompact) {
                const compactItems = (o.items && Array.isArray(o.items))
                    ? o.items.map(i => formatOrderItemBadgeClean(i).mainText).join(' + ')
                    : '-';
                return `
                <div data-id="${o.id}" class="order-card ${trustInfo.cardClass} ${stStyle.border} p-2.5 rounded-xl border shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div class="flex items-center gap-2 min-w-[180px]">
                        <input type="checkbox" value="${o.id}" onchange="toggleBulkActionBar()" class="bulk-order-cb w-4 h-4 accent-brand-primary cursor-pointer">
                        <span onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 cursor-pointer hover:text-brand-primary">${o.customerName || 'بدون اسم'}</span>
                        ${trustInfo.badgeHtml}
                        <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] font-black">${o.zone || '-'}</span>
                    </div>
                    <div class="flex-1 text-[11px] font-bold text-slate-600 truncate max-w-md">${compactItems}</div>
                    <div class="flex items-center gap-1.5 mr-auto sm:mr-0">
                        ${realBatchTitle ? `<span class="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-black">${realBatchTitle}</span>` : ''}
                        <span class="font-black text-brand-primary text-sm">${o.total || 0} ج</span>
                        ${stStyle.badge}
                        ${nextStepBtnHtml}
                        <button onclick="openEditOrderModal('${o.id}')" class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-600 flex items-center justify-center text-[10px]" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="printSingleOrderWaybill('${o.id}')" class="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white flex items-center justify-center text-[10px]" title="بوليصة"><i class="fa-solid fa-print"></i></button>
                    </div>
                </div>`;
            }

            // 👑 2. وضع الكارت الفاخر خفيف الوزن (Zero-Lag Executive Card)
            let completedDateHtml = '';
            if (st === 'completed') {
                let cTime = o.completedTimeDisplay || (o.completedAtStr ? o.completedAtStr : 'تم التسليم');
                completedDateHtml = `<span class="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-black"><i class="fa-solid fa-check-double"></i> ${cTime}</span>`;
            }

            let itemsStr = (o.items && Array.isArray(o.items)) ? o.items.map((i, idx) => {
                const fmt = formatOrderItemBadgeClean(i);
                return `
                <div data-item-idx="${idx}" class="bg-white border border-slate-200/90 px-2.5 py-1.5 rounded-xl text-xs shadow-sm inline-flex flex-col justify-center">
                    <div class="flex items-center gap-1.5">
                        <span class="font-black text-slate-800">${fmt.mainText}</span>
                        <span class="text-[10px] text-emerald-700 font-black bg-emerald-50 px-1.5 py-0.5 rounded-md cursor-pointer border border-emerald-200/60" ondblclick="editItemPrice('${o.id}', ${idx})" title="اضغط مرتين لتعديل السعر">${i.price}ج</span>
                    </div>
                    ${fmt.subGrams ? `<span class="text-[9px] font-bold text-indigo-600 mt-0.5"><i class="fa-solid fa-scale-balanced text-[8px] ml-0.5"></i>الأوزان: ${fmt.subGrams}</span>` : ''}
                </div>`;
            }).join('') : '<span class="text-slate-400 text-xs font-bold">لا توجد تفاصيل</span>';

            let paymentBadge = '';
            let collectHighlightHtml = '';

            if (payBr.method === 'online') {
                paymentBadge = '<span class="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-credit-card"></i> خالص أونلاين</span>';
                collectHighlightHtml = `
                    <div class="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl text-left">
                        <span class="text-[9px] font-black text-emerald-700 block leading-none">خالص فيزا/محفظة</span>
                        <span class="font-black text-emerald-700 text-base sm:text-lg leading-tight">${o.total || 0} <span class="text-[10px]">ج</span></span>
                    </div>`;
            } else if (payBr.method === 'split') {
                paymentBadge = `<span class="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-scale-balanced"></i> نص ونص (مدفوع ${payBr.online}ج محفظة)</span>`;
                collectHighlightHtml = `
                    <div class="bg-amber-50 border-2 border-amber-300 px-3 py-1 rounded-xl text-left">
                        <span class="text-[9px] font-black text-amber-800 block leading-none">المطلوب كاش: ${payBr.cash} ج</span>
                        <span class="font-black text-brand-primary text-base sm:text-lg leading-tight">الإجمالي: ${o.total || 0} <span class="text-[10px]">ج</span></span>
                    </div>`;
            } else {
                paymentBadge = '<span class="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-money-bill-1-wave text-emerald-600"></i> كاش عند الاستلام</span>';
                collectHighlightHtml = `
                    <div class="bg-emerald-50/70 border border-emerald-200/80 px-3 py-1 rounded-xl text-left">
                        <span class="text-[9px] font-bold text-slate-400 block leading-none">(${o.subtotal || o.total || 0} + شحن ${o.deliveryFee || 0}${o.discount > 0 ? ` - خصم ${o.discount}` : ''})</span>
                        <span class="font-black text-brand-primary text-lg sm:text-xl leading-tight">${o.total || 0} <span class="text-[10px]">ج.م</span></span>
                    </div>`;
            }

            if (o.debt && o.debt > 0) {
                paymentBadge += ` <span class="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation"></i> آجل (${o.debt} ج)</span>`;
            }

            let batchTagHtml = realBatchTitle
                ? `<span onclick="setOrdersQuickFilter('batch', '${realBatchTitle}')" class="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1 cursor-pointer"><i class="fa-solid fa-layer-group"></i> ${realBatchTitle}</span>`
                : '';

            let driverBadgeHtml = o.driverName
                ? `<span class="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-motorcycle"></i> مع: ${o.driverName}</span>`
                : '';

            let deliveryWindowBadge = '';
            if (o.deliveryStart || o.deliveryEnd) {
                const winTxt = (o.deliveryStart && o.deliveryEnd) ? `${o.deliveryStart} ⬅️ ${o.deliveryEnd}` : (o.deliveryStart || o.deliveryEnd);
                deliveryWindowBadge = `<span class="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-regular fa-calendar-check"></i> ${winTxt}</span>`;
            }

            let customTagHtml = o.customTag
                ? `<span onclick="document.getElementById('search-order').value='${o.customTag}'; renderOrdersList();" class="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1 cursor-pointer"><i class="fa-solid fa-hashtag"></i> ${o.customTag}</span>`
                : '';

            let phone2Html = o.customerPhone2 ? `
                <span class="inline-flex items-center gap-1 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200">
                    <span class="text-[9px] font-black text-purple-600">بديل:</span>
                    <span class="text-[10px] text-slate-700 font-bold" dir="ltr" ondblclick="inlineEdit(this, '${o.id}', 'customerPhone2')">${o.customerPhone2}</span>
                    <a href="tel:${o.customerPhone2}" class="text-purple-600 text-[9px]"><i class="fa-solid fa-phone"></i></a>
                </span>` : '';

            const adminNotesCount = o.adminNote ? o.adminNote.split('\n---\n').filter(Boolean).length : 0;
            const driverNotesCount = o.driverNote ? o.driverNote.split('\n---\n').filter(Boolean).length : 0;

            return `
            <div data-id="${o.id}" onclick="highlightOrderCard(this, event)" class="order-card ${trustInfo.cardClass} ${stStyle.border} p-3.5 sm:p-4 rounded-2xl shadow-sm border relative cursor-pointer space-y-2.5">
                <input type="checkbox" value="${o.id}" onchange="toggleBulkActionBar()" class="bulk-order-cb absolute top-3.5 left-3.5 w-4 h-4 accent-brand-primary cursor-pointer z-10">

                ${trustInfo.bannerHtml}
                ${trustInfo.stickyHtml}

                <!-- المنطقة 1: رأس الكارت -->
                <div class="flex justify-between items-start gap-2 pl-6">
                    <div class="space-y-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="font-black text-slate-800 text-sm sm:text-base cursor-pointer hover:text-brand-primary" onclick="smartNameClick(this, '${o.id}', '${o.customerPhone}', 'customerName')">${o.customerName || 'بدون اسم'}</span>
                            ${trustInfo.badgeHtml}
                            <a href="tel:${o.customerPhone}" class="text-emerald-600 w-5 h-5 flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded-full" title="اتصال مباشر"><i class="fa-solid fa-phone text-[9px]"></i></a>
                            <span class="text-[11px] text-slate-500 font-bold cursor-pointer" dir="ltr" ondblclick="inlineEdit(this, '${o.id}', 'customerPhone')">${o.customerPhone}</span>
                            ${phone2Html}
                        </div>

                        <div class="text-[11px] text-slate-600 font-bold flex items-center gap-1.5 flex-wrap">
                            <span data-zone-pill="1" class="cursor-pointer text-indigo-900 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md font-black" ondblclick="inlineEdit(this, '${o.id}', 'zone')"><i class="fa-solid fa-location-dot text-indigo-500 ml-1"></i>${o.zone || 'غير مسجل'}</span>
                            ${o.customerAddress ? `<span class="cursor-pointer text-slate-600" ondblclick="inlineEdit(this, '${o.id}', 'customerAddress')">${o.customerAddress}</span>` : ''}
                        </div>
                    </div>

                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <div class="flex items-center gap-1">
                            ${ageStr ? `<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">${ageStr}</span>` : ''}
                            ${stStyle.badge}
                        </div>
                        <span class="text-[9px] text-slate-400 font-bold">${d}</span>
                        ${completedDateHtml}
                    </div>
                </div>

                <!-- المنطقة 2: قلب الكارت -->
                <div class="bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200/60 space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap gap-1.5 flex-1">
                            ${itemsStr}
                        </div>
                        <div class="flex flex-col items-end gap-1 shrink-0">
                            <div class="flex flex-wrap items-center gap-1">
                                ${paymentBadge}
                            </div>
                            ${collectHighlightHtml}
                        </div>
                    </div>

                    ${(batchTagHtml || driverBadgeHtml || deliveryWindowBadge || customTagHtml) ? `
                    <div class="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-200/60">
                        ${batchTagHtml} ${driverBadgeHtml} ${deliveryWindowBadge} ${customTagHtml}
                    </div>` : ''}

                    ${(o.adminNote || o.driverNote) ? `
                    <div class="pt-1.5 border-t border-slate-200/60 flex flex-wrap gap-1.5">
                        ${o.adminNote ? `<p class="text-[10px] font-black text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 flex-1 truncate"><i class="fa-solid fa-lock ml-1 text-amber-600"></i> ${o.adminNote.split('\n---\n').pop()}</p>` : ''}
                        ${o.driverNote ? `<p class="text-[10px] font-black text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/80 flex-1 truncate"><i class="fa-solid fa-motorcycle ml-1 text-blue-600"></i> ${o.driverNote.split('\n---\n').pop()}</p>` : ''}
                    </div>` : ''}
                </div>

                <div id="inline-notes-container-${o.id}" class="hidden w-full">
                    <div id="inline-notes-content-${o.id}"></div>
                </div>

                <!-- المنطقة 3: شريط الإجراءات السفلي الخفيف والواضح -->
                <div class="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <div class="flex flex-wrap items-center gap-1.5">
                        ${st === 'completed' ? `
                            <button onclick="sendFollowUpWhatsApp('${o.customerPhone}', '${o.customerName}')" class="text-[10px] bg-indigo-600 text-white px-2.5 py-1.5 rounded-xl font-black shadow-sm flex items-center gap-1"><i class="fa-solid fa-heart-circle-check"></i> متابعة</button>
                            <button onclick="openLinkArchiveModal('${o.id}')" class="text-[10px] bg-slate-800 text-white px-2.5 py-1.5 rounded-xl font-black shadow-sm flex items-center gap-1"><i class="fa-solid fa-link text-amber-400"></i> أرشفة للدفعة</button>
                        ` : `
                            <div class="inline-flex rounded-xl shadow-sm overflow-hidden">
                                <button onclick="sendMessageToCustomer('${o.customerPhone}', '${o.id}')" class="text-[10px] bg-[#25D366] text-white px-2.5 py-1.5 font-black flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> واتساب</button>
                                <select onchange="if(this.value){ sendQuickWhatsAppOption('${o.id}', this.value); this.value=''; }" class="bg-[#1ebd57] text-white text-[9px] font-black px-1 border-r border-white/20 outline-none cursor-pointer" title="رسائل واتساب جاهزة">
                                    <option value="">▼</option>
                                    <option value="invoice">🧾 إرسال الفاتورة</option>
                                    <option value="on_way">🛵 الطلب في الطريق</option>
                                    <option value="no_answer">📵 الهاتف غير متاح</option>
                                    <option value="prepay">💳 طلب دفع مسبق</option>
                                </select>
                            </div>
                        `}

                        <button onclick="event.stopPropagation(); printSingleOrderWaybill('${o.id}')" class="text-[10px] bg-amber-50 text-amber-900 px-2.5 py-1.5 rounded-xl font-black border border-amber-200 flex items-center gap-1"><i class="fa-solid fa-print"></i> بوليصة</button>
                        <button onclick="openEditOrderModal('${o.id}')" class="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-xl font-black flex items-center gap-1"><i class="fa-solid fa-pen"></i> تعديل</button>

                        <div class="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200/80">
                            <button onclick="toggleInlineNotes(event, '${o.id}', 'adminNote')" class="text-[10px] ${adminNotesCount > 0 ? 'bg-amber-400 text-slate-950' : 'text-amber-800'} px-2 py-1 rounded-lg font-black flex items-center gap-1" title="ملاحظات إدارية">
                                <i class="fa-solid fa-lock text-[9px]"></i> ${adminNotesCount > 0 ? adminNotesCount : 'إداري'}
                            </button>
                            <button onclick="toggleInlineNotes(event, '${o.id}', 'driverNote')" class="text-[10px] ${driverNotesCount > 0 ? 'bg-blue-600 text-white' : 'text-blue-800'} px-2 py-1 rounded-lg font-black flex items-center gap-1" title="ملاحظات للمندوب">
                                <i class="fa-solid fa-motorcycle text-[9px]"></i> ${driverNotesCount > 0 ? driverNotesCount : 'مندوب'}
                            </button>
                            <button onclick="openOrderTracking('${o.id}')" class="text-[10px] text-sky-700 px-2 py-1 rounded-lg font-black" title="تتبع الطلب"><i class="fa-solid fa-route text-[10px]"></i></button>
                        </div>
                    </div>

                    <div class="flex items-center gap-1.5 mr-auto sm:mr-0">
                        ${nextStepBtnHtml}
                        <select onchange="updateOrderStatus('${o.id}', this.value)" class="text-[10px] font-black bg-white border border-slate-200 rounded-xl px-2 py-1.5 outline-none text-slate-700 cursor-pointer">
                            <option value="new" ${st === 'new' ? 'selected' : ''}>جديد</option>
                            <option value="processing" ${st === 'processing' ? 'selected' : ''}>تجهيز</option>
                            <option value="dispatched" ${st === 'dispatched' ? 'selected' : ''}>بالطريق</option>
                            <option value="deferred" ${st === 'deferred' ? 'selected' : ''}>مؤجل</option>
                            <option value="no_answer" ${st === 'no_answer' ? 'selected' : ''}>لم يرد</option>
                            <option value="completed" ${st === 'completed' ? 'selected' : ''}>مكتمل</option>
                            <option value="canceled" ${st === 'canceled' ? 'selected' : ''}>إلغاء</option>
                            <option value="trash" class="text-red-500 font-black bg-red-50">سلة</option>
                        </select>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (remainingCount > 0) {
            cardsHtml += `
            <button type="button" onclick="window.ordersRenderLimit = (window.ordersRenderLimit || 25) + 25; renderOrdersList();" class="w-full py-3.5 bg-white hover:bg-emerald-50 text-brand-primary font-black text-xs rounded-2xl border-2 border-dashed border-brand-primary/30 shadow-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-angles-down"></i> عرض 25 طلب إضافي (متبقي ${remainingCount} طلب)
            </button>`;
        }

        container.innerHTML = cardsHtml;

        if (typeof openInlineNoteId !== 'undefined' && openInlineNoteId && openInlineNoteField) {
            setTimeout(() => { window.toggleInlineNotes(null, openInlineNoteId, openInlineNoteField, true); }, 50);
        }
    };

    // =========================================================================
    // 🔄 6. تحديث حالة الطلب مع استرجاع الأوزان للمصفوفة عند الإلغاء أو السلة
    // =========================================================================
    window.updateOrderStatus = async function (id, newStatus) {
        let o = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(x => x.id === id);
        if (!o) return;
        let oldStatus = o.status;
        if (oldStatus === newStatus) return;

        let executeStatusChange = async (noteText = null) => {
            try {
                let atomicBatch = db.batch();
                let orderRef = db.collection('orders').doc(id);
                let updateData = { status: newStatus };

                if (newStatus === 'trash') {
                    updateData.deletedAt = firebase.firestore.FieldValue.serverTimestamp();
                }

                let wasDeductedFromFreezer = ['processing', 'completed', 'dispatched'].includes(oldStatus);
                let willBeDeductedFromFreezer = ['processing', 'completed', 'dispatched'].includes(newStatus);

                if (!wasDeductedFromFreezer && willBeDeductedFromFreezer && o.items) {
                    let fzNewData = { ...storeFreezer };
                    let touched = false;
                    o.items.forEach(i => {
                        if (i.id) {
                            let cur = Math.max(0, Number(fzNewData[i.id]) || 0);
                            fzNewData[i.id] = Math.max(0, cur - (Number(i.quantity) || 0));
                            storeFreezer[i.id] = fzNewData[i.id];
                            touched = true;
                        }
                    });
                    if (touched) atomicBatch.set(db.collection('inventory').doc('freezer'), fzNewData, { merge: true });
                } else if (wasDeductedFromFreezer && !willBeDeductedFromFreezer && o.items) {
                    let fzNewData = { ...storeFreezer };
                    let touched = false;
                    o.items.forEach(i => {
                        if (i.id) {
                            let cur = Math.max(0, Number(fzNewData[i.id]) || 0);
                            fzNewData[i.id] = cur + (Number(i.quantity) || 0);
                            storeFreezer[i.id] = fzNewData[i.id];
                            touched = true;
                        }
                    });
                    if (touched) atomicBatch.set(db.collection('inventory').doc('freezer'), fzNewData, { merge: true });
                }

                if (newStatus === 'dispatched') {
                    updateData.dispatchedAt = firebase.firestore.FieldValue.serverTimestamp();
                } else if (newStatus === 'completed') {
                    let nowObj = new Date();
                    updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
                    updateData.completedAtStr = nowObj.toLocaleDateString('en-US');
                    updateData.completedTimeDisplay = nowObj.toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                    if (oldStatus !== 'completed' && o.customerPhone) {
                        let ptsPer100 = Number(storeSettings.pointsPer100) || 5;
                        let orderSubtotal = Number(o.subtotal) || Math.max(0, (Number(o.total) || 0) - (Number(o.deliveryFee) || 0));
                        if (orderSubtotal >= 100) {
                            let earnedPoints = Math.floor(orderSubtotal / 100) * ptsPer100;
                            if (earnedPoints > 0) {
                                let cleanPhoneForDB = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                                let customerRef = db.collection('customers').doc(cleanPhoneForDB);
                                atomicBatch.set(customerRef, { walletPoints: firebase.firestore.FieldValue.increment(earnedPoints) }, { merge: true });
                                if (typeof showToast === 'function') showToast(`🎁 تم إضافة ${earnedPoints} نقطة لمحفظة العميل!`);
                            }
                        }
                    }

                    if (oldStatus !== 'completed' && o.customerPhone && o.paymentMethod === 'online') {
                        let normP = window.normalizePhone ? window.normalizePhone(o.customerPhone) : o.customerPhone;
                        let cObj = customersData.find(x => (window.normalizePhone ? window.normalizePhone(x.phone) : x.phone) === normP);
                        if (cObj && (cObj.isBlacklisted || cObj.trustRating === 'blacklist')) {
                            let cleanP = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                            let nextPrepaid = (Number(cObj.prepaidCompletedCount) || 0) + 1;
                            let reqPrepaid = Number(cObj.requiredPrepaidOrders) || 3;
                            let blRef = db.collection('customers').doc(cleanP);
                            if (nextPrepaid >= reqPrepaid) {
                                atomicBatch.set(blRef, { isBlacklisted: false, trustRating: 'trusted', prepaidCompletedCount: 0 }, { merge: true });
                            } else {
                                atomicBatch.set(blRef, { prepaidCompletedCount: nextPrepaid }, { merge: true });
                            }
                        }
                    }
                } else if (newStatus === 'canceled') {
                    updateData.canceledAt = firebase.firestore.FieldValue.serverTimestamp();
                }

                if (oldStatus === 'completed' && newStatus !== 'completed' && o.customerPhone) {
                    let ptsPer100 = Number(storeSettings.pointsPer100) || 5;
                    let orderSubtotal = Number(o.subtotal) || Math.max(0, (Number(o.total) || 0) - (Number(o.deliveryFee) || 0));
                    if (orderSubtotal >= 100) {
                        let earnedPoints = Math.floor(orderSubtotal / 100) * ptsPer100;
                        if (earnedPoints > 0) {
                            let cleanPhoneForDB = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                            let customerRef = db.collection('customers').doc(cleanPhoneForDB);
                            atomicBatch.set(customerRef, { walletPoints: firebase.firestore.FieldValue.increment(-earnedPoints) }, { merge: true });
                        }
                    }
                }

                if (noteText && noteText.trim() !== '') {
                    let dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    let prefix = newStatus === 'deferred' ? '📅 تأجيل: ' : (newStatus === 'canceled' ? '❌ إلغاء: ' : (newStatus === 'no_answer' ? '📴 لم يرد: ' : '📝 '));
                    let newNoteLine = `[${dateStr}] ${prefix}${noteText.trim()}`;
                    updateData.adminNote = o.adminNote ? o.adminNote + '\n---\n' + newNoteLine : newNoteLine;
                }

                atomicBatch.update(orderRef, updateData);

                const wasInactive = ['canceled', 'trash'].includes(oldStatus);
                const isNowInactive = ['canceled', 'trash'].includes(newStatus);

                if (!wasInactive && isNowInactive) {
                    if (o.items && Array.isArray(o.items)) {
                        let stockUpdates = {};
                        let batchBookedUpdates = {};
                        o.items.forEach(item => {
                            if (item.id) {
                                const isW = storeProducts[item.id]?.isWeightBased;
                                const bQty = isW ? (Number(item.birdsCount) || 1) : (Number(item.quantity) || 0);
                                stockUpdates[item.id] = firebase.firestore.FieldValue.increment(isW ? bQty : item.quantity);
                                batchBookedUpdates[item.id] = firebase.firestore.FieldValue.increment(-bQty);
                            }
                        });
                        if (Object.keys(stockUpdates).length > 0) {
                            atomicBatch.set(db.collection('inventory').doc('stock'), stockUpdates, { merge: true });
                        }
                        if (o.batchId && storeBatches[o.batchId] && Object.keys(batchBookedUpdates).length > 0) {
                            atomicBatch.set(db.collection('inventory').doc('batches'), { [o.batchId]: { booked: batchBookedUpdates } }, { merge: true });
                        }
                        if (syncOrderWeighedItemsWithMatrix(o, 'restore')) {
                            atomicBatch.set(db.collection('inventory').doc('settings'), { productsData: storeProducts }, { merge: true });
                        }
                    }
                    if (o.customerPhone) {
                        let cleanPhone = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                        let debtDeduction = (o.debt && o.debt > 0) ? -o.debt : 0;
                        atomicBatch.set(db.collection('customers').doc(cleanPhone), {
                            ordersCount: firebase.firestore.FieldValue.increment(-1),
                            totalSpent: firebase.firestore.FieldValue.increment(-(o.total || 0)),
                            debt: firebase.firestore.FieldValue.increment(debtDeduction)
                        }, { merge: true });
                    }
                } else if (wasInactive && !isNowInactive) {
                    if (o.items && Array.isArray(o.items)) {
                        let stockUpdates = {};
                        let batchBookedUpdates = {};
                        o.items.forEach(item => {
                            if (item.id) {
                                const isW = storeProducts[item.id]?.isWeightBased;
                                const bQty = isW ? (Number(item.birdsCount) || 1) : (Number(item.quantity) || 0);
                                stockUpdates[item.id] = firebase.firestore.FieldValue.increment(-(isW ? bQty : item.quantity));
                                batchBookedUpdates[item.id] = firebase.firestore.FieldValue.increment(bQty);
                            }
                        });
                        if (Object.keys(stockUpdates).length > 0) {
                            atomicBatch.set(db.collection('inventory').doc('stock'), stockUpdates, { merge: true });
                        }
                        if (o.batchId && storeBatches[o.batchId] && Object.keys(batchBookedUpdates).length > 0) {
                            atomicBatch.set(db.collection('inventory').doc('batches'), { [o.batchId]: { booked: batchBookedUpdates } }, { merge: true });
                        }
                        if (syncOrderWeighedItemsWithMatrix(o, 'deduct')) {
                            atomicBatch.set(db.collection('inventory').doc('settings'), { productsData: storeProducts }, { merge: true });
                        }
                    }
                    if (o.customerPhone) {
                        let cleanPhone = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                        let debtAddition = (o.debt && o.debt > 0) ? o.debt : 0;
                        atomicBatch.set(db.collection('customers').doc(cleanPhone), {
                            ordersCount: firebase.firestore.FieldValue.increment(1),
                            totalSpent: firebase.firestore.FieldValue.increment(o.total || 0),
                            debt: firebase.firestore.FieldValue.increment(debtAddition)
                        }, { merge: true });
                    }
                }

                await atomicBatch.commit();
                let updatedOrderObj = { ...o, status: newStatus, adminNote: updateData.adminNote || o.adminNote };
                if (typeof window.syncOrderToGoogleSheet === 'function') {
                    window.syncOrderToGoogleSheet(updatedOrderObj, 'update');
                }
                window.refreshCustomersData();
            } catch (e) {
                console.error(e);
                alert('حدث خطأ أثناء تحديث الحالة!');
            }
        };

        if (newStatus === 'deferred') {
            window.openActionPrompt('<i class="fa-solid fa-calendar-day text-orange-500 mr-2"></i> سبب/موعد التأجيل', ['تأجيل لغدٍ', 'تأجيل للخميس', 'العميل مسافر', 'طلب التوصيل الأسبوع القادم'], 'اكتب موعد أو سبب التأجيل...', (reason) => executeStatusChange(reason));
        } else if (newStatus === 'canceled') {
            window.openActionPrompt('<i class="fa-solid fa-ban text-red-500 mr-2"></i> سبب إلغاء الطلب', ['العميل ألغى الطلب', 'الرقم مغلق باستمرار', 'رفض الاستلام', 'طلب مكرر بالخطأ'], 'اكتب سبب الإلغاء...', (reason) => executeStatusChange(reason));
        } else if (newStatus === 'no_answer') {
            window.openActionPrompt('<i class="fa-solid fa-phone-slash text-purple-500 mr-2"></i> ملاحظة عدم الرد', ['الهاتف مغلق', 'يرن ولا يرد', 'الرقم مشغول', 'تم إرسال واتساب'], 'ملاحظة إضافية (اختياري)...', (reason) => executeStatusChange(reason));
        } else {
            executeStatusChange();
        }
    };

    // =========================================================================
    // 📦 7. ورقة التحضير المطبخية (Packing List) والعمليات الجماعية
    // =========================================================================
    window.packingListZoneFilter = 'all';

    window.openPackingListModal = function (zoneFilter = 'all') {
        window.packingListZoneFilter = zoneFilter;
        const cont = document.getElementById('packing-list-content');
        if (!cont) return;

        const allProcOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => o && o.status === 'processing' && !o.isArchived);
        if (allProcOrders.length === 0) {
            cont.innerHTML = `<div class="text-center py-12 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد طلبات في قسم (قيد التجهيز) حالياً.</div>`;
            openModal('packing-list-modal');
            return;
        }

        const zonesMap = {};
        allProcOrders.forEach(o => {
            const z = (o.zone || 'غير محدد').trim();
            zonesMap[z] = (zonesMap[z] || 0) + 1;
        });

        const filteredOrders = zoneFilter === 'all'
            ? allProcOrders
            : allProcOrders.filter(o => (o.zone || 'غير محدد').trim() === zoneFilter);

        const itemsMap = {};
        const itemsCustomers = {};

        filteredOrders.forEach(o => {
            if (o.items && Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const nm = i.name || 'صنف';
                    const q = Number(i.quantity) || 0;
                    itemsMap[nm] = (itemsMap[nm] || 0) + q;
                    if (!itemsCustomers[nm]) itemsCustomers[nm] = [];
                    itemsCustomers[nm].push(`${o.customerName} (${q})`);
                });
            }
        });

        let zoneButtons = `<button onclick="openPackingListModal('all')" class="px-3 py-1 rounded-lg text-xs font-black ${zoneFilter === 'all' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}">الكل (${allProcOrders.length})</button>`;
        Object.keys(zonesMap).forEach(z => {
            zoneButtons += `<button onclick="openPackingListModal('${z}')" class="px-3 py-1 rounded-lg text-xs font-black ${zoneFilter === z ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}">${z} (${zonesMap[z]})</button>`;
        });

        let itemsHtml = Object.keys(itemsMap).sort((a, b) => itemsMap[b] - itemsMap[a]).map(name => `
            <div class="bg-white p-3.5 rounded-xl border border-amber-100 shadow-sm mb-2.5">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="font-black text-slate-800 text-sm"><i class="fa-solid fa-box text-amber-500 mr-1.5"></i> ${name}</span>
                    <span class="bg-amber-100 text-amber-800 font-black px-3 py-1 rounded-lg text-base border border-amber-200">${itemsMap[name]}</span>
                </div>
                <p class="text-[10px] font-bold text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                    👥 العملاء: ${itemsCustomers[name].join(' ، ')}
                </p>
            </div>
        `).join('');

        cont.innerHTML = `
            <div class="mb-4 flex flex-wrap gap-1.5 print:hidden">${zoneButtons}</div>
            <div class="bg-amber-50 border border-amber-200 p-3.5 rounded-xl mb-4 flex justify-between items-center">
                <span class="text-xs font-black text-amber-800">إجمالي الأوردرات قيد التجهيز (${zoneFilter === 'all' ? 'كل المناطق' : zoneFilter}):</span>
                <span class="text-lg font-black text-amber-700 bg-white px-3 py-0.5 rounded-lg border border-amber-200">${filteredOrders.length} أوردر</span>
            </div>
            ${itemsHtml}
        `;
        openModal('packing-list-modal');
    };

    window.printPackingList = function () {
        const content = document.getElementById('packing-list-content')?.innerHTML || '';
        const win = window.open('', '', 'width=700,height=800');
        win.document.write(`
            <html lang="ar" dir="rtl">
            <head>
                <title>ورقة التحضير والتجهيز - سمان ههيا</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; padding: 25px; color: #0f172a; }
                    .print\\:hidden { display: none !important; }
                    div { margin-bottom: 8px; }
                </style>
            </head>
            <body>
                <h2 style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px;">📋 ورقة التحضير والتجهيز - سمان ههيا (${new Date().toLocaleDateString('ar-EG')})</h2>
                ${content}
                <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 500); }<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };

    window.bulkChangeStatus = async function (newStatus) {
        let checked = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) return;

        let statusAr = newStatus === 'processing' ? 'قيد التجهيز' : (newStatus === 'completed' ? 'مكتمل' : (newStatus === 'no_answer' ? 'لم يرد' : 'سلة المحذوفات'));
        if (!confirm(`هل أنت متأكد من تحويل (${checked.length}) طلبات إلى حالة "${statusAr}"؟`)) return;

        for (const id of checked) {
            await window.updateOrderStatus(id, newStatus);
        }
        document.getElementById('bulk-actions-bar')?.classList.add('hidden');
        document.querySelectorAll('.bulk-order-cb').forEach(cb => { cb.checked = false; });
    };

    window.sendToSelectedOrders = function () {
        let checked = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) return;

        let selectedOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => checked.includes(o.id));
        let cont = document.getElementById('broadcast-customers-list');
        if (!cont) return;
        cont.innerHTML = '';

        selectedOrders.forEach(o => {
            let itemsStr = o.items ? o.items.map(i => `${i.quantity}x ${i.name}`).join(' + ') : '';
            cont.innerHTML += `
                <div class="bg-white p-3.5 rounded-xl border border-slate-100 flex items-center justify-between gap-3 shadow-sm">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" class="bc-cb w-4 h-4 accent-[#25D366] cursor-pointer" value="${o.id}" checked>
                        <div>
                            <h5 class="font-black text-xs text-slate-800">${o.customerName} <span class="text-indigo-500">(${o.zone || ''})</span></h5>
                            <span class="text-[10px] font-bold text-slate-400" dir="ltr">${o.customerPhone}</span>
                            <p class="text-[10px] font-bold text-emerald-600 mt-0.5">${itemsStr} (${o.total} ج)</p>
                        </div>
                    </div>
                    <button onclick="sendMessageToCustomer('${o.customerPhone}', '${o.id}'); this.classList.replace('bg-[#25D366]', 'bg-slate-300'); this.innerText='تم الإرسال ✓';" class="bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm shrink-0">إرسال فردي</button>
                </div>`;
        });
        openModal('batch-broadcast-modal');
    };

    window.editItemPrice = async function (orderId, itemIndex) {
        let o = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(x => x.id === orderId);
        if (!o || !o.items || !o.items[itemIndex]) return;

        let item = o.items[itemIndex];
        let newPriceStr = prompt(`تعديل سعر الوحدة للصنف (${item.name}):`, item.price);
        if (newPriceStr === null || newPriceStr.trim() === '') return;

        let newPrice = parseFloat(newPriceStr);
        if (isNaN(newPrice) || newPrice < 0) return alert('برجاء إدخال سعر صحيح!');

        let oldTotal = Number(o.total) || 0;
        o.items[itemIndex].price = newPrice;
        let newSubtotal = o.items.reduce((sum, i) => sum + ((Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);
        let newTotal = Math.max(0, Math.round(newSubtotal + (Number(o.deliveryFee) || 0) - (Number(o.discount) || 0)));
        let diff = newTotal - oldTotal;

        try {
            let batch = db.batch();
            batch.update(db.collection('orders').doc(orderId), {
                items: o.items,
                subtotal: Math.round(newSubtotal),
                total: newTotal
            });
            if (diff !== 0 && o.customerPhone) {
                let cleanPhone = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                batch.set(db.collection('customers').doc(cleanPhone), {
                    totalSpent: firebase.firestore.FieldValue.increment(diff)
                }, { merge: true });
            }
            await batch.commit();
        } catch (e) {
            alert('حدث خطأ أثناء تعديل السعر!');
        }
    };
})();
