// =========================================================================
// 🐣 مركز القيادة الشامل للدفعات، الذبح، التوزيع الذكي، والترحيل (www/batches.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// =========================================================================

(function () {
    // حالة فلترة نافذة كشف تسليمات الدفعة
    window.batchManifestState = {
        activeBatchId: null,
        zoneFilter: 'all',
        statusFilter: 'all_valid'
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
        const zonesMap = {}; // { zoneName: { count: 0, revenue: 0 } }
        const realBookedByProd = {}; // { pId: qty }
        const realBookedByName = {}; // { itemName: qty }

        let totalRevenue = 0;     // إجمالي مبيعات الدفعة (المكتمل + الحي)
        let collectedRevenue = 0; // المحصل الفعلي (المكتمل)
        let pendingRevenue = 0;   // قيد التحصيل (الحي)
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
            const oTotal = Number(o.total) || 0;
            const oDisc = Number(o.discount) || 0;
            const oDebt = Number(o.debt) || 0;

            totalRevenue += oTotal;
            totalDiscounts += oDisc;
            if (oDebt > 0) totalDebt += oDebt;

            if (st === 'completed') {
                completedOrders++;
                collectedRevenue += oTotal;
            } else {
                activeOrders++;
                pendingRevenue += oTotal;
            }

            const zName = (o.zone || 'غير محدد').trim();
            if (!zonesMap[zName]) zonesMap[zName] = { count: 0, revenue: 0, activeCount: 0 };
            zonesMap[zName].count++;
            zonesMap[zName].revenue += oTotal;
            if (st !== 'completed') zonesMap[zName].activeCount++;

            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const q = Number(i.quantity) || 0;
                    if (i.id) {
                        realBookedByProd[i.id] = (realBookedByProd[i.id] || 0) + q;
                    } else {
                        // مطابقة بالاسم إذا كان الطلب قديماً بدون id للصنف
                        const matchedId = Object.keys(prodsObj).find(k => prodsObj[k]?.name === i.name);
                        if (matchedId) realBookedByProd[matchedId] = (realBookedByProd[matchedId] || 0) + q;
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
            realBookedByName,
            totalRevenue,
            collectedRevenue,
            pendingRevenue,
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
                stageLabel = `⏳ اقترب الذبح (باقي ${remainingDays} يوم)`;
                stageColor = 'bg-amber-50 text-amber-700 border-amber-200';
                autoMsg = '⏳ أيام بسيطة جداً والسمان يكون جاهز! استعدوا لاستلام أوردراتكم قريباً.';
            } else if (ageDays <= 15) {
                stageLabel = `🐣 مرحلة التحضين (${ageDays} يوم)`;
                stageColor = 'bg-sky-50 text-sky-700 border-sky-200';
                autoMsg = '🐣 السمان حالياً في مرحلة التحضين والرعاية الأولية، بنجهزلكم أفضل جودة إن شاء الله!';
            } else {
                stageLabel = `📈 مرحلة التسمين (${ageDays}/${targetAge} يوم)`;
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

    // =========================================================================
    // 🎛️ 2. رسم مركز قيادة الدفعات الشامل (renderBatchesUI)
    // =========================================================================
    window.renderBatchesUI = function () {
        const cont = document.getElementById('batches-list-container');
        if (!cont) return;

        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const batchIds = Object.keys(batchesObj).reverse();

        if (batchIds.length === 0) {
            cont.innerHTML = '<div class="w-full text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لا توجد دفعات حالياً. اضغط على (دورة جديدة) بالأعلى للبدء بالتنظيم.</div>';
            return;
        }

        // متغيرات شريط القيادة العلوي المجمع لكل الدفعات
        let globalOpenBatches = 0;
        let globalMeatStock = 0;
        let globalMeatBooked = 0;
        let globalBookedRev = 0;
        let globalCapacityRev = 0;
        const globalOverbookedAlerts = [];

        let cardsHtml = '';

        batchIds.forEach(bId => {
            const b = batchesObj[bId];
            if (!b || typeof b !== 'object') return;
            if (!b.name || b.name === 'undefined' || b.name.trim() === '') {
                b.name = 'دفعة غير مسماة';
                if (typeof db !== 'undefined') {
                    db.collection('inventory').doc('batches').update({ [`${bId}.name`]: b.name }).catch(() => {});
                }
            }

            if (b.isOpen) globalOpenBatches++;

            const metrics = window.getBatchDeepMetrics(bId, b.name);
            const bio = getBatchBioStatus(b);

            let totalMeatStockInBatch = 0;
            let totalMeatBookedInBatch = 0;
            let potentialRemainingRev = 0;
            let hasBookingMismatch = false;

            let stockHtml = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4 border-t border-slate-100 pt-4">';

            Object.keys(prodsObj).forEach(pId => {
                const p = prodsObj[pId];
                if (p.isHidden) return;
                const pName = p.name;
                const bStock = b.stock ? (Number(b.stock[pId]) || 0) : 0;
                const savedBooked = b.booked ? (Number(b.booked[pId]) || 0) : 0;
                const liveBooked = metrics.realBookedByProd[pId] || 0;

                // نعتمد على المحجوز الفعلي المحسوب من الطلبات الحية، ونكشف إن كان هناك اختلاف في الداتابيز
                const bBooked = (metrics.totalOrders > 0 || savedBooked === 0) ? liveBooked : savedBooked;
                if (Math.abs(savedBooked - liveBooked) > 0.01) {
                    hasBookingMismatch = true;
                }

                const remaining = bStock - bBooked;
                const prodPrice = getProdPrice(pId);
                const isMainMeat = isMainQuailProduct(pId);

                if (isMainMeat) {
                    totalMeatStockInBatch += bStock;
                    totalMeatBookedInBatch += bBooked;
                }
                if (remaining > 0) {
                    potentialRemainingRev += (remaining * prodPrice);
                } else if (remaining < 0 && bStock > 0) {
                    globalOverbookedAlerts.push(`${b.name}: عجز ${Math.abs(remaining)} في (${pName})`);
                }

                const remColor = remaining < 0
                    ? 'bg-red-600 text-white border-red-600 animate-pulse'
                    : (remaining === 0 && bStock > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-emerald-50 border-emerald-100 text-emerald-700');

                stockHtml += `
                <div class="bg-slate-50/90 p-3 rounded-2xl border ${remaining < 0 ? 'border-red-300 bg-red-50/30' : 'border-slate-200/70'} flex flex-col justify-between">
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-[11px] font-black text-slate-800 truncate" title="${pName}">${pName}</label>
                        <span class="text-[9px] font-bold text-slate-400">${prodPrice}ج</span>
                    </div>
                    <div class="grid grid-cols-3 gap-1">
                        <div>
                            <span class="text-[9px] text-slate-400 font-bold block text-center mb-0.5">المتاح</span>
                            <input type="number" value="${bStock}" onchange="updateBatchStock('${bId}', '${pId}', this.value)" class="w-full border border-slate-200 bg-white rounded-lg p-1 text-xs font-black text-slate-800 text-center outline-none focus:ring-2 focus:ring-brand-primary/20 shadow-sm">
                        </div>
                        <div onclick="filterOrdersByBatchAndItem('${b.name}', '${pName}')" class="text-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm cursor-pointer hover:border-blue-400" title="اضغط لعرض الطلبات التي حجزت هذا الصنف">
                            <span class="text-[9px] text-slate-400 font-bold block mb-0.5">محجوز</span>
                            <span class="text-xs font-black text-blue-600">${Number(bBooked.toFixed(1))}</span>
                        </div>
                        <div class="text-center border rounded-lg p-1 shadow-sm ${remColor}">
                            <span class="text-[9px] font-bold block mb-0.5">${remaining < 0 ? 'عجز!' : 'متبقي'}</span>
                            <span class="text-xs font-black">${Number(remaining.toFixed(1))}</span>
                        </div>
                    </div>
                </div>`;
            });
            stockHtml += '</div>';

            const batchMaxCapacityRev = metrics.totalRevenue + potentialRemainingRev;
            globalMeatStock += totalMeatStockInBatch;
            globalMeatBooked += totalMeatBookedInBatch;
            globalBookedRev += metrics.totalRevenue;
            globalCapacityRev += batchMaxCapacityRev;

            const sellProgress = totalMeatStockInBatch > 0 ? Math.min(100, Math.round((totalMeatBookedInBatch / totalMeatStockInBatch) * 100)) : 0;

            // بناء شريط مراحل الطلبات التفاعلي (Status Pipeline)
            const sc = metrics.statusCounts;
            const pipelineBarHtml = `
                <div class="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
                    <span class="text-[10px] font-black text-slate-400 ml-1"><i class="fa-solid fa-filter mr-1"></i> مراحل طلبات الدفعة (اضغط للفتح):</span>
                    <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'all')" class="bg-slate-800 text-white px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-slate-900 transition-all">الكل (${metrics.totalOrders})</button>
                    <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'new')" class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all">🆕 جديد (${sc.new})</button>
                    <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'processing')" class="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-amber-500 hover:text-white transition-all">⏳ تجهيز (${sc.processing})</button>
                    <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'dispatched')" class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all">🛵 بالطريق (${sc.dispatched})</button>
                    ${(sc.deferred + sc.no_answer) > 0 ? `<button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'deferred')" class="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-purple-600 hover:text-white transition-all">📵 مؤجل/لم يرد (${sc.deferred + sc.no_answer})</button>` : ''}
                    <button onclick="jumpToBatchOrdersWithStatus('${b.name}', 'completed')" class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-black hover:bg-emerald-600 hover:text-white transition-all">✅ مكتمل (${sc.completed})</button>

                    <div class="mr-auto flex flex-wrap items-center gap-1.5">
                        ${sc.new > 0 ? `<button onclick="bulkMoveBatchNewToProcessing('${bId}', '${b.name}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm transition-all" title="تحويل كل الطلبات الجديدة في هذه الدفعة إلى قيد التجهيز بضغطة واحدة"><i class="fa-solid fa-bolt"></i> تجهيز الـ (${sc.new}) الجديد</button>` : ''}
                        ${metrics.activeOrders > 0 ? `<button onclick="rolloverBatchActiveOrders('${bId}', '${b.name}')" class="bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all" title="ترحيل الطلبات المتبقية غير المسلمة إلى دفعة أخرى"><i class="fa-solid fa-share-from-square"></i> ترحيل المتبقي (${metrics.activeOrders})</button>` : ''}
                        ${hasBookingMismatch ? `<button onclick="syncAndHealBatchBooked('${bId}', '${b.name}')" class="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all animate-pulse" title="تحديث ومطابقة أرقام المحجوز في قاعدة البيانات مع الطلبات الفعلية"><i class="fa-solid fa-rotate"></i> مطابقة المحجوز</button>` : ''}
                    </div>
                </div>
            `;

            // بناء رادار المناطق الجغرافي للدفعة
            const sortedZones = Object.keys(metrics.zonesMap).sort((a, z2) => metrics.zonesMap[z2].count - metrics.zonesMap[a].count);
            let zonesRadarHtml = '';
            if (sortedZones.length > 0) {
                const zPills = sortedZones.map(z => {
                    const zInfo = metrics.zonesMap[z];
                    return `<span onclick="jumpToBatchZoneOrders('${b.name}', '${z}')" class="bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all">📍 ${z}: ${zInfo.count} طلب (${zInfo.revenue.toLocaleString()} ج)</span>`;
                }).join('');
                zonesRadarHtml = `
                    <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
                        <span class="text-[10px] font-black text-slate-400 ml-1"><i class="fa-solid fa-map-location-dot text-indigo-500 mr-1"></i> توزيع مناطق الدفعة:</span>
                        ${zPills}
                    </div>
                `;
            }

            // معلومات التسليم وسقف الأعداد والرسالة الحية
            const delWindowStr = (b.deliveryStart || b.deliveryEnd)
                ? `📅 تسليم المتجر: ${b.deliveryStart || ''} ${b.deliveryEnd ? '⬅️ ' + b.deliveryEnd : ''}`
                : '📅 لم يحدد تاريخ تسليم';
            const pairsCeilingStr = (b.actualPairs || b.publicPairs)
                ? `🎯 الفعلي: ${b.actualPairs || 0} | سقف الجمهور: ${b.publicPairs || 0}`
                : '';

            cardsHtml += `
            <div class="bg-white p-5 rounded-[1.75rem] shadow-soft border border-slate-200/90 relative overflow-hidden mb-5 hover:shadow-md transition-all">
                <div class="absolute top-0 right-0 w-2.5 h-full ${b.isOpen ? 'bg-emerald-500' : 'bg-slate-300'}"></div>

                <!-- الصف العلوي: اسم الدفعة + أزرار التحكم القيادية -->
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pl-2">
                    <div class="flex flex-wrap items-center gap-2 flex-1 w-full">
                        <div class="relative flex-1 min-w-[200px] max-w-md">
                            <i class="fa-solid fa-pen absolute right-3 top-3 text-slate-400 text-xs"></i>
                            <input type="text" value="${b.name}" onchange="updateBatchNameAndOrders('${bId}', this.value)" class="border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white rounded-xl p-2 pr-8 text-sm font-black text-slate-800 w-full outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm" placeholder="اسم الدورة">
                        </div>
                        <span class="px-3 py-1.5 rounded-xl text-[11px] font-black border ${bio.stageColor}">${bio.stageLabel}</span>
                        <span class="bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-xl text-[10px] font-black">${delWindowStr}</span>
                        ${pairsCeilingStr ? `<span class="bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-1.5 rounded-xl text-[10px] font-black">${pairsCeilingStr}</span>` : ''}
                    </div>

                    <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end shrink-0">
                        <div class="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70">
                            <label class="flex items-center gap-1.5 text-[11px] font-black cursor-pointer text-blue-600">
                                <input type="checkbox" ${b.isVisible !== false ? 'checked' : ''} onchange="storeBatches['${bId}'].isVisible = this.checked; db.collection('inventory').doc('batches').update({[\`${bId}.isVisible\`]: this.checked}); renderBatchesUI();" class="w-4 h-4 accent-blue-600 rounded"> ظاهرة بالمتجر
                            </label>
                            <div class="w-px h-4 bg-slate-300"></div>
                            <label class="flex items-center gap-1.5 text-[11px] font-black cursor-pointer text-emerald-600">
                                <input type="checkbox" ${b.isOpen ? 'checked' : ''} onchange="storeBatches['${bId}'].isOpen = this.checked; db.collection('inventory').doc('batches').update({[\`${bId}.isOpen\`]: this.checked}); renderBatchesUI();" class="w-4 h-4 accent-emerald-600 rounded"> مفتوحة للحجز
                            </label>
                        </div>

                        <div class="flex flex-wrap items-center gap-1.5">
                            <button onclick="smartDistributeBatch('${bId}')" class="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-indigo-100" title="توزيع العدد الكلي للدفعة ذكياً على الأصناف"><i class="fa-solid fa-wand-magic-sparkles"></i> توزيع ذكي</button>
                            <button onclick="openSlaughterModal('${bId}')" class="bg-rose-50 text-rose-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-rose-100"><i class="fa-solid fa-knife-kitchen"></i> تم الذبح</button>
                            <button onclick="viewBatchBookings('${bId}')" class="bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-blue-100"><i class="fa-solid fa-list-check"></i> كشف وتحليل</button>
                            <button onclick="openBatchSettings('${bId}')" class="bg-purple-50 text-purple-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-purple-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-purple-100"><i class="fa-solid fa-bullhorn"></i> إعدادات والعمر</button>
                            <button onclick="openBatchBroadcastUI('${bId}')" class="bg-[#25D366]/10 text-[#25D366] px-3 py-2 rounded-xl text-xs font-black hover:bg-[#25D366] hover:text-white transition-all shadow-sm flex items-center gap-1 border border-[#25D366]/20"><i class="fa-brands fa-whatsapp"></i> رسالة للدفعة</button>
                            <button onclick="archiveBatch('${bId}')" class="bg-amber-50 text-amber-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-amber-500 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-amber-200"><i class="fa-solid fa-box-archive"></i> أرشفة</button>
                            <button onclick="deleteBatchUI('${bId}')" class="bg-red-50 text-red-500 w-8 h-8 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center border border-red-100"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>

                <!-- سطر الرسالة التلقائية الظاهرة للعميل حالياً -->
                <div class="mt-2.5 bg-purple-50/50 border border-purple-100 px-3 py-1.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-purple-900">
                    <span><i class="fa-solid fa-eye text-purple-500 mr-1"></i> <strong>رسالة المتجر للعميل الآن:</strong> ${b.urgentNote ? `<span class="text-amber-700 font-black">[تنبيه: ${b.urgentNote}]</span> ` : ''}${bio.autoMsg}</span>
                    ${bio.ageDays !== null ? `
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="text-[10px] text-purple-600 font-black">تعديل سريع للعمر:</span>
                        <button onclick="quickStepBatchAge('${bId}', -1)" class="w-6 h-6 bg-white border border-purple-200 rounded text-purple-700 font-black hover:bg-purple-600 hover:text-white">-</button>
                        <span class="px-1.5 font-black text-xs">${bio.ageDays}ي</span>
                        <button onclick="quickStepBatchAge('${bId}', 1)" class="w-6 h-6 bg-white border border-purple-200 rounded text-purple-700 font-black hover:bg-purple-600 hover:text-white">+</button>
                    </div>` : ''}
                </div>

                <!-- شريط الملخص المالي والقدرة الاستيعابية للدفعة -->
                <div class="mt-3 bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-3.5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-black shadow-sm">
                    <div class="flex flex-wrap items-center gap-3">
                        <span>🥩 أطباق السمان: <strong class="text-emerald-300">حُجز ${Number(totalMeatBookedInBatch.toFixed(1))}</strong> من <strong class="text-white">${totalMeatStockInBatch}</strong> (متبقي: ${Number((totalMeatStockInBatch - totalMeatBookedInBatch).toFixed(1))})</span>
                        <span class="text-slate-600 hidden sm:inline">|</span>
                        <span>💰 مبيعات محجوزة: <strong class="text-amber-400">${metrics.totalRevenue.toLocaleString()} ج</strong> (✅ محصل: ${metrics.collectedRevenue.toLocaleString()} ج | ⏳ حي: ${metrics.pendingRevenue.toLocaleString()} ج)</span>
                        <span class="text-slate-600 hidden sm:inline">|</span>
                        <span class="text-sky-300" title="إجمالي المبيعات لو تم بيع كل الأطباق المتبقية في الدفعة">🚀 طاقة الدفعة القصوى: ${Math.round(batchMaxCapacityRev).toLocaleString()} ج</span>
                    </div>
                    <div class="flex items-center gap-2 w-full md:w-auto shrink-0">
                        <div class="w-32 h-2.5 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full ${sellProgress >= 90 ? 'bg-amber-400' : 'bg-emerald-400'} rounded-full transition-all duration-500" style="width: ${sellProgress}%"></div>
                        </div>
                        <span class="text-[11px] text-emerald-300">حُجز ${sellProgress}%</span>
                    </div>
                </div>

                ${pipelineBarHtml}
                ${zonesRadarHtml}
                ${stockHtml}
            </div>`;
        });

        // بناء لوحة القيادة العلوية الإجمالية لكل الدفعات النشطة
        const globalRemMeat = globalMeatStock - globalMeatBooked;
        const globalProgress = globalMeatStock > 0 ? Math.min(100, Math.round((globalMeatBooked / globalMeatStock) * 100)) : 0;

        let overbookBanner = '';
        if (globalOverbookedAlerts.length > 0) {
            overbookBanner = `
                <div class="bg-red-600 text-white p-3.5 rounded-2xl shadow-md mb-4 flex items-center justify-between gap-3">
                    <div class="text-xs font-black">
                        <i class="fa-solid fa-triangle-exclamation text-amber-300 mr-1"></i>
                        تنبيه تخطي الكمية المتاحة (Overbooking): ${globalOverbookedAlerts.join(' ، ')}
                    </div>
                </div>
            `;
        }

        const topCommandSummaryHtml = `
            ${overbookBanner}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft text-center">
                    <span class="text-[10px] font-bold text-slate-400 block mb-1">الدورات المفتوحة للحجز</span>
                    <span class="text-2xl font-black text-teal-600">${globalOpenBatches} <span class="text-xs text-slate-400">من ${batchIds.length}</span></span>
                </div>
                <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft text-center">
                    <span class="text-[10px] font-bold text-slate-400 block mb-1">إجمالي السمان المحجوز / المتاح</span>
                    <span class="text-2xl font-black text-brand-primary">${Number(globalMeatBooked.toFixed(1))} <span class="text-xs text-slate-400">/ ${globalMeatStock} طبق (${globalProgress}%)</span></span>
                </div>
                <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft text-center">
                    <span class="text-[10px] font-bold text-slate-400 block mb-1">المتبقي المتاح للبيع الآن</span>
                    <span class="text-2xl font-black ${globalRemMeat <= 0 ? 'text-rose-600' : 'text-emerald-600'}">${Number(globalRemMeat.toFixed(1))} <span class="text-xs">طبق سمان</span></span>
                </div>
                <div class="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 shadow-soft text-center">
                    <span class="text-[10px] font-black text-amber-800 block mb-1">إجمالي الحجوزات / الطاقة القصوى</span>
                    <span class="text-xl font-black text-amber-700">${globalBookedRev.toLocaleString()} <span class="text-[11px] text-slate-500">/ ${Math.round(globalCapacityRev).toLocaleString()} ج</span></span>
                </div>
            </div>
        `;

        cont.innerHTML = topCommandSummaryHtml + cardsHtml;
    };

    // =========================================================================
    // ⚡ 3. الأدوات القيادية السريعة للدفعة (القفز للطلبات، التجهيز الجماعي، الترحيل، والمزامنة)
    // =========================================================================

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
            const movedItemsQty = {};

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
                if (Array.isArray(o.items)) {
                    o.items.forEach(i => {
                        if (i.id) movedItemsQty[i.id] = (movedItemsQty[i.id] || 0) + (Number(i.quantity) || 0);
                    });
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

        // تجميع الأصناف للطلبات المفلترة في الكشف
        const filteredItemsSum = {};
        let filteredMoneySum = 0;

        filteredOrders.forEach(o => {
            filteredMoneySum += (Number(o.total) || 0);
            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    const nm = i.name || 'صنف';
                    filteredItemsSum[nm] = (filteredItemsSum[nm] || 0) + (Number(i.quantity) || 0);
                });
            }
        });

        // بناء خيارات فلتر المناطق داخل الكشف
        let zoneOpts = `<option value="all">📍 كل المناطق (${allValidOrders.length} طلب)</option>`;
        Object.keys(metrics.zonesMap).sort((a, b2) => metrics.zonesMap[b2].count - metrics.zonesMap[a].count).forEach(z => {
            zoneOpts += `<option value="${z}" ${zFilter === z ? 'selected' : ''}>📍 ${z} (${metrics.zonesMap[z].count} طلب)</option>`;
        });

        // بناء كروت إجمالي الأصناف المطلوبة في الكشف
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
            const payStr = o.paymentMethod === 'online' ? '<span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black block">خالص أونلاين</span>' : '';

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
            <!-- شريط فلاتر الكشف (لا يظهر في الطباعة) -->
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
                <div class="flex flex-wrap items-center gap-2">
                    <select onchange="setBatchManifestFilter('zoneFilter', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-indigo-900 outline-none">${zoneOpts}</select>
                    <select onchange="setBatchManifestFilter('statusFilter', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none">
                        <option value="all_valid" ${sFilter === 'all_valid' ? 'selected' : ''}>📦 كل حجوزات الدفعة</option>
                        <option value="active_only" ${sFilter === 'active_only' ? 'selected' : ''}>⏳ المتبقي للتسليم فقط</option>
                        <option value="completed" ${sFilter === 'completed' ? 'selected' : ''}>✅ المسلم فقط</option>
                    </select>
                </div>
                <span class="text-xs font-black text-slate-500">عدد الطلبات بالكشف: <strong class="text-slate-900">${filteredOrders.length}</strong> | إجماليها: <strong class="text-brand-primary">${filteredMoneySum.toLocaleString()} ج</strong></span>
            </div>

            <!-- ملخص إجمالي الأصناف المطلوبة في الكشف -->
            <div class="mb-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="text-xs font-black text-slate-700 mb-2.5"><i class="fa-solid fa-boxes-packing text-teal-600 mr-1"></i> إجمالي الأصناف المطلوبة في هذا الكشف (${filteredOrders.length} طلب):</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">${itemsPillsHtml}</div>
            </div>

            <!-- جدول الكشف التفصيلي -->
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

        // 1. التعلم من الدفعات المؤرشفة
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

        // 2. إذا لم يكفِ الأرشيف، نتعلم من الدفعات الحية الأخرى
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

        // 3. إذا لم يوجد تاريخ سابق، نوزع بالتساوي
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
            if (p.isHidden) return;
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
