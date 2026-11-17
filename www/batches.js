// =========================================================================
// 🐣 مركز القيادة الشامل للدفعات، الذبح، التوزيع الذكي، والترحيل (www/batches.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة المدمجة فائقة السرعة
// =========================================================================

(function () {
    // 1. حالة فلترة نافذة كشف تسليمات الدفعة
    window.batchManifestState = {
        activeBatchId: null,
        zoneFilter: 'all',
        statusFilter: 'all_valid'
    };

    // 2. حالة واجهة الدفعات (شريط التبديل السريع، الطي، وإخفاء الأصناف الصفرية لمنع التوهان)
    window.batchUIState = {
        selectedFilter: 'all',      // 'all' | 'open_only' | 'slaughtered' | 'batch:BATCH_ID'
        collapsedCards: {},         // { [bId]: true/false }
        expandedZonesDrawer: {},    // { [bId]: true/false }
        showZeroProducts: {}        // { [bId]: true/false }
    };

    // دالة مساعدة لتصنيف الصنف (سمان لحم أساسي مقابل إضافات كالبيض والكتاكيت)
    function isMainQuailProduct(pId) {
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const p = prodsObj[pId];
        if (!p) return true;
        if (p.isExtra) return false;
        const name = String(p.name || '').toLowerCase();
        if (pId === 'eggs' || pId === 'chicks' || name.includes('بيض') || name.includes('كتكوت') || name.includes('كتاكيت')) {
            return false;
        }
        return true;
    }

    // جلب السعر الفعلي للصنف
    function getProdPrice(pId) {
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        return Number(pricesObj[pId] || (prodsObj[pId] ? prodsObj[pId].basePrice : 0)) || 0;
    }

    // حساب صافي قيمة المنتجات للطلب (بدون التوصيل) ليتطابق مع لوحة القيادة
    function getOrderNetProductsTotal(o) {
        if (!o) return 0;
        if (typeof window.getAccurateOrderFinancials === 'function') {
            return window.getAccurateOrderFinancials(o).total;
        }
        const del = Number(o.deliveryFee) || 0;
        const disc = Number(o.discount) || 0;
        const sub = Number(o.subtotal) || Math.max(0, (Number(o.total) || 0) - del + disc);
        return Math.max(0, Math.round(sub - disc));
    }

    // التحقق من انتماء الطلب للدفعة (بالكود أو بالاسم معاً لضمان دقة 100%)
    function doesOrderBelongToBatch(o, bId, bName) {
        if (!o || o.status === 'trash') return false;
        if (o.batchId && o.batchId === bId) return true;
        const cleanBName = (bName || '').trim();
        if (cleanBName && cleanBName !== 'undefined') {
            if (o.batchName && o.batchName.trim() === cleanBName) return true;
            if (typeof window.resolveOrderBatchName === 'function' && window.resolveOrderBatchName(o) === cleanBName) return true;
        }
        return false;
    }

    // =========================================================================
    // 📊 1. محرك التحليل اللحظي الشامل للدفعة (Batch Deep Intelligence)
    // =========================================================================
    window.getBatchDeepMetrics = function (bId, bName) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let totalOrders = 0;
        let completedOrders = 0;
        let activeOrders = 0;
        let canceledOrders = 0;

        const statusCounts = { new: 0, processing: 0, dispatched: 0, deferred: 0, no_answer: 0, completed: 0, canceled: 0 };
        const zonesMap = {};
        const realBookedByProd = {};
        const realCompletedByProd = {};
        const realBookedByName = {};

        let totalRevenue = 0;         // الإجمالي شامل التوصيل
        let netProductsRevenue = 0;   // صافي المنتجات بدون التوصيل
        let collectedNetRevenue = 0;  // المحصل الصافي (المكتمل بدون توصيل)
        let pendingNetRevenue = 0;    // الحي المنتظر (بدون توصيل)
        let collectedGrossRevenue = 0;
        let pendingGrossRevenue = 0;
        let totalDiscounts = 0;
        let totalDebt = 0;

        const batchOrdersList = [];

        ordersList.forEach(o => {
            if (!doesOrderBelongToBatch(o, bId, bName)) return;
            batchOrdersList.push(o);

            const st = o.status || 'new';
            if (statusCounts[st] !== undefined) statusCounts[st]++;

            if (st === 'canceled') {
                canceledOrders++;
                return;
            }

            totalOrders++;
            const oGross = Number(o.total) || 0;
            const oNet = getOrderNetProductsTotal(o);
            const oDisc = Number(o.discount) || 0;
            const oDebt = Number(o.debt) || 0;

            totalRevenue += oGross;
            netProductsRevenue += oNet;
            totalDiscounts += oDisc;
            if (oDebt > 0) totalDebt += oDebt;

            if (st === 'completed') {
                completedOrders++;
                collectedNetRevenue += oNet;
                collectedGrossRevenue += oGross;
            } else {
                activeOrders++;
                pendingNetRevenue += oNet;
                pendingGrossRevenue += oGross;
            }

            const zName = (o.zone || 'غير محدد').trim();
            if (!zonesMap[zName]) zonesMap[zName] = { count: 0, revenue: 0, netRevenue: 0, activeCount: 0 };
            zonesMap[zName].count++;
            zonesMap[zName].revenue += oGross;
            zonesMap[zName].netRevenue += oNet;
            if (st !== 'completed') zonesMap[zName].activeCount++;

            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const q = Number(i.quantity) || 0;
                    let targetPid = i.id;
                    if (!targetPid) {
                        targetPid = Object.keys(prodsObj).find(k => prodsObj[k]?.name === i.name);
                    }
                    if (targetPid) {
                        realBookedByProd[targetPid] = (realBookedByProd[targetPid] || 0) + q;
                        if (st === 'completed') {
                            realCompletedByProd[targetPid] = (realCompletedByProd[targetPid] || 0) + q;
                        }
                    }
                    const iName = i.name || 'صنف';
                    realBookedByName[iName] = (realBookedByName[iName] || 0) + q;
                });
            }
        });

        return {
            totalOrders,
            completedOrders,
            activeOrders,
            canceledOrders,
            statusCounts,
            zonesMap,
            realBookedByProd,
            realCompletedByProd,
            realBookedByName,
            totalRevenue,
            netProductsRevenue,
            collectedRevenue: collectedNetRevenue,
            pendingRevenue: pendingNetRevenue,
            collectedGrossRevenue,
            pendingGrossRevenue,
            totalDiscounts,
            totalDebt,
            batchOrdersList
        };
    };

    // حساب المرحلة البيولوجية والرسالة التلقائية للدفعة
    function getBatchBioStatus(b) {
        if (!b) return { ageDays: null, targetAge: 40, remainingDays: null, stageLabel: 'غير محدد', stageColor: 'bg-slate-100 text-slate-600', autoMsg: '' };

        const targetAge = Number(b.slaughterAge) || 40;
        let ageDays = null;
        let remainingDays = null;

        if (b.hatchDate) {
            ageDays = Math.max(0, Math.floor((Date.now() - b.hatchDate) / (1000 * 60 * 60 * 24)));
            remainingDays = targetAge - ageDays;
        }

        let stageLabel = '📋 جاهزة للتشغيل';
        let stageColor = 'bg-slate-100 text-slate-700 border-slate-200';
        let autoMsg = '';

        if (b.isVisible === false) {
            stageLabel = '🚫 مخفية عن المتجر';
            stageColor = 'bg-red-50 text-red-600 border-red-200';
            autoMsg = 'هذه الدفعة مخفية حالياً ولا تظهر للعملاء في المتجر.';
        } else if (b.slaughteredAt) {
            const daysSinceSlaughter = (Date.now() - b.slaughteredAt) / (1000 * 60 * 60 * 24);
            if (daysSinceSlaughter >= 3) {
                stageLabel = '✅ تم التسليم بالكامل';
                stageColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                autoMsg = '✅ تم تسليم هذه الدفعة للعملاء بالكامل. بالهنا والشفا!';
            } else {
                stageLabel = '🛵 تم الذبح وجاري التوزيع';
                stageColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                autoMsg = '🛵 تم الذبح وجاري التوزيع.. انتظروا تواصل المناديب للتسليم!';
            }
        } else if (!b.isOpen) {
            stageLabel = '🔒 مكتملة الحجز (تجهيز وذبح)';
            stageColor = 'bg-amber-50 text-amber-800 border-amber-200';
            autoMsg = '✅ الدورة اكتملت واكتفينا بالحجز! السمان الآن في مرحلة التجهيز والذبح وجاري ترتيب مواعيد التسليم.';
        } else if (ageDays !== null) {
            if (remainingDays <= 0) {
                stageLabel = '🔪 جاهز للذبح الآن';
                stageColor = 'bg-rose-50 text-rose-700 border-rose-200';
                autoMsg = '🔪 السمان وصل لمرحلة النضج وجاهز فريش! سيتم قفل الحجز وتحديد مواعيد التسليم قريباً.';
            } else if (remainingDays <= 5) {
                stageLabel = `⏳ اقترب الذبح (باقي ${remainingDays}ي)`;
                stageColor = 'bg-amber-50 text-amber-700 border-amber-200';
                autoMsg = '⏳ أيام بسيطة جداً والسمان يكون جاهز! استعدوا لاستلام أوردراتكم قريباً.';
            } else if (ageDays <= 15) {
                stageLabel = `🐣 تحضين (${ageDays} يوم)`;
                stageColor = 'bg-sky-50 text-sky-700 border-sky-200';
                autoMsg = '🐣 السمان حالياً في مرحلة التحضين والرعاية الأولية، بنجهزلكم أفضل جودة إن شاء الله!';
            } else {
                stageLabel = `📈 تسمين (${ageDays}/${targetAge} يوم)`;
                stageColor = 'bg-purple-50 text-purple-700 border-purple-200';
                autoMsg = '📈 السمان بيكبر وفي مرحلة التسمين وبناء اللحم الممتاز، تابعونا لتحديد موعد الذبح قريباً.';
            }
        } else {
            stageLabel = '🟢 مفتوحة للحجز';
            stageColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            autoMsg = 'متاح الحجز الآن في هذه الدفعة.';
        }

        return { ageDays, targetAge, remainingDays, stageLabel, stageColor, autoMsg };
    }

    // دوال التحكم السريع في العرض والطيّ والتبديل بين الدفعات
    window.setBatchUIFilter = function (filterVal) {
        window.batchUIState.selectedFilter = filterVal;
        if (filterVal.startsWith('batch:')) {
            const targetId = filterVal.replace('batch:', '');
            window.batchUIState.collapsedCards[targetId] = false;
        }
        window.renderBatchesUI();
    };

    window.toggleBatchCardCollapse = function (bId) {
        window.batchUIState.collapsedCards[bId] = !window.batchUIState.collapsedCards[bId];
        window.renderBatchesUI();
    };

    window.expandOrCollapseAllBatchCards = function (collapseAll) {
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        Object.keys(batchesObj).forEach(bId => {
            window.batchUIState.collapsedCards[bId] = Boolean(collapseAll);
        });
        window.renderBatchesUI();
    };

    window.toggleBatchZonesDrawer = function (bId) {
        window.batchUIState.expandedZonesDrawer[bId] = !window.batchUIState.expandedZonesDrawer[bId];
        const el = document.getElementById(`batch-zones-drawer-${bId}`);
        const arrow = document.getElementById(`batch-zones-arrow-${bId}`);
        if (el) el.classList.toggle('hidden', !window.batchUIState.expandedZonesDrawer[bId]);
        if (arrow) arrow.style.transform = window.batchUIState.expandedZonesDrawer[bId] ? 'rotate(180deg)' : 'rotate(0deg)';
    };

    window.toggleBatchZeroProducts = function (bId) {
        window.batchUIState.showZeroProducts[bId] = !window.batchUIState.showZeroProducts[bId];
        window.renderBatchesUI();
    };

    // حساب سقف الدفعة الكلي (بالجوز وبالفردة) والمتبقي الفعلي منها بعد خصم الحجوزات
    window.getBatchCeilingAndRemaining = function (bId) {
        const b = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches[bId] : null;
        if (!b) return { ceilingPairs: 0, ceilingBirds: 0, bookedPairs: 0, bookedBirds: 0, remainingPairs: 0, remainingBirds: 0, allocatedPairs: 0 };

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const metrics = window.getBatchDeepMetrics(bId, b.name);

        let allocatedMeatPairs = 0;
        let bookedMeatPairs = 0;

        Object.keys(prodsObj).forEach(pId => {
            if (prodsObj[pId].isHidden) return;
            if (isMainQuailProduct(pId)) {
                allocatedMeatPairs += (Number(b.stock?.[pId]) || 0);
                const savedB = Number(b.booked?.[pId]) || 0;
                const liveB = metrics.realBookedByProd[pId] || 0;
                bookedMeatPairs += ((metrics.totalOrders > 0 || savedB === 0) ? liveB : savedB);
            }
        });

        const configuredTargetPairs = Number(b.actualPairs) || Number(b.publicPairs) || 0;
        // سقف الدفعة المعتمد = الرقم الكلي للدفعة (مثلاً 200 جوز) أو مجموع المقاسات الموزعة أيهما أكبر
        const effectiveCeilingPairs = Math.max(configuredTargetPairs, allocatedMeatPairs);
        const remainingPairs = Number((effectiveCeilingPairs - bookedMeatPairs).toFixed(1));

        return {
            ceilingPairs: effectiveCeilingPairs,
            ceilingBirds: Math.round(effectiveCeilingPairs * 2),
            allocatedPairs: allocatedMeatPairs,
            bookedPairs: Number(bookedMeatPairs.toFixed(1)),
            bookedBirds: Math.round(bookedMeatPairs * 2),
            remainingPairs: remainingPairs,
            remainingBirds: Math.round(remainingPairs * 2)
        };
    };

    // تعديل سقف الدفعة الكلي (بالجوز = ×2 فردة) مباشرة من كارت الدفعة
    window.updateBatchTotalPairsCeiling = async function (bId, val) {
        if (!storeBatches[bId]) return;
        const pairs = Math.max(0, parseInt(val) || 0);
        storeBatches[bId].actualPairs = pairs;
        if (!storeBatches[bId].publicPairs) storeBatches[bId].publicPairs = pairs;

        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.actualPairs`]: pairs
            });
        } catch (e) {
            await db.collection('inventory').doc('batches').set({
                [bId]: { actualPairs: pairs }
            }, { merge: true });
        }
        window.renderBatchesUI();
        if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
        if (typeof window.showToast === 'function') {
            window.showToast(`🎯 تم ضبط سقف الدفعة على (${pairs} جوز = ${pairs * 2} فردة)`);
        }
    };

    // تحديث شريط عداد الدفعة الحي داخل نافذة "إنشاء طلب جديد" لحظياً أثناء كتابة الطلب
    window.updateNewOrderBatchMeter = function () {
        const bSel = document.getElementById('no-batch');
        const meterDiv = document.getElementById('no-batch-live-meter');
        if (!bSel || !meterDiv) return;

        const bId = bSel.value;
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        // تحديث شارات المتاح الصغيرة فوق كل صنف في نافذة الطلب الجديد
        Object.keys(prodsObj).forEach(id => {
            const badgeEl = document.getElementById(`no-avail-badge-${id}`);
            if (!badgeEl) return;
            if (bId && storeBatches[bId] && Number(storeBatches[bId].stock?.[id]) > 0) {
                const bSt = Number(storeBatches[bId].stock[id]) || 0;
                const bBk = window.getBatchDeepMetrics(bId, storeBatches[bId].name).realBookedByProd[id] || 0;
                const curTyped = Number(document.getElementById(`no-q-${id}`)?.value) || 0;
                const rem = Number((bSt - bBk - curTyped).toFixed(1));
                badgeEl.className = `text-[9px] font-black ${rem < 0 ? 'text-white bg-red-600' : 'text-teal-700 bg-teal-50'} px-1.5 py-0.5 rounded mb-1 inline-block`;
                badgeEl.innerText = `متبقي بالدفعة: ${rem}`;
            } else {
                const stNow = Number(storeStock[id]) || 0;
                badgeEl.className = 'text-[9px] font-bold text-slate-400 mb-1 inline-block';
                badgeEl.innerText = `المتاح: ${stNow}`;
            }
        });

        if (!bId || !storeBatches[bId]) {
            meterDiv.classList.add('hidden');
            meterDiv.innerHTML = '';
            return;
        }

        const cap = window.getBatchCeilingAndRemaining(bId);
        let currentOrderMeatPairs = 0;
        Object.keys(prodsObj).forEach(id => {
            if (isMainQuailProduct(id)) {
                const qInput = document.getElementById(`no-q-${id}`);
                const q = Number(qInput?.value) || 0;
                if (q > 0) {
                    const birds = Number(qInput?.getAttribute('data-count')) || q;
                    currentOrderMeatPairs += prodsObj[id].isWeightBased ? birds : q;
                }
            }
        });

        const afterOrderBookedPairs = Number((cap.bookedPairs + currentOrderMeatPairs).toFixed(1));
        const afterOrderRemPairs = Number((cap.ceilingPairs - afterOrderBookedPairs).toFixed(1));
        const afterOrderRemBirds = Math.round(afterOrderRemPairs * 2);
        const isOver = cap.ceilingPairs > 0 && afterOrderRemPairs < 0;

        meterDiv.classList.remove('hidden');
        if (cap.ceilingPairs <= 0) {
            meterDiv.innerHTML = `
                <div class="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs font-black flex items-center justify-between">
                    <span>📌 محجوز بالدفعة حالياً: ${cap.bookedPairs} جوز (${cap.bookedBirds} فردة) + طلبك الحالي (${currentOrderMeatPairs})</span>
                    <span class="text-[10px] text-amber-700">لم يحدد سقف كلي للدفعة بعد</span>
                </div>`;
        } else {
            meterDiv.innerHTML = `
                <div class="${isOver ? 'bg-red-600 text-white animate-pulse' : 'bg-teal-900 text-white'} p-3 rounded-xl text-xs font-black flex flex-wrap items-center justify-between gap-2 shadow-sm">
                    <div>
                        <span>🎯 سقف (${storeBatches[bId].name}): <strong class="text-amber-300">${cap.ceilingPairs} جوز (${cap.ceilingBirds} فردة)</strong></span>
                        <span class="mx-1.5 opacity-50">|</span>
                        <span>محجوز شامل طلبك: <strong class="text-emerald-300">${afterOrderBookedPairs} جوز</strong></span>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg ${isOver ? 'bg-white text-red-700' : 'bg-white/15 text-amber-300'}">
                        ${isOver ? `⚠️ تخطى سقف الدفعة بـ ${Math.abs(afterOrderRemPairs)} جوز!` : `🟢 متبقي بالدفعة: ${afterOrderRemPairs} جوز (${afterOrderRemBirds} فردة)`}
                    </span>
                </div>`;
        }
    };

    // =========================================================================
    // 🎛️ 2. رسم مركز قيادة الدفعات المدمج والسريع (renderBatchesUI)
    // =========================================================================
    window.renderBatchesUI = function () {
        const cont = document.getElementById('batches-list-container');
        if (!cont) return;

        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let ghostKeysFound = false;
        Object.keys(batchesObj).forEach(bId => {
            const b = batchesObj[bId];
            if (!b || typeof b !== 'object') {
                delete batchesObj[bId];
                ghostKeysFound = true;
                return;
            }
            const cleanName = (b.name || '').toString().trim();
            const hasConfiguredStock = b.stock && Object.values(b.stock).some(v => Number(v) > 0);
            const checkMetrics = window.getBatchDeepMetrics(bId, cleanName);

            if (!cleanName || cleanName === 'undefined' || (cleanName === 'دفعة غير مسماة' && !hasConfiguredStock && checkMetrics.totalOrders === 0)) {
                delete batchesObj[bId];
                ghostKeysFound = true;
            }
        });

        if (ghostKeysFound && typeof db !== 'undefined') {
            db.collection('inventory').doc('batches').set(batchesObj).catch(() => {});
        }

        const batchIds = Object.keys(batchesObj).reverse();

        if (batchIds.length === 0) {
            cont.innerHTML = '<div class="w-full text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">لا توجد دفعات حالياً. اضغط على (دورة جديدة) بالأعلى للبدء بالتنظيم.</div>';
            return;
        }

        const currentFilter = window.batchUIState.selectedFilter || 'all';
        if (currentFilter.startsWith('batch:')) {
            const fId = currentFilter.replace('batch:', '');
            if (!batchesObj[fId]) window.batchUIState.selectedFilter = 'all';
        }

        let globalOpenBatches = 0;
        let globalMeatStock = 0;
        let globalMeatBooked = 0;
        let globalBookedNetRev = 0;
        let globalCollectedNetRev = 0;
        let globalCapacityNetRev = 0;
        const globalOverbookedAlerts = [];

        const batchMetaMap = {};

        batchIds.forEach(bId => {
            const b = batchesObj[bId];
            if (b.isOpen) globalOpenBatches++;

            const metrics = window.getBatchDeepMetrics(bId, b.name);
            const bio = getBatchBioStatus(b);
            const cap = window.getBatchCeilingAndRemaining(bId);

            let totalMeatCompletedInBatch = 0;
            let potentialRemainingRev = 0;
            let hasBookingMismatch = false;
            let avgMeatPriceSum = 0;
            let avgMeatPriceCount = 0;

            Object.keys(prodsObj).forEach(pId => {
                const p = prodsObj[pId];
                if (!p) return;
                const bStock = b.stock ? (Number(b.stock[pId]) || 0) : 0;
                const savedBooked = b.booked ? (Number(b.booked[pId]) || 0) : 0;
                const liveBooked = metrics.realBookedByProd[pId] || 0;
                const liveComp = metrics.realCompletedByProd[pId] || 0;

                const bBooked = (metrics.totalOrders > 0 || savedBooked === 0) ? liveBooked : savedBooked;
                if (Math.abs(savedBooked - liveBooked) > 0.01) hasBookingMismatch = true;

                const remaining = bStock - bBooked;
                const prodPrice = getProdPrice(pId);
                const isMainMeat = isMainQuailProduct(pId);

                if (isMainMeat) {
                    totalMeatCompletedInBatch += liveComp;
                    if (prodPrice > 0) { avgMeatPriceSum += prodPrice; avgMeatPriceCount++; }
                }
                if (remaining > 0) {
                    potentialRemainingRev += (remaining * prodPrice);
                } else if (remaining < 0 && bStock > 0) {
                    globalOverbookedAlerts.push(`${b.name}: عجز ${Math.abs(remaining)} في (${p.name})`);
                }
            });

            // إذا كان المستخدم قد حدد سقف الدفعة (مثلاً 200 جوز) ولم يوزع المقاسات بعد، نحسب الطاقة المتبقية بمتوسط سعر الطبق
            const unallocatedRemPairs = Math.max(0, cap.remainingPairs - Math.max(0, cap.allocatedPairs - cap.bookedPairs));
            const avgPrice = avgMeatPriceCount > 0 ? (avgMeatPriceSum / avgMeatPriceCount) : 115;
            if (unallocatedRemPairs > 0) {
                potentialRemainingRev += Math.round(unallocatedRemPairs * avgPrice);
            }
            if (cap.ceilingPairs > 0 && cap.remainingPairs < 0) {
                globalOverbookedAlerts.push(`${b.name}: تخطت السقف الكلي بـ ${Math.abs(cap.remainingPairs)} جوز!`);
            }

            const totalMeatStockInBatch = cap.ceilingPairs;
            const totalMeatBookedInBatch = cap.bookedPairs;

            const batchMaxCapacityRev = metrics.netProductsRevenue + potentialRemainingRev;
            globalMeatStock += totalMeatStockInBatch;
            globalMeatBooked += totalMeatBookedInBatch;
            globalBookedNetRev += metrics.netProductsRevenue;
            globalCollectedNetRev += metrics.collectedRevenue;
            globalCapacityNetRev += batchMaxCapacityRev;

            batchMetaMap[bId] = {
                b,
                metrics,
                bio,
                cap,
                totalMeatStockInBatch,
                totalMeatBookedInBatch,
                totalMeatCompletedInBatch,
                potentialRemainingRev,
                batchMaxCapacityRev,
                hasBookingMismatch
            };
        });


        // 3. بناء شريط التنقل السريع بين الدفعات (Batch Switcher Bar) لمنع التقليب والتوهان
        const activeFilter = window.batchUIState.selectedFilter || 'all';
        const btnCls = (isActive) => isActive
            ? 'bg-slate-900 text-white shadow-sm border-slate-900'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';

        let batchSwitcherPills = `
            <button type="button" onclick="setBatchUIFilter('all')" class="px-3 py-1.5 rounded-xl text-xs font-black border transition-all whitespace-nowrap ${btnCls(activeFilter === 'all')}">
                📋 كل الدفعات (${batchIds.length})
            </button>
            <button type="button" onclick="setBatchUIFilter('open_only')" class="px-3 py-1.5 rounded-xl text-xs font-black border transition-all whitespace-nowrap ${btnCls(activeFilter === 'open_only')}">
                🟢 مفتوحة للحجز (${globalOpenBatches})
            </button>
        `;

        batchIds.forEach(bId => {
            const meta = batchMetaMap[bId];
            const b = meta.b;
            const fKey = 'batch:' + bId;
            const isSel = (activeFilter === fKey);
            const dot = b.isOpen ? '🟢' : (b.slaughteredAt ? '🛵' : '🔒');
            batchSwitcherPills += `
                <button type="button" onclick="setBatchUIFilter('${fKey}')" class="px-3 py-1.5 rounded-xl text-xs font-black border transition-all whitespace-nowrap ${isSel ? 'bg-teal-600 text-white border-teal-600 shadow-sm ring-2 ring-teal-500/20' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'}">
                    ${dot} ${b.name} <span class="text-[10px] opacity-80">(${meta.metrics.totalOrders} طلب)</span>
                </button>
            `;
        });

        const switcherBarHtml = `
            <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-soft flex flex-wrap items-center justify-between gap-2 mb-4">
                <div class="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 flex-1">
                    <span class="text-[11px] font-black text-slate-400 ml-1 shrink-0"><i class="fa-solid fa-compass text-teal-600"></i> انتقال سريع:</span>
                    ${batchSwitcherPills}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" onclick="expandOrCollapseAllBatchCards(false)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black" title="فرد تفاصيل كل الدفعات">
                        <i class="fa-solid fa-expand mr-0.5"></i> فرد الكل
                    </button>
                    <button type="button" onclick="expandOrCollapseAllBatchCards(true)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black" title="طي كل الدفعات في سطور مختصرة">
                        <i class="fa-solid fa-compress mr-0.5"></i> طي الكل
                    </button>
                </div>
            </div>
        `;

        // 4. فلترة الدفعات المعروضة حسب اختيار المستخدم من الشريط العلوي
        const visibleBatchIds = batchIds.filter(bId => {
            const b = batchesObj[bId];
            if (activeFilter === 'all') return true;
            if (activeFilter === 'open_only') return Boolean(b.isOpen);
            if (activeFilter.startsWith('batch:')) return bId === activeFilter.replace('batch:', '');
            return true;
        });

        let cardsHtml = '';

        visibleBatchIds.forEach(bId => {
            const meta = batchMetaMap[bId];
            const b = meta.b;
            const metrics = meta.metrics;
            const bio = meta.bio;
            const isCollapsed = Boolean(window.batchUIState.collapsedCards[bId]);
            const showZeros = Boolean(window.batchUIState.showZeroProducts[bId]);
            const isZonesOpen = Boolean(window.batchUIState.expandedZonesDrawer[bId]);

            const totalMeatStock = meta.totalMeatStockInBatch;
            const totalMeatBooked = meta.totalMeatBookedInBatch;
            const totalMeatRem = totalMeatStock - totalMeatBooked;
            const sellProgress = totalMeatStock > 0 ? Math.min(100, Math.round((totalMeatBooked / totalMeatStock) * 100)) : 0;

            // 🅰️ في حالة طيّ الكارت (Collapsed Mode): يظهر سطر واحد غني وواضح جداً بدون أي زحام!
            if (isCollapsed) {
                cardsHtml += `
                <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/90 hover:border-teal-500 transition-all relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-2 h-full ${b.isOpen ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
                    <div class="flex flex-wrap items-center justify-between gap-3 pl-2">
                        <div onclick="toggleBatchCardCollapse('${bId}')" class="flex flex-wrap items-center gap-2.5 cursor-pointer flex-1">
                            <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs"><i class="fa-solid fa-chevron-left"></i></span>
                            <h4 class="font-black text-slate-800 text-sm sm:text-base">${b.name}</h4>
                            <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black border ${bio.stageColor}">${bio.stageLabel}</span>
                            <span class="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg text-[11px] font-black">📦 ${metrics.totalOrders} طلب</span>
                            <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-lg text-[11px] font-black">🥩 حُجز ${Number(totalMeatBooked.toFixed(1))} من ${totalMeatStock} (متبقي: ${Number(totalMeatRem.toFixed(1))})</span>
                            <span class="bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-lg text-[11px] font-black">💰 صافي الحجوزات: ${metrics.netProductsRevenue.toLocaleString()} ج</span>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button onclick="viewBatchBookings('${bId}')" class="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-xl text-[11px] font-black border border-blue-100 transition-all">📋 الكشف</button>
                            <button onclick="toggleBatchCardCollapse('${bId}')" class="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[11px] font-black">فتح التفاصيل ▼</button>
                        </div>
                    </div>
                </div>`;
                return;
            }

            // 🅱️ في حالة الكارت المفتوح (Expanded Mode): يشمل كل الأصناف (حتى المخفي من المتجر العام) وباسم كامل واضح
            const allProdIds = Object.keys(prodsObj).filter(pId => Boolean(prodsObj[pId]));
            let hiddenZeroCount = 0;

            let stockCardsHtml = '';
            allProdIds.forEach(pId => {
                const p = prodsObj[pId];
                const pName = p.name;
                const bStock = b.stock ? (Number(b.stock[pId]) || 0) : 0;
                const savedBooked = b.booked ? (Number(b.booked[pId]) || 0) : 0;
                const liveBooked = metrics.realBookedByProd[pId] || 0;
                const bBooked = (metrics.totalOrders > 0 || savedBooked === 0) ? liveBooked : savedBooked;
                const remaining = bStock - bBooked;
                const prodPrice = getProdPrice(pId);
                const isPinnedPrimary = (typeof window.isProductPrimary === 'function')
                    ? window.isProductPrimary(p, pId)
                    : isMainQuailProduct(pId);

                const isPinnedItem = (typeof window.isProductPinnedForAdmin === 'function')
                    ? window.isProductPinnedForAdmin(pId)
                    : isMainMeat;

                if (!showZeros && !isPinnedItem && bStock === 0 && bBooked === 0) {
                    hiddenZeroCount++;
                    return;
                }



                const remColor = remaining < 0
                    ? 'bg-red-600 text-white border-red-600 animate-pulse'
                    : (remaining === 0 && bStock > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700');

                const hiddenStoreBadge = p.isHidden ? `<span class="text-[8px] bg-rose-50 text-rose-600 border border-rose-200 px-1 py-0.5 rounded font-black" title="مخفي عن الجمهور في المتجر العام ولكنه متاح لك في الإدارة">مخفي بالمتجر</span>` : '';

                stockCardsHtml += `
                <div class="bg-slate-50/90 p-2.5 rounded-xl border ${remaining < 0 ? 'border-red-300 bg-red-50/30' : 'border-slate-200/80'} flex flex-col justify-between">
                    <div class="mb-2 text-right">
                        <label class="text-xs font-black text-slate-800 block leading-snug mb-1">${pName}</label>
                        <div class="flex flex-wrap items-center justify-between gap-1">
                            <span class="text-[9px] font-black text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">${prodPrice} ج</span>
                            ${hiddenStoreBadge}
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-1">
                        <div>
                            <span class="text-[8px] text-slate-400 font-bold block text-center mb-0.5">المتاح</span>
                            <input type="number" value="${bStock}" onchange="updateBatchStock('${bId}', '${pId}', this.value)" class="w-full border border-slate-200 bg-white rounded-lg p-1 text-xs font-black text-slate-800 text-center outline-none focus:ring-2 focus:ring-brand-primary/20 shadow-sm">
                        </div>
                        <div onclick="filterOrdersByBatchAndItem('${b.name}', '${pName}')" class="text-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm cursor-pointer hover:border-blue-400" title="اضغط لعرض الطلبات التي حجزت هذا الصنف">
                            <span class="text-[8px] text-slate-400 font-bold block mb-0.5">محجوز</span>
                            <span class="text-xs font-black text-blue-600">${Number(bBooked.toFixed(1))}</span>
                        </div>
                        <div class="text-center border rounded-lg p-1 shadow-sm ${remColor}">
                            <span class="text-[8px] font-bold block mb-0.5">${remaining < 0 ? 'عجز!' : 'متبقي'}</span>
                            <span class="text-xs font-black">${Number(remaining.toFixed(1))}</span>
                        </div>
                    </div>
                </div>`;
            });

            // شريط مراحل الطلبات المدمج
            const sc = metrics.statusCounts;
            const sortedZones = Object.keys(metrics.zonesMap).sort((a, z2) => metrics.zonesMap[z2].count - metrics.zonesMap[a].count);

            const zPillsHtml = sortedZones.length > 0
                ? sortedZones.map(z => {
                    const zInfo = metrics.zonesMap[z];
                    return `<span onclick="jumpToBatchZoneOrders('${b.name}', '${z}')" class="bg-white hover:bg-indigo-600 text-slate-700 hover:text-white border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all shadow-sm">📍 ${z}: ${zInfo.count} طلب (صافي ${zInfo.netRevenue.toLocaleString()} ج)</span>`;
                }).join('')
                : '<span class="text-[11px] font-bold text-slate-400">لا توجد طلبات مسجلة في مناطق بعد.</span>';

            const delWindowStr = (b.deliveryStart || b.deliveryEnd)
                ? `📅 تسليم: ${b.deliveryStart || ''}${b.deliveryEnd ? ' ⬅️ ' + b.deliveryEnd : ''}`
                : '';

            cardsHtml += `
            <div class="bg-white p-4 sm:p-5 rounded-[1.5rem] shadow-soft border-2 border-slate-200/80 relative overflow-hidden transition-all space-y-3">
                <div class="absolute top-0 right-0 w-2 h-full ${b.isOpen ? 'bg-emerald-500' : 'bg-slate-300'}"></div>

                <!-- 1. صف الرأس والأزرار القيادية المدمجة -->
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2.5 pl-1">
                    <div class="flex flex-wrap items-center gap-2 flex-1 w-full">
                        <button type="button" onclick="toggleBatchCardCollapse('${bId}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs shrink-0" title="طي كارت الدفعة">
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                        <div class="relative flex-1 min-w-[170px] max-w-xs">
                            <i class="fa-solid fa-pen absolute right-3 top-2.5 text-slate-400 text-[10px]"></i>
                            <input type="text" value="${b.name}" onchange="updateBatchNameAndOrders('${bId}', this.value)" class="border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white rounded-xl py-1.5 pr-7 pl-2 text-xs sm:text-sm font-black text-slate-800 w-full outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all">
                        </div>

                        <span class="px-2.5 py-1 rounded-xl text-[10px] font-black border ${bio.stageColor}">${bio.stageLabel}</span>

                        ${bio.ageDays !== null ? `
                        <div class="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-xl text-[10px] font-black text-purple-800" title="تعديل سريع لعمر السمان بالدفعة">
                            <button onclick="quickStepBatchAge('${bId}', -1)" class="w-5 h-5 bg-white rounded text-purple-700 hover:bg-purple-600 hover:text-white">-</button>
                            <span class="px-1">${bio.ageDays} يوم</span>
                            <button onclick="quickStepBatchAge('${bId}', 1)" class="w-5 h-5 bg-white rounded text-purple-700 hover:bg-purple-600 hover:text-white">+</button>
                        </div>` : ''}

                        <div class="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 px-2 py-1 rounded-xl text-[10px] font-black text-teal-900" title="اكتب العدد الإجمالي للدفعة بالجوز (مثلاً 200 جوز = 400 فردة) وسيخصم السيستم منه تلقائياً مع كل طلب">
                            <span>🎯 سقف الدفعة:</span>
                            <input type="number" value="${meta.cap.ceilingPairs || ''}" onchange="updateBatchTotalPairsCeiling('${bId}', this.value)" placeholder="200" class="w-14 bg-white border border-teal-300 rounded-lg px-1 py-0.5 text-center font-black text-teal-800 outline-none">
                            <span>جوز (${meta.cap.ceilingBirds} فردة)</span>
                        </div>
                        ${delWindowStr ? `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-xl text-[10px] font-black">${delWindowStr}</span>` : ''}
                    </div>


                    <!-- مفاتيح الظهور والحجز + أزرار التحكم -->
                    <div class="flex flex-wrap items-center gap-1.5 w-full lg:w-auto justify-between lg:justify-end shrink-0">
                        <div class="flex items-center gap-2.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/70">
                            <label class="flex items-center gap-1 text-[10px] font-black cursor-pointer text-blue-600">
                                <input type="checkbox" ${b.isVisible !== false ? 'checked' : ''} onchange="storeBatches['${bId}'].isVisible = this.checked; db.collection('inventory').doc('batches').update({[\`${bId}.isVisible\`]: this.checked}); renderBatchesUI();" class="w-3.5 h-3.5 accent-blue-600 rounded"> بالمتجر
                            </label>
                            <div class="w-px h-3.5 bg-slate-300"></div>
                            <label class="flex items-center gap-1 text-[10px] font-black cursor-pointer text-emerald-600">
                                <input type="checkbox" ${b.isOpen ? 'checked' : ''} onchange="storeBatches['${bId}'].isOpen = this.checked; db.collection('inventory').doc('batches').update({[\`${bId}.isOpen\`]: this.checked}); renderBatchesUI();" class="w-3.5 h-3.5 accent-emerald-600 rounded"> الحجز مفتوح
                            </label>
                        </div>

                        <div class="flex flex-wrap items-center gap-1">
                            <button onclick="viewBatchBookings('${bId}')" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-sm flex items-center gap-1" title="كشف التسليمات والتحضير"><i class="fa-solid fa-list-check"></i> الكشف</button>
                            <button onclick="openSlaughterModal('${bId}')" class="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-rose-200 transition-all flex items-center gap-1" title="تسجيل الذبح والترحيل للفريزر"><i class="fa-solid fa-knife-kitchen"></i> الذبح</button>
                            <button onclick="smartDistributeBatch('${bId}')" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-indigo-200 transition-all flex items-center gap-1" title="توزيع العدد الكلي على الأصناف ذكياً"><i class="fa-solid fa-wand-magic-sparkles"></i> توزيع</button>
                            <button onclick="openBatchSettings('${bId}')" class="bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-purple-200 transition-all flex items-center gap-1" title="إعدادات العمر والتواريخ والرسالة"><i class="fa-solid fa-sliders"></i> إعدادات</button>
                            <button onclick="openBatchBroadcastUI('${bId}')" class="bg-[#25D366]/15 text-[#1da851] hover:bg-[#25D366] hover:text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-[#25D366]/30 transition-all flex items-center gap-1" title="رسالة واتساب جماعية لعملاء الدفعة"><i class="fa-brands fa-whatsapp"></i></button>
                            <button onclick="archiveBatch('${bId}')" class="bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-amber-200 transition-all flex items-center gap-1" title="إغلاق وترحيل الدفعة للأرشيف"><i class="fa-solid fa-box-archive"></i> أرشفة</button>
                            <button onclick="deleteBatchUI('${bId}')" class="bg-red-50 text-red-500 hover:bg-red-600 hover:text-white w-7 h-7 rounded-xl text-xs font-bold flex items-center justify-center border border-red-100 transition-all" title="حذف الدفعة نهائياً"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>
                <!-- 2. شريط الحسابات الصافية والقدرة الاستيعابية للدفعة (متطابق 100% مع لوحة القيادة) -->
                <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-3 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shadow-sm">
                    <div class="bg-white/5 p-2 rounded-xl border border-white/10">
                        <span class="text-[9px] text-slate-300 font-bold block">🥩 حجز الدفعة (بالجوز والفردة)</span>
                        <span class="text-xs sm:text-sm font-black text-emerald-300">حُجز ${meta.cap.bookedPairs} <span class="text-white">من ${meta.cap.ceilingPairs} جوز</span></span>
                        <span class="block text-[10px] font-black ${meta.cap.remainingPairs < 0 ? 'text-rose-400 animate-pulse' : 'text-amber-300'}">متبقي: ${meta.cap.remainingPairs} جوز (${meta.cap.remainingBirds} فردة)</span>
                    </div>


                    <div class="bg-white/5 p-2 rounded-xl border border-white/10">
                        <span class="text-[9px] text-slate-300 font-bold block">✅ صافي المسلّم (محصل)</span>
                        <span class="text-xs sm:text-sm font-black text-emerald-400">${metrics.collectedRevenue.toLocaleString()} ج <span class="text-[9px] text-slate-300">(${metrics.completedOrders} طلب)</span></span>
                    </div>
                    <div class="bg-white/5 p-2 rounded-xl border border-white/10">
                        <span class="text-[9px] text-slate-300 font-bold block">⏳ صافي الحجوزات الحية</span>
                        <span class="text-xs sm:text-sm font-black text-amber-300">${metrics.pendingRevenue.toLocaleString()} ج <span class="text-[9px] text-slate-300">(${metrics.activeOrders} طلب)</span></span>
                    </div>
                    <div class="bg-white/5 p-2 rounded-xl border border-white/10 flex flex-col justify-center">
                        <div class="flex justify-between text-[9px] font-black px-1 mb-1">
                            <span class="text-sky-300">إجمالي الدفعة: ${metrics.netProductsRevenue.toLocaleString()} ج</span>
                            <span class="text-emerald-300">${sellProgress}%</span>
                        </div>
                        <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full ${sellProgress >= 90 ? 'bg-amber-400' : 'bg-emerald-400'} rounded-full" style="width: ${sellProgress}%"></div>
                        </div>
                    </div>
                </div>

                <!-- 3. شريط مراحل طلبات الدفعة + درج المناطق والرسالة القابل للطي -->
                <div class="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200/70">
                    <div class="flex flex-wrap items-center gap-1">
                        <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'all')" class="bg-slate-800 text-white px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-slate-900">الكل (${metrics.totalOrders})</button>
                        <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'new')" class="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-blue-600 hover:text-white">🆕 جديد (${sc.new})</button>
                        <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'processing')" class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-amber-500 hover:text-white">⏳ تجهيز (${sc.processing})</button>
                        <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'dispatched')" class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-indigo-600 hover:text-white">🛵 بالطريق (${sc.dispatched})</button>
                        ${(sc.deferred + sc.no_answer) > 0 ? `<button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'deferred')" class="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-purple-600 hover:text-white">📵 مؤجل (${sc.deferred + sc.no_answer})</button>` : ''}
                        <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'completed')" class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-emerald-600 hover:text-white">✅ مكتمل (${sc.completed})</button>
                    </div>

                    <div class="flex flex-wrap items-center gap-1">
                        ${sc.new > 0 ? `<button onclick="bulkMoveBatchNewToProcessing('${bId}', '${b.name}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm"><i class="fa-solid fa-bolt"></i> تجهيز الـ (${sc.new}) الجديد</button>` : ''}
                        ${metrics.activeOrders > 0 ? `<button onclick="rolloverBatchActiveOrders('${bId}', '${b.name}')" class="bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 px-2 py-1 rounded-lg text-[10px] font-black"><i class="fa-solid fa-share-from-square"></i> ترحيل المتبقي (${metrics.activeOrders})</button>` : ''}
                        ${meta.hasBookingMismatch ? `<button onclick="syncAndHealBatchBooked('${bId}', '${b.name}')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 px-2 py-1 rounded-lg text-[10px] font-black animate-pulse"><i class="fa-solid fa-rotate"></i> مطابقة المحجوز</button>` : ''}
                        <button type="button" onclick="toggleBatchZonesDrawer('${bId}')" class="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1">
                            <i class="fa-solid fa-map-location-dot"></i> المناطق والرسالة (${sortedZones.length})
                            <i id="batch-zones-arrow-${bId}" class="fa-solid fa-chevron-down text-[9px] transition-transform" style="transform: ${isZonesOpen ? 'rotate(180deg)' : 'rotate(0deg)'};"></i>
                        </button>
                    </div>
                </div>

                <!-- درج المناطق ورسالة العميل (يفتح عند الضغط فقط لمنع زحام الشاشة) -->
                <div id="batch-zones-drawer-${bId}" class="${isZonesOpen ? '' : 'hidden'} bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 space-y-2">
                    <div class="text-[11px] font-bold text-purple-900 bg-white px-3 py-1.5 rounded-lg border border-purple-100">
                        <i class="fa-solid fa-bullhorn text-purple-600 ml-1"></i> <strong>رسالة المتجر للعميل:</strong> ${b.urgentNote ? `<span class="text-amber-700 font-black">[${b.urgentNote}]</span> ` : ''}${bio.autoMsg}
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] font-black text-indigo-900 ml-1">📍 توزيع المناطق (اضغط للفلترة):</span>
                        ${zPillsHtml}
                    </div>
                </div>

                <!-- 4. شبكة كميات الأصناف المدمجة -->
                <div>
                    <div class="flex justify-between items-center mb-2 px-1">
                        <span class="text-[11px] font-black text-slate-600"><i class="fa-solid fa-boxes-stacked text-teal-600 ml-1"></i> كميات الأصناف في الدفعة (المتاح / المحجوز / المتبقي):</span>
                        ${(hiddenZeroCount > 0 || showZeros) ? `
                        <button type="button" onclick="toggleBatchZeroProducts('${bId}')" class="text-[10px] font-black text-indigo-600 hover:underline">
                            ${showZeros ? 'إخفاء الأصناف الإضافية الصفرية ▲' : `+ إظهار الأصناف الإضافية (${hiddenZeroCount}) ▼`}
                        </button>` : ''}
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        ${stockCardsHtml}
                    </div>
                </div>
            </div>`;
        });

        // 5. بناء لوحة الملخص العلوي الشاملة لكل الدفعات النشطة
        const globalRemMeat = globalMeatStock - globalMeatBooked;
        const globalProgress = globalMeatStock > 0 ? Math.min(100, Math.round((globalMeatBooked / globalMeatStock) * 100)) : 0;

        let overbookBanner = '';
        if (globalOverbookedAlerts.length > 0) {
            overbookBanner = `
                <div class="bg-red-600 text-white p-3 rounded-2xl shadow-md mb-3 flex items-center justify-between gap-3">
                    <div class="text-xs font-black">
                        <i class="fa-solid fa-triangle-exclamation text-amber-300 mr-1"></i>
                        تنبيه تخطي الكمية المتاحة (Overbooking): ${globalOverbookedAlerts.join(' ، ')}
                    </div>
                </div>
            `;
        }

        const topCommandSummaryHtml = `
            ${overbookBanner}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-soft text-center">
                    <span class="text-[10px] font-bold text-slate-400 block mb-0.5">الدورات المفتوحة للحجز</span>
                    <span class="text-xl font-black text-teal-600">${globalOpenBatches} <span class="text-xs text-slate-400">من ${batchIds.length}</span></span>
                </div>
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-soft text-center">
                    <span class="text-[10px] font-bold text-slate-400 block mb-0.5">إجمالي السمان المحجوز / المتاح</span>
                    <span class="text-xl font-black text-brand-primary">${Number(globalMeatBooked.toFixed(1))} <span class="text-xs text-slate-400">/ ${globalMeatStock} طبق (${globalProgress}%)</span></span>
                </div>
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-soft text-center">
                    <span class="text-[10px] font-bold text-slate-400 block mb-0.5">المتبقي المتاح للبيع الآن</span>
                    <span class="text-xl font-black ${globalRemMeat <= 0 ? 'text-rose-600' : 'text-emerald-600'}">${Number(globalRemMeat.toFixed(1))} <span class="text-xs">طبق سمان</span></span>
                </div>
                <div class="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 shadow-soft text-center">
                    <span class="text-[10px] font-black text-amber-800 block mb-0.5">صافي الحجوزات / طاقة الدفعات</span>
                    <span class="text-lg font-black text-amber-700">${globalBookedNetRev.toLocaleString()} <span class="text-[10px] text-slate-500">/ ${Math.round(globalCapacityNetRev).toLocaleString()} ج</span></span>
                </div>
            </div>
            ${switcherBarHtml}
        `;

        cont.innerHTML = topCommandSummaryHtml + `<div class="space-y-4">${cardsHtml}</div>`;
    };

    // =========================================================================
    // ➕ 3. إنشاء دورة جديدة وتحديث الكميات والأسماء بأمان تام
    // =========================================================================
    window.addNewBatchUI = async function () {
        const defaultName = `دفعة ${new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}`;
        const batchNameInput = prompt('🐣 إنشاء دورة / دفعة سمان جديدة:\n\nاكتب اسم الدفعة الجديدة (مثال: دفعة الخميس 20 نوفمبر):', defaultName);
        if (batchNameInput === null) return;
        const cleanName = batchNameInput.trim() || defaultName;

        const bId = 'batch_' + Date.now();
        storeBatches[bId] = {
            name: cleanName,
            isOpen: true,
            isVisible: true,
            stock: {},
            booked: {},
            hatchDate: Date.now()
        };

        try {
            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').set({ [bId]: storeBatches[bId] }, { merge: true });
            }
            window.batchUIState.selectedFilter = 'all';
            window.batchUIState.collapsedCards[bId] = false;
            window.renderBatchesUI();
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.showToast === 'function') window.showToast(`🎉 تم إنشاء (${cleanName}) بنجاح!`);
        } catch (e) {
            console.error('Error creating batch:', e);
        }
    };

    window.updateBatchStock = async function (bId, pId, val) {
        if (!storeBatches[bId]) return;
        if (!storeBatches[bId].stock) storeBatches[bId].stock = {};
        storeBatches[bId].stock[pId] = Math.max(0, parseInt(val) || 0);

        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.stock.${pId}`]: storeBatches[bId].stock[pId]
            });
        } catch (e) {
            await db.collection('inventory').doc('batches').set({
                [bId]: { stock: storeBatches[bId].stock }
            }, { merge: true });
        }
        window.renderBatchesUI();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
    };

    // تعديل عمر السمان يوماً للأمام أو الخلف بضغطة زر
    window.quickStepBatchAge = async function (bId, deltaDays) {
        const b = storeBatches[bId];
        if (!b) return;
        const currentAge = b.hatchDate ? Math.max(0, Math.floor((Date.now() - b.hatchDate) / (1000 * 60 * 60 * 24))) : 0;
        const nextAge = Math.max(0, currentAge + deltaDays);
        const newHatchDate = Date.now() - (nextAge * 24 * 60 * 60 * 1000);

        b.hatchDate = newHatchDate;
        window.renderBatchesUI();
        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.hatchDate`]: newHatchDate
            });
            if (typeof window.showToast === 'function') window.showToast(`🐣 تم تحديث عمر الدفعة إلى (${nextAge} يوم)`);
        } catch (e) {}
    };

    // الانتقال لشاشة الطلبات الحية مع فلتر الدفعة والحالة المطلوبة
    window.jumpToBatchOrdersWithStatus = function (batchName, statusTab) {
        const ordersBtn = document.querySelector('#sidebar button[onclick*="switchTab(\'orders\'"]');
        if (ordersBtn && typeof window.switchTab === 'function') {
            window.switchTab('orders', ordersBtn);
        }
        setTimeout(() => {
            if (typeof window.resetAllOrdersFilters === 'function') window.resetAllOrdersFilters();
            if (typeof window.setOrdersQuickFilter === 'function') {
                window.setOrdersQuickFilter('batch', batchName.trim());
                if (document.getElementById('so-filter-batch')) document.getElementById('so-filter-batch').value = batchName.trim();
            } else if (document.getElementById('search-order')) {
                document.getElementById('search-order').value = batchName.trim();
            }
            if (typeof window.setOrderTab === 'function') {
                window.setOrderTab(statusTab || 'all');
            }
        }, 80);
    };

    // الانتقال لشاشة الطلبات الحية مع فلتر (الدفعة + المنطقة)
    window.jumpToBatchZoneOrders = function (batchName, zoneName) {
        const ordersBtn = document.querySelector('#sidebar button[onclick*="switchTab(\'orders\'"]');
        if (ordersBtn && typeof window.switchTab === 'function') {
            window.switchTab('orders', ordersBtn);
        }
        setTimeout(() => {
            if (typeof window.resetAllOrdersFilters === 'function') window.resetAllOrdersFilters();
            if (typeof window.setOrdersQuickFilter === 'function') {
                window.setOrdersQuickFilter('batch', batchName.trim());
                window.setOrdersQuickFilter('zone', zoneName.trim());
                if (document.getElementById('so-filter-batch')) document.getElementById('so-filter-batch').value = batchName.trim();
                if (document.getElementById('so-filter-zone')) document.getElementById('so-filter-zone').value = zoneName.trim();
            }
            if (typeof window.setOrderTab === 'function') window.setOrderTab('all');
        }, 80);
    };

    // الانتقال لشاشة الطلبات الحية مع فلتر (الدفعة + الصنف)
    window.filterOrdersByBatchAndItem = function (batchName, itemName) {
        const ordersBtn = document.querySelector('#sidebar button[onclick*="switchTab(\'orders\'"]');
        if (ordersBtn && typeof window.switchTab === 'function') {
            window.switchTab('orders', ordersBtn);
        }
        setTimeout(() => {
            if (typeof window.resetAllOrdersFilters === 'function') window.resetAllOrdersFilters();
            if (typeof window.setOrdersQuickFilter === 'function') {
                window.setOrdersQuickFilter('batch', batchName.trim());
            }
            const sBox = document.getElementById('search-order');
            if (sBox) sBox.value = `"${itemName.trim()}"`;
            if (typeof window.setOrderTab === 'function') window.setOrderTab('all');
        }, 80);
    };

    // تحويل كل الطلبات (الجديدة) في الدفعة إلى (قيد التجهيز) بضغطة زر واحدة يوم الذبح
    window.bulkMoveBatchNewToProcessing = async function (bId, bName) {
        const metrics = window.getBatchDeepMetrics(bId, bName);
        const newOrders = metrics.batchOrdersList.filter(o => o.status === 'new');
        if (newOrders.length === 0) return alert('لا توجد طلبات في حالة (جديد) داخل هذه الدفعة!');

        if (!confirm(`⚡ هل تريد تحويل كل الطلبات الجديدة في دفعة (${bName}) وعددها (${newOrders.length} طلب) إلى قسم (جاري التجهيز) الآن؟`)) return;

        try {
            const batchWrite = db.batch();
            const fzNew = { ...(typeof storeFreezer !== 'undefined' ? storeFreezer : {}) };
            let fzTouched = false;

            newOrders.forEach(o => {
                batchWrite.update(db.collection('orders').doc(o.id), { status: 'processing' });
                o.status = 'processing';
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].status = 'processing';
                }
                if (Array.isArray(o.items)) {
                    o.items.forEach(i => {
                        if (i.id) {
                            const cur = Math.max(0, Number(fzNew[i.id]) || 0);
                            fzNew[i.id] = Math.max(0, cur - (Number(i.quantity) || 0));
                            if (typeof storeFreezer !== 'undefined') storeFreezer[i.id] = fzNew[i.id];
                            fzTouched = true;
                        }
                    });
                }
            });

            if (fzTouched) {
                batchWrite.set(db.collection('inventory').doc('freezer'), fzNew, { merge: true });
            }

            await batchWrite.commit();
            window.renderBatchesUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم نقل (${newOrders.length}) طلب إلى قيد التجهيز بنجاح!`);
        } catch (e) {
            alert('حدث خطأ أثناء نقل الطلبات للتجهيز!');
        }
    };

    // مزامنة وإصلاح أرقام المحجوز للدفعة في قاعدة البيانات لتطابق مجموع الطلبات الفعلية
    window.syncAndHealBatchBooked = async function (bId, bName) {
        const b = storeBatches[bId];
        if (!b) return;
        const metrics = window.getBatchDeepMetrics(bId, bName);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        const cleanBooked = {};
        Object.keys(prodsObj).forEach(pId => {
            cleanBooked[pId] = Number((metrics.realBookedByProd[pId] || 0).toFixed(2));
        });

        b.booked = cleanBooked;
        try {
            await db.collection('inventory').doc('batches').update({
                [`${bId}.booked`]: cleanBooked
            });
            window.renderBatchesUI();
            if (typeof window.showToast === 'function') window.showToast(`✅ تمت مطابقة وإصلاح أرقام المحجوز لدفعة (${bName}) بنجاح!`);
        } catch (e) {
            alert('حدث خطأ أثناء مزامنة المحجوز!');
        }
    };

    // ترحيل الطلبات الحية المتبقية/المؤجلة من هذه الدفعة إلى دفعة أخرى مفتوحة
    window.rolloverBatchActiveOrders = async function (fromBatchId, fromBatchName) {
        const metrics = window.getBatchDeepMetrics(fromBatchId, fromBatchName);
        const activeOrders = metrics.batchOrdersList.filter(o => !['completed', 'canceled', 'trash'].includes(o.status));
        if (activeOrders.length === 0) return alert('لا توجد طلبات متبقية غير مسلمة في هذه الدفعة!');

        const otherBatches = Object.keys(storeBatches || {}).filter(id => id !== fromBatchId && storeBatches[id] && storeBatches[id].name);
        if (otherBatches.length === 0) {
            return alert('لا توجد دفعة أخرى مسجلة حالياً! أنشئ الدورة الجديدة أولاً ثم اضغط ترحيل المتبقي.');
        }

        let promptMsg = `🔀 ترحيل الطلبات المتبقية غير المسلمة من (${fromBatchName}) وعددها (${activeOrders.length} طلب):\n\nاختر رقم الدفعة الجديدة التي تريد نقل الطلبات إليها:\n`;
        otherBatches.forEach((id, idx) => {
            promptMsg += `${idx + 1} = ${storeBatches[id].name}\n`;
        });

        const choice = prompt(promptMsg, '1');
        if (!choice) return;
        const targetIdx = parseInt(choice) - 1;
        const targetBatchId = otherBatches[targetIdx];
        if (!targetBatchId || !storeBatches[targetBatchId]) return alert('اختيار غير صحيح!');

        const targetBatchName = storeBatches[targetBatchId].name;
        if (!confirm(`سيتم نقل (${activeOrders.length}) طلب بكامل أصنافها من (${fromBatchName}) إلى (${targetBatchName}). تأكيد؟`)) return;

        try {
            const batchWrite = db.batch();
            activeOrders.forEach(o => {
                batchWrite.update(db.collection('orders').doc(o.id), {
                    batchId: targetBatchId,
                    batchName: targetBatchName
                });
                o.batchId = targetBatchId;
                o.batchName = targetBatchName;
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].batchId = targetBatchId;
                    globalOrdersMap[o.id].batchName = targetBatchName;
                }
            });

            await batchWrite.commit();
            await window.syncAndHealBatchBooked(fromBatchId, fromBatchName);
            await window.syncAndHealBatchBooked(targetBatchId, targetBatchName);

            window.renderBatchesUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.showToast === 'function') window.showToast(`✅ تم ترحيل (${activeOrders.length}) طلب إلى (${targetBatchName}) بنجاح!`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء ترحيل الطلبات!');
        }
    };

    // =========================================================================
    // 📋 4. كشف تسليمات وتحضيرات الدفعة المطور (viewBatchBookings)
    // =========================================================================
    window.viewBatchBookings = async function (bId) {
        const b = storeBatches[bId];
        if (!b) return;
        window.batchManifestState.activeBatchId = bId;
        window.batchManifestState.zoneFilter = 'all';
        window.batchManifestState.statusFilter = 'all_valid';

        document.getElementById('bb-title').innerText = b.name;
        if (typeof openModal === 'function') openModal('batch-bookings-modal');
        window.renderBatchManifestContent();
    };

    window.setBatchManifestFilter = function (key, val) {
        window.batchManifestState[key] = val;
        window.renderBatchManifestContent();
    };

    window.renderBatchManifestContent = function () {
        const bId = window.batchManifestState.activeBatchId;
        const b = storeBatches[bId];
        const contentDiv = document.getElementById('bb-content');
        if (!b || !contentDiv) return;

        const metrics = window.getBatchDeepMetrics(bId, b.name);
        const allValidOrders = metrics.batchOrdersList.filter(o => o.status !== 'canceled' && o.status !== 'trash');

        if (allValidOrders.length === 0) {
            contentDiv.innerHTML = '<div class="text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لم يتم تأكيد أي حجوزات في هذه الدفعة حتى الآن.</div>';
            return;
        }

        const zFilter = window.batchManifestState.zoneFilter;
        const sFilter = window.batchManifestState.statusFilter;

        const filteredOrders = allValidOrders.filter(o => {
            if (zFilter !== 'all' && (o.zone || 'غير محدد').trim() !== zFilter) return false;
            if (sFilter === 'completed' && o.status !== 'completed') return false;
            if (sFilter === 'active_only' && o.status === 'completed') return false;
            return true;
        });

        const filteredItemsSum = {};
        let filteredMoneySum = 0;
        let filteredNetSum = 0;

        filteredOrders.forEach(o => {
            filteredMoneySum += (Number(o.total) || 0);
            filteredNetSum += getOrderNetProductsTotal(o);
            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const nm = i.name || 'صنف';
                    filteredItemsSum[nm] = (filteredItemsSum[nm] || 0) + (Number(i.quantity) || 0);
                });
            }
        });

        let zoneOpts = `<option value="all">📍 كل المناطق (${allValidOrders.length} طلب)</option>`;
        Object.keys(metrics.zonesMap).sort((a, b2) => metrics.zonesMap[b2].count - metrics.zonesMap[a].count).forEach(z => {
            zoneOpts += `<option value="${z}" ${zFilter === z ? 'selected' : ''}>📍 ${z} (${metrics.zonesMap[z].count} طلب)</option>`;
        });

        const itemsPillsHtml = Object.keys(filteredItemsSum).map(nm => `
            <div class="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-center">
                <span class="block text-[10px] font-bold text-slate-500">${nm}</span>
                <span class="text-base font-black text-brand-primary">${Number(filteredItemsSum[nm].toFixed(2))}</span>
            </div>
        `).join('');

        let tableRowsHtml = '';
        filteredOrders.forEach((o, idx) => {
            const itemsStr = Array.isArray(o.items)
                ? o.items.map(i => `<span class="bg-indigo-50 px-2 py-0.5 rounded-lg text-indigo-700 font-black border border-indigo-100 text-xs inline-block m-0.5">${i.quantity}x ${i.name}</span>`).join(' ')
                : '';
            const locationStr = `${o.zone || 'بدون منطقة'}${o.customerAddress ? ' - ' + o.customerAddress : ''}`;
            const stAr = o.status === 'completed' ? '✅ مسلم' : (o.status === 'dispatched' ? '🛵 بالطريق' : (o.status === 'processing' ? '⏳ تجهيز' : '🆕 جديد'));
            const payStr = o.paymentMethod === 'online'
                ? '<span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black block">خالص أونلاين</span>'
                : (o.paymentMethod === 'split' ? `<span class="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-black block">كاش: ${o.paidCash || 0} | محفظة: ${o.paidOnline || 0}</span>` : '');

            tableRowsHtml += `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="p-3.5 font-black text-slate-400 text-xs">${idx + 1}</td>
                    <td class="p-3.5">
                        <div class="font-black text-slate-800 text-sm mb-0.5">${o.customerName || 'عميل'} <span class="text-[10px] font-bold text-slate-400">(${stAr})</span></div>
                        <div class="text-[11px] text-slate-600 font-bold"><i class="fa-solid fa-location-dot text-indigo-400 mr-1"></i> ${locationStr}</div>
                    </td>
                    <td class="p-3.5 font-black text-slate-700 text-xs" dir="ltr">
                        ${o.customerPhone || ''}
                        ${o.customerPhone2 ? `<br><span class="text-[10px] text-purple-600">بديل: ${o.customerPhone2}</span>` : ''}
                    </td>
                    <td class="p-3.5">${itemsStr}</td>
                    <td class="p-3.5 font-black text-brand-primary text-center text-base">
                        ${o.total || 0} <span class="text-xs">ج</span>
                        ${payStr}
                    </td>
                    <td class="p-3.5 text-[11px] font-bold text-amber-700 max-w-[180px] leading-relaxed">${o.driverNote || o.adminNote || '-'}</td>
                </tr>
            `;
        });

        contentDiv.innerHTML = `
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
                <div class="flex flex-wrap items-center gap-2">
                    <select onchange="setBatchManifestFilter('zoneFilter', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-indigo-900 outline-none">${zoneOpts}</select>
                    <select onchange="setBatchManifestFilter('statusFilter', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none">
                        <option value="all_valid" ${sFilter === 'all_valid' ? 'selected' : ''}>📦 كل حجوزات الدفعة</option>
                        <option value="active_only" ${sFilter === 'active_only' ? 'selected' : ''}>⏳ المتبقي للتسليم فقط</option>
                        <option value="completed" ${sFilter === 'completed' ? 'selected' : ''}>✅ المسلم فقط</option>
                    </select>
                </div>
                <div class="text-xs font-black text-slate-600">
                    <span>الطلبات: <strong class="text-slate-900">${filteredOrders.length}</strong></span> |
                    <span>صافي المنتجات: <strong class="text-emerald-700">${filteredNetSum.toLocaleString()} ج</strong></span> |
                    <span>شامل التوصيل: <strong class="text-brand-primary">${filteredMoneySum.toLocaleString()} ج</strong></span>
                </div>
            </div>

            <div class="mb-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="text-xs font-black text-slate-700 mb-2.5"><i class="fa-solid fa-boxes-packing text-teal-600 mr-1"></i> إجمالي الأصناف المطلوبة في هذا الكشف (${filteredOrders.length} طلب):</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">${itemsPillsHtml}</div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table class="w-full text-right text-sm border-collapse" id="print-table">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
                            <th class="p-3.5 font-black text-xs">#</th>
                            <th class="p-3.5 font-black text-xs">العميل والعنوان</th>
                            <th class="p-3.5 font-black text-xs">الموبايل</th>
                            <th class="p-3.5 font-black text-xs">الأصناف المطلوبة</th>
                            <th class="p-3.5 font-black text-xs text-center">المطلوب تحصيله</th>
                            <th class="p-3.5 font-black text-xs">ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">${tableRowsHtml}</tbody>
                </table>
            </div>
        `;
    };

    // =========================================================================
    // 🔮 5. خوارزمية التوزيع الذكي للدفعة (تتعلم من الأرشيف والدفعات الحية)
    // =========================================================================
    window.smartDistributeBatch = async function (bId) {
        const currentBatch = storeBatches[bId];
        if (!currentBatch) return;

        const defaultTotal = currentBatch.actualPairs || currentBatch.expectedPairs || '';
        const totalInput = prompt(`🔮 نظام التوزيع الذكي لدفعة (${currentBatch.name}):\n\nأدخل العدد الكلي للسمان المراد توزيعه على الأصناف (مثال: 200):`, defaultTotal);
        if (!totalInput) return;

        const totalTarget = parseInt(totalInput);
        if (isNaN(totalTarget) || totalTarget <= 0) return alert('⛔ برجاء إدخال رقم صحيح للعدد الكلي!');

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const validMainProducts = {};
        const mainProdIds = [];

        Object.keys(prodsObj).forEach(id => {
            if (isMainQuailProduct(id) && !prodsObj[id].isHidden) {
                validMainProducts[prodsObj[id].name] = id;
                mainProdIds.push(id);
            }
        });

        if (mainProdIds.length === 0) return alert('لا توجد أصناف أساسية مسجلة في المتجر!');

        const historyWeightsById = {};
        let grandTotalHistory = 0;

        const archList = (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData)) ? archivedBatchesData.slice(0, 3) : [];
        archList.forEach(a => {
            if (a && a.itemsSummary) {
                Object.keys(a.itemsSummary).forEach(itemName => {
                    const pId = validMainProducts[itemName];
                    if (pId) {
                        const q = Number(a.itemsSummary[itemName]) || 0;
                        historyWeightsById[pId] = (historyWeightsById[pId] || 0) + q;
                        grandTotalHistory += q;
                    }
                });
            }
        });

        if (grandTotalHistory === 0) {
            Object.keys(storeBatches).forEach(otherId => {
                if (otherId === bId || !storeBatches[otherId]?.stock) return;
                const s = storeBatches[otherId].stock;
                mainProdIds.forEach(pId => {
                    const q = Number(s[pId]) || 0;
                    if (q > 0) {
                        historyWeightsById[pId] = (historyWeightsById[pId] || 0) + q;
                        grandTotalHistory += q;
                    }
                });
            });
        }

        if (grandTotalHistory === 0) {
            mainProdIds.forEach(pId => {
                historyWeightsById[pId] = 1;
                grandTotalHistory += 1;
            });
        }

        const exactCalculations = [];
        let currentSum = 0;

        Object.keys(historyWeightsById).forEach(pId => {
            const weight = historyWeightsById[pId];
            if (weight <= 0) return;
            const percentage = weight / grandTotalHistory;
            const exactValue = percentage * totalTarget;
            const floorValue = Math.floor(exactValue);
            const remainder = exactValue - floorValue;

            exactCalculations.push({
                id: pId,
                itemName: prodsObj[pId]?.name || pId,
                floorValue: floorValue,
                remainder: remainder,
                percentage: percentage
            });
            currentSum += floorValue;
        });

        let difference = totalTarget - currentSum;
        exactCalculations.sort((a, b) => b.remainder - a.remainder);
        for (let i = 0; i < difference; i++) {
            exactCalculations[i % exactCalculations.length].floorValue += 1;
        }

        const newStock = { ...(currentBatch.stock || {}) };
        let textLog = `📊 مقترح التوزيع الذكي لعدد (${totalTarget}) طبق/جوز:\n\n`;
        exactCalculations.forEach(item => {
            newStock[item.id] = item.floorValue;
            textLog += `- ${item.itemName}: ${item.floorValue} (${Math.round(item.percentage * 100)}%)\n`;
        });
        textLog += `\nهل توافق على اعتماد هذا التوزيع وحفظه؟`;

        if (!confirm(textLog)) return;

        currentBatch.stock = newStock;
        currentBatch.actualPairs = totalTarget;
        try {
            await db.collection('inventory').doc('batches').set({
                [bId]: { stock: newStock, actualPairs: totalTarget }
            }, { merge: true });
            window.renderBatchesUI();
            if (typeof window.showToast === 'function') window.showToast('✨ تم التوزيع الذكي للدفعة بنجاح!');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ التوزيع الذكي!');
        }
    };

    // =========================================================================
    // 🔪 6. نافذة إتمام الذبح للدفعة والترحيل الآمن للفريزر
    // =========================================================================
    window.openSlaughterModal = function (bId) {
        const b = storeBatches[bId];
        if (!b) return;
        document.getElementById('slaughter-batch-id').value = bId;

        const cont = document.getElementById('slaughter-items-container');
        if (!cont) return;

        const metrics = window.getBatchDeepMetrics(bId, b.name);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let html = '';
        Object.keys(prodsObj).forEach(id => {
            const p = prodsObj[id];
            if (!p) return;
            const plannedStock = (b.stock && b.stock[id]) ? Number(b.stock[id]) : 0;
            const bookedNow = metrics.realBookedByProd[id] || (b.booked && b.booked[id] ? Number(b.booked[id]) : 0);
            const currentSlaughtered = (b.slaughtered && b.slaughtered[id] !== undefined)
                ? Number(b.slaughtered[id])
                : plannedStock;

            html += `
            <div class="flex justify-between items-center bg-white shadow-sm border border-slate-200/80 p-3 rounded-xl hover:border-rose-300 transition-colors">
                <div>
                    <span class="font-black text-slate-800 text-sm block">${p.name}</span>
                    <span class="text-[10px] font-bold text-slate-400">المتاح بالدفعة: ${plannedStock} | محجوز للعملاء: <strong class="text-blue-600">${Number(bookedNow.toFixed(1))}</strong></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-rose-600">المذبوح الفعلي:</span>
                    <input type="number" id="slaughter-q-${id}" value="${currentSlaughtered}" min="0" class="w-20 border border-rose-200 bg-rose-50/40 text-center font-black text-rose-700 text-base rounded-lg py-1 outline-none focus:ring-2 focus:ring-rose-300 focus:bg-white transition-all">
                </div>
            </div>`;
        });

        cont.innerHTML = html;
        if (typeof openModal === 'function') openModal('slaughter-modal');
    };

    window.confirmBatchSlaughter = async function () {
        const bId = document.getElementById('slaughter-batch-id').value;
        if (!bId || !storeBatches[bId]) return;

        const btn = document.getElementById('btn-confirm-slaughter');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الترحيل للفريزر...';
        btn.disabled = true;

        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let slaughteredData = {};
        let expectedValue = 0;
        let freezerNewData = { ...(typeof storeFreezer !== 'undefined' ? storeFreezer : {}) };
        let freezerChanged = false;

        Object.keys(prodsObj).forEach(id => {
            const inputEl = document.getElementById(`slaughter-q-${id}`);
            if (!inputEl) return;
            const q = parseInt(inputEl.value) || 0;
            if (q >= 0) {
                slaughteredData[id] = q;
                const price = getProdPrice(id);
                expectedValue += (q * price);

                const oldSlaughtered = (storeBatches[bId].slaughtered && storeBatches[bId].slaughtered[id]) ? Number(storeBatches[bId].slaughtered[id]) : 0;
                const diff = q - oldSlaughtered;
                if (diff !== 0) {
                    const curFz = Math.max(0, Number(freezerNewData[id]) || 0);
                    freezerNewData[id] = Math.max(0, curFz + diff);
                    if (typeof storeFreezer !== 'undefined') storeFreezer[id] = freezerNewData[id];
                    freezerChanged = true;
                }
            }
        });

        try {
            const dbBatch = db.batch();
            const slaughterTime = Date.now();

            storeBatches[bId].isOpen = false;
            storeBatches[bId].isVisible = true;
            storeBatches[bId].slaughtered = slaughteredData;
            storeBatches[bId].expectedValue = expectedValue;
            storeBatches[bId].slaughteredAt = slaughterTime;
            storeBatches[bId].urgentNote = '';

            dbBatch.set(db.collection('inventory').doc('batches'), {
                [bId]: {
                    isOpen: false,
                    isVisible: true,
                    urgentNote: firebase.firestore.FieldValue.delete(),
                    slaughtered: slaughteredData,
                    expectedValue: expectedValue,
                    slaughteredAt: slaughterTime
                }
            }, { merge: true });

            if (freezerChanged) {
                dbBatch.set(db.collection('inventory').doc('freezer'), freezerNewData, { merge: true });
            }

            await dbBatch.commit();

            if (typeof closeModal === 'function') closeModal('slaughter-modal');
            window.renderBatchesUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            alert(`✅ تم إتمام الذبح بنجاح!\n- تم قفل الحجز على الدفعة.\n- تم ترحيل الكميات المذبوحة إلى مخزن الفريزر.\n- القيمة الإجمالية للمذبوح: ${expectedValue.toLocaleString()} ج.م`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ الذبح والترحيل للفريزر!');
        }

        btn.innerHTML = origHtml;
        btn.disabled = false;
    };

    // دالة الحذف الجذري للدفعة (تمسحها من الفايربيس والكاش وتفك ارتباط الطلبات القديمة بها)
    window.deleteBatchUI = async function (bId) {
        const targetBatch = storeBatches[bId];
        const batchTitle = targetBatch && targetBatch.name ? targetBatch.name : 'هذه الدفعة';

        if (!confirm(`⚠️ هل أنت متأكد من حذف (${batchTitle}) نهائياً من النظام؟`)) return;

        try {
            delete storeBatches[bId];
            Object.keys(storeBatches).forEach(k => {
                const item = storeBatches[k];
                if (!item || typeof item !== 'object' || !item.name || item.name === 'undefined' || item.name.trim() === '') {
                    delete storeBatches[k];
                }
            });

            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('batches').set(storeBatches);

                const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
                const linkedOrders = ordersList.filter(o => o && o.batchId === bId);
                for (let i = 0; i < linkedOrders.length; i += 400) {
                    const chunk = linkedOrders.slice(i, i + 400);
                    const batchWrite = db.batch();
                    chunk.forEach(o => {
                        o.batchId = '';
                        if (o.batchName === 'دفعة غير مسماة') o.batchName = '';
                        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                            globalOrdersMap[o.id].batchId = '';
                            if (globalOrdersMap[o.id].batchName === 'دفعة غير مسماة') globalOrdersMap[o.id].batchName = '';
                        }
                        const upData = { batchId: '' };
                        if (o.batchName === '') upData.batchName = '';
                        batchWrite.update(db.collection('orders').doc(o.id), upData);
                    });
                    await batchWrite.commit();
                }
            }

            window.batchUIState.selectedFilter = 'all';
            window.renderBatchesUI();
            if (typeof window.generateDynamicOrderInputs === 'function') window.generateDynamicOrderInputs();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            if (typeof window.showToast === 'function') {
                window.showToast(`🗑️ تم حذف (${batchTitle}) نهائياً من النظام!`);
            } else {
                alert(`تم حذف (${batchTitle}) نهائياً بنجاح!`);
            }
        } catch (e) {
            console.error('Delete Batch Error:', e);
            alert('حدث خطأ أثناء الحذف: ' + (e.message || e));
        }
    };

    // إعادة رسم شاشة الدفعات تلقائياً عند تحديث الطلبات لتظل الأرقام حية دائماً
    const _prevScheduleRenderBatches = window.scheduleSystemRender;
    window.scheduleSystemRender = function () {
        if (typeof _prevScheduleRenderBatches === 'function') {
            _prevScheduleRenderBatches();
        }
        const batchesView = document.getElementById('view-batches');
        if (batchesView && batchesView.classList.contains('active')) {
            window.renderBatchesUI();
        }
    };
})();
