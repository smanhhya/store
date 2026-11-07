// =========================================================================
// 🐣 المحرك المستقل لإدارة الدفعات، الذبح، التوزيع الذكي، والترحيل (www/batches.js)
/
/ خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// =========================================================================

(function () {
    // حساب إحصائيات الدفعة الحية من الطلبات الموجودة في الذاكرة دون استهلاك قراءات فايربيس
    function getBatchLiveMetrics(bId, bName) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        let totalOrders = 0;
        let completedOrders = 0;
        let activeOrders = 0;
        let totalRevenue = 0;
        let collectedRevenue = 0;
        const realBookedByProd = {};

        ordersList.forEach(o => {
            if (!o || o.status === 'trash' || o.status === 'canceled') return;
            const matchId = (o.batchId && o.batchId === bId);
            const matchName = (bName && o.batchName && o.batchName.trim() === bName.trim());
            if (!matchId && !matchName) return;

            totalOrders++;
            const oTotal = Number(o.total) || 0;
            totalRevenue += oTotal;

            if (o.status === 'completed') {
                completedOrders++;
                collectedRevenue += oTotal;
            } else {
                activeOrders++;
            }

            if (Array.isArray(o.items)) {
                o.items.forEach(i => {
                    if (i.id) {
                        realBookedByProd[i.id] = (realBookedByProd[i.id] || 0) + (Number(i.quantity) || 0);
                    }
                });
            }
        });

        return { totalOrders, completedOrders, activeOrders, totalRevenue, collectedRevenue, realBookedByProd };
    }

    // 1. رسم شاشة إدارة الدفعات المطورة (مع شريط تقدم المبيعات وعمر السمان اللحظي)
    window.renderBatchesUI = function () {
        const cont = document.getElementById('batches-list-container');
        if (!cont) return;

        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        if (Object.keys(batchesObj).length === 0) {
            cont.innerHTML = '<div class="w-full text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لا توجد دفعات حالياً. أضف دورة جديدة للبدء بالتنظيم.</div>';
            return;
        }

        cont.innerHTML = '';

        Object.keys(batchesObj).reverse().forEach(bId => {
            const b = batchesObj[bId];
            if (!b || typeof b !== 'object') return;
            if (!b.name || b.name === 'undefined' || b.name.trim() === '') {
                b.name = 'دفعة غير مسماة';
                if (typeof db !== 'undefined') {
                    db.collection('inventory').doc('batches').update({ [`${bId}.name`]: b.name }).catch(() => {});
                }
            }

            const metrics = getBatchLiveMetrics(bId, b.name);

            // حساب عمر السمان اليوم تلقائياً إن وجد تاريخ فقس
            let ageBadgeHtml = '';
            if (b.hatchDate) {
                const ageDays = Math.max(0, Math.floor((Date.now() - b.hatchDate) / (1000 * 60 * 60 * 24)));
                const targetAge = b.slaughterAge || 40;
                ageBadgeHtml = `<span class="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-lg text-[10px] font-black">🐣 العمر اليوم: ${ageDays} / ${targetAge} يوم</span>`;
            }

            // حساب إجمالي المعروض والمحجوز
            let totalStockCount = 0;
            let totalBookedCount = 0;

            let stockHtml = '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 border-t border-slate-100 pt-4">';
            Object.keys(prodsObj).forEach(pId => {
                const pName = prodsObj[pId].name;
                const bStock = b.stock ? (Number(b.stock[pId]) || 0) : 0;
                const savedBooked = b.booked ? (Number(b.booked[pId]) || 0) : 0;
                // نأخذ الرقم الفعلي المحسوب من الطلبات الحية أو المسجل لضمان الدقة
                const bBooked = metrics.totalOrders > 0 ? (metrics.realBookedByProd[pId] || 0) : savedBooked;
                const remaining = bStock - bBooked;

                if (!prodsObj[pId].isExtra) {
                    totalStockCount += bStock;
                    totalBookedCount += bBooked;
                }

                const remColor = remaining <= 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700';

                stockHtml += `
                <div class="bg-slate-50/80 p-3 rounded-xl border border-slate-200/60">
                    <label class="text-[11px] font-black text-slate-700 block truncate mb-2" title="${pName}">${pName}</label>
                    <div class="flex items-center gap-1.5">
                        <div class="flex-1">
                            <span class="text-[9px] text-slate-400 font-bold block text-center mb-0.5">المتاح</span>
                            <input type="number" value="${bStock}" onchange="updateBatchStock('${bId}', '${pId}', this.value)" class="w-full border border-slate-200 bg-white rounded-lg p-1.5 text-xs font-black text-slate-800 text-center outline-none focus:ring-2 focus:ring-brand-primary/20 shadow-sm transition-all">
                        </div>
                        <div class="flex-1 text-center bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm">
                            <span class="text-[9px] text-slate-400 font-bold block mb-0.5">محجوز</span>
                            <span class="text-xs font-black text-blue-600">${Number(bBooked.toFixed(1))}</span>
                        </div>
                        <div class="flex-1 text-center border rounded-lg p-1.5 shadow-sm ${remColor}">
                            <span class="text-[9px] font-bold block mb-0.5">متبقي</span>
                            <span class="text-xs font-black">${Number(remaining.toFixed(1))}</span>
                        </div>
                    </div>
                </div>`;
            });
            stockHtml += '</div>';

            const sellProgress = totalStockCount > 0 ? Math.min(100, Math.round((totalBookedCount / totalStockCount) * 100)) : 0;

            cont.innerHTML += `
            <div class="bg-white p-5 rounded-[1.5rem] shadow-soft border border-slate-200/80 relative overflow-hidden mb-4 hover:shadow-md transition-shadow">
                <div class="absolute top-0 right-0 w-2 h-full ${b.isOpen ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pl-2">
                    <div class="flex-1 w-full relative">
                        <i class="fa-solid fa-pen absolute right-3 top-3.5 text-slate-400 text-xs"></i>
                        <input type="text" value="${b.name}" onchange="updateBatchNameAndOrders('${bId}', this.value)" class="border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white rounded-xl p-2.5 pr-8 text-sm font-black text-slate-800 w-full md:w-3/4 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm" placeholder="اسم الدورة (مثال: دفعة الخميس)">
                    </div>

                    <div class="flex flex-col md:flex-row items-start md:items-center gap-3 w-full md:w-auto justify-between shrink-0">
                        <div class="flex flex-wrap items-center gap-3">
                            ${ageBadgeHtml}
                            <label class="flex items-center gap-1.5 text-[11px] font-black cursor-pointer text-blue-600">
                                <input type="checkbox" ${b.isVisible !== false ? 'checked' : ''} onchange="storeBatches['${bId}'].isVisible = this.checked; db.collection('inventory').doc('batches').update({[\`${bId}.isVisible\`]: this.checked}); renderBatchesUI();" class="w-4 h-4 accent-blue-600 rounded"> ظاهرة بالمتجر
                            </label>
                            <label class="flex items-center gap-1.5 text-[11px] font-black cursor-pointer text-emerald-600">
                                <input type="checkbox" ${b.isOpen ? 'checked' : ''} onchange="storeBatches['${bId}'].isOpen = this.checked; db.collection('inventory').doc('batches').update({[\`${bId}.isOpen\`]: this.checked}); renderBatchesUI();" class="w-4 h-4 accent-emerald-600 rounded"> مفتوحة للحجز
                            </label>
                        </div>

                        <div class="flex flex-wrap items-center gap-1.5">
                            <button onclick="smartDistributeBatch('${bId}')" class="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-indigo-100"><i class="fa-solid fa-wand-magic-sparkles"></i> توزيع ذكي</button>
                            <button onclick="openSlaughterModal('${bId}')" class="bg-rose-50 text-rose-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-rose-100"><i class="fa-solid fa-knife-kitchen"></i> تم الذبح</button>
                            <button onclick="archiveBatch('${bId}')" class="bg-amber-50 text-amber-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-amber-500 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-amber-200"><i class="fa-solid fa-box-archive"></i> إغلاق وأرشفة</button>
                            <button onclick="viewBatchBookings('${bId}')" class="bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-blue-100"><i class="fa-solid fa-list-check"></i> الكشف</button>
                            <button onclick="openBatchSettings('${bId}')" class="bg-purple-50 text-purple-600 px-3 py-2 rounded-xl text-xs font-black hover:bg-purple-600 hover:text-white transition-all shadow-sm flex items-center gap-1 border border-purple-100"><i class="fa-solid fa-bullhorn"></i> إعدادات</button>
                            <button onclick="openBatchBroadcastUI('${bId}')" class="bg-[#25D366]/10 text-[#25D366] px-3 py-2 rounded-xl text-xs font-black hover:bg-[#25D366] hover:text-white transition-all shadow-sm flex items-center gap-1 border border-[#25D366]/20"><i class="fa-brands fa-whatsapp"></i> واتساب</button>
                            <button onclick="deleteBatchUI('${bId}')" class="bg-red-50 text-red-500 w-8 h-8 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center border border-red-100"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>

                <!-- شريط الملخص المالي ونسبة حجز الدفعة اللحظي -->
                <div class="mt-3 bg-slate-900 text-white p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-black">
                    <div class="flex flex-wrap items-center gap-3">
                        <span>📦 حجوزات الدفعة: <strong class="text-amber-400">${metrics.totalOrders} طلب</strong> (✅ مسلم: ${metrics.completedOrders} | ⏳ حي: ${metrics.activeOrders})</span>
                        <span class="text-slate-600 hidden sm:inline">|</span>
                        <span>💰 إجمالي مبيعاتها: <strong class="text-emerald-400">${metrics.totalRevenue.toLocaleString()} ج</strong> (محصل: ${metrics.collectedRevenue.toLocaleString()} ج)</span>
                        ${b.expectedValue ? `<span class="text-rose-300">| قيمة الذبح: ${b.expectedValue.toLocaleString()} ج</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <div class="w-28 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full bg-emerald-400 rounded-full" style="width: ${sellProgress}%"></div>
                        </div>
                        <span class="text-[10px] text-emerald-300">حُجز ${sellProgress}%</span>
                    </div>
                </div>

                ${stockHtml}
            </div>`;
        });
    };

    // 2. توحيد وتطوير خوارزمية التوزيع الذكي (تتعلم من الأرشيف + الدفعات الحية معاً دون فشل)
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
            if (!prodsObj[id].isExtra) {
                validMainProducts[prodsObj[id].name] = id;
                mainProdIds.push(id);
            }
        });

        if (mainProdIds.length === 0) return alert('لا توجد أصناف أساسية مسجلة في المتجر!');

        const historyWeightsById = {};
        let grandTotalHistory = 0;

        // أولاً: التعلم من الدفعات المؤرشفة
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

        // ثانياً: إذا لم يكفِ الأرشيف، نتعلم من الدفعات الحية الأخرى ومن الطلبات المسلمة
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

        // ثالثاً: إذا لم يوجد تاريخ سابق نهائياً، نوزع بالتساوي
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
        try {
            await db.collection('inventory').doc('batches').set({
                [bId]: { stock: newStock }
            }, { merge: true });
            window.renderBatchesUI();
            if (typeof window.showToast === 'function') window.showToast('✨ تم التوزيع الذكي للدفعة بنجاح!');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ التوزيع الذكي!');
        }
    };

    // 3. توحيد وتطوير نافذة "إتمام الذبح للدفعة" (توضح المحجوز للعملاء وما سيترحل للفريزر)
    window.openSlaughterModal = function (bId) {
        const b = storeBatches[bId];
        if (!b) return;
        document.getElementById('slaughter-batch-id').value = bId;

        const cont = document.getElementById('slaughter-items-container');
        if (!cont) return;

        const metrics = getBatchLiveMetrics(bId, b.name);
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};

        let html = '';
        Object.keys(prodsObj).forEach(id => {
            const p = prodsObj[id];
            const plannedStock = (b.stock && b.stock[id]) ? Number(b.stock[id]) : 0;
            const bookedNow = metrics.realBookedByProd[id] || (b.booked && b.booked[id] ? Number(b.booked[id]) : 0);
            const currentSlaughtered = (b.slaughtered && b.slaughtered[id] !== undefined)
                ? Number(b.slaughtered[id])
                : plannedStock;

            html += `
            <div class="flex justify-between items-center bg-white shadow-sm border border-slate-200/80 p-3 rounded-xl hover:border-rose-300 transition-colors">
                <div>
                    <span class="font-black text-slate-800 text-sm block">${p.name}</span>
                    <span class="text-[10px] font-bold text-slate-400">المخطط: ${plannedStock} | محجوز للعملاء: <strong class="text-blue-600">${bookedNow}</strong></span>
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
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};

        let slaughteredData = {};
        let expectedValue = 0;
        let freezerNewData = { ...(typeof storeFreezer !== 'undefined' ? storeFreezer : {}) };
        let freezerChanged = false;

        Object.keys(prodsObj).forEach(id => {
            const inputEl = document.getElementById(`slaughter-q-${id}`);
            const q = inputEl ? (parseInt(inputEl.value) || 0) : 0;
            if (q >= 0) {
                slaughteredData[id] = q;
                const price = Number(pricesObj[id] || prodsObj[id].basePrice) || 0;
                expectedValue += (q * price);

                const oldSlaughtered = (storeBatches[bId].slaughtered && storeBatches[bId].slaughtered[id]) ? Number(storeBatches[bId].slaughtered[id]) : 0;
                const diff = q - oldSlaughtered;
                if (diff !== 0) {
                    const curFz = Math.max(0, Number(freezerNewData[id]) || 0);
                    freezerNewData[id] = Math.max(0, curFz + diff);
                    storeFreezer[id] = freezerNewData[id];
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
})();
