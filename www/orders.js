// =========================================================================
// ⚡ المحرك الذكي المستقل لإدارة الطلبات الحية، التحضير، التعديل، والملاحظات (orders.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة الكاملة غير المقطوعة
// =========================================================================

(function () {
    // 1. حالة الفلاتر المتقدمة والعرض في شاشة الطلبات
    window.ordersFilterState = {
        batch: 'all',       // 'all' | 'normal_only' | 'batches_only' | batchName
        zone: 'all',        // 'all' | zoneName
        payment: 'all',     // 'all' | 'cash' | 'online' | 'has_debt' | 'has_discount'
        driver: 'all',      // 'all' | 'unassigned' | driverName
        compactMode: false, // وضع العرض المدمج السريع مع إظهار الأصناف كاملة
        filtersOpen: false, // طي قوائم الفلترة افتراضياً لمنع الزحام البصري
        packingScope: 'processing', // 'processing' | 'new_and_proc' | 'dispatched'
        packingBatch: 'all',
        packingZone: 'all'
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
    // 🎛️ 3. شريط التحكم المدمج والملخص اللحظي (بدون زحام بصري)
    // =========================================================================
    window.initSmartOrdersToolbar = function () {
        const ordersView = document.getElementById('view-orders');
        if (!ordersView || document.getElementById('smart-orders-toolbar')) return;

        const stickyHeader = ordersView.querySelector('.sticky');
        if (!stickyHeader) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'smart-orders-toolbar';
        toolbar.className = 'mt-2 pt-2 border-t border-slate-200/80 space-y-2';

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
                    <button onclick="safeOpenAddOrderModal()" class="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3 py-1 rounded-lg text-[11px] font-black transition-all shadow-sm flex items-center gap-1 active:scale-95">
                        <i class="fa-solid fa-plus"></i> طلب جديد
                    </button>
                    <button onclick="toggleAdvancedFiltersDrawer()" id="so-btn-toggle-filters" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-filter text-amber-400 text-[10px]"></i> فلتر <span id="so-active-filters-dot" class="hidden w-2 h-2 rounded-full bg-amber-400"></span>
                    </button>
                    <button onclick="toggleSelectAllVisibleOrders()" id="so-btn-select-all" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1" title="تحديد الكل">
                        <i class="fa-solid fa-check-double text-emerald-400 text-[10px]"></i> الكل
                    </button>
                    <button onclick="toggleOrdersCompactMode()" id="so-btn-compact" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1" title="تبديل العرض المدمج والتفصيلي">
                        <i class="fa-solid fa-compress text-sky-400 text-[10px]"></i> مدمج
                    </button>
                </div>
            </div>

            <!-- درج الفلاتر المتقدمة (يفتح عند الحاجة فقط لمنع الزحام) -->
            <div id="so-advanced-filters-drawer" class="hidden grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                <select id="so-filter-batch" onchange="setOrdersQuickFilter('batch', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-teal-800 outline-none focus:bg-white focus:border-brand-primary">
                    <option value="all">🏷️ كل الدفعات والفوري</option>
                </select>

                <select id="so-filter-zone" onchange="setOrdersQuickFilter('zone', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-indigo-800 outline-none focus:bg-white focus:border-brand-primary">
                    <option value="all">📍 كل المناطق</option>
                </select>

                <select id="so-filter-payment" onchange="setOrdersQuickFilter('payment', this.value)" class="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-slate-700 outline-none focus:bg-white focus:border-brand-primary">
                    <option value="all">💳 كل طرق الدفع</option>
                    <option value="cash">💵 كاش عند الاستلام</option>
                    <option value="online">💳 خالص أونلاين</option>
                    <option value="has_debt">📕 عليه آجل</option>
                    <option value="has_discount">🎁 طلبات بخصم</option>
                </select>

                <div class="flex gap-1">
                    <select id="so-filter-driver" onchange="setOrdersQuickFilter('driver', this.value)" class="flex-1 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-[11px] font-black text-blue-800 outline-none focus:bg-white focus:border-brand-primary">
                        <option value="all">🛵 كل المناديب</option>
                    </select>
                    <button onclick="resetAllOrdersFilters()" id="so-btn-reset-filters" class="hidden bg-red-100 hover:bg-red-600 text-red-600 hover:text-white px-2.5 rounded-lg text-[10px] font-black transition-all" title="مسح الفلاتر">✕</button>
                </div>
            </div>
        `;

        stickyHeader.appendChild(toolbar);

        // ترقية شريط التحديد الجماعي
        const bulkBar = document.getElementById('bulk-actions-bar');
        if (bulkBar && !document.getElementById('bulk-extra-deferred-btn')) {
            const btnsWrap = bulkBar.querySelector('.flex.flex-wrap');
            if (btnsWrap) {
                const extraBtns = document.createElement('span');
                extraBtns.id = 'bulk-extra-deferred-btn';
                extraBtns.className = 'inline-flex flex-wrap gap-1.5';
                extraBtns.innerHTML = `
                    <button onclick="bulkChangeStatus('new')" class="bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-colors shadow-sm">لجديد</button>
                    <button onclick="openDispatchModal()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-colors shadow-sm"><i class="fa-solid fa-motorcycle"></i> للمندوب</button>
                    <button onclick="bulkChangeStatus('deferred')" class="bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-colors shadow-sm">مؤجل</button>
                    <button onclick="clearAllBulkSelections()" class="bg-slate-600 hover:bg-slate-500 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-colors shadow-sm" title="إلغاء التحديد">✕</button>
                `;
                btnsWrap.appendChild(extraBtns);
            }
        }
    };

    window.toggleAdvancedFiltersDrawer = function () {
        const drawer = document.getElementById('so-advanced-filters-drawer');
        if (!drawer) return;
        window.ordersFilterState.filtersOpen = !window.ordersFilterState.filtersOpen;
        if (window.ordersFilterState.filtersOpen) {
            drawer.classList.remove('hidden');
        } else {
            drawer.classList.add('hidden');
        }
    };

    window.setOrdersQuickFilter = function (key, val) {
        window.ordersFilterState[key] = val;
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
    // 🛵 4. نافذة وتوجيه الطلب للمندوب بخطوة واحدة (تجهيز ⬅️ إرسال للمندوب)
    // =========================================================================
    window.triggerOrderDriverStep = function (btnEl, orderId) {
        if (typeof window.openQuickDriverDispatch === 'function') {
            return window.openQuickDriverDispatch(btnEl, orderId);
        }

        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        const drivers = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
        if (drivers.length === 0) {
            if (typeof window.openDispatchModal === 'function') {
                return window.openDispatchModal();
            }
            return alert('يرجى إضافة مندوب واحد على الأقل من إعدادات المتجر أولاً!');
        }

        // إذا كان لدينا نافذة البوب أوفر الحية من live-connect نستخدمها لسرعة الاختيار
        if (typeof window.openLivePopover === 'function') {
            const drvButtons = drivers.map(d => `
                <div class="flex gap-1.5">
                    <button onclick="assignSingleOrderToDriver('${orderId}', '${d.name}', '${d.phone || ''}', false)" class="flex-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-900 hover:text-white py-2 px-3 rounded-xl text-xs font-black text-right transition-all flex items-center justify-between">
                        <span>🛵 ${d.name}</span>
                        <span class="text-[10px] opacity-75">تحويل للطريق</span>
                    </button>
                    <button onclick="assignSingleOrderToDriver('${orderId}', '${d.name}', '${d.phone || ''}', true)" class="bg-[#25D366] hover:bg-[#1ebd57] text-white px-3 rounded-xl text-xs font-black flex items-center justify-center" title="تحويل للطريق وإرسال واتساب للمندوب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                </div>
            `).join('');

            const html = `
                <div class="space-y-2.5">
                    <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span class="text-xs font-black text-indigo-800"><i class="fa-solid fa-motorcycle ml-1"></i> إرسال الطلب للمندوب</span>
                        <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <p class="text-[11px] font-bold text-slate-600">العميل: <strong class="text-slate-800">${order.customerName || ''}</strong> (${order.zone || ''})</p>
                    <div class="space-y-1.5 max-h-52 overflow-y-auto custom-scroll">${drvButtons}</div>
                    <button onclick="closeLivePopover(); openDispatchModal();" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl text-[10px] font-black mt-1">
                        📋 فتح شاشة التوجيه الجماعي للمناديب
                    </button>
                </div>
            `;
            return window.openLivePopover(btnEl, html);
        }

        // خطة بديلة إذا لم يكن البوب أوفر مفتوحاً
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
                const isOnline = order.paymentMethod === 'online';
                const totalToCollect = isOnline ? '0 ج.م (الحساب خالص أونلاين ✅)' : `${order.total || 0} ج.م`;
                const msg = `*🛵 طلب توصيل - سمان ههيا*\n👤 العميل: ${order.customerName || ''}\n📞 موبايل: ${order.customerPhone || ''}${order.customerPhone2 ? '\n📱 بديل: ' + order.customerPhone2 : ''}\n📍 العنوان: ${order.zone || ''} - ${order.customerAddress || ''}\n📦 الأصناف: ${itemsStr}\n💰 المطلوب تحصيله: *${totalToCollect}*${order.driverNote ? '\n⚠️ ملاحظة: ' + order.driverNote.split('\n---\n').pop() : ''}`;
                const cleanP = driverPhone.toString().trim();
                const waNum = cleanP.startsWith('0') ? '2' + cleanP : cleanP;
                window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
            }

            window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.showToast === 'function') window.showToast(`🛵 خرج الطلب مع المندوب: ${driverName}`);
        } catch (e) {
            alert('حدث خطأ أثناء توجيه الطلب للمندوب!');
        }
    };

    // =========================================================================
    // 💬 5. رسائل واتساب السريعة الذكية للعميل
    // =========================================================================
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
        let msg = '';

        if (templateType === 'on_way') {
            const drvInfo = order.driverName ? `مع المندوب (${order.driverName}${order.driverPhone ? ' - ' + order.driverPhone : ''})` : 'مع المندوب الآن';
            msg = `أهلاً بحضرتك يا ${cName} 🌹\nأوردر "سمان ههيا" خرج لحضرتك وفي الطريق إليك ${drvInfo} 🛵\n\n📦 الأصناف: ${itemsText}\n💰 المطلوب عند الاستلام: ${order.paymentMethod === 'online' ? '0 ج (خالص أونلاين ✅)' : total + ' ج.م'}\n\nيرجى إبقاء الهاتف متاحاً، وتشرفنا بخدمتك!`;
        } else if (templateType === 'no_answer') {
            msg = `أهلاً بحضرتك يا ${cName} 🌹\nحاولنا الاتصال بحضرتك لتنسيق تسليم أوردر "سمان ههيا" (${itemsText}) ولكن الهاتف غير متاح أو لم يتم الرد 📵\n\nيرجى التواصل معنا هنا أو تأكيد الموعد المناسب للاستلام.`;
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
    // 🚀 6. المحرك المطور لعرض وفلترة كروت الطلبات الحية (renderOrdersList)
    // =========================================================================
    window.renderOrdersList = function () {
        window.initSmartOrdersToolbar();
        populateOrdersToolbarDropdowns();

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
                if (fState.payment === 'cash' && o.paymentMethod === 'online') return false;
                if (fState.payment === 'has_debt' && !(Number(o.debt) > 0)) return false;
                if (fState.payment === 'has_discount' && !(Number(o.discount) > 0)) return false;
            }
            if (fState.driver !== 'all') {
                if (fState.driver === 'unassigned' && o.driverName) return false;
                if (fState.driver !== 'unassigned' && (o.driverName || '').trim() !== fState.driver) return false;
            }

            let itemsString = (o.items && Array.isArray(o.items)) ? o.items.map(i => i.name).join(' ') : '';
            let normPhone1 = window.normalizePhone ? window.normalizePhone(o.customerPhone) : (o.customerPhone || '');
            let normPhone2 = window.normalizePhone ? window.normalizePhone(o.customerPhone2) : (o.customerPhone2 || '');

            let searchStr = `${o.customerName || ''} ${o.customerPhone || ''} ${normPhone1} ${o.customerPhone2 || ''} ${normPhone2} ${bNameSearch} ${o.zone || ''} ${o.customerAddress || ''} ${o.driverName || ''} ${itemsString} ${o.adminNote || ''} ${o.driverNote || ''}`.toLowerCase();
            searchStr = searchStr.replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0);

            let matchSearch = filterWords.length === 0 ? true : filterWords.every(word => {
                let engWord = word.replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0);
                let normWord = window.normalizePhone ? window.normalizePhone(word) : word;
                return searchStr.includes(engWord) || (normWord !== '' && normWord.length > 5 && searchStr.includes(normWord));
            });

            let matchExact = exactPhrases.length === 0 ? true : exactPhrases.every(p => {
                let isBatch = bNameSearch.toLowerCase() === p;
                let isZone = (o.zone || '').toLowerCase() === p;
                let isName = (o.customerName || '').toLowerCase() === p;
                let isItem = o.items ? o.items.some(i => i.name.toLowerCase() === p) : false;
                return isBatch || isZone || isItem || isName || searchStr.includes(p);
            });

            let matchSmart = true;
            if (typeof currentSmartFilter !== 'undefined' && currentSmartFilter === 'vip') {
                let c = (typeof customersData !== 'undefined' ? customersData : []).find(x => window.normalizePhone(x.phone) === normPhone1);
                matchSmart = c && (c.ordersCount >= 3 || c.totalSpent >= 1500);
            } else if (typeof currentSmartFilter !== 'undefined' && currentSmartFilter === 'high_value') {
                matchSmart = Number(o.total) >= 500;
            }

            if (matchSearch && matchExact && matchSmart) {
                if (dynamicCounts[o.status] !== undefined) dynamicCounts[o.status]++;
                return true;
            }
            return false;
        });

        ['new', 'processing', 'dispatched', 'deferred', 'no_answer', 'completed', 'canceled'].forEach(s => {
            let b = document.getElementById(`badge-${s}`);
            if (b) b.innerText = dynamicCounts[s] || 0;
        });

        let activeTab = (typeof currentOrderTab !== 'undefined') ? currentOrderTab : 'all';
        let filtered = filteredBase.filter(o => (activeTab === 'all') || (o.status === activeTab));

        const getSafeOrderMs = (ord) => {
            if (!ord || !ord.createdAt) return 0;
            if (typeof ord.createdAt.toMillis === 'function') return ord.createdAt.toMillis();
            if (typeof ord.createdAt.seconds === 'number') return ord.createdAt.seconds * 1000;
            const parsed = new Date(ord.createdAt).getTime();
            return isNaN(parsed) ? 0 : parsed;
        };

        let sortDir = (typeof ordersSortDirection !== 'undefined') ? ordersSortDirection : 'desc';
        filtered.sort((a, b) => {
            let timeA = getSafeOrderMs(a);
            let timeB = getSafeOrderMs(b);
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

        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 py-16 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لا توجد طلبات مطابقة في هذا القسم.</div>';
            return;
        }

        if (typeof window.rebuildTrustCacheIfNeeded === 'function') {
            window.rebuildTrustCacheIfNeeded();
        }

        const isCompact = window.ordersFilterState.compactMode;
        const limitCount = window.ordersRenderLimit || 50;
        const visibleOrders = filtered.slice(0, limitCount);
        const remainingCount = filtered.length - visibleOrders.length;

        let cardsHtml = visibleOrders.map(o => {
            const safeMs = getSafeOrderMs(o);
            let d = o.orderDate || (safeMs ? new Date(safeMs).toLocaleDateString('en-US') : 'غير محدد');
            let ageStr = getOrderAgeLabel(o);
            let realBatchTitle = getOrderBatchTitle(o);

            // ✅ السيكول الصحيح خطوة بخطوة:
            // 1. جديد (new) ⬅️ للتجهيز (processing)
            // 2. تجهيز (processing) ⬅️ إرسال للمندوب (dispatched)
            // 3. في الطريق (dispatched) ⬅️ تم التسليم (completed)
            let nextStepBtnHtml = '';
            if (o.status === 'new') {
                nextStepBtnHtml = `<button onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 flex items-center gap-1 shrink-0" title="الخطوة 1: نقل الطلب لقسم التجهيز"><i class="fa-solid fa-fire-burner"></i> للتجهيز</button>`;
            } else if (o.status === 'processing') {
                nextStepBtnHtml = `<button data-lc-trigger="1" onclick="event.stopPropagation(); triggerOrderDriverStep(this, '${o.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 flex items-center gap-1 shrink-0" title="الخطوة 2: اختيار المندوب وإرسال الطلب للطريق"><i class="fa-solid fa-motorcycle"></i> إرسال للمندوب</button>`;
            } else if (o.status === 'dispatched') {
                nextStepBtnHtml = `<button onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'completed')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 flex items-center gap-1 shrink-0" title="الخطوة 3: تأكيد تسليم وتحصيل الطلب"><i class="fa-solid fa-check-double"></i> تم التسليم</button>`;
            } else if (o.status === 'no_answer' || o.status === 'deferred') {
                nextStepBtnHtml = `<button onclick="event.stopPropagation(); updateOrderStatus('${o.id}', 'processing')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95 flex items-center gap-1 shrink-0"><i class="fa-solid fa-rotate-left"></i> للتجهيز</button>`;
            }

            let sBadge = o.status === 'new' ? '<span class="bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-lg text-[10px] font-black">جديد</span>' :
                (o.status === 'processing' ? '<span class="bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-lg text-[10px] font-black">تجهيز</span>' :
                (o.status === 'dispatched' ? '<span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-lg text-[10px] font-black"><i class="fa-solid fa-motorcycle mr-1"></i> في الطريق</span>' :
                (o.status === 'deferred' ? '<span class="bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-lg text-[10px] font-black">مؤجل</span>' :
                (o.status === 'no_answer' ? '<span class="bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-lg text-[10px] font-black">لم يرد</span>' :
                (o.status === 'completed' ? '<span class="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-lg text-[10px] font-black">مكتمل</span>' :
                '<span class="bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-lg text-[10px] font-black">ملغي</span>')))));

            let trustInfo = (typeof window.fastAnalyzeOrderTrust === 'function')
                ? window.fastAnalyzeOrderTrust(o)
                : { cardClass: 'bg-white border-slate-100', badgeHtml: '', bannerHtml: '', stickyHtml: '' };

            // 📱 1. وضع العرض المدمج السريع (Compact Mode) - يظهر الأصناف والسعر والخطوة التالية بوضوح تام
            if (isCompact) {
                const compactItemsPills = (o.items && Array.isArray(o.items) && o.items.length > 0)
                    ? o.items.map((i, idx) => `
                        <span data-item-idx="${idx}" class="bg-slate-100 hover:bg-emerald-50 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1">
                            <strong class="text-brand-primary">${i.quantity}x</strong> ${i.name}
                        </span>
                    `).join('')
                    : '<span class="text-[10px] text-slate-400 font-bold">بدون أصناف</span>';

                const compactPayBadge = o.paymentMethod === 'online'
                    ? '<span class="bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black">خالص (أونلاين)</span>'
                    : '<span class="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-black">كاش</span>';

                const compactDriverBadge = o.driverName
                    ? `<span class="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[9px] font-black">مع: ${o.driverName}</span>`
                    : '';

                return `
                <div data-id="${o.id}" onclick="highlightOrderCard(this, event)" class="order-card ${trustInfo.cardClass} p-3 rounded-2xl shadow-sm border hover:border-brand-primary transition-all space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                            <input type="checkbox" value="${o.id}" onchange="toggleBulkActionBar()" class="bulk-order-cb w-4 h-4 accent-brand-primary cursor-pointer shrink-0">
                            <span onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 text-xs sm:text-sm cursor-pointer hover:text-brand-primary">${o.customerName || 'بدون اسم'}</span>
                            ${trustInfo.badgeHtml}
                            <a href="tel:${o.customerPhone}" class="text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white w-5 h-5 rounded-full flex items-center justify-center text-[9px] transition-colors"><i class="fa-solid fa-phone"></i></a>
                            <span data-zone-pill="1" ondblclick="inlineEdit(this, '${o.id}', 'zone')" class="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">${o.zone || 'بدون منطقة'}</span>
                            ${realBatchTitle ? `<span class="text-[9px] font-black bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">${realBatchTitle}</span>` : ''}
                            ${compactPayBadge}
                            ${compactDriverBadge}
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0 mr-auto sm:mr-0">
                            <span class="font-black text-brand-primary text-sm sm:text-base">${o.total || 0} <span class="text-[10px]">ج</span></span>
                            ${sBadge}
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                        <div class="flex flex-wrap items-center gap-1.5 flex-1 min-w-[180px]">
                            ${compactItemsPills}
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            ${nextStepBtnHtml}
                            <button onclick="sendMessageToCustomer('${o.customerPhone}', '${o.id}')" class="bg-[#25D366] hover:bg-[#1ebd57] text-white w-7 h-7 rounded-lg text-xs flex items-center justify-center shadow-sm" title="واتساب"><i class="fa-brands fa-whatsapp"></i></button>
                            <button onclick="openEditOrderModal('${o.id}')" class="bg-slate-800 hover:bg-slate-900 text-white w-7 h-7 rounded-lg text-[10px] flex items-center justify-center shadow-sm" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="printSingleOrderWaybill('${o.id}')" class="bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white border border-amber-200 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center shadow-sm" title="بوليصة"><i class="fa-solid fa-print"></i></button>
                        </div>
                    </div>
                </div>`;
            }

            // 🖥️ 2. وضع الكارت التفصيلي المنظم (3 مناطق واضحة بدون زحام)
            let completedDateHtml = '';
            if (o.status === 'completed') {
                let cTime = o.completedTimeDisplay || (o.completedAtStr ? o.completedAtStr : 'تم التسليم');
                completedDateHtml = `<span class="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-black"><i class="fa-solid fa-check-double"></i> ${cTime}</span>`;
            }

            let itemsStr = (o.items && Array.isArray(o.items)) ? o.items.map((i, idx) =>
                `<span data-item-idx="${idx}" class="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs shadow-sm inline-flex items-center gap-1.5 hover:border-brand-primary transition-colors">
                    <span class="font-black text-slate-800">${i.quantity}x ${i.name}</span>
                    <span class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded cursor-pointer border border-emerald-100 hover:bg-emerald-500 hover:text-white transition-colors" ondblclick="editItemPrice('${o.id}', ${idx})" title="اضغط مرتين لتعديل السعر">${i.price}ج</span>
                </span>`
            ).join('') : '<span class="text-slate-400 text-xs font-bold">لا يوجد تفاصيل</span>';

            let paymentBadge = (o.paymentMethod === 'online')
                ? '<span class="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded font-black inline-flex items-center gap-1 shadow-sm"><i class="fa-solid fa-check-double"></i> خالص (أونلاين)</span>'
                : '<span class="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-black inline-flex items-center gap-1 shadow-sm"><i class="fa-solid fa-money-bill-1-wave"></i> كاش</span>';

            if (o.debt && o.debt > 0) {
                paymentBadge += ` <span class="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-black inline-flex items-center gap-1 shadow-sm"><i class="fa-solid fa-triangle-exclamation"></i> آجل (${o.debt} ج)</span>`;
            }

            const safeBatchAttr = realBatchTitle.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            let batchTagHtml = realBatchTitle
                ? `<span onclick="setOrdersQuickFilter('batch', '${safeBatchAttr}')" class="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded font-black inline-flex items-center gap-1 cursor-pointer hover:bg-teal-600 hover:text-white transition-colors shadow-sm"><i class="fa-solid fa-layer-group"></i> ${realBatchTitle}</span>`
                : '';

            let driverBadgeHtml = o.driverName
                ? `<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-black inline-flex items-center gap-1 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors shadow-sm"><i class="fa-solid fa-motorcycle"></i> مع: ${o.driverName}</span>`
                : '';

            let deliveryWindowBadge = '';
            if (o.deliveryStart || o.deliveryEnd) {
                const winTxt = (o.deliveryStart && o.deliveryEnd) ? `${o.deliveryStart} ⬅️ ${o.deliveryEnd}` : (o.deliveryStart || o.deliveryEnd);
                deliveryWindowBadge = `<span class="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-black inline-flex items-center gap-1 shadow-sm"><i class="fa-regular fa-calendar-check"></i> تسليم: ${winTxt}</span>`;
            }

            const safeCustomTagAttr = (o.customTag || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            let customTagHtml = o.customTag
                ? `<span onclick="document.getElementById('search-order').value='${safeCustomTagAttr}'; renderOrdersList();" class="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded font-black inline-flex items-center gap-1 cursor-pointer hover:bg-purple-500 hover:text-white transition-colors shadow-sm"><i class="fa-solid fa-hashtag"></i> ${o.customTag}</span>`
                : '';

            let phone2Html = o.customerPhone2 ? `
                <span class="inline-flex items-center gap-1 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                    <span class="text-[9px] font-black text-purple-600">بديل:</span>
                    <span class="text-[10px] text-slate-700 font-bold" dir="ltr" ondblclick="inlineEdit(this, '${o.id}', 'customerPhone2')">${o.customerPhone2}</span>
                    <a href="tel:${o.customerPhone2}" class="text-purple-600 hover:text-purple-800 text-[9px]"><i class="fa-solid fa-phone"></i></a>
                </span>` : '';

            const adminNotesCount = o.adminNote ? o.adminNote.split('\n---\n').filter(Boolean).length : 0;
            const driverNotesCount = o.driverNote ? o.driverNote.split('\n---\n').filter(Boolean).length : 0;

            return `
            <div data-id="${o.id}" onclick="highlightOrderCard(this, event)" class="order-card ${trustInfo.cardClass} p-3.5 rounded-2xl shadow-sm border hover:shadow-md transition-all relative group cursor-pointer space-y-2.5">
                <input type="checkbox" value="${o.id}" onchange="toggleBulkActionBar()" class="bulk-order-cb absolute top-3.5 left-3.5 w-4 h-4 accent-brand-primary cursor-pointer opacity-80 group-hover:opacity-100 checked:opacity-100 transition-opacity z-10">

                ${trustInfo.bannerHtml}
                ${trustInfo.stickyHtml}

                <!-- المنطقة 1: رأس الكارت (العميل + الموقع + شارة الحالة) -->
                <div class="flex justify-between items-start gap-2 pl-6">
                    <div class="space-y-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary border-b border-transparent hover:border-brand-primary border-dashed" onclick="smartNameClick(this, '${o.id}', '${o.customerPhone}', 'customerName')">${o.customerName || 'بدون اسم'}</span>
                            ${trustInfo.badgeHtml}
                            <a href="tel:${o.customerPhone}" class="text-emerald-600 hover:text-white hover:bg-emerald-600 w-5 h-5 flex items-center justify-center bg-emerald-50 rounded-full transition-colors" title="اتصال"><i class="fa-solid fa-phone text-[9px]"></i></a>
                            <span class="text-[11px] text-slate-500 font-bold cursor-pointer" dir="ltr" ondblclick="inlineEdit(this, '${o.id}', 'customerPhone')">${o.customerPhone}</span>
                            ${phone2Html}
                        </div>

                        <div class="text-[11px] text-slate-600 font-bold flex items-center gap-1.5 flex-wrap">
                            <span data-zone-pill="1" class="cursor-pointer text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md font-black" ondblclick="inlineEdit(this, '${o.id}', 'zone')"><i class="fa-solid fa-location-dot text-indigo-500 ml-1"></i>${o.zone || 'غير مسجل'}</span>
                            ${o.customerAddress ? `<span class="cursor-pointer text-slate-600" ondblclick="inlineEdit(this, '${o.id}', 'customerAddress')">${o.customerAddress}</span>` : ''}
                        </div>
                    </div>

                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <div class="flex items-center gap-1">
                            ${ageStr ? `<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">${ageStr}</span>` : ''}
                            ${sBadge}
                        </div>
                        <span class="text-[9px] text-slate-400 font-bold">${d}</span>
                        ${completedDateHtml}
                    </div>
                </div>

                <!-- المنطقة 2: قلب الكارت (الأصناف والدفعة يميناً + الحساب والدفع يساراً) -->
                <div class="bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap gap-1.5 flex-1">
                            ${itemsStr}
                        </div>
                        <div class="flex flex-col items-end shrink-0">
                            <div class="flex items-center gap-1 mb-0.5">
                                ${paymentBadge}
                            </div>
                            <div class="flex items-baseline gap-1">
                                <span class="text-[9px] font-bold text-slate-400">(${o.subtotal || o.total || 0} + شحن ${o.deliveryFee || 0}${o.discount > 0 ? ` - خصم ${o.discount}` : ''})</span>
                                <span class="font-black text-brand-primary text-lg leading-none">${o.total || 0} <span class="text-[10px]">ج</span></span>
                            </div>
                        </div>
                    </div>

                    ${(batchTagHtml || driverBadgeHtml || deliveryWindowBadge || customTagHtml) ? `
                    <div class="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-200/60">
                        ${batchTagHtml} ${driverBadgeHtml} ${deliveryWindowBadge} ${customTagHtml}
                    </div>` : ''}

                    ${(o.adminNote || o.driverNote) ? `
                    <div class="pt-1.5 border-t border-slate-200/60">
                        <p class="text-[10px] font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 truncate">
                            <i class="fa-solid fa-comment-dots ml-1 text-amber-600"></i> ${o.adminNote ? o.adminNote.split('\n---\n').pop() : o.driverNote.split('\n---\n').pop()}
                        </p>
                    </div>` : ''}
                </div>

                <div id="inline-notes-container-${o.id}" class="hidden w-full transition-all duration-300 origin-top">
                    <div id="inline-notes-content-${o.id}"></div>
                </div>

                <!-- المنطقة 3: شريط الإجراءات السفلي الموحد + زر الخطوة التالية الإجباري -->
                <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                        ${o.status === 'completed' ? `
                            <button onclick="sendFollowUpWhatsApp('${o.customerPhone}', '${o.customerName}')" class="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg font-black shadow-sm flex items-center gap-1"><i class="fa-solid fa-heart-circle-check"></i> متابعة</button>
                            <button onclick="openLinkArchiveModal('${o.id}')" class="text-[10px] bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg font-black shadow-sm flex items-center gap-1"><i class="fa-solid fa-link text-amber-400"></i> أرشفة</button>
                        ` : `
                            <div class="inline-flex rounded-lg shadow-sm">
                                <button onclick="sendMessageToCustomer('${o.customerPhone}', '${o.id}')" class="text-[10px] bg-[#25D366] hover:bg-[#1ebd57] text-white px-2.5 py-1.5 rounded-r-lg font-black flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> واتساب</button>
                                <select onchange="if(this.value){ sendQuickWhatsAppOption('${o.id}', this.value); this.value=''; }" class="bg-[#1ebd57] text-white text-[9px] font-black px-1 rounded-l-lg border-r border-white/20 outline-none cursor-pointer" title="رسائل واتساب جاهزة">
                                    <option value="">▼</option>
                                    <option value="invoice">🧾 إرسال الفاتورة</option>
                                    <option value="on_way">🛵 الطلب في الطريق</option>
                                    <option value="no_answer">📵 الهاتف غير متاح</option>
                                    <option value="prepay">💳 طلب دفع مسبق</option>
                                </select>
                            </div>
                        `}

                        <button onclick="event.stopPropagation(); printSingleOrderWaybill('${o.id}')" class="text-[10px] bg-amber-50 text-amber-900 hover:bg-amber-500 hover:text-white px-2.5 py-1.5 rounded-lg font-black border border-amber-200 transition-all flex items-center gap-1"><i class="fa-solid fa-print"></i> بوليصة</button>
                        <button onclick="openEditOrderModal('${o.id}')" class="text-[10px] bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white px-2.5 py-1.5 rounded-lg font-black transition-all flex items-center gap-1"><i class="fa-solid fa-pen"></i> تعديل</button>

                        <button onclick="toggleInlineNotes(event, '${o.id}', 'adminNote')" class="text-[10px] bg-amber-50/80 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1.5 rounded-lg font-black flex items-center gap-1" title="ملاحظات إدارية">
                            <i class="fa-solid fa-lock"></i> ${adminNotesCount > 0 ? `<span>(${adminNotesCount})</span>` : 'إداري'}
                        </button>
                        <button onclick="toggleInlineNotes(event, '${o.id}', 'driverNote')" class="text-[10px] bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 px-2 py-1.5 rounded-lg font-black flex items-center gap-1" title="ملاحظات للمندوب">
                            <i class="fa-solid fa-motorcycle"></i> ${driverNotesCount > 0 ? `<span>(${driverNotesCount})</span>` : 'للمندوب'}
                        </button>

                        <button onclick="openOrderTracking('${o.id}')" class="text-[10px] bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-1.5 rounded-lg font-bold border border-sky-200" title="تتبع الطلب"><i class="fa-solid fa-route"></i></button>
                        <button onclick="event.stopPropagation(); quickBanFromOrderCard('${o.id}')" class="text-[10px] bg-red-50 text-red-500 hover:bg-red-600 hover:text-white px-2 py-1.5 rounded-lg border border-red-100 font-black transition-colors" title="إدراج في البلاك ليست"><i class="fa-solid fa-ban"></i></button>
                    </div>

                    <div class="flex items-center gap-1.5 mr-auto sm:mr-0">
                        ${nextStepBtnHtml}
                        <select onchange="updateOrderStatus('${o.id}', this.value)" class="text-[10px] font-black bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none text-slate-700 cursor-pointer focus:ring-2 focus:ring-brand-primary/20">
                            <option value="new" ${o.status === 'new' ? 'selected' : ''}>جديد</option>
                            <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>تجهيز</option>
                            <option value="dispatched" ${o.status === 'dispatched' ? 'selected' : ''}>بالطريق</option>
                            <option value="deferred" ${o.status === 'deferred' ? 'selected' : ''}>مؤجل</option>
                            <option value="no_answer" ${o.status === 'no_answer' ? 'selected' : ''}>لم يرد</option>
                            <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>مكتمل</option>
                            <option value="canceled" ${o.status === 'canceled' ? 'selected' : ''}>إلغاء</option>
                            <option value="trash" class="text-red-500 font-black bg-red-50">سلة</option>
                        </select>
                    </div>
                </div>
            </div>`;
        }).join('');

        if (remainingCount > 0) {
            cardsHtml += `
            <button type="button" onclick="window.ordersRenderLimit = (window.ordersRenderLimit || 50) + 50; renderOrdersList();" class="w-full py-3.5 bg-white hover:bg-emerald-50 text-brand-primary font-black text-xs rounded-2xl border-2 border-dashed border-brand-primary/30 shadow-sm transition-all flex items-center justify-center gap-2">
                <i class="fa-solid fa-angles-down"></i> عرض المزيد من الطلبات (متبقي ${remainingCount} طلب)
            </button>`;
        }

        container.innerHTML = cardsHtml;

        if (typeof openInlineNoteId !== 'undefined' && openInlineNoteId && openInlineNoteField) {
            setTimeout(() => { window.toggleInlineNotes(null, openInlineNoteId, openInlineNoteField, true); }, 50);
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
            helperBox.className = 'mt-3';
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

    const _origOpenEditOrderModal = window.openEditOrderModal;
    window.openEditOrderModal = function (id) {
        if (typeof _origOpenEditOrderModal === 'function') {
            _origOpenEditOrderModal(id);
        }
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === id);
        if (!order) return;

        const modalBody = document.querySelector('#edit-order-modal .overflow-y-auto');
        if (!modalBody) return;

        let extraBox = document.getElementById('edit-order-full-customer-box');
        if (!extraBox) {
            extraBox = document.createElement('div');
            extraBox.id = 'edit-order-full-customer-box';
            extraBox.className = 'bg-white p-5 rounded-2xl shadow-soft border border-slate-100 space-y-3';
            modalBody.insertBefore(extraBox, modalBody.firstElementChild);
        }

        let zonesOpts = `<option value="${order.zone || ''}">${order.zone || '-- اختر المنطقة --'}</option>`;
        (storeSettings?.deliveryZones || []).forEach(z => {
            if (z.name !== order.zone) {
                zonesOpts += `<option value="${z.name}">${z.name} (${z.price}ج)</option>`;
            }
        });

        extraBox.innerHTML = `
            <h4 class="text-xs font-black text-slate-800 pb-2 border-b border-slate-100"><i class="fa-solid fa-user-pen text-brand-primary mr-1"></i> بيانات العميل والعنوان والآجل</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="text-[10px] font-bold text-slate-500 block mb-1">اسم العميل</label>
                    <input type="text" id="edit-cust-name-input" value="${order.customerName || ''}" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:bg-white outline-none">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 block mb-1">رقم الموبايل الأساسي</label>
                    <input type="tel" id="edit-cust-phone-input" dir="ltr" value="${order.customerPhone || ''}" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:bg-white outline-none">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 block mb-1">المنطقة</label>
                    <select id="edit-cust-zone-input" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:bg-white outline-none">${zonesOpts}</select>
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 block mb-1">العنوان التفصيلي</label>
                    <input type="text" id="edit-cust-address-input" value="${order.customerAddress || ''}" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold bg-slate-50 focus:bg-white outline-none">
                </div>
                <div class="md:col-span-2 bg-red-50/60 p-3 rounded-xl border border-red-100 flex items-center justify-between gap-3">
                    <label class="text-[11px] font-black text-red-800"><i class="fa-solid fa-hand-holding-dollar mr-1"></i> باقي حساب لم يُدفع على هذا الطلب (آجل بالجنيه):</label>
                    <input type="number" id="edit-order-debt-input" value="${order.debt || 0}" class="w-28 border border-red-200 rounded-xl p-2 text-center text-xs font-black text-red-700 bg-white outline-none">
                </div>
            </div>
        `;
    };

    const _origSaveEditedOrder = window.saveEditedOrder;
    window.saveEditedOrder = async function () {
        if (!editingOrderData) return;
        const orderId = editingOrderData.id;
        const oldDebt = Number(editingOrderData.debt) || 0;

        const newName = document.getElementById('edit-cust-name-input')?.value.trim() || editingOrderData.customerName || '';
        const rawNewPhone = document.getElementById('edit-cust-phone-input')?.value.trim() || editingOrderData.customerPhone || '';
        const newPhone = window.normalizePhone ? window.normalizePhone(rawNewPhone) : rawNewPhone;
        const newZone = document.getElementById('edit-cust-zone-input')?.value || editingOrderData.zone || '';
        const newAddress = document.getElementById('edit-cust-address-input')?.value.trim() ?? (editingOrderData.customerAddress || '');
        const newDebt = Number(document.getElementById('edit-order-debt-input')?.value) || 0;
        const debtDiff = newDebt - oldDebt;

        if (typeof _origSaveEditedOrder === 'function') {
            await _origSaveEditedOrder();
        }

        try {
            await db.collection('orders').doc(orderId).update({
                customerName: newName,
                customerPhone: newPhone,
                zone: newZone,
                customerAddress: newAddress,
                debt: newDebt
            });

            if (newPhone) {
                const cleanPhone = newPhone.startsWith('0') ? newPhone : '0' + newPhone;
                const custUp = { name: newName, zone: newZone, address: newAddress };
                if (debtDiff !== 0) {
                    custUp.debt = firebase.firestore.FieldValue.increment(debtDiff);
                }
                await db.collection('customers').doc(cleanPhone).set(custUp, { merge: true });
                if (typeof window.refreshCustomersData === 'function') window.refreshCustomersData();
            }
        } catch (e) {
            console.log('Extra edit fields save info:', e);
        }
    };

    // =========================================================================
    // ⚡ 8. الإصلاح المحاسبي الشامل للتحديد الجماعي (bulkChangeStatus)
    // =========================================================================
    window.bulkChangeStatus = async function (newStatus) {
        let checked = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) return;

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
        if (!confirm(`سيتم تحويل [ ${checked.length} ] طلبات إلى حالة (${statusName}). تأكيد؟`)) return;

        const bar = document.getElementById('bulk-actions-bar');
        const originalHtml = bar.innerHTML;
        bar.innerHTML = '<div class="w-full text-center text-sm font-bold text-amber-400"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحديث الجماعي وتطبيق الحسابات...</div>';

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
                if (newStatus === 'trash') updateData.deletedAt = firebase.firestore.FieldValue.serverTimestamp();
                if (newStatus === 'dispatched') updateData.dispatchedAt = firebase.firestore.FieldValue.serverTimestamp();
                if (newStatus === 'canceled') updateData.canceledAt = firebase.firestore.FieldValue.serverTimestamp();

                if (newStatus === 'completed') {
                    updateData.completedAtStr = nowStr;
                    updateData.completedTimeDisplay = nowDisplay;
                    updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();

                    o.completedAtStr = nowStr;
                    o.completedTimeDisplay = nowDisplay;

                    if (oldStatus !== 'completed' && o.customerPhone) {
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

                dbBatch.update(ref, updateData);

                if (o.items && Array.isArray(o.items)) {
                    let wasIn = ['processing', 'dispatched', 'completed', 'deferred'].includes(oldStatus);
                    let isNowIn = ['processing', 'dispatched', 'completed', 'deferred'].includes(newStatus);

                    if (!wasIn && isNowIn) {
                        o.items.forEach(i => {
                            const cur = Math.max(0, Number(fzNewValues[i.id]) || 0);
                            fzNewValues[i.id] = Math.max(0, cur - (Number(i.quantity) || 0));
                            storeFreezer[i.id] = fzNewValues[i.id];
                            fzTouched = true;
                        });
                    } else if (wasIn && !isNowIn) {
                        o.items.forEach(i => {
                            const cur = Math.max(0, Number(fzNewValues[i.id]) || 0);
                            fzNewValues[i.id] = cur + (Number(i.quantity) || 0);
                            storeFreezer[i.id] = fzNewValues[i.id];
                            fzTouched = true;
                        });
                    }
                }

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

            bar.innerHTML = originalHtml;
            bar.classList.add('hidden');
            document.querySelectorAll('.bulk-order-cb').forEach(cb => { cb.checked = false; });
            window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم تحديث ${checked.length} طلبات إلى (${statusName})`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء التحديث الجماعي!');
            bar.innerHTML = originalHtml;
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
                    const k = item.name || 'صنف';
                    if (!itemTotals[k]) itemTotals[k] = { id: item.id || '', name: k, qty: 0 };
                    itemTotals[k].qty += Number(item.quantity) || 0;
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

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            window.initSmartOrdersToolbar();
            setTimeout(() => window.renderOrdersList(), 400);
        });
    } else {
        window.initSmartOrdersToolbar();
        setTimeout(() => window.renderOrdersList(), 400);
    }
})();
