// =========================================================================
// ⚙️ المحرك المركزي لإدارة الأصناف، الإعدادات، الفريزر، والمزامنة (settings.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يدير: الكتالوج والأسعار، الأوزان، المناطق، المناديب، القوالب، النقاط، وجوجل شيت
// =========================================================================

// =========================================================================
// ⚙️ المحرك المركزي لإدارة الأصناف، الإعدادات، الفريزر، والمزامنة (settings.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يدير: الكتالوج والأسعار، الأوزان، المناطق، المناديب، القوالب، النقاط، وجوجل شيت
// =========================================================================

(function () {
    let lastFocusedTemplateInput = null;

    // حالة فلترة وعرض شاشة الأصناف والأسعار لمنع الزحام والتوهان
    window.inventoryUIState = {
        category: 'all',     // 'all' | 'main' | 'weight' | 'extra' | 'hidden'
        searchQuery: '',
        compactView: true,   // الوضع المدمج افتراضياً لسهولة الوصول لأي صنف في لمحة عين
        expandedIds: {}      // { [prodId]: true/false }
    };

    window.setInventoryCategoryFilter = function (cat) {
        window.inventoryUIState.category = cat;
        window.renderInventoryUI();
    };

    window.setInventorySearchQuery = function (val) {
        window.inventoryUIState.searchQuery = String(val || '');
        window.renderInventoryUI();
        const sInp = document.getElementById('inv-quick-search');
        if (sInp) {
            sInp.focus();
            sInp.setSelectionRange(sInp.value.length, sInp.value.length);
        }
    };

    window.toggleInventoryCompactMode = function () {
        window.inventoryUIState.compactView = !window.inventoryUIState.compactView;
        window.renderInventoryUI();
    };

    window.toggleSingleProductExpand = function (prodId) {
        window.inventoryUIState.expandedIds[prodId] = !window.inventoryUIState.expandedIds[prodId];
        window.renderInventoryUI();
    };

    // فحص هل الصنف مثبت ضمن الـ 3-6 أصناف الأساسية في الإدارة والدفعات
    window.isProductPinnedForAdmin = function (prodId) {
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const p = prodsObj[prodId];
        if (!p) return false;
        const anyExplicitlySet = Object.values(prodsObj).some(item => item && item.isPinnedAdmin !== undefined);
        if (anyExplicitlySet) {
            return Boolean(p.isPinnedAdmin);
        }
        // افتراضياً قبل التخصيص اليدوي: نعتبر أول 5 أصناف أساسية غير إضافية هي المثبتة
        const defaultIds = Object.keys(prodsObj).filter(k => prodsObj[k] && !prodsObj[k].isExtra).slice(0, 5);
        return defaultIds.includes(prodId);
    };

    // تبديل تثبيت الصنف كأساسي بضغطة زر واحدة وحفظه فوراً
    window.togglePinProductForAdmin = async function (prodId) {
        if (!storeProducts[prodId]) return;
        const prodsObj = storeProducts;
        const anyExplicitlySet = Object.values(prodsObj).some(item => item && item.isPinnedAdmin !== undefined);
        if (!anyExplicitlySet) {
            Object.keys(prodsObj).forEach(k => {
                prodsObj[k].isPinnedAdmin = window.isProductPinnedForAdmin(k);
            });
        }
        prodsObj[prodId].isPinnedAdmin = !prodsObj[prodId].isPinnedAdmin;
        window.renderInventoryUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        if (typeof window.renderBatchesUI === 'function') window.renderBatchesUI();
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(prodsObj[prodId].isPinnedAdmin ? '📌 تم تثبيت الصنف في المقدمة (الطلبات والدفعات)' : 'تم نقل الصنف لقائمة الأصناف الإضافية المطوية');
        }
    };


    // توحيد دوال تثبيت الصنف الأساسي عبر كل شاشات النظام
    window.isProductPrimary = function (p, id) {
        if (id && typeof window.isProductPinnedForAdmin === 'function') {
            return window.isProductPinnedForAdmin(id);
        }
        return Boolean(p && !p.isExtra && !p.isHidden);
    };

    window.toggleProductPrimaryPin = function (prodId) {
        return window.togglePinProductForAdmin(prodId);
    };


    // دالة مزامنة المتاح للحجز في الكتالوج مع المتبقي الفعلي في الدفعات المفتوحة بضغطة زر
    window.syncCatalogStockWithOpenBatches = async function () {
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const openBatchIds = Object.keys(batchesObj).filter(bId => batchesObj[bId] && batchesObj[bId].isOpen);

        if (openBatchIds.length === 0) {
            return alert('لا توجد دفعات مفتوحة للحجز حالياً لمزامنة أعدادها!');
        }

        let updatedCount = 0;
        Object.keys(prodsObj).forEach(pId => {
            if (prodsObj[pId].isWeightBased) return; // الأصناف الموزونة تتبع مصفوفة أوزانها
            let sumRemaining = 0;
            let hasStockConfigured = false;

            openBatchIds.forEach(bId => {
                const b = batchesObj[bId];
                const bStock = Number(b.stock?.[pId]) || 0;
                if (bStock > 0) hasStockConfigured = true;
                const liveBooked = (typeof window.getBatchDeepMetrics === 'function')
                    ? (window.getBatchDeepMetrics(bId, b.name).realBookedByProd[pId] || 0)
                    : (Number(b.booked?.[pId]) || 0);
                sumRemaining += Math.max(0, bStock - liveBooked);
            });

            if (hasStockConfigured) {
                storeStock[pId] = Math.round(sumRemaining);
                updatedCount++;
            }
        });

        await window.saveAllSettings(true);
        window.renderInventoryUI();
        if (typeof window.showToast === 'function') {
            window.showToast(`🔄 تمت مطابقة المتاح للحجز لـ (${updatedCount}) صنف مع الدفعات المفتوحة!`);
        }
    };

    // =========================================================================
    // 🥩 1. إدارة كتالوج الأصناف والأسعار والأوزان (مقسّم ومرتب ومتناسق 100% للموبايل)
    // =========================================================================
    function classifyInventoryProduct(id, p) {
        if (typeof window.getOrderProductCategoryAndRank === 'function') {
            return window.getOrderProductCategoryAndRank(id, p);
        }
        const safeId = String(id || '').toLowerCase();
        const safeName = String(p?.name || '').toLowerCase();

        if (p && p.isWeightBased) {
            let wRank = 50;
            if (safeName.includes('فراخ') || safeName.includes('فرخ') || safeName.includes('تسمين')) wRank = 10;
            else if (safeName.includes('رومي')) wRank = 20;
            else if (safeName.includes('بط')) wRank = 30;
            return { group: 'weight', rank: wRank };
        }
        if (
            safeId === 'eggs' || safeId === 'chicks' ||
            safeName.includes('بيض') || safeName.includes('كتكوت') ||
            safeName.includes('كتاكيت') || safeName.includes('عمر')
        ) {
            let ecRank = 50;
            if (safeId === 'eggs' || safeName.includes('بيض')) ecRank = 10;
            else if (safeId === 'chicks' || safeName.includes('كتكوت') || safeName.includes('كتاكيت') || safeName.includes('عمر')) ecRank = 20;
            return { group: 'eggs_chicks', rank: ecRank };
        }

        let qRank = 50;
        if (safeId === 'super' || (safeName.includes('سوبر') && !safeName.includes('سبشيال') && !safeName.includes('اسبيشيال'))) qRank = 10;
        else if (safeId === 'jumbo' || safeName.includes('جامبو')) qRank = 20;
        else if (safeId === 'special' || ((safeName.includes('سبشيال') || safeName.includes('اسبيشيال')) && !safeName.includes('سوبر'))) qRank = 30;
        else if (safeId === 'superspecial' || (safeName.includes('سوبر') && (safeName.includes('سبشيال') || safeName.includes('اسبيشيال')))) qRank = 40;
        else qRank = 50 + (Number((typeof storePrices !== 'undefined' ? storePrices[id] : 0) || p?.basePrice) || 0) / 1000;

        return { group: 'quail', rank: qRank };
    }

    window.setInventoryCategoryFilter = function (cat) {
        window.inventoryUIState.category = cat;
        window.renderInventoryUI();
    };

    window.setInventorySearchQuery = function (val) {
        window.inventoryUIState.searchQuery = String(val || '');
        if (document.getElementById('inv-products-groups-wrap')) {
            window.renderInventoryGroupsOnly();
        } else {
            window.renderInventoryUI();
        }
    };

    window.toggleQuickProductVisibility = async function (prodId) {
        if (!storeProducts[prodId]) return;
        storeProducts[prodId].isHidden = !storeProducts[prodId].isHidden;
        window.renderInventoryUI();
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(storeProducts[prodId].isHidden
                ? `🚫 تم إخفاء (${storeProducts[prodId].name}) من متجر العملاء`
                : `👁️ تم إظهار (${storeProducts[prodId].name}) في متجر العملاء`);
        }
    };

    window.renderInventoryUI = function () {
        const invView = document.getElementById('view-inventory');
        if (invView) {
            invView.classList.add('overflow-x-hidden');
            // تصغير حشوة الهيدر الثابت قليلاً لترك مساحة أكبر لقائمة الأصناف على الموبايل
            const topStaticCard = invView.firstElementChild;
            if (topStaticCard && !topStaticCard.hasAttribute('data-inv-slimmed')) {
                topStaticCard.setAttribute('data-inv-slimmed', '1');
                topStaticCard.className = 'flex items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200/80 shadow-soft shrink-0';
                const pDesc = topStaticCard.querySelector('p');
                if (pDesc) pDesc.classList.add('hidden', 'sm:block');
            }
        }

        const cont = document.getElementById('products-list-container');
        if (!cont) return;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const prodIds = Object.keys(prodsObj).filter(id => Boolean(prodsObj[id]));

        let activeCount = 0, hiddenCount = 0;
        let quailCount = 0, eggsChicksCount = 0, weightCount = 0;

        prodIds.forEach(id => {
            const p = prodsObj[id];
            if (p.isHidden) hiddenCount++;
            else activeCount++;

            const cls = classifyInventoryProduct(id, p);
            if (cls.group === 'weight') weightCount++;
            else if (cls.group === 'eggs_chicks') eggsChicksCount++;
            else quailCount++;
        });

        const st = window.inventoryUIState;
        if (st.category === 'main') st.category = 'quail';
        if (st.category === 'extra') st.category = 'eggs_chicks';

        const tabCls = (k) => st.category === k
            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100';

        // شريط تحكم موحد رشيق بدون أي خروج عن حواف الشاشة
        cont.innerHTML = `
            <div class="w-full max-w-full overflow-hidden bg-white rounded-2xl border border-slate-200/80 shadow-soft p-2.5 space-y-2">
                <!-- الصف 1: الإحصائيات المدمجة + أزرار المزامنة والحفظ -->
                <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl">
                    <div class="flex items-center gap-2 text-[11px] font-black">
                        <span>📦 الكل: <strong class="text-amber-400">${prodIds.length}</strong></span>
                        <span class="text-slate-600">|</span>
                        <span>🟢 معروض: <strong class="text-emerald-400">${activeCount}</strong></span>
                        ${hiddenCount > 0 ? `<span class="text-slate-600">|</span><span>🚫 مخفي: <strong class="text-rose-400">${hiddenCount}</strong></span>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 mr-auto sm:mr-0">
                        <button type="button" onclick="syncCatalogStockWithOpenBatches()" class="bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-400/30 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1" title="مزامنة المتاح للحجز مع الدفعات المفتوحة">
                            <i class="fa-solid fa-link"></i> <span>مزامنة</span>
                        </button>
                        <button type="button" onclick="saveAllSettings()" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 active:scale-95">
                            <i class="fa-solid fa-floppy-disk"></i> <span>حفظ الكل</span>
                        </button>
                    </div>
                </div>

                <!-- الصف 2: مربع البحث + زر الوضع المدمج/المفصل -->
                <div class="flex items-center gap-1.5">
                    <div class="relative flex-1 min-w-0">
                        <i class="fa-solid fa-magnifying-glass absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none"></i>
                        <input type="search" id="inv-quick-search" value="${st.searchQuery || ''}" oninput="setInventorySearchQuery(this.value)" placeholder="ابحث باسم الصنف أو الوزن..." class="w-full pr-8 pl-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black text-slate-800 outline-none focus:bg-white focus:border-brand-primary transition-all">
                    </div>
                    <button type="button" onclick="toggleInventoryCompactMode()" class="px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-all shrink-0 flex items-center gap-1 ${st.compactView ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 border-slate-200'}">
                        <i class="fa-solid ${st.compactView ? 'fa-compress' : 'fa-expand'} text-[10px]"></i>
                        <span>${st.compactView ? 'مدمج' : 'مفصل'}</span>
                    </button>
                </div>

                <!-- الصف 3: تبويبات الأقسام المرتبة بتمرير أفقي ناعم -->
                <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5" style="-webkit-overflow-scrolling: touch; scrollbar-width: none;">
                    <button type="button" onclick="setInventoryCategoryFilter('all')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${tabCls('all')}">الكل (${prodIds.length})</button>
                    <button type="button" onclick="setInventoryCategoryFilter('quail')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${tabCls('quail')}">🥩 سمان بالجوز (${quailCount})</button>
                    <button type="button" onclick="setInventoryCategoryFilter('eggs_chicks')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${tabCls('eggs_chicks')}">🥚 بيض وكتاكيت (${eggsChicksCount})</button>
                    <button type="button" onclick="setInventoryCategoryFilter('weight')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${tabCls('weight')}">⚖️ بالوزن (${weightCount})</button>
                    ${hiddenCount > 0 ? `<button type="button" onclick="setInventoryCategoryFilter('hidden')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${tabCls('hidden')}">🚫 مخفي (${hiddenCount})</button>` : ''}
                </div>
            </div>

            <div id="inv-products-groups-wrap" class="space-y-4 w-full max-w-full"></div>
        `;

        window.renderInventoryGroupsOnly();
    };

    window.renderInventoryGroupsOnly = function () {
        const wrap = document.getElementById('inv-products-groups-wrap');
        if (!wrap) return;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const stockObj = (typeof storeStock !== 'undefined' && storeStock) ? storeStock : {};
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const freezerObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};

        const prodIds = Object.keys(prodsObj).filter(id => Boolean(prodsObj[id]));
        if (prodIds.length === 0) {
            wrap.innerHTML = `<div class="text-center py-12 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد أصناف مسجلة حالياً. اضغط "صنف جديد" للبدء.</div>`;
            return;
        }

        // حساب المحجوز عبر الدفعات المفتوحة لكل صنف
        const batchStatsByProd = {};
        Object.keys(batchesObj).forEach(bId => {
            const b = batchesObj[bId];
            if (!b || !b.isOpen || !b.name || b.name === 'undefined') return;
            const metrics = (typeof window.getBatchDeepMetrics === 'function') ? window.getBatchDeepMetrics(bId, b.name) : { realBookedByProd: {} };
            prodIds.forEach(pId => {
                if (!batchStatsByProd[pId]) batchStatsByProd[pId] = { stock: 0, booked: 0 };
                batchStatsByProd[pId].stock += (Number(b.stock?.[pId]) || 0);
                batchStatsByProd[pId].booked += (metrics.realBookedByProd[pId] || Number(b.booked?.[pId]) || 0);
            });
        });

        const st = window.inventoryUIState;
        const rawQ = String(st.searchQuery || '')
            .replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660)
            .replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0)
            .toLowerCase().trim();

        const groups = {
            quail: [],
            eggs_chicks: [],
            weight: []
        };

        prodIds.forEach(id => {
            const p = prodsObj[id];
            const cls = classifyInventoryProduct(id, p);

            if (st.category === 'quail' && cls.group !== 'quail') return;
            if (st.category === 'eggs_chicks' && cls.group !== 'eggs_chicks') return;
            if (st.category === 'weight' && cls.group !== 'weight') return;
            if (st.category === 'hidden' && !p.isHidden) return;

            if (rawQ) {
                const hay = `${p.name || ''} ${p.weight || ''} ${pricesObj[id] || p.basePrice || ''}`.toLowerCase();
                if (!hay.includes(rawQ)) return;
            }

            groups[cls.group].push({ id, p, group: cls.group, rank: cls.rank });
        });

        groups.quail.sort((a, b) => a.rank - b.rank);
        groups.eggs_chicks.sort((a, b) => a.rank - b.rank);
        groups.weight.sort((a, b) => a.rank - b.rank);

        const totalShown = groups.quail.length + groups.eggs_chicks.length + groups.weight.length;
        if (totalShown === 0) {
            wrap.innerHTML = `<div class="text-center py-10 text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-200">لا توجد أصناف تطابق هذا البحث أو الفلتر.</div>`;
            return;
        }

        const buildProductCardHtml = (entry) => {
            const { id, p, group } = entry;
            const price = pricesObj[id] !== undefined ? pricesObj[id] : (p.basePrice || 0);
            const stock = stockObj[id] || 0;
            const oldPrice = p.oldPrice || '';
            const imgSrc = (p.images && p.images.length > 0) ? p.images[0] : '';
            const isExpanded = !st.compactView || Boolean(st.expandedIds[id]);
            const isPinned = window.isProductPinnedForAdmin(id);

            const bStat = batchStatsByProd[id] || { stock: 0, booked: 0 };
            const fzQty = Math.max(0, Number(freezerObj[id]) || 0);

            const accentBorder = p.isHidden
                ? 'border-r-4 border-r-rose-400'
                : (group === 'weight'
                    ? 'border-r-4 border-r-indigo-500'
                    : (group === 'eggs_chicks' ? 'border-r-4 border-r-amber-500' : 'border-r-4 border-r-emerald-600'));

            // 1. الكارت المدمج الموزون هندسياً (صفر حواف خارجة على الموبايل)
            if (!isExpanded) {
                let weightArr = [];
                let totalWeightKg = '0.00';
                if (p.isWeightBased) {
                    weightArr = typeof window.parseWeightsArray === 'function' ? window.parseWeightsArray(p.weightsList) : [];
                    totalWeightKg = (weightArr.reduce((s, v) => s + v, 0) / 1000).toFixed(2);
                }

                return `
                <div id="inv-card-${id}" class="w-full max-w-full overflow-hidden bg-white ${accentBorder} border ${p.isHidden ? 'border-rose-200 bg-rose-50/15 opacity-85' : 'border-slate-200/80 hover:border-brand-primary'} rounded-2xl p-3 shadow-sm transition-all space-y-2.5">
                    <!-- صف الاسم والأزرار الثلاثة الرشيقة (بدون أي تكرار) -->
                    <div class="flex items-start justify-between gap-2">
                        <div onclick="toggleSingleProductExpand('${id}')" class="min-w-0 flex-1 cursor-pointer">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="font-black text-slate-900 text-sm leading-snug">${p.name || 'صنف'}</span>
                                ${p.weight ? `<span class="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">${p.weight}</span>` : ''}
                                ${p.isBest ? `<span class="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md">🔥 مطلوب</span>` : ''}
                                ${p.isHidden ? `<span class="text-[9px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md">🚫 مخفي</span>` : ''}
                            </div>
                            <div class="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-black">
                                <span class="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md">محجوز: ${Number(bStat.booked.toFixed(1))}</span>
                                <span class="text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded-md">❄️ فريزر: ${fzQty}</span>
                                ${p.isWeightBased ? `<span class="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">⚖️ ${weightArr.length} فرخة (${totalWeightKg} كجم)</span>` : ''}
                            </div>
                        </div>

                        <div class="flex items-center gap-1 shrink-0">
                            <button type="button" onclick="togglePinProductForAdmin('${id}')" title="${isPinned ? 'مثبت كأساسي في الطلبات والدفعات (اضغط لإلغاء التثبيت)' : 'تثبيت كأساسي في مقدمة الطلبات والدفعات'}" class="w-8 h-8 rounded-xl border text-xs flex items-center justify-center transition-all ${isPinned ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-700'}">
                                <i class="fa-solid fa-thumbtack"></i>
                            </button>
                            <button type="button" onclick="toggleQuickProductVisibility('${id}')" title="${p.isHidden ? 'إظهار الصنف في المتجر' : 'إخفاء الصنف من المتجر'}" class="w-8 h-8 rounded-xl border text-xs flex items-center justify-center transition-all ${p.isHidden ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}">
                                <i class="fa-solid ${p.isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button type="button" onclick="toggleSingleProductExpand('${id}')" class="h-8 px-2.5 rounded-xl bg-slate-900 hover:bg-brand-primary text-white text-[11px] font-black transition-all flex items-center gap-1">
                                <span>${p.isWeightBased ? 'الأوزان' : 'تعديل'}</span>
                                <i class="fa-solid fa-chevron-down text-[9px] text-amber-300"></i>
                            </button>
                        </div>
                    </div>

                    <!-- صف السعر والمتاح في شبكة متساوية 50% / 50% تمنع أي خروج عن الحواف -->
                    <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div class="flex items-center justify-between gap-1.5 bg-blue-50/70 border border-blue-200/80 px-2.5 py-1.5 rounded-xl min-w-0">
                            <span class="text-[10px] font-black text-blue-800 shrink-0">${p.isWeightBased ? 'الكيلو:' : 'السعر:'}</span>
                            <div class="flex items-center gap-1 min-w-0">
                                <input type="number" value="${price}" onchange="storePrices['${id}'] = parseFloat(this.value) || 0; storeProducts['${id}'].basePrice = parseFloat(this.value) || 0; saveAllSettings(true);" class="w-16 max-w-full bg-white border border-blue-200 rounded-lg py-0.5 px-1 text-xs font-black text-blue-900 text-center outline-none focus:ring-2 focus:ring-blue-300">
                                <span class="text-[10px] font-black text-blue-700">ج</span>
                            </div>
                        </div>

                        ${p.isWeightBased ? `
                        <button type="button" onclick="toggleSingleProductExpand('${id}')" class="flex items-center justify-between gap-1.5 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-indigo-900 transition-colors min-w-0">
                            <span class="text-[10px] font-black truncate">⚖️ مصفوفة الجرام</span>
                            <span class="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0">${weightArr.length} عدد</span>
                        </button>
                        ` : `
                        <div class="flex items-center justify-between gap-1.5 bg-emerald-50/70 border border-emerald-200/80 px-2.5 py-1.5 rounded-xl min-w-0">
                            <span class="text-[10px] font-black text-emerald-800 shrink-0">المتاح:</span>
                            <input type="number" value="${stock}" onchange="storeStock['${id}'] = parseInt(this.value) || 0; saveAllSettings(true);" class="w-16 max-w-full bg-white border border-emerald-200 rounded-lg py-0.5 px-1 text-xs font-black text-emerald-900 text-center outline-none focus:ring-2 focus:ring-emerald-300">
                        </div>
                        `}
                    </div>
                </div>`;
            }

            // 2. الوضع المفتوح الكامل للصنف (Expanded Editor - منظم 100% بدون خروج حواف)
            let weightStatsHtml = '';
            if (p.isWeightBased) {
                const wArr = typeof window.parseWeightsArray === 'function'
                    ? window.parseWeightsArray(p.weightsList)
                    : String(p.weightsList || '').split(/[\s,،;\n\r\-]+/).map(w => parseFloat(w.trim())).filter(w => !isNaN(w) && w > 0);
                const totalKg = (wArr.reduce((s, v) => s + v, 0) / 1000).toFixed(2);
                weightStatsHtml = `
                    <div class="mt-3 bg-indigo-50/70 p-3 rounded-xl border border-indigo-200/80 space-y-2">
                        <div class="flex flex-wrap justify-between items-center gap-1.5">
                            <label class="text-[11px] font-black text-indigo-900">
                                <i class="fa-solid fa-scale-balanced ml-1 text-indigo-600"></i> مصفوفة الأوزان بالجرام (بمسافة أو تحت بعض):
                            </label>
                            <span id="weights-badge-${id}" class="bg-white text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-200 text-[10px] font-black">المتاح: ${wArr.length} قطعة (${totalKg} كجم)</span>
                        </div>
                        <textarea oninput="let arr = window.parseWeightsArray ? window.parseWeightsArray(this.value) : []; storeProducts['${id}'].weightsList = arr.join(' '); storeStock['${id}'] = arr.length; let b = document.getElementById('weights-badge-${id}'); if(b) b.innerText = 'المتاح: ' + arr.length + ' قطعة (' + (arr.reduce((s,v)=>s+v,0)/1000).toFixed(2) + ' كجم)'; if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" onchange="updateProductWeightList('${id}', this.value)" dir="ltr" class="w-full border border-indigo-200 rounded-xl p-2.5 text-xs font-black text-slate-800 bg-white outline-none focus:ring-2 focus:ring-indigo-300 custom-scroll" rows="3" placeholder="مثال: 1400 1550 1200">${p.weightsList || ''}</textarea>
                    </div>
                `;
            }

            return `
            <div id="inv-card-${id}" class="w-full max-w-full overflow-hidden bg-white ${accentBorder} border-2 ${p.isHidden ? 'border-rose-300' : 'border-brand-primary/50'} rounded-2xl p-3.5 shadow-md space-y-3 transition-all">
                <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div class="flex flex-wrap items-center gap-2 min-w-0">
                        <button type="button" onclick="toggleSingleProductExpand('${id}')" class="bg-slate-900 text-white px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1">
                            <i class="fa-solid fa-chevron-up text-[9px] text-amber-300"></i> طي
                        </button>
                        <span class="font-black text-slate-900 text-sm truncate">${p.name || 'صنف'}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <span class="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg">محجوز: ${Number(bStat.booked.toFixed(1))}</span>
                        <span class="text-[10px] font-black text-cyan-800 bg-cyan-50 px-2 py-1 rounded-lg">❄️ ${fzQty}</span>
                        <button type="button" onclick="deleteProductUI('${id}')" title="حذف الصنف نهائياً" class="w-8 h-8 bg-red-50 text-red-500 rounded-xl flex justify-center items-center hover:bg-red-600 hover:text-white transition-colors">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                </div>

                <!-- الحقول الـ 6 في شبكة متوازنة 2x3 على الموبايل و3x2 على الكمبيوتر -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">اسم الصنف</label>
                        <input type="text" value="${p.name || ''}" onchange="storeProducts['${id}'].name = this.value; generateDynamicOrderInputs();" class="w-full border border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-2 text-xs font-black text-slate-800 outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">الوزن / الوصف</label>
                        <input type="text" value="${p.weight || ''}" onchange="storeProducts['${id}'].weight = this.value" class="w-full border border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-2 text-xs font-bold text-slate-700 outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-blue-600 block mb-1">${p.isWeightBased ? 'سعر الكيلو (ج)' : 'السعر الحالي (ج)'}</label>
                        <input type="number" value="${price}" onchange="storePrices['${id}'] = parseFloat(this.value) || 0; storeProducts['${id}'].basePrice = parseFloat(this.value) || 0;" class="w-full border border-blue-200 bg-blue-50/70 focus:bg-white rounded-xl p-2 text-xs font-black text-blue-800 text-center outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-amber-600 block mb-1">سعر الدفعة القديمة</label>
                        <input type="number" value="${p.oldBatchPrice || ''}" onchange="storeProducts['${id}'].oldBatchPrice = parseFloat(this.value) || 0" class="w-full border border-amber-200 bg-amber-50/70 focus:bg-white rounded-xl p-2 text-xs font-black text-amber-800 text-center outline-none" placeholder="اختياري">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-emerald-600 block mb-1">المتاح للحجز</label>
                        <input type="number" value="${stock}" onchange="storeStock['${id}'] = parseInt(this.value) || 0" class="w-full border border-emerald-200 bg-emerald-50/70 focus:bg-white rounded-xl p-2 text-xs font-black text-emerald-800 text-center outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">رابط الصورة</label>
                        <input type="text" value="${imgSrc}" onchange="storeProducts['${id}'].images = [this.value]" class="w-full border border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-2 text-[10px] font-bold text-slate-600 outline-none text-left" dir="ltr" placeholder="super.png">
                    </div>
                </div>

                <!-- مفاتيح التحكم في شبكة متناسقة بدون انكسار -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px] font-black">
                    <label class="flex items-center gap-1.5 cursor-pointer text-amber-900 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-200">
                        <input type="checkbox" ${isPinned ? 'checked' : ''} onchange="togglePinProductForAdmin('${id}')" class="w-4 h-4 accent-amber-500 rounded shrink-0">
                        <span class="truncate">📌 مثبت كأساسي</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-indigo-700 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                        <input type="checkbox" ${p.isWeightBased ? 'checked' : ''} onchange="storeProducts['${id}'].isWeightBased = this.checked; renderInventoryUI(); generateDynamicOrderInputs();" class="w-4 h-4 accent-indigo-600 rounded shrink-0">
                        <span class="truncate">⚖️ يباع بالوزن</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-slate-700 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                        <input type="checkbox" ${p.isExtra ? 'checked' : ''} onchange="storeProducts['${id}'].isExtra = this.checked; renderInventoryUI();" class="w-4 h-4 accent-brand-primary rounded shrink-0">
                        <span class="truncate">🥚 صنف إضافي</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-amber-700 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                        <input type="checkbox" ${p.isBest ? 'checked' : ''} onchange="storeProducts['${id}'].isBest = this.checked" class="w-4 h-4 accent-amber-500 rounded shrink-0">
                        <span class="truncate">🔥 الأكثر طلباً</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-rose-700 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                        <input type="checkbox" ${p.isHidden ? 'checked' : ''} onchange="storeProducts['${id}'].isHidden = this.checked; renderInventoryUI();" class="w-4 h-4 accent-rose-600 rounded shrink-0">
                        <span class="truncate">🚫 إخفاء بالمتجر</span>
                    </label>
                    <div class="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                        <label class="flex items-center gap-1 cursor-pointer text-red-600 shrink-0">
                            <input type="checkbox" ${p.isDisc ? 'checked' : ''} onchange="storeProducts['${id}'].isDisc = this.checked; renderInventoryGroupsOnly();" class="w-4 h-4 accent-red-500 rounded">
                            <span>خصم</span>
                        </label>
                        ${p.isDisc ? `<input type="number" value="${oldPrice}" onchange="storeProducts['${id}'].oldPrice = parseFloat(this.value) || 0" class="w-full min-w-0 border border-red-200 bg-red-50/40 rounded px-1 py-0.5 text-[10px] font-black text-red-500 text-center line-through outline-none" placeholder="قبل">` : ''}
                    </div>
                </div>

                ${weightStatsHtml}

                <div class="flex justify-end pt-1">
                    <button type="button" onclick="saveAllSettings()" class="bg-brand-primary hover:bg-emerald-800 text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-check"></i> حفظ تعديلات الصنف
                    </button>
                </div>
            </div>`;
        };

        const sectionsMeta = [
            {
                key: 'quail',
                title: 'سمان مذبوح بالجوز (الأطباق)',
                icon: 'fa-drumstick-bite text-emerald-600',
                headerCls: 'bg-emerald-50/90 text-emerald-900 border-emerald-200',
                items: groups.quail
            },
            {
                key: 'eggs_chicks',
                title: 'بيض سمان وكتاكيت عمر يوم',
                icon: 'fa-egg text-amber-600',
                headerCls: 'bg-amber-50/90 text-amber-900 border-amber-200',
                items: groups.eggs_chicks
            },
            {
                key: 'weight',
                title: 'فراخ تسمين وطيور بالوزن',
                icon: 'fa-scale-balanced text-indigo-600',
                headerCls: 'bg-indigo-50/90 text-indigo-900 border-indigo-200',
                items: groups.weight
            }
        ];

        let groupsHtml = '';
        sectionsMeta.forEach(sec => {
            if (sec.items.length === 0) return;
            groupsHtml += `
                <div class="space-y-2 w-full max-w-full">
                    <div class="flex items-center justify-between px-3 py-1.5 rounded-xl border ${sec.headerCls} text-xs font-black">
                        <span class="flex items-center gap-1.5"><i class="fa-solid ${sec.icon}"></i> ${sec.title}</span>
                        <span class="bg-white/80 px-2 py-0.5 rounded-lg text-[10px]">${sec.items.length} صنف</span>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                        ${sec.items.map(buildProductCardHtml).join('')}
                    </div>
                </div>
            `;
        });

        wrap.innerHTML = groupsHtml;
    };

    window.updateProductWeightList = function (prodId, rawVal) {
        if (!storeProducts[prodId]) return;
        const parsedArr = typeof window.parseWeightsArray === 'function'
            ? window.parseWeightsArray(rawVal)
            : String(rawVal || '').split(/[\s,،;\n\r\-]+/).map(w => parseFloat(w.trim())).filter(w => !isNaN(w) && w > 0);
        storeProducts[prodId].weightsList = parsedArr.join(' ');
        storeStock[prodId] = parsedArr.length;
        window.renderInventoryGroupsOnly();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        window.saveAllSettings(true);
    };

    window.addNewProductUI = function () {
        const newId = 'p_' + Date.now();
        storeProducts[newId] = {
            name: 'صنف جديد',
            basePrice: 0,
            weight: '',
            images: [''],
            isExtra: false,
            isBest: false,
            isDisc: false,
            oldPrice: 0,
            oldBatchPrice: 0,
            isHidden: false,
            isWeightBased: false
        };
        storePrices[newId] = 0;
        storeStock[newId] = 0;
        window.inventoryUIState.category = 'all';
        window.inventoryUIState.searchQuery = '';
        window.inventoryUIState.expandedIds[newId] = true;
        window.renderInventoryUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        setTimeout(() => {
            const newCard = document.getElementById(`inv-card-${newId}`);
            if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
    };

    window.deleteProductUI = async function (id) {
        const pName = storeProducts[id]?.name || 'هذا الصنف';
        const confirmed = typeof window.execConfirm === 'function'
            ? await window.execConfirm(`هل أنت متأكد من حذف (${pName}) من المتجر والنظام نهائياً؟`, { title: 'حذف صنف نهائياً', tone: 'danger', confirmText: 'نعم، احذف الصنف' })
            : confirm(`هل أنت متأكد من حذف (${pName}) من المتجر والنظام نهائياً؟`);
        if (!confirmed) return;

        try {
            const batchProcess = db.batch();
            batchProcess.set(db.collection('inventory').doc('settings'), {
                productsData: { [id]: firebase.firestore.FieldValue.delete() }
            }, { merge: true });
            batchProcess.set(db.collection('inventory').doc('prices'), {
                [id]: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            batchProcess.set(db.collection('inventory').doc('stock'), {
                [id]: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            await batchProcess.commit();
        } catch (e) {
            console.log('Firebase delete product error:', e);
        }

        delete storeProducts[id];
        delete storePrices[id];
        delete storeStock[id];
        window.renderInventoryUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
    };


    // =========================================================================
    // ❄️ 2. إدارة مخزن الفريزر الفعلي (Interactive Freezer Modal)
    // =========================================================================
    window.openFreezerModal = function () {
        window.renderFreezerItemsUI();
        if (typeof openModal === 'function') openModal('freezer-modal');
    };

    window.renderFreezerItemsUI = function () {
        const cont = document.getElementById('freezer-items-container');
        if (!cont) return;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const fzObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};

        let totalFreezerCount = 0;
        const rowsHtml = Object.keys(prodsObj).map(pId => {
            const p = prodsObj[pId];
            if (!p) return '';
            const currentQty = Math.max(0, Number(fzObj[pId]) || 0);
            totalFreezerCount += currentQty;

            return `
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
                    <div>
                        <span class="font-black text-slate-800 text-sm block">${p.name}</span>
                        <span class="text-[10px] font-bold text-slate-400">${p.weight || ''}</span>
                    </div>
                    <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1">
                        <button type="button" onclick="adjustFreezerItemQty('${pId}', -1)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-red-500 hover:bg-red-50 font-black text-sm shadow-sm">-</button>
                        <input type="number" id="fz-input-${pId}" value="${currentQty}" min="0" onchange="setFreezerItemQty('${pId}', this.value)" class="w-16 bg-transparent text-center font-black text-base text-cyan-800 outline-none">
                        <button type="button" onclick="adjustFreezerItemQty('${pId}', 1)" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 font-black text-sm shadow-sm">+</button>
                    </div>
                </div>
            `;
        }).join('');

        cont.innerHTML = `
            <div class="bg-cyan-900 text-white p-3.5 rounded-2xl flex justify-between items-center mb-3 shadow-sm">
                <span class="text-xs font-black"><i class="fa-solid fa-snowflake text-cyan-300 ml-1"></i> إجمالي الرصيد الفعلي بالفريزر:</span>
                <span class="text-xl font-black text-amber-300">${totalFreezerCount} طبق</span>
            </div>
            <div class="space-y-2.5">${rowsHtml}</div>
        `;
    };

    window.adjustFreezerItemQty = function (pId, delta) {
        const cur = Math.max(0, Number(storeFreezer[pId]) || 0);
        const next = Math.max(0, cur + delta);
        window.setFreezerItemQty(pId, next);
    };

    window.setFreezerItemQty = async function (pId, val) {
        const cleanVal = Math.max(0, parseFloat(val) || 0);
        storeFreezer[pId] = cleanVal;
        window.renderFreezerItemsUI();
        if (typeof window.updateLiveHeaderAndSidebar === 'function') window.updateLiveHeaderAndSidebar();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

        try {
            await db.collection('inventory').doc('freezer').set({ [pId]: cleanVal }, { merge: true });
        } catch (e) {
            console.error('Freezer update error:', e);
        }
    };

    // =========================================================================
    // 🏪 3. إعدادات المتجر، المناطق، المناديب، والقوالب الذكية (Settings UI)
    // =========================================================================
    window.renderSettingsUI = function () {
        if (!document.getElementById('st-name')) return;

        document.getElementById('st-name').value = storeSettings.storeName || '';
        document.getElementById('st-phone').value = storeSettings.storePhone || '';
        document.getElementById('st-min-order').value = storeSettings.minOrder || 0;
        document.getElementById('st-is-open').checked = storeSettings.storeOpen !== false;
        document.getElementById('st-free-del').checked = !!storeSettings.freeDeliveryActive;
        document.getElementById('st-free-th').value = storeSettings.freeDeliveryThreshold || 0;
        document.getElementById('st-free-th').disabled = !storeSettings.freeDeliveryActive;

        if (document.getElementById('st-pts-per-100')) {
            document.getElementById('st-pts-per-100').value = storeSettings.pointsPer100 || 5;
        }
        if (document.getElementById('st-pts-value')) {
            document.getElementById('st-pts-value').value = storeSettings.pointValueInEGP || 0.40;
        }

        // 1. رسم مناطق التوصيل
        const zCont = document.getElementById('zones-list-container');
        if (zCont) {
            const zones = storeSettings.deliveryZones || [];
            zCont.innerHTML = zones.map((z, i) => `
                <div class="flex items-center gap-2 mb-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                    <span class="text-[10px] font-black text-slate-400 px-1.5">${i + 1}</span>
                    <input type="text" value="${z.name || ''}" onchange="storeSettings.deliveryZones[${i}].name=this.value.trim(); generateDynamicOrderInputs();" class="flex-1 border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none focus:ring-2 focus:ring-indigo-100" placeholder="اسم المنطقة">
                    <div class="relative w-24">
                        <input type="number" value="${z.price || 0}" onchange="storeSettings.deliveryZones[${i}].price=parseInt(this.value)||0; generateDynamicOrderInputs();" class="w-full border border-slate-200 rounded-lg p-2 pl-6 text-xs font-black text-indigo-600 bg-white outline-none text-center" placeholder="السعر">
                        <span class="absolute left-2 top-2 text-[10px] font-bold text-slate-400">ج</span>
                    </div>
                    <button onclick="storeSettings.deliveryZones.splice(${i}, 1); renderSettingsUI(); generateDynamicOrderInputs();" class="w-8 h-8 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400">لا توجد مناطق مسجلة، اضغط (+) لإضافة منطقة.</div>`;
        }

        // 2. رسم فريق المناديب
        const dCont = document.getElementById('drivers-list-container');
        if (dCont) {
            const drivers = storeSettings.drivers || [];
            dCont.innerHTML = drivers.map((d, i) => `
                <div class="flex flex-wrap sm:flex-nowrap items-center gap-2 mb-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                    <input type="text" value="${d.name || ''}" onchange="storeSettings.drivers[${i}].name=this.value.trim()" placeholder="اسم المندوب" class="flex-1 min-w-[110px] border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none">
                    <input type="tel" value="${d.phone || ''}" onchange="storeSettings.drivers[${i}].phone=this.value.trim()" placeholder="رقم الواتساب" class="w-32 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none text-left" dir="ltr">
                    <input type="text" value="${d.pin || ''}" onchange="storeSettings.drivers[${i}].pin=this.value.trim()" placeholder="PIN" title="الرقم السري للمندوب" class="w-20 border border-slate-200 rounded-lg p-2 text-xs font-black text-blue-700 bg-white outline-none text-center">
                    <button onclick="storeSettings.drivers.splice(${i}, 1); renderSettingsUI();" class="w-8 h-8 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400">لا يوجد مناديب مسجلين، اضغط (+) لإضافة مندوب.</div>`;
        }

        // 3. قوالب الرسائل
        if (document.getElementById('admin-whatsapp-template')) {
            document.getElementById('admin-whatsapp-template').value = storeSettings.whatsappTemplate || '';
            document.getElementById('admin-dispatch-template').value = storeSettings.dispatchTemplate || '';
            document.getElementById('admin-ticktick-template').value = storeSettings.ticktickTemplate || '';
            document.getElementById('admin-batch-hashtag').value = storeSettings.batchHashtag || '';
        }

        // تفعيل الضغط على المتغيرات لإدراجها في القالب + حقن أدوات الشيت والنسخ الاحتياطي
        initInteractiveTemplateVariables();
        injectGoogleSheetAndBackupControls();
        if (typeof window.syncWaybillSettingsUI === 'function') window.syncWaybillSettingsUI();
    };

    window.addNewZoneUI = function () {
        if (!storeSettings.deliveryZones) storeSettings.deliveryZones = [];
        storeSettings.deliveryZones.push({ name: '', price: 0 });
        window.renderSettingsUI();
    };

    window.addNewDriverUI = function () {
        if (!storeSettings.drivers) storeSettings.drivers = [];
        storeSettings.drivers.push({ name: '', phone: '', pin: '' });
        window.renderSettingsUI();
    };

    // تحويل متغيرات القوالب إلى أزرار ذكية تدرج المتغير مكان المؤشر
    function initInteractiveTemplateVariables() {
        const templateIds = ['admin-whatsapp-template', 'admin-dispatch-template', 'admin-ticktick-template'];
        templateIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.hasAttribute('data-focus-tracked')) {
                el.setAttribute('data-focus-tracked', '1');
                el.addEventListener('focus', () => { lastFocusedTemplateInput = el; });
            }
        });

        const settingsView = document.getElementById('view-settings');
        if (!settingsView) return;
        const varSpans = settingsView.querySelectorAll('p span.text-brand-primary');
        varSpans.forEach(sp => {
            if (sp.hasAttribute('data-var-clickable')) return;
            sp.setAttribute('data-var-clickable', '1');
            sp.classList.add('cursor-pointer', 'hover:bg-brand-primary', 'hover:text-white', 'transition-colors', 'px-2', 'py-0.5', 'inline-block', 'my-0.5');
            sp.title = 'اضغط لإدراج هذا المتغير داخل مربع الرسالة النشط';
            sp.onclick = () => {
                const target = lastFocusedTemplateInput || document.getElementById('admin-whatsapp-template');
                if (!target) return;
                const token = sp.innerText.trim();
                const start = target.selectionStart || target.value.length;
                const end = target.selectionEnd || target.value.length;
                target.value = target.value.substring(0, start) + token + target.value.substring(end);
                target.focus();
                target.selectionStart = target.selectionEnd = start + token.length;
            };
        });
    }

    // حقن إعدادات رابط Google Sheet وزر النسخ الاحتياطي الكامل داخل شاشة الإعدادات
    function injectGoogleSheetAndBackupControls() {
        const migrateBtn = document.getElementById('btn-migrate');
        if (!migrateBtn || document.getElementById('st-gsheet-webhook-box')) return;

        const parentCard = migrateBtn.closest('.bg-blue-50');
        if (!parentCard) return;

        const extraBox = document.createElement('div');
        extraBox.id = 'st-gsheet-webhook-box';
        extraBox.className = 'mt-3 pt-3 border-t border-blue-200/80 space-y-3';
        extraBox.innerHTML = `
            <div>
                <label class="text-[10px] font-black text-blue-900 block mb-1">🔗 رابط Google Apps Script Webhook (للمزامنة التلقائية مع الشيت):</label>
                <input type="text" id="st-gsheet-url" dir="ltr" value="${storeSettings.googleSheetWebhookUrl || ''}" onchange="storeSettings.googleSheetWebhookUrl = this.value.trim()" placeholder="https://script.google.com/macros/s/.../exec" class="w-full border border-blue-200 rounded-xl p-2.5 text-xs font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 text-left">
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-blue-100">
                <div>
                    <span class="text-xs font-black text-slate-800 block"><i class="fa-solid fa-shield-halved text-emerald-600 ml-1"></i> النسخة الاحتياطية الشاملة (Full System Backup)</span>
                    <span class="text-[10px] font-bold text-slate-400">تحميل نسخة كاملة من (الطلبات + العملاء + المخزون + الإعدادات) في ملف واحد آمن</span>
                </div>
                <button type="button" onclick="exportFullSystemBackupJSON()" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 active:scale-95">
                    <i class="fa-solid fa-download text-amber-400"></i> تحميل نسخة احتياطية
                </button>
            </div>
        `;
        parentCard.appendChild(extraBox);
    }

    // =========================================================================
    // 💾 4. حفظ الإعدادات الشامل (saveAllSettings)
    // =========================================================================
    window.saveAllSettings = async function (silent = false) {
        const btn = document.getElementById('global-save-btn');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn && !silent) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
            btn.disabled = true;
        }

        try {
            if (document.getElementById('st-name')) {
                storeSettings.storeName = document.getElementById('st-name').value.trim();
                storeSettings.storePhone = document.getElementById('st-phone').value.trim();
                storeSettings.minOrder = parseInt(document.getElementById('st-min-order').value) || 0;
                storeSettings.storeOpen = document.getElementById('st-is-open').checked;
                storeSettings.freeDeliveryActive = document.getElementById('st-free-del').checked;
                storeSettings.freeDeliveryThreshold = parseInt(document.getElementById('st-free-th').value) || 0;
                storeSettings.pointsPer100 = parseFloat(document.getElementById('st-pts-per-100')?.value) || 5;
                storeSettings.pointValueInEGP = parseFloat(document.getElementById('st-pts-value')?.value) || 0.40;
            }

            if (document.getElementById('st-gsheet-url')) {
                storeSettings.googleSheetWebhookUrl = document.getElementById('st-gsheet-url').value.trim();
            }

            if (document.getElementById('admin-whatsapp-template')) {
                storeSettings.whatsappTemplate = document.getElementById('admin-whatsapp-template').value;
                storeSettings.dispatchTemplate = document.getElementById('admin-dispatch-template').value;
                storeSettings.ticktickTemplate = document.getElementById('admin-ticktick-template').value;
                storeSettings.batchHashtag = document.getElementById('admin-batch-hashtag').value.trim();
            }

            if (typeof window.getWaybillConfig === 'function') {
                storeSettings.waybillConfig = window.getWaybillConfig();
            }

            storeSettings.deliveryZones = (storeSettings.deliveryZones || []).filter(z => z && z.name && z.name.trim() !== '');
            storeSettings.drivers = (storeSettings.drivers || []).filter(d => d && (d.name || d.phone));
            storeSettings.productsData = storeProducts;

            if (typeof storeBatches !== 'undefined' && storeBatches) {
                Object.keys(storeBatches).forEach(k => {
                    const bObj = storeBatches[k];
                    if (!bObj || typeof bObj !== 'object' || !bObj.name || bObj.name === 'undefined' || bObj.name.trim() === '') {
                        delete storeBatches[k];
                    }
                });
            }

            await Promise.all([
                db.collection('inventory').doc('settings').set(storeSettings, { merge: true }),
                db.collection('inventory').doc('stock').set(storeStock, { merge: true }),
                db.collection('inventory').doc('prices').set(storePrices, { merge: true }),
                db.collection('inventory').doc('batches').set(storeBatches)
            ]);


            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.renderReconciliationUI === 'function') window.renderReconciliationUI();

            if (!silent) {
                if (typeof window.showToast === 'function') window.showToast('تم حفظ جميع الإعدادات والأصناف بنجاح! 🚀');
                else alert('تم الحفظ بنجاح! 🚀');
            }
        } catch (e) {
            console.error('Save settings error:', e);
            if (!silent) alert('حدث خطأ أثناء حفظ الإعدادات!');
        }

        if (btn && !silent) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // =========================================================================
    // 🪙 5. تفعيل نقاط الولاء بأثر رجعي (على الطلبات المكتملة فقط وبدون التوصيل)
    // =========================================================================
    window.calculateRetroactivePoints = async function () {
        const ptsPer100 = parseFloat(document.getElementById('st-pts-per-100')?.value) || storeSettings.pointsPer100 || 5;
        if (!confirm(`⚠️ سيتم حساب النقاط على (الطلبات المكتملة فقط) وبناءً على صافي قيمة المنتجات بدون التوصيل (${ptsPer100} نقطة لكل 100 ج).\n\nهل تريد المتابعة؟`)) return;

        const btn = document.getElementById('btn-retro-points');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري حساب الطلبات المكتملة...';
            btn.disabled = true;
        }

        try {
            const customerSpendingMap = {};
            (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
                if (!o || o.status !== 'completed' || !o.customerPhone) return;
                const normPhone = window.normalizePhone ? window.normalizePhone(o.customerPhone) : o.customerPhone.trim();
                if (!normPhone) return;
                const orderSubtotal = Number(o.subtotal) || Math.max(0, (Number(o.total) || 0) - (Number(o.deliveryFee) || 0));
                customerSpendingMap[normPhone] = (customerSpendingMap[normPhone] || 0) + orderSubtotal;
            });

            let batchesCommits = [];
            let dbBatch = db.batch();
            let count = 0;
            let updatedCustomers = 0;

            Object.keys(customerSpendingMap).forEach(phone => {
                const totalSpent = customerSpendingMap[phone];
                if (totalSpent >= 100) {
                    const earnedPoints = Math.floor(totalSpent / 100) * ptsPer100;
                    if (earnedPoints > 0) {
                        const cleanPhone = phone.startsWith('0') ? phone : '0' + phone;
                        const ref = db.collection('customers').doc(cleanPhone);
                        dbBatch.set(ref, { totalSpent: totalSpent, walletPoints: earnedPoints }, { merge: true });
                        count++;
                        updatedCustomers++;
                        if (count >= 400) {
                            batchesCommits.push(dbBatch.commit());
                            dbBatch = db.batch();
                            count = 0;
                        }
                    }
                }
            });

            if (count > 0) batchesCommits.push(dbBatch.commit());
            await Promise.all(batchesCommits);

            if (typeof window.refreshCustomersData === 'function') window.refreshCustomersData();
            alert(`🎉 تمت العملية بنجاح! تم تحديث نقاط المحفظة لـ (${updatedCustomers}) عميل بناءً على طلباتهم المكتملة فقط.`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حساب النقاط: ' + e.message);
        }

        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // =========================================================================
    // 📊 6. المزامنة مع Google Sheets (متوافقة 100% مع سكربت كاشف الأرقام للموبايل)
    // =========================================================================
    const DEFAULT_GSHEET_URL = 'https://script.google.com/macros/s/AKfycbwp7qhmVx2Uz1ihRdvJ7bDEVsZfejG51116ylcWyVSiDm2OOTOWR_9A4UNDeHKuYgeQQw/exec';

    window.syncOrderToGoogleSheet = async function (orderObj, action = 'update') {
        if (!orderObj || !orderObj.customerPhone) return;
        const webhookUrl = storeSettings?.googleSheetWebhookUrl || DEFAULT_GSHEET_URL;
        if (!webhookUrl) return;

        try {
            let statusAr = 'جديد 🆕';
            if (orderObj.status === 'processing') statusAr = '⏳ قيد التجهيز';
            else if (orderObj.status === 'completed') statusAr = '✅ مكتمل';
            else if (orderObj.status === 'canceled') statusAr = '❌ ملغي';
            else if (orderObj.status === 'deferred') statusAr = '📅 مؤجل';
            else if (orderObj.status === 'dispatched') statusAr = '🛵 في الطريق';
            else if (orderObj.status === 'no_answer') statusAr = '📵 لم يرد';
            else if (orderObj.status === 'trash') statusAr = '🗑️ محذوف';

            let itemsText = '';
            if (orderObj.items && Array.isArray(orderObj.items)) {
                itemsText = orderObj.items.map(i => '▪️ ' + i.quantity + 'x ' + i.name).join('\n');
            }

            let notesText = '';
            if (orderObj.adminNote) notesText += '🔒 إداري: ' + orderObj.adminNote + '\n';
            if (orderObj.driverNote) notesText += '🛵 مندوب: ' + orderObj.driverNote;

            const payload = {
                action: action || 'update',
                phone: orderObj.customerPhone,
                name: orderObj.customerName || 'بدون اسم',
                zone: orderObj.zone || '---',
                status: orderObj.status || 'new',
                statusAr: statusAr,
                total: orderObj.total || 0,
                batch: orderObj.batchName || 'أوردر عادي',
                details: itemsText || 'لا توجد تفاصيل',
                notes: notesText.trim()
            };

            fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        } catch (e) {
            console.log('Google sheet sync skipped:', e);
        }
    };


    window.migrateOldOrdersToSheet = async function () {
        const webhookUrl = document.getElementById('st-gsheet-url')?.value.trim() || storeSettings?.googleSheetWebhookUrl;
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];

        if (ordersList.length === 0) return alert('لا توجد طلبات مسجلة لترحيلها!');

        if (!webhookUrl) {
            if (confirm(`لم يتم وضع رابط Google Apps Script Webhook بعد.\nهل تريد تصدير كل الطلبات (${ordersList.length} طلب) في ملف Excel (CSV) جاهز لرفعه مباشرة إلى جوجل شيت؟`)) {
                return window.exportAllOrdersToCSV(ordersList);
            }
            return;
        }

        if (!confirm(`سيتم إرسال (${ordersList.length}) طلب إلى شيت جوجل الآن. تأكيد البدء؟`)) return;

        const btn = document.getElementById('btn-migrate');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري النقل للشيت...';
            btn.disabled = true;
        }

        try {
            let sent = 0;
            for (const o of ordersList) {
                if (o.status === 'trash') continue;
                await window.syncOrderToGoogleSheet(o, 'update');
                sent++;
            }
            alert(`تم إرسال وترحيل (${sent}) طلب إلى جوجل شيت بنجاح! 🚀`);
        } catch (e) {
            alert('حدث خطأ أثناء ترحيل الطلبات!');
        }

        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // تصدير كافة الطلبات إلى ملف Excel CSV متوافق مع اللغة العربية
    window.exportAllOrdersToCSV = function (ordersArray) {
        const list = ordersArray || (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []);
        if (!list || list.length === 0) return alert('لا توجد بيانات لتصديرها!');

        const headers = ['كود الطلب', 'التاريخ', 'اسم العميل', 'الموبايل الأساسي', 'الموبايل البديل', 'المنطقة', 'العنوان', 'الأصناف', 'المنتجات', 'التوصيل', 'الخصم', 'الإجمالي', 'الدفع', 'آجل', 'الحالة', 'الدفعة', 'المندوب', 'ملاحظات إدارية'];
        const rows = list.map(o => {
            const itemsTxt = Array.isArray(o.items) ? o.items.map(i => `${i.quantity}x ${i.name}`).join(' | ') : '';
            return [
                o.id || '',
                o.orderDate || '',
                o.customerName || '',
                o.customerPhone || '',
                o.customerPhone2 || '',
                o.zone || '',
                o.customerAddress || '',
                itemsTxt,
                o.subtotal || 0,
                o.deliveryFee || 0,
                o.discount || 0,
                o.total || 0,
                o.paymentMethod === 'online' ? 'أونلاين' : 'كاش',
                o.debt || 0,
                o.status || '',
                o.batchName || '',
                o.driverName || '',
                (o.adminNote || '').replace(/\n/g, ' ')
            ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Sman_Hhya_Orders_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    // تحميل نسخة احتياطية كاملة للنظام بصيغة JSON
    window.exportFullSystemBackupJSON = function () {
        const backupObj = {
            exportedAt: new Date().toISOString(),
            storeSettings: typeof storeSettings !== 'undefined' ? storeSettings : {},
            storeProducts: typeof storeProducts !== 'undefined' ? storeProducts : {},
            storePrices: typeof storePrices !== 'undefined' ? storePrices : {},
            storeStock: typeof storeStock !== 'undefined' ? storeStock : {},
            storeBatches: typeof storeBatches !== 'undefined' ? storeBatches : {},
            storeFreezer: typeof storeFreezer !== 'undefined' ? storeFreezer : {},
            customersCount: typeof customersData !== 'undefined' ? customersData.length : 0,
            ordersCount: typeof allOrdersRaw !== 'undefined' ? allOrdersRaw.length : 0,
            customers: typeof customersData !== 'undefined' ? customersData : [],
            orders: typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []
        };

        const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Sman_Hhya_Full_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    // =========================================================================
    // 🔄 7. التحديث الفوري الإجباري للتطبيق على الموبايل والكمبيوتر (forceUpdateAppNow)
    // =========================================================================
    window.forceUpdateAppNow = async function () {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                    await reg.unregister();
                }
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (const key of keys) {
                    await caches.delete(key);
                }
            }
        } catch (e) {
            console.log('Cache clear info:', e);
        }
        const cleanUrl = window.location.pathname + '?v=' + Date.now() + window.location.hash;
        window.location.replace(cleanUrl);
    };

    // تشغيل التهيئة فقط للتبويب المفتوح دون التسبب في وميض عند بدء التشغيل
    function initSettingsIfActive() {
        const activeTab = window.smanCurrentActiveTab || 'dashboard';
        if (activeTab === 'inventory') window.renderInventoryUI();
        if (activeTab === 'settings') window.renderSettingsUI();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => setTimeout(initSettingsIfActive, 200));
    } else {
        setTimeout(initSettingsIfActive, 200);
    }
})();
