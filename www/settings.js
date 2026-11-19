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

    window.renderSettingsUI = function () {
        if (!document.getElementById('st-name')) return;

        window.switchSettingsSubTab(window.settingsSubTabState || 'store');

        document.getElementById('st-name').value = storeSettings.storeName || '';
        document.getElementById('st-phone').value = storeSettings.storePhone || '';
        document.getElementById('st-min-order').value = storeSettings.minOrder || 0;
        document.getElementById('st-is-open').checked = storeSettings.storeOpen !== false;
        document.getElementById('st-free-del').checked = !!storeSettings.freeDeliveryActive;
        document.getElementById('st-free-th').value = storeSettings.freeDeliveryThreshold || 0;
        document.getElementById('st-free-th').disabled = !storeSettings.freeDeliveryActive;

        // نصوص واجهة متجر العملاء
        if (document.getElementById('st-hero-msg')) document.getElementById('st-hero-msg').value = storeSettings.heroMessage || '';
        if (document.getElementById('st-closed-msg')) document.getElementById('st-closed-msg').value = storeSettings.closedMessage || '';
        if (document.getElementById('st-store-desc')) document.getElementById('st-store-desc').value = storeSettings.storeDesc || '';

        if (document.getElementById('st-pts-per-100')) {
            document.getElementById('st-pts-per-100').value = storeSettings.pointsPer100 || 5;
        }
        if (document.getElementById('st-pts-value')) {
            document.getElementById('st-pts-value').value = storeSettings.pointValueInEGP || 0.40;
        }
        if (document.getElementById('st-gsheet-url')) {
            document.getElementById('st-gsheet-url').value = storeSettings.googleSheetWebhookUrl || '';
        }

        // 1. رسم مناطق التوصيل (موزونة 100% للموبايل بدون خروج حواف)
        const zCont = document.getElementById('zones-list-container');
        if (zCont) {
            const zones = storeSettings.deliveryZones || [];
            zCont.innerHTML = zones.map((z, i) => `
                <div class="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                    <span class="text-[10px] font-black text-slate-400 w-5 text-center shrink-0">${i + 1}</span>
                    <input type="text" value="${escSettingsHtml(z.name || '')}" onchange="storeSettings.deliveryZones[${i}].name=this.value.trim(); if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" class="flex-1 min-w-0 border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none focus:border-indigo-400" placeholder="اسم المنطقة">
                    <div class="relative w-20 shrink-0">
                        <input type="number" value="${Number(z.price) || 0}" onchange="storeSettings.deliveryZones[${i}].price=parseInt(this.value)||0; if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" class="w-full border border-slate-200 rounded-lg py-2 pr-2 pl-5 text-xs font-black text-indigo-700 bg-white outline-none text-center" placeholder="0">
                        <span class="absolute left-1.5 top-2 text-[10px] font-bold text-slate-400">ج</span>
                    </div>
                    <button type="button" onclick="storeSettings.deliveryZones.splice(${i}, 1); renderSettingsUI(); if(window.generateDynamicOrderInputs) generateDynamicOrderInputs();" class="w-8 h-8 shrink-0 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا توجد مناطق مسجلة، اضغط (+ إضافة منطقة).</div>`;
        }

        // 2. رسم فريق المناديب (شبكة مرنة تمنع خروج الحواف على الموبايل)
        const dCont = document.getElementById('drivers-list-container');
        if (dCont) {
            const drivers = storeSettings.drivers || [];
            dCont.innerHTML = drivers.map((d, i) => `
                <div class="bg-slate-50 p-2 rounded-xl border border-slate-200/80 space-y-1.5">
                    <div class="flex items-center gap-1.5">
                        <input type="text" value="${escSettingsHtml(d.name || '')}" onchange="storeSettings.drivers[${i}].name=this.value.trim()" placeholder="اسم المندوب" class="flex-1 min-w-0 border border-slate-200 rounded-lg p-2 text-xs font-black text-slate-800 bg-white outline-none">
                        <button type="button" onclick="storeSettings.drivers.splice(${i}, 1); renderSettingsUI();" class="w-8 h-8 shrink-0 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                    <div class="grid grid-cols-3 gap-1.5">
                        <input type="tel" value="${escSettingsHtml(d.phone || '')}" onchange="storeSettings.drivers[${i}].phone=this.value.trim()" placeholder="رقم الواتساب" class="col-span-2 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-800 bg-white outline-none text-left" dir="ltr">
                        <input type="text" value="${escSettingsHtml(d.pin || '')}" onchange="storeSettings.drivers[${i}].pin=this.value.trim()" placeholder="PIN" title="الرقم السري للمندوب" class="col-span-1 border border-blue-200 rounded-lg p-1.5 text-xs font-black text-blue-700 bg-blue-50/40 outline-none text-center">
                    </div>
                </div>
            `).join('') || `<div class="text-center py-6 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا يوجد مناديب مسجلين، اضغط (+ إضافة مندوب).</div>`;
        }

        // 3. قوالب الرسائل
        if (document.getElementById('admin-whatsapp-template')) {
            document.getElementById('admin-whatsapp-template').value = storeSettings.whatsappTemplate || '';
            document.getElementById('admin-dispatch-template').value = storeSettings.dispatchTemplate || '';
            document.getElementById('admin-ticktick-template').value = storeSettings.ticktickTemplate || '';
            document.getElementById('admin-batch-hashtag').value = storeSettings.batchHashtag || '';
        }

        // 4. تعبئة إعدادات بوليصة الشحن الحرارية (Deli 750W) بشكل مباشر ومضمون
        const wbCfg = storeSettings.waybillConfig || {};
        if (document.getElementById('wb-slogan')) document.getElementById('wb-slogan').value = wbCfg.slogan || '';
        if (document.getElementById('wb-footer-msg')) document.getElementById('wb-footer-msg').value = wbCfg.footerMsg || '';
        if (document.getElementById('wb-logo-url')) document.getElementById('wb-logo-url').value = wbCfg.logoUrl || '';
        if (document.getElementById('wb-paper-size')) document.getElementById('wb-paper-size').value = wbCfg.paperSize || '70x130';
        if (document.getElementById('wb-show-barcode')) document.getElementById('wb-show-barcode').checked = wbCfg.showBarcode !== false;
        if (document.getElementById('wb-show-breakdown')) document.getElementById('wb-show-breakdown').checked = wbCfg.showBreakdown !== false;
        if (document.getElementById('wb-show-driver-note')) document.getElementById('wb-show-driver-note').checked = wbCfg.showDriverNote !== false;

        if (typeof window.renderGalleryStudioUI === 'function') window.renderGalleryStudioUI();
        if (typeof window.renderPromoCodesStudioUI === 'function') window.renderPromoCodesStudioUI();
        initInteractiveTemplateVariables();
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

    // =========================================================================
    // 💾 4. حفظ الإعدادات الشامل (آمن تماماً — يحفظ البوليصة ولا يكتب فوق الدفعات)
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

            if (document.getElementById('st-hero-msg')) storeSettings.heroMessage = document.getElementById('st-hero-msg').value.trim();
            if (document.getElementById('st-closed-msg')) storeSettings.closedMessage = document.getElementById('st-closed-msg').value.trim();
            if (document.getElementById('st-store-desc')) storeSettings.storeDesc = document.getElementById('st-store-desc').value.trim();

            if (document.getElementById('st-gsheet-url')) {
                storeSettings.googleSheetWebhookUrl = document.getElementById('st-gsheet-url').value.trim();
            }

            if (document.getElementById('admin-whatsapp-template')) {
                storeSettings.whatsappTemplate = document.getElementById('admin-whatsapp-template').value;
                storeSettings.dispatchTemplate = document.getElementById('admin-dispatch-template').value;
                storeSettings.ticktickTemplate = document.getElementById('admin-ticktick-template').value;
                storeSettings.batchHashtag = document.getElementById('admin-batch-hashtag').value.trim();
            }

            // قراءة وحفظ إعدادات بوليصة الشحن (Deli 750W) بشكل مباشر ومضمون
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

            storeSettings.deliveryZones = (storeSettings.deliveryZones || []).filter(z => z && z.name && z.name.trim() !== '');
            storeSettings.drivers = (storeSettings.drivers || []).filter(d => d && (d.name || d.phone));
            storeSettings.productsData = storeProducts;

            // تم استبعاد الكتابة فوق مستند batches هنا لمنع مسح حجوزات العملاء المتزامنة
            await Promise.all([
                db.collection('inventory').doc('settings').set(storeSettings, { merge: true }),
                db.collection('inventory').doc('stock').set(storeStock, { merge: true }),
                db.collection('inventory').doc('prices').set(storePrices, { merge: true })
            ]);

            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.renderReconciliationUI === 'function') window.renderReconciliationUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            if (!silent) {
                if (typeof window.showToast === 'function') window.showToast('✅ تم حفظ الإعدادات والأصناف والبوليصة بنجاح!');
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
    // 📷 9. استوديو الصور الذكي (ضغط وتظبيط تلقائي + رفع مباشر على ImgBB)
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

    // معالجة وضغط الصورة تلقائياً في المتصفح قبل الرفع (سرعة فائقة + أبعاد متوازنة)
    function compressAndFormatImage(file, mode) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
            reader.onload = (ev) => {
                const img = new Image();
                img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة'));
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    if (mode === 'product') {
                        const size = 800;
                        canvas.width = size;
                        canvas.height = size;
                        // خلفية كريمي ناعمة مطابقة لخلفية متجر سمان ههيا
                        ctx.fillStyle = '#faf8f3';
                        ctx.fillRect(0, 0, size, size);

                        const fitMode = localStorage.getItem('sman_img_fit_mode') || 'contain';
                        if (fitMode === 'cover') {
                            const scale = Math.max(size / img.width, size / img.height);
                            const w = img.width * scale;
                            const h = img.height * scale;
                            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                        } else {
                            const pad = 24;
                            const maxSide = size - pad * 2;
                            const scale = Math.min(maxSide / img.width, maxSide / img.height);
                            const w = img.width * scale;
                            const h = img.height * scale;
                            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                        }
                    } else {
                        // صور الكتالوج: نحافظ على التناسب الأصلي مع حد أقصى 1080px
                        const maxDim = 1080;
                        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    }

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                    const base64Only = dataUrl.split(',')[1];
                    resolve(base64Only);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
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

    // 1. رفع صورة لصنف معين من شاشة الأصناف والأسعار
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

        const btn = document.getElementById(`btn-up-prod-${prodId}`);
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        try {
            const base64 = await compressAndFormatImage(file, 'product');
            const directUrl = await uploadBase64ToImgBB(base64);

            storeProducts[prodId].images = [directUrl];
            const urlInp = document.getElementById(`prod-img-inp-${prodId}`);
            if (urlInp) urlInp.value = directUrl;

            await window.saveAllSettings(true);
            if (typeof window.showToast === 'function') {
                window.showToast(`✅ تم تظبيط ورفع صورة (${storeProducts[prodId].name}) بنجاح!`);
            }
        } catch (err) {
            alert(err.message === 'NO_KEY' ? 'يرجى وضع مفتاح ImgBB أولاً في إعدادات المتجر.' : ('خطأ في رفع الصورة: ' + err.message));
        } finally {
            if (btn) {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }
            pendingUploadProductId = null;
        }
    };

    // 2. إدارة ورفع صور الكتالوج ("من مزرعتنا على الطبيعة")
    window.renderGalleryStudioUI = function () {
        const keyInp = document.getElementById('st-imgbb-key');
        if (keyInp && !keyInp.value) {
            try { keyInp.value = localStorage.getItem('sman_imgbb_api_key') || ''; } catch (e) {}
        }
        const fitSel = document.getElementById('st-img-fit-mode');
        if (fitSel) {
            try { fitSel.value = localStorage.getItem('sman_img_fit_mode') || 'contain'; } catch (e) {}
        }

        const grid = document.getElementById('st-gallery-images-grid');
        if (!grid) return;

        const imgs = Array.isArray(storeSettings.galleryImages) ? storeSettings.galleryImages.filter(Boolean) : [];
        if (imgs.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center py-5 text-xs font-bold text-slate-400 border border-dashed border-slate-200 rounded-xl">لا توجد صور في الكتالوج حالياً — اضغط (رفع صورة للكتالوج) للبدء.</div>';
            return;
        }

        grid.innerHTML = imgs.map((url, idx) => `
            <div class="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group shadow-sm">
                <img src="${escSettingsHtml(url)}" alt="كتالوج ${idx + 1}" class="w-full h-full object-cover">
                <button type="button" onclick="removeGalleryImage(${idx})" title="حذف الصورة" class="absolute top-1 left-1 w-6 h-6 rounded-lg bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center text-[10px] shadow">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <span class="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded">${idx + 1}</span>
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
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الضغط والرفع...';
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
                window.showToast('✅ تمت إضافة الصورة لمعرض المتجر بنجاح!');
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
