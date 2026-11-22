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
        if (p && p.categoryType === 'custom') {
            return { group: 'custom', rank: 50 };
        }
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
        let quailCount = 0, eggsChicksCount = 0, weightCount = 0, customCount = 0;

        prodIds.forEach(id => {
            const p = prodsObj[id];
            if (p.isHidden) hiddenCount++;
            else activeCount++;

            const cls = classifyInventoryProduct(id, p);
            if (cls.group === 'custom') customCount++;
            else if (cls.group === 'weight') weightCount++;
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
                    <button type="button" onclick="setInventoryCategoryFilter('custom')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${tabCls('custom')}">✨ مستقل (${customCount})</button>
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
            weight: [],
            custom: []
        };

        prodIds.forEach(id => {
            const p = prodsObj[id];
            const cls = classifyInventoryProduct(id, p);

            if (st.category === 'quail' && cls.group !== 'quail') return;
            if (st.category === 'eggs_chicks' && cls.group !== 'eggs_chicks') return;
            if (st.category === 'weight' && cls.group !== 'weight') return;
            if (st.category === 'custom' && cls.group !== 'custom') return;
            if (st.category === 'hidden' && !p.isHidden) return;

            if (rawQ) {
                const hay = `${p.name || ''} ${p.weight || ''} ${p.customGroupTitle || ''} ${pricesObj[id] || p.basePrice || ''}`.toLowerCase();
                if (!hay.includes(rawQ)) return;
            }

            if (!groups[cls.group]) groups.custom.push({ id, p, group: 'custom', rank: cls.rank });
            else groups[cls.group].push({ id, p, group: cls.group, rank: cls.rank });
        });

        groups.quail.sort((a, b) => a.rank - b.rank);
        groups.eggs_chicks.sort((a, b) => a.rank - b.rank);
        groups.weight.sort((a, b) => a.rank - b.rank);
        groups.custom.sort((a, b) => a.rank - b.rank);

        const totalShown = groups.quail.length + groups.eggs_chicks.length + groups.weight.length + groups.custom.length;
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
                        <div class="flex items-center justify-between gap-1 bg-indigo-50/80 border border-indigo-200 px-2 py-1 rounded-xl text-indigo-900 min-w-0">
                            <span class="text-[9px] font-black truncate" title="عدد الفرخات المتاحة للحجز قبل الذبح">⏳ حجز عدد:</span>
                            <input type="number" min="0" value="${Math.max(0, parseInt(storeStock[id + '_prebook']) || 0)}" onchange="storeStock['${id}_prebook'] = Math.max(0, parseInt(this.value) || 0); saveAllSettings(true);" class="w-12 bg-white border border-indigo-200 rounded-lg py-0.5 px-1 text-xs font-black text-indigo-900 text-center outline-none focus:ring-2 focus:ring-indigo-300">
                            <button type="button" onclick="toggleSingleProductExpand('${id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black px-1.5 py-1 rounded-lg shrink-0" title="مصفوفة الأوزان الجاهزة">⚖️ ${weightArr.length}</button>
                        </div>
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
                const prebookCnt = Math.max(0, parseInt(storeStock[id + '_prebook']) || 0);
                weightStatsHtml = `
                    <div class="mt-3 bg-indigo-50/70 p-3 rounded-xl border border-indigo-200/80 space-y-2.5">
                        <!-- وضع 1: الحجز بالعدد قبل الذبح (السعر يتحدد بالميزان يوم الذبح) -->
                        <div class="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div class="min-w-0 flex-1">
                                <label class="text-[11px] font-black text-amber-950 block">⏳ متاح للحجز بالعدد (قبل الذبح — السعر يتحدد بالميزان):</label>
                                <span class="text-[9px] font-bold text-amber-800">اكتب العدد المتاح ليتمكن العميل وأنت من حجز فرخات بالعدد بدون وزن مسبق (ضع 0 للإغلاق).</span>
                            </div>
                            <input type="number" min="0" value="${prebookCnt}" onchange="storeStock['${id}_prebook'] = Math.max(0, parseInt(this.value) || 0); saveAllSettings(true);" class="w-20 border-2 border-amber-300 rounded-xl p-1.5 text-center text-sm font-black text-amber-950 bg-white outline-none focus:border-amber-500">
                        </div>
                        <!-- وضع 2: مصفوفة الأوزان الجاهزة (بعد الذبح والوزن) -->
                        <div class="flex flex-wrap justify-between items-center gap-1.5">
                            <label class="text-[11px] font-black text-indigo-900">
                                <i class="fa-solid fa-scale-balanced ml-1 text-indigo-600"></i> مصفوفة الأوزان الجاهزة بالجرام (بمسافة أو تحت بعض):
                            </label>
                            <span id="weights-badge-${id}" class="bg-white text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-200 text-[10px] font-black">الجاهز: ${wArr.length} قطعة (${totalKg} كجم)</span>
                        </div>
                        <textarea oninput="let arr = window.parseWeightsArray ? window.parseWeightsArray(this.value) : []; storeProducts['${id}'].weightsList = arr.join(' '); storeStock['${id}'] = arr.length; let b = document.getElementById('weights-badge-${id}'); if(b) b.innerText = 'الجاهز: ' + arr.length + ' قطعة (' + (arr.reduce((s,v)=>s+v,0)/1000).toFixed(2) + ' كجم)'; if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" onchange="updateProductWeightList('${id}', this.value)" dir="ltr" class="w-full border border-indigo-200 rounded-xl p-2.5 text-xs font-black text-slate-800 bg-white outline-none focus:ring-2 focus:ring-indigo-300 custom-scroll" rows="3" placeholder="مثال: 1400 1550 1200">${p.weightsList || ''}</textarea>
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
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">صورة الصنف (رفع أو رابط)</label>
                        <div class="flex items-center gap-1">
                            <input type="text" id="prod-img-inp-${id}" value="${imgSrc}" onchange="storeProducts['${id}'].images = [this.value]" class="flex-1 min-w-0 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-2 text-[10px] font-bold text-slate-600 outline-none text-left" dir="ltr" placeholder="super.png">
                            <button type="button" id="btn-up-prod-${id}" onclick="triggerProductImageUpload('${id}')" title="رفع وتظبيط صورة من الموبايل" class="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black shrink-0 flex items-center gap-1 shadow-sm active:scale-95">
                                <i class="fa-solid fa-camera"></i> <span>رفع</span>
                            </button>
                        </div>
                    </div>

                </div>

                <!-- تحديد قسم ومسار الصنف (يسمح بإضافة أي صنف مستقل مثل سمان شوي أو علف أو منتجات أخرى) -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-purple-50/60 p-2.5 rounded-xl border border-purple-200/80">
                    <div>
                        <label class="text-[10px] font-black text-purple-900 block mb-1">🧭 قسم ومسار الصنف في المتجر:</label>
                        <select onchange="storeProducts['${id}'].categoryType = this.value; if(this.value === 'custom') { storeProducts['${id}'].isExtra = true; } renderInventoryUI(); if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" class="w-full border border-purple-200 bg-white rounded-xl p-2 text-xs font-black text-slate-800 outline-none">
                            <option value="auto" ${(!p.categoryType || p.categoryType === 'auto') ? 'selected' : ''}>🤖 تلقائي (الوضع الافتراضي)</option>
                            <option value="quail" ${p.categoryType === 'quail' ? 'selected' : ''}>🥩 سمان مذبوح بالجوز (مرتبط بدفعة الذبح)</option>
                            <option value="eggs_chicks" ${p.categoryType === 'eggs_chicks' ? 'selected' : ''}>🥚 بيض وكتاكيت</option>
                            <option value="weight" ${p.categoryType === 'weight' ? 'selected' : ''}>⚖️ طيور بالوزن</option>
                            <option value="custom" ${p.categoryType === 'custom' ? 'selected' : ''}>✨ صنف مستقل (قسم خاص — لا يتأثر بالدفعات)</option>
                        </select>
                    </div>
                    <div class="${p.categoryType === 'custom' ? '' : 'hidden'}">
                        <label class="text-[10px] font-black text-purple-900 block mb-1">🏷️ اسم القسم الذي سيظهر للعميل في المتجر:</label>
                        <input type="text" value="${p.customGroupTitle || ''}" onchange="storeProducts['${id}'].customGroupTitle = this.value.trim();" placeholder="مثال: 🔥 سمان شوي ومتبل أو 🌾 أعلاف..." class="w-full border border-purple-200 bg-white rounded-xl p-2 text-xs font-bold text-slate-800 outline-none">
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
            },
            {
                key: 'custom',
                title: 'أصناف مستقلة ومنتجات خاصة (لا تتأثر بالدفعات)',
                icon: 'fa-sparkles text-purple-600',
                headerCls: 'bg-purple-50/90 text-purple-900 border-purple-200',
                items: groups.custom
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
    // 🏪 3. إعدادات المتجر، المناطق، المناديب، البوليصة، والقوالب الذكية (Settings UI)
    // =========================================================================
    function escSettingsHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.settingsSubTabState = window.settingsSubTabState || 'store';

    window.switchSettingsSubTab = function (tabKey) {
        const valid = ['store', 'logistics', 'waybill', 'backup'];
        const target = valid.includes(tabKey) ? tabKey : 'store';
        window.settingsSubTabState = target;

        valid.forEach(k => {
            const panel = document.getElementById(`st-panel-${k}`);
            const btn = document.getElementById(`st-tab-btn-${k}`);
            if (panel) {
                if (k === target) panel.classList.remove('hidden');
                else panel.classList.add('hidden');
            }
            if (btn) {
                btn.className = (k === target)
                    ? 'st-subtab-btn py-2 px-2.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-sm transition-all flex items-center justify-center gap-1.5'
                    : 'st-subtab-btn py-2 px-2.5 rounded-xl text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5';
            }
        });
    };

    // تنظيف البيانات من أي قيم undefined أو NaN قبل الإرسال لقاعدة بيانات Firebase
    function sanitizeForFirestore(val) {
        if (val === undefined) return null;
        if (typeof val === 'number' && isNaN(val)) return 0;
        if (val === null || typeof val !== 'object') return val;
        if (Array.isArray(val)) {
            return val.filter(item => item !== undefined).map(sanitizeForFirestore);
        }
        const out = {};
        Object.keys(val).forEach(k => {
            if (val[k] !== undefined) {
                out[k] = sanitizeForFirestore(val[k]);
            }
        });
        return out;
    }

    // حفظ ما كتبه المستخدم في خانات الإعدادات والمناطق والمناديب داخل الذاكرة قبل إعادة الرسم
    function captureSettingsInputsIntoMemory() {
        if (document.getElementById('st-name')) {
            storeSettings.storeName = document.getElementById('st-name').value.trim();
            storeSettings.storePhone = document.getElementById('st-phone').value.trim();
            storeSettings.minOrder = parseInt(document.getElementById('st-min-order').value) || 0;
            storeSettings.storeOpen = Boolean(document.getElementById('st-is-open').checked);
            storeSettings.freeDeliveryActive = Boolean(document.getElementById('st-free-del').checked);
            storeSettings.freeDeliveryThreshold = parseInt(document.getElementById('st-free-th').value) || 0;
            if (document.getElementById('st-pts-per-100')) {
                storeSettings.pointsPer100 = parseFloat(document.getElementById('st-pts-per-100').value) || 5;
            }
            if (document.getElementById('st-pts-value')) {
                storeSettings.pointValueInEGP = parseFloat(document.getElementById('st-pts-value').value) || 0.40;
            }
        }

        if (document.getElementById('st-hero-msg')) storeSettings.heroMessage = document.getElementById('st-hero-msg').value.trim();
        if (document.getElementById('st-closed-msg')) storeSettings.closedMessage = document.getElementById('st-closed-msg').value.trim();
        if (document.getElementById('st-store-desc')) storeSettings.storeDesc = document.getElementById('st-store-desc').value.trim();
        if (document.getElementById('st-gsheet-url')) storeSettings.googleSheetWebhookUrl = document.getElementById('st-gsheet-url').value.trim();

        if (document.getElementById('admin-whatsapp-template')) {
            storeSettings.whatsappTemplate = document.getElementById('admin-whatsapp-template').value;
            storeSettings.dispatchTemplate = document.getElementById('admin-dispatch-template').value;
            storeSettings.ticktickTemplate = document.getElementById('admin-ticktick-template').value;
            storeSettings.batchHashtag = document.getElementById('admin-batch-hashtag').value.trim();
        }

        const zCont = document.getElementById('zones-list-container');
        if (zCont) {
            const zRows = zCont.querySelectorAll('[data-zone-row="1"]');
            if (zRows.length > 0) {
                const liveZones = [];
                zRows.forEach(row => {
                    const nameInp = row.querySelector('[data-zone-field="name"]');
                    const priceInp = row.querySelector('[data-zone-field="price"]');
                    liveZones.push({
                        name: (nameInp?.value || '').trim(),
                        price: parseInt(priceInp?.value) || 0
                    });
                });
                storeSettings.deliveryZones = liveZones;
            }
        }

        const dCont = document.getElementById('drivers-list-container');
        if (dCont) {
            const dCards = dCont.querySelectorAll('[data-driver-row="1"]');
            if (dCards.length > 0) {
                const liveDrivers = [];
                dCards.forEach(card => {
                    const nameInp = card.querySelector('[data-driver-field="name"]');
                    const phoneInp = card.querySelector('[data-driver-field="phone"]');
                    const pinInp = card.querySelector('[data-driver-field="pin"]');
                    liveDrivers.push({
                        name: (nameInp?.value || '').trim(),
                        phone: (phoneInp?.value || '').trim(),
                        pin: (pinInp?.value || '').trim()
                    });
                });
                storeSettings.drivers = liveDrivers;
            }
        }

        if (document.getElementById('wb-paper-size')) {
            storeSettings.waybillConfig = {
                ...(storeSettings.waybillConfig || {}),
                slogan: document.getElementById('wb-slogan')?.value.trim() || '',
                footerMsg: document.getElementById('wb-footer-msg')?.value.trim() || '',
                logoUrl: document.getElementById('wb-logo-url')?.value.trim() || '',
                paperSize: document.getElementById('wb-paper-size')?.value || '70x130',
                showBarcode: Boolean(document.getElementById('wb-show-barcode')?.checked),
                showBreakdown: Boolean(document.getElementById('wb-show-breakdown')?.checked),
                showDriverNote: Boolean(document.getElementById('wb-show-driver-note')?.checked)
            };
        } else if (typeof window.getWaybillConfig === 'function') {
            storeSettings.waybillConfig = window.getWaybillConfig();
        }
    }

    function updateStoreOpenLiveBadge(isOpenNow) {
        const badge = document.getElementById('st-open-live-badge');
        if (!badge) return;
        if (isOpenNow) {
            badge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300';
            badge.textContent = '🟢 مفتوح الآن على الموقع';
        } else {
            badge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-700 border border-rose-300';
            badge.textContent = '🔴 مغلق الآن على الموقع';
        }
    }

    // حفظ فوري لحالة فتح/إغلاق المتجر بمجرد الضغط على العلامة بدون انتظار أي زر آخر
    window.quickToggleStoreOpen = async function (isOpenNow) {
        const val = Boolean(isOpenNow);
        storeSettings.storeOpen = val;
        updateStoreOpenLiveBadge(val);

        if (typeof auth !== 'undefined' && !auth.currentUser) {
            alert('⚠️ يرجى تسجيل الدخول بحساب الأدمن أولاً حتى يتم حفظ حالة المتجر في السيرفر.');
            return;
        }

        try {
            await db.collection('inventory').doc('settings').set({ storeOpen: val }, { merge: true });
            if (typeof window.saveInventoryFastMirror === 'function') window.saveInventoryFastMirror();
            const msg = val ? '🟢 تم فتح المتجر الآن بنجاح!' : '🔴 تم إغلاق المتجر مؤقتاً بنجاح!';
            if (typeof window.showToast === 'function') window.showToast(msg);
            else if (typeof window.showQuickAppToast === 'function') window.showQuickAppToast(msg);
        } catch (err) {
            console.error('Toggle storeOpen error:', err);
            alert('تعذر تغيير حالة المتجر في قاعدة البيانات: ' + (err.message || err));
        }
    };

    function ensureSettingsInlineSaveBar() {
        const settingsView = document.getElementById('view-settings');
        if (!settingsView) return;

        // ضمان ظهور زر الحفظ العلوي أيضاً داخل شاشة الإعدادات
        const topSaveBtn = document.getElementById('global-save-btn');
        if (topSaveBtn && settingsView.classList.contains('active')) {
            topSaveBtn.classList.remove('hidden');
        }

        // شريط حفظ بارز وثابت داخل صفحة إعدادات المتجر نفسها
        if (!document.getElementById('st-inline-save-bar')) {
            const bar = document.createElement('div');
            bar.id = 'st-inline-save-bar';
            bar.className = 'sticky top-0 z-20 bg-gradient-to-l from-slate-900 via-emerald-950 to-slate-900 text-white p-3 rounded-2xl shadow-lg border border-amber-400/35 flex flex-wrap items-center justify-between gap-2.5';
            bar.innerHTML = `
                <div class="flex items-center gap-2 text-xs font-black">
                    <i class="fa-solid fa-sliders text-amber-400"></i>
                    <span>بعد تعديل البيانات أو إضافة منطقة/مندوب اضغط حفظ:</span>
                </div>
                <button type="button" id="st-inline-save-btn" onclick="saveAllSettings(false)" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all shrink-0">
                    <i class="fa-solid fa-floppy-disk"></i>
                    <span>حفظ كل الإعدادات الآن</span>
                </button>
            `;
            settingsView.insertBefore(bar, settingsView.firstChild);
        }

        // ربط خانة "المتجر مفتوح" بالحفظ الفوري وإضافة شارة الحالة بجانبها
        const openCb = document.getElementById('st-is-open');
        if (openCb && !openCb.hasAttribute('data-instant-bound')) {
            openCb.setAttribute('data-instant-bound', '1');
            openCb.addEventListener('change', () => {
                window.quickToggleStoreOpen(openCb.checked);
            });
            const lbl = openCb.closest('label');
            if (lbl && !document.getElementById('st-open-live-badge')) {
                const badge = document.createElement('span');
                badge.id = 'st-open-live-badge';
                badge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-black';
                lbl.appendChild(badge);
            }
        }
        if (openCb) updateStoreOpenLiveBadge(Boolean(openCb.checked));
    }

    function renderZonesListOnly() {
        const zCont = document.getElementById('zones-list-container');
        if (!zCont) return;
        const zones = Array.isArray(storeSettings.deliveryZones) ? storeSettings.deliveryZones : [];
        zCont.innerHTML = zones.map((z, i) => `
            <div data-zone-row="1" class="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                <span class="text-[10px] font-black text-slate-400 w-5 text-center shrink-0">${i + 1}</span>
                <input type="text" data-zone-field="name" value="${escSettingsHtml(z.name || '')}" oninput="if(storeSettings.deliveryZones[${i}]) storeSettings.deliveryZones[${i}].name=this.value.trim();" onchange="if(storeSettings.deliveryZones[${i}]) storeSettings.deliveryZones[${i}].name=this.value.trim(); if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" class="flex-1 min-w-0 border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none focus:border-indigo-400" placeholder="اسم المنطقة">
                <div class="relative w-20 shrink-0">
                    <input type="number" data-zone-field="price" value="${Number(z.price) || 0}" oninput="if(storeSettings.deliveryZones[${i}]) storeSettings.deliveryZones[${i}].price=parseInt(this.value)||0;" onchange="if(storeSettings.deliveryZones[${i}]) storeSettings.deliveryZones[${i}].price=parseInt(this.value)||0; if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" class="w-full border border-slate-200 rounded-lg py-2 pr-2 pl-5 text-xs font-black text-indigo-700 bg-white outline-none text-center" placeholder="0">
                    <span class="absolute left-1.5 top-2 text-[10px] font-bold text-slate-400">ج</span>
                </div>
                <button type="button" onclick="removeZoneItemUI(${i})" class="w-8 h-8 shrink-0 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا توجد مناطق مسجلة، اضغط (+).</div>`;
    }

    function renderDriversListOnly() {
        const dCont = document.getElementById('drivers-list-container');
        if (!dCont) return;
        const drivers = Array.isArray(storeSettings.drivers) ? storeSettings.drivers : [];
        dCont.innerHTML = drivers.map((d, i) => `
            <div data-driver-row="1" class="bg-slate-50 p-2 rounded-xl border border-slate-200/80 space-y-1.5">
                <div class="flex items-center gap-1.5">
                    <input type="text" data-driver-field="name" value="${escSettingsHtml(d.name || '')}" oninput="if(storeSettings.drivers[${i}]) storeSettings.drivers[${i}].name=this.value.trim();" placeholder="اسم المندوب" class="flex-1 min-w-0 border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none">
                    <button type="button" onclick="removeDriverItemUI(${i})" class="w-8 h-8 shrink-0 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
                <div class="grid grid-cols-3 gap-1.5">
                    <input type="tel" data-driver-field="phone" value="${escSettingsHtml(d.phone || '')}" oninput="if(storeSettings.drivers[${i}]) storeSettings.drivers[${i}].phone=this.value.trim();" placeholder="رقم الواتساب" class="col-span-2 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-800 bg-white outline-none text-left" dir="ltr">
                    <input type="text" data-driver-field="pin" value="${escSettingsHtml(d.pin || '')}" oninput="if(storeSettings.drivers[${i}]) storeSettings.drivers[${i}].pin=this.value.trim();" placeholder="PIN" title="الرقم السري للمندوب" class="col-span-1 border border-blue-200 rounded-lg p-1.5 text-xs font-black text-blue-700 bg-blue-50/40 outline-none text-center">
                </div>
            </div>
        `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا يوجد مناديب مسجلين، اضغط (+).</div>`;
    }

    window.removeZoneItemUI = function (idx) {
        captureSettingsInputsIntoMemory();
        if (Array.isArray(storeSettings.deliveryZones)) {
            storeSettings.deliveryZones.splice(idx, 1);
        }
        renderZonesListOnly();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
    };

    window.removeDriverItemUI = function (idx) {
        captureSettingsInputsIntoMemory();
        if (Array.isArray(storeSettings.drivers)) {
            storeSettings.drivers.splice(idx, 1);
        }
        renderDriversListOnly();
    };

    window.renderSettingsUI = function (forceRefresh = false) {
        if (!document.getElementById('st-name')) return;

        // حماية ما يكتبه المستخدم: لا نُعيد مسح الحقول أثناء التحديث التلقائي إذا كان المؤشر داخل خانة كتابة
        const settingsView = document.getElementById('view-settings');
        const activeEl = document.activeElement;
        if (!forceRefresh && settingsView && activeEl && settingsView.contains(activeEl) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) {
            return;
        }

        window._settingsUIRenderedOnce = true;
        window.switchSettingsSubTab(window.settingsSubTabState || 'store');

        document.getElementById('st-name').value = storeSettings.storeName || '';
        document.getElementById('st-phone').value = storeSettings.storePhone || '';
        document.getElementById('st-min-order').value = storeSettings.minOrder || 0;
        document.getElementById('st-is-open').checked = storeSettings.storeOpen !== false;
        document.getElementById('st-free-del').checked = !!storeSettings.freeDeliveryActive;
        document.getElementById('st-free-th').value = storeSettings.freeDeliveryThreshold || 0;
        document.getElementById('st-free-th').disabled = !storeSettings.freeDeliveryActive;

        if (document.getElementById('st-hero-msg')) document.getElementById('st-hero-msg').value = storeSettings.heroMessage || '';
        if (document.getElementById('st-closed-msg')) document.getElementById('st-closed-msg').value = storeSettings.closedMessage || '';
        if (document.getElementById('st-store-desc')) document.getElementById('st-store-desc').value = storeSettings.storeDesc || '';
        if (document.getElementById('st-pts-per-100')) document.getElementById('st-pts-per-100').value = storeSettings.pointsPer100 || 5;
        if (document.getElementById('st-pts-value')) document.getElementById('st-pts-value').value = storeSettings.pointValueInEGP || 0.40;
        if (document.getElementById('st-gsheet-url')) document.getElementById('st-gsheet-url').value = storeSettings.googleSheetWebhookUrl || '';

        renderZonesListOnly();
        renderDriversListOnly();

        if (document.getElementById('admin-whatsapp-template')) {
            document.getElementById('admin-whatsapp-template').value = storeSettings.whatsappTemplate || '';
            document.getElementById('admin-dispatch-template').value = storeSettings.dispatchTemplate || '';
            document.getElementById('admin-ticktick-template').value = storeSettings.ticktickTemplate || '';
            document.getElementById('admin-batch-hashtag').value = storeSettings.batchHashtag || '';
        }

        const wbCfg = storeSettings.waybillConfig || {};
        if (document.getElementById('wb-slogan')) document.getElementById('wb-slogan').value = wbCfg.slogan || '';
        if (document.getElementById('wb-footer-msg')) document.getElementById('wb-footer-msg').value = wbCfg.footerMsg || '';
        if (document.getElementById('wb-logo-url')) document.getElementById('wb-logo-url').value = wbCfg.logoUrl || '';
        if (document.getElementById('wb-paper-size')) document.getElementById('wb-paper-size').value = wbCfg.paperSize || '70x130';
        if (document.getElementById('wb-show-barcode')) document.getElementById('wb-show-barcode').checked = wbCfg.showBarcode !== false;
        if (document.getElementById('wb-show-breakdown')) document.getElementById('wb-show-breakdown').checked = wbCfg.showBreakdown !== false;
        if (document.getElementById('wb-show-driver-note')) document.getElementById('wb-show-driver-note').checked = wbCfg.showDriverNote !== false;

        ensureSettingsInlineSaveBar();
        if (typeof window.renderGalleryStudioUI === 'function') window.renderGalleryStudioUI();
        if (typeof window.renderPromoCodesStudioUI === 'function') window.renderPromoCodesStudioUI();
        initInteractiveTemplateVariables();
        if (typeof window.syncWaybillSettingsUI === 'function') window.syncWaybillSettingsUI();
    };

    window.addNewZoneUI = function () {
        captureSettingsInputsIntoMemory();
        if (!Array.isArray(storeSettings.deliveryZones)) storeSettings.deliveryZones = [];
        storeSettings.deliveryZones.push({ name: '', price: 0 });
        renderZonesListOnly();
        const zCont = document.getElementById('zones-list-container');
        const inputs = zCont ? zCont.querySelectorAll('[data-zone-field="name"]') : [];
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    };

    window.addNewDriverUI = function () {
        captureSettingsInputsIntoMemory();
        if (!Array.isArray(storeSettings.drivers)) storeSettings.drivers = [];
        storeSettings.drivers.push({ name: '', phone: '', pin: '' });
        renderDriversListOnly();
        const dCont = document.getElementById('drivers-list-container');
        const inputs = dCont ? dCont.querySelectorAll('[data-driver-field="name"]') : [];
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
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

    // =========================================================================
    // 💾 4. حفظ الإعدادات الشامل (يحفظ بأمان وسرعة ويمنع فقدان أي بيانات)
    // =========================================================================
    window.saveAllSettings = async function (silent = false) {
        if (typeof auth !== 'undefined' && !auth.currentUser) {
            if (!silent) alert('⚠️ انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول بحساب الأدمن أولاً ليتم الحفظ في Firebase.');
            return;
        }

        const btn = document.getElementById('global-save-btn');
        const inlineBtn = document.getElementById('st-inline-save-btn');
        const origHtml = btn ? btn.innerHTML : '';
        const origInlineHtml = inlineBtn ? inlineBtn.innerHTML : '';

        if (!silent) {
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
                btn.disabled = true;
            }
            if (inlineBtn) {
                inlineBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
                inlineBtn.disabled = true;
            }
        }

        try {
            const settingsViewEl = document.getElementById('view-settings');
            const isSettingsTabOpen = Boolean(settingsViewEl && settingsViewEl.classList.contains('active')) || window.smanCurrentActiveTab === 'settings';

            let settingsPatch = {};

            if (isSettingsTabOpen) {
                captureSettingsInputsIntoMemory();

                storeSettings.deliveryZones = (storeSettings.deliveryZones || []).filter(z => z && z.name && z.name.trim() !== '');
                storeSettings.drivers = (storeSettings.drivers || []).filter(d => d && (d.name || d.phone));

                settingsPatch = {
                    storeName: storeSettings.storeName || '',
                    storePhone: storeSettings.storePhone || '',
                    minOrder: Number(storeSettings.minOrder) || 0,
                    storeOpen: storeSettings.storeOpen !== false,
                    freeDeliveryActive: Boolean(storeSettings.freeDeliveryActive),
                    freeDeliveryThreshold: Number(storeSettings.freeDeliveryThreshold) || 0,
                    pointsPer100: Number(storeSettings.pointsPer100) || 5,
                    pointValueInEGP: Number(storeSettings.pointValueInEGP) || 0.40,
                    deliveryZones: storeSettings.deliveryZones,
                    drivers: storeSettings.drivers,
                    whatsappTemplate: storeSettings.whatsappTemplate || '',
                    dispatchTemplate: storeSettings.dispatchTemplate || '',
                    ticktickTemplate: storeSettings.ticktickTemplate || '',
                    batchHashtag: storeSettings.batchHashtag || '',
                    productsData: storeProducts
                };

                if (storeSettings.waybillConfig) settingsPatch.waybillConfig = storeSettings.waybillConfig;
                if (storeSettings.heroMessage !== undefined) settingsPatch.heroMessage = storeSettings.heroMessage;
                if (storeSettings.closedMessage !== undefined) settingsPatch.closedMessage = storeSettings.closedMessage;
                if (storeSettings.storeDesc !== undefined) settingsPatch.storeDesc = storeSettings.storeDesc;
                if (storeSettings.googleSheetWebhookUrl !== undefined) settingsPatch.googleSheetWebhookUrl = storeSettings.googleSheetWebhookUrl;
                if (Array.isArray(storeSettings.galleryImages)) settingsPatch.galleryImages = storeSettings.galleryImages;
                if (Array.isArray(storeSettings.promoCodes)) settingsPatch.promoCodes = storeSettings.promoCodes;
                if (storeSettings.showPromoField !== undefined) settingsPatch.showPromoField = Boolean(storeSettings.showPromoField);
            } else {
                // عند الحفظ من شاشة الأصناف أو الكوبونات أو الصور: لا نلمس storeOpen أو اسم المتجر نهائياً
                storeSettings.productsData = storeProducts;
                settingsPatch = {
                    productsData: storeProducts
                };
                if (Array.isArray(storeSettings.galleryImages)) settingsPatch.galleryImages = storeSettings.galleryImages;
                if (Array.isArray(storeSettings.promoCodes)) settingsPatch.promoCodes = storeSettings.promoCodes;
                if (storeSettings.showPromoField !== undefined) settingsPatch.showPromoField = Boolean(storeSettings.showPromoField);
            }

            const cleanSettingsPatch = sanitizeForFirestore(settingsPatch);
            const cleanStock = sanitizeForFirestore(storeStock);
            const cleanPrices = sanitizeForFirestore(storePrices);

            await Promise.all([
                db.collection('inventory').doc('settings').set(cleanSettingsPatch, { merge: true }),
                db.collection('inventory').doc('stock').set(cleanStock, { merge: true }),
                db.collection('inventory').doc('prices').set(cleanPrices, { merge: true })
            ]);

            if (typeof window.saveInventoryFastMirror === 'function') window.saveInventoryFastMirror();
            if (isSettingsTabOpen) {
                renderZonesListOnly();
                renderDriversListOnly();
                updateStoreOpenLiveBadge(storeSettings.storeOpen !== false);
            }
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.renderReconciliationUI === 'function') window.renderReconciliationUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            if (!silent) {
                if (typeof window.showToast === 'function') window.showToast('✅ تم حفظ الإعدادات والمناطق والمناديب بنجاح!');
                else if (typeof window.showQuickAppToast === 'function') window.showQuickAppToast('✅ تم حفظ الإعدادات والمناطق والمناديب بنجاح!');
                else alert('تم الحفظ بنجاح! 🚀');
            }
        } catch (e) {
            console.error('Save settings error:', e);
            if (!silent) alert('حدث خطأ أثناء حفظ الإعدادات: ' + (e.message || e));
        }

        if (!silent) {
            if (btn) {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }
            if (inlineBtn) {
                inlineBtn.innerHTML = origInlineHtml;
                inlineBtn.disabled = false;
            }
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

    // =========================================================================
    // 📋 8. محرك مركز الملاحظات والتقييمات الذكي (Executive Smart Notes Hub)
    // =========================================================================
    window.notesHubState = {
        filter: 'all' // 'all' | 'urgent' | 'problem' | 'rating' | 'driver' | 'customers'
    };

    const URGENT_KEYWORDS = ['عاجل', 'مستعجل', 'ضروري', 'فورا', 'فوراً', 'بسرعة', 'سريع', 'النهاردة', 'النهارده', 'اليوم', 'مهم', '🚨'];
    const PROBLEM_KEYWORDS = ['مشكلة', 'مشكله', 'شكوى', 'شكوي', 'ناقص', 'تالف', 'بايظ', 'غلط', 'خطأ', 'مرتجع', 'زعلان', 'رفض', 'عجز', 'تأخير', 'ماتسلمش', 'آجل', 'باقي حساب', 'تنبيه مالي'];

    function escNoteHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escNoteJs(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;')
            .replace(/\n/g, ' ');
    }

    function hasAnyKeyword(txt, list) {
        const low = String(txt || '').toLowerCase();
        return list.some(k => low.includes(k));
    }

    window.setNotesFilter = function (filterKey) {
        window.notesHubState.filter = filterKey || 'all';
        const allKeys = ['all', 'urgent', 'problem', 'rating', 'driver', 'customers'];
        allKeys.forEach(k => {
            const btn = document.getElementById(`n-filter-${k}`);
            if (!btn) return;
            if (k === window.notesHubState.filter) {
                btn.className = 'notes-filter-btn active whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black bg-slate-900 text-white shadow-sm transition-all';
            } else {
                btn.className = 'notes-filter-btn whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all';
            }
        });
        window.renderNotesUI();
    };

    window.quickReplyNoteFromHub = async function (orderId, field) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const ord = ordersList.find(o => o && o.id === orderId);
        if (!ord) return;

        const fieldLabel = field === 'driverNote' ? 'ملاحظة للمندوب' : 'ملاحظة إدارية';
        const newText = (typeof window.execPrompt === 'function')
            ? await window.execPrompt(`أضف ${fieldLabel} جديدة على طلب (${ord.customerName || 'العميل'}):`, '', { title: `إضافة ${fieldLabel}`, tone: 'brand', confirmText: 'حفظ الملاحظة' })
            : prompt(`أضف ${fieldLabel} جديدة على طلب (${ord.customerName || 'العميل'}):`);

        if (!newText || !newText.trim()) return;

        const dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const line = `[${dateStr}] ${newText.trim()}`;
        const prev = ord[field] || '';
        const updated = prev ? `${prev}\n---\n${line}` : line;

        try {
            ord[field] = updated;
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId][field] = updated;
            }
            await db.collection('orders').doc(orderId).update({ [field]: updated });
            window.renderNotesUI();
            if (typeof window.showToast === 'function') window.showToast('✅ تمت إضافة الملاحظة بنجاح');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ الملاحظة!');
        }
    };

    window.markOrderNoteReviewedInHub = async function (orderId, field) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const ord = ordersList.find(o => o && o.id === orderId);
        if (!ord) return;

        const ok = (typeof window.execConfirm === 'function')
            ? await window.execConfirm(`هل تريد تسجيل (تمت المراجعة والحل ✅) على ملاحظة طلب (${ord.customerName || 'العميل'})؟`, { title: 'تأكيد مراجعة الملاحظة', tone: 'success', confirmText: 'نعم، تمت المراجعة' })
            : confirm(`هل تريد تسجيل (تمت المراجعة والحل ✅) على هذا الطلب؟`);
        if (!ok) return;

        const dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const line = `[${dateStr}] ✅ تمت المراجعة والتعامل مع الملاحظة.`;
        const prev = ord[field] || '';
        const updated = prev ? `${prev}\n---\n${line}` : line;

        try {
            ord[field] = updated;
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId][field] = updated;
            }
            await db.collection('orders').doc(orderId).update({ [field]: updated });
            window.renderNotesUI();
            if (typeof window.showToast === 'function') window.showToast('✅ تم تسجيل المراجعة بنجاح');
        } catch (e) {
            alert('حدث خطأ أثناء تحديث الملاحظة!');
        }
    };

    window.renderNotesUI = function () {
        const container = document.getElementById('notes-list-container');
        if (!container) return;

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const custList = (typeof customersData !== 'undefined' && Array.isArray(customersData)) ? customersData : [];
        const includeComp = document.getElementById('notes-include-completed')?.checked !== false;
        const rawQ = String(document.getElementById('search-notes')?.value || '')
            .replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660)
            .replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0)
            .toLowerCase().trim();

        const activeFilter = window.notesHubState.filter || 'all';
        const cards = [];

        // 1. جمع ملاحظات وتقييمات الطلبات
        ordersList.forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (!includeComp && (o.status === 'completed' || o.status === 'canceled')) return;

            const adminText = String(o.adminNote || '').trim();
            const driverText = String(o.driverNote || '').trim();
            const hasRating = Number(o.rating) > 0 || adminText.includes('تقييم الخدمة');

            if (!adminText && !driverText && !hasRating) return;

            const combined = `${adminText} ${driverText}`;
            const isReviewed = combined.includes('✅ تمت المراجعة');
            const isUrgent = !isReviewed && hasAnyKeyword(combined, URGENT_KEYWORDS);
            const isProblem = !isReviewed && (hasAnyKeyword(combined, PROBLEM_KEYWORDS) || (Number(o.rating) > 0 && Number(o.rating) <= 3));
            const sortMs = (o.createdAt && typeof o.createdAt.toMillis === 'function') ? o.createdAt.toMillis() : 0;

            cards.push({
                kind: 'order',
                order: o,
                adminText,
                driverText,
                hasRating,
                isUrgent,
                isProblem,
                isDriver: Boolean(driverText),
                isReviewed,
                sortMs,
                searchHay: `${o.customerName || ''} ${o.customerPhone || ''} ${o.zone || ''} ${o.batchName || ''} ${adminText} ${driverText}`.toLowerCase()
            });
        });

        // 2. جمع الملاحظات اللزجة وكشكول العملاء
        custList.forEach(c => {
            if (!c) return;
            const sticky = String(c.stickyNote || '').trim();
            const notebook = String(c.notebook || '').trim();
            if (!sticky && !notebook) return;

            cards.push({
                kind: 'customer',
                customer: c,
                sticky,
                notebook,
                hasRating: false,
                isUrgent: false,
                isProblem: Boolean(c.isBlacklisted),
                isDriver: false,
                isReviewed: false,
                sortMs: (c.lastOrder && typeof c.lastOrder.toMillis === 'function') ? c.lastOrder.toMillis() : 0,
                searchHay: `${c.name || ''} ${c.phone || ''} ${c.zone || ''} ${sticky} ${notebook}`.toLowerCase()
            });
        });

        // إحصائيات سريعة للبانر العلوي
        const cAll = cards.filter(x => x.kind === 'order').length;
        const cUrgent = cards.filter(x => x.isUrgent).length;
        const cProblem = cards.filter(x => x.isProblem).length;
        const cRating = cards.filter(x => x.hasRating).length;
        const cCust = cards.filter(x => x.kind === 'customer').length;

        const statsBar = document.getElementById('notes-stats-bar');
        if (statsBar) {
            statsBar.innerHTML = `
                <span class="bg-white/10 px-2 py-0.5 rounded-lg">📋 ${cAll} طلب</span>
                ${cUrgent > 0 ? `<span class="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-lg">⚡ ${cUrgent} عاجل</span>` : ''}
                ${cProblem > 0 ? `<span class="bg-rose-500 text-white px-2 py-0.5 rounded-lg">⚠️ ${cProblem} مشكلة</span>` : ''}
                ${cRating > 0 ? `<span class="bg-emerald-500/25 text-emerald-200 px-2 py-0.5 rounded-lg">⭐️ ${cRating} تقييم</span>` : ''}
                <span class="bg-white/10 px-2 py-0.5 rounded-lg">📌 ${cCust} عميل</span>
            `;
        }

        // فلترة البطاقات حسب التبويب والبحث
        const filtered = cards.filter(item => {
            if (activeFilter === 'all' && item.kind !== 'order') return false;
            if (activeFilter === 'urgent' && !item.isUrgent) return false;
            if (activeFilter === 'problem' && !item.isProblem) return false;
            if (activeFilter === 'rating' && !item.hasRating) return false;
            if (activeFilter === 'driver' && !item.isDriver) return false;
            if (activeFilter === 'customers' && item.kind !== 'customer') return false;
            if (rawQ && !item.searchHay.includes(rawQ)) return false;
            return true;
        });

        // ترتيب الأولوية: العاجل والمشاكل أولاً ثم الأحدث زمنياً
        filtered.sort((a, b) => {
            const pA = (a.isProblem ? 2 : 0) + (a.isUrgent ? 1 : 0);
            const pB = (b.isProblem ? 2 : 0) + (b.isUrgent ? 1 : 0);
            if (pB !== pA) return pB - pA;
            return b.sortMs - a.sortMs;
        });

        if (filtered.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 font-bold bg-white rounded-2xl border-2 border-dashed border-slate-200">لا توجد ملاحظات مطابقة لهذا القسم أو البحث حالياً.</div>`;
            return;
        }

        const statusLabels = {
            new: { t: '🆕 جديد', c: 'bg-blue-50 text-blue-700 border-blue-200' },
            processing: { t: '⏳ تجهيز', c: 'bg-amber-50 text-amber-800 border-amber-200' },
            dispatched: { t: '🛵 بالطريق', c: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            deferred: { t: '📅 مؤجل', c: 'bg-orange-50 text-orange-700 border-orange-200' },
            no_answer: { t: '📵 لم يرد', c: 'bg-purple-50 text-purple-700 border-purple-200' },
            completed: { t: '✅ مكتمل', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            canceled: { t: '❌ ملغي', c: 'bg-slate-100 text-slate-500 border-slate-200' }
        };

        container.innerHTML = filtered.slice(0, 80).map(item => {
            if (item.kind === 'customer') {
                const c = item.customer;
                const safePhone = escNoteJs(c.phone || '');
                const waNum = (c.phone || '').startsWith('0') ? '2' + c.phone : (c.phone || '');
                return `
                <div class="bg-white rounded-2xl p-3.5 border border-slate-200 border-r-4 ${c.isBlacklisted ? 'border-r-red-600' : 'border-r-amber-400'} shadow-sm space-y-2.5 flex flex-col justify-between">
                    <div class="space-y-2">
                        <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                            <div class="min-w-0">
                                <h4 onclick="openCustomerCard('${safePhone}')" class="font-black text-slate-900 text-sm truncate cursor-pointer hover:text-brand-primary">${escNoteHtml(c.name || 'عميل')}</h4>
                                <p class="text-[10px] font-bold text-slate-400" dir="ltr">${escNoteHtml(c.phone || '')} ${c.zone ? '• ' + escNoteHtml(c.zone) : ''}</p>
                            </div>
                            <span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0">📌 ملف عميل</span>
                        </div>
                        ${item.sticky ? `<div class="bg-yellow-50 border border-yellow-300 rounded-xl p-2.5 text-xs font-black text-yellow-950 leading-relaxed"><i class="fa-solid fa-thumbtack text-yellow-600 ml-1"></i> ${escNoteHtml(item.sticky)}</div>` : ''}
                        ${item.notebook ? `<div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 whitespace-pre-wrap leading-relaxed"><i class="fa-solid fa-book-open text-amber-500 ml-1"></i> ${escNoteHtml(item.notebook)}</div>` : ''}
                    </div>
                    <div class="flex gap-1.5 pt-2 border-t border-slate-100">
                        <button type="button" onclick="openCustomerCard('${safePhone}')" class="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-3 rounded-xl text-[11px] font-black transition-all">فتح وتعديل الملف</button>
                        ${waNum ? `<a href="https://wa.me/${escNoteHtml(waNum)}" target="_blank" class="bg-[#25D366] hover:bg-green-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> واتساب</a>` : ''}
                    </div>
                </div>`;
            }

            // بطاقة ملاحظة طلب
            const o = item.order;
            const stInfo = statusLabels[o.status] || statusLabels.new;
            const safeOrderId = escNoteJs(o.id);
            const safePhone = escNoteJs(o.customerPhone || '');
            const primaryField = item.adminText ? 'adminNote' : 'driverNote';

            const borderAccent = item.isProblem
                ? 'border-r-4 border-r-rose-500 border-rose-200/80'
                : (item.isUrgent
                    ? 'border-r-4 border-r-amber-500 border-amber-200/80'
                    : (item.hasRating ? 'border-r-4 border-r-emerald-500 border-emerald-200/80' : 'border-r-4 border-r-slate-400 border-slate-200/80'));

            const formatChunks = (raw) => raw.split('\n---\n').filter(x => x.trim()).map(ch =>
                `<div class="bg-white/90 border border-black/5 rounded-lg p-2 text-[11px] font-bold text-slate-800 whitespace-pre-wrap leading-relaxed">${escNoteHtml(ch.trim())}</div>`
            ).join('');

            return `
            <div class="bg-white rounded-2xl p-3.5 border ${borderAccent} shadow-sm space-y-2.5 flex flex-col justify-between">
                <div class="space-y-2">
                    <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <h4 onclick="openCustomerCard('${safePhone}')" class="font-black text-slate-900 text-sm cursor-pointer hover:text-brand-primary">${escNoteHtml(o.customerName || 'عميل')}</h4>
                                ${item.isProblem ? '<span class="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded">⚠️ مشكلة/شكوى</span>' : ''}
                                ${item.isUrgent ? '<span class="bg-amber-100 text-amber-900 text-[9px] font-black px-1.5 py-0.5 rounded">⚡ عاجل</span>' : ''}
                                ${Number(o.rating) > 0 ? `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black px-1.5 py-0.5 rounded">⭐️ ${o.rating}/5</span>` : ''}
                                ${item.isReviewed ? '<span class="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded">✅ تمت المراجعة</span>' : ''}
                            </div>
                            <p class="text-[10px] font-bold text-slate-400 mt-0.5">
                                <span dir="ltr">${escNoteHtml(o.customerPhone || '')}</span> • ${escNoteHtml(o.zone || '')} ${o.batchName ? '• ' + escNoteHtml(o.batchName) : ''} • <strong class="text-brand-primary">${Number(o.total) || 0} ج</strong>
                            </p>
                        </div>
                        <span class="px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${stInfo.c}">${stInfo.t}</span>
                    </div>

                    ${item.adminText ? `
                    <div class="bg-amber-50/70 border border-amber-200/70 rounded-xl p-2 space-y-1.5">
                        <span class="text-[10px] font-black text-amber-800 block"><i class="fa-solid fa-lock ml-1"></i> ملاحظات إدارية / تقييم:</span>
                        ${formatChunks(item.adminText)}
                    </div>` : ''}

                    ${item.driverText ? `
                    <div class="bg-blue-50/70 border border-blue-200/70 rounded-xl p-2 space-y-1.5">
                        <span class="text-[10px] font-black text-blue-800 block"><i class="fa-solid fa-motorcycle ml-1"></i> ملاحظات المندوب:</span>
                        ${formatChunks(item.driverText)}
                    </div>` : ''}
                </div>

                <div class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button type="button" onclick="quickReplyNoteFromHub('${safeOrderId}', '${primaryField}')" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-colors flex items-center justify-center gap-1">
                        <i class="fa-solid fa-reply text-indigo-600"></i> إضافة رد
                    </button>
                    ${!item.isReviewed ? `
                    <button type="button" onclick="markOrderNoteReviewedInHub('${safeOrderId}', '${primaryField}')" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-check"></i> تمت المراجعة
                    </button>` : ''}
                    <button type="button" onclick="openEditOrderModal('${safeOrderId}')" class="bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-colors">
                        <i class="fa-solid fa-pen text-amber-300"></i> الطلب
                    </button>
                    <button type="button" onclick="sendMessageToCustomer('${safePhone}', '${safeOrderId}')" class="bg-[#25D366] hover:bg-green-600 text-white py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-colors" title="واتساب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    };

    // ربط آمن للتنقل والتحديث اللحظي عند فتح "إعدادات المتجر" أو "مركز الملاحظات"
    const _prevSwitchTabSettings = window.switchTab;
    if (typeof _prevSwitchTabSettings === 'function') {
        window.switchTab = function (tabId, btnElement, isFromBackButton) {
            _prevSwitchTabSettings(tabId, btnElement, isFromBackButton);
            if (tabId === 'settings') window.renderSettingsUI();
            if (tabId === 'notes') window.renderNotesUI();
        };
    }

    const _prevSchedRenderSettings = window.scheduleSystemRender;
    window.scheduleSystemRender = function () {
        if (typeof _prevSchedRenderSettings === 'function') {
            _prevSchedRenderSettings();
        }
        const notesView = document.getElementById('view-notes');
        if (notesView && notesView.classList.contains('active')) {
            window.renderNotesUI();
        }
    };

    // =========================================================================
    // 📷 9. استوديو الصور الذكي HD (قص وتكبير باليد + حفظ جودة عالية + ترتيب الكتالوج)
    // =========================================================================
    let pendingUploadProductId = null;

    window.saveImgBBKeyLocal = function (val) {
        const clean = String(val || '').trim();
        try {
            if (clean) localStorage.setItem('sman_imgbb_api_key', clean);
            else localStorage.removeItem('sman_imgbb_api_key');
        } catch (e) {}
        if (clean && typeof window.showToast === 'function') {
            window.showToast('🔑 تم حفظ مفتاح ImgBB على جهازك بأمان');
        }
    };

    function getSavedImgBBKey() {
        const inpVal = document.getElementById('st-imgbb-key')?.value?.trim();
        if (inpVal) return inpVal;
        try { return (localStorage.getItem('sman_imgbb_api_key') || '').trim(); } catch (e) { return ''; }
    }

    // قراءة ملف الصورة كعنصر Image بدقة كاملة
    function loadImageElementFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
            reader.onload = (ev) => {
                const img = new Image();
                img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة'));
                img.onload = () => resolve(img);
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // دالة رسم الصورة على Canvas بجودة فائقة (HD 1200px للمنتجات / 1600px للكتالوج بدون تكسير)
    function renderHighQualityCanvasBase64(img, opts) {
        const cfg = opts || {};
        const mode = cfg.mode || 'product';
        const enhance = cfg.enhance !== false;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (mode === 'product') {
            const outSize = 1200; // دقة عالية تحافظ على حدة تفاصيل السمان والاستيكر
            canvas.width = outSize;
            canvas.height = outSize;
            ctx.fillStyle = '#faf8f3';
            ctx.fillRect(0, 0, outSize, outSize);

            const fitMode = cfg.fitMode || (localStorage.getItem('sman_img_fit_mode') || 'cover');
            const zoom = Math.max(0.85, Math.min(3.2, Number(cfg.zoom) || 1));
            const offsetXRatio = Number(cfg.offsetXRatio) || 0; // نسبة الإزاحة بالنسبة لحجم الإطار
            const offsetYRatio = Number(cfg.offsetYRatio) || 0;
            const rotDeg = ((Number(cfg.rotation) || 0) % 360 + 360) % 360;
            const swapDims = (rotDeg === 90 || rotDeg === 270);
            const effW = swapDims ? img.height : img.width;
            const effH = swapDims ? img.width : img.height;

            const baseScale = (fitMode === 'contain')
                ? Math.min((outSize - 24) / effW, (outSize - 24) / effH)
                : Math.max(outSize / effW, outSize / effH);

            const finalScale = baseScale * zoom;

            ctx.save();
            if (enhance && 'filter' in ctx) {
                ctx.filter = 'contrast(1.04) saturate(1.06) brightness(1.02)';
            }
            ctx.translate((outSize / 2) + (offsetXRatio * outSize), (outSize / 2) + (offsetYRatio * outSize));
            if (rotDeg !== 0) ctx.rotate((rotDeg * Math.PI) / 180);
            ctx.scale(finalScale, finalScale);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.restore();

            return canvas.toDataURL('image/jpeg', 0.94).split(',')[1];
        }

        // صور الكتالوج: نحافظ على الأبعاد الطبيعية بدقة عالية تصل إلى 1600px
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        if (enhance && 'filter' in ctx) {
            ctx.filter = 'contrast(1.03) saturate(1.05) brightness(1.01)';
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.93).split(',')[1];
    }

    async function compressAndFormatImage(file, mode) {
        const img = await loadImageElementFromFile(file);
        return renderHighQualityCanvasBase64(img, {
            mode,
            fitMode: localStorage.getItem('sman_img_fit_mode') || 'cover',
            zoom: 1,
            offsetXRatio: 0,
            offsetYRatio: 0,
            rotation: 0,
            enhance: true
        });
    }

    async function uploadBase64ToImgBB(base64Str) {
        const apiKey = getSavedImgBBKey();
        if (!apiKey) {
            throw new Error('NO_KEY');
        }
        const formData = new FormData();
        formData.append('image', base64Str);

        const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            body: formData
        });
        const json = await res.json();
        if (!res.ok || !json || !json.success || !json.data) {
            throw new Error(json?.error?.message || 'فشل الرفع على ImgBB — تأكد من صحة المفتاح');
        }
        return json.data.display_url || json.data.url;
    }

    // -------------------------------------------------------------------------
    // استوديو القص والتكبير التفاعلي السريع قبل الرفع (Smart Crop & Zoom Studio)
    // -------------------------------------------------------------------------
    const cropStudioState = {
        img: null,
        prodId: null,
        fitMode: 'cover',
        zoom: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
        rotation: 0,
        enhance: true
    };

    function ensureSmartCropModal() {
        let modal = document.getElementById('sman-crop-studio-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'sman-crop-studio-modal';
        modal.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[260] hidden flex items-center justify-center p-3';
        modal.innerHTML = `
            <div class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 max-h-[94vh] flex flex-col">
                <div class="bg-gradient-to-l from-[#042f2e] via-[#064e3b] to-slate-900 text-white px-4 py-3.5 flex items-center justify-between shrink-0">
                    <div>
                        <h3 class="text-sm font-black text-white flex items-center gap-2">
                            <i class="fa-solid fa-crop-simple text-amber-400"></i>
                            <span>تظبيط وقص صورة الصنف (HD)</span>
                        </h3>
                        <p id="sc-prod-subtitle" class="text-[10px] font-bold text-emerald-200 mt-0.5">اسحب الصورة بإصبعك وكبّر حتى يملأ الطبق الكادر بوضوح</p>
                    </div>
                    <button type="button" onclick="closeSmartCropModal()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-rose-500 text-white flex items-center justify-center">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="p-4 space-y-3 overflow-y-auto flex-1 bg-slate-50/80">
                    <!-- مربع المعاينة التفاعلي (سحب باليد + تكبير بإصبعين) -->
                    <div class="relative w-full max-w-[310px] aspect-square mx-auto rounded-2xl overflow-hidden border-2 border-emerald-700/40 shadow-md bg-[#faf8f3] select-none" style="touch-action: none;">
                        <canvas id="sc-preview-canvas" width="620" height="620" class="w-full h-full block cursor-grab active:cursor-grabbing"></canvas>
                        <!-- شبكة إرشاد خفيفة للتوسيط -->
                        <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25">
                            <div class="border-l border-b border-white/80"></div>
                            <div class="border-l border-b border-white/80"></div>
                            <div class="border-b border-white/80"></div>
                            <div class="border-l border-b border-white/80"></div>
                            <div class="border-l border-b border-white/80"></div>
                            <div class="border-b border-white/80"></div>
                            <div class="border-l border-white/80"></div>
                            <div class="border-l border-white/80"></div>
                            <div></div>
                        </div>
                        <span class="pointer-events-none absolute bottom-2 right-2 bg-black/60 text-white text-[9px] font-black px-2 py-0.5 rounded-lg">✋ اسحب للتحريك</span>
                    </div>

                    <!-- شريط التكبير (Zoom Slider) -->
                    <div class="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5">
                        <div class="flex items-center justify-between text-[11px] font-black text-slate-700">
                            <span><i class="fa-solid fa-magnifying-glass-plus text-emerald-600 ml-1"></i> التكبير والتقريب:</span>
                            <span id="sc-zoom-badge" class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg" dir="ltr">100%</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="stepSmartCropZoom(-0.15)" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm shrink-0">−</button>
                            <input type="range" id="sc-zoom-range" min="1" max="3" step="0.02" value="1" oninput="setSmartCropZoom(this.value)" class="flex-1 accent-emerald-600 cursor-pointer">
                            <button type="button" onclick="stepSmartCropZoom(0.15)" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm shrink-0">+</button>
                        </div>

                        <!-- أزرار التحكم السريعة -->
                        <div class="grid grid-cols-3 gap-1.5 pt-1">
                            <button type="button" id="sc-mode-cover-btn" onclick="setSmartCropFitMode('cover')" class="py-1.5 px-2 rounded-xl text-[10px] font-black border transition-all bg-emerald-600 text-white border-emerald-600 shadow-sm">
                                🎯 ملء الكادر
                            </button>
                            <button type="button" id="sc-mode-contain-btn" onclick="setSmartCropFitMode('contain')" class="py-1.5 px-2 rounded-xl text-[10px] font-black border transition-all bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100">
                                🖼️ كامل الصورة
                            </button>
                            <button type="button" onclick="rotateSmartCrop90()" class="py-1.5 px-2 rounded-xl text-[10px] font-black border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-all">
                                🔄 تدوير 90°
                            </button>
                        </div>

                        <label class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 cursor-pointer text-[11px] font-black text-slate-700">
                            <span>✨ تحسين الوضوح والإضاءة تلقائياً (جودة HD)</span>
                            <input type="checkbox" id="sc-enhance-cb" checked onchange="toggleSmartCropEnhance(this.checked)" class="w-4 h-4 accent-emerald-600 rounded">
                        </label>
                    </div>
                </div>

                <div class="p-3.5 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                    <button type="button" id="sc-confirm-upload-btn" onclick="confirmSmartCropAndUpload()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                        <span>اعتماد ورفع بجودة عالية</span>
                    </button>
                    <button type="button" onclick="closeSmartCropModal()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-4 py-3 rounded-xl text-xs">إلغاء</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // ربط السحب باليد والماوس والتكبير بإصبعين على كانفاس المعاينة
        const canvas = modal.querySelector('#sc-preview-canvas');
        if (canvas) {
            const activePtrs = new Map();
            let lastCenter = null;
            let lastPinchDist = 0;

            canvas.addEventListener('pointerdown', (e) => {
                canvas.setPointerCapture(e.pointerId);
                activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (activePtrs.size === 1) {
                    lastCenter = { x: e.clientX, y: e.clientY };
                    lastPinchDist = 0;
                } else if (activePtrs.size === 2) {
                    const pts = Array.from(activePtrs.values());
                    lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                    lastCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
                }
            });

            canvas.addEventListener('pointermove', (e) => {
                if (!activePtrs.has(e.pointerId) || !cropStudioState.img) return;
                activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
                const rect = canvas.getBoundingClientRect();
                const cw = rect.width || 300;
                const ch = rect.height || 300;

                if (activePtrs.size === 1 && lastCenter) {
                    const dx = (e.clientX - lastCenter.x) / cw;
                    const dy = (e.clientY - lastCenter.y) / ch;
                    cropStudioState.offsetXRatio = Math.max(-0.85, Math.min(0.85, cropStudioState.offsetXRatio + dx));
                    cropStudioState.offsetYRatio = Math.max(-0.85, Math.min(0.85, cropStudioState.offsetYRatio + dy));
                    lastCenter = { x: e.clientX, y: e.clientY };
                    drawSmartCropPreview();
                } else if (activePtrs.size === 2) {
                    const pts = Array.from(activePtrs.values());
                    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                    const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
                    if (lastPinchDist > 0) {
                        const scaleFactor = dist / lastPinchDist;
                        cropStudioState.zoom = Math.max(1, Math.min(3, cropStudioState.zoom * scaleFactor));
                        const rng = document.getElementById('sc-zoom-range');
                        if (rng) rng.value = cropStudioState.zoom.toFixed(2);
                    }
                    if (lastCenter) {
                        cropStudioState.offsetXRatio = Math.max(-0.85, Math.min(0.85, cropStudioState.offsetXRatio + (center.x - lastCenter.x) / cw));
                        cropStudioState.offsetYRatio = Math.max(-0.85, Math.min(0.85, cropStudioState.offsetYRatio + (center.y - lastCenter.y) / ch));
                    }
                    lastPinchDist = dist;
                    lastCenter = center;
                    drawSmartCropPreview();
                }
            });

            const releasePtr = (e) => {
                activePtrs.delete(e.pointerId);
                if (activePtrs.size === 1) {
                    const p = Array.from(activePtrs.values())[0];
                    lastCenter = { x: p.x, y: p.y };
                    lastPinchDist = 0;
                } else if (activePtrs.size === 0) {
                    lastCenter = null;
                    lastPinchDist = 0;
                }
            };
            canvas.addEventListener('pointerup', releasePtr);
            canvas.addEventListener('pointercancel', releasePtr);
        }

        return modal;
    }

    function drawSmartCropPreview() {
        const canvas = document.getElementById('sc-preview-canvas');
        const img = cropStudioState.img;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        const size = canvas.width;

        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#faf8f3';
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const rotDeg = ((cropStudioState.rotation || 0) % 360 + 360) % 360;
        const swapDims = (rotDeg === 90 || rotDeg === 270);
        const effW = swapDims ? img.height : img.width;
        const effH = swapDims ? img.width : img.height;

        const baseScale = (cropStudioState.fitMode === 'contain')
            ? Math.min((size - 16) / effW, (size - 16) / effH)
            : Math.max(size / effW, size / effH);
        const finalScale = baseScale * cropStudioState.zoom;

        ctx.save();
        if (cropStudioState.enhance && 'filter' in ctx) {
            ctx.filter = 'contrast(1.04) saturate(1.06) brightness(1.02)';
        }
        ctx.translate((size / 2) + (cropStudioState.offsetXRatio * size), (size / 2) + (cropStudioState.offsetYRatio * size));
        if (rotDeg !== 0) ctx.rotate((rotDeg * Math.PI) / 180);
        ctx.scale(finalScale, finalScale);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();

        const zBadge = document.getElementById('sc-zoom-badge');
        if (zBadge) zBadge.textContent = `${Math.round(cropStudioState.zoom * 100)}%`;

        const btnCover = document.getElementById('sc-mode-cover-btn');
        const btnContain = document.getElementById('sc-mode-contain-btn');
        if (btnCover && btnContain) {
            const isCover = cropStudioState.fitMode === 'cover';
            btnCover.className = `py-1.5 px-2 rounded-xl text-[10px] font-black border transition-all ${isCover ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`;
            btnContain.className = `py-1.5 px-2 rounded-xl text-[10px] font-black border transition-all ${!isCover ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`;
        }
    }

    window.setSmartCropZoom = function (val) {
        cropStudioState.zoom = Math.max(1, Math.min(3, parseFloat(val) || 1));
        drawSmartCropPreview();
    };

    window.stepSmartCropZoom = function (delta) {
        const next = Math.max(1, Math.min(3, Number((cropStudioState.zoom + delta).toFixed(2))));
        cropStudioState.zoom = next;
        const rng = document.getElementById('sc-zoom-range');
        if (rng) rng.value = String(next);
        drawSmartCropPreview();
    };

    window.setSmartCropFitMode = function (mode) {
        cropStudioState.fitMode = (mode === 'contain') ? 'contain' : 'cover';
        cropStudioState.zoom = 1;
        cropStudioState.offsetXRatio = 0;
        cropStudioState.offsetYRatio = 0;
        const rng = document.getElementById('sc-zoom-range');
        if (rng) rng.value = '1';
        drawSmartCropPreview();
    };

    window.rotateSmartCrop90 = function () {
        cropStudioState.rotation = (cropStudioState.rotation + 90) % 360;
        cropStudioState.offsetXRatio = 0;
        cropStudioState.offsetYRatio = 0;
        drawSmartCropPreview();
    };

    window.toggleSmartCropEnhance = function (checked) {
        cropStudioState.enhance = Boolean(checked);
        drawSmartCropPreview();
    };

    window.closeSmartCropModal = function () {
        const modal = document.getElementById('sman-crop-studio-modal');
        if (modal) modal.classList.add('hidden');
        cropStudioState.img = null;
        cropStudioState.prodId = null;
        pendingUploadProductId = null;
    };

    window.confirmSmartCropAndUpload = async function () {
        const prodId = cropStudioState.prodId;
        const img = cropStudioState.img;
        if (!prodId || !img || !storeProducts[prodId]) return;

        const saveBtn = document.getElementById('sc-confirm-upload-btn');
        const origHtml = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الرفع بجودة عالية...';
        }

        try {
            const base64 = renderHighQualityCanvasBase64(img, {
                mode: 'product',
                fitMode: cropStudioState.fitMode,
                zoom: cropStudioState.zoom,
                offsetXRatio: cropStudioState.offsetXRatio,
                offsetYRatio: cropStudioState.offsetYRatio,
                rotation: cropStudioState.rotation,
                enhance: cropStudioState.enhance
            });

            const directUrl = await uploadBase64ToImgBB(base64);
            storeProducts[prodId].images = [directUrl];
            const urlInp = document.getElementById(`prod-img-inp-${prodId}`);
            if (urlInp) urlInp.value = directUrl;

            await window.saveAllSettings(true);
            window.closeSmartCropModal();
            if (typeof window.showToast === 'function') {
                window.showToast(`✅ تم قص ورفع صورة (${storeProducts[prodId].name}) بجودة HD بنجاح!`);
            }
        } catch (err) {
            alert(err.message === 'NO_KEY' ? 'يرجى وضع مفتاح ImgBB أولاً في إعدادات المتجر.' : ('خطأ في رفع الصورة: ' + err.message));
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = origHtml;
            }
        }
    };

    // 1. رفع صورة لصنف معين من شاشة الأصناف والأسعار (يفتح استوديو القص والتكبير تلقائياً)
    window.triggerProductImageUpload = function (prodId) {
        if (!getSavedImgBBKey()) {
            alert('🔑 ضع مفتاح ImgBB API أولاً في شاشة (إعدادات المتجر -> استوديو الصور) ثم أعد المحاولة.');
            return;
        }
        pendingUploadProductId = prodId;
        const fileInp = document.getElementById('sman-hidden-product-file');
        if (fileInp) {
            fileInp.value = '';
            fileInp.click();
        }
    };

    window.handleProductImageFileSelected = async function (event) {
        const file = event?.target?.files?.[0];
        const prodId = pendingUploadProductId;
        if (!file || !prodId || !storeProducts[prodId]) return;

        try {
            const img = await loadImageElementFromFile(file);
            ensureSmartCropModal();

            const savedMode = localStorage.getItem('sman_img_fit_mode') || 'cover';
            cropStudioState.img = img;
            cropStudioState.prodId = prodId;
            cropStudioState.fitMode = (savedMode === 'contain') ? 'contain' : 'cover';
            cropStudioState.zoom = 1;
            cropStudioState.offsetXRatio = 0;
            cropStudioState.offsetYRatio = 0;
            cropStudioState.rotation = 0;
            cropStudioState.enhance = true;

            const sub = document.getElementById('sc-prod-subtitle');
            if (sub) sub.textContent = `الصنف: ${storeProducts[prodId].name || ''} — اسحب وكبّر حتى يملأ الطبق الكادر`;
            const rng = document.getElementById('sc-zoom-range');
            if (rng) rng.value = '1';
            const cb = document.getElementById('sc-enhance-cb');
            if (cb) cb.checked = true;

            document.getElementById('sman-crop-studio-modal').classList.remove('hidden');
            drawSmartCropPreview();
        } catch (err) {
            alert('خطأ في قراءة الصورة: ' + (err.message || err));
            pendingUploadProductId = null;
        }
    };

    // 2. إدارة وترتيب ورفع صور الكتالوج ("من مزرعتنا على الطبيعة") بدون حذف القديم
    window.moveGalleryImage = async function (idx, direction) {
        if (!Array.isArray(storeSettings.galleryImages)) return;
        const imgs = storeSettings.galleryImages;
        if (idx < 0 || idx >= imgs.length) return;

        if (direction === 'first') {
            if (idx === 0) return;
            const [picked] = imgs.splice(idx, 1);
            imgs.unshift(picked);
        } else {
            const targetIdx = idx + Number(direction);
            if (targetIdx < 0 || targetIdx >= imgs.length) return;
            const temp = imgs[idx];
            imgs[idx] = imgs[targetIdx];
            imgs[targetIdx] = temp;
        }

        window.renderGalleryStudioUI();
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(direction === 'first' ? '⭐ تم تعيين الصورة لتكون الأولى في الكتالوج!' : '✅ تم تحديث ترتيب صور الكتالوج بنجاح');
        }
    };

    window.renderGalleryStudioUI = function () {
        const keyInp = document.getElementById('st-imgbb-key');
        if (keyInp && !keyInp.value) {
            try { keyInp.value = localStorage.getItem('sman_imgbb_api_key') || ''; } catch (e) {}
        }
        const fitSel = document.getElementById('st-img-fit-mode');
        if (fitSel) {
            try { fitSel.value = localStorage.getItem('sman_img_fit_mode') || 'cover'; } catch (e) {}
        }

        const grid = document.getElementById('st-gallery-images-grid');
        if (!grid) return;

        const imgs = Array.isArray(storeSettings.galleryImages) ? storeSettings.galleryImages.filter(Boolean) : [];
        if (imgs.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center py-5 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا توجد صور في الكتالوج حالياً — اضغط (رفع صورة للكتالوج) للبدء.</div>';
            return;
        }

        grid.innerHTML = imgs.map((url, idx) => `
            <div class="relative aspect-square rounded-xl overflow-hidden border-2 ${idx === 0 ? 'border-amber-400 shadow-md' : 'border-slate-200 shadow-sm'} bg-slate-100 group">
                <img src="${escSettingsHtml(url)}" alt="كتالوج ${idx + 1}" class="w-full h-full object-cover">
                <span class="absolute top-1 right-1 ${idx === 0 ? 'bg-amber-400 text-slate-950' : 'bg-black/65 text-white'} text-[9px] font-black px-1.5 py-0.5 rounded-md shadow">
                    ${idx === 0 ? '⭐ 1 (الأولى)' : (idx + 1)}
                </span>
                <button type="button" onclick="removeGalleryImage(${idx})" title="حذف الصورة" class="absolute top-1 left-1 w-6 h-6 rounded-lg bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center text-[10px] shadow">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-1 flex items-center justify-between gap-1">
                    <button type="button" onclick="moveGalleryImage(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="تقديم خطوة للأول" class="w-6 h-6 rounded-md bg-white/90 hover:bg-amber-400 text-slate-900 disabled:opacity-30 flex items-center justify-center text-[10px] font-black transition-colors">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                    ${idx > 0 ? `
                    <button type="button" onclick="moveGalleryImage(${idx}, 'first')" title="اجعلها أول صورة في الكتالوج" class="flex-1 h-6 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 text-[9px] font-black px-1 truncate shadow-sm transition-colors">
                        ⭐ الأولى
                    </button>` : `<span class="flex-1 text-center text-[9px] font-black text-amber-300">الغلاف</span>`}
                    <button type="button" onclick="moveGalleryImage(${idx}, 1)" ${idx === imgs.length - 1 ? 'disabled' : ''} title="تأخير خطوة" class="w-6 h-6 rounded-md bg-white/90 hover:bg-amber-400 text-slate-900 disabled:opacity-30 flex items-center justify-center text-[10px] font-black transition-colors">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                </div>
            </div>
        `).join('');
    };

    window.triggerGalleryImageUpload = function () {
        if (!getSavedImgBBKey()) {
            alert('🔑 الصق مفتاح ImgBB API في الخانة بالأعلى أولاً ثم اضغط رفع صورة.');
            return;
        }
        const fileInp = document.getElementById('sman-hidden-gallery-file');
        if (fileInp) {
            fileInp.value = '';
            fileInp.click();
        }
    };

    window.handleGalleryImageFileSelected = async function (event) {
        const file = event?.target?.files?.[0];
        if (!file) return;

        const btn = document.getElementById('btn-upload-gallery-img');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الرفع بجودة عالية...';
            btn.disabled = true;
        }

        try {
            const base64 = await compressAndFormatImage(file, 'gallery');
            const directUrl = await uploadBase64ToImgBB(base64);

            if (!Array.isArray(storeSettings.galleryImages)) storeSettings.galleryImages = [];
            storeSettings.galleryImages.push(directUrl);

            window.renderGalleryStudioUI();
            await window.saveAllSettings(true);
            if (typeof window.showToast === 'function') {
                window.showToast('✅ تمت إضافة الصورة للكتالوج بجودة عالية!');
            }
        } catch (err) {
            alert('خطأ في رفع صورة الكتالوج: ' + err.message);
        } finally {
            if (btn) {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }
        }
    };

    window.removeGalleryImage = async function (idx) {
        if (!Array.isArray(storeSettings.galleryImages)) return;
        const ok = (typeof window.execConfirm === 'function')
            ? await window.execConfirm('هل تريد حذف هذه الصورة من معرض الكتالوج؟', { title: 'حذف صورة', tone: 'danger', confirmText: 'نعم، احذف' })
            : confirm('هل تريد حذف هذه الصورة من معرض الكتالوج؟');
        if (!ok) return;

        storeSettings.galleryImages.splice(idx, 1);
        window.renderGalleryStudioUI();
        await window.saveAllSettings(true);
    };

    window.addManualGalleryImage = async function () {
        const url = (typeof window.execPrompt === 'function')
            ? await window.execPrompt('أدخل رابط الصورة أو اسم الملف (مثال: all-sizes.jpg):', '', { title: 'إضافة صورة للكتالوج', tone: 'brand', confirmText: 'إضافة' })
            : prompt('أدخل رابط الصورة أو اسم الملف:');
        if (!url || !url.trim()) return;

        if (!Array.isArray(storeSettings.galleryImages)) storeSettings.galleryImages = [];
        storeSettings.galleryImages.push(url.trim());
        window.renderGalleryStudioUI();
        await window.saveAllSettings(true);
    };

    // =========================================================================
    // 🎟️ 10. لوحة إدارة الكوبونات وأكواد الخصم (مربوطة مباشرة مع متجر العملاء)
    // =========================================================================
    window.renderPromoCodesStudioUI = function () {
        const storePanel = document.getElementById('st-panel-store');
        if (!storePanel) return;

        let card = document.getElementById('st-promo-codes-studio-card');
        if (!card) {
            card = document.createElement('div');
            card.id = 'st-promo-codes-studio-card';
            card.className = 'bg-white rounded-2xl p-4 sm:p-5 border-2 border-amber-200/80 shadow-soft space-y-4';
            storePanel.appendChild(card);
        }

        const showPromoField = storeSettings.showPromoField !== false;
        const promos = Array.isArray(storeSettings.promoCodes) ? storeSettings.promoCodes : [];
        const todayStart = new Date(new Date().toDateString()).getTime();

        const listHtml = promos.length === 0
            ? `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا توجد أكواد خصم مسجلة حالياً — اضغط (+ كوبون جديد) لإنشاء أول كود.</div>`
            : promos.map((p, idx) => {
                if (!p) return '';
                const codeStr = String(p.code || '').toUpperCase();
                const isExpired = Boolean(p.expiryDate && new Date(p.expiryDate).getTime() < todayStart);
                const isPaused = Boolean(p.isPaused);
                const isExhausted = !isPaused && p.usesLeft !== null && p.usesLeft !== undefined && Number(p.usesLeft) <= 0;

                let statusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px] font-black">🟢 شغال</span>';
                if (isPaused) statusBadge = '<span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md text-[10px] font-black">⏸️ متوقف</span>';
                else if (isExpired) statusBadge = '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md text-[10px] font-black">🔴 منتهي الصلاحية</span>';
                else if (isExhausted) statusBadge = '<span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-black">🔒 مستهلك بالكامل</span>';

                let valueLabel = `خصم ${Number(p.discount) || 0} ج.م`;
                if (p.type === 'free_delivery') valueLabel = '🚚 توصيل مجاني';
                else if (p.type === 'percent') valueLabel = `خصم ${Number(p.discount) || 0}%`;

                const usesText = (p.usesLeft === null || p.usesLeft === undefined)
                    ? 'غير محدود'
                    : (isPaused ? `متوقف (كان متبقي: ${p.pausedUsesLeft === null || p.pausedUsesLeft === undefined ? 'غير محدود' : p.pausedUsesLeft})` : `متبقي: ${p.usesLeft}`);

                return `
                <div class="bg-slate-50/90 border ${isPaused || isExpired || isExhausted ? 'border-slate-200 opacity-80' : 'border-amber-200'} rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                    <div class="space-y-1 min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="bg-slate-900 text-amber-300 px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wider" dir="ltr">${escSettingsHtml(codeStr)}</span>
                            <span class="bg-white border border-amber-200 text-amber-900 px-2 py-0.5 rounded-md text-[10px] font-black">${valueLabel}</span>
                            ${statusBadge}
                            ${p.isAuto ? '<span class="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-md text-[9px] font-black">VIP تلقائي</span>' : ''}
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                            <span>🔢 الاستخدام: <strong class="text-slate-700">${usesText}</strong></span>
                            ${Number(p.minOrder) > 0 ? `<span>• 🛒 حد أدنى: <strong class="text-slate-700">${p.minOrder} ج</strong></span>` : ''}
                            ${p.expiryDate ? `<span>• 📅 ينتهي: <strong class="text-slate-700" dir="ltr">${escSettingsHtml(p.expiryDate)}</strong></span>` : ''}
                            ${p.customerPhone ? `<span>• 📱 لرقم: <strong class="text-indigo-700" dir="ltr">${escSettingsHtml(p.customerPhone)}</strong></span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" onclick="copyPromoCodeQuick('${escSettingsHtml(codeStr)}')" title="نسخ الكود" class="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-800 hover:text-white flex items-center justify-center text-xs transition-colors">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                        <button type="button" onclick="togglePromoCodePause(${idx})" class="px-2.5 h-8 rounded-xl text-[10px] font-black border transition-colors ${isPaused ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-500 hover:text-white'}">
                            ${isPaused ? '▶️ تشغيل' : '⏸️ إيقاف'}
                        </button>
                        <button type="button" onclick="deletePromoCodeItem(${idx})" title="حذف الكود" class="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white flex items-center justify-center text-xs transition-colors">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');

        card.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-amber-100">
                <div>
                    <h4 class="font-black text-amber-950 text-sm flex items-center gap-2">
                        <i class="fa-solid fa-ticket text-amber-500"></i> إدارة الكوبونات وأكواد الخصم
                    </h4>
                    <p class="text-[10px] font-bold text-slate-500 mt-0.5">أنشئ أكواد خصم (مبلغ ثابت أو نسبة أو توصيل مجاني) وتتحكم في إيقافها فوراً.</p>
                </div>
                <div class="flex items-center gap-2">
                    <label class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-slate-700 cursor-pointer">
                        <input type="checkbox" ${showPromoField ? 'checked' : ''} onchange="toggleStorePromoFieldVisibility(this.checked)" class="w-3.5 h-3.5 accent-amber-500 rounded">
                        <span>إظهار بالمتجر</span>
                    </label>
                    <button type="button" onclick="toggleNewPromoFormBox()" class="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black shadow-sm flex items-center gap-1 active:scale-95">
                        <i class="fa-solid fa-plus"></i> كوبون جديد
                    </button>
                </div>
            </div>

            <!-- نموذج إنشاء كوبون جديد -->
            <div id="st-new-promo-form-box" class="hidden bg-amber-50/60 border border-amber-200 rounded-2xl p-3 space-y-2.5">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label class="text-[10px] font-black text-slate-600 block mb-1">كود الخصم *</label>
                        <div class="flex gap-1">
                            <input type="text" id="np-code" dir="ltr" placeholder="مثال: SMAN20" class="flex-1 min-w-0 border border-amber-300 rounded-xl px-2.5 py-2 text-xs font-black uppercase bg-white outline-none text-left">
                            <button type="button" onclick="document.getElementById('np-code').value='SMAN'+Math.floor(10+Math.random()*90)" title="توليد كود عشوائي" class="w-9 h-9 rounded-xl bg-white border border-amber-300 text-amber-700 hover:bg-amber-500 hover:text-white flex items-center justify-center shrink-0"><i class="fa-solid fa-dice text-xs"></i></button>
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-600 block mb-1">نوع الخصم</label>
                        <select id="np-type" onchange="document.getElementById('np-val-wrap').classList.toggle('opacity-40', this.value==='free_delivery'); document.getElementById('np-value').disabled=(this.value==='free_delivery');" class="w-full border border-amber-300 rounded-xl p-2 text-xs font-black bg-white outline-none">
                            <option value="fixed">💵 مبلغ ثابت (ج.م)</option>
                            <option value="percent">📊 نسبة مئوية (%)</option>
                            <option value="free_delivery">🚚 توصيل مجاني</option>
                        </select>
                    </div>
                    <div id="np-val-wrap">
                        <label class="text-[10px] font-black text-slate-600 block mb-1">قيمة الخصم</label>
                        <input type="number" id="np-value" min="0" placeholder="مثال: 20" class="w-full border border-amber-300 rounded-xl p-2 text-xs font-black bg-white text-center outline-none">
                    </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">حد أدنى للطلب (ج)</label>
                        <input type="number" id="np-min-order" min="0" placeholder="0 (بدون)" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white text-center outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">عدد الاستخدامات</label>
                        <input type="number" id="np-uses" min="1" placeholder="فارغ = مفتوح" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white text-center outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">تاريخ الانتهاء</label>
                        <input type="date" id="np-expiry" class="w-full border border-slate-200 rounded-xl p-2 text-[11px] font-bold bg-white outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 block mb-1">لرقم عميل محدد</label>
                        <input type="tel" id="np-phone" dir="ltr" placeholder="اختياري" class="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white text-left outline-none">
                    </div>
                </div>

                <div class="flex justify-end gap-2 pt-1">
                    <button type="button" onclick="toggleNewPromoFormBox()" class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-black">إلغاء</button>
                    <button type="button" onclick="saveNewPromoCodeFromUI()" class="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-700 text-white text-xs font-black shadow-sm flex items-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-check text-amber-400"></i> حفظ وتفعيل الكوبون
                    </button>
                </div>
            </div>

            <div class="space-y-2">${listHtml}</div>
        `;
    };

    window.toggleNewPromoFormBox = function () {
        const box = document.getElementById('st-new-promo-form-box');
        if (box) box.classList.toggle('hidden');
    };

    window.toggleStorePromoFieldVisibility = async function (checked) {
        storeSettings.showPromoField = Boolean(checked);
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(checked ? '✅ تم إظهار خانة كود الخصم في المتجر' : '🚫 تم إخفاء خانة كود الخصم من المتجر');
        }
    };

    window.saveNewPromoCodeFromUI = async function () {
        const code = String(document.getElementById('np-code')?.value || '').trim().toUpperCase();
        const type = document.getElementById('np-type')?.value || 'fixed';
        const val = parseFloat(document.getElementById('np-value')?.value) || 0;
        const minOrder = parseFloat(document.getElementById('np-min-order')?.value) || 0;
        const usesRaw = String(document.getElementById('np-uses')?.value || '').trim();
        const usesLeft = usesRaw === '' ? null : Math.max(1, parseInt(usesRaw, 10) || 1);
        const expiryDate = String(document.getElementById('np-expiry')?.value || '').trim();
        const customerPhone = String(document.getElementById('np-phone')?.value || '').trim();

        if (!code || code.length < 2) return alert('يرجى كتابة كود الخصم (حرفين على الأقل).');
        if (type !== 'free_delivery' && val <= 0) return alert('يرجى إدخال قيمة خصم صحيحة أكبر من صفر.');

        if (!Array.isArray(storeSettings.promoCodes)) storeSettings.promoCodes = [];
        const exists = storeSettings.promoCodes.some(p => p && String(p.code || '').toUpperCase() === code);
        if (exists) return alert('هذا الكود موجود بالفعل! اختر اسماً آخر أو احذف القديم.');

        storeSettings.promoCodes.unshift({
            code,
            type,
            discount: type === 'free_delivery' ? 0 : val,
            minOrder,
            usesLeft,
            expiryDate,
            customerPhone,
            isPaused: false,
            isAuto: false
        });

        window.renderPromoCodesStudioUI();
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(`🎟️ تم إنشاء وتفعيل الكوبون (${code}) بنجاح!`);
        }
    };

    window.togglePromoCodePause = async function (idx) {
        if (!Array.isArray(storeSettings.promoCodes) || !storeSettings.promoCodes[idx]) return;
        const p = storeSettings.promoCodes[idx];
        if (!p.isPaused) {
            p.pausedUsesLeft = p.usesLeft !== undefined ? p.usesLeft : null;
            p.usesLeft = 0;
            p.isPaused = true;
        } else {
            p.usesLeft = p.pausedUsesLeft !== undefined ? p.pausedUsesLeft : null;
            delete p.pausedUsesLeft;
            p.isPaused = false;
        }
        window.renderPromoCodesStudioUI();
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(p.isPaused ? `⏸️ تم إيقاف الكوبون (${p.code}) مؤقتاً` : `▶️ تم إعادة تشغيل الكوبون (${p.code})`);
        }
    };

    window.deletePromoCodeItem = async function (idx) {
        if (!Array.isArray(storeSettings.promoCodes) || !storeSettings.promoCodes[idx]) return;
        const code = storeSettings.promoCodes[idx].code || '';
        const ok = (typeof window.execConfirm === 'function')
            ? await window.execConfirm(`هل تريد حذف كود الخصم (${code}) نهائياً؟`, { title: 'حذف كوبون', tone: 'danger', confirmText: 'نعم، احذف' })
            : confirm(`هل تريد حذف كود الخصم (${code}) نهائياً؟`);
        if (!ok) return;

        storeSettings.promoCodes.splice(idx, 1);
        window.renderPromoCodesStudioUI();
        await window.saveAllSettings(true);
        if (typeof window.showToast === 'function') {
            window.showToast(`🗑️ تم حذف الكوبون (${code})`);
        }
    };

    window.copyPromoCodeQuick = function (code) {
        if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
        if (typeof window.showToast === 'function') window.showToast(`📋 تم نسخ الكود: ${code}`);
    };

    // =========================================================================
    // 🛍️ 11. ربط أدوات تسويق موقع العملاء (الاقتراح الذكي + الإشعارات الحية + الكوبون التلقائي)
    // =========================================================================
    function renderStorefrontMarketingControlsUI() {
        const csProdSel = document.getElementById('st-cs-product');
        if (csProdSel) {
            const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
            const opts = ['<option value="">-- اختر صنفاً مقترحاً --</option>'];
            Object.keys(prodsObj).forEach(id => {
                const p = prodsObj[id];
                if (!p || p.isWeightBased) return;
                opts.push(`<option value="${escSettingsHtml(id)}">${escSettingsHtml(p.name || id)}</option>`);
            });
            csProdSel.innerHTML = opts.join('');
            csProdSel.value = storeSettings.crossSellProductId || '';
        }

        if (document.getElementById('st-cs-active')) document.getElementById('st-cs-active').checked = Boolean(storeSettings.crossSellActive);
        if (document.getElementById('st-cs-title')) document.getElementById('st-cs-title').value = storeSettings.crossSellTitle || '';
        if (document.getElementById('st-cs-desc')) document.getElementById('st-cs-desc').value = storeSettings.crossSellDesc || '';

        if (document.getElementById('st-ln-active')) document.getElementById('st-ln-active').checked = Boolean(storeSettings.liveNotiActive);
        if (document.getElementById('st-ln-names')) {
            document.getElementById('st-ln-names').value = Array.isArray(storeSettings.liveNotiNames)
                ? storeSettings.liveNotiNames.join('، ')
                : '';
        }
        if (document.getElementById('st-ln-places')) {
            document.getElementById('st-ln-places').value = Array.isArray(storeSettings.liveNotiPlaces)
                ? storeSettings.liveNotiPlaces.join('، ')
                : '';
        }

        if (document.getElementById('st-rw-active')) document.getElementById('st-rw-active').checked = Boolean(storeSettings.rewardActive);
        if (document.getElementById('st-rw-prefix')) document.getElementById('st-rw-prefix').value = storeSettings.autoPromoPrefix || 'VIP-';
        if (document.getElementById('st-rw-type')) document.getElementById('st-rw-type').value = storeSettings.rewardType || 'fixed';
        if (document.getElementById('st-rw-value')) document.getElementById('st-rw-value').value = Number(storeSettings.rewardValue) || 0;
        if (document.getElementById('st-rw-max-disc')) document.getElementById('st-rw-max-disc').value = Number(storeSettings.rewardMaxDiscount) || 0;
        if (document.getElementById('st-rw-max-gen')) document.getElementById('st-rw-max-gen').value = Number(storeSettings.rewardMaxGenerations) || 0;
    }

    function collectStorefrontMarketingPatch() {
        const splitCommaList = (raw) => String(raw || '')
            .split(/[,،\n]+/)
            .map(s => s.trim())
            .filter(Boolean);

        const patch = {};
        if (document.getElementById('st-cs-active')) {
            patch.crossSellActive = Boolean(document.getElementById('st-cs-active').checked);
            patch.crossSellProductId = document.getElementById('st-cs-product')?.value || '';
            patch.crossSellTitle = (document.getElementById('st-cs-title')?.value || '').trim();
            patch.crossSellDesc = (document.getElementById('st-cs-desc')?.value || '').trim();
        }
        if (document.getElementById('st-ln-active')) {
            patch.liveNotiActive = Boolean(document.getElementById('st-ln-active').checked);
            patch.liveNotiNames = splitCommaList(document.getElementById('st-ln-names')?.value);
            patch.liveNotiPlaces = splitCommaList(document.getElementById('st-ln-places')?.value);
        }
        if (document.getElementById('st-rw-active')) {
            patch.rewardActive = Boolean(document.getElementById('st-rw-active').checked);
            patch.autoPromoPrefix = ((document.getElementById('st-rw-prefix')?.value || 'VIP-').trim().toUpperCase()) || 'VIP-';
            patch.rewardType = document.getElementById('st-rw-type')?.value || 'fixed';
            patch.rewardValue = parseFloat(document.getElementById('st-rw-value')?.value) || 0;
            patch.rewardMaxDiscount = parseFloat(document.getElementById('st-rw-max-disc')?.value) || 0;
            patch.rewardMaxGenerations = parseInt(document.getElementById('st-rw-max-gen')?.value, 10) || 0;
        }
        return patch;
    }

    const _origRenderSettingsForMarketing = window.renderSettingsUI;
    window.renderSettingsUI = function () {
        if (typeof _origRenderSettingsForMarketing === 'function') {
            _origRenderSettingsForMarketing.apply(this, arguments);
        }
        renderStorefrontMarketingControlsUI();
    };

    const _origSaveSettingsForMarketing = window.saveAllSettings;
    window.saveAllSettings = async function (silent = false) {
        const settingsViewEl = document.getElementById('view-settings');
        const isSettingsOpen = Boolean(settingsViewEl && settingsViewEl.classList.contains('active')) || window.smanCurrentActiveTab === 'settings';
        let marketingPatch = null;

        if (isSettingsOpen) {
            marketingPatch = collectStorefrontMarketingPatch();
            Object.assign(storeSettings, marketingPatch);
        }

        if (typeof _origSaveSettingsForMarketing === 'function') {
            await _origSaveSettingsForMarketing.apply(this, arguments);
        }

        if (isSettingsOpen && marketingPatch && Object.keys(marketingPatch).length > 0 && typeof auth !== 'undefined' && auth.currentUser) {
            try {
                await db.collection('inventory').doc('settings').set(marketingPatch, { merge: true });
                if (typeof window.saveInventoryFastMirror === 'function') window.saveInventoryFastMirror();
            } catch (err) {
                console.warn('Marketing settings save info:', err);
            }
        }
    };

    // =========================================================================
    // 📡 12. مركز الملاحظات المصنّف بالألوان + رادار التقييمات الحي (CRM Quality & Notes Hub)
    // =========================================================================
    window.qualityRadarState = {
        subFilter: 'all', // 'all' | 'complaints' | 'positive' | 'published' | 'unpublished'
        zone: 'all',
        batch: 'all'
    };

    let cloudRatedOrdersCache = [];
    let cloudRatedFetchedOnce = false;
    let isFetchingCloudRated = false;

    // 1. تصنيف ذكي وبسيط لكل سطر ملاحظة (يفرّق فوراً بين: العميل / أنا إداري / للعاملين والمندوب / السيستم)
    function parseNoteChunkTimestamp(rawChunk) {
        const str = String(rawChunk || '').trim();
        const m = str.match(/^\[([^\]]+)\]\s*(.*)$/s);
        if (m) {
            return { timeLabel: m[1].trim(), body: m[2].trim() };
        }
        return { timeLabel: '', body: str };
    }

    window.classifySmanNoteChunk = function (rawChunk, sourceField) {
        const parsed = parseNoteChunkTimestamp(rawChunk);
        const body = parsed.body;
        const timeLabel = parsed.timeLabel;

        // أي ملاحظة في driverNote فهي توجيه مباشر للعاملين / المندوب (برتقالي)
        if (sourceField === 'driverNote') {
            const cleanBody = body.replace(/^👷\s*(?:للعاملين\/المندوب|للمندوب|توجيه)?\s*:?\s*/i, '').trim();
            return {
                role: 'worker',
                badge: '👷 للعاملين / المندوب',
                wrapCls: 'bg-orange-50/90 border border-orange-200 border-r-4 border-r-orange-500 text-orange-950',
                badgeCls: 'bg-orange-500 text-white',
                timeLabel,
                body: cleanBody || body
            };
        }

        // ملاحظة كتبها العميل نفسه (أزرق)
        if (
            body.includes('📌 ملاحظة العميل') ||
            body.includes('🚨 تعديل العميل') ||
            body.startsWith('👤 العميل')
        ) {
            const cleanBody = body
                .replace(/^📌\s*ملاحظة العميل\s*:?\s*/i, '')
                .replace(/^👤\s*العميل\s*:?\s*/i, '')
                .trim();
            return {
                role: 'client',
                badge: '👤 العميل كتب',
                wrapCls: 'bg-sky-50/95 border border-sky-200 border-r-4 border-r-sky-500 text-sky-950',
                badgeCls: 'bg-sky-600 text-white',
                timeLabel,
                body: cleanBody || body
            };
        }

        // تقييم العميل (يُعرض في تبويب التقييمات المستقل)
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

        // سجل السيستم التلقائي (رمادي هادئ حتى لا يزحم عينك)
        if (
            body.includes('🎁 العميل فعّل') ||
            body.includes('🎁 العميل استبدل') ||
            body.includes('🎟 كود الخصم') ||
            body.includes('⏳ مطلوب للدفعة القادمة') ||
            body.includes('✅ العميل أكد استلام') ||
            body.includes('✅ تمت المراجعة') ||
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

        // ملاحظتك أنت الإدارية (بنفسجي)
        const cleanAdmin = body.replace(/^🛡️\s*(?:إداري|أنا)?\s*:?\s*/i, '').trim();
        return {
            role: 'admin',
            badge: '🛡️ أنا كتبت (إداري)',
            wrapCls: 'bg-purple-50/90 border border-purple-200 border-r-4 border-r-purple-600 text-purple-950',
            badgeCls: 'bg-purple-600 text-white',
            timeLabel,
            body: cleanAdmin || body
        };
    };

    function parseOrderCategorizedNotes(o) {
        const client = [];
        const admin = [];
        const worker = [];
        const system = [];
        const rating = [];

        if (o && o.adminNote) {
            String(o.adminNote).split('\n---\n').filter(c => c.trim()).forEach(ch => {
                const item = window.classifySmanNoteChunk(ch, 'adminNote');
                if (item.role === 'client') client.push(item);
                else if (item.role === 'admin') admin.push(item);
                else if (item.role === 'rating') rating.push(item);
                else system.push(item);
            });
        }
        if (o && o.driverNote) {
            String(o.driverNote).split('\n---\n').filter(c => c.trim()).forEach(ch => {
                worker.push(window.classifySmanNoteChunk(ch, 'driverNote'));
            });
        }

        return { client, admin, worker, system, rating };
    }

    // 2. استخراج بيانات التقييم + التاريخ والوقت الفعلي للتقييم بدقة
    function extractCleanReviewPayload(o) {
        const rating = Math.max(0, Math.min(5, Number(o?.rating) || 0));
        const structuredText = String(o?.reviewText || '').trim();
        const structuredTags = Array.isArray(o?.reviewTags) ? o.reviewTags.filter(Boolean).map(String) : [];

        let fallbackText = '';
        let noteStampTime = '';
        if (o?.adminNote) {
            const chunks = String(o.adminNote).split('\n---\n');
            const ratedChunks = chunks.filter(ch => ch.includes('⭐️ تقييم') || ch.includes('تقييم الخدمة'));
            if (ratedChunks.length > 0) {
                const latest = ratedChunks[ratedChunks.length - 1];
                const tsMatch = latest.match(/^\[([^\]]+)\]/);
                if (tsMatch) noteStampTime = tsMatch[1].trim();
                if (!structuredText) {
                    fallbackText = latest
                        .replace(/\[[^\]]*\]\s*/g, '')
                        .replace(/⭐️\s*تقييم(?:\s+الخدمة|\s+العميل\s+للمنصة)?\s*(?:\(\s*\d+\s*\/\s*5\s*\))?\s*:?\s*/g, '')
                        .trim();
                    if (fallbackText === 'بدون تعليق' || fallbackText === 'تقييم بالنجوم بدون تعليق') {
                        fallbackText = '';
                    }
                }
            }
        }

        let ratedDisplayTime = '';
        if (Number(o?.ratedAt) > 0) {
            const dt = new Date(Number(o.ratedAt));
            if (!isNaN(dt.getTime())) {
                ratedDisplayTime = dt.toLocaleString('ar-EG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } else if (noteStampTime) {
            ratedDisplayTime = noteStampTime;
        } else if (o?.orderDate) {
            ratedDisplayTime = `${o.orderDate}${o.orderTime ? ' • ' + o.orderTime : ''}`;
        }

        const finalText = structuredText || fallbackText;
        return { rating, text: finalText, tags: structuredTags, ratedDisplayTime };
    }

    // جلب كل الطلبات المقيّمة من قاعدة البيانات مباشرة (بما فيها المؤرشفة والقديمة)
    window.fetchAllCloudRatedOrders = async function (force = false) {
        if (isFetchingCloudRated || (!force && cloudRatedFetchedOnce)) return;
        if (typeof db === 'undefined') return;
        isFetchingCloudRated = true;
        try {
            const snap = await db.collection('orders').where('rating', '>', 0).get();
            const list = [];
            snap.forEach(doc => {
                const d = doc.data() || {};
                if (d.status !== 'trash' && Number(d.rating) > 0) {
                    list.push({ id: doc.id, ...d });
                }
            });
            cloudRatedOrdersCache = list;
            cloudRatedFetchedOnce = true;
        } catch (err) {
            console.warn('Cloud rated orders fetch skipped:', err);
        } finally {
            isFetchingCloudRated = false;
            const notesView = document.getElementById('view-notes');
            if (notesView && notesView.classList.contains('active')) {
                window.renderNotesUI();
            }
        }
    };

    function getMergedAllRatedOrders() {
        const map = {};
        (Array.isArray(cloudRatedOrdersCache) ? cloudRatedOrdersCache : []).forEach(o => {
            if (o && o.id && o.status !== 'trash' && Number(o.rating) > 0) map[o.id] = o;
        });
        (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw) ? allOrdersRaw : []).forEach(o => {
            if (o && o.id && o.status !== 'trash' && Number(o.rating) > 0) map[o.id] = o;
        });
        return Object.values(map);
    }

    function findAnyOrderById(orderId) {
        const live = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw))
            ? allOrdersRaw.find(o => o && o.id === orderId)
            : null;
        if (live) return live;
        return cloudRatedOrdersCache.find(o => o && o.id === orderId) || null;
    }

    function buildSanitizedPublicReviewDoc(o, opts) {
        const rev = extractCleanReviewPayload(o);
        const cfg = opts || {};
        const showZone = cfg.showZone !== false;
        const showItems = cfg.showItems !== false;
        const showTags = cfg.showTags !== false;
        const showDate = cfg.showDate !== false;

        const safeItems = showItems && Array.isArray(o.items)
            ? o.items
                .filter(it => it && it.name && Number(it.quantity) > 0 && Number(it.price) !== 0)
                .map(it => ({
                    id: String(it.id || ''),
                    name: String(it.name || '').trim(),
                    quantity: Number(it.quantity) || 1
                }))
            : [];

        const ratedAtMs = Number(o.ratedAt)
            || (o.createdAt && typeof o.createdAt.toMillis === 'function' ? o.createdAt.toMillis() : Date.now());

        const cleanLabel = String(cfg.displayLabel || '').trim() || 'عميل موثّق';
        const cleanText = cfg.reviewText !== undefined ? String(cfg.reviewText).trim() : (rev.text || '');
        const cleanReply = cfg.adminReply !== undefined ? String(cfg.adminReply).trim() : String(o.publicReply || '').trim();

        return {
            displayName: cleanLabel,
            allowCustomAlias: true,
            zone: showZone ? String(o.zone || 'الشرقية').trim() : '',
            showZone,
            showItems,
            showTags,
            showDate,
            rating: rev.rating,
            reviewText: cleanText,
            reviewTags: showTags ? (rev.tags || []) : [],
            items: safeItems,
            orderDate: showDate ? String(o.orderDate || new Date(ratedAtMs).toLocaleDateString('ar-EG')) : '',
            adminReply: cleanReply,
            verified: true,
            ratedAt: ratedAtMs,
            publishedAt: Date.now()
        };
    }

    window.toggleStoreReviewsWallVisibility = async function (checked) {
        if (typeof auth !== 'undefined' && !auth.currentUser) {
            alert('⚠️ يرجى تسجيل الدخول بحساب الأدمن أولاً.');
            return;
        }
        const val = Boolean(checked);
        if (typeof storeSettings !== 'undefined') storeSettings.showReviewsWall = val;
        try {
            await db.collection('inventory').doc('settings').set({ showReviewsWall: val }, { merge: true });
            if (typeof window.saveInventoryFastMirror === 'function') window.saveInventoryFastMirror();
            if (typeof window.showToast === 'function') {
                window.showToast(val ? '🟢 تم إظهار صفحة «آراء عملائنا» في المتجر' : '🚫 تم إخفاء «آراء عملائنا» من المتجر مؤقتاً');
            }
        } catch (e) {
            console.error('Toggle reviews wall visibility error:', e);
            alert('تعذر تحديث حالة عرض آراء العملاء: ' + (e.message || e));
        }
    };

    window.switchNotesHubMainMode = function (mode) {
        if (mode === 'rating') {
            window.notesHubState.filter = 'rating';
            if (!cloudRatedFetchedOnce) window.fetchAllCloudRatedOrders(false);
        } else {
            if (window.notesHubState.filter === 'rating') {
                window.notesHubState.filter = 'all';
            }
        }
        window.renderNotesUI();
    };

    window.setNotesFilter = function (filterKey) {
        window.notesHubState.filter = filterKey || 'all';
        if (filterKey === 'rating' && !cloudRatedFetchedOnce) {
            window.fetchAllCloudRatedOrders(false);
        }
        window.renderNotesUI();
    };

    window.setQualityRadarSubFilter = function (key) {
        window.qualityRadarState.subFilter = key || 'all';
        window.renderNotesUI();
    };

    window.setQualityRadarZoneFilter = function (val) {
        window.qualityRadarState.zone = val || 'all';
        window.renderNotesUI();
    };

    window.setQualityRadarBatchFilter = function (val) {
        window.qualityRadarState.batch = val || 'all';
        window.renderNotesUI();
    };

    // إضافة ملاحظة بضغطة واحدة بوسم واضح (🛡️ إداري لي  أو  👷 للعاملين والمندوب)
    window.quickReplyNoteFromHub = async function (orderId, field) {
        const ord = findAnyOrderById(orderId);
        if (!ord) return;

        const isWorker = field === 'driverNote';
        const titleTxt = isWorker ? '🟠 توجيه للعاملين / المندوب' : '🟣 ملاحظة إدارية (خاصة بك)';
        const promptTxt = isWorker
            ? `اكتب التوجيه الذي يظهر للعاملين والمندوب على طلب (${ord.customerName || 'العميل'}):`
            : `اكتب ملاحظتك الإدارية الخاصة على طلب (${ord.customerName || 'العميل'}):`;

        const newText = (typeof window.execPrompt === 'function')
            ? await window.execPrompt(promptTxt, '', { title: titleTxt, tone: isWorker ? 'warning' : 'brand', confirmText: 'حفظ الملاحظة' })
            : prompt(promptTxt);

        if (!newText || !newText.trim()) return;

        const dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const prefixTag = isWorker ? '👷' : '🛡️';
        const line = `[${dateStr}] ${prefixTag} ${newText.trim()}`;
        const prev = ord[field] || '';
        const updated = prev ? `${prev}\n---\n${line}` : line;

        try {
            ord[field] = updated;
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId][field] = updated;
            }
            await db.collection('orders').doc(orderId).update({ [field]: updated });
            window.renderNotesUI();
            if (typeof window.showToast === 'function') {
                window.showToast(isWorker ? '🟠 تم حفظ توجيه العاملين/المندوب بنجاح' : '🟣 تم حفظ ملاحظتك الإدارية بنجاح');
            }
        } catch (e) {
            alert('حدث خطأ أثناء حفظ الملاحظة!');
        }
    };

    // نفس التلوين الواضح داخل الشات المنزلق بكروت الطلبات الحية (بدون أي تعقيد)
    window.renderInlineNotesContent = function (orderId, field) {
        const order = findAnyOrderById(orderId);
        const container = document.getElementById(`inline-notes-content-${orderId}`);
        if (!order || !container) return;

        const isDriver = field === 'driverNote';
        const title = isDriver ? '🟠 توجيهات للعاملين والمندوب' : '🟣 ملاحظاتي الإدارية + ملاحظات العميل';
        const boxCls = isDriver ? 'bg-orange-50/70 border-orange-200' : 'bg-purple-50/60 border-purple-200';
        const titleCls = isDriver ? 'text-orange-800' : 'text-purple-900';
        const btnCls = isDriver ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-600 hover:bg-purple-700';

        const quickTags = isDriver
            ? ['موعد غداً', 'العميل هينزل', 'الدفع كاش', 'رن قبل الوصول', 'تغليف خاص']
            : ['مستعجل', 'تم التواصل', 'تأجيل', 'مراجعة حساب', 'مشكلة'];

        const tagsHtml = quickTags.map(t =>
            `<button type="button" onclick="document.getElementById('inline-input-${escNoteJs(orderId)}').value += '${t} '" class="bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-slate-800 hover:text-white transition-colors shadow-sm whitespace-nowrap">${t}</button>`
        ).join('');

        const chunks = String(order[field] || '').split('\n---\n').filter(c => c.trim() !== '');
        const notesHtml = chunks.map((chunk, idx) => {
            const info = window.classifySmanNoteChunk(chunk, field);
            return `
                <div class="relative group ${info.wrapCls} p-2.5 rounded-xl mb-2 shadow-sm text-xs font-bold">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="${info.badgeCls} px-2 py-0.5 rounded-md text-[9px] font-black">${info.badge}</span>
                        ${info.timeLabel ? `<span class="text-[9px] opacity-70 font-black">${escNoteHtml(info.timeLabel)}</span>` : ''}
                    </div>
                    <div class="whitespace-pre-wrap leading-relaxed">${typeof window.formatTags === 'function' ? window.formatTags(escNoteHtml(info.body)) : escNoteHtml(info.body)}</div>
                    <div class="absolute top-1.5 left-1.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 p-1 rounded-lg shadow-sm border border-slate-100">
                        <button type="button" onclick="editInlineNoteChunk('${escNoteJs(orderId)}', '${field}', ${idx})" class="text-blue-500 hover:text-blue-700" title="تعديل"><i class="fa-solid fa-pen text-[10px]"></i></button>
                        <button type="button" onclick="deleteInlineNoteChunk('${escNoteJs(orderId)}', '${field}', ${idx})" class="text-red-500 hover:text-red-700" title="حذف"><i class="fa-solid fa-trash text-[10px]"></i></button>
                    </div>
                </div>`;
        }).join('') || `<div class="text-center py-4 text-[10px] text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl mb-2 bg-white">لا توجد ملاحظات بعد.. اكتب بالأسفل واضغط إرسال.</div>`;

        container.innerHTML = `
            <div class="p-3 ${boxCls} border rounded-2xl relative shadow-inner">
                <div class="flex justify-between items-center mb-2.5">
                    <span class="text-[11px] font-black ${titleCls}">${title}</span>
                    <button type="button" onclick="document.getElementById('inline-notes-container-${escNoteJs(orderId)}').classList.add('hidden'); if(typeof openInlineNoteId!=='undefined') openInlineNoteId = null;" class="w-6 h-6 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-red-500 shadow-sm"><i class="fa-solid fa-xmark text-xs"></i></button>
                </div>
                <div class="max-h-48 overflow-y-auto custom-scroll mb-2 pr-1">${notesHtml}</div>
                <div class="flex gap-1.5 mb-2 overflow-x-auto custom-scroll pb-1">${tagsHtml}</div>
                <div class="flex gap-2">
                    <textarea id="inline-input-${escNoteHtml(orderId)}" rows="1" class="flex-1 border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white outline-none resize-none" placeholder="${isDriver ? 'اكتب توجيهاً للعاملين أو المندوب...' : 'اكتب ملاحظتك الإدارية هنا...'}"></textarea>
                    <button type="button" onclick="saveInlineNote('${escNoteJs(orderId)}', '${field}')" class="${btnCls} text-white w-9 h-9 rounded-xl flex items-center justify-center shadow-md shrink-0 transition-colors"><i class="fa-solid fa-paper-plane text-xs"></i></button>
                </div>
            </div>`;
        setTimeout(() => { document.getElementById(`inline-input-${orderId}`)?.focus(); }, 80);
    };

    window.saveInlineNote = async function (orderId, field) {
        const input = document.getElementById(`inline-input-${orderId}`);
        const text = (input?.value || '').trim();
        if (!text) return;
        const order = findAnyOrderById(orderId);
        if (!order) return;

        input.disabled = true;
        const btn = input.nextElementSibling;
        const origBtn = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';

        const dateStr = new Date().toLocaleString('ar-EG', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const prefixTag = field === 'driverNote' ? '👷' : '🛡️';
        const formattedNote = `[${dateStr}] ${prefixTag} ${text}`;
        const currentText = order[field] || '';
        const updatedText = currentText ? `${currentText}\n---\n${formattedNote}` : formattedNote;

        try {
            order[field] = updatedText;
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId][field] = updatedText;
            }
            await db.collection('orders').doc(orderId).update({ [field]: updatedText });
            window.renderInlineNotesContent(orderId, field);
        } catch (e) {
            alert('خطأ في حفظ الملاحظة!');
            input.disabled = false;
            if (btn) btn.innerHTML = origBtn;
        }
    };

    // 3. نافذة التحكم الكامل في نشر التقييم إلى حائط الثقة العام (بدون اسم العميل)
    function ensurePublishReviewControlModal() {
        let modal = document.getElementById('sman-publish-review-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'sman-publish-review-modal';
        modal.className = 'fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[250] hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
                <div class="bg-gradient-to-l from-[#0b261c] via-[#133b2c] to-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-white flex items-center gap-2"><i class="fa-solid fa-sliders text-amber-400"></i> التحكم في نشر التقييم للموقع</h3>
                        <p class="text-[10px] text-emerald-200 font-bold mt-0.5">لا يظهر اسم العميل أو رقمه أو عنوانه — أنت تتحكم في كل حرف يظهر</p>
                    </div>
                    <button type="button" onclick="closePublishReviewControlModal()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-rose-500 text-white flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <div class="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 bg-slate-50/70">
                    <input type="hidden" id="prm-order-id" value="">

                    <div id="prm-order-preview-bar" class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs font-black text-emerald-950 flex items-center justify-between gap-2"></div>

                    <div>
                        <label class="text-[11px] font-black text-slate-700 block mb-1">اللقب الظاهر بدلاً من اسم العميل (خصوصية 100%):</label>
                        <input type="text" id="prm-display-label" placeholder="عميل موثّق" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-black text-slate-900 bg-white outline-none focus:border-emerald-600">
                        <div class="flex flex-wrap gap-1 mt-1.5">
                            <button type="button" onclick="document.getElementById('prm-display-label').value='عميل موثّق'" class="text-[10px] font-black bg-white border border-slate-200 hover:border-emerald-500 px-2 py-0.5 rounded-lg text-slate-600">عميل موثّق</button>
                            <button type="button" onclick="document.getElementById('prm-display-label').value='عميل سمان ههيا'" class="text-[10px] font-black bg-white border border-slate-200 hover:border-emerald-500 px-2 py-0.5 rounded-lg text-slate-600">عميل سمان ههيا</button>
                            <button type="button" onclick="document.getElementById('prm-display-label').value='عميل دائم VIP'" class="text-[10px] font-black bg-white border border-slate-200 hover:border-emerald-500 px-2 py-0.5 rounded-lg text-slate-600">عميل دائم VIP</button>
                        </div>
                    </div>

                    <div>
                        <label class="text-[11px] font-black text-slate-700 block mb-1">نص التقييم الذي سيظهر للجمهور (يمكنك التعديل أو تركه فارغاً):</label>
                        <textarea id="prm-review-text" rows="3" placeholder="نص رأي العميل..." class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:border-emerald-600 resize-none leading-relaxed"></textarea>
                    </div>

                    <div>
                        <label class="text-[11px] font-black text-slate-700 block mb-1">رد إدارة سمان ههيا أسفل التقييم (اختياري):</label>
                        <textarea id="prm-admin-reply" rows="2" placeholder="مثال: تشرّفنا بخدمتكم، بالهناء والشفاء دايماً من سمان ههيا 🌿" class="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:border-emerald-600 resize-none leading-relaxed"></textarea>
                    </div>

                    <div class="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
                        <span class="text-[11px] font-black text-slate-700 block pb-1 border-b border-slate-100">اختر العناصر التي تظهر داخل الكارت في الموقع:</span>
                        <div class="grid grid-cols-2 gap-2 text-[11px] font-black text-slate-700">
                            <label class="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-200/80">
                                <input type="checkbox" id="prm-show-zone" class="w-4 h-4 accent-emerald-600 rounded" checked>
                                <span>📍 إظهار المنطقة</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-200/80">
                                <input type="checkbox" id="prm-show-items" class="w-4 h-4 accent-emerald-600 rounded" checked>
                                <span>📦 إظهار الأصناف</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-200/80">
                                <input type="checkbox" id="prm-show-tags" class="w-4 h-4 accent-emerald-600 rounded" checked>
                                <span>🏷️ إظهار الوسوم</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-200/80">
                                <input type="checkbox" id="prm-show-date" class="w-4 h-4 accent-emerald-600 rounded">
                                <span>📅 إظهار التاريخ</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="p-4 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                    <button type="button" id="prm-save-btn" onclick="confirmPublishReviewFromModal()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 active:scale-95">
                        <i class="fa-solid fa-globe"></i> اعتماد ونشر على الموقع
                    </button>
                    <button type="button" onclick="closePublishReviewControlModal()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-4 py-3 rounded-xl text-xs">إلغاء</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    window.closePublishReviewControlModal = function () {
        document.getElementById('sman-publish-review-modal')?.classList.add('hidden');
    };

    window.openPublishReviewControlModal = function (orderId) {
        if (typeof auth !== 'undefined' && !auth.currentUser) {
            return alert('⚠️ يرجى تسجيل الدخول بحساب الأدمن أولاً.');
        }
        const ord = findAnyOrderById(orderId);
        if (!ord) return;

        const rev = extractCleanReviewPayload(ord);
        if (rev.rating <= 0) return alert('هذا الطلب لا يحتوي على تقييم بالنجوم بعد.');

        ensurePublishReviewControlModal();
        const savedCfg = ord.publicReviewCfg || {};

        document.getElementById('prm-order-id').value = orderId;
        document.getElementById('prm-order-preview-bar').innerHTML = `
            <span>⭐️ التقييم: ${rev.rating}/5 • 📍 ${escNoteHtml(ord.zone || 'الشرقية')}</span>
            <span class="bg-white text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-200 text-[10px]">الاسم مخفي تلقائياً 🔒</span>
        `;
        document.getElementById('prm-display-label').value = savedCfg.displayLabel || 'عميل موثّق';
        document.getElementById('prm-review-text').value = savedCfg.reviewText !== undefined ? savedCfg.reviewText : rev.text;
        document.getElementById('prm-admin-reply').value = ord.publicReply !== undefined ? ord.publicReply : 'تشرّفنا بخدمتكم، بالهناء والشفاء دايماً من سمان ههيا 🌿';

        document.getElementById('prm-show-zone').checked = savedCfg.showZone !== false;
        document.getElementById('prm-show-items').checked = savedCfg.showItems !== false;
        document.getElementById('prm-show-tags').checked = savedCfg.showTags !== false;
        document.getElementById('prm-show-date').checked = Boolean(savedCfg.showDate);

        const saveBtn = document.getElementById('prm-save-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = ord.publishedToWall
                ? '<i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات على الموقع'
                : '<i class="fa-solid fa-globe"></i> اعتماد ونشر على الموقع';
        }

        document.getElementById('sman-publish-review-modal').classList.remove('hidden');
    };

    window.confirmPublishReviewFromModal = async function () {
        const orderId = document.getElementById('prm-order-id')?.value || '';
        const ord = findAnyOrderById(orderId);
        if (!ord) return;

        const btn = document.getElementById('prm-save-btn');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ والنشر...';
        }

        const cfg = {
            displayLabel: (document.getElementById('prm-display-label')?.value || '').trim() || 'عميل موثّق',
            reviewText: (document.getElementById('prm-review-text')?.value || '').trim(),
            adminReply: (document.getElementById('prm-admin-reply')?.value || '').trim(),
            showZone: Boolean(document.getElementById('prm-show-zone')?.checked),
            showItems: Boolean(document.getElementById('prm-show-items')?.checked),
            showTags: Boolean(document.getElementById('prm-show-tags')?.checked),
            showDate: Boolean(document.getElementById('prm-show-date')?.checked)
        };

        const sanitizedDoc = buildSanitizedPublicReviewDoc(ord, cfg);

        try {
            await Promise.all([
                db.collection('public_reviews').doc(orderId).set(sanitizedDoc),
                db.collection('orders').doc(orderId).update({
                    publishedToWall: true,
                    publicReply: cfg.adminReply,
                    publicReviewCfg: cfg
                })
            ]);

            ord.publishedToWall = true;
            ord.publicReply = cfg.adminReply;
            ord.publicReviewCfg = cfg;
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId].publishedToWall = true;
                globalOrdersMap[orderId].publicReply = cfg.adminReply;
                globalOrdersMap[orderId].publicReviewCfg = cfg;
            }

            window.closePublishReviewControlModal();
            window.renderNotesUI();
            if (typeof window.showToast === 'function') {
                window.showToast('🌐 تم النشر والتحديث بأمان بدون اسم العميل!');
            }
        } catch (e) {
            console.error('Publish review error:', e);
            alert('تعذر النشر على public_reviews — تأكد من إضافة قاعدة الحماية في Firestore Rules: ' + (e.message || e));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    window.togglePublishReviewToWall = async function (orderId) {
        if (typeof auth !== 'undefined' && !auth.currentUser) {
            return alert('⚠️ يرجى تسجيل الدخول بحساب الأدمن أولاً.');
        }
        const ord = findAnyOrderById(orderId);
        if (!ord) return;

        if (!ord.publishedToWall) {
            window.openPublishReviewControlModal(orderId);
            return;
        }

        const ok = (typeof window.execConfirm === 'function')
            ? await window.execConfirm('هل تريد إخفاء هذا التقييم من صفحة آراء العملاء العامة؟', { title: 'إخفاء من حائط الثقة', tone: 'warning', confirmText: 'نعم، إخفاء' })
            : confirm('هل تريد إخفاء هذا التقييم من صفحة آراء العملاء العامة؟');
        if (!ok) return;

        try {
            await Promise.all([
                db.collection('public_reviews').doc(orderId).delete(),
                db.collection('orders').doc(orderId).update({ publishedToWall: false })
            ]);
            ord.publishedToWall = false;
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId].publishedToWall = false;
            }
            window.renderNotesUI();
            if (typeof window.showToast === 'function') window.showToast('👁️ تم إخفاء التقييم من حائط الثقة العام');
        } catch (e) {
            console.error('Unpublish review error:', e);
            alert('تعذر إخفاء التقييم: ' + (e.message || e));
        }
    };

    window.sendSmartReviewWhatsApp = function (orderId) {
        const ord = findAnyOrderById(orderId);
        if (!ord || !ord.customerPhone) return alert('لا يوجد رقم هاتف مسجل لهذا الطلب.');

        const rawDigits = String(ord.customerPhone).replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
        const waPhone = rawDigits.startsWith('01') ? ('2' + rawDigits) : (rawDigits.startsWith('20') ? rawDigits : ('20' + rawDigits));
        const firstName = String(ord.customerName || 'فندم').trim().split(/\s+/)[0];
        const rating = Number(ord.rating) || 0;

        let msg = '';
        if (rating >= 4) {
            msg = `أهلاً بحضرتك يا أ. ${firstName} 🌿\nشفنا تقييمك الجميل لطلبك الأخير من *سمان ههيا* (${rating}/5 ⭐️) وفرحنا جداً برضاك عن الجودة!\nبالهناء والشفاء دايماً، وتشرّفنا بخدمتك في الدفعات الجاية 🤍`;
        } else {
            msg = `أهلاً بحضرتك يا أ. ${firstName}، معاك إدارة *سمان ههيا* 🌿\nشفنا ملاحظتك وتقييمك الأخير وبنعتذر لك جداً لو حصل أي تقصير غير مقصود.\nرضاك وجودة الأوردر أهم حاجة عندنا — حابين نسمع منك التفاصيل عشان نرضيك ونعوّضك فوراً.`;
        }

        window.open(`https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(msg)}`, '_blank');
    };

    // 4. رسم رادار التقييمات والمراجعات بالتاريخ والوقت الفعلي وبطاقة الطلب المرتبط به
    function renderExecutiveQualityRadar(container) {
        if (!cloudRatedFetchedOnce && !isFetchingCloudRated) {
            window.fetchAllCloudRatedOrders(false);
        }

        const mergedRated = getMergedAllRatedOrders();
        const rawQ = String(document.getElementById('search-notes')?.value || '')
            .replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660)
            .replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0)
            .toLowerCase().trim();

        const ratedEntries = [];
        const zonesSet = new Set();
        const batchesSet = new Set();
        const batchStatsMap = {};

        mergedRated.forEach(o => {
            const rev = extractCleanReviewPayload(o);
            if (rev.rating <= 0) return;

            const isResolved = String(o.adminNote || '').includes('✅ تمت المراجعة');
            const isPublished = Boolean(o.publishedToWall);
            const sortMs = Number(o.ratedAt) || (o.createdAt && typeof o.createdAt.toMillis === 'function' ? o.createdAt.toMillis() : 0);
            const z = String(o.zone || 'غير محدد').trim();
            const b = String(o.batchName || 'طلب فوري').trim();
            zonesSet.add(z);
            batchesSet.add(b);

            if (!batchStatsMap[b]) batchStatsMap[b] = { sum: 0, count: 0, bad: 0 };
            batchStatsMap[b].sum += rev.rating;
            batchStatsMap[b].count += 1;
            if (rev.rating <= 3) batchStatsMap[b].bad += 1;

            ratedEntries.push({
                order: o,
                rating: rev.rating,
                text: rev.text,
                tags: rev.tags,
                ratedDisplayTime: rev.ratedDisplayTime,
                isComplaint: rev.rating <= 3,
                isResolved,
                isPublished,
                zone: z,
                batch: b,
                sortMs,
                hay: `${o.customerName || ''} ${o.customerPhone || ''} ${z} ${b} ${rev.text} ${rev.tags.join(' ')} ${o.orderDate || ''}`.toLowerCase()
            });
        });

        const totalRated = ratedEntries.length;
        const avgStars = totalRated > 0 ? (ratedEntries.reduce((s, x) => s + x.rating, 0) / totalRated).toFixed(1) : '0.0';
        const positiveCount = ratedEntries.filter(x => x.rating >= 4).length;
        const satPct = totalRated > 0 ? Math.round((positiveCount / totalRated) * 100) : 0;
        const openComplaintsCount = ratedEntries.filter(x => x.isComplaint && !x.isResolved).length;
        const publishedCount = ratedEntries.filter(x => x.isPublished).length;
        const isWallVisible = (typeof storeSettings !== 'undefined') ? (storeSettings.showReviewsWall !== false) : true;

        const st = window.qualityRadarState;
        const filtered = ratedEntries.filter(x => {
            if (st.subFilter === 'complaints' && !x.isComplaint) return false;
            if (st.subFilter === 'positive' && x.rating < 4) return false;
            if (st.subFilter === 'published' && !x.isPublished) return false;
            if (st.subFilter === 'unpublished' && (x.isPublished || x.rating < 4)) return false;
            if (st.zone !== 'all' && x.zone !== st.zone) return false;
            if (st.batch !== 'all' && x.batch !== st.batch) return false;
            if (rawQ && !x.hay.includes(rawQ)) return false;
            return true;
        });

        filtered.sort((a, b) => {
            const pA = (a.isComplaint && !a.isResolved) ? 2 : 0;
            const pB = (b.isComplaint && !b.isResolved) ? 2 : 0;
            if (pB !== pA) return pB - pA;
            return b.sortMs - a.sortMs;
        });

        const subBtnCls = (k) => st.subFilter === k
            ? 'bg-slate-900 text-amber-300 border-slate-900 shadow-sm'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';

        const batchPulseHtml = Object.keys(batchStatsMap).slice(0, 6).map(bName => {
            const bs = batchStatsMap[bName];
            const bAvg = (bs.sum / bs.count).toFixed(1);
            const warn = bs.bad > 0;
            return `<button type="button" onclick="setQualityRadarBatchFilter('${escNoteJs(st.batch === bName ? 'all' : bName)}')" class="whitespace-nowrap px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all ${st.batch === bName ? 'bg-emerald-700 text-white border-emerald-700' : (warn ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50/70 text-emerald-900 border-emerald-200')}">
                ${escNoteHtml(bName)}: ${bAvg}⭐️ (${bs.count})
            </button>`;
        }).join('');

        const headerHtml = `
            <div class="col-span-full space-y-3">
                <div class="bg-gradient-to-l from-[#0b261c] via-[#133b2c] to-slate-900 text-white rounded-3xl p-4 shadow-lg border border-amber-400/30 space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                        <div class="flex items-center gap-2.5">
                            <span class="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-base shadow shrink-0">
                                <i class="fa-solid fa-satellite-dish"></i>
                            </span>
                            <div>
                                <h3 class="text-sm sm:text-base font-black text-white leading-tight">رادار التقييمات والمراجعات (شامل الأرشيف)</h3>
                                <p class="text-[10px] font-bold text-emerald-200/85">كل تقييم معروض بوقت التقييم الفعلي وتفاصيل الطلب المرتبط به</p>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <button type="button" onclick="fetchAllCloudRatedOrders(true)" class="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-2.5 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1">
                                <i class="fa-solid fa-rotate ${isFetchingCloudRated ? 'fa-spin' : ''}"></i> تحديث
                            </button>
                            <label class="flex items-center gap-1.5 bg-white/10 border border-white/20 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-white cursor-pointer">
                                <input type="checkbox" ${isWallVisible ? 'checked' : ''} onchange="toggleStoreReviewsWallVisibility(this.checked)" class="w-3.5 h-3.5 accent-amber-400 rounded">
                                <span>إظهار بالموقع</span>
                            </label>
                            <a href="https://smanhhya.github.io/reviews.html" target="_blank" class="bg-white/10 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-amber-400/35 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> معاينة
                            </a>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div class="bg-white/10 rounded-2xl p-2.5 border border-white/10">
                            <span class="text-[10px] font-bold text-emerald-200 block">متوسط التقييم</span>
                            <span class="text-xl font-black text-amber-300">${avgStars} <i class="fa-solid fa-star text-xs"></i></span>
                            <span class="block text-[9px] text-white/70">من ${totalRated} تقييم</span>
                        </div>
                        <div class="bg-white/10 rounded-2xl p-2.5 border border-white/10">
                            <span class="text-[10px] font-bold text-emerald-200 block">نسبة الرضا (4–5⭐️)</span>
                            <span class="text-xl font-black text-emerald-300">${satPct}%</span>
                            <span class="block text-[9px] text-white/70">${positiveCount} عميل راضٍ</span>
                        </div>
                        <div class="rounded-2xl p-2.5 border ${openComplaintsCount > 0 ? 'bg-rose-500/25 border-rose-400/60 animate-pulse' : 'bg-white/10 border-white/10'}">
                            <span class="text-[10px] font-bold ${openComplaintsCount > 0 ? 'text-rose-200' : 'text-emerald-200'} block">شكاوى مفتوحة</span>
                            <span class="text-xl font-black ${openComplaintsCount > 0 ? 'text-rose-200' : 'text-white'}">${openComplaintsCount}</span>
                            <span class="block text-[9px] text-white/70">تقييمات 1–3 نجوم</span>
                        </div>
                        <div class="bg-white/10 rounded-2xl p-2.5 border border-white/10">
                            <span class="text-[10px] font-bold text-emerald-200 block">منشور بحائط الثقة</span>
                            <span class="text-xl font-black text-sky-300">${publishedCount}</span>
                            <span class="block text-[9px] text-white/70">مجهول الاسم 100%</span>
                        </div>
                    </div>

                    ${batchPulseHtml ? `
                    <div class="flex items-center gap-1.5 overflow-x-auto pt-1" style="-webkit-overflow-scrolling: touch; scrollbar-width: none;">
                        <span class="text-[10px] font-black text-amber-200 shrink-0">📊 جودة الدفعات:</span>
                        ${batchPulseHtml}
                    </div>` : ''}
                </div>

                <div class="bg-white rounded-2xl p-2.5 border border-slate-200 shadow-sm space-y-2">
                    <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5" style="-webkit-overflow-scrolling: touch; scrollbar-width: none;">
                        <button type="button" onclick="setQualityRadarSubFilter('all')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${subBtnCls('all')}">الكل (${totalRated})</button>
                        <button type="button" onclick="setQualityRadarSubFilter('complaints')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${subBtnCls('complaints')}">⚠️ شكاوى (${ratedEntries.filter(x => x.isComplaint).length})</button>
                        <button type="button" onclick="setQualityRadarSubFilter('positive')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${subBtnCls('positive')}">🌟 ممتازة (${positiveCount})</button>
                        <button type="button" onclick="setQualityRadarSubFilter('published')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${subBtnCls('published')}">🌐 منشورة بالموقع (${publishedCount})</button>
                        <button type="button" onclick="setQualityRadarSubFilter('unpublished')" class="whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${subBtnCls('unpublished')}">⏳ جاهزة للنشر (${ratedEntries.filter(x => !x.isPublished && x.rating >= 4).length})</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <select onchange="setQualityRadarZoneFilter(this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-2.5 py-1.5 text-[11px] font-black text-slate-700 outline-none">
                            <option value="all" ${st.zone === 'all' ? 'selected' : ''}>📍 كل المناطق</option>
                            ${Array.from(zonesSet).map(z => `<option value="${escNoteHtml(z)}" ${st.zone === z ? 'selected' : ''}>📍 ${escNoteHtml(z)}</option>`).join('')}
                        </select>
                        <select onchange="setQualityRadarBatchFilter(this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-2.5 py-1.5 text-[11px] font-black text-slate-700 outline-none">
                            <option value="all" ${st.batch === 'all' ? 'selected' : ''}>📦 كل الدفعات</option>
                            ${Array.from(batchesSet).map(b => `<option value="${escNoteHtml(b)}" ${st.batch === b ? 'selected' : ''}>📦 ${escNoteHtml(b)}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;

        if (filtered.length === 0) {
            const emptyMsg = isFetchingCloudRated
                ? '<i class="fa-solid fa-spinner fa-spin ml-1"></i> جاري تحميل التقييمات من السيرفر...'
                : 'لا توجد تقييمات مطابقة لهذا الفلتر حالياً.';
            container.innerHTML = headerHtml + `<div class="col-span-full text-center py-10 text-slate-400 font-bold bg-white rounded-2xl border-2 border-dashed border-slate-200">${emptyMsg}</div>`;
            return;
        }

        const cardsHtml = filtered.slice(0, 80).map(item => {
            const o = item.order;
            const safeOrderId = escNoteJs(o.id);
            const safePhone = escNoteJs(o.customerPhone || '');
            const starsHtml = Array.from({ length: 5 }, (_, i) =>
                `<i class="fa-${i < item.rating ? 'solid text-amber-400' : 'regular text-slate-300'} fa-star text-xs"></i>`
            ).join('');

            const itemsBadges = Array.isArray(o.items)
                ? o.items.slice(0, 6).map(it => `<span class="bg-white text-slate-800 border border-slate-200 px-2 py-0.5 rounded-lg text-[10px] font-black">${escNoteHtml(it.quantity)}× ${escNoteHtml(it.name)}</span>`).join(' ')
                : '';

            const tagsHtml = item.tags.length > 0
                ? `<div class="flex flex-wrap gap-1">${item.tags.map(t => `<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg text-[10px] font-black">${escNoteHtml(t)}</span>`).join('')}</div>`
                : '';

            const borderCls = item.isComplaint
                ? (item.isResolved ? 'border-r-4 border-r-amber-400 border-amber-200' : 'border-r-4 border-r-rose-600 border-rose-300 bg-rose-50/15')
                : (item.isPublished ? 'border-r-4 border-r-emerald-600 border-emerald-200' : 'border-r-4 border-r-slate-400 border-slate-200');

            return `
            <div class="bg-white rounded-2xl p-3.5 border ${borderCls} shadow-sm space-y-2.5 flex flex-col justify-between">
                <div class="space-y-2.5">
                    <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <h4 onclick="openCustomerCard('${safePhone}')" class="font-black text-slate-900 text-sm cursor-pointer hover:text-brand-primary">${escNoteHtml(o.customerName || 'عميل')}</h4>
                                ${item.isPublished ? '<span class="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded-md">🌐 منشور</span>' : ''}
                                ${o.isArchived ? '<span class="bg-slate-100 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">🗄️ مؤرشف</span>' : ''}
                                ${item.isComplaint && !item.isResolved ? '<span class="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">⚠️ شكوى عاجلة</span>' : ''}
                                ${item.isResolved ? '<span class="bg-teal-100 text-teal-800 text-[9px] font-black px-1.5 py-0.5 rounded-md">✅ تمت المعالجة</span>' : ''}
                            </div>
                            <p class="text-[10px] font-bold text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span dir="ltr">${escNoteHtml(o.customerPhone || '')}</span>
                                <span>• 📍 ${escNoteHtml(item.zone)}</span>
                                ${item.ratedDisplayTime ? `<span class="text-amber-700 font-black">• 🕒 وقت التقييم: ${escNoteHtml(item.ratedDisplayTime)}</span>` : ''}
                            </p>
                        </div>
                        <div class="text-left shrink-0 bg-amber-50/70 border border-amber-200/80 px-2 py-1 rounded-xl">
                            <div class="flex items-center gap-0.5" dir="ltr">${starsHtml}</div>
                            <span class="block text-[10px] font-black text-amber-800 text-center mt-0.5">${item.rating} / 5</span>
                        </div>
                    </div>

                    ${tagsHtml}

                    <div class="${item.isComplaint ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-sky-50/70 border-sky-200 text-sky-950'} border border-r-4 ${item.isComplaint ? 'border-r-rose-500' : 'border-r-sky-500'} rounded-xl p-2.5 text-xs font-bold leading-relaxed">
                        <span class="text-[9px] font-black ${item.isComplaint ? 'text-rose-700' : 'text-sky-700'} block mb-0.5">👤 رأي العميل:</span>
                        ${item.text ? escNoteHtml(item.text) : '<span class="text-slate-400">اكتفى العميل بالتقييم بالنجوم بدون تعليق نصي.</span>'}
                    </div>

                    <!-- بطاقة الطلب المرتبط بالتقييم بوضوح كامل -->
                    <div class="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 space-y-1.5">
                        <div class="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-black text-slate-600">
                            <span><i class="fa-solid fa-box text-emerald-600 ml-1"></i> الطلب المقيّم: <strong class="text-slate-900">${escNoteHtml(item.batch)}</strong></span>
                            <span>📅 ${escNoteHtml(o.orderDate || '')}${o.orderTime ? ' • ' + escNoteHtml(o.orderTime) : ''} • <strong class="text-brand-primary">${Number(o.total) || 0} ج.م</strong></span>
                        </div>
                        ${itemsBadges ? `<div class="flex flex-wrap gap-1">${itemsBadges}</div>` : ''}
                    </div>

                    ${o.publicReply ? `
                    <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-2 text-[11px] font-bold text-amber-950">
                        <span class="text-[9px] font-black text-amber-700 block mb-0.5">🌿 رد الإدارة الظاهر بالموقع:</span>
                        ${escNoteHtml(o.publicReply)}
                    </div>` : ''}
                </div>

                <div class="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                    ${item.isPublished ? `
                    <button type="button" onclick="openPublishReviewControlModal('${safeOrderId}')" class="bg-indigo-50 hover:bg-indigo-600 text-indigo-800 hover:text-white border border-indigo-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-solid fa-sliders"></i> <span>تعديل المنشور</span>
                    </button>
                    <button type="button" onclick="togglePublishReviewToWall('${safeOrderId}')" class="bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-solid fa-eye-slash"></i> <span>إخفاء</span>
                    </button>
                    ` : `
                    <button type="button" onclick="openPublishReviewControlModal('${safeOrderId}')" class="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1 sm:flex-1">
                        <i class="fa-solid fa-globe"></i> <span>تخصيص ونشر بالموقع</span>
                    </button>
                    `}
                    <button type="button" onclick="sendSmartReviewWhatsApp('${safeOrderId}')" class="bg-[#25D366] hover:bg-green-600 text-white py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-brands fa-whatsapp text-xs"></i> <span>${item.isComplaint ? 'اعتذار ومتابعة' : 'رسالة شكر'}</span>
                    </button>
                    ${!item.isResolved ? `
                    <button type="button" onclick="markOrderNoteReviewedInHub('${safeOrderId}', 'adminNote')" class="bg-amber-50 hover:bg-amber-500 text-amber-900 hover:text-white border border-amber-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-solid fa-check"></i> <span>${item.isComplaint ? 'تم حل الشكوى' : 'تمت المراجعة'}</span>
                    </button>` : ''}
                    <button type="button" onclick="openEditOrderModal('${safeOrderId}')" class="bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-solid fa-pen text-amber-300"></i> الطلب
                    </button>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = headerHtml + cardsHtml;
    }

    // 5. المحرك الرئيسي لمركز الملاحظات الملوّن + مزامنة التبويبين الرئيسيين
    window.renderNotesUI = function () {
        const container = document.getElementById('notes-list-container');
        if (!container) return;

        if (!cloudRatedFetchedOnce && !isFetchingCloudRated) {
            window.fetchAllCloudRatedOrders(false);
        }

        const activeFilter = window.notesHubState.filter || 'all';
        const isRatingMode = activeFilter === 'rating';

        // تحديث شكل التبويبين الرئيسيين وإظهار/إخفاء شريط فلاتر الألوان
        const btnNotesMain = document.getElementById('n-main-tab-notes');
        const btnRatingMain = document.getElementById('n-main-tab-rating');
        const colorFiltersBar = document.getElementById('notes-color-filters-bar');
        const compToggleWrap = document.getElementById('notes-completed-toggle-wrap');

        if (btnNotesMain && btnRatingMain) {
            if (isRatingMode) {
                btnNotesMain.className = 'px-3.5 py-2 rounded-xl text-xs font-black text-emerald-100 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5';
                btnRatingMain.className = 'px-3.5 py-2 rounded-xl text-xs font-black bg-white text-slate-900 shadow-sm transition-all flex items-center justify-center gap-1.5';
            } else {
                btnNotesMain.className = 'px-3.5 py-2 rounded-xl text-xs font-black bg-white text-slate-900 shadow-sm transition-all flex items-center justify-center gap-1.5';
                btnRatingMain.className = 'px-3.5 py-2 rounded-xl text-xs font-black text-emerald-100 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5';
            }
        }
        if (colorFiltersBar) colorFiltersBar.classList.toggle('hidden', isRatingMode);
        if (compToggleWrap) compToggleWrap.classList.toggle('hidden', isRatingMode);

        // تحديث ألوان أزرار الفلاتر الفرعية
        const subFilterStyles = {
            all: { active: 'bg-slate-900 text-white border-slate-900', idle: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100' },
            client: { active: 'bg-sky-600 text-white border-sky-600', idle: 'bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100' },
            admin: { active: 'bg-purple-600 text-white border-purple-600', idle: 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100' },
            driver: { active: 'bg-orange-500 text-white border-orange-500', idle: 'bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100' },
            problem: { active: 'bg-rose-600 text-white border-rose-600', idle: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100' },
            customers: { active: 'bg-amber-500 text-slate-950 border-amber-500', idle: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' }
        };
        Object.keys(subFilterStyles).forEach(k => {
            const btn = document.getElementById(`n-filter-${k}`);
            if (!btn) return;
            const stCls = (k === activeFilter) ? subFilterStyles[k].active : subFilterStyles[k].idle;
            btn.className = `notes-filter-btn whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black border shadow-sm transition-all ${stCls}`;
        });

        // جمع البيانات والإحصائيات
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const custList = (typeof customersData !== 'undefined' && Array.isArray(customersData)) ? customersData : [];
        const includeComp = document.getElementById('notes-include-completed')?.checked !== false;
        const rawQ = String(document.getElementById('search-notes')?.value || '')
            .replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 0x0660)
            .replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 0x06F0)
            .toLowerCase().trim();

        const orderCards = [];
        ordersList.forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (!includeComp && (o.status === 'completed' || o.status === 'canceled')) return;

            const cats = parseOrderCategorizedNotes(o);
            const hasHumanNotes = (cats.client.length + cats.admin.length + cats.worker.length) > 0;
            const hasSystemNotes = cats.system.length > 0;
            if (!hasHumanNotes && !hasSystemNotes) return;

            const combinedText = `${o.adminNote || ''} ${o.driverNote || ''}`;
            const isReviewed = combinedText.includes('✅ تمت المراجعة');
            const isUrgent = !isReviewed && hasAnyKeyword(combinedText, URGENT_KEYWORDS);
            const isProblem = !isReviewed && (hasAnyKeyword(combinedText, PROBLEM_KEYWORDS) || (Number(o.rating) > 0 && Number(o.rating) <= 3));
            const sortMs = (o.createdAt && typeof o.createdAt.toMillis === 'function') ? o.createdAt.toMillis() : 0;

            orderCards.push({
                kind: 'order',
                order: o,
                cats,
                hasClient: cats.client.length > 0,
                hasAdmin: cats.admin.length > 0,
                hasWorker: cats.worker.length > 0,
                isUrgent,
                isProblem,
                isReviewed,
                sortMs,
                hay: `${o.customerName || ''} ${o.customerPhone || ''} ${o.zone || ''} ${o.batchName || ''} ${combinedText}`.toLowerCase()
            });
        });

        const custCards = [];
        custList.forEach(c => {
            if (!c) return;
            const sticky = String(c.stickyNote || '').trim();
            const notebook = String(c.notebook || '').trim();
            if (!sticky && !notebook) return;
            custCards.push({
                kind: 'customer',
                customer: c,
                sticky,
                notebook,
                isProblem: Boolean(c.isBlacklisted),
                sortMs: (c.lastOrder && typeof c.lastOrder.toMillis === 'function') ? c.lastOrder.toMillis() : 0,
                hay: `${c.name || ''} ${c.phone || ''} ${c.zone || ''} ${sticky} ${notebook}`.toLowerCase()
            });
        });

        // تحديث شارات الأرقام العلوية
        const allRatedCount = getMergedAllRatedOrders().length;
        const notesBadgeEl = document.getElementById('n-main-badge-notes');
        const ratingBadgeEl = document.getElementById('n-main-badge-rating');
        if (notesBadgeEl) notesBadgeEl.textContent = orderCards.length;
        if (ratingBadgeEl) ratingBadgeEl.textContent = allRatedCount;

        const cClient = orderCards.filter(x => x.hasClient).length;
        const cAdmin = orderCards.filter(x => x.hasAdmin).length;
        const cWorker = orderCards.filter(x => x.hasWorker).length;
        const cProblem = orderCards.filter(x => x.isProblem || x.isUrgent).length;

        const statsBar = document.getElementById('notes-stats-bar');
        if (statsBar) {
            statsBar.innerHTML = `
                <span class="bg-sky-500/25 text-sky-200 border border-sky-400/30 px-2 py-0.5 rounded-lg">🔵 عميل: ${cClient}</span>
                <span class="bg-purple-500/25 text-purple-200 border border-purple-400/30 px-2 py-0.5 rounded-lg">🟣 إداري: ${cAdmin}</span>
                <span class="bg-orange-500/25 text-orange-200 border border-orange-400/30 px-2 py-0.5 rounded-lg">🟠 عاملين: ${cWorker}</span>
                ${cProblem > 0 ? `<span class="bg-rose-500 text-white px-2 py-0.5 rounded-lg">⚠️ عاجل/مشكلة: ${cProblem}</span>` : ''}
                <span class="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-lg">⭐️ تقييمات: ${allRatedCount}</span>
            `;
        }

        // إذا كان الوضع النشط هو "التقييمات والمراجعات" نعرض رادار التقييمات مباشرة
        if (isRatingMode) {
            renderExecutiveQualityRadar(container);
            return;
        }

        // فلترة وترتيب الملاحظات المصنّفة بالألوان
        const pool = activeFilter === 'customers' ? custCards : orderCards;
        const filtered = pool.filter(item => {
            if (activeFilter === 'client' && !item.hasClient) return false;
            if (activeFilter === 'admin' && !item.hasAdmin) return false;
            if (activeFilter === 'driver' && !item.hasWorker) return false;
            if (activeFilter === 'problem' && !item.isProblem && !item.isUrgent) return false;
            if (rawQ && !item.hay.includes(rawQ)) return false;
            return true;
        });

        filtered.sort((a, b) => {
            const pA = (a.isProblem ? 2 : 0) + (a.isUrgent ? 1 : 0);
            const pB = (b.isProblem ? 2 : 0) + (b.isUrgent ? 1 : 0);
            if (pB !== pA) return pB - pA;
            return b.sortMs - a.sortMs;
        });

        if (filtered.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 font-bold bg-white rounded-2xl border-2 border-dashed border-slate-200">لا توجد ملاحظات في هذا القسم حالياً.</div>`;
            return;
        }

        const statusLabels = {
            new: { t: '🆕 جديد', c: 'bg-blue-50 text-blue-700 border-blue-200' },
            processing: { t: '⏳ تجهيز', c: 'bg-amber-50 text-amber-800 border-amber-200' },
            dispatched: { t: '🛵 بالطريق', c: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            deferred: { t: '📅 مؤجل', c: 'bg-orange-50 text-orange-700 border-orange-200' },
            no_answer: { t: '📵 لم يرد', c: 'bg-purple-50 text-purple-700 border-purple-200' },
            completed: { t: '✅ مكتمل', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            canceled: { t: '❌ ملغي', c: 'bg-slate-100 text-slate-500 border-slate-200' }
        };

        const renderBubbleList = (arr) => arr.map(ch => `
            <div class="${ch.wrapCls} rounded-xl p-2.5 text-xs font-bold space-y-1">
                <div class="flex items-center justify-between gap-2">
                    <span class="${ch.badgeCls} px-2 py-0.5 rounded-md text-[9px] font-black">${ch.badge}</span>
                    ${ch.timeLabel ? `<span class="text-[9px] opacity-70 font-black">${escNoteHtml(ch.timeLabel)}</span>` : ''}
                </div>
                <p class="whitespace-pre-wrap leading-relaxed">${escNoteHtml(ch.body)}</p>
            </div>
        `).join('');

        container.innerHTML = filtered.slice(0, 80).map(item => {
            if (item.kind === 'customer') {
                const c = item.customer;
                const safePhone = escNoteJs(c.phone || '');
                const waNum = (c.phone || '').startsWith('0') ? '2' + c.phone : (c.phone || '');
                return `
                <div class="bg-white rounded-2xl p-3.5 border border-slate-200 border-r-4 ${c.isBlacklisted ? 'border-r-red-600' : 'border-r-amber-400'} shadow-sm space-y-2.5 flex flex-col justify-between">
                    <div class="space-y-2">
                        <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                            <div class="min-w-0">
                                <h4 onclick="openCustomerCard('${safePhone}')" class="font-black text-slate-900 text-sm truncate cursor-pointer hover:text-brand-primary">${escNoteHtml(c.name || 'عميل')}</h4>
                                <p class="text-[10px] font-bold text-slate-400" dir="ltr">${escNoteHtml(c.phone || '')} ${c.zone ? '• ' + escNoteHtml(c.zone) : ''}</p>
                            </div>
                            <span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0">📌 كشكول عميل</span>
                        </div>
                        ${item.sticky ? `<div class="bg-yellow-50 border border-yellow-300 rounded-xl p-2.5 text-xs font-black text-yellow-950 leading-relaxed"><i class="fa-solid fa-thumbtack text-yellow-600 ml-1"></i> ${escNoteHtml(item.sticky)}</div>` : ''}
                        ${item.notebook ? `<div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 whitespace-pre-wrap leading-relaxed"><i class="fa-solid fa-book-open text-amber-500 ml-1"></i> ${escNoteHtml(item.notebook)}</div>` : ''}
                    </div>
                    <div class="flex gap-1.5 pt-2 border-t border-slate-100">
                        <button type="button" onclick="openCustomerCard('${safePhone}')" class="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-3 rounded-xl text-[11px] font-black transition-all">فتح وتعديل الملف</button>
                        ${waNum ? `<a href="https://wa.me/${escNoteHtml(waNum)}" target="_blank" class="bg-[#25D366] hover:bg-green-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> واتساب</a>` : ''}
                    </div>
                </div>`;
            }

            const o = item.order;
            const stInfo = statusLabels[o.status] || statusLabels.new;
            const safeOrderId = escNoteJs(o.id);
            const safePhone = escNoteJs(o.customerPhone || '');
            const c = item.cats;

            const systemDrawerHtml = c.system.length > 0
                ? `<details class="bg-slate-50 border border-slate-200/80 rounded-xl p-2">
                       <summary class="cursor-pointer text-[10px] font-black text-slate-500 select-none">⚙️ سجل السيستم التلقائي (${c.system.length}) — اضغط للعرض</summary>
                       <div class="space-y-1.5 mt-2">${renderBubbleList(c.system)}</div>
                   </details>`
                : '';

            return `
            <div class="bg-white rounded-2xl p-3.5 border ${item.isProblem ? 'border-rose-300' : 'border-slate-200'} shadow-sm space-y-2.5 flex flex-col justify-between">
                <div class="space-y-2">
                    <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <h4 onclick="openCustomerCard('${safePhone}')" class="font-black text-slate-900 text-sm cursor-pointer hover:text-brand-primary">${escNoteHtml(o.customerName || 'عميل')}</h4>
                                ${item.isProblem ? '<span class="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">⚠️ مشكلة</span>' : ''}
                                ${item.isUrgent ? '<span class="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-md">⚡ عاجل</span>' : ''}
                                ${item.isReviewed ? '<span class="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-md">✅ تمت المراجعة</span>' : ''}
                            </div>
                            <p class="text-[10px] font-bold text-slate-400 mt-0.5">
                                <span dir="ltr">${escNoteHtml(o.customerPhone || '')}</span> • 📍 ${escNoteHtml(o.zone || '')} ${o.batchName ? '• 📦 ' + escNoteHtml(o.batchName) : ''} • 📅 ${escNoteHtml(o.orderDate || '')} • <strong class="text-brand-primary">${Number(o.total) || 0} ج</strong>
                            </p>
                        </div>
                        <span class="px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${stInfo.c}">${stInfo.t}</span>
                    </div>

                    <div class="space-y-1.5">
                        ${renderBubbleList(c.client)}
                        ${renderBubbleList(c.admin)}
                        ${renderBubbleList(c.worker)}
                        ${systemDrawerHtml}
                    </div>
                </div>

                <!-- زراير الكتابة المباشرة بلونها (بضغطة واحدة بدون تعقيد) -->
                <div class="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button type="button" onclick="quickReplyNoteFromHub('${safeOrderId}', 'adminNote')" class="bg-purple-50 hover:bg-purple-600 text-purple-900 hover:text-white border border-purple-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <span>🟣 + ملاحظة لي</span>
                    </button>
                    <button type="button" onclick="quickReplyNoteFromHub('${safeOrderId}', 'driverNote')" class="bg-orange-50 hover:bg-orange-500 text-orange-900 hover:text-white border border-orange-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <span>🟠 + للعاملين</span>
                    </button>
                    ${!item.isReviewed && (item.isProblem || item.isUrgent) ? `
                    <button type="button" onclick="markOrderNoteReviewedInHub('${safeOrderId}', 'adminNote')" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-solid fa-check"></i> تم الحل
                    </button>` : ''}
                    <button type="button" onclick="openEditOrderModal('${safeOrderId}')" class="bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <i class="fa-solid fa-pen text-amber-300"></i> الطلب
                    </button>
                    <button type="button" onclick="sendMessageToCustomer('${safePhone}', '${safeOrderId}')" class="bg-[#25D366] hover:bg-green-600 text-white py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1" title="واتساب">
                        <i class="fa-brands fa-whatsapp text-xs"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    };




    function initSettingsIfActive() {
        const activeTab = window.smanCurrentActiveTab || 'dashboard';
        if (activeTab === 'inventory') window.renderInventoryUI();
        if (activeTab === 'settings') window.renderSettingsUI();
        if (activeTab === 'notes') window.renderNotesUI();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => setTimeout(initSettingsIfActive, 200));
    } else {
        setTimeout(initSettingsIfActive, 200);
    }
})();
