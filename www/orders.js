// =========================================================================
// ⚡ المحرك الذكي المستقل لإدارة الطلبات الحية، التحضير، التعديل، والملاحظات (orders.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة الكاملة المطورة فائقة السرعة
// =========================================================================

(function () {
    // 1. حالة الفلاتر المتقدمة والعرض في شاشة الطلبات
    window.ordersFilterState = {
        batch: 'all',       // 'all' | 'normal_only' | 'batches_only' | batchName
        zone: 'all',        // 'all' | zoneName
        payment: 'all',     // 'all' | 'cash' | 'online' | 'split' | 'has_debt' | 'has_discount'
        driver: 'all',      // 'all' | 'unassigned' | driverName
        compactMode: false, // وضع العرض المدمج السريع مع إظهار الأصناف كاملة
        filtersOpen: false, // طي قوائم الفلترة افتراضياً لمنع الزحام البصري
        packingScope: 'processing', // 'processing' | 'new_and_proc' | 'dispatched'
        packingBatch: 'all',
        packingZone: 'all'
    };

    window.ordersRenderLimit = 30;

    // =========================================================================
    // 🎨 تلوين أزرار التبويبات (مكتمل / تجهيز / جديد...) بألوان صريحة وقوية تمنع البهتان
    // =========================================================================
    const TAB_ACTIVE_STYLES = {
        all:        { btn: 'bg-slate-900 text-white border-slate-900 shadow-md scale-[1.02]',      badge: 'bg-amber-400 text-slate-950' },
        new:        { btn: 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]',        badge: 'bg-white text-blue-700' },
        processing: { btn: 'bg-amber-500 text-slate-950 border-amber-500 shadow-md scale-[1.02]',  badge: 'bg-slate-900 text-amber-300' },
        dispatched: { btn: 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.02]',    badge: 'bg-white text-indigo-700' },
        deferred:   { btn: 'bg-orange-600 text-white border-orange-600 shadow-md scale-[1.02]',    badge: 'bg-white text-orange-700' },
        no_answer:  { btn: 'bg-purple-600 text-white border-purple-600 shadow-md scale-[1.02]',    badge: 'bg-white text-purple-700' },
        completed:  { btn: 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.02]',  badge: 'bg-white text-emerald-800' },
        canceled:   { btn: 'bg-rose-600 text-white border-rose-600 shadow-md scale-[1.02]',        badge: 'bg-white text-rose-700' }
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
                const cleanBtnCls = String(st.btn || '').replace('scale-[1.02]', '').trim();
                btn.className = `order-tab active whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-black border-2 transition-colors ${cleanBtnCls}`;
                if (badge) {
                    badge.className = `mr-1 px-1.5 py-0.5 rounded-md text-[10px] font-black ${st.badge}`;
                }
            } else {
                btn.className = 'order-tab whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-black bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors';
                if (badge) {
                    badge.className = `mr-1 px-1.5 py-0.5 rounded-md text-[10px] font-black ${TAB_INACTIVE_BADGES[t] || 'bg-slate-100 text-slate-600'}`;
                }
            }
        });
    };


    window.setOrderTab = function (tab) {
        currentOrderTab = tab;
        window.ordersRenderLimit = 30;
        window.applyCrispOrderTabsVisuals(tab);
        window.renderOrdersList();
    };

    function classifyItemType(item) {
        const id = String(item?.id || '').toLowerCase();
        const name = String(item?.name || '').toLowerCase();
        if (id === 'eggs' || name.includes('بيض')) return 'egg';
        if (id === 'chicks' || name.includes('كتكوت') || name.includes('كتاكيت') || name.includes('أعمار') || name.includes('عمر')) return 'chick';
        return 'meat';
    }

    function getOrderBatchTitle(o) {
        if (!o) return '';
        if (typeof window.resolveOrderBatchName === 'function') {
            return window.resolveOrderBatchName(o);
        }
        if (o.batchId && typeof storeBatches !== 'undefined' && storeBatches[o.batchId] && storeBatches[o.batchId].name) {
            return storeBatches[o.batchId].name.trim();
        }
        if (o.batchName && o.batchName !== 'undefined') return o.batchName.trim();
        return '';
    }
    // تحديد مصدر تسجيل الطلب (من متجر العملاء الإلكتروني 🟢 أم مسجل يدوياً من لوحة الإدارة 🔵)
    function getOrderOriginMeta(o) {
        const src = String(o?.source || '').toLowerCase();
        const isFromStore =
            src.includes('store') ||
            src.includes('web') ||
            (src !== 'admin_crm' && (
                o?.isRead !== undefined ||
                o?.usedPromo !== undefined ||
                o?.generatedPromo !== undefined ||
                Boolean(o?.orderTime && !o?.customTag && o?.debt === undefined && o?.driverNote === undefined)
            ));

        if (isFromStore) {
            return {
                isStore: true,
                title: 'طلب وارد من الموقع الإلكتروني 🌐',
                desc: 'العميل قام بتسجيل هذا الطلب بنفسه مباشرة من متجر سمان ههيا.',
                dotCls: 'bg-emerald-500 ring-emerald-200',
                badgeCls: 'bg-emerald-50 text-emerald-800 border-emerald-200'
            };
        }
        return {
            isStore: false,
            title: 'طلب مسجل من لوحة الإدارة (CRM) 📝',
            desc: 'تم تسجيل هذا الطلب يدوياً من داخل لوحة التحكم الخاصة بك.',
            dotCls: 'bg-blue-500 ring-blue-200',
            badgeCls: 'bg-blue-50 text-blue-800 border-blue-200'
        };
    }

    window.showOrderOriginPopover = function (anchorEl, orderId) {
        const o = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(x => x && x.id === orderId);
        if (!o) return;
        const meta = getOrderOriginMeta(o);
        const timeInfo = o.orderDate ? `${o.orderDate}${o.orderTime ? ' • ' + o.orderTime : ''}` : '';

        if (typeof window.openLivePopover === 'function') {
            const html = `
                <div class="space-y-2">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span class="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span class="w-2.5 h-2.5 rounded-full ${meta.dotCls} ring-2 inline-block"></span>
                            <span>مصدر الطلب</span>
                        </span>
                        <button type="button" onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="p-2.5 rounded-xl border text-xs font-black ${meta.badgeCls}">
                        ${meta.title}
                        <p class="text-[10px] font-bold opacity-85 mt-1 leading-relaxed">${meta.desc}</p>
                    </div>
                    ${timeInfo ? `<div class="text-[10px] font-bold text-slate-400 text-center">🕒 وقت التسجيل: ${timeInfo}</div>` : ''}
                </div>
            `;
            window.openLivePopover(anchorEl, html);
        } else if (typeof window.showToast === 'function') {
            window.showToast(meta.title);
        } else {
            alert(meta.title + '\n' + meta.desc);
        }
    };

    function getOrderAgeLabel(o) {
        let ms = 0;
        if (o.createdAt && typeof o.createdAt.toMillis === 'function') {
            ms = o.createdAt.toMillis();
        } else if (o.orderDate) {
            const p = new Date(o.orderDate);
            if (!isNaN(p.getTime())) ms = p.getTime();
        }
        if (!ms) return '';
        const diffHours = Math.floor((Date.now() - ms) / (1000 * 60 * 60));
        if (diffHours < 1) return 'الآن';
        if (diffHours < 24) return `منذ ${diffHours} س`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'منذ يوم';
        if (diffDays === 2) return 'منذ يومين';
        return `منذ ${diffDays} أيام`;
    }

    // =========================================================================
    // ➕ 2. فتح نافذة إنشاء طلب جديد بأمان تام من أي مكان (safeOpenAddOrderModal)
    // =========================================================================
    window.safeOpenAddOrderModal = function () {
        if (typeof window.generateDynamicOrderInputs === 'function') {
            window.generateDynamicOrderInputs();
        }
        const helperBox = document.getElementById('no-smart-customer-helper');
        if (helperBox) helperBox.innerHTML = '';
        const blAlert = document.getElementById('no-blacklist-alert');
        if (blAlert) blAlert.classList.add('hidden');

        if (typeof window.openModal === 'function') {
            window.openModal('add-order-modal');
        } else {
            const modal = document.getElementById('add-order-modal');
            if (modal) modal.classList.remove('hidden');
        }
        setTimeout(() => {
            const phoneInp = document.getElementById('no-phone');
            if (phoneInp) phoneInp.focus();
        }, 120);
    };

    // =========================================================================
    // 🎛️ 3. شريط التحكم المدمج والملخص اللحظي (موضوع بذكاء دون حجب الشاشة)
    // =========================================================================
    window.initSmartOrdersToolbar = function () {
        const ordersView = document.getElementById('view-orders');
        if (!ordersView || document.getElementById('smart-orders-toolbar')) return;

        const topToolsArea = document.getElementById('orders-top-tools-area') || ordersView.firstElementChild;
        if (!topToolsArea) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'smart-orders-toolbar';
        toolbar.className = 'pt-2 border-t border-slate-100 space-y-2';

        toolbar.innerHTML = `
            <!-- السطر الأساسي المدمج: الملخص اللحظي + أزرار التحكم السريعة -->
            <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl shadow-sm">
                <div class="flex flex-wrap items-center gap-2.5 text-[11px] font-black">
                    <span>📦 المعروض: <strong id="so-sum-count" class="text-amber-400">0</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>🥩 سمان: <strong id="so-sum-meat" class="text-emerald-400">0</strong> طبق</span>
                    <span id="so-sum-extras-wrap" class="hidden text-slate-300"></span>
                    <span class="text-slate-600">|</span>
                    <span>💰 الإجمالي: <strong id="so-sum-money" class="text-amber-400">0 ج</strong></span>
                </div>

                <div class="flex flex-wrap items-center gap-1.5 mr-auto sm:mr-0">
                    <button type="button" onclick="toggleAdvancedFiltersDrawer()" id="so-btn-toggle-filters" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-filter text-amber-400 text-[10px]"></i> فلتر <span id="so-active-filters-dot" class="hidden w-2 h-2 rounded-full bg-amber-400"></span>
                    </button>
                    <button type="button" onclick="toggleSelectAllVisibleOrders()" id="so-btn-select-all" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1" title="تحديد الكل">
                        <i class="fa-solid fa-check-double text-emerald-400 text-[10px]"></i> الكل
                    </button>
                    <button type="button" onclick="toggleOrdersCompactMode()" id="so-btn-compact" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1" title="تبديل العرض المدمج والتفصيلي">
                        <i class="fa-solid fa-compress text-sky-400 text-[10px]"></i> مدمج
                    </button>
                </div>
            </div>

            <!-- درج الفلاتر المتقدمة (يفتح عند الحاجة فقط لمنع الزحام) -->
            <div id="so-advanced-filters-drawer" class="hidden grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 shadow-inner">
                <select id="so-filter-batch" onchange="setOrdersQuickFilter('batch', this.value)" class="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-[11px] font-black text-teal-800 outline-none focus:border-brand-primary">
                    <option value="all">🏷️ كل الدفعات والفوري</option>
                </select>

                <select id="so-filter-zone" onchange="setOrdersQuickFilter('zone', this.value)" class="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-[11px] font-black text-indigo-800 outline-none focus:border-brand-primary">
                    <option value="all">📍 كل المناطق</option>
                </select>

                <select id="so-filter-payment" onchange="setOrdersQuickFilter('payment', this.value)" class="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-[11px] font-black text-slate-700 outline-none focus:border-brand-primary">
                    <option value="all">💳 كل طرق الدفع</option>
                    <option value="cash">💵 كاش عند الاستلام</option>
                    <option value="online">💳 خالص أونلاين</option>
                    <option value="split">⚖️ نص ونص (كاش + محفظة)</option>
                    <option value="has_debt">📕 عليه آجل</option>
                    <option value="has_discount">🎁 طلبات بخصم</option>
                </select>

                <div class="flex gap-1">
                    <select id="so-filter-driver" onchange="setOrdersQuickFilter('driver', this.value)" class="flex-1 border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-[11px] font-black text-blue-800 outline-none focus:border-brand-primary">
                        <option value="all">🛵 كل المناديب</option>
                    </select>
                    <button type="button" onclick="resetAllOrdersFilters()" id="so-btn-reset-filters" class="hidden bg-red-100 hover:bg-red-600 text-red-600 hover:text-white px-2.5 rounded-lg text-[10px] font-black transition-all" title="مسح الفلاتر">✕</button>
                </div>
            </div>
        `;

        topToolsArea.appendChild(toolbar);

        // إعادة تنظيم وتنسيق شريط التحديد الجماعي بهوية سمان ههيا (بنفس كل المميزات وبدون حذف أي زر)
        const bulkBar = document.getElementById('bulk-actions-bar');
        if (bulkBar && !bulkBar.hasAttribute('data-sman-v2-bulk')) {
            bulkBar.setAttribute('data-sman-v2-bulk', '1');
            const isHiddenNow = bulkBar.classList.contains('hidden');
            bulkBar.className = `${isHiddenNow ? 'hidden ' : ''}bg-white border-2 border-emerald-600/35 rounded-2xl shadow-lg p-2.5 space-y-2 transition-all`;
            bulkBar.innerHTML = `
                <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                    <div class="flex items-center gap-1.5 text-xs font-black text-slate-800">
                        <span id="bulk-count" class="bg-brand-primary text-amber-300 px-2 py-0.5 rounded-lg text-[11px] font-black shadow-sm">0</span>
                        <span>طلب محدد — اختر الإجراء:</span>
                    </div>
                    <button type="button" onclick="clearAllBulkSelections()" class="bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 px-2.5 py-1 rounded-xl text-[10px] font-black transition-all flex items-center gap-1" title="إلغاء التحديد">
                        <span>إلغاء</span><i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- الصف 1: الإجراءات التنفيذية الـ 3 الرئيسية -->
                <div class="grid grid-cols-3 gap-1.5">
                    <button type="button" onclick="printSelectedOrdersWaybills()" class="bg-amber-50 hover:bg-amber-500 text-amber-950 hover:text-white border border-amber-300 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95">
                        <i class="fa-solid fa-print text-amber-600"></i> <span>بوالص</span>
                    </button>
                    <button type="button" onclick="sendToSelectedOrders()" class="bg-emerald-50 hover:bg-[#25D366] text-emerald-900 hover:text-white border border-emerald-300 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95">
                        <i class="fa-brands fa-whatsapp text-emerald-600 text-xs"></i> <span>واتساب</span>
                    </button>
                    <button type="button" data-lc-trigger="1" onclick="openBulkDriverDispatchPopover(this)" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-900 hover:text-white border border-indigo-200 py-2 px-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95">
                        <i class="fa-solid fa-motorcycle text-indigo-600"></i> <span>للمندوب</span>
                    </button>
                </div>

                <!-- الصف 2: تحويل الحالة الجماعي بألوان هادئة متناسقة -->
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    <button type="button" onclick="bulkChangeStatus('new')" class="bg-slate-50 hover:bg-blue-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[10px] font-black transition-all active:scale-95">🆕 جديد</button>
                    <button type="button" onclick="bulkChangeStatus('processing')" class="bg-slate-50 hover:bg-amber-500 text-slate-700 hover:text-slate-950 border border-slate-200 py-1.5 px-2 rounded-xl text-[10px] font-black transition-all active:scale-95">⏳ تجهيز</button>
                    <button type="button" onclick="bulkChangeStatus('deferred')" class="bg-slate-50 hover:bg-orange-500 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[10px] font-black transition-all active:scale-95">📅 مؤجل</button>
                    <button type="button" onclick="bulkChangeStatus('no_answer')" class="bg-slate-50 hover:bg-purple-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[10px] font-black transition-all active:scale-95">📵 لم يرد</button>
                    <button type="button" onclick="bulkChangeStatus('completed')" class="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 py-1.5 px-2 rounded-xl text-[10px] font-black transition-all shadow-sm active:scale-95">✅ مكتمل</button>
                    <button type="button" onclick="bulkChangeStatus('trash')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 py-1.5 px-2 rounded-xl text-[10px] font-black transition-all active:scale-95"><i class="fa-solid fa-trash ml-0.5"></i> سلة</button>
                </div>
            `;
        }

    };

    window.toggleAdvancedFiltersDrawer = function () {
        const drawer = document.getElementById('so-advanced-filters-drawer');
        if (!drawer) return;
        window.ordersFilterState.filtersOpen = !window.ordersFilterState.filtersOpen;
        window.ordersFilterState.filtersExpanded = window.ordersFilterState.filtersOpen;
        if (window.ordersFilterState.filtersOpen) {
            populateOrdersToolbarDropdowns();
            drawer.classList.remove('hidden');
        } else {
            drawer.classList.add('hidden');
        }
    };

    window.setOrdersQuickFilter = function (key, val) {
        window.ordersFilterState[key] = val;
        window.ordersRenderLimit = 30;
        const hasActiveFilter = (
            window.ordersFilterState.batch !== 'all' ||
            window.ordersFilterState.zone !== 'all' ||
            window.ordersFilterState.payment !== 'all' ||
            window.ordersFilterState.driver !== 'all' ||
            (document.getElementById('search-order')?.value || '').trim() !== ''
        );
        const resetBtn = document.getElementById('so-btn-reset-filters');
        const dot = document.getElementById('so-active-filters-dot');
        if (resetBtn) {
            if (hasActiveFilter) resetBtn.classList.remove('hidden');
            else resetBtn.classList.add('hidden');
        }
        if (dot) {
            if (hasActiveFilter) dot.classList.remove('hidden');
            else dot.classList.add('hidden');
        }
        window.renderOrdersList();
    };

    window.resetAllOrdersFilters = function () {
        window.ordersFilterState.batch = 'all';
        window.ordersFilterState.zone = 'all';
        window.ordersFilterState.payment = 'all';
        window.ordersFilterState.driver = 'all';
        window.ordersRenderLimit = 30;
        if (document.getElementById('so-filter-batch')) document.getElementById('so-filter-batch').value = 'all';
        if (document.getElementById('so-filter-zone')) document.getElementById('so-filter-zone').value = 'all';
        if (document.getElementById('so-filter-payment')) document.getElementById('so-filter-payment').value = 'all';
        if (document.getElementById('so-filter-driver')) document.getElementById('so-filter-driver').value = 'all';
        if (document.getElementById('search-order')) document.getElementById('search-order').value = '';
        document.getElementById('so-btn-reset-filters')?.classList.add('hidden');
        document.getElementById('so-active-filters-dot')?.classList.add('hidden');
        window.renderOrdersList();
    };

    window.toggleOrdersCompactMode = function () {
        window.ordersFilterState.compactMode = !window.ordersFilterState.compactMode;
        const btn = document.getElementById('so-btn-compact');
        if (btn) {
            btn.className = window.ordersFilterState.compactMode
                ? 'bg-sky-500 text-slate-950 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1';
            btn.innerHTML = window.ordersFilterState.compactMode
                ? '<i class="fa-solid fa-expand text-[10px]"></i> تفصيلي'
                : '<i class="fa-solid fa-compress text-sky-400 text-[10px]"></i> مدمج';
        }
        window.renderOrdersList();
    };
    window.toggleCompactOrdersMode = window.toggleOrdersCompactMode;

    window.toggleSelectAllVisibleOrders = function () {
        const cbs = Array.from(document.querySelectorAll('.bulk-order-cb'));
        if (cbs.length === 0) return;
        const allChecked = cbs.every(cb => cb.checked);
        cbs.forEach(cb => { cb.checked = !allChecked; });
        window.toggleBulkActionBar();
    };

    window.clearAllBulkSelections = function () {
        document.querySelectorAll('.bulk-order-cb').forEach(cb => { cb.checked = false; });
        window.toggleBulkActionBar();
    };

    function populateOrdersToolbarDropdowns() {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};

        const activeOrders = ordersList.filter(o => o && o.status !== 'trash' && !o.isArchived);

        const batchSelect = document.getElementById('so-filter-batch');
        if (batchSelect) {
            const curB = window.ordersFilterState.batch;
            const batchCounts = {};
            Object.values(batchesObj).forEach(b => {
                if (b && b.name && b.name !== 'undefined') batchCounts[b.name.trim()] = 0;
            });
            let normalCount = 0;
            activeOrders.forEach(o => {
                const bName = getOrderBatchTitle(o);
                if (bName) batchCounts[bName] = (batchCounts[bName] || 0) + 1;
                else normalCount++;
            });

            let bHtml = `<option value="all">🏷️ كل الدفعات والفوري (${activeOrders.length})</option>`;
            bHtml += `<option value="batches_only" ${curB === 'batches_only' ? 'selected' : ''}>📌 طلبات الدفعات فقط</option>`;
            bHtml += `<option value="normal_only" ${curB === 'normal_only' ? 'selected' : ''}>❄️ فوري بدون دفعة (${normalCount})</option>`;
            Object.keys(batchCounts).forEach(bName => {
                bHtml += `<option value="${bName}" ${curB === bName ? 'selected' : ''}>🏷️ ${bName} (${batchCounts[bName]})</option>`;
            });
            batchSelect.innerHTML = bHtml;
            batchSelect.value = curB;
        }

        const zoneSelect = document.getElementById('so-filter-zone');
        if (zoneSelect) {
            const curZ = window.ordersFilterState.zone;
            const zoneCounts = {};
            activeOrders.forEach(o => {
                const z = (o.zone || 'غير مسجل').trim();
                zoneCounts[z] = (zoneCounts[z] || 0) + 1;
            });
            let zHtml = `<option value="all">📍 كل المناطق</option>`;
            Object.keys(zoneCounts).sort((a, b) => zoneCounts[b] - zoneCounts[a]).forEach(z => {
                zHtml += `<option value="${z}" ${curZ === z ? 'selected' : ''}>📍 ${z} (${zoneCounts[z]})</option>`;
            });
            zoneSelect.innerHTML = zHtml;
            zoneSelect.value = curZ;
        }

        const driverSelect = document.getElementById('so-filter-driver');
        if (driverSelect) {
            const curD = window.ordersFilterState.driver;
            const driverCounts = {};
            (storeSettings?.drivers || []).forEach(d => {
                if (d && d.name) driverCounts[d.name.trim()] = 0;
            });
            activeOrders.forEach(o => {
                if (o.driverName && o.driverName.trim() !== '') {
                    const dName = o.driverName.trim();
                    driverCounts[dName] = (driverCounts[dName] || 0) + 1;
                }
            });
            let dHtml = `<option value="all">🛵 كل المناديب</option>`;
            dHtml += `<option value="unassigned" ${curD === 'unassigned' ? 'selected' : ''}>⏳ بدون مندوب</option>`;
            Object.keys(driverCounts).forEach(dName => {
                dHtml += `<option value="${dName}" ${curD === dName ? 'selected' : ''}>🛵 ${dName} (${driverCounts[dName]})</option>`;
            });
            driverSelect.innerHTML = dHtml;
            driverSelect.value = curD;
        }
    }

    // =========================================================================
    // 🛵 4. نافذة وتوجيه الطلب للمندوب بخطوة واحدة (بدون إجبارك على فتح واتساب)
    window.triggerOrderDriverStep = function (btnEl, orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;
        if (typeof window.orderHasPendingWeight === 'function' && window.orderHasPendingWeight(order)) {
            if (typeof window.showToast === 'function') window.showToast('⚖️ يجب تسكين أوزان هذا الطلب أولاً قبل خروجه مع المندوب!');
            window.openAssignPendingWeightsModal(orderId);
            return;
        }


        const drivers = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
        if (drivers.length === 0) {
            if (typeof window.openDispatchModal === 'function') {
                return window.openDispatchModal();
            }
            return alert('يرجى إضافة مندوب واحد على الأقل من إعدادات المتجر أولاً!');
        }

        if (typeof window.openLivePopover === 'function') {
            const drvButtons = drivers.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\\'");
                const safePhone = (d.phone || '').replace(/'/g, "\\'");
                return `
                <div class="flex gap-1.5">
                    <button type="button" onclick="assignSingleOrderToDriver('${orderId}', '${safeName}', '${safePhone}', false)" class="flex-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-900 hover:text-white py-2 px-3 rounded-xl text-xs font-black text-right transition-all flex items-center justify-between shadow-sm">
                        <span>🛵 ${d.name}</span>
                        <span class="text-[10px] opacity-80">نقل مباشر ⚡</span>
                    </button>
                    <button type="button" onclick="assignSingleOrderToDriver('${orderId}', '${safeName}', '${safePhone}', true)" class="bg-[#25D366] hover:bg-[#1ebd57] text-white px-3 rounded-xl text-xs font-black flex items-center justify-center shadow-sm" title="نقل للطريق مع إرسال رسالة واتساب للمندوب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                </div>`;
            }).join('');

            const html = `
                <div class="space-y-2.5">
                    <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span class="text-xs font-black text-indigo-800"><i class="fa-solid fa-motorcycle ml-1"></i> اختر المندوب للنقل الفوري</span>
                        <button type="button" onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <p class="text-[11px] font-bold text-slate-600">العميل: <strong class="text-slate-800">${order.customerName || ''}</strong> (${order.zone || ''})</p>
                    <div class="space-y-1.5 max-h-52 overflow-y-auto custom-scroll">${drvButtons}</div>
                    <button type="button" onclick="closeLivePopover(); markOrderDirectPickup('${orderId}');" class="w-full bg-emerald-50 hover:bg-emerald-600 text-emerald-900 hover:text-white border border-emerald-200 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-between shadow-sm">
                        <span>🏠 استلام من المزرعة / باليد</span>
                        <span class="text-[10px] opacity-80">بدون دليفري ✓</span>
                    </button>
                    <button type="button" onclick="closeLivePopover(); openDispatchModal();" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl text-[10px] font-black mt-1">
                        📋 فتح شاشة التوجيه الجماعي للمناديب
                    </button>
                </div>
            `;
            return window.openLivePopover(btnEl, html);
        }

        if (typeof window.openDispatchModal === 'function') {
            window.openDispatchModal();
        }
    };

    window.assignSingleOrderToDriver = async function (orderId, driverName, driverPhone, sendWa = false) {
        if (typeof window.closeLivePopover === 'function') window.closeLivePopover();
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        try {
            await db.collection('orders').doc(orderId).update({
                driverName: driverName,
                driverPhone: driverPhone || '',
                status: 'dispatched',
                dispatchedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            order.driverName = driverName;
            order.driverPhone = driverPhone || '';
            order.status = 'dispatched';
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId].driverName = driverName;
                globalOrdersMap[orderId].driverPhone = driverPhone || '';
                globalOrdersMap[orderId].status = 'dispatched';
            }

            if (sendWa && driverPhone) {
                const itemsStr = Array.isArray(order.items) ? order.items.map(i => `${i.quantity}x ${i.name}`).join(' + ') : '';
                const payBr = (typeof window.getOrderPaymentBreakdown === 'function')
                    ? window.getOrderPaymentBreakdown(order)
                    : { method: order.paymentMethod || 'cash', cash: Number(order.total) || 0, online: 0 };

                const totalToCollect = payBr.method === 'online'
                    ? '0 ج.م (الحساب خالص أونلاين ✅)'
                    : (payBr.method === 'split'
                        ? `${payBr.cash} ج.م كاش (ومدفوع ${payBr.online} ج محفظة ✅)`
                        : `${order.total || 0} ج.م`);

                const msg = `*🛵 طلب توصيل - سمان ههيا*\n👤 العميل: ${order.customerName || ''}\n📞 موبايل: ${order.customerPhone || ''}${order.customerPhone2 ? '\n📱 بديل: ' + order.customerPhone2 : ''}\n📍 العنوان: ${order.zone || ''} - ${order.customerAddress || ''}\n📦 الأصناف: ${itemsStr}\n💰 المطلوب تحصيله: *${totalToCollect}*${order.driverNote ? '\n⚠️ ملاحظة: ' + order.driverNote.split('\n---\n').pop() : ''}`;
                const cleanP = driverPhone.toString().trim();
                const waNum = cleanP.startsWith('0') ? '2' + cleanP : cleanP;
                window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
            }

            window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
            if (typeof window.showToast === 'function') window.showToast(`🛵 خرج الطلب مع المندوب: ${driverName}`);
        } catch (e) {
            alert('حدث خطأ أثناء توجيه الطلب للمندوب!');
        }
    };
      window.markOrderDirectPickup = async function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (!order) return;
        try {
            const patch = {
                deliveryType: 'pickup',
                driverName: firebase.firestore.FieldValue.delete(),
                driverPhone: firebase.firestore.FieldValue.delete()
            };
            if (!order.zone || order.zone === 'غير مسجل') {
                patch.zone = 'استلام من المزرعة / باليد';
                order.zone = 'استلام من المزرعة / باليد';
            }
            delete order.driverName;
            delete order.driverPhone;
            order.deliveryType = 'pickup';
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                delete globalOrdersMap[orderId].driverName;
                delete globalOrdersMap[orderId].driverPhone;
                globalOrdersMap[orderId].deliveryType = 'pickup';
                globalOrdersMap[orderId].zone = order.zone;
            }
            await db.collection('orders').doc(orderId).update(patch);
            if (typeof window.updateOrderStatus === 'function') {
                await window.updateOrderStatus(orderId, 'completed');
            }
            if (typeof window.showToast === 'function') {
                window.showToast('🏠 تم تسجيل الطلب كاستلام من المزرعة / باليد (بدون دليفري)!');
            }
        } catch (e) {
            alert('حدث خطأ أثناء تسجيل الاستلام باليد!');
        }
    };

  // =========================================================================
    // 💬 5. منظومة رسائل واتساب الـ 5 الذكية للعميل (تعمل بكبسولة شيك بدون مطّ الأزرار)
    // =========================================================================
    window.openWhatsAppTemplatesPopover = function (anchorEl, orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (!order) return;

        const html = `
            <div class="space-y-2">
                <div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
                    <span class="text-xs font-black text-emerald-800"><i class="fa-brands fa-whatsapp text-emerald-600 ml-1"></i> اختر رسالة واتساب لـ (${order.customerName || 'العميل'})</span>
                    <button type="button" onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="space-y-1.5">
                    <button type="button" onclick="closeLivePopover(); sendQuickWhatsAppOption('${orderId}', 'invoice')" class="w-full bg-emerald-50 hover:bg-emerald-600 text-emerald-950 hover:text-white py-2 px-3 rounded-xl text-[11px] font-black text-right transition-all flex items-center justify-between border border-emerald-200/80">
                        <span>🧾 1. إرسال الفاتورة وتفاصيل الطلب</span>
                        <i class="fa-solid fa-paper-plane text-[10px]"></i>
                    </button>
                    <button type="button" onclick="closeLivePopover(); sendQuickWhatsAppOption('${orderId}', 'on_way')" class="w-full bg-indigo-50 hover:bg-indigo-600 text-indigo-950 hover:text-white py-2 px-3 rounded-xl text-[11px] font-black text-right transition-all flex items-center justify-between border border-indigo-200/80">
                        <span>🛵 2. الطلب خرج وفي الطريق مع المندوب</span>
                        <i class="fa-solid fa-motorcycle text-[10px]"></i>
                    </button>
                    <button type="button" onclick="closeLivePopover(); sendQuickWhatsAppOption('${orderId}', 'no_answer')" class="w-full bg-purple-50 hover:bg-purple-600 text-purple-950 hover:text-white py-2 px-3 rounded-xl text-[11px] font-black text-right transition-all flex items-center justify-between border border-purple-200/80">
                        <span>📵 3. رنينا عليك ولم يتم الرد (تأكيد الموعد)</span>
                        <i class="fa-solid fa-phone-slash text-[10px]"></i>
                    </button>
                    <button type="button" onclick="closeLivePopover(); sendQuickWhatsAppOption('${orderId}', 'deferred')" class="w-full bg-orange-50 hover:bg-orange-600 text-orange-950 hover:text-white py-2 px-3 rounded-xl text-[11px] font-black text-right transition-all flex items-center justify-between border border-orange-200/80">
                        <span>📅 4. تأكيد تأجيل وجدولة موعد التسليم</span>
                        <i class="fa-regular fa-calendar-check text-[10px]"></i>
                    </button>
                    <button type="button" onclick="closeLivePopover(); sendQuickWhatsAppOption('${orderId}', 'prepay')" class="w-full bg-amber-50 hover:bg-amber-500 text-amber-950 hover:text-white py-2 px-3 rounded-xl text-[11px] font-black text-right transition-all flex items-center justify-between border border-amber-200/80">
                        <span>💳 5. طلب تحويل دفعة/الحساب (فودافون كاش)</span>
                        <i class="fa-solid fa-wallet text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;

        if (typeof window.openLivePopover === 'function') {
            window.openLivePopover(anchorEl, html);
        } else {
            window.sendMessageToCustomer(order.customerPhone, order.id);
        }
    };

    window.sendQuickWhatsAppOption = function (orderId, templateType) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        if (templateType === 'invoice') {
            return window.sendMessageToCustomer(order.customerPhone, order.id);
        }

        const cName = order.customerName || 'فندم';
        const itemsText = (order.items && Array.isArray(order.items)) ? order.items.map(i => `${i.quantity}x ${i.name}`).join(' + ') : '';
        const total = order.total || 0;
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const payBr = (typeof window.getOrderPaymentBreakdown === 'function')
            ? window.getOrderPaymentBreakdown(order)
            : { method: order.paymentMethod || 'cash', cash: total, online: 0 };

        let msg = '';

        if (templateType === 'on_way') {
            const drvInfo = order.driverName ? `مع المندوب (${order.driverName}${order.driverPhone ? ' - ' + order.driverPhone : ''})` : 'مع المندوب الآن';
            const collectTxt = payBr.method === 'online'
                ? '0 ج (خالص أونلاين ✅)'
                : (payBr.method === 'split' ? `${payBr.cash} ج كاش (ومدفوع ${payBr.online} ج محفظة ✅)` : `${total} ج.م`);
            msg = `أهلاً بحضرتك يا ${cName} 🌹\nأوردر "سمان ههيا" خرج لحضرتك وفي الطريق إليك ${drvInfo} 🛵\n\n📦 الأصناف: ${itemsText}\n💰 المطلوب عند الاستلام: ${collectTxt}\n\nيرجى إبقاء الهاتف متاحاً، وتشرفنا بخدمتك!`;
        } else if (templateType === 'no_answer') {
            msg = `أهلاً بحضرتك يا ${cName} 🌹\nحاولنا الاتصال بحضرتك لتنسيق تسليم أوردر "سمان ههيا" (${itemsText}) ولكن الهاتف غير متاح أو لم يتم الرد 📵\n\nيرجى التواصل معنا هنا لتأكيد الموعد المناسب للاستلام.`;
        } else if (templateType === 'deferred') {
            const schedTxt = order.deferredDisplayStr ? `ليوم (${order.deferredDisplayStr})` : 'للموعد المتفق عليه';
            msg = `أهلاً بحضرتك يا ${cName} 🌹\nتم تأكيد جدولة وتأجيل تسليم أوردر "سمان ههيا" الخاص بحضرتك (${itemsText}) ${schedTxt} 📅\n\n💰 الإجمالي: ${total} ج.م\nسنتواصل معك قبل خروج الطلب، وتشرفنا بخدمتك دائماً 🤍`;
        } else if (templateType === 'prepay') {
            msg = `أهلاً بحضرتك يا ${cName} 🌹\nلتأكيد تجهيز وحجز أوردر "سمان ههيا" الخاص بحضرتك:\n📦 الأصناف: ${itemsText}\n💰 الإجمالي: ${total} ج.م\n\nيرجى تحويل قيمة الطلب على فودافون كاش / إنستاباي على الرقم:\n*${storePhone}*\nوإرسال صورة التحويل هنا لتأكيد التجهيز فوراً ✅`;
        }

        const cleanPhone = (order.customerPhone || '').toString().trim();
        const waNumber = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;
        if (waNumber) {
            window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            alert('لا يوجد رقم هاتف مسجل للعميل!');
        }
    };

    // =========================================================================
    // 💬 استوديو الملاحظات الموحّد بالألوان بلمسة واحدة (متطابق 100% مع مركز الملاحظات)
    // 🔵 أزرق: العميل كتب | 🟣 بنفسجي: أنا كتبت (إداري) | 🟠 برتقالي: للعاملين والمندوب | ⚪ رمادي: السيستم
    // =========================================================================
    function escapeOrdNoteHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function classifyOrderNoteSafe(rawChunk, sourceField) {
        if (typeof window.classifySmanNoteChunk === 'function') {
            return window.classifySmanNoteChunk(rawChunk, sourceField);
        }
        const str = String(rawChunk || '').trim();
        const m = str.match(/^\[([^\]]+)\]\s*(.*)$/s);
        const timeLabel = m ? m[1].trim() : '';
        const body = m ? m[2].trim() : str;

        if (sourceField === 'driverNote') {
            return {
                role: 'worker',
                badge: '👷 للعاملين / المندوب',
                wrapCls: 'bg-orange-50/90 border border-orange-200 border-r-4 border-r-orange-500 text-orange-950',
                badgeCls: 'bg-orange-500 text-white',
                timeLabel,
                body: body.replace(/^👷\s*(?:للعاملين\/المندوب|للمندوب|توجيه)?\s*:?\s*/i, '').trim() || body
            };
        }
        if (body.includes('📌 ملاحظة العميل') || body.includes('🚨 تعديل العميل') || body.startsWith('👤 العميل')) {
            return {
                role: 'client',
                badge: '👤 العميل كتب',
                wrapCls: 'bg-sky-50/95 border border-sky-200 border-r-4 border-r-sky-500 text-sky-950',
                badgeCls: 'bg-sky-600 text-white',
                timeLabel,
                body: body.replace(/^📌\s*ملاحظة العميل\s*:?\s*/i, '').replace(/^👤\s*العميل\s*:?\s*/i, '').trim() || body
            };
        }
        if (body.includes('⭐️ تقييم') || body.includes('تقييم الخدمة')) {
            return {
                role: 'rating',
                badge: '⭐️ تقييم العميل',
                wrapCls: 'bg-amber-50/80 border border-amber-200 border-r-4 border-r-amber-500 text-amber-950',
                badgeCls: 'bg-amber-500 text-slate-950',
                timeLabel,
                body
            };
        }
        if (
            body.includes('🎁 العميل فعّل') || body.includes('🎁 العميل استبدل') ||
            body.includes('🎟 كود الخصم') || body.includes('⏳ مطلوب للدفعة القادمة') ||
            body.includes('✅ العميل أكد استلام') || body.includes('✅ تمت المراجعة') ||
            body.includes('[تنبيه مالي]')
        ) {
            return {
                role: 'system',
                badge: '⚙️ سجل السيستم',
                wrapCls: 'bg-slate-50 border border-slate-200 border-r-4 border-r-slate-300 text-slate-600',
                badgeCls: 'bg-slate-200 text-slate-700',
                timeLabel,
                body
            };
        }
        return {
            role: 'admin',
            badge: '🛡️ أنا كتبت (إداري)',
            wrapCls: 'bg-purple-50/90 border border-purple-200 border-r-4 border-r-purple-600 text-purple-950',
            badgeCls: 'bg-purple-600 text-white',
            timeLabel,
            body: body.replace(/^🛡️\s*(?:إداري|أنا)?\s*:?\s*/i, '').trim() || body
        };
    }

    function summarizeOrderColorNotes(o) {
        const client = [];
        const admin = [];
        const worker = [];
        const system = [];

        if (o && o.adminNote) {
            String(o.adminNote).split('\n---\n').filter(c => c.trim()).forEach(ch => {
                const info = classifyOrderNoteSafe(ch, 'adminNote');
                if (info.role === 'client') client.push(info);
                else if (info.role === 'admin') admin.push(info);
                else if (info.role !== 'rating') system.push(info);
            });
        }
        if (o && o.driverNote) {
            String(o.driverNote).split('\n---\n').filter(c => c.trim()).forEach(ch => {
                worker.push(classifyOrderNoteSafe(ch, 'driverNote'));
            });
        }

        return {
            client,
            admin,
            worker,
            system,
            humanCount: client.length + admin.length + worker.length
        };
    }

    window.toggleInlineNotes = function (e, orderId, field, forceReopen = false) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        const container = document.getElementById(`inline-notes-container-${orderId}`);
        if (!container) return;

        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (!field) {
            const sum = summarizeOrderColorNotes(order);
            if (sum.worker.length > 0 && sum.client.length === 0 && sum.admin.length === 0) {
                field = 'driverNote';
            } else if (sum.client.length > 0 || sum.admin.length > 0) {
                field = 'adminNote';
            } else {
                field = 'driverNote';
            }
        }

        if (!forceReopen && openInlineNoteId === orderId && !container.classList.contains('hidden')) {
            container.classList.add('hidden');
            openInlineNoteId = null;
            openInlineNoteField = null;
            return;
        }

        if (openInlineNoteId && openInlineNoteId !== orderId) {
            const oldContainer = document.getElementById(`inline-notes-container-${openInlineNoteId}`);
            if (oldContainer) oldContainer.classList.add('hidden');
        }

        openInlineNoteId = orderId;
        openInlineNoteField = field;
        container.classList.remove('hidden');
        window.renderInlineNotesContent(orderId, field);
    };

    window.renderInlineNotesContent = function (orderId, field) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        const container = document.getElementById(`inline-notes-content-${orderId}`);
        if (!order || !container) return;

        const isDriver = (field === 'driverNote');
        const drvChunks = (order.driverNote || '').split('\n---\n').filter(c => c.trim() !== '');
        const admChunks = (order.adminNote || '').split('\n---\n').filter(c => c.trim() !== '');
        const sum = summarizeOrderColorNotes(order);

        const quickTags = isDriver
            ? ['📞 اتصل قبل الوصول', '🏠 العميل هينزل يستلم', '💵 الدفع كاش', '💳 هيحول فودافون كاش', '⏰ التوصيل بعد العصر', '📦 تغليف خاص']
            : ['⚡ مستعجل اليوم', '💳 تم استلام التحويل', '🎁 خصم واجب خاص', '📞 تم التأكيد تليفونياً', '❄️ مجهز في الفريزر', '📕 باقي حساب آجل'];

        const chunks = isDriver ? drvChunks : admChunks;

        const notesListHtml = chunks.length > 0
            ? chunks.map((chunk, idx) => {
                const info = classifyOrderNoteSafe(chunk, field);
                const safeBody = escapeOrdNoteHtml(info.body);
                const formattedTxt = typeof window.formatTags === 'function' ? window.formatTags(safeBody) : safeBody;

                return `
                <div class="${info.wrapCls} px-2.5 py-2 rounded-xl flex items-start justify-between gap-2 shadow-sm">
                    <div class="space-y-1 flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="${info.badgeCls} px-2 py-0.5 rounded-md text-[9px] font-black">${info.badge}</span>
                            ${info.timeLabel ? `<span class="text-[9px] font-black opacity-70">${escapeOrdNoteHtml(info.timeLabel)}</span>` : ''}
                        </div>
                        <div class="text-[11px] font-black leading-snug whitespace-pre-wrap">${formattedTxt}</div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button type="button" onclick="event.stopPropagation(); editInlineNoteChunk('${orderId}', '${field}', ${idx})" class="bg-white/90 hover:bg-blue-600 text-slate-600 hover:text-white border border-slate-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors">تعديل</button>
                        <button type="button" onclick="event.stopPropagation(); deleteInlineNoteChunk('${orderId}', '${field}', ${idx})" class="bg-white/90 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('')
            : `<div class="text-center py-2.5 text-[10px] text-slate-400 font-bold bg-white/80 rounded-xl border border-dashed border-slate-200">${isDriver ? 'لا توجد توجيهات للعاملين/المندوب بعد — اختر جملة سريعة أو اكتب بالأسفل.' : 'لا توجد ملاحظات إدارية أو من العميل بعد — اختر جملة سريعة أو اكتب بالأسفل.'}</div>`;

        const quickChipsHtml = quickTags.map(tag => {
            const safeTag = tag.replace(/'/g, "\\'");
            return `
                <button type="button" onclick="event.stopPropagation(); instantSaveQuickNote('${orderId}', '${field}', '${safeTag}')" class="${isDriver ? 'bg-white hover:bg-orange-500 text-orange-950 hover:text-white border-orange-200' : 'bg-white hover:bg-purple-600 text-purple-950 hover:text-white border-purple-200'} border px-2 py-1 rounded-lg text-[10px] font-black transition-all shadow-sm active:scale-95">
                    + ${tag}
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div onclick="event.stopPropagation()" class="p-2.5 ${isDriver ? 'bg-orange-50/85 border-orange-300' : 'bg-purple-50/80 border-purple-300'} border rounded-2xl space-y-2 shadow-inner mt-1">
                <div class="flex items-center justify-between gap-2 pb-1.5 border-b ${isDriver ? 'border-orange-200/80' : 'border-purple-200/80'}">
                    <div class="flex flex-wrap items-center gap-1">
                        <button type="button" onclick="openInlineNoteField='driverNote'; renderInlineNotesContent('${orderId}', 'driverNote')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${isDriver ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-orange-50'}">
                            🟠 للعاملين / المندوب ${drvChunks.length > 0 ? `(${drvChunks.length})` : ''}
                        </button>
                        <button type="button" onclick="openInlineNoteField='adminNote'; renderInlineNotesContent('${orderId}', 'adminNote')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${!isDriver ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-purple-50'}">
                            🟣 لي (إداري)${sum.client.length > 0 ? ` + 🔵 عميل (${sum.client.length})` : (admChunks.length > 0 ? ` (${admChunks.length})` : '')}
                        </button>
                    </div>
                    <button type="button" onclick="document.getElementById('inline-notes-container-${orderId}').classList.add('hidden'); openInlineNoteId = null;" class="w-6 h-6 rounded-lg bg-white text-slate-500 hover:bg-red-500 hover:text-white flex items-center justify-center shadow-sm shrink-0">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </div>

                <div class="space-y-1.5 max-h-44 overflow-y-auto custom-scroll">${notesListHtml}</div>

                <div class="flex flex-wrap gap-1">${quickChipsHtml}</div>

                <div class="flex gap-1.5">
                    <input type="text" id="inline-input-${orderId}" onkeydown="if(event.key==='Enter'){event.preventDefault(); saveInlineNote('${orderId}', '${field}');}" class="flex-1 border ${isDriver ? 'border-orange-300 focus:border-orange-500' : 'border-purple-300 focus:border-purple-600'} rounded-xl px-2.5 py-1.5 text-xs font-black bg-white text-slate-800 outline-none" placeholder="${isDriver ? '🟠 اكتب توجيهاً للعاملين / المندوب...' : '🟣 اكتب ملاحظتك الإدارية الخاصة...'}">
                    <button type="button" onclick="saveInlineNote('${orderId}', '${field}')" class="${isDriver ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'} px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm shrink-0 transition-colors">
                        حفظ
                    </button>
                </div>
            </div>
        `;
    };

    window.instantSaveQuickNote = async function (orderId, field, noteText) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (!order || !noteText) return;

        const dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const roleIcon = field === 'driverNote' ? '👷' : '🛡️';
        const formattedNote = `[${dateStr}] ${roleIcon} ${noteText.trim()}`;
        const currentText = order[field] || '';
        const updatedText = currentText ? `${currentText}\n---\n${formattedNote}` : formattedNote;

        order[field] = updatedText;
        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
            globalOrdersMap[orderId][field] = updatedText;
        }

        window.renderOrdersList();
        if (typeof window.showToast === 'function') {
            window.showToast(field === 'driverNote' ? `🟠 أُضيفت للعاملين/المندوب: ${noteText}` : `🟣 أُضيفت لملاحظاتك الإدارية: ${noteText}`);
        }

        try {
            await db.collection('orders').doc(orderId).update({ [field]: updatedText });
        } catch (e) {}
    };

    window.saveInlineNote = async function (orderId, field) {
        const input = document.getElementById(`inline-input-${orderId}`);
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await window.instantSaveQuickNote(orderId, field, text);
    };

    window.clearSingleNoteFieldQuick = async function (orderId, field) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (!order || !order[field]) return;
        const titleAr = field === 'driverNote' ? 'توجيهات العاملين والمندوب' : 'الملاحظات الإدارية';
        if (!confirm(`مسح ${titleAr} من هذا الطلب؟`)) return;

        order[field] = '';
        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
            globalOrdersMap[orderId][field] = '';
        }
        window.renderOrdersList();
        try {
            await db.collection('orders').doc(orderId).update({ [field]: '' });
        } catch (e) {}
    };

    // =========================================================================
    // 🚀 6. المحرك البريميوم الشيك لبطاقات الطلبات (الطلب واضح وبارز + أزرار رشيقة + أيقونة ملاحظة واحدة)
    // =========================================================================
    window.renderOrdersList = function () {
        window.initSmartOrdersToolbar();
        if (window.ordersFilterState.filtersOpen) {
            populateOrdersToolbarDropdowns();
        }

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

        let filteredBase = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => {
            if (!o || o.status === 'trash' || o.isArchived) return false;

            const realBatchTitle = getOrderBatchTitle(o);
            const bNameSearch = realBatchTitle ? realBatchTitle : (o.customTag ? `تاج مخصص: ${o.customTag}` : 'أوردرات عادية');

            if (fState.batch !== 'all') {
                if (fState.batch === 'batches_only' && !realBatchTitle) return false;
                if (fState.batch === 'normal_only' && realBatchTitle) return false;
                if (fState.batch !== 'batches_only' && fState.batch !== 'normal_only' && realBatchTitle !== fState.batch) return false;
            }
            if (fState.zone !== 'all' && (o.zone || 'غير مسجل').trim() !== fState.zone) return false;
            if (fState.payment !== 'all') {
                if (fState.payment === 'online' && o.paymentMethod !== 'online') return false;
                if (fState.payment === 'split' && o.paymentMethod !== 'split') return false;
                if (fState.payment === 'cash' && (o.paymentMethod === 'online' || o.paymentMethod === 'split')) return false;
                if (fState.payment === 'has_debt' && !(Number(o.debt) > 0)) return false;
                if (fState.payment === 'has_discount' && !(Number(o.discount) > 0)) return false;
            }
            if (fState.driver !== 'all') {
                if (fState.driver === 'unassigned' && o.driverName) return false;
                if (fState.driver !== 'unassigned' && (o.driverName || '').trim() !== fState.driver) return false;
            }

            let normPhone1 = window.normalizePhone ? window.normalizePhone(o.customerPhone) : (o.customerPhone || '');

            if (filterWords.length > 0 || exactPhrases.length > 0) {
                let itemsString = (o.items && Array.isArray(o.items)) ? o.items.map(i => i.name).join(' ') : '';
                let normPhone2 = window.normalizePhone ? window.normalizePhone(o.customerPhone2) : (o.customerPhone2 || '');

                let searchStr = `${o.customerName || ''} ${o.customerPhone || ''} ${normPhone1} ${o.customerPhone2 || ''} ${normPhone2} ${bNameSearch} ${o.zone || ''} ${o.customerAddress || ''} ${o.driverName || ''} ${itemsString} ${o.adminNote || ''} ${o.driverNote || ''}`.toLowerCase();
                searchStr = searchStr.replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0);

                let matchSearch = filterWords.every(word => {
                    let engWord = word.replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0);
                    let normWord = window.normalizePhone ? window.normalizePhone(word) : word;
                    return searchStr.includes(engWord) || (normWord !== '' && normWord.length > 5 && searchStr.includes(normWord));
                });

                let matchExact = exactPhrases.every(p => {
                    let isBatch = bNameSearch.toLowerCase() === p;
                    let isZone = (o.zone || '').toLowerCase() === p;
                    let isName = (o.customerName || '').toLowerCase() === p;
                    let isItem = o.items ? o.items.some(i => i.name.toLowerCase() === p) : false;
                    return isBatch || isZone || isItem || isName || searchStr.includes(p);
                });

                if (!matchSearch || !matchExact) return false;
            }

            let matchSmart = true;
            if (typeof currentSmartFilter !== 'undefined' && currentSmartFilter === 'vip') {
                let c = (typeof customersData !== 'undefined' ? customersData : []).find(x => window.normalizePhone(x.phone) === normPhone1);
                matchSmart = c && (c.ordersCount >= 3 || c.totalSpent >= 1500);
            } else if (typeof currentSmartFilter !== 'undefined' && currentSmartFilter === 'high_value') {
                matchSmart = Number(o.total) >= 500;
            }

            if (matchSmart) {
                if (dynamicCounts[o.status] !== undefined) dynamicCounts[o.status]++;
                return true;
            }
            return false;
        });

        ['new', 'processing', 'dispatched', 'deferred', 'no_answer', 'completed', 'canceled'].forEach(s => {
            let b = document.getElementById(`badge-${s}`);
            if (b) b.innerText = dynamicCounts[s] || 0;
        });

        const totalNonCanceled = filteredBase.filter(o => o.status !== 'canceled').length;
        const tabAllBtn = document.getElementById('tab-all');
        if (tabAllBtn) {
            tabAllBtn.innerHTML = `الكل <span id="badge-all" class="mr-1 px-1.5 py-0.5 rounded-md text-[10px] font-black">${totalNonCanceled}</span>`;
        }

        let activeTab = (typeof currentOrderTab !== 'undefined') ? currentOrderTab : 'all';
        window.applyCrispOrderTabsVisuals(activeTab);

        let filtered = filteredBase.filter(o => (activeTab === 'all') || (o.status === activeTab));

        const getSafeOrderMs = (ord) => {
            if (!ord || !ord.createdAt) return 0;
            if (typeof ord.createdAt.toMillis === 'function') return ord.createdAt.toMillis();
            if (typeof ord.createdAt.seconds === 'number') return ord.createdAt.seconds * 1000;
            const parsed = new Date(ord.createdAt).getTime();
            return isNaN(parsed) ? 0 : parsed;
        };

        const getSafeCompletedMs = (ord) => {
            if (!ord) return 0;
            if (typeof ord.completedAtMs === 'number' && ord.completedAtMs > 0) return ord.completedAtMs;
            if (ord.completedAt) {
                if (typeof ord.completedAt.toMillis === 'function') return ord.completedAt.toMillis();
                if (typeof ord.completedAt.seconds === 'number') return ord.completedAt.seconds * 1000;
                const pComp = new Date(ord.completedAt).getTime();
                if (!isNaN(pComp)) return pComp;
            }
            if (ord.completedAtStr) {
                const pStr = new Date(ord.completedAtStr).getTime();
                if (!isNaN(pStr)) return pStr;
            }
            return getSafeOrderMs(ord);
        };

        const getCompletedDayBucket = (ord) => {
            const ms = getSafeCompletedMs(ord);
            if (!ms) return { key: 'unknown', label: 'تاريخ غير محدد', badge: 'تم التسليم' };
            const dt = new Date(ms);
            const today = new Date();
            const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const startOfDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
            const diffDays = Math.round((startOfToday - startOfDay) / 86400000);
            const timePart = dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
            const datePart = dt.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            if (diffDays === 0) return { key, label: `✅ مكتمل اليوم (${datePart})`, badge: `اكتمل اليوم • ${timePart}` };
            if (diffDays === 1) return { key, label: `📅 مكتمل أمس (${datePart})`, badge: `اكتمل أمس • ${timePart}` };
            return { key, label: `🗓️ مكتمل يوم ${datePart}`, badge: `اكتمل ${datePart}` };
        };

        let sortDir = (typeof ordersSortDirection !== 'undefined') ? ordersSortDirection : 'desc';
        filtered.sort((a, b) => {
            let timeA = (activeTab === 'completed') ? getSafeCompletedMs(a) : getSafeOrderMs(a);
            let timeB = (activeTab === 'completed') ? getSafeCompletedMs(b) : getSafeOrderMs(b);
            return sortDir === 'desc' ? (timeB - timeA) : (timeA - timeB);
        });


        let sumMeat = 0, sumEggs = 0, sumChicks = 0, sumMoney = 0;
        filtered.forEach(o => {
            if (o.status === 'canceled') return;
            sumMoney += Number(o.total) || 0;
            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const q = Number(i.quantity) || 0;
                    const t = classifyItemType(i);
                    if (t === 'egg') sumEggs += q;
                    else if (t === 'chick') sumChicks += q;
                    else sumMeat += q;
                });
            }
        });

        if (document.getElementById('so-sum-count')) document.getElementById('so-sum-count').innerText = filtered.length;
        if (document.getElementById('so-sum-meat')) document.getElementById('so-sum-meat').innerText = Number(sumMeat.toFixed(1));
        if (document.getElementById('so-sum-money')) document.getElementById('so-sum-money').innerText = sumMoney.toLocaleString() + ' ج';
        const exWrap = document.getElementById('so-sum-extras-wrap');
        if (exWrap) {
            let exParts = [];
            if (sumEggs > 0) exParts.push(`🥚 بيض: <strong class="text-amber-300">${sumEggs}</strong>`);
            if (sumChicks > 0) exParts.push(`🐣 كتاكيت: <strong class="text-sky-300">${sumChicks}</strong>`);
            if (exParts.length > 0) {
                exWrap.innerHTML = '| ' + exParts.join(' | ');
                exWrap.classList.remove('hidden');
            } else {
                exWrap.classList.add('hidden');
            }
        }

        const todayStrEn = new Date().toLocaleDateString('en-US');
        let compToday = 0;
        filteredBase.forEach(o => {
            if (o.status === 'completed' && (o.completedAtStr === todayStrEn || o.orderDate === todayStrEn)) {
                compToday++;
            }
        });
        const activePipelineTotal = dynamicCounts.new + dynamicCounts.processing + dynamicCounts.dispatched + compToday;
        const progPct = activePipelineTotal > 0 ? Math.min(100, Math.round(((compToday + (dynamicCounts.dispatched * 0.6) + (dynamicCounts.processing * 0.3)) / activePipelineTotal) * 100)) : 100;

        if (document.getElementById('so-prog-pct')) document.getElementById('so-prog-pct').innerText = progPct + '%';
        if (document.getElementById('so-prog-bar')) document.getElementById('so-prog-bar').style.width = progPct + '%';
        if (document.getElementById('so-ready-dispatch-cnt')) document.getElementById('so-ready-dispatch-cnt').innerText = dynamicCounts.processing || 0;
        if (document.getElementById('so-prog-details')) {
            document.getElementById('so-prog-details').innerText = `(جاهز: ${dynamicCounts.processing} • بالطريق: ${dynamicCounts.dispatched} • سُلّم اليوم: ${compToday})`;
        }

        if (filtered.length === 0) {
            if (!window._crmDataReady && (!allOrdersRaw || allOrdersRaw.length === 0)) {
                container.innerHTML = [1, 2, 3].map(() => `
                    <div class="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5">
                        <div class="flex justify-between items-center">
                            <div class="h-4 w-40 rounded-lg skeleton-shimmer"></div>
                            <div class="h-5 w-16 rounded-lg skeleton-shimmer"></div>
                        </div>
                        <div class="h-10 w-full rounded-xl skeleton-shimmer"></div>
                        <div class="flex justify-between items-center pt-1">
                            <div class="h-7 w-44 rounded-lg skeleton-shimmer"></div>
                            <div class="h-7 w-24 rounded-lg skeleton-shimmer"></div>
                        </div>
                    </div>
                `).join('');
                return;
            }
            container.innerHTML = '<div class="text-center text-slate-400 py-16 font-bold border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">لا توجد طلبات مطابقة في هذا القسم.</div>';
            return;
        }

        if (typeof window.rebuildTrustCacheIfNeeded === 'function') {
            window.rebuildTrustCacheIfNeeded();
        }

        const isCompact = window.ordersFilterState.compactMode;
        const limitCount = window.ordersRenderLimit || 30;
        const visibleOrders = filtered.slice(0, limitCount);
        const remainingCount = filtered.length - visibleOrders.length;

        const statusBorderMap = {
            new: 'border-r-4 border-r-blue-500',
            processing: 'border-r-4 border-r-amber-500',
            dispatched: 'border-r-4 border-r-indigo-500',
            deferred: 'border-r-4 border-r-orange-500',
            no_answer: 'border-r-4 border-r-purple-500',
            completed: 'border-r-4 border-r-emerald-500',
            canceled: 'border-r-4 border-r-rose-400 opacity-85'
        };

        let lastCompletedDayKey = '';
        let cardsHtml = visibleOrders.map(o => {
            let completedDayHeaderHtml = '';
            if (activeTab === 'completed' && o.status === 'completed') {
                const cB = getCompletedDayBucket(o);
                if (cB.key !== lastCompletedDayKey) {
                    lastCompletedDayKey = cB.key;
                    completedDayHeaderHtml = `
                    <div class="sticky top-0 z-10 flex items-center gap-2 py-1.5 px-3 rounded-xl bg-emerald-900 text-amber-300 text-xs font-black shadow-sm">
                        <span>${cB.label}</span>
                    </div>`;
                }
            }
            const safeMs = getSafeOrderMs(o);
            let d = o.orderDate || (safeMs ? new Date(safeMs).toLocaleDateString('en-US') : 'غير محدد');
            let ageStr = getOrderAgeLabel(o);
            let realBatchTitle = getOrderBatchTitle(o);
            const rightAccentCls = statusBorderMap[o.status] || 'border-r-4 border-r-slate-400';

            const payBr = (typeof window.getOrderPaymentBreakdown === 'function')
                ? window.getOrderPaymentBreakdown(o)
                : { method: o.paymentMethod || 'cash', cash: Number(o.total) || 0, online: 0, total: Number(o.total) || 0 };

            let sBadge = o.status === 'new' ? '<span class="bg-blue-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">🆕 جديد</span>' :
                (o.status === 'processing' ? '<span class="bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">⏳ تجهيز</span>' :
                (o.status === 'dispatched' ? '<span class="bg-indigo-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">🛵 بالطريق</span>' :
                (o.status === 'deferred' ? '<span class="bg-orange-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">📅 مؤجل</span>' :
                (o.status === 'no_answer' ? '<span class="bg-purple-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">📵 لم يرد</span>' :
                (o.status === 'completed' ? '<span class="bg-emerald-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">✅ مكتمل</span>' :
                '<span class="bg-rose-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black shadow-sm">❌ ملغي</span>')))));

            let trustInfo = (typeof window.fastAnalyzeOrderTrust === 'function')
                ? window.fastAnalyzeOrderTrust(o)
                : { cardClass: 'bg-white border-slate-100', badgeHtml: '', bannerHtml: '', stickyHtml: '' };

            const originMeta = getOrderOriginMeta(o);
            const originDotHtml = `<button type="button" data-lc-trigger="1" onclick="event.stopPropagation(); showOrderOriginPopover(this, '${o.id}')" title="${originMeta.title}" class="w-5 h-5 -mx-0.5 rounded-full hover:bg-slate-100 inline-flex items-center justify-center shrink-0 active:scale-90 transition-transform"><span class="w-2.5 h-2.5 rounded-full ${originMeta.dotCls} ring-2 block"></span></button>`;

            // 📱 1. وضع العرض المدمج السريع (Compact Mode - خاصية مستقلة)
            if (isCompact) {
                let compactStepBtn = '';
                if (o.status === 'new') compactStepBtn = `<button onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black">للتجهيز</button>`;
                else if (o.status === 'processing') compactStepBtn = `<button data-lc-trigger="1" onclick="event.stopPropagation(); triggerOrderDriverStep(this, '${o.id}')" class="bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black">للمندوب</button>`;
                else if (o.status === 'dispatched') compactStepBtn = `<button onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'completed')" class="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black">تسليم</button>`;

                const compactItemsPills = (o.items && Array.isArray(o.items) && o.items.length > 0)
                    ? o.items.map((i, idx) => `
                        <span data-item-idx="${idx}" class="bg-slate-100 hover:bg-emerald-50 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1">
                            <strong class="text-brand-primary">${i.quantity}x</strong> ${i.name}
                        </span>
                    `).join('')
                    : '<span class="text-[10px] text-slate-400 font-bold">بدون أصناف</span>';

                const compactPayBadge = payBr.method === 'online'
                    ? '<span class="bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black">خالص (أونلاين)</span>'
                    : (payBr.method === 'split'
                        ? `<span class="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[9px] font-black">⚖️ نص (${payBr.cash}ج كاش)</span>`
                        : '<span class="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-black">كاش</span>');

                return `${completedDayHeaderHtml}
                <div data-id="${o.id}" onclick="highlightOrderCard(this, event)" class="order-card ${trustInfo.cardClass} ${rightAccentCls} p-2.5
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                            <input type="checkbox" value="${o.id}" onchange="toggleBulkActionBar()" class="bulk-order-cb w-4 h-4 accent-brand-primary cursor-pointer shrink-0">
                            ${originDotHtml}
                            <span onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 text-xs sm:text-sm cursor-pointer hover:text-brand-primary">${o.customerName || 'بدون اسم'}</span>
                            ${trustInfo.badgeHtml}
                            <a href="tel:${o.customerPhone}" onclick="event.stopPropagation();" class="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-200 px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors active:scale-95" title="اضغط للاتصال المباشر"><i class="fa-solid fa-phone text-[9px]"></i><span dir="ltr">${o.customerPhone || ''}</span></a>
                            <span data-zone-pill="1" ondblclick="inlineEdit(this, '${o.id}', 'zone')" class="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">${o.zone || 'بدون منطقة'}</span>
                            ${realBatchTitle ? `<span class="text-[9px] font-black bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">${realBatchTitle}</span>` : ''}
                            ${compactPayBadge}
                        </div>

                        <div class="flex items-center gap-1.5 shrink-0 mr-auto sm:mr-0">
                            <span class="font-black text-brand-primary text-sm sm:text-base">${o.total || 0} <span class="text-[10px]">ج</span></span>
                            ${sBadge}
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div class="flex flex-wrap items-center gap-1.5 flex-1 min-w-[180px]">
                            ${compactItemsPills}
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            ${compactStepBtn}
                            <button onclick="sendMessageToCustomer('${o.customerPhone}', '${o.id}')" class="bg-[#25D366] hover:bg-[#1ebd57] text-white w-7 h-7 rounded-lg text-xs flex items-center justify-center shadow-sm" title="واتساب"><i class="fa-brands fa-whatsapp"></i></button>
                            <button onclick="openEditOrderModal('${o.id}')" class="bg-slate-800 hover:bg-slate-900 text-white w-7 h-7 rounded-lg text-[10px] flex items-center justify-center shadow-sm" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="printSingleOrderWaybill('${o.id}')" class="bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white border border-amber-200 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center shadow-sm" title="بوليصة"><i class="fa-solid fa-print"></i></button>
                        </div>
                    </div>
                </div>`;
            }

            // 🖥️ 2. الكارت البريميوم المتوازن: (الطلب والأصناف هما البطل الواضح + أزرار رشيقة + أيقونة ملاحظة واحدة)
            const orderPendingWeightItems = (o.items && Array.isArray(o.items)) ? o.items.filter(i => i && i.pendingWeight) : [];
            const pendingWeightBannerHtml = orderPendingWeightItems.length > 0 ? `
                <div onclick="event.stopPropagation()" class="bg-amber-50 border-2 border-amber-300 rounded-xl px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                    <div class="text-[11px] font-black text-amber-950 flex items-center gap-1.5">
                        <i class="fa-solid fa-scale-balanced text-amber-600"></i>
                        <span>بانتظار الميزان يوم الذبح (${orderPendingWeightItems.reduce((s, x) => s + (Number(x.birdsCount) || 1), 0)} عدد)</span>
                    </div>
                    <button type="button" onclick="openAssignPendingWeightsModal('${o.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-[10px] font-black shadow-sm flex items-center gap-1 active:scale-95 transition-all">
                        <i class="fa-solid fa-weight-scale"></i> تسكين الأوزان الآن
                    </button>
                </div>` : '';

            let itemsStr = (o.items && Array.isArray(o.items)) ? o.items.map((i, idx) =>
                i.pendingWeight ? `
                <div data-item-idx="${idx}" onclick="event.stopPropagation(); openAssignPendingWeightsModal('${o.id}')" class="bg-amber-50 border-2 border-amber-300 hover:border-indigo-500 px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1.5 transition-all cursor-pointer" title="اضغط لتسكين الأوزان">
                    <span class="bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-md font-black text-[11px] leading-none">⏳ ${i.birdsCount || 1} عدد</span>
                    <span class="font-black text-amber-950 text-xs sm:text-sm whitespace-nowrap">${i.name}</span>
                    <span class="text-[10px] text-indigo-800 font-black bg-white px-1.5 py-0.5 rounded border border-indigo-200">الكيلو ${i.price}ج</span>
                </div>` :
                `<div data-item-idx="${idx}" class="bg-white border-2 border-emerald-600/20 hover:border-brand-primary px-2.5 py-1 rounded-xl shadow-sm inline-flex items-center gap-1.5 transition-all">
                    <span class="bg-brand-primary text-white px-1.5 py-0.5 rounded-md font-black text-[11px] leading-none">${i.quantity}x</span>
                    <span class="font-black text-slate-900 text-xs sm:text-sm whitespace-nowrap">${i.name}</span>
                    <span class="text-[10px] text-emerald-700 font-black bg-emerald-50 px-1.5 py-0.5 rounded cursor-pointer border border-emerald-200/70 hover:bg-emerald-600 hover:text-white transition-colors" ondblclick="editItemPrice('${o.id}', ${idx})" title="اضغط مرتين لتعديل السعر">${i.price}ج</span>
                </div>`
            ).join('') : '<span class="text-slate-400 text-xs font-bold">لا يوجد تفاصيل</span>';

            let paymentBadge = (payBr.method === 'online')
                ? '<span class="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-check-double text-[9px]"></i> خالص (أونلاين)</span>'
                : (payBr.method === 'split'
                    ? `<span class="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1">⚖️ نص (${payBr.cash}ج كاش)</span>`
                    : '<span class="text-[10px] bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-money-bill-1-wave text-emerald-600 text-[9px]"></i> كاش</span>');

            if (o.debt && o.debt > 0) {
                paymentBadge += ` <span class="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1">آجل (${o.debt} ج)</span>`;
            }

            const safeBatchAttr = realBatchTitle.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            let batchTagHtml = realBatchTitle
                ? `<span onclick="setOrdersQuickFilter('batch', '${safeBatchAttr}')" class="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1 cursor-pointer hover:bg-teal-600 hover:text-white transition-colors"><i class="fa-solid fa-layer-group text-teal-600 text-[8px]"></i> ${realBatchTitle}</span>`
                : '';

            const isPickupOrder = (o.deliveryType === 'pickup') ||
                (String(o.zone || '').includes('استلام')) ||
                (o.status === 'completed' && !o.driverName);

            let driverBadgeHtml = (o.driverName && o.status !== 'processing' && o.status !== 'new')
                ? `<span class="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors"><i class="fa-solid fa-motorcycle text-blue-600 text-[8px]"></i> مع: ${o.driverName}</span>`
                : (isPickupOrder
                    ? `<span class="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1"><i class="fa-solid fa-house-chimney text-emerald-600 text-[8px]"></i> استلام باليد / المزرعة</span>`
                    : '');

            const compBucket = (o.status === 'completed') ? getCompletedDayBucket(o) : null;
            const timeDisplayStr = (o.status === 'completed' && compBucket)
                ? compBucket.badge
                : (ageStr ? `${ageStr} • ${d}` : d);

              // فحص الملاحظات المصنّفة بالألوان (🔵 من العميل | 🟣 مني إداري | 🟠 للعاملين والمندوب — بدون إظهار زحمة السيستم)
            const notesSum = summarizeOrderColorNotes(o);
            const latestClientNote = notesSum.client.length > 0 ? notesSum.client[notesSum.client.length - 1] : null;
            const latestAdminNote = notesSum.admin.length > 0 ? notesSum.admin[notesSum.admin.length - 1] : null;
            const latestWorkerNote = notesSum.worker.length > 0 ? notesSum.worker[notesSum.worker.length - 1] : null;
            const totalNotesCount = notesSum.humanCount;

            let activeNotesPreviewHtml = '';
            if (latestClientNote || latestAdminNote || latestWorkerNote) {
                activeNotesPreviewHtml = `
                    <div class="flex flex-col gap-1">
                        ${latestClientNote ? `
                        <div onclick="toggleInlineNotes(event, '${o.id}', 'adminNote')" class="cursor-pointer bg-sky-50/95 border border-sky-200 border-r-4 border-r-sky-500 text-sky-950 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-[10px] font-black shadow-sm">
                            <span class="truncate"><span class="bg-sky-600 text-white px-1.5 py-0.5 rounded text-[8px] ml-1">👤 العميل</span> ${escapeOrdNoteHtml(latestClientNote.body)}</span>
                            ${latestClientNote.timeLabel ? `<span class="text-[8px] text-sky-700/80 shrink-0">${escapeOrdNoteHtml(latestClientNote.timeLabel)}</span>` : ''}
                        </div>` : ''}
                        ${latestAdminNote ? `
                        <div onclick="toggleInlineNotes(event, '${o.id}', 'adminNote')" class="cursor-pointer bg-purple-50/90 border border-purple-200 border-r-4 border-r-purple-600 text-purple-950 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-[10px] font-black shadow-sm">
                            <span class="truncate"><span class="bg-purple-600 text-white px-1.5 py-0.5 rounded text-[8px] ml-1">🛡️ أنا (إداري)</span> ${escapeOrdNoteHtml(latestAdminNote.body)}</span>
                            ${latestAdminNote.timeLabel ? `<span class="text-[8px] text-purple-700/80 shrink-0">${escapeOrdNoteHtml(latestAdminNote.timeLabel)}</span>` : ''}
                        </div>` : ''}
                        ${latestWorkerNote ? `
                        <div onclick="toggleInlineNotes(event, '${o.id}', 'driverNote')" class="cursor-pointer bg-orange-50/90 border border-orange-200 border-r-4 border-r-orange-500 text-orange-950 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-[10px] font-black shadow-sm">
                            <span class="truncate"><span class="bg-orange-500 text-white px-1.5 py-0.5 rounded text-[8px] ml-1">👷 للعاملين</span> ${escapeOrdNoteHtml(latestWorkerNote.body)}</span>
                            <button type="button" onclick="event.stopPropagation(); clearSingleNoteFieldQuick('${o.id}', 'driverNote')" class="text-orange-400 hover:text-red-600 px-1 shrink-0" title="مسح توجيه العاملين">×</button>
                        </div>` : ''}
                    </div>
                `;
            }

            // الصف السفلي لقرارات المرحلة: أزرار رشيقة ورفيعة (h-7) وأيقونات صغيرة شيك
            let workflowGridHtml = '';
            if (o.status === 'new') {
                workflowGridHtml = `
                    <div class="grid grid-cols-4 gap-1">
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 h-7 rounded-lg text-[11px] font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-fire-burner text-[9px]"></i> للتجهيز</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'deferred')" class="bg-orange-50 hover:bg-orange-600 text-orange-800 hover:text-white border border-orange-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-regular fa-calendar text-[9px]"></i> تأجيل</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'no_answer')" class="bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white border border-purple-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-phone-slash text-[9px]"></i> لم يرد</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'canceled')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-xmark text-[9px]"></i> إلغاء</button>
                    </div>`;
            } else if (o.status === 'processing') {
                workflowGridHtml = `
                    <div class="grid grid-cols-4 gap-1">
                        <button type="button" data-lc-trigger="1" onclick="event.stopPropagation(); triggerOrderDriverStep(this, '${o.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white h-7 rounded-lg text-[11px] font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-motorcycle text-[9px]"></i> للمندوب</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'completed')" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-check text-[9px]"></i> تسليم</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'deferred')" class="bg-orange-50 hover:bg-orange-600 text-orange-800 hover:text-white border border-orange-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-regular fa-calendar text-[9px]"></i> تأجيل</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'canceled')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-xmark text-[9px]"></i> إلغاء</button>
                    </div>`;
            } else if (o.status === 'dispatched') {
                workflowGridHtml = `
                    <div class="grid grid-cols-4 gap-1">
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'completed')" class="bg-emerald-600 hover:bg-emerald-700 text-white h-7 rounded-lg text-[11px] font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-check-double text-[9px]"></i> تم التسليم</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'no_answer')" class="bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white border border-purple-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-phone-slash text-[9px]"></i> لم يرد</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'deferred')" class="bg-orange-50 hover:bg-orange-600 text-orange-800 hover:text-white border border-orange-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-regular fa-calendar text-[9px]"></i> تأجيل</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-slate-100 hover:bg-slate-700 text-slate-700 hover:text-white h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1">↩️ لتجهيز</button>
                    </div>`;
            } else if (o.status === 'deferred' || o.status === 'no_answer') {
                workflowGridHtml = `
                    <div class="grid grid-cols-3 gap-1">
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 h-7 rounded-lg text-[11px] font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-fire-burner text-[9px]"></i> للتجهيز الآن</button>
                        <button type="button" onclick="event.stopPropagation(); openDeferredScheduleModal(['${o.id}'])" class="bg-orange-50 hover:bg-orange-600 text-orange-800 hover:text-white border border-orange-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-regular fa-clock text-[9px]"></i> الموعد</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'canceled')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1"><i class="fa-solid fa-xmark text-[9px]"></i> إلغاء</button>
                    </div>`;
            } else if (o.status === 'canceled') {
                workflowGridHtml = `
                    <div class="grid grid-cols-2 gap-1">
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'new')" class="bg-blue-600 hover:bg-blue-700 text-white h-7 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1">↩️ استعادة لجديد</button>
                        <button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'trash')" class="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 h-7 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center justify-center gap-1">🗑️ حذف للسلة</button>
                    </div>`;
            }

            const safeDayDividerHtml = (typeof completedDayHeaderHtml !== 'undefined') ? completedDayHeaderHtml : '';
            return `${safeDayDividerHtml}
            <div data-id="${o.id}" onclick="highlightOrderCard(this, event)" class="order-card ${trustInfo.cardClass} ${rightAccentCls} border-r-[5px] p-3 mb-3.5 rounded-2xl shadow-[0_4px_14px_-4px_rgba(15,23,42,0.14)] ring-1 ring-slate-900/10 border border-slate-200 hover:shadow-md transition-shadow relative group cursor-pointer space-y-2.5">

                ${trustInfo.bannerHtml}
                ${trustInfo.stickyHtml}

                <!-- 1. الهيدر الرشيق: العميل والدائرة الإرشادية يميناً + الحالة وزر الاتصال السهل يساراً -->
                <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                    <div class="space-y-1 min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <input type="checkbox" value="${o.id}" onchange="toggleBulkActionBar()" class="bulk-order-cb w-4 h-4 accent-brand-primary cursor-pointer rounded shrink-0">
                            ${originDotHtml}
                            <span class="font-black text-slate-900 text-sm cursor-pointer hover:text-brand-primary border-b border-transparent hover:border-brand-primary border-dashed" onclick="smartNameClick(this, '${o.id}', '${o.customerPhone}', 'customerName')">${o.customerName || 'بدون اسم'}</span>
                            ${trustInfo.badgeHtml}
                        </div>
                        <div class="flex flex-wrap items-center gap-1 pr-5">
                            <span data-zone-pill="1" class="cursor-pointer text-indigo-900 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md font-black text-[10px]" ondblclick="inlineEdit(this, '${o.id}', 'zone')"><i class="fa-solid fa-location-dot text-indigo-500 ml-0.5 text-[9px]"></i>${o.zone || 'غير مسجل'}</span>
                            ${o.customerAddress ? `<span class="cursor-pointer text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/60 text-[10px]" ondblclick="inlineEdit(this, '${o.id}', 'customerAddress')">${o.customerAddress}</span>` : ''}
                            ${batchTagHtml}
                            ${driverBadgeHtml}
                        </div>
                    </div>

                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <div class="flex items-center gap-1">
                            <span class="text-[9px] font-bold text-slate-400">${timeDisplayStr}</span>
                            ${sBadge}
                        </div>
                        <a href="tel:${o.customerPhone}" onclick="event.stopPropagation();" title="اضغط في أي مكان على الرقم للاتصال المباشر" class="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-900 hover:text-white px-2.5 py-1 rounded-xl border border-emerald-200 transition-colors shadow-sm active:scale-95">
                            <i class="fa-solid fa-phone text-[10px]"></i>
                            <span class="text-[11px] font-black tracking-wide" dir="ltr">${o.customerPhone || ''}</span>
                        </a>
                        ${o.customerPhone2 ? `
                        <a href="tel:${o.customerPhone2}" onclick="event.stopPropagation();" title="اتصال بالرقم البديل" class="inline-flex items-center gap-1 bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white px-2 py-0.5 rounded-lg border border-purple-200 text-[10px] font-black transition-colors active:scale-95">
                            <i class="fa-solid fa-phone text-[9px]"></i>
                            <span dir="ltr">${o.customerPhone2}</span>
                        </a>` : ''}
                    </div>
                </div>

                ${pendingWeightBannerHtml}

                <!-- 2. صندوق الطلب والفاتورة داخل نفس الكارت -->
                <div class="bg-slate-50/95 p-2.5 rounded-xl border border-slate-200/90 space-y-2">
                    <div class="flex flex-wrap items-center gap-1.5 w-full">
                        ${itemsStr}
                    </div>
                    <div class="flex items-center justify-between pt-1.5 border-t border-slate-200/70">
                        <div class="flex items-center gap-1.5">
                            ${paymentBadge}
                            <span class="text-[10px] font-bold text-slate-400">(${o.subtotal || o.total || 0} طلبات + ${o.deliveryFee || 0} شحن${o.discount > 0 ? ` - ${o.discount} خصم` : ''})</span>
                        </div>
                        <span class="font-black text-brand-primary text-base sm:text-lg leading-none">${o.total || 0} <span class="text-[10px]">ج.م</span></span>
                    </div>
                </div>

                ${activeNotesPreviewHtml}

                <!-- حاوية درج الملاحظات الموحد -->
                <div id="inline-notes-container-${o.id}" class="hidden w-full transition-all duration-200 origin-top">
                    <div id="inline-notes-content-${o.id}"></div>
                </div>

                <!-- 3. شريط الأدوات وقرارات المرحلة داخل نفس الكارت -->
                <div class="space-y-1.5 pt-2 border-t border-slate-100">
                    <div class="grid grid-cols-4 gap-1">
                        ${o.status === 'completed' ? `
                            <button type="button" onclick="sendFollowUpWhatsApp('${o.customerPhone}', '${o.customerName}')" class="bg-[#25D366] hover:bg-[#1ebd57] text-white h-7 rounded-lg text-[10px] font-black shadow-sm flex items-center justify-center gap-1 active:scale-95"><i class="fa-brands fa-whatsapp"></i> متابعة</button>
                            <button type="button" onclick="openLinkArchiveModal('${o.id}')" class="bg-slate-800 hover:bg-slate-900 text-white h-7 rounded-lg text-[10px] font-black shadow-sm flex items-center justify-center gap-1 active:scale-95"><i class="fa-solid fa-link text-amber-400 text-[9px]"></i> أرشفة</button>
                        ` : `
                            <div class="inline-flex h-7 rounded-lg overflow-hidden shadow-sm">
                                <button type="button" onclick="sendMessageToCustomer('${o.customerPhone}', '${o.id}')" class="flex-1 bg-[#25D366] hover:bg-[#1ebd57] text-white text-[10px] font-black flex items-center justify-center gap-1 active:scale-95" title="إرسال الفاتورة مباشرة"><i class="fa-brands fa-whatsapp text-xs"></i> واتساب</button>
                                <button type="button" data-lc-trigger="1" onclick="event.stopPropagation(); openWhatsAppTemplatesPopover(this, '${o.id}')" class="bg-[#1da851] hover:bg-[#178e43] text-white px-1.5 text-[9px] font-black border-r border-white/20 flex items-center justify-center" title="الـ 5 رسائل الجاهزة للعميل">▾</button>
                            </div>
                            <button type="button" onclick="event.stopPropagation(); printSingleOrderWaybill('${o.id}')" class="bg-amber-50 hover:bg-amber-500 text-amber-900 hover:text-white border border-amber-200 h-7 rounded-lg text-[10px] font-black flex items-center justify-center gap-1 active:scale-95"><i class="fa-solid fa-print text-[9px]"></i> بوليصة</button>
                        `}
                        <button type="button" onclick="toggleInlineNotes(event, '${o.id}')" class="${latestClientNote ? 'bg-sky-50 text-sky-900 border-sky-300' : (latestWorkerNote ? 'bg-orange-50 text-orange-900 border-orange-300' : (latestAdminNote ? 'bg-purple-50 text-purple-900 border-purple-300' : 'bg-slate-100 text-slate-700 border-slate-200'))} hover:bg-slate-800 hover:text-white border h-7 rounded-lg text-[10px] font-black flex items-center justify-center gap-1 active:scale-95" title="فتح نافذة الملاحظات الملوّنة">
                            <i class="fa-regular fa-comment-dots text-[9px]"></i> ملاحظة ${totalNotesCount > 0 ? `<span class="${latestClientNote ? 'bg-sky-600' : (latestWorkerNote ? 'bg-orange-500' : 'bg-purple-600')} text-white px-1 rounded text-[8px]">${totalNotesCount}</span>` : '+'}
                        </button>
                        <button type="button" onclick="openEditOrderModal('${o.id}')" class="bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-200 h-7 rounded-lg text-[10px] font-black flex items-center justify-center gap-1 active:scale-95"><i class="fa-solid fa-pen text-[9px]"></i> تعديل</button>
                    </div>

                    ${workflowGridHtml}
                </div>
            </div>`;
        }).join('');


        if (remainingCount > 0) {
            cardsHtml += `
            <button type="button" onclick="window.ordersRenderLimit = (window.ordersRenderLimit || 30) + 30; renderOrdersList();" class="w-full py-3 bg-white hover:bg-emerald-50 text-brand-primary font-black text-xs rounded-2xl border-2 border-dashed border-brand-primary/30 shadow-sm transition-all flex items-center justify-center gap-2">
                <i class="fa-solid fa-angles-down"></i> عرض المزيد من الطلبات (متبقي ${remainingCount} طلب)
            </button>`;
        }

        container.innerHTML = cardsHtml;

        if (typeof openInlineNoteId !== 'undefined' && openInlineNoteId) {
            setTimeout(() => { window.toggleInlineNotes(null, openInlineNoteId, openInlineNoteField || 'driverNote', true); }, 50);
        }
        if (typeof hookDeferredStatusInterceptors === 'function') {
            hookDeferredStatusInterceptors();
        }
        if (typeof window.decorateDeferredOrderCards === 'function') {
            window.decorateDeferredOrderCards();
        }
    };



    // =========================================================================
    // 🛠️ 7. تطوير نافذتي "إنشاء طلب" (مساعد العميل والنقاط) و"تعديل طلب"
    // =========================================================================
    const _origCheckCustomerExists = window.checkCustomerExists;
    window.checkCustomerExists = async function () {
        if (typeof _origCheckCustomerExists === 'function') {
            await _origCheckCustomerExists();
        }

        const phoneInput = document.getElementById('no-phone');
        if (!phoneInput) return;
        const normPhone = window.normalizePhone ? window.normalizePhone(phoneInput.value) : phoneInput.value.trim();

        let helperBox = document.getElementById('no-smart-customer-helper');
        if (!helperBox) {
            helperBox = document.createElement('div');
            helperBox.id = 'no-smart-customer-helper';
            helperBox.className = 'mt-2';
            const alertBox = document.getElementById('no-blacklist-alert');
            if (alertBox && alertBox.parentElement) {
                alertBox.parentElement.insertBefore(helperBox, alertBox.nextSibling);
            }
        }

        if (!normPhone || normPhone.length < 10) {
            helperBox.innerHTML = '';
            return;
        }

        const c = (typeof customersData !== 'undefined' ? customersData : []).find(x => window.normalizePhone(x.phone) === normPhone);
        if (!c) {
            helperBox.innerHTML = `<div class="bg-sky-50 border border-sky-200 text-sky-800 px-3 py-2 rounded-xl text-xs font-black">🆕 عميل جديد يسجل لأول مرة في سمان ههيا</div>`;
            return;
        }

        const pts = Number(c.walletPoints) || 0;
        const ptVal = Number(storeSettings?.pointValueInEGP) || 0.40;
        const walletCash = Math.round(pts * ptVal);
        const oldDebt = Number(c.debt) || 0;

        helperBox.innerHTML = `
            <div class="bg-emerald-50/80 border border-emerald-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <div class="space-y-0.5">
                    <div class="font-black text-slate-800">👤 ${c.name || 'عميل مسجل'} <span class="text-emerald-700">(${c.ordersCount || 0} طلبات سابقة • إجمالي ${(Number(c.totalSpent) || 0).toLocaleString()} ج)</span></div>
                    ${oldDebt > 0 ? `<div class="text-red-600 font-black">📕 عليه باقي حساب سابق: ${oldDebt} ج</div>` : ''}
                    ${pts > 0 ? `<div class="text-amber-700 font-black">🪙 رصيد محفظة الولاء: ${pts} نقطة (تساوي ${walletCash} ج خصم)</div>` : ''}
                </div>
                <div class="flex flex-wrap gap-1.5">
                    ${walletCash > 0 ? `<button type="button" onclick="applyCustomerWalletDiscountInNewOrder(${walletCash}, ${pts})" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black shadow-sm">🎁 خصم المحفظة (-${walletCash} ج)</button>` : ''}
                    <button type="button" onclick="openCustomerCard('${c.phone}')" class="bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black">ملف العميل</button>
                </div>
            </div>
        `;
    };

    window.applyCustomerWalletDiscountInNewOrder = function (cashDiscount, ptsCount) {
        const discInput = document.getElementById('no-discount');
        const notesInput = document.getElementById('no-notes');
        if (discInput) {
            discInput.value = cashDiscount;
            if (typeof window.calcTotal === 'function') window.calcTotal('no');
        }
        if (notesInput && !notesInput.value.includes('استبدل نقاطه')) {
            const msg = `[فعّل خصم المحفظة: استبدل نقاطه (${ptsCount} نقطة) بخصم ${cashDiscount} ج]`;
            notesInput.value = notesInput.value ? (notesInput.value + '\n' + msg) : msg;
        }
        if (typeof window.showToast === 'function') window.showToast(`🎁 تم تطبيق خصم المحفظة (${cashDiscount} ج)`);
    };

    // =========================================================================
    // ⚡ 8. الإصلاح المحاسبي الشامل للتحديد الجماعي (bulkChangeStatus + توجيه المحددين للمندوب)
    // =========================================================================
    window.openBulkDriverDispatchPopover = function (anchorEl) {
        const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checkedIds.length === 0) return;

        const drivers = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
        if (drivers.length === 0) {
            if (typeof window.openDispatchModal === 'function') return window.openDispatchModal();
            return alert('يرجى إضافة مندوب واحد على الأقل من إعدادات المتجر أولاً!');
        }

        const drvBtns = drivers.map(d => {
            const safeName = (d.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safePhone = (d.phone || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
                <button type="button" onclick="executeBulkAssignToDriver('${safeName}', '${safePhone}')" class="w-full bg-indigo-50 hover:bg-indigo-600 text-indigo-950 hover:text-white py-2 px-3 rounded-xl text-xs font-black flex items-center justify-between border border-indigo-100 transition-all shadow-sm">
                    <span>🛵 ${d.name}</span>
                    <span class="text-[10px] opacity-80">نقل (${checkedIds.length}) طلب ⚡</span>
                </button>
            `;
        }).join('');

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-indigo-900"><i class="fa-solid fa-motorcycle ml-1"></i> توجيه الطلبات المحددة (${checkedIds.length})</span>
                    <button type="button" onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="space-y-1.5 max-h-52 overflow-y-auto custom-scroll">${drvBtns}</div>
                <button type="button" onclick="closeLivePopover(); if(window.openDispatchModal) openDispatchModal();" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl text-[10px] font-black">
                    📋 فتح شاشة التوجيه والرسالة التفصيلية
                </button>
            </div>
        `;

        if (typeof window.openLivePopover === 'function') {
            window.openLivePopover(anchorEl, html);
        } else if (typeof window.openDispatchModal === 'function') {
            window.openDispatchModal();
        }
    };

    window.executeBulkAssignToDriver = async function (driverName, driverPhone) {
        if (typeof window.closeLivePopover === 'function') window.closeLivePopover();
        let checked = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) return;

        let blockedNames = [];
        checked = checked.filter(id => {
            let o = allOrdersRaw.find(x => x.id === id);
            if (!o) return false;
            let bl = window.findBlacklistedCustomerMatch ? window.findBlacklistedCustomerMatch(o.customerPhone, o.customerPhone2, o.customerName, o.customerAddress) : null;
            if (bl && bl.type === 'exact' && !o.isPrepaidConfirmed && o.paymentMethod !== 'online') {
                blockedNames.push(o.customerName || o.customerPhone);
                return false;
            }
            return true;
        });
        if (blockedNames.length > 0) {
            alert('⛔ حارس البلاك ليست أوقف توجيه الطلبات التالية لأنها لم تُدفع مقدماً:\n- ' + blockedNames.join('\n- '));
            if (checked.length === 0) return;
        }

        try {
            const dbBatch = db.batch();
            checked.forEach(id => {
                const o = allOrdersRaw.find(x => x && x.id === id);
                if (!o) return;
                dbBatch.update(db.collection('orders').doc(id), {
                    driverName: driverName,
                    driverPhone: driverPhone || '',
                    status: 'dispatched',
                    dispatchedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                o.driverName = driverName;
                o.driverPhone = driverPhone || '';
                o.status = 'dispatched';
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                    globalOrdersMap[id].driverName = driverName;
                    globalOrdersMap[id].driverPhone = driverPhone || '';
                    globalOrdersMap[id].status = 'dispatched';
                }
            });
            await dbBatch.commit();

            window.clearAllBulkSelections();
            window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderReconciliationUI === 'function') window.renderReconciliationUI();
            if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
            if (typeof window.showToast === 'function') window.showToast(`🛵 تم توجيه (${checked.length}) طلب إلى المندوب: ${driverName}`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء توجيه الطلبات للمندوب!');
        }
    };

    window.bulkChangeStatus = async function (newStatus) {
        let checked = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) return;

        if (['dispatched', 'completed'].includes(newStatus) && typeof window.orderHasPendingWeight === 'function') {
            const firstPendingId = checked.find(id => {
                const ordObj = allOrdersRaw.find(x => x && x.id === id);
                return ordObj && window.orderHasPendingWeight(ordObj);
            });
            if (firstPendingId) {
                if (typeof window.showToast === 'function') window.showToast('⚖️ يوجد طلب محدد بانتظار الميزان — سكّن أوزانه أولاً!');
                window.openAssignPendingWeightsModal(firstPendingId);
                return;
            }
        }

        if (['processing', 'dispatched', 'completed'].includes(newStatus)) {
            let blockedNames = [];
            checked = checked.filter(id => {
                let o = allOrdersRaw.find(x => x.id === id);
                if (!o) return false;
                let bl = window.findBlacklistedCustomerMatch ? window.findBlacklistedCustomerMatch(o.customerPhone, o.customerPhone2, o.customerName, o.customerAddress) : null;
                if (bl && bl.type === 'exact' && !o.isPrepaidConfirmed && o.paymentMethod !== 'online') {
                    blockedNames.push(o.customerName || o.customerPhone);
                    return false;
                }
                return true;
            });
            if (blockedNames.length > 0) {
                alert('⛔ حارس البلاك ليست أوقف نقل الطلبات التالية لأنها لم تُدفع مقدماً:\n- ' + blockedNames.join('\n- '));
                if (checked.length === 0) return;
            }
        }

        const statusNamesAr = {
            'new': 'جديد',
            'processing': 'قيد التجهيز',
            'dispatched': 'في الطريق',
            'deferred': 'مؤجل',
            'no_answer': 'لم يتم الرد',
            'completed': 'مكتمل',
            'canceled': 'ملغي',
            'trash': 'سلة المحذوفات'
        };
        const statusName = statusNamesAr[newStatus] || newStatus;
        const confirmPrompt = `سيتم تحويل [ ${checked.length} ] طلبات إلى حالة (${statusName}). هل تريد التأكيد؟`;
        const okBulk = (typeof window.execConfirm === 'function')
            ? await window.execConfirm(confirmPrompt, { title: 'تحديث جماعي للطلبات', tone: newStatus === 'trash' || newStatus === 'canceled' ? 'danger' : 'brand', confirmText: 'تأكيد التحويل' })
            : confirm(confirmPrompt);
        if (!okBulk) return;

        const bar = document.getElementById('bulk-actions-bar');
        if (bar) bar.classList.add('opacity-60', 'pointer-events-none');

        try {
            let dbBatch = db.batch();
            let fzNewValues = { ...(typeof storeFreezer !== 'undefined' ? storeFreezer : {}) };
            let fzTouched = false;

            const nowStr = new Date().toLocaleDateString('en-US');
            const nowDisplay = new Date().toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const ptsPer100 = Number(storeSettings?.pointsPer100) || 5;

            checked.forEach(id => {
                let o = allOrdersRaw.find(x => x.id === id);
                if (!o) return;
                let oldStatus = o.status;
                let ref = db.collection('orders').doc(id);

                let updateData = { status: newStatus };
                if (newStatus === 'processing' || newStatus === 'new') {
                    if (o.driverName || o.driverPhone) {
                        updateData.driverName = firebase.firestore.FieldValue.delete();
                        updateData.driverPhone = firebase.firestore.FieldValue.delete();
                        delete o.driverName;
                        delete o.driverPhone;
                        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                            delete globalOrdersMap[id].driverName;
                            delete globalOrdersMap[id].driverPhone;
                        }
                    }
                }
                if (newStatus === 'completed' && !o.driverName) {
                    updateData.deliveryType = 'pickup';
                    o.deliveryType = 'pickup';
                    if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                        globalOrdersMap[id].deliveryType = 'pickup';
                    }
                }
                if (newStatus === 'trash') updateData.deletedAt = firebase.firestore.FieldValue.serverTimestamp();
                if (newStatus === 'dispatched') updateData.dispatchedAt = firebase.firestore.FieldValue.serverTimestamp();
                if (newStatus === 'canceled') updateData.canceledAt = firebase.firestore.FieldValue.serverTimestamp();

                if (newStatus === 'completed') {
                    const compNowMs = Date.now();
                    updateData.completedAtMs = compNowMs;
                    updateData.completedAtStr = nowStr;
                    updateData.completedTimeDisplay = nowDisplay;
                    updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();

                    o.completedAtMs = compNowMs;
                    o.completedAtStr = nowStr;
                    o.completedTimeDisplay = nowDisplay;

                    if (oldStatus !== 'completed' && !o.loyaltyPointsAwarded && o.customerPhone) {
                        updateData.loyaltyPointsAwarded = true;
                        o.loyaltyPointsAwarded = true;
                        const orderSub = Number(o.subtotal) || Number(o.total) || 0;
                        if (orderSub >= 100) {
                            const earnedPts = Math.floor(orderSub / 100) * ptsPer100;
                            if (earnedPts > 0) {
                                const normP = window.normalizePhone ? window.normalizePhone(o.customerPhone) : o.customerPhone.toString().trim();
                                const cleanPhone = normP.startsWith('0') ? normP : '0' + normP;
                                if (cleanPhone.length >= 10) {
                                    dbBatch.set(db.collection('customers').doc(cleanPhone), {
                                        walletPoints: firebase.firestore.FieldValue.increment(earnedPts)
                                    }, { merge: true });
                                }
                            }
                        }
                    }
                }

                if (o.items && Array.isArray(o.items)) {
                    let wasIn = ['processing', 'dispatched', 'completed', 'deferred'].includes(oldStatus);
                    let isNowIn = ['processing', 'dispatched', 'completed', 'deferred'].includes(newStatus);

                    if (!wasIn && isNowIn) {
                        const deductedMap = {};
                        o.items.forEach(i => {
                            if (!i || !i.id || i.pendingWeight) return;
                            const needQty = Math.max(0, Number(i.quantity) || 0);
                            if (needQty <= 0) return;
                            const cur = Math.max(0, Number(fzNewValues[i.id]) || 0);
                            const actualDed = Math.min(cur, needQty);
                            deductedMap[i.id] = Number(((deductedMap[i.id] || 0) + actualDed).toFixed(3));
                            if (actualDed > 0) {
                                fzNewValues[i.id] = Number((cur - actualDed).toFixed(3));
                                storeFreezer[i.id] = fzNewValues[i.id];
                                fzTouched = true;
                            }
                        });
                        updateData.freezerDeductedMap = deductedMap;
                        o.freezerDeductedMap = deductedMap;
                        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                            globalOrdersMap[id].freezerDeductedMap = deductedMap;
                        }
                    } else if (wasIn && !isNowIn) {
                        if (o.freezerDeductedMap && typeof o.freezerDeductedMap === 'object') {
                            Object.keys(o.freezerDeductedMap).forEach(pId => {
                                const restoreQty = Math.max(0, Number(o.freezerDeductedMap[pId]) || 0);
                                if (restoreQty > 0) {
                                    const cur = Math.max(0, Number(fzNewValues[pId]) || 0);
                                    fzNewValues[pId] = Number((cur + restoreQty).toFixed(3));
                                    storeFreezer[pId] = fzNewValues[pId];
                                    fzTouched = true;
                                }
                            });
                        }
                        updateData.freezerDeductedMap = {};
                        o.freezerDeductedMap = {};
                        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                            globalOrdersMap[id].freezerDeductedMap = {};
                        }
                    }
                }

                dbBatch.update(ref, updateData);


                o.status = newStatus;
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                    globalOrdersMap[id].status = newStatus;
                    if (newStatus === 'completed') {
                        globalOrdersMap[id].completedAtStr = nowStr;
                        globalOrdersMap[id].completedTimeDisplay = nowDisplay;
                    }
                }
                if (typeof window.syncOrderToGoogleSheet === 'function') {
                    window.syncOrderToGoogleSheet(o, newStatus === 'trash' ? 'delete' : 'update');
                }
            });

            if (fzTouched) {
                dbBatch.set(db.collection('inventory').doc('freezer'), fzNewValues, { merge: true });
            }

            await dbBatch.commit();

            if (typeof window.syncWeightHoldForOrderStatus === 'function') {
                for (const id of checked) {
                    const oObj = allOrdersRaw.find(x => x && x.id === id);
                    if (oObj) await window.syncWeightHoldForOrderStatus(oObj, newStatus);
                }
            }

            document.querySelectorAll('.bulk-order-cb').forEach(cb => { cb.checked = false; });
            if (bar) bar.classList.add('hidden');
            window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderReconciliationUI === 'function') window.renderReconciliationUI();
            if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم تحديث ${checked.length} طلبات إلى (${statusName})`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء التحديث الجماعي!');
        } finally {
            if (bar) bar.classList.remove('opacity-60', 'pointer-events-none');
        }
    };

    // =========================================================================
    // 📋 9. ورقة التحضير الذكية المربوطة بمخزن الفريزر (Smart Packing List 2.0)
    // =========================================================================
    window.openPackingListModal = function () {
        window.renderSmartPackingList();
        if (typeof openModal === 'function') openModal('packing-list-modal');
    };

    window.updatePackingListFilter = function (key, val) {
        window.ordersFilterState[key] = val;
        window.renderSmartPackingList();
    };

    window.renderSmartPackingList = function () {
        const cont = document.getElementById('packing-list-content');
        if (!cont) return;

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const freezerObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};

        const scope = window.ordersFilterState.packingScope || 'processing';
        const pBatch = window.ordersFilterState.packingBatch || 'all';
        const pZone = window.ordersFilterState.packingZone || 'all';

        const batchSet = new Set();
        const zoneSet = new Set();
        ordersList.forEach(o => {
            if (!o || ['completed', 'canceled', 'trash'].includes(o.status) || o.isArchived) return;
            const bTitle = getOrderBatchTitle(o);
            if (bTitle) batchSet.add(bTitle);
            if (o.zone) zoneSet.add(o.zone.trim());
        });

        const targetOrders = ordersList.filter(o => {
            if (!o || o.status === 'trash' || o.isArchived) return false;
            if (scope === 'processing' && o.status !== 'processing') return false;
            if (scope === 'new_and_proc' && !['new', 'processing'].includes(o.status)) return false;
            if (scope === 'dispatched' && o.status !== 'dispatched') return false;

            if (pBatch !== 'all' && getOrderBatchTitle(o) !== pBatch) return false;
            if (pZone !== 'all' && (o.zone || '').trim() !== pZone) return false;
            return true;
        });

        const itemTotals = {};
        targetOrders.forEach(o => {
            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    if (item && item.pendingWeight) {
                        const baseN = (typeof storeProducts !== 'undefined' && storeProducts[item.id]?.name) ? storeProducts[item.id].name : (item.name || 'صنف بالميزان');
                        const k = `⏳ [بانتظار الذبح/الميزان] ${baseN}`;
                        if (!itemTotals[k]) itemTotals[k] = { id: item.id || '', name: k, qty: 0 };
                        itemTotals[k].qty += Number(item.birdsCount) || 1;
                    } else {
                        const k = item.name || 'صنف';
                        if (!itemTotals[k]) itemTotals[k] = { id: item.id || '', name: k, qty: 0 };
                        itemTotals[k].qty += Number(item.quantity) || 0;
                    }
                });
            }
        });

        let batchOpts = `<option value="all">كل الدفعات</option>`;
        Array.from(batchSet).forEach(b => { batchOpts += `<option value="${b}" ${pBatch === b ? 'selected' : ''}>${b}</option>`; });

        let zoneOpts = `<option value="all">كل المناطق</option>`;
        Array.from(zoneSet).forEach(z => { zoneOpts += `<option value="${z}" ${pZone === z ? 'selected' : ''}>${z}</option>`; });

        let html = `
            <div class="space-y-3 mb-4">
                <div class="grid grid-cols-3 gap-2">
                    <select onchange="updatePackingListFilter('packingScope', this.value)" class="border border-slate-200 rounded-xl p-2 text-[11px] font-black bg-white outline-none">
                        <option value="processing" ${scope === 'processing' ? 'selected' : ''}>⏳ قيد التجهيز فقط</option>
                        <option value="new_and_proc" ${scope === 'new_and_proc' ? 'selected' : ''}>🆕 جديد + تجهيز معاً</option>
                        <option value="dispatched" ${scope === 'dispatched' ? 'selected' : ''}>🛵 في الطريق حالياً</option>
                    </select>
                    <select onchange="updatePackingListFilter('packingBatch', this.value)" class="border border-slate-200 rounded-xl p-2 text-[11px] font-black bg-white outline-none">${batchOpts}</select>
                    <select onchange="updatePackingListFilter('packingZone', this.value)" class="border border-slate-200 rounded-xl p-2 text-[11px] font-black bg-white outline-none">${zoneOpts}</select>
                </div>

                <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                    <span class="font-black text-slate-700 text-xs"><i class="fa-solid fa-box text-amber-500 mr-1"></i> إجمالي أوردرات التحضير المفلترة:</span>
                    <span class="font-black text-brand-primary text-xl">${targetOrders.length} طلب</span>
                </div>
            </div>
        `;

        const sortedKeys = Object.keys(itemTotals).sort((a, b) => itemTotals[b].qty - itemTotals[a].qty);
        if (sortedKeys.length === 0) {
            html += `<div class="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-sm">لا توجد طلبات مطابقة لتحضيرها حالياً.</div>`;
        } else {
            html += `<div class="space-y-2.5" id="print-packing-area">`;
            sortedKeys.forEach(k => {
                const info = itemTotals[k];
                const fzAvailable = Math.max(0, Number(freezerObj[info.id]) || 0);
                const diff = fzAvailable - info.qty;
                const isEnough = diff >= 0;

                html += `
                <label class="bg-white p-4 rounded-2xl border ${isEnough ? 'border-slate-200' : 'border-rose-200 bg-rose-50/20'} shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-amber-400 transition-all">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" class="w-5 h-5 accent-emerald-600 rounded cursor-pointer">
                        <div>
                            <span class="text-sm font-black text-slate-800 block">${info.name}</span>
                            <span class="text-[10px] font-black ${isEnough ? 'text-cyan-700' : 'text-rose-600'}">
                                ❄️ بالفريزر حالياً: ${fzAvailable} ${isEnough ? '(متوفر بالكامل ✅)' : `(عجز: ${Math.abs(diff)} يحتاج تجهيز ⚠️)`}
                            </span>
                        </div>
                    </div>
                    <div class="text-center bg-amber-50 border border-amber-200 px-3.5 py-1.5 rounded-xl shrink-0">
                        <span class="text-2xl font-black text-amber-600 block leading-none">${Number(info.qty.toFixed(2))}</span>
                        <span class="text-[9px] font-black text-amber-800">المطلوب</span>
                    </div>
                </label>`;
            });
            html += `</div>`;
        }

        cont.innerHTML = html;
    };
    // =========================================================================


    // =========================================================================
    // ⚡ 10. اختصار التوجيه السريع للمندوب بلمسة واحدة (1-Tap Express Dispatch)
    // =========================================================================
    window.openExpressBatchDispatchPopover = function (anchorEl) {
        const procOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => o && o.status === 'processing' && !o.isArchived);
        if (procOrders.length === 0) {
            if (typeof window.showToast === 'function') window.showToast('ℹ️ لا توجد طلبات في مرحلة (قيد التجهيز) حالياً لتوجيهها!');
            else alert('لا توجد طلبات في مرحلة (قيد التجهيز) حالياً!');
            return;
        }

        const drivers = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
        if (drivers.length === 0) {
            if (typeof window.openDispatchModal === 'function') return window.openDispatchModal();
            return alert('يرجى إضافة مندوب أولاً من قسم إعدادات المتجر!');
        }

        const zonesCount = {};
        procOrders.forEach(o => {
            const z = (o.zone || 'غير مسجل').trim();
            zonesCount[z] = (zonesCount[z] || 0) + 1;
        });

        let zoneOptions = `<option value="ALL">🌍 كل المناطق الجاهزة (${procOrders.length} طلب)</option>`;
        Object.keys(zonesCount).forEach(z => {
            zoneOptions += `<option value="${z}">📍 منطقة: ${z} (${zonesCount[z]} طلب)</option>`;
        });

        const driverBtns = drivers.map(d => {
            const safeName = (d.name || '').replace(/'/g, "\\'");
            const safePhone = (d.phone || '').replace(/'/g, "\\'");
            return `
                <button type="button" onclick="executeExpressBatchDispatch('${safeName}', '${safePhone}')" class="w-full bg-indigo-50 hover:bg-indigo-600 text-indigo-950 hover:text-white py-2 px-3 rounded-xl text-xs font-black flex items-center justify-between border border-indigo-100 transition-all shadow-sm">
                    <span>🛵 توجيه إلى: ${d.name}</span>
                    <span class="text-[10px] bg-white/80 text-indigo-700 px-2 py-0.5 rounded-lg">بلمسة واحدة ⚡</span>
                </button>
            `;
        }).join('');

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-indigo-900"><i class="fa-solid fa-bolt text-amber-500 ml-1"></i> توجيه سريع للجاهز (${procOrders.length} طلب)</span>
                    <button type="button" onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-500 block mb-1">1. اختر خط السير / المنطقة:</label>
                    <select id="express-dispatch-zone-sel" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-black text-slate-800 bg-slate-50 outline-none">
                        ${zoneOptions}
                    </select>
                </div>
                <div class="space-y-1.5">
                    <label class="text-[10px] font-black text-slate-500 block">2. اضغط على اسم المندوب للنقل الفوري:</label>
                    ${driverBtns}
                </div>
            </div>
        `;

        if (typeof window.openLivePopover === 'function') {
            window.openLivePopover(anchorEl, html);
        } else if (typeof window.openDispatchModal === 'function') {
            window.openDispatchModal();
        }
    };

    window.executeExpressBatchDispatch = async function (driverName, driverPhone) {
        const selectedZone = document.getElementById('express-dispatch-zone-sel')?.value || 'ALL';
        if (typeof window.closeLivePopover === 'function') window.closeLivePopover();

        let targetOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o => {
            if (!o || o.status !== 'processing' || o.isArchived) return false;
            if (selectedZone !== 'ALL' && (o.zone || 'غير مسجل').trim() !== selectedZone) return false;
            const bl = window.findBlacklistedCustomerMatch ? window.findBlacklistedCustomerMatch(o.customerPhone, o.customerPhone2, o.customerName, o.customerAddress) : null;
            if (bl && bl.type === 'exact' && !o.isPrepaidConfirmed && o.paymentMethod !== 'online') return false;
            return true;
        });

        if (targetOrders.length === 0) return alert('لا توجد طلبات مطابقة جاهزة للتوجيه!');

        try {
            const batch = db.batch();
            targetOrders.forEach(o => {
                batch.update(db.collection('orders').doc(o.id), {
                    driverName: driverName,
                    driverPhone: driverPhone || '',
                    status: 'dispatched',
                    dispatchedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                o.driverName = driverName;
                o.driverPhone = driverPhone || '';
                o.status = 'dispatched';
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].driverName = driverName;
                    globalOrdersMap[o.id].driverPhone = driverPhone || '';
                    globalOrdersMap[o.id].status = 'dispatched';
                }
            });

            await batch.commit();
            window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
            if (typeof window.showToast === 'function') {
                window.showToast(`🛵 تم توجيه (${targetOrders.length}) طلب إلى المندوب (${driverName}) في لمحة بصر!`);
            }
        } catch (e) {
            alert('حدث خطأ أثناء التوجيه السريع للمندوب!');
        }
    };

    // =========================================================================
    // ⏰ 11. منظومة جدولة الطلبات المؤجلة بالتقويم والمنبه الحي (Deferred Scheduler & Alarm)
    // =========================================================================
    window._deferredTargetOrderIds = [];
    window._bypassDeferredModal = false;

    function toLocalDateStr(d) {
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${yr}-${mo}-${da}`;
    }

    function toLocalTimeStr(d) {
        const hr = String(d.getHours()).padStart(2, '0');
        const mn = String(d.getMinutes()).padStart(2, '0');
        return `${hr}:${mn}`;
    }

    function parseLocalDateTimeToMs(dateStr, timeStr) {
        if (!dateStr) return 0;
        const [y, m, d] = dateStr.split('-').map(Number);
        const [hr, mn] = (timeStr || '12:00').split(':').map(Number);
        const dt = new Date(y, (m || 1) - 1, d || 1, hr || 0, mn || 0, 0, 0);
        return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    function formatArabicScheduleLabel(ms) {
        if (!ms) return '';
        const dt = new Date(ms);
        const datePart = dt.toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' });
        const timePart = dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `${datePart} - ${timePart}`;
    }

    function formatRemainingCountdown(targetMs) {
        if (!targetMs) return '';
        const diff = targetMs - Date.now();
        if (diff <= 0) return '🚨 حان الموعد الآن!';
        const totalMins = Math.floor(diff / 60000);
        if (totalMins < 60) return `باقي ${totalMins} دقيقة`;
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        if (hrs < 24) return `باقي ${hrs} س${mins > 0 ? ` و ${mins} د` : ''}`;
        const days = Math.floor(hrs / 24);
        const remHrs = hrs % 24;
        return `باقي ${days} يوم${remHrs > 0 ? ` و ${remHrs} س` : ''}`;
    }

    // نغمة تنبيه صوتية واضحة تعمل أوفلاين 100% عبر Web Audio API
    window.playDeferredAlarmChime = function () {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const notes = [587.33, 880, 587.33, 880];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);
                gain.gain.setValueAtTime(0.25, ctx.currentTime + idx * 0.18);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.18 + 0.16);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.18);
                osc.stop(ctx.currentTime + idx * 0.18 + 0.17);
            });
        } catch (e) {}
    };

    function ensureDeferredScheduleModalExists() {
        let modal = document.getElementById('deferred-schedule-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'deferred-schedule-modal';
        modal.className = 'fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-[230] hidden flex items-center justify-center p-3 sm:p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col border-2 border-orange-300">
                <div class="bg-gradient-to-l from-slate-900 via-orange-950 to-slate-900 text-white p-4 flex justify-between items-center">
                    <div class="flex items-center gap-2.5">
                        <div class="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-orange-300 text-lg">
                            <i class="fa-regular fa-calendar-check"></i>
                        </div>
                        <div>
                            <h3 class="text-sm sm:text-base font-black text-white">جدولة موعد الطلب المؤجل ⏰</h3>
                            <p id="def-modal-subtitle" class="text-[11px] text-orange-200 font-bold">اختر التاريخ والوقت ليذكرك السيستم بإشعار تلقائي</p>
                        </div>
                    </div>
                    <button type="button" onclick="cancelDeferredScheduleModal()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="p-4 sm:p-5 space-y-4 bg-slate-50/70">
                    <!-- اختصارات سريعة بضغطة واحدة -->
                    <div>
                        <label class="text-[10px] font-black text-slate-500 block mb-1.5">⚡ اختصارات سريعة للموعد:</label>
                        <div class="grid grid-cols-3 gap-1.5">
                            <button type="button" onclick="applyDeferredQuickPreset(1, 0)" class="bg-white hover:bg-orange-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all shadow-sm">⏱️ بعد ساعة</button>
                            <button type="button" onclick="applyDeferredQuickPreset(3, 0)" class="bg-white hover:bg-orange-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all shadow-sm">⏱️ بعد 3 ساعات</button>
                            <button type="button" onclick="applyDeferredQuickPreset(0, 1, '10:00')" class="bg-white hover:bg-orange-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all shadow-sm">🌅 غداً 10 ص</button>
                            <button type="button" onclick="applyDeferredQuickPreset(0, 1, '14:00')" class="bg-white hover:bg-orange-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all shadow-sm">☀️ غداً 2 ظهراً</button>
                            <button type="button" onclick="applyDeferredQuickPreset(0, 1, '19:00')" class="bg-white hover:bg-orange-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all shadow-sm">🌙 غداً 7 مساءً</button>
                            <button type="button" onclick="applyDeferredQuickPreset(0, 2, '12:00')" class="bg-white hover:bg-orange-600 text-slate-700 hover:text-white border border-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-black transition-all shadow-sm">📅 بعد يومين</button>
                        </div>
                    </div>

                    <!-- اختيار التاريخ والوقت من النتيجة والساعة -->
                    <div class="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <label class="text-[10px] font-black text-orange-800 block mb-1"><i class="fa-regular fa-calendar ml-1"></i> التاريخ (النتيجة) *</label>
                            <input type="date" id="def-sched-date" onchange="updateDeferredLivePreviewText()" class="w-full border-2 border-orange-200 focus:border-orange-500 rounded-xl p-2 text-xs font-black text-slate-800 bg-orange-50/30 outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-black text-orange-800 block mb-1"><i class="fa-regular fa-clock ml-1"></i> الساعة (الوقت) *</label>
                            <input type="time" id="def-sched-time" onchange="updateDeferredLivePreviewText()" class="w-full border-2 border-orange-200 focus:border-orange-500 rounded-xl p-2 text-xs font-black text-slate-800 bg-orange-50/30 outline-none">
                        </div>
                        <div class="col-span-2 bg-orange-50 border border-orange-200/80 px-3 py-2 rounded-xl text-center">
                            <span id="def-sched-live-preview" class="text-xs font-black text-orange-900"></span>
                        </div>
                    </div>

                    <!-- سبب التأجيل أو ملاحظة الإشعار -->
                    <div>
                        <label class="text-[10px] font-black text-slate-500 block mb-1.5">📝 سبب التأجيل (يظهر مع الإشعار):</label>
                        <div class="flex flex-wrap gap-1 mb-2">
                            <button type="button" onclick="document.getElementById('def-sched-reason').value='طلب التوصيل في هذا الموعد'" class="bg-white border border-slate-200 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors">طلب التوصيل بالموعد</button>
                            <button type="button" onclick="document.getElementById('def-sched-reason').value='العميل مسافر ويعود بالموعد'" class="bg-white border border-slate-200 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors">العميل مسافر</button>
                            <button type="button" onclick="document.getElementById('def-sched-reason').value='بانتظار تحويل فودافون كاش'" class="bg-white border border-slate-200 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors">انتظار تحويل</button>
                        </div>
                        <input type="text" id="def-sched-reason" placeholder="اكتب ملاحظة أو سبب التأجيل (اختياري)..." class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-white outline-none focus:border-orange-500">
                    </div>
                </div>

                <div class="p-4 bg-white border-t border-slate-100 flex gap-2">
                    <button type="button" onclick="confirmDeferredOrderSchedule()" id="btn-confirm-deferred-sched" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-lg shadow-orange-600/25 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <i class="fa-solid fa-bell text-amber-200"></i> تأكيد التأجيل وضبط الإشعار
                    </button>
                    <button type="button" onclick="cancelDeferredScheduleModal()" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-black px-4 py-3 rounded-xl text-xs transition-all">
                        إلغاء
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    window.applyDeferredQuickPreset = function (addHours, addDays, fixedTimeStr = null) {
        const dt = new Date();
        if (addDays > 0) dt.setDate(dt.getDate() + addDays);
        if (addHours > 0) dt.setHours(dt.getHours() + addHours);

        const dateInp = document.getElementById('def-sched-date');
        const timeInp = document.getElementById('def-sched-time');
        if (dateInp) dateInp.value = toLocalDateStr(dt);
        if (timeInp) timeInp.value = fixedTimeStr ? fixedTimeStr : toLocalTimeStr(dt);
        window.updateDeferredLivePreviewText();
    };

    window.updateDeferredLivePreviewText = function () {
        const dVal = document.getElementById('def-sched-date')?.value || '';
        const tVal = document.getElementById('def-sched-time')?.value || '';
        const prevEl = document.getElementById('def-sched-live-preview');
        if (!prevEl) return;

        const ms = parseLocalDateTimeToMs(dVal, tVal);
        if (!ms) {
            prevEl.innerText = 'يرجى تحديد التاريخ والوقت';
            return;
        }
        const label = formatArabicScheduleLabel(ms);
        const rem = formatRemainingCountdown(ms);
        prevEl.innerHTML = `🔔 سيتم تنبيهك يوم: <strong class="underline">${label}</strong> (${rem})`;
    };

    window.openDeferredScheduleModal = function (orderIdsArray) {
        const ids = Array.isArray(orderIdsArray) ? orderIdsArray : [orderIdsArray];
        if (ids.length === 0) return;
        window._deferredTargetOrderIds = ids;

        ensureDeferredScheduleModalExists();

        try {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }
        } catch (e) {}

        const firstOrd = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === ids[0]);
        const subEl = document.getElementById('def-modal-subtitle');
        if (subEl) {
            subEl.innerText = ids.length === 1 && firstOrd
                ? `العميل: ${firstOrd.customerName || 'بدون اسم'} (${firstOrd.zone || ''})`
                : `تأجيل جماعي لعدد (${ids.length}) طلبات محددة`;
        }

        const dateInp = document.getElementById('def-sched-date');
        const timeInp = document.getElementById('def-sched-time');
        const reasonInp = document.getElementById('def-sched-reason');

        if (firstOrd && firstOrd.deferredDate && firstOrd.deferredTime) {
            if (dateInp) dateInp.value = firstOrd.deferredDate;
            if (timeInp) timeInp.value = firstOrd.deferredTime;
            if (reasonInp) reasonInp.value = firstOrd.deferredReason || '';
        } else {
            window.applyDeferredQuickPreset(0, 1, '12:00');
            if (reasonInp) reasonInp.value = '';
        }

        window.updateDeferredLivePreviewText();
        if (typeof openModal === 'function') openModal('deferred-schedule-modal');
        else document.getElementById('deferred-schedule-modal')?.classList.remove('hidden');
    };

    window.cancelDeferredScheduleModal = function () {
        window._deferredTargetOrderIds = [];
        if (typeof closeModal === 'function') closeModal('deferred-schedule-modal');
        else document.getElementById('deferred-schedule-modal')?.classList.add('hidden');
        window.renderOrdersList();
    };

    window.confirmDeferredOrderSchedule = async function () {
        const ids = window._deferredTargetOrderIds || [];
        if (ids.length === 0) return window.cancelDeferredScheduleModal();

        const dVal = document.getElementById('def-sched-date')?.value || '';
        const tVal = document.getElementById('def-sched-time')?.value || '';
        const reason = (document.getElementById('def-sched-reason')?.value || '').trim();

        const targetMs = parseLocalDateTimeToMs(dVal, tVal);
        if (!targetMs) return alert('برجاء تحديد التاريخ والوقت بشكل صحيح!');

        const displayStr = formatArabicScheduleLabel(targetMs);
        const btn = document.getElementById('btn-confirm-deferred-sched');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري حفظ الموعد وضبط المنبه...';
        }

        try {
            window._bypassDeferredModal = true;

            for (const id of ids) {
                const ord = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === id);
                if (!ord) continue;

                if (ord.status !== 'deferred' && typeof window._origUpdateOrderStatusForDeferred === 'function') {
                    await window._origUpdateOrderStatusForDeferred(id, 'deferred');
                }

                const noteChunk = `[📅 مؤجل لموعد: ${displayStr}]${reason ? ' — ' + reason : ''}`;
                const updatedAdminNote = ord.adminNote ? `${ord.adminNote}\n---\n${noteChunk}` : noteChunk;

                const scheduleData = {
                    status: 'deferred',
                    deferredDate: dVal,
                    deferredTime: tVal,
                    deferredUntilMs: targetMs,
                    deferredDisplayStr: displayStr,
                    deferredReason: reason,
                    deferredAlertDismissed: false,
                    deferredNotifiedOnce: false,
                    adminNote: updatedAdminNote
                };

                await db.collection('orders').doc(id).update(scheduleData);

                Object.assign(ord, scheduleData);
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                    Object.assign(globalOrdersMap[id], scheduleData);
                }
            }

            if (typeof closeModal === 'function') closeModal('deferred-schedule-modal');
            else document.getElementById('deferred-schedule-modal')?.classList.add('hidden');

            document.querySelectorAll('.bulk-order-cb').forEach(cb => { cb.checked = false; });
            document.getElementById('bulk-actions-bar')?.classList.add('hidden');

            window.renderOrdersList();
            window.checkDueDeferredOrdersNow();
            if (typeof window.showToast === 'function') {
                window.showToast(`⏰ تم تأجيل الطلب وضبط المنبه ليوم (${displayStr})`);
            }
        } catch (e) {
            console.error('Deferred schedule save error:', e);
            alert('حدث خطأ أثناء حفظ موعد التأجيل!');
        } finally {
            window._bypassDeferredModal = false;
            window._deferredTargetOrderIds = [];
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    // ⚖️ إدارة دورة حجز الأوزان القادمة من متجر العملاء (فك تلقائي عند الإلغاء/السلة + خصم نهائي عند الإكمال)
    window.syncWeightHoldForOrderStatus = async function (orderObj, newStatus) {
        if (!orderObj || !orderObj.id || !Array.isArray(orderObj.items)) return;
        const hasWeightItem = orderObj.items.some(i =>
            i && (i.isWeightBased || (typeof storeProducts !== 'undefined' && storeProducts[i.id]?.isWeightBased))
        );
        if (!hasWeightItem) return;

        const holdsRef = db.collection('inventory').doc('weight_holds');

        try {
            if (newStatus === 'canceled' || newStatus === 'trash') {
                await holdsRef.update({
                    [orderObj.id]: firebase.firestore.FieldValue.delete()
                }).catch(() => {});
                return;
            }

            if (newStatus === 'completed') {
                const holdsSnap = await holdsRef.get().catch(() => null);
                const holdsData = (holdsSnap && holdsSnap.exists) ? (holdsSnap.data() || {}) : {};
                const orderHoldMap = holdsData[orderObj.id];
                if (!orderHoldMap || typeof orderHoldMap !== 'object') return;

                let invTouched = false;
                Object.keys(orderHoldMap).forEach(prodId => {
                    const gramsToDeduct = Array.isArray(orderHoldMap[prodId]) ? orderHoldMap[prodId] : [];
                    if (!storeProducts || !storeProducts[prodId] || gramsToDeduct.length === 0) return;

                    const curArr = typeof window.parseWeightsArray === 'function'
                        ? window.parseWeightsArray(storeProducts[prodId].weightsList)
                        : String(storeProducts[prodId].weightsList || '').split(/[\s,،;\n\r\-]+/).map(Number).filter(n => !isNaN(n) && n > 0);

                    gramsToDeduct.forEach(g => {
                        const idx = curArr.indexOf(Number(g));
                        if (idx > -1) curArr.splice(idx, 1);
                    });

                    storeProducts[prodId].weightsList = curArr.join(' ');
                    if (typeof storeStock !== 'undefined') storeStock[prodId] = curArr.length;
                    invTouched = true;
                });

                const finalizeBatch = db.batch();
                if (invTouched) {
                    finalizeBatch.set(db.collection('inventory').doc('settings'), { productsData: storeProducts }, { merge: true });
                    finalizeBatch.set(db.collection('inventory').doc('stock'), storeStock, { merge: true });
                }
                finalizeBatch.set(holdsRef, {
                    [orderObj.id]: firebase.firestore.FieldValue.delete()
                }, { merge: true });
                await finalizeBatch.commit();

                if (typeof window.renderInventoryUI === 'function' && window.smanCurrentActiveTab === 'inventory') {
                    window.renderInventoryUI();
                }
                if (typeof window.generateDynamicOrderInputs === 'function') {
                    window.generateDynamicOrderInputs();
                }
                return;
            }

            // في حالة استعادة طلب موقع من (ملغي) إلى (جديد/تجهيز): إعادة تفعيل الحجز تلقائياً
            if (['new', 'processing', 'dispatched', 'deferred', 'no_answer'].includes(newStatus) && orderObj.source !== 'admin_crm') {
                const holdPayload = {};
                orderObj.items.forEach(i => {
                    if (i && i.isWeightBased && Array.isArray(i.selectedWeightsGrams) && i.selectedWeightsGrams.length > 0) {
                        holdPayload[i.id] = i.selectedWeightsGrams.map(Number);
                    }
                });
                if (Object.keys(holdPayload).length > 0) {
                    await holdsRef.set({ [orderObj.id]: holdPayload }, { merge: true }).catch(() => {});
                }
            }
        } catch (err) {
            console.warn('Weight hold sync info:', err);
        }
    };

    function hookDeferredStatusInterceptors() {
        if (typeof window.updateOrderStatus === 'function' && !window.updateOrderStatus._deferredHooked) {
            window._origUpdateOrderStatusForDeferred = window.updateOrderStatus;
            const wrappedUpdateStatus = async function (id, newStatus) {
                if (newStatus === 'deferred' && !window._bypassDeferredModal) {
                    window.openDeferredScheduleModal([id]);
                    return;
                }
                const ord = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === id);
                if (ord && ['dispatched', 'completed'].includes(newStatus) && typeof window.orderHasPendingWeight === 'function' && window.orderHasPendingWeight(ord)) {
                    if (typeof window.showToast === 'function') window.showToast('⚖️ سكّن أوزان الطلب أولاً لحساب الفاتورة النهائية قبل التسليم!');
                    window.openAssignPendingWeightsModal(id);
                    return;
                }
                if (ord && ord.status === 'deferred' && newStatus !== 'deferred') {
                    ord.deferredAlertDismissed = true;
                    db.collection('orders').doc(id).update({ deferredAlertDismissed: true }).catch(() => {});
                }
                const res = await window._origUpdateOrderStatusForDeferred.apply(this, arguments);
                if (ord) {
                    window.syncWeightHoldForOrderStatus(ord, newStatus);
                }
                window.checkDueDeferredOrdersNow();
                return res;
            };
            wrappedUpdateStatus._deferredHooked = true;
            window.updateOrderStatus = wrappedUpdateStatus;
        }


        if (typeof window.bulkChangeStatus === 'function' && !window.bulkChangeStatus._deferredHooked) {
            const _origBulkStatus = window.bulkChangeStatus;
            const wrappedBulkStatus = async function (newStatus) {
                if (newStatus === 'deferred' && !window._bypassDeferredModal) {
                    const checkedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
                    if (checkedIds.length === 0) return;
                    window.openDeferredScheduleModal(checkedIds);
                    return;
                }
                return _origBulkStatus.apply(this, arguments);
            };
            wrappedBulkStatus._deferredHooked = true;
            window.bulkChangeStatus = wrappedBulkStatus;
        }
    }

    window.decorateDeferredOrderCards = function () {
        const container = document.getElementById('orders-list-vertical');
        if (!container) return;

        const cards = container.querySelectorAll('.order-card[data-id]');
        cards.forEach(card => {
            const orderId = card.getAttribute('data-id');
            const o = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(x => x && x.id === orderId);
            if (!o || o.status !== 'deferred') return;

            let oldBanner = card.querySelector('.def-schedule-card-banner');
            if (oldBanner) oldBanner.remove();

            const banner = document.createElement('div');
            banner.className = 'def-schedule-card-banner';

            if (o.deferredUntilMs) {
                const isDue = o.deferredUntilMs <= Date.now();
                const remTxt = formatRemainingCountdown(o.deferredUntilMs);

                banner.innerHTML = `
                    <div class="${isDue ? 'bg-red-600 text-white animate-pulse border-red-700' : 'bg-orange-50 text-orange-950 border-orange-300'} border-2 px-3 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs font-black shadow-sm">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <i class="fa-solid ${isDue ? 'fa-bell fa-shake text-amber-300' : 'fa-clock text-orange-600'}"></i>
                            <span>موعد التأجيل: <strong>${o.deferredDisplayStr || ''}</strong></span>
                            <span class="px-2 py-0.5 rounded-lg text-[10px] ${isDue ? 'bg-white text-red-700' : 'bg-orange-200/80 text-orange-900'}">${remTxt}</span>
                            ${o.deferredReason ? `<span class="text-[10px] opacity-90">• (${o.deferredReason})</span>` : ''}
                        </div>
                        <div class="flex items-center gap-1.5">
                            ${isDue ? `<button type="button" onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm">🔥 ابدأ التجهيز الآن</button>` : ''}
                            <button type="button" onclick="event.stopPropagation(); openDeferredScheduleModal(['${o.id}'])" class="${isDue ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white hover:bg-orange-600 text-orange-800 hover:text-white border border-orange-300'} px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors">
                                📅 تغيير الموعد
                            </button>
                        </div>
                    </div>
                `;
            } else {
                banner.innerHTML = `
                    <div class="bg-orange-50 border border-orange-200 text-orange-900 px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-xs font-black">
                        <span><i class="fa-regular fa-calendar-plus text-orange-600 ml-1"></i> هذا الطلب مؤجل بدون موعد منبه محدد</span>
                        <button type="button" onclick="event.stopPropagation(); openDeferredScheduleModal(['${o.id}'])" class="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded-lg text-[10px] font-black shadow-sm">
                            ⏰ تحديد التاريخ والوقت
                        </button>
                    </div>
                `;
            }

            card.insertBefore(banner, card.firstChild);
        });
    };

    window.checkDueDeferredOrdersNow = function () {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const nowMs = Date.now();

        const dueOrders = ordersList.filter(o =>
            o &&
            o.status === 'deferred' &&
            !o.isArchived &&
            o.deferredUntilMs &&
            o.deferredUntilMs <= nowMs &&
            !o.deferredAlertDismissed
        );

        let alarmBar = document.getElementById('deferred-due-alarm-bar');

        if (dueOrders.length === 0) {
            if (alarmBar) alarmBar.classList.add('hidden');
            return;
        }

        let shouldRingNow = false;
        dueOrders.forEach(o => {
            if (!o.deferredNotifiedOnce) {
                o.deferredNotifiedOnce = true;
                shouldRingNow = true;
                db.collection('orders').doc(o.id).update({ deferredNotifiedOnce: true }).catch(() => {});

                try {
                    if ('Notification' in window && Notification.permission === 'granted') {
                        const itemsTxt = Array.isArray(o.items) ? o.items.map(i => `${i.quantity}x ${i.name}`).join(' + ') : '';
                        new Notification(`⏰ حان موعد طلب مؤجل: ${o.customerName || 'عميل'}`, {
                            body: `المنطقة: ${o.zone || ''} | الأصناف: ${itemsTxt} | الإجمالي: ${o.total || 0} ج`,
                            icon: 'super.png'
                        });
                    }
                } catch (e) {}
            }
        });

        if (shouldRingNow) {
            window.playDeferredAlarmChime();
        }

        if (!alarmBar) {
            alarmBar = document.createElement('div');
            alarmBar.id = 'deferred-due-alarm-bar';
            alarmBar.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-[215] w-[95vw] max-w-2xl bg-gradient-to-l from-red-700 via-red-600 to-orange-600 text-white p-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 space-y-2.5';
            document.body.appendChild(alarmBar);
        }

        const rowsHtml = dueOrders.slice(0, 4).map(o => {
            const itemsTxt = Array.isArray(o.items) ? o.items.map(i => `${i.quantity}x ${i.name}`).join(' + ') : '';
            return `
                <div class="bg-black/25 p-2.5 rounded-xl border border-white/15 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div class="text-xs font-black flex items-center gap-1.5">
                            <span class="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-[10px]">⏰ ${o.deferredDisplayStr || 'حان الموعد'}</span>
                            <span>${o.customerName || 'عميل'} (${o.zone || ''})</span>
                            <span class="text-amber-300">${o.total || 0} ج</span>
                        </div>
                        <p class="text-[11px] text-red-100 font-bold mt-0.5">${itemsTxt} ${o.deferredReason ? `• (${o.deferredReason})` : ''}</p>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" onclick="updateOrderStatus('${o.id}', 'processing')" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-xl text-[11px] font-black shadow-md transition-all">
                            🔥 للتجهيز الآن
                        </button>
                        <button type="button" onclick="openDeferredScheduleModal(['${o.id}'])" class="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-black">
                            📅 تأجيل
                        </button>
                        <button type="button" onclick="dismissDeferredOrderAlert('${o.id}')" class="bg-black/30 hover:bg-black/50 text-white/80 px-2 py-1.5 rounded-xl text-[10px] font-black" title="كتم التنبيه">
                            🔕
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        alarmBar.innerHTML = `
            <div class="flex items-center justify-between border-b border-white/20 pb-2">
                <div class="flex items-center gap-2 text-xs sm:text-sm font-black">
                    <i class="fa-solid fa-bell fa-shake text-amber-300 text-base"></i>
                    <span>تنبيه المواعيد: لديك (${dueOrders.length}) طلب مؤجل حان موعد تجهيزه الآن!</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <button type="button" onclick="playDeferredAlarmChime()" class="bg-white/15 hover:bg-white/25 text-white px-2 py-1 rounded-lg text-[10px] font-black" title="اختبار الصوت">🔊</button>
                    <button type="button" onclick="document.getElementById('deferred-due-alarm-bar').classList.add('hidden')" class="bg-white/15 hover:bg-white/25 text-white w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center">✕</button>
                </div>
            </div>
            <div class="space-y-2 max-h-60 overflow-y-auto custom-scroll">${rowsHtml}</div>
        `;
        alarmBar.classList.remove('hidden');
    };

    window.dismissDeferredOrderAlert = async function (orderId) {
        const ord = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (ord) {
            ord.deferredAlertDismissed = true;
            await db.collection('orders').doc(orderId).update({ deferredAlertDismissed: true }).catch(() => {});
        }
        window.checkDueDeferredOrdersNow();
        window.renderOrdersList();
    };

    const _origRenderOrdersForDeferred = window.renderOrdersList;
    window.renderOrdersList = function () {
        const res = _origRenderOrdersForDeferred.apply(this, arguments);
        hookDeferredStatusInterceptors();
        window.decorateDeferredOrderCards();
        return res;
    };

    function bootOrdersAndDeferredEngine() {
        window.initSmartOrdersToolbar();
        hookDeferredStatusInterceptors();
        window.decorateDeferredOrderCards();
        window.checkDueDeferredOrdersNow();
        setInterval(() => {
            window.checkDueDeferredOrdersNow();
            if (typeof currentOrderTab !== 'undefined' && currentOrderTab === 'deferred') {
                document.querySelectorAll('.order-card[data-id]').forEach(card => {
                    const ord = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(x => x && x.id === card.getAttribute('data-id'));
                    if (!ord || !ord.deferredUntilMs) return;
                    const remSpan = card.querySelector('.def-schedule-card-banner span.rounded');
                    if (remSpan) {
                        const newRem = formatRemainingCountdown(ord.deferredUntilMs);
                        if (remSpan.innerText !== newRem) remSpan.innerText = newRem;
                    }
                });
            }
        }, 30000);

    }

    // =========================================================================
    // ⚖️ 12. نافذة تسكين أوزان طلبات الحجز بالعدد (يوم الذبح بضغطة واحدة)
    // =========================================================================
    let assigningWeightOrderId = null;

    window.orderHasPendingWeight = function (ord) {
        return Boolean(ord && Array.isArray(ord.items) && ord.items.some(i => i && i.pendingWeight));
    };

    function parseGramListSafe(rawStr) {
        if (typeof window.parseWeightsArray === 'function') return window.parseWeightsArray(rawStr);
        return String(rawStr || '')
            .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0))
            .split(/[\s,،;+\n\r\-]+/)
            .map(v => parseFloat(v.trim()))
            .filter(v => !isNaN(v) && v > 0);
    }

    function ensureAssignWeightsModal() {
        let modal = document.getElementById('sman-assign-weights-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'sman-assign-weights-modal';
        modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[250] hidden flex items-center justify-center p-3';
        modal.innerHTML = `
            <div class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-lg overflow-hidden border-2 border-indigo-300 max-h-[92vh] flex flex-col">
                <div class="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-white flex items-center gap-2">
                            <i class="fa-solid fa-scale-balanced text-amber-400"></i>
                            <span>تسكين أوزان الطلب (يوم الذبح)</span>
                        </h3>
                        <p id="aw-order-subtitle" class="text-[11px] font-bold text-indigo-200 mt-0.5"></p>
                    </div>
                    <button type="button" onclick="closeAssignPendingWeightsModal()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-rose-500 text-white flex items-center justify-center">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div id="aw-items-body" class="p-4 space-y-3 overflow-y-auto flex-1 bg-slate-50/70"></div>

                <div class="p-4 bg-white border-t border-slate-100 space-y-2.5 shrink-0">
                    <div id="aw-live-summary" class="bg-indigo-950 text-white px-3.5 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs font-black"></div>
                    <div class="flex gap-2">
                        <button type="button" id="aw-save-btn" onclick="saveAssignedPendingWeights()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 active:scale-95">
                            <i class="fa-solid fa-check-double"></i>
                            <span>اعتماد الأوزان وتحديث الفاتورة</span>
                        </button>
                        <button type="button" onclick="closeAssignPendingWeightsModal()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-4 py-3 rounded-xl text-xs">إلغاء</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    window.closeAssignPendingWeightsModal = function () {
        document.getElementById('sman-assign-weights-modal')?.classList.add('hidden');
        assigningWeightOrderId = null;
    };

    window.openAssignPendingWeightsModal = function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === orderId);
        if (!order || !Array.isArray(order.items)) return;

        const pendingEntries = order.items
            .map((item, idx) => ({ item, idx }))
            .filter(x => x.item && x.item.pendingWeight);
        if (pendingEntries.length === 0) return;

        assigningWeightOrderId = orderId;
        ensureAssignWeightsModal();

        const sub = document.getElementById('aw-order-subtitle');
        if (sub) sub.textContent = `العميل: ${order.customerName || ''} (${order.zone || ''})`;

        const body = document.getElementById('aw-items-body');
        body.innerHTML = pendingEntries.map(({ item, idx }) => {
            const p = (typeof storeProducts !== 'undefined' && storeProducts[item.id]) ? storeProducts[item.id] : null;
            const pName = p?.name || item.name || 'صنف بالميزان';
            const kiloPrice = Number(item.price) || Number(storePrices?.[item.id]) || Number(p?.basePrice) || 0;
            const reqCount = Number(item.birdsCount) || 1;
            const stockGrams = p ? parseGramListSafe(p.weightsList) : [];

            const stockCbsHtml = stockGrams.length > 0
                ? `<div class="space-y-1">
                       <span class="text-[10px] font-black text-indigo-800 block">📦 اختر من المصفوفة الجاهزة بالمخزن (${stockGrams.length} متاح):</span>
                       <div class="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto custom-scroll">
                           ${stockGrams.map((g, sIdx) => `
                               <label class="flex items-center justify-between gap-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200 px-2.5 py-1.5 rounded-xl cursor-pointer text-[11px] font-black">
                                   <span class="flex items-center gap-1.5">
                                       <input type="checkbox" data-item-idx="${idx}" data-prod-id="${item.id}" data-stock-idx="${sIdx}" value="${g}" onchange="recalcAssignWeightsPreview()" class="aw-stock-cb-${idx} w-4 h-4 accent-indigo-600 rounded">
                                       <span class="text-indigo-900">${g} جم</span>
                                   </span>
                                   <span class="text-[10px] text-emerald-700">${Math.round((g / 1000) * kiloPrice)}ج</span>
                               </label>
                           `).join('')}
                       </div>
                   </div>`
                : `<div class="text-[10px] font-bold text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-2 text-center">مصفوفة المخزن فارغة حالياً — اكتب الأوزان بالجرام مباشرة بالأسفل</div>`;

            return `
            <div class="bg-white border-2 border-indigo-200 rounded-2xl p-3.5 space-y-2.5 shadow-sm" data-aw-entry="${idx}">
                <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                        <h4 class="text-sm font-black text-indigo-950">${pName}</h4>
                        <span class="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-block mt-0.5">مطلوب حجز: ${reqCount} عدد</span>
                    </div>
                    <div class="flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-1 rounded-xl">
                        <span class="text-[10px] font-black text-blue-800">الكيلو:</span>
                        <input type="number" id="aw-price-${idx}" value="${kiloPrice}" oninput="recalcAssignWeightsPreview()" class="w-16 bg-white border border-blue-200 rounded-lg py-0.5 text-center text-xs font-black text-blue-950 outline-none">
                        <span class="text-[10px] font-black text-blue-700">ج</span>
                    </div>
                </div>

                ${stockCbsHtml}

                <div class="space-y-1">
                    <label class="text-[10px] font-black text-slate-700 block">✍️ أو اكتب أوزان الفرخات بالجرام (افصل بينهم بمسافة):</label>
                    <input type="text" id="aw-manual-${idx}" dir="ltr" oninput="recalcAssignWeightsPreview()" placeholder="مثال: 1650 1800 1720" class="w-full border-2 border-indigo-200 focus:border-indigo-500 rounded-xl p-2 text-xs font-black text-slate-900 bg-indigo-50/30 outline-none">
                </div>

                <div id="aw-line-preview-${idx}" class="bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-center">لم يتم تحديد الأوزان بعد</div>
            </div>`;
        }).join('');

        document.getElementById('sman-assign-weights-modal').classList.remove('hidden');
        window.recalcAssignWeightsPreview();
    };

    window.recalcAssignWeightsPreview = function () {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === assigningWeightOrderId);
        if (!order || !Array.isArray(order.items)) return;

        let newSubtotal = 0;
        let readyCount = 0;
        let totalPendingEntries = 0;

        order.items.forEach((item, idx) => {
            if (!item) return;
            if (!item.pendingWeight) {
                newSubtotal += Math.round((Number(item.quantity) || 0) * (Number(item.price) || 0));
                return;
            }
            totalPendingEntries++;
            const kiloPrice = Number(document.getElementById(`aw-price-${idx}`)?.value) || Number(item.price) || 0;
            const checkedGrams = Array.from(document.querySelectorAll(`.aw-stock-cb-${idx}:checked`))
                .map(cb => parseFloat(cb.value))
                .filter(v => !isNaN(v) && v > 0);
            const manualGrams = parseGramListSafe(document.getElementById(`aw-manual-${idx}`)?.value || '');
            const allGrams = [...checkedGrams, ...manualGrams];
            const prevEl = document.getElementById(`aw-line-preview-${idx}`);

            if (allGrams.length > 0) {
                readyCount++;
                const totalGrams = allGrams.reduce((s, v) => s + v, 0);
                const kg = Number((totalGrams / 1000).toFixed(3));
                const lineMoney = Math.round(kg * kiloPrice);
                newSubtotal += lineMoney;
                if (prevEl) {
                    prevEl.className = 'bg-emerald-50 border border-emerald-200 text-emerald-900 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-center';
                    prevEl.textContent = `✅ ${allGrams.length} عدد • ${kg} كجم (${allGrams.join(' + ')} جم) = ${lineMoney} ج.م`;
                }
            } else if (prevEl) {
                prevEl.className = 'bg-slate-100 text-slate-500 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-center';
                prevEl.textContent = 'اختر من المصفوفة أو اكتب الأوزان بالجرام بالأعلى';
            }
        });

        const deliv = Number(order.deliveryFee) || 0;
        const disc = Number(order.discount) || 0;
        const newTotal = Math.max(0, newSubtotal + deliv - disc);
        const sumEl = document.getElementById('aw-live-summary');
        if (sumEl) {
            sumEl.innerHTML = `
                <span>المنتجات: <strong class="text-amber-300">${newSubtotal} ج</strong> + شحن ${deliv}ج${disc > 0 ? ` - خصم ${disc}ج` : ''}</span>
                <span>الإجمالي الجديد: <strong class="text-emerald-300 text-sm">${newTotal} ج.م</strong></span>
            `;
        }
        const saveBtn = document.getElementById('aw-save-btn');
        if (saveBtn) saveBtn.disabled = (readyCount < totalPendingEntries);
    };

    window.saveAssignedPendingWeights = async function () {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o && o.id === assigningWeightOrderId);
        if (!order || !Array.isArray(order.items)) return;

        const saveBtn = document.getElementById('aw-save-btn');
        const origHtml = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ وتحديث الفاتورة...';
        }

        try {
            const newItems = [];
            let newSubtotal = 0;
            const stockRemovalsByProd = {};
            const noteSummaries = [];

            for (let idx = 0; idx < order.items.length; idx++) {
                const item = order.items[idx];
                if (!item) continue;
                if (!item.pendingWeight) {
                    newItems.push(item);
                    newSubtotal += Math.round((Number(item.quantity) || 0) * (Number(item.price) || 0));
                    continue;
                }

                const kiloPrice = Number(document.getElementById(`aw-price-${idx}`)?.value) || Number(item.price) || 0;
                const checkedCbs = Array.from(document.querySelectorAll(`.aw-stock-cb-${idx}:checked`));
                const checkedGrams = [];
                checkedCbs.forEach(cb => {
                    const g = parseFloat(cb.value);
                    const sIdx = parseInt(cb.getAttribute('data-stock-idx'));
                    if (!isNaN(g) && g > 0) checkedGrams.push(g);
                    if (!isNaN(sIdx)) {
                        if (!stockRemovalsByProd[item.id]) stockRemovalsByProd[item.id] = [];
                        stockRemovalsByProd[item.id].push(sIdx);
                    }
                });
                const manualGrams = parseGramListSafe(document.getElementById(`aw-manual-${idx}`)?.value || '');
                const allGrams = [...checkedGrams, ...manualGrams];

                if (allGrams.length === 0) {
                    alert('يرجى إدخال أو اختيار أوزان لكل الأصناف المعلّقة أولاً!');
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origHtml; }
                    return;
                }

                const totalGrams = allGrams.reduce((s, v) => s + v, 0);
                const kg = Number((totalGrams / 1000).toFixed(3));
                const baseName = (typeof storeProducts !== 'undefined' && storeProducts[item.id]?.name) ? storeProducts[item.id].name : 'صنف بالميزان';
                const detailsStr = allGrams.join(' + ');
                const finalName = `${baseName} [${allGrams.length} فرخة = ${kg} كجم] (${detailsStr} جم)`;

                newItems.push({
                    id: item.id,
                    name: finalName,
                    quantity: kg,
                    price: kiloPrice,
                    birdsCount: allGrams.length,
                    selectedWeightsGrams: allGrams,
                    isWeightBased: true,
                    pendingWeight: false
                });
                newSubtotal += Math.round(kg * kiloPrice);
                noteSummaries.push(`${baseName}: ${kg} كجم (${detailsStr} جم)`);
            }

            const oldTotal = Number(order.total) || 0;
            const deliv = Number(order.deliveryFee) || 0;
            const disc = Number(order.discount) || 0;
            const newTotal = Math.max(0, newSubtotal + deliv - disc);
            const totalDiff = newTotal - oldTotal;

            const dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const weightLogNote = `[${dateStr}] 🛡️ تم تسكين الأوزان: ${noteSummaries.join(' | ')} — الإجمالي النهائي: ${newTotal} ج`;
            const updatedAdminNote = order.adminNote ? `${order.adminNote}\n---\n${weightLogNote}` : weightLogNote;

            const orderPatch = {
                items: newItems,
                subtotal: newSubtotal,
                total: newTotal,
                adminNote: updatedAdminNote
            };
            if ((order.paymentMethod || 'cash') === 'cash') {
                orderPatch.paidCash = newTotal;
                orderPatch.paidOnline = 0;
            } else if (order.paymentMethod === 'online') {
                orderPatch.paidCash = 0;
                orderPatch.paidOnline = newTotal;
            }

            const dbBatch = db.batch();
            dbBatch.update(db.collection('orders').doc(order.id), orderPatch);

            if (totalDiff !== 0) {
                dbBatch.set(db.collection('inventory').doc('stats'), {
                    sales: firebase.firestore.FieldValue.increment(totalDiff)
                }, { merge: true });
                if (order.customerPhone) {
                    const normP = window.normalizePhone ? window.normalizePhone(order.customerPhone) : String(order.customerPhone).trim();
                    const cleanP = normP.startsWith('0') ? normP : '0' + normP;
                    if (cleanP.length >= 10) {
                        dbBatch.set(db.collection('customers').doc(cleanP), {
                            totalSpent: firebase.firestore.FieldValue.increment(totalDiff)
                        }, { merge: true });
                    }
                }
            }

            let invTouched = false;
            Object.keys(stockRemovalsByProd).forEach(prodId => {
                if (!storeProducts || !storeProducts[prodId]) return;
                const curArr = parseGramListSafe(storeProducts[prodId].weightsList);
                const idxs = [...new Set(stockRemovalsByProd[prodId])].sort((a, b) => b - a);
                idxs.forEach(rmIdx => {
                    if (rmIdx >= 0 && rmIdx < curArr.length) curArr.splice(rmIdx, 1);
                });
                storeProducts[prodId].weightsList = curArr.join(' ');
                if (typeof storeStock !== 'undefined') storeStock[prodId] = curArr.length;
                invTouched = true;
            });

            if (invTouched) {
                dbBatch.set(db.collection('inventory').doc('settings'), { productsData: storeProducts }, { merge: true });
                dbBatch.set(db.collection('inventory').doc('stock'), storeStock, { merge: true });
            }

            await dbBatch.commit();

            Object.assign(order, orderPatch);
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[order.id]) {
                Object.assign(globalOrdersMap[order.id], orderPatch);
            }

            window.closeAssignPendingWeightsModal();
            window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            if (typeof window.showToast === 'function') {
                window.showToast(`⚖️ تم تسكين الأوزان وتحديث الفاتورة إلى (${newTotal} ج.م) بنجاح!`);
            }
        } catch (err) {
            console.error('Assign pending weights error:', err);
            alert('حدث خطأ أثناء حفظ الأوزان، حاول مرة أخرى!');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = origHtml;
            }
        }
    };

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', bootOrdersAndDeferredEngine);
    } else {
        bootOrdersAndDeferredEngine();
    }
})();
