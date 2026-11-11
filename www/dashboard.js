// =========================================================================
// 🚀 المحرك الشامل للوحة القيادة الفائقة، التدقيق المحاسبي، الفريزر، والأرشيف (www/dashboard.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// =========================================================================

(function () {
    const now = new Date();
    const defaultMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. حالة لوحة القيادة والفلاتر
    window.dashState = {
        period: 'this_month',        // 'today' | 'this_month' | 'last_month' | 'pick_month' | 'custom' | 'all_time'
        selectedMonth: defaultMonthStr,
        dateFrom: '',
        dateTo: '',
        sourceFilter: 'all',         // 'all' | 'batches_only' | 'normal_only' | 'batch:BATCH_KEY'
        dateBasis: 'effective',      // 'effective' (تاريخ التسليم الفعلي) | 'created' (تاريخ إنشاء الطلب)
        activeSubTab: 'overview',    // 'overview' | 'ledger_waste' | 'vip_zones'
        tableSubFilter: 'all_valid', // 'all_valid' | 'completed' | 'all_active' | 'discounted' | 'debt' | 'canceled'
        tableSearch: ''
    };

    window.storeLedgerRecords = {};

    // دالة التنبيهات السريعة (Toast)
    if (typeof window.showToast !== 'function') {
        window.showToast = function (msg) {
            let toast = document.getElementById('global-toast-notif');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'global-toast-notif';
                toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-2xl text-xs font-black shadow-2xl z-[250] transition-all duration-300 opacity-0 pointer-events-none';
                document.body.appendChild(toast);
            }
            toast.innerText = msg;
            toast.classList.remove('opacity-0');
            toast.classList.add('opacity-100');
            clearTimeout(window._toastTimer);
            window._toastTimer = setTimeout(() => {
                toast.classList.remove('opacity-100');
                toast.classList.add('opacity-0');
            }, 3200);
        };
    }

    // =========================================================================
    // 🧮 أولاً: دوال التدقيق الحسابي ومنع السالب في الفريزر وتوحيد الدفعات
    // =========================================================================

    // جلب السعر الفعلي للصنف من storePrices أو basePrice
    window.getProductRealPrice = function (pId) {
        const pricesObj = (typeof storePrices !== 'undefined' && storePrices) ? storePrices : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        return Number(pricesObj[pId] || (prodsObj[pId] ? prodsObj[pId].basePrice : 0)) || 0;
    };

    // تصنيف الصنف (سمان لحم / كتاكيت / بيض) لمنع خلط الأعداد في المتوسطات
    window.classifyOrderItem = function (item) {
        const id = String(item?.id || '').toLowerCase();
        const name = String(item?.name || '').toLowerCase();
        if (id === 'eggs' || name.includes('بيض')) {
            return { type: 'egg', unitLabel: 'طبق بيض', isMeat: false };
        }
        if (id === 'chicks' || name.includes('كتكوت') || name.includes('كتاكيت') || name.includes('أعمار') || name.includes('عمر')) {
            return { type: 'chick', unitLabel: 'كتكوت', isMeat: false };
        }
        return { type: 'meat', unitLabel: 'طبق/جوز', isMeat: true };
    };

    // تدقيق حسابات الطلب الواحد (صافي حساب المالك بدون مصاريف التوصيل الخاصة بالمناديب)
    window.getAccurateOrderFinancials = function (o) {
        if (!o) return { subtotal: 0, delivery: 0, driverDelivery: 0, discount: 0, total: 0, implicitDiscount: 0 };
        let itemsCalcSum = 0;
        let implicitDisc = 0;

        if (Array.isArray(o.items)) {
            o.items.forEach(item => {
                const q = Number(item.quantity) || 0;
                const p = Number(item.price) || 0;
                itemsCalcSum += (q * p);

                const listPrice = window.getProductRealPrice(item.id);
                if (listPrice > 0 && p > 0 && p < listPrice) {
                    implicitDisc += (listPrice - p) * q;
                }
            });
        }

        const driverDelivery = Number(o.deliveryFee) || 0;
        const discount = Number(o.discount) || 0;
        const rawTotal = Number(o.total);
        const rawSub = Number(o.subtotal);

        const subtotal = !isNaN(rawSub) && rawSub > 0
            ? rawSub
            : (itemsCalcSum > 0 ? itemsCalcSum : Math.max(0, (rawTotal || 0) - driverDelivery + discount));

        // الصافي الحقيقي للمالك = قيمة المنتجات ناقص الخصم فقط (بدون التوصيل نهائياً)
        const netOwnerTotal = Math.max(0, Math.round(subtotal - discount));

        return {
            subtotal: Math.round(subtotal),
            delivery: 0,
            driverDelivery: Math.round(driverDelivery),
            discount: Math.round(discount),
            total: netOwnerTotal,
            implicitDiscount: Math.round(implicitDisc)
        };
    };


    // ربط ذكي للطلب بالدفعة الخاصة به حتى لو كان يحمل batchId فقط أو تم أرشفة الدفعة
    window.resolveOrderBatchName = function (o) {
        if (!o) return '';
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const archivedArr = (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData)) ? archivedBatchesData : [];

        if (o.batchId && batchesObj[o.batchId] && batchesObj[o.batchId].name && batchesObj[o.batchId].name !== 'undefined') {
            return batchesObj[o.batchId].name.trim();
        }
        if (o.batchId) {
            const archMatch = archivedArr.find(a => a && (a.originalBatchId === o.batchId || a.id === o.batchId));
            if (archMatch && archMatch.batchName) return archMatch.batchName.trim();
        }
        if (o.batchName && o.batchName !== 'undefined' && o.batchName.trim() !== '') {
            return o.batchName.trim();
        }
        return '';
    };

    // 🧊 علاج مشكلة الفريزر بالسالب نهائياً (تصفير أي رقم سالب في الذاكرة وقاعدة البيانات)
    window.sanitizeFreezerNegativeValues = async function (showAlert = false) {
        if (typeof storeFreezer === 'undefined' || !storeFreezer) return;
        const fixes = {};
        let hadNegative = false;

        Object.keys(storeFreezer).forEach(pId => {
            const val = Number(storeFreezer[pId]) || 0;
            if (val < 0) {
                storeFreezer[pId] = 0;
                fixes[pId] = 0;
                hadNegative = true;
                const inputEl = document.getElementById(`fz-${pId}`);
                if (inputEl) inputEl.value = 0;
            }
        });

        if (hadNegative && typeof db !== 'undefined') {
            try {
                await db.collection('inventory').doc('freezer').set(fixes, { merge: true });
                if (showAlert) window.showToast('❄️ تم تصحيح وتصفير الأرقام السالبة في الفريزر بنجاح!');
            } catch (e) {
                console.log('Freezer sanitize info:', e);
            }
        } else if (showAlert) {
            window.showToast('❄️ الفريزر مضبوط ولا توجد أي أرقام سالبة');
        }
        window.renderSmartDashboard();
    };

    // تصفير الفريزر بالكامل بضغطة زر عند الحاجة
    window.resetAllFreezerToZero = async function () {
        if (!confirm('❄️ هل تريد تصفير كل أصناف مخزن الفريزر إلى (0) الآن؟')) return;
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const zeroData = {};
        Object.keys(prodsObj).forEach(id => {
            storeFreezer[id] = 0;
            zeroData[id] = 0;
            const inputEl = document.getElementById(`fz-${id}`);
            if (inputEl) inputEl.value = 0;
        });
        Object.keys(storeFreezer || {}).forEach(id => {
            storeFreezer[id] = 0;
            zeroData[id] = 0;
        });

        try {
            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('freezer').set(zeroData, { merge: true });
            }
            window.renderSmartDashboard();
            window.showToast('❄️ تم تصفير مخزن الفريزر بالكامل إلى 0');
        } catch (e) {
            alert('حدث خطأ أثناء تصفير الفريزر!');
        }
    };

    // =========================================================================
    // 📦 ثانياً: نظام أرشفة الدفعات واستعادتها المضمون 100%
    // =========================================================================

    function formatArchiveDate(a) {
        if (!a) return '';
        if (a.archivedAtMs) return new Date(a.archivedAtMs).toLocaleDateString('ar-EG');
        if (a.archivedAt && typeof a.archivedAt.toMillis === 'function') {
            return new Date(a.archivedAt.toMillis()).toLocaleDateString('ar-EG');
        }
        if (typeof a.archivedAt === 'number') return new Date(a.archivedAt).toLocaleDateString('ar-EG');
        return new Date().toLocaleDateString('ar-EG');
    }

    window.loadAllArchivedBatchesSafe = async function () {
        if (typeof db === 'undefined') return;
        const map = {};

        try {
            const invDoc = await db.collection('inventory').doc('archived_batches').get();
            if (invDoc.exists) {
                const data = invDoc.data() || {};
                Object.keys(data).forEach(k => {
                    if (data[k] && typeof data[k] === 'object') {
                        map[k] = { id: k, ...data[k] };
                    }
                });
            }
        } catch (e) { console.log('Info: inventory/archived_batches read', e); }

        try {
            const colSnap = await db.collection('archived_batches').get();
            colSnap.forEach(doc => {
                map[doc.id] = { id: doc.id, ...doc.data() };
            });
        } catch (e) { console.log('Info: archived_batches collection read', e); }

        window.archivedBatchesData = Object.values(map).sort((a, b) => {
            const tA = a.archivedAtMs || (a.archivedAt && typeof a.archivedAt.toMillis === 'function' ? a.archivedAt.toMillis() : 0);
            const tB = b.archivedAtMs || (b.archivedAt && typeof b.archivedAt.toMillis === 'function' ? b.archivedAt.toMillis() : 0);
            return tB - tA;
        });

        if (typeof window.renderArchiveUI === 'function') window.renderArchiveUI();
        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
    };

    window.archiveBatch = async function (bId) {
        const b = (typeof storeBatches !== 'undefined') ? storeBatches[bId] : null;
        if (!b) return alert('لم يتم العثور على بيانات هذه الدفعة!');

        if (!confirm(`⚠️ هل أنت متأكد من إغلاق وترحيل دفعة (${b.name}) للأرشيف؟\n\nسيتم حفظ تقريرها الختامي وأرباحها في قسم (أرشيف الدفعات)، وإخفاء طلباتها المكتملة والملغية من الشاشة الحية.`)) return;

        try {
            const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
            let bOrders = ordersList.filter(o => o.batchId === bId || (b.name && window.resolveOrderBatchName(o) === b.name.trim()));

            if (bOrders.length === 0 && typeof db !== 'undefined') {
                const snap = await db.collection('orders').where('batchId', '==', bId).get();
                snap.forEach(doc => bOrders.push({ id: doc.id, ...doc.data() }));
            }

            const activeRemaining = bOrders.filter(o => ['new', 'processing', 'dispatched', 'deferred', 'no_answer'].includes(o.status));
            let convertActiveToCompleted = false;
            if (activeRemaining.length > 0) {
                const proceed = confirm(`🔔 تنبيه مهم: يوجد عدد (${activeRemaining.length}) طلب في هذه الدفعة ما زال في حالة (تجهيز/جديد/في الطريق) ولم يتحول إلى (مكتمل).\n\nاضغط (موافق) لتحويلها إلى مكتمل وحسابها في أرباح الدفعة وأرشفتها الآن، أو اضغط (إلغاء) لمراجعتها أولاً.`);
                if (!proceed) return;
                convertActiveToCompleted = true;
            }

            let totalRev = 0, totalDel = 0, totalDisc = 0, itemsMap = {}, zonesMap = {};
            let ordersToArchiveIds = [];
            let ordersToCompleteAndArchiveIds = [];
            const nowStr = new Date().toLocaleDateString('en-US');
            const timeDisp = new Date().toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            bOrders.forEach(o => {
                if (o.status === 'trash') return;
                const isComp = (o.status === 'completed') || (convertActiveToCompleted && o.status !== 'canceled');

                if (isComp) {
                    const fin = window.getAccurateOrderFinancials(o);
                    totalRev += fin.total;
                    totalDel += fin.delivery;
                    totalDisc += fin.discount;

                    let z = o.zone || 'غير محدد';
                    zonesMap[z] = (zonesMap[z] || 0) + 1;

                    if (o.items && Array.isArray(o.items)) {
                        o.items.forEach(i => {
                            itemsMap[i.name] = (itemsMap[i.name] || 0) + (Number(i.quantity) || 0);
                        });
                    }

                    if (o.status !== 'completed') {
                        ordersToCompleteAndArchiveIds.push(o.id);
                        o.status = 'completed';
                        o.completedAtStr = nowStr;
                        o.completedTimeDisplay = timeDisp;
                    } else {
                        ordersToArchiveIds.push(o.id);
                    }
                } else if (o.status === 'canceled') {
                    ordersToArchiveIds.push(o.id);
                }
            });

            const arId = 'arch_' + bId + '_' + Date.now();
            const nowMs = Date.now();
            const completedOrdersTotalCount = ordersToArchiveIds.filter(id => {
                const ord = bOrders.find(x => x.id === id);
                return ord && ord.status === 'completed';
            }).length + ordersToCompleteAndArchiveIds.length;

            const archiveData = {
                id: arId,
                batchName: b.name,
                originalBatchId: bId,
                totalRevenue: totalRev,
                totalDelivery: totalDel,
                totalDiscount: totalDisc,
                ordersCount: completedOrdersTotalCount,
                itemsSummary: itemsMap,
                zonesSummary: zonesMap,
                rawStock: b.stock || {},
                rawBooked: b.booked || {},
                actualPairs: b.actualPairs || 0,
                publicPairs: b.publicPairs || 0,
                expectedValue: b.expectedValue || 0,
                slaughtered: b.slaughtered || {},
                archivedAtMs: nowMs
            };

            await db.collection('inventory').doc('archived_batches').set({
                [arId]: archiveData
            }, { merge: true });

            db.collection('archived_batches').doc(arId).set({
                ...archiveData,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});

            await db.collection('inventory').doc('batches').update({
                [bId]: firebase.firestore.FieldValue.delete()
            });

            const allTargetIds = [
                ...ordersToArchiveIds.map(id => ({ id, makeCompleted: false })),
                ...ordersToCompleteAndArchiveIds.map(id => ({ id, makeCompleted: true }))
            ];

            for (let i = 0; i < allTargetIds.length; i += 400) {
                const chunk = allTargetIds.slice(i, i + 400);
                const batchWrite = db.batch();
                chunk.forEach(item => {
                    if (!item.id) return;
                    const upObj = { isArchived: true, batchName: b.name };
                    if (item.makeCompleted) {
                        upObj.status = 'completed';
                        upObj.completedAtStr = nowStr;
                        upObj.completedTimeDisplay = timeDisp;
                        upObj.completedAt = firebase.firestore.FieldValue.serverTimestamp();
                    }
                    batchWrite.update(db.collection('orders').doc(item.id), upObj);
                });
                await batchWrite.commit();
            }

            delete storeBatches[bId];
            if (!Array.isArray(window.archivedBatchesData)) window.archivedBatchesData = [];
            window.archivedBatchesData.unshift(archiveData);

            ordersList.forEach(o => {
                if ((o.batchId === bId || window.resolveOrderBatchName(o) === b.name.trim()) && (o.status === 'completed' || o.status === 'canceled')) {
                    o.isArchived = true;
                    o.batchName = b.name;
                    if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                        globalOrdersMap[o.id].isArchived = true;
                        globalOrdersMap[o.id].batchName = b.name;
                    }
                }
            });

            if (typeof window.renderBatchesUI === 'function') window.renderBatchesUI();
            if (typeof window.renderArchiveUI === 'function') window.renderArchiveUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            window.showToast(`✅ تم إغلاق وأرشفة (${b.name}) بإجمالي ${totalRev.toLocaleString()} ج!`);
            alert(`تم إغلاق الدفعة (${b.name}) وترحيلها للأرشيف بنجاح!\nإجمالي مبيعاتها المعتمدة: ${totalRev.toLocaleString()} ج.م 🚀📊`);
        } catch (e) {
            console.error('Archive Error:', e);
            alert('حدث خطأ أثناء أرشفة الدفعة: ' + (e.message || e));
        }
    };

    window.unarchiveBatch = async function (arId) {
        const list = Array.isArray(window.archivedBatchesData) ? window.archivedBatchesData : [];
        const a = list.find(x => x.id === arId);
        if (!a) return alert('لم يتم العثور على هذه الدفعة في الأرشيف!');

        if (!confirm(`↩️ هل أنت متأكد من استعادة دفعة (${a.batchName}) إلى شاشة الدفعات الحية؟`)) return;

        const btn = document.getElementById('btn-unarchive');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الاستعادة...'; btn.disabled = true; }

        try {
            const targetBatchId = a.originalBatchId || ('batch_' + Date.now());
            const restoredBatch = {
                name: a.batchName,
                isOpen: false,
                isVisible: true,
                stock: a.rawStock || {},
                booked: a.rawBooked || {},
                actualPairs: a.actualPairs || 0,
                publicPairs: a.publicPairs || 0,
                slaughtered: a.slaughtered || {},
                expectedValue: a.expectedValue || 0
            };

            await db.collection('inventory').doc('batches').set({
                [targetBatchId]: restoredBatch
            }, { merge: true });

            await db.collection('inventory').doc('archived_batches').update({
                [arId]: firebase.firestore.FieldValue.delete()
            }).catch(() => {});
            await db.collection('archived_batches').doc(arId).delete().catch(() => {});

            const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
            const affectedOrders = ordersList.filter(o => (o.batchId === targetBatchId || window.resolveOrderBatchName(o) === a.batchName) && o.isArchived);

            for (let i = 0; i < affectedOrders.length; i += 400) {
                const chunk = affectedOrders.slice(i, i + 400);
                const batchWrite = db.batch();
                chunk.forEach(o => {
                    batchWrite.update(db.collection('orders').doc(o.id), { isArchived: firebase.firestore.FieldValue.delete() });
                });
                await batchWrite.commit();
            }

            storeBatches[targetBatchId] = restoredBatch;
            window.archivedBatchesData = list.filter(x => x.id !== arId);
            affectedOrders.forEach(o => {
                o.isArchived = false;
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].isArchived = false;
                }
            });

            if (typeof closeModal === 'function') closeModal('archive-report-modal');
            if (typeof window.renderBatchesUI === 'function') window.renderBatchesUI();
            if (typeof window.renderArchiveUI === 'function') window.renderArchiveUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            alert(`تمت استعادة دفعة (${a.batchName}) إلى قسم إدارة الدفعات الحية بنجاح! ↩️`);
        } catch (e) {
            console.error('Unarchive Error:', e);
            alert('حدث خطأ أثناء استعادة الدفعة: ' + (e.message || e));
        }
        if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
    };

    window.renderArchiveUI = function () {
        const cont = document.getElementById('archive-list-container');
        if (!cont) return;
        const list = Array.isArray(window.archivedBatchesData) ? window.archivedBatchesData : [];

        if (list.length === 0) {
            cont.innerHTML = '<div class="col-span-1 md:col-span-2 text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">لا توجد دفعات مؤرشفة حتى الآن. يمكنك أرشفة أي دفعة بعد انتهائها من زر (إغلاق وترحيل).</div>';
            return;
        }

        cont.innerHTML = list.map(a => {
            const dDate = formatArchiveDate(a);
            return `
            <div onclick="openArchiveReport('${a.id}')" class="bg-white p-5 rounded-[1.5rem] shadow-soft border border-slate-100 hover:shadow-card transition-all cursor-pointer hover:-translate-y-1">
                <div class="flex justify-between items-start mb-4 pb-3 border-b border-slate-50">
                    <div>
                        <h4 class="font-black text-slate-800 text-lg mb-1"><i class="fa-solid fa-file-invoice text-teal-600 mr-1"></i> ${a.batchName || 'دفعة مؤرشفة'}</h4>
                        <p class="text-[10px] font-bold text-slate-400">تاريخ الأرشفة: ${dDate}</p>
                    </div>
                    <span class="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-xs font-black shadow-sm border border-emerald-100">${a.ordersCount || 0} طلب مكتمل</span>
                </div>
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-[10px] font-bold text-slate-500 mb-1">الصافي النهائي المحصل</p>
                        <p class="text-xl font-black text-brand-primary">${(Number(a.totalRevenue) || 0).toLocaleString()} <span class="text-[10px]">ج</span></p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl">عرض التقرير والاستعادة <i class="fa-solid fa-chevron-left mr-1"></i></span>
                    </div>
                </div>
            </div>`;
        }).join('');
    };

    // =========================================================================
    // 🧾 ثالثاً: المحرك المحاسبي الشامل (الخزنة الذكية + ديون عليا + الثوابت الشهرية + الجرد السنوي)
    // =========================================================================

    const defaultAccountingConfig = {
        fiscalResetMs: 0, // نقطة بداية الحسابات بعد آخر جرد سنوي/تصفير
        activeFiscalTitle: 'الحسابات الحالية (منذ آخر جرد)',
        viewingArchiveId: 'CURRENT', // 'CURRENT' أو معرف جرد سابق مثل 'fy_2026'
        fixedMonthly: {
            rent: 0,        // إيجار شهري ثابت
            electricity: 0, // كهرباء
            water: 0,       // مياه
            labor: 0,       // عمالة / أجرتك الشهرية
            otherFixed: 0,  // مصاريف ثابتة أخرى
            dueTiming: 'start', // 'start' (أول الشهر) | 'end' (آخر الشهر)
            autoApprove: false, // تنزيل تلقائي أم تنبيه بالاعتماد
            lastAppliedMonth: '' // مثال: '2026-11'
        },
        annualArchives: {} // أرشيف الجرد السنوي (مثل: جرد سنة 2026)
    };

    window.storeAccountingConfig = JSON.parse(JSON.stringify(defaultAccountingConfig));

    // تحميل السجلات المالية وإعدادات الثوابت والجرد السنوي
    window.loadLedgerRecordsSafe = async function () {
        try {
            const cachedCfg = localStorage.getItem('sman_accounting_cfg');
            if (cachedCfg) {
                const parsed = JSON.parse(cachedCfg);
                window.storeAccountingConfig = {
                    ...defaultAccountingConfig,
                    ...parsed,
                    fixedMonthly: { ...defaultAccountingConfig.fixedMonthly, ...(parsed.fixedMonthly || {}) },
                    annualArchives: parsed.annualArchives || {}
                };
            }
        } catch (e) {}

        if (typeof db === 'undefined') return;
        try {
            const [ledgerDoc, cfgDoc] = await Promise.all([
                db.collection('inventory').doc('ledger_records').get(),
                db.collection('inventory').doc('accounting_config').get()
            ]);

            if (ledgerDoc.exists) {
                window.storeLedgerRecords = ledgerDoc.data() || {};
            }
            if (cfgDoc.exists) {
                const cData = cfgDoc.data() || {};
                window.storeAccountingConfig = {
                    ...defaultAccountingConfig,
                    ...cData,
                    fixedMonthly: { ...defaultAccountingConfig.fixedMonthly, ...(cData.fixedMonthly || {}) },
                    annualArchives: cData.annualArchives || {}
                };
                try { localStorage.setItem('sman_accounting_cfg', JSON.stringify(window.storeAccountingConfig)); } catch (e) {}
            }

            // فحص المصاريف الشهرية الثابتة فور التحميل
            await window.checkAndProcessMonthlyFixedExpenses(false);
            window.renderSmartDashboard();
        } catch (e) {
            console.log('Ledger & Config load info:', e);
        }
    };

    async function persistAccountingConfig() {
        try {
            localStorage.setItem('sman_accounting_cfg', JSON.stringify(window.storeAccountingConfig));
        } catch (e) {}
        if (typeof db !== 'undefined') {
            await db.collection('inventory').doc('accounting_config').set(window.storeAccountingConfig, { merge: true }).catch(() => {});
        }
    }

    // فحص هل الطلب أو السجل المالي يقع بعد تاريخ آخر تصفير/جرد سنوي
    window.isAfterFiscalReset = function (timestampMs) {
        const resetMs = Number(window.storeAccountingConfig?.fiscalResetMs) || 0;
        if (resetMs <= 0) return true;
        if (!timestampMs || timestampMs <= 0) return false;
        return timestampMs >= resetMs;
    };

    // حساب السيولة الحية المتاحة الآن في (خزنة الكاش) و(محفظة الأونلاين) منذ آخر جرد
    window.getLiveAvailableSafeBalances = function () {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const ledgerList = Object.values(window.storeLedgerRecords || {});
        let cashIn = 0, onlineIn = 0;
        let cashOut = 0, onlineOut = 0;

        ordersList.forEach(o => {
            if (!o || o.status !== 'completed') return;
            const oMs = (o.completedAt && typeof o.completedAt.toMillis === 'function')
                ? o.completedAt.toMillis()
                : (o.createdAt && typeof o.createdAt.toMillis === 'function' ? o.createdAt.toMillis() : (o.completedAtStr ? new Date(o.completedAtStr).getTime() : 0));
            if (!window.isAfterFiscalReset(oMs)) return;

            const fin = window.getAccurateOrderFinancials(o);
            if (o.paymentMethod === 'online') onlineIn += fin.total;
            else cashIn += fin.total;
        });

        ledgerList.forEach(r => {
            if (!r || !window.isAfterFiscalReset(r.createdAtMs)) return;
            if (r.type === 'expense' || r.type === 'fixed_monthly') {
                if (r.cashPaid !== undefined || r.onlinePaid !== undefined) {
                    cashOut += Number(r.cashPaid) || 0;
                    onlineOut += Number(r.onlinePaid) || 0;
                } else {
                    if (r.paymentSource === 'online') onlineOut += Number(r.amount) || 0;
                    else cashOut += Number(r.amount) || 0;
                }
            } else if (r.type === 'payable_debt') {
                // في الديون عليا: لا نخصم من الخزنة إلا ما تم سداده فعلياً (لمنع التكرار)
                cashOut += Number(r.paidCash) || 0;
                onlineOut += Number(r.paidOnline) || 0;
            }
        });

        return {
            netCash: Math.round(cashIn - cashOut),
            netOnline: Math.round(onlineIn - onlineOut),
            cashIn, onlineIn, cashOut, onlineOut
        };
    };

    // دالة التوزيع الذكي للدفع: تسحب من الكاش أولاً، فإذا لم يكفِ تسحب الباقي تلقائياً من الأونلاين!
    window.allocateSmartPaymentSplit = function (amountNeeded, preferredSource = 'auto') {
        const amt = Math.round(Number(amountNeeded) || 0);
        if (amt <= 0) return { cashPaid: 0, onlinePaid: 0, shortfallDebt: 0, summaryText: '' };

        const safes = window.getLiveAvailableSafeBalances();
        const availCash = Math.max(0, safes.netCash);
        const availOnline = Math.max(0, safes.netOnline);

        if (preferredSource === 'online') {
            if (availOnline >= amt) {
                return { cashPaid: 0, onlinePaid: amt, shortfallDebt: 0, summaryText: `خُصم ${amt} ج من الأونلاين` };
            }
            const fromOnline = availOnline;
            const rem = amt - fromOnline;
            const fromCash = Math.min(availCash, rem);
            const shortfall = rem - fromCash;
            return {
                cashPaid: fromCash,
                onlinePaid: fromOnline,
                shortfallDebt: shortfall,
                summaryText: `خُصم ${fromOnline} ج أونلاين + ${fromCash} ج كاش`
            };
        }

        // الوضع الافتراضي الذكي: يسحب من الكاش أولاً، وإذا لم يكفِ يكمل من الأونلاين تلقائياً
        if (availCash >= amt) {
            return { cashPaid: amt, onlinePaid: 0, shortfallDebt: 0, summaryText: `خُصم ${amt} ج من الكاش` };
        }

        const fromCash = availCash;
        const remAfterCash = amt - fromCash;
        const fromOnline = Math.min(availOnline, remAfterCash);
        const shortfall = remAfterCash - fromOnline;

        return {
            cashPaid: fromCash,
            onlinePaid: fromOnline,
            shortfallDebt: shortfall,
            summaryText: fromCash > 0
                ? `خُصم ${fromCash} ج من الكاش + ${fromOnline} ج تلقائياً من الأونلاين`
                : `الكاش صفر — خُصم ${fromOnline} ج تلقائياً من محفظة الأونلاين`
        };
    };

    window.quickToggleStoreOpenStatus = async function () {
        if (typeof storeSettings === 'undefined') return;
        const newState = !(storeSettings.storeOpen !== false);
        const msg = newState ? 'هل تريد فتح المتجر الآن لاستقبال طلبات العملاء؟' : 'هل تريد إغلاق المتجر مؤقتاً أمام العملاء؟';
        if (!confirm(msg)) return;

        try {
            storeSettings.storeOpen = newState;
            if (document.getElementById('st-is-open')) {
                document.getElementById('st-is-open').checked = newState;
            }
            await db.collection('inventory').doc('settings').set({ storeOpen: newState }, { merge: true });
            window.renderSmartDashboard();
            window.showToast(newState ? '🟢 المتجر مفتوح الآن ويستقبل الطلبات' : '🔴 تم إغلاق المتجر مؤقتاً');
        } catch (e) {
            alert('حدث خطأ أثناء تحديث حالة المتجر!');
        }
    };

    // فتح فورم تسجيل (مصروف / دين عليا / هالك)
    window.openLedgerEntryBox = function (mode, prefillBatchName = '') {
        window.updateDashState('activeSubTab', 'ledger_waste');
        const box = document.getElementById('sm-ledger-form-box');
        if (!box) return;
        box.classList.remove('hidden');

        const typeInput = document.getElementById('lg-entry-type');
        if (typeInput) typeInput.value = mode;

        const expWrap = document.getElementById('lg-expense-fields');
        const wasteWrap = document.getElementById('lg-waste-fields');
        const debtWrap = document.getElementById('lg-debt-fields');
        const formTitle = document.getElementById('lg-form-title');

        if (expWrap) expWrap.classList.add('hidden');
        if (wasteWrap) wasteWrap.classList.add('hidden');
        if (debtWrap) debtWrap.classList.add('hidden');

        if (mode === 'waste') {
            if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-400 mr-1.5"></i> تسجيل هالك / بايظ / استهلاك بيت';
            if (wasteWrap) wasteWrap.classList.remove('hidden');
        } else if (mode === 'payable_debt') {
            if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-file-invoice-dollar text-purple-400 mr-1.5"></i> تسجيل (ديون عليا) — شراء آجل بدون سيولة حالية';
            if (debtWrap) debtWrap.classList.remove('hidden');
        } else {
            if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-money-bill-transfer text-amber-400 mr-1.5"></i> تسجيل مشتريات / مصروف (يسحب من الكاش ثم الأونلاين تلقائياً)';
            if (expWrap) expWrap.classList.remove('hidden');
        }

        const batchSel = document.getElementById('lg-batch-name');
        if (batchSel && prefillBatchName) {
            batchSel.value = prefillBatchName;
        }

        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // حفظ العملية المالية (مصروف ذكي / دين عليا بدون تكرار / هالك)
    window.submitLedgerRecord = async function () {
        const mode = document.getElementById('lg-entry-type')?.value || 'expense';
        const batchName = document.getElementById('lg-batch-name')?.value || '';
        const notes = (document.getElementById('lg-notes')?.value || '').trim();
        const recId = 'rec_' + Date.now();
        const nowMs = Date.now();
        const todayStr = new Date().toLocaleDateString('en-US');

        let recordObj = {
            id: recId,
            type: mode,
            batchName: batchName,
            notes: notes,
            dateStr: todayStr,
            createdAtMs: nowMs
        };

        const extraRecordsToSave = {};

        if (mode === 'expense') {
            const category = document.getElementById('lg-exp-category')?.value || 'علف وتسمين';
            const amount = Math.round(Number(document.getElementById('lg-exp-amount')?.value) || 0);
            const paySource = document.getElementById('lg-exp-source')?.value || 'auto';

            if (amount <= 0) return alert('برجاء إدخال المبلغ بشكل صحيح!');

            // إذا اختار المستخدم أنه اشترى بالأجل (على الحساب) من داخل نافذة المصروف
            if (paySource === 'credit_debt') {
                const credName = prompt('اكتب اسم التاجر / الشخص صاحب الدين (عشان تعرف مين اللي ليه فلوس):', category);
                if (credName === null) return;
                recordObj.type = 'payable_debt';
                recordObj.creditorName = credName.trim() || 'مورد / دائن';
                recordObj.category = category;
                recordObj.amount = amount;
                recordObj.paidCash = 0;
                recordObj.paidOnline = 0;
                recordObj.remainingDebt = amount;
                recordObj.status = 'unpaid';
            } else {
                const split = window.allocateSmartPaymentSplit(amount, paySource);

                if (split.shortfallDebt > 0) {
                    const paidNow = split.cashPaid + split.onlinePaid;
                    const confirmDebt = confirm(
                        `⚠️ السيولة المتاحة في الخزنة الآن (${split.cashPaid} ج كاش + ${split.onlinePaid} ج أونلاين = ${paidNow} ج) لا تكفي المبلغ الكلي (${amount} ج)!\n\n` +
                        `هل تريد سحب الموجود (${paidNow} ج) وتسجيل المبلغ المتبقي (${split.shortfallDebt} ج) تلقائياً في بند (ديون عليا)؟`
                    );
                    if (!confirmDebt) return;

                    const credName = prompt(`اكتب اسم صاحب الدين المتبقي (${split.shortfallDebt} ج):`, category) || category;

                    if (paidNow > 0) {
                        recordObj.category = category;
                        recordObj.amount = paidNow;
                        recordObj.cashPaid = split.cashPaid;
                        recordObj.onlinePaid = split.onlinePaid;
                        recordObj.paymentSource = split.onlinePaid > 0 && split.cashPaid > 0 ? 'split_cash_online' : (split.onlinePaid > 0 ? 'online' : 'cash');
                        recordObj.notes = (notes ? notes + ' | ' : '') + split.summaryText;
                    }

                    const debtId = 'rec_debt_' + (Date.now() + 1);
                    const debtRec = {
                        id: debtId,
                        type: 'payable_debt',
                        creditorName: credName.trim(),
                        category: category,
                        batchName: batchName,
                        amount: split.shortfallDebt,
                        paidCash: 0,
                        paidOnline: 0,
                        remainingDebt: split.shortfallDebt,
                        status: 'unpaid',
                        notes: `باقي شراء ${category} (إجمالي الفاتورة كان ${amount} ج دُفع منها ${paidNow} ج)`,
                        dateStr: todayStr,
                        createdAtMs: nowMs + 1
                    };

                    if (paidNow > 0) {
                        extraRecordsToSave[debtId] = debtRec;
                    } else {
                        recordObj = debtRec;
                    }
                } else {
                    recordObj.category = category;
                    recordObj.amount = amount;
                    recordObj.cashPaid = split.cashPaid;
                    recordObj.onlinePaid = split.onlinePaid;
                    recordObj.paymentSource = split.onlinePaid > 0 && split.cashPaid > 0 ? 'split_cash_online' : (split.onlinePaid > 0 ? 'online' : 'cash');
                    if (split.onlinePaid > 0 && paySource !== 'online') {
                        recordObj.notes = (notes ? notes + ' | ' : '') + split.summaryText;
                    }
                }
            }
        } else if (mode === 'payable_debt') {
            const creditorName = (document.getElementById('lg-debt-creditor')?.value || '').trim();
            const category = document.getElementById('lg-debt-category')?.value || 'شراء علف / مستلزمات بالأجل';
            const amount = Math.round(Number(document.getElementById('lg-debt-amount')?.value) || 0);

            if (!creditorName) return alert('برجاء كتابة اسم الشخص أو التاجر اللي ليه الفلوس!');
            if (amount <= 0) return alert('برجاء إدخال مبلغ الدين بشكل صحيح!');

            recordObj.type = 'payable_debt';
            recordObj.creditorName = creditorName;
            recordObj.category = category;
            recordObj.amount = amount;
            recordObj.paidCash = 0;
            recordObj.paidOnline = 0;
            recordObj.remainingDebt = amount;
            recordObj.status = 'unpaid';
        } else {
            const wasteKind = document.getElementById('lg-waste-kind')?.value || 'هالك تربية / نافق';
            const prodId = document.getElementById('lg-waste-product')?.value || '';
            const qty = Number(document.getElementById('lg-waste-qty')?.value) || 0;
            const deductFz = document.getElementById('lg-waste-deduct-fz')?.checked || false;

            const estCostInput = document.getElementById('lg-waste-cost')?.value;
            let estCost = Number(estCostInput) || 0;

            if (qty <= 0) return alert('برجاء إدخال العدد أو الكمية (أجواز / أطباق)!');

            const prodName = (prodId && typeof storeProducts !== 'undefined' && storeProducts[prodId]) ? storeProducts[prodId].name : 'سمان عام';

            if (!estCostInput && prodId) {
                estCost = window.getProductRealPrice(prodId) * qty;
            }
            recordObj.category = wasteKind;
            recordObj.productId = prodId;
            recordObj.productName = prodName;
            recordObj.qty = qty;
            recordObj.amount = estCost;
            recordObj.deductFreezer = deductFz;

            if (deductFz && prodId && typeof storeFreezer !== 'undefined') {
                const currentFz = Math.max(0, Number(storeFreezer[prodId]) || 0);
                const newFz = Math.max(0, currentFz - qty);
                storeFreezer[prodId] = newFz;
                if (typeof db !== 'undefined') {
                    await db.collection('inventory').doc('freezer').set({ [prodId]: newFz }, { merge: true });
                }
            }
        }

        try {
            const payloadToSave = { [recordObj.id]: recordObj, ...extraRecordsToSave };
            Object.assign(window.storeLedgerRecords, payloadToSave);

            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('ledger_records').set(payloadToSave, { merge: true });
            }

            ['lg-exp-amount', 'lg-waste-qty', 'lg-waste-cost', 'lg-debt-creditor', 'lg-debt-amount', 'lg-notes'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('sm-ledger-form-box')?.classList.add('hidden');

            window.renderSmartDashboard();
            window.showToast('✅ تم الحفظ وتحديث الحسابات والخزنة بنجاح');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ السجل: ' + (e.message || e));
        }
    };

    // سداد دين عليا (كلي أو جزئي) من الخزنة بدون تكراره كمصروف مرة ثانية!
    window.settleOwnerDebtRecord = async function (recId) {
        const rec = window.storeLedgerRecords[recId];
        if (!rec || rec.type !== 'payable_debt') return;

        const rem = Number(rec.remainingDebt !== undefined ? rec.remainingDebt : rec.amount) || 0;
        if (rem <= 0) return alert('هذا الدين مسدد بالكامل بالفعل!');

        const payStr = prompt(
            `💵 سداد دين لصاحب الحق: (${rec.creditorName})\n` +
            `الغرض: ${rec.category}\n` +
            `المبلغ المتبقي عليك حالياً: ${rem} ج.م\n\n` +
            `اكتب المبلغ الذي ستسدده الآن (سيتم سحبه من الكاش، وإذا لم يكفِ سيُسحب الباقي من الأونلاين تلقائياً، ولن يُضاف كمصروف مكرر):`,
            String(rem)
        );
        if (payStr === null) return;
        const payAmt = Math.round(Number(payStr) || 0);
        if (payAmt <= 0 || payAmt > rem) return alert('برجاء إدخال مبلغ سداد صحيح لا يتخطى المتبقي!');

        const split = window.allocateSmartPaymentSplit(payAmt, 'auto');
        if (split.shortfallDebt > 0) {
            return alert(`⚠️ رصيد الخزنة الحالي (كاش + أونلاين) لا يكفي لسداد هذا المبلغ! المتاح حالياً: ${split.cashPaid + split.onlinePaid} ج.م.`);
        }

        rec.paidCash = (Number(rec.paidCash) || 0) + split.cashPaid;
        rec.paidOnline = (Number(rec.paidOnline) || 0) + split.onlinePaid;
        rec.remainingDebt = Math.max(0, rem - payAmt);
        rec.status = rec.remainingDebt === 0 ? 'paid' : 'partial';
        rec.lastPaidDate = new Date().toLocaleDateString('ar-EG');

        try {
            window.storeLedgerRecords[recId] = rec;
            if (typeof db !== 'undefined') {
                await db.collection('inventory').doc('ledger_records').set({ [recId]: rec }, { merge: true });
            }
            window.renderSmartDashboard();
            window.showToast(`✅ تم سداد ${payAmt} ج لـ (${rec.creditorName}) — (${split.summaryText})`);
        } catch (e) {
            alert('حدث خطأ أثناء تسجيل السداد!');
        }
    };

    // حفظ إعدادات المصاريف الثابتة الشهرية (إيجار، كهرباء، مياه، عمالة/أجرتي)
    window.saveFixedMonthlyExpensesConfig = async function () {
        const fm = window.storeAccountingConfig.fixedMonthly || {};
        fm.rent = Math.max(0, Number(document.getElementById('fm-rent')?.value) || 0);
        fm.electricity = Math.max(0, Number(document.getElementById('fm-electricity')?.value) || 0);
        fm.water = Math.max(0, Number(document.getElementById('fm-water')?.value) || 0);
        fm.labor = Math.max(0, Number(document.getElementById('fm-labor')?.value) || 0);
        fm.otherFixed = Math.max(0, Number(document.getElementById('fm-other')?.value) || 0);
        fm.dueTiming = document.getElementById('fm-timing')?.value || 'start';
        fm.autoApprove = document.getElementById('fm-auto-approve')?.checked || false;

        window.storeAccountingConfig.fixedMonthly = fm;
        await persistAccountingConfig();
        await window.checkAndProcessMonthlyFixedExpenses(false);
        window.renderSmartDashboard();
        window.showToast('✅ تم حفظ جدول المصاريف الثابتة الشهرية بنجاح!');
    };

    // فحص وتنبيه (أو اعتماد) المصاريف الثابتة الشهرية
    window.checkAndProcessMonthlyFixedExpenses = async function (forceManualApply = false) {
        const fm = window.storeAccountingConfig?.fixedMonthly;
        if (!fm) return false;

        const totalFixed = (Number(fm.rent) || 0) + (Number(fm.electricity) || 0) + (Number(fm.water) || 0) + (Number(fm.labor) || 0) + (Number(fm.otherFixed) || 0);
        if (totalFixed <= 0) return false;

        const nowObj = new Date();
        const curMonthKey = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}`;

        if (!forceManualApply && fm.lastAppliedMonth === curMonthKey) {
            return false;
        }

        const dayOfMonth = nowObj.getDate();
        const isDueNow = (fm.dueTiming === 'start' && dayOfMonth >= 1) || (fm.dueTiming === 'end' && dayOfMonth >= 25);

        if (!forceManualApply && (!isDueNow || !fm.autoApprove)) {
            // لا نخصمها تلقائياً، بل نترك شريط الإشعار الذكي يظهر للمستخدم في أعلى اللوحة ليعتمدها بضغطة زر
            return false;
        }

        if (forceManualApply && fm.lastAppliedMonth === curMonthKey) {
            if (!confirm(`تم إدراج المصاريف الثابتة لشهر (${curMonthKey}) من قبل. هل تريد إدراجها مرة أخرى؟`)) return false;
        }

        const detailsArr = [];
        if (fm.rent > 0) detailsArr.push(`إيجار: ${fm.rent}ج`);
        if (fm.electricity > 0) detailsArr.push(`كهرباء: ${fm.electricity}ج`);
        if (fm.water > 0) detailsArr.push(`مياه: ${fm.water}ج`);
        if (fm.labor > 0) detailsArr.push(`عمالة/أجرتي: ${fm.labor}ج`);
        if (fm.otherFixed > 0) detailsArr.push(`ثوابت أخرى: ${fm.otherFixed}ج`);

        const split = window.allocateSmartPaymentSplit(totalFixed, 'auto');
        const paidNow = split.cashPaid + split.onlinePaid;
        const recId = 'rec_fixed_' + curMonthKey + '_' + Date.now();
        const todayStr = nowObj.toLocaleDateString('en-US');

        const payload = {};

        if (paidNow > 0) {
            payload[recId] = {
                id: recId,
                type: 'expense',
                isFixedMonthly: true,
                category: `📅 مصاريف ثابتة (${curMonthKey})`,
                batchName: '',
                amount: paidNow,
                cashPaid: split.cashPaid,
                onlinePaid: split.onlinePaid,
                paymentSource: split.onlinePaid > 0 && split.cashPaid > 0 ? 'split_cash_online' : (split.onlinePaid > 0 ? 'online' : 'cash'),
                notes: `${detailsArr.join(' + ')} | ${split.summaryText}`,
                dateStr: todayStr,
                createdAtMs: Date.now()
            };
        }

        // إذا كانت السيولة لا تكفي للمصاريف الثابتة، يسجل الباقي كالتزام في (ديون عليا)
        if (split.shortfallDebt > 0) {
            const debtId = 'rec_fixed_debt_' + curMonthKey + '_' + (Date.now() + 1);
            payload[debtId] = {
                id: debtId,
                type: 'payable_debt',
                creditorName: `التزامات شهرية ثابتة (${curMonthKey})`,
                category: 'إيجار / كهرباء / مياه / عمالة',
                batchName: '',
                amount: split.shortfallDebt,
                paidCash: 0,
                paidOnline: 0,
                remainingDebt: split.shortfallDebt,
                status: 'unpaid',
                notes: `متبقي من المصاريف الثابتة لشهر ${curMonthKey} (${detailsArr.join(' + ')})`,
                dateStr: todayStr,
                createdAtMs: Date.now() + 1
            };
        }

        Object.assign(window.storeLedgerRecords, payload);
        fm.lastAppliedMonth = curMonthKey;
        window.storeAccountingConfig.fixedMonthly = fm;

        if (typeof db !== 'undefined') {
            await Promise.all([
                db.collection('inventory').doc('ledger_records').set(payload, { merge: true }),
                persistAccountingConfig()
            ]);
        }

        window.renderSmartDashboard();
        window.showToast(`✅ تم اعتماد المصاريف الثابتة لشهر (${curMonthKey}) بإجمالي ${totalFixed.toLocaleString()} ج!`);
        return true;
    };

    // 🔄 محرك الجرد السنوي وتصفير السيستم لبداية جديدة مع حفظ القديم في بند (سنة 2026)
    window.executeAnnualInventoryReset = async function () {
        const defaultTitle = `جرد سنة ${new Date().getFullYear()}`;
        const archiveTitle = prompt(
            `🔄 الجرد السنوي وتصفير الحسابات لبداية جديدة:\n\n` +
            `سيقوم السيستم بحفظ كل الأموال التي دخلت وخرجت والمبيعات والمصروفات الحالية في ملف أرشيف محفوظ، ثم يصفر الخزنة والحسابات الحالية (0 ج) لتبدأ من الصفر على نظافة دون ضياع أي طلب أو عميل قديم.\n\n` +
            `اكتب اسم ملف الجرد لحفظ الحسابات الحالية فيه:`,
            defaultTitle
        );
        if (!archiveTitle || !archiveTitle.trim()) return;

        if (!confirm(`⚠️ تأكيد نهائي:\nهل تريد حفظ الحسابات الحالية في بند (${archiveTitle.trim()}) وتصفير السيستم ليبدأ العد من الصفر الآن؟`)) return;

        // أخذ لقطة كاملة للأرقام الحالية قبل التصفير
        const safes = window.getLiveAvailableSafeBalances();
        const totalIn = safes.cashIn + safes.onlineIn;
        const totalOut = safes.cashOut + safes.onlineOut;
        const netSafeBalance = safes.netCash + safes.netOnline;

        const archId = 'fy_' + Date.now();
        const resetNowMs = Date.now();

        const snapshotObj = {
            id: archId,
            title: archiveTitle.trim(),
            closedAtMs: resetNowMs,
            closedDateStr: new Date(resetNowMs).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
            previousResetMs: window.storeAccountingConfig.fiscalResetMs || 0,
            totalSalesIn: totalIn,
            cashIn: safes.cashIn,
            onlineIn: safes.onlineIn,
            totalExpensesOut: totalOut,
            cashOut: safes.cashOut,
            onlineOut: safes.onlineOut,
            finalNetCash: safes.netCash,
            finalNetOnline: safes.netOnline,
            finalTotalProfit: netSafeBalance
        };

        if (!window.storeAccountingConfig.annualArchives) {
            window.storeAccountingConfig.annualArchives = {};
        }
        window.storeAccountingConfig.annualArchives[archId] = snapshotObj;
        window.storeAccountingConfig.fiscalResetMs = resetNowMs;
        window.storeAccountingConfig.viewingArchiveId = 'CURRENT';

        await persistAccountingConfig();
        window.renderSmartDashboard();
        alert(`🎉 تم عمل الجرد السنوي بنجاح!\n\n- تم حفظ كل حساباتك السابقة في بند: (${snapshotObj.title}).\n- تم تصفير الخزنة والمبيعات والمصاريف الحالية إلى (0 ج) لتبدأ حساباتك الجديدة من الصفر!`);
    };

    // التبديل بين عرض الحسابات الحالية بعد التصفير أو عرض جرد سنة سابقة (مثل: سنه 2026)
    window.switchFiscalArchiveView = function (viewId) {
        window.storeAccountingConfig.viewingArchiveId = viewId || 'CURRENT';
        window.renderSmartDashboard();
    };

    // استعادة السيستم لإلغاء التصفير في حال أراد المستخدم دمج القديم والجديد مرة أخرى
    window.cancelFiscalResetAndRestoreAll = async function () {
        if (!confirm('هل تريد إلغاء نقطة التصفير وإظهار كل الحسابات التاريخية المجمعة منذ بداية المشروع؟')) return;
        window.storeAccountingConfig.fiscalResetMs = 0;
        window.storeAccountingConfig.viewingArchiveId = 'CURRENT';
        await persistAccountingConfig();
        window.renderSmartDashboard();
        window.showToast('↩️ تمت استعادة عرض كل الحسابات التاريخية');
    };

    window.deleteLedgerRecord = async function (recId) {
        if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
        try {
            delete window.storeLedgerRecords[recId];
            await db.collection('inventory').doc('ledger_records').update({
                [recId]: firebase.firestore.FieldValue.delete()
            });
            window.renderSmartDashboard();
            window.showToast('🗑️ تم حذف السجل بنجاح');
        } catch (e) {
            alert('خطأ أثناء الحذف!');
        }
    };


    // =========================================================================
    // 🎨 رابعاً: بناء الهيكل البصري المنظم للوحة القيادة (صفحتان نظيفتان وأيقونات صغيرة)
    // =========================================================================

    window.initSmartDashboardLayout = function () {
        const dashView = document.getElementById('view-dashboard');
        if (!dashView || document.getElementById('smart-dashboard-root')) return;

        // الحفاظ الكامل على كشاف الطوارئ في أعلى لوحة القيادة
        const emergencySearchEl = dashView.firstElementChild;
        dashView.innerHTML = '';
        if (emergencySearchEl) {
            dashView.appendChild(emergencySearchEl);
        }

        const root = document.createElement('div');
        root.id = 'smart-dashboard-root';
        root.className = 'space-y-4 pb-16';

        root.innerHTML = `
            <!-- 🔔 شريط الإشعار الذكي للمصاريف الثابتة الشهرية (يظهر تلقائياً أول أو آخر الشهر عند الاستحقاق) -->
            <div id="sm-fixed-monthly-alert-banner" class="hidden bg-amber-500 text-slate-950 p-3 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-2 border-2 border-amber-300"></div>

            <!-- 📁 شريط تنبيه عند تصفح أرشيف جرد سنوي سابق (مثل: جرد سنة 2026) -->
            <div id="sm-fiscal-archive-banner" class="hidden bg-indigo-950 text-white p-3 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-2 border border-indigo-700"></div>

            <!-- ⚡ 1. الشريط العلوي المدمج (أيقونات صغيرة وأزرار سريعة بدون زحمة) -->
            <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-3.5 rounded-2xl shadow-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-xs shrink-0">
                        <i class="fa-solid fa-calculator"></i>
                    </div>
                    <div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <h3 class="text-xs sm:text-sm font-black text-white">الوحدة الحسابية الصافية (بدون توصيل)</h3>
                            <span id="dash-active-period-badge" class="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full text-[10px] font-black">هذا الشهر</span>
                        </div>
                        <p class="text-[10px] text-slate-300 font-bold mt-0.5">حساب صافي المنتجات • سحب ذكي (كاش ثم أونلاين) • متابعة الديون والثوابت والجرد السنوي</p>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
                    <button onclick="quickToggleStoreOpenStatus()" id="sm-cmd-store-status" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-power-off text-[10px]"></i> <span>المتجر مفتوح</span>
                    </button>
                    <button onclick="openFreezerModal()" class="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-snowflake text-[10px]"></i> الفريزر (<span id="sm-cmd-freezer-total">0 طبق</span>)
                    </button>
                    <button onclick="openLedgerEntryBox('expense')" class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-plus text-[10px]"></i> مصروف/شراء
                    </button>
                    <button onclick="openLedgerEntryBox('payable_debt')" class="bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-file-invoice-dollar text-[10px]"></i> دين عليا
                    </button>
                    <button onclick="openLedgerEntryBox('waste')" class="bg-rose-500 hover:bg-rose-400 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-triangle-exclamation text-[10px]"></i> هالك
                    </button>
                    <button onclick="printSmartDashboardReport()" class="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1">
                        <i class="fa-solid fa-print text-amber-300 text-[10px]"></i> طباعة
                    </button>
                </div>
            </div>

            <!-- 🏦 2. شريط الخزن والديون اللحظي (5 كبسولات صغيرة وواضحة جداً) -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <div class="bg-gradient-to-br from-emerald-900 to-brand-dark text-white p-3 rounded-2xl shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-[9px] font-bold text-emerald-200">💵 صافي كاش الدرج</p>
                        <h4 id="sm-safe-net-cash" class="text-base sm:text-lg font-black text-white mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-cash-register text-sm text-emerald-400/80"></i>
                </div>
                <div class="bg-white p-3 rounded-2xl border border-emerald-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-[9px] font-black text-emerald-700">💳 محفظة الأونلاين</p>
                        <h4 id="sm-safe-net-online" class="text-base sm:text-lg font-black text-emerald-600 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-mobile-screen-button text-sm text-emerald-500/70"></i>
                </div>
                <div onclick="updateDashState('activeSubTab', 'ledger_waste'); setTimeout(()=>document.getElementById('sm-payable-debts-section')?.scrollIntoView({behavior:'smooth'}), 100);" class="bg-purple-50/70 p-3 rounded-2xl border-2 border-purple-300 shadow-sm flex items-center justify-between cursor-pointer hover:border-purple-500 transition-all" title="اضغط لعرض مين اللي ليه فلوس عندك وسدادها">
                    <div>
                        <p class="text-[9px] font-black text-purple-900">🟣 ديون عليا (للتجار)</p>
                        <h4 id="sm-safe-owner-debt" class="text-base sm:text-lg font-black text-purple-700 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-scale-unbalanced-flip text-sm text-purple-600"></i>
                </div>
                <div onclick="switchTab('debts', document.querySelector('button[onclick*=\\'debts\\']'))" class="bg-white p-3 rounded-2xl border border-red-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-red-400 transition-all">
                    <div>
                        <p class="text-[9px] font-black text-red-700">📕 ديون ليا (عند العملاء)</p>
                        <h4 id="sm-safe-market-debt" class="text-base sm:text-lg font-black text-red-600 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-hand-holding-dollar text-sm text-red-500/70"></i>
                </div>
                <div onclick="switchTab('radar', document.querySelector('button[onclick*=\\'radar\\']'))" class="col-span-2 sm:col-span-1 bg-white p-3 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all">
                    <div>
                        <p class="text-[9px] font-black text-amber-700">🛵 مع المناديب بالشارع</p>
                        <h4 id="sm-safe-street-cash" class="text-base sm:text-lg font-black text-amber-600 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-motorcycle text-sm text-amber-500/70"></i>
                </div>
            </div>

            <!-- 🎛️ 3. شريط التنقل بين الصفحتين + الفلترة الزمنية المدمجة -->
            <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-soft space-y-3">
                <!-- أزرار الصفحتين الرئيسيتين -->
                <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div class="flex flex-wrap gap-1.5 w-full sm:w-auto">
                        <button onclick="updateDashState('activeSubTab', 'overview')" id="sm-subtab-overview" class="sm-subtab-btn flex-1 sm:flex-none bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition-all">
                            <i class="fa-solid fa-chart-pie text-emerald-400 ml-1"></i> الصفحة 1: الحسابات والدفعات والأصناف
                        </button>
                        <button onclick="updateDashState('activeSubTab', 'ledger_waste')" id="sm-subtab-ledger_waste" class="sm-subtab-btn flex-1 sm:flex-none bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all">
                            <i class="fa-solid fa-vault text-amber-500 ml-1"></i> الصفحة 2: الثوابت الشهرية، الديون عليا، والجرد السنوي
                        </button>
                        <button onclick="updateDashState('activeSubTab', 'vip_zones')" id="sm-subtab-vip_zones" class="sm-subtab-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-xl text-[11px] font-black transition-all">
                            <i class="fa-solid fa-crown text-amber-500 ml-1"></i> الغائبين والمناطق
                        </button>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                        <select id="dash-source-select" onchange="updateDashState('sourceFilter', this.value)" class="flex-1 sm:flex-none border border-teal-500/40 bg-teal-50/40 rounded-xl px-2.5 py-1.5 text-[11px] font-black text-teal-900 outline-none">
                            <option value="all">📦 كل المبيعات (دفعات + فوري)</option>
                            <option value="batches_only">🏷️ طلبات الدفعات فقط</option>
                            <option value="normal_only">❄️ الطلبات الفورية فقط</option>
                        </select>
                        <select id="dash-date-basis" onchange="updateDashState('dateBasis', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-2.5 py-1.5 text-[11px] font-black text-slate-700 outline-none">
                            <option value="effective">بتاريخ التسليم</option>
                            <option value="created">بتاريخ الطلب</option>
                        </select>
                    </div>
                </div>

                <!-- أزرار الفترة الزمنية + معيار الحساب -->
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-1">
                        <button onclick="updateDashState('period', 'this_month')" id="d-period-this_month" class="dash-period-btn bg-brand-primary text-white px-2.5 py-1 rounded-lg text-[11px] font-black shadow-sm transition-all">📅 هذا الشهر</button>
                        <button onclick="updateDashState('period', 'last_month')" id="d-period-last_month" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all">⏪ الشهر الماضي</button>
                        <button onclick="updateDashState('period', 'pick_month')" id="d-period-pick_month" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all">🗓️ شهر محدد</button>
                        <button onclick="updateDashState('period', 'today')" id="d-period-today" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all">☀️ اليوم</button>
                        <button onclick="updateDashState('period', 'custom')" id="d-period-custom" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all">📆 فترة</button>
                        <button onclick="updateDashState('period', 'all_time')" id="d-period-all_time" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all">🌍 منذ آخر جرد</button>
                    </div>

                    <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button type="button" onclick="setDashAccountingMode('completed')" id="sm-cm-completed" class="sm-cm-btn bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm transition-all">✅ المسلّم فقط</button>
                        <button type="button" onclick="setDashAccountingMode('pending')" id="sm-cm-pending" class="sm-cm-btn text-slate-600 hover:bg-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">⏳ المحجوز فقط</button>
                        <button type="button" onclick="setDashAccountingMode('all')" id="sm-cm-all" class="sm-cm-btn text-slate-600 hover:bg-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all">📊 الشامل</button>
                    </div>
                </div>
                <p id="sm-calc-mode-hint" class="hidden"></p>

                <!-- خيارات التاريخ المخصص أو الشهر -->
                <div id="dash-extra-date-controls" class="hidden pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
                    <div id="dash-month-picker-wrap" class="hidden flex items-center gap-2">
                        <label class="text-xs font-black text-slate-600">اختر الشهر:</label>
                        <input type="month" id="dash-month-input" value="${defaultMonthStr}" onchange="updateDashState('selectedMonth', this.value)" class="border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-black bg-white outline-none">
                    </div>
                    <div id="dash-custom-range-wrap" class="hidden flex flex-wrap items-center gap-2">
                        <label class="text-xs font-black text-slate-600">من:</label>
                        <input type="date" id="dash-date-from" onchange="updateDashState('dateFrom', this.value)" class="border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-black bg-white outline-none">
                        <label class="text-xs font-black text-slate-600">إلى:</label>
                        <input type="date" id="dash-date-to" onchange="updateDashState('dateTo', this.value)" class="border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-black bg-white outline-none">
                    </div>
                </div>
            </div>

            <!-- ========================================================= -->
            <!-- 📊 الصفحة الأولى (Overview): الكروت الصافية + الدفعات + الأصناف -->
            <!-- ========================================================= -->
            <div id="sm-panel-overview" class="space-y-4">

                <!-- 4 كروت مالية صافية ومختصرة (بدون توصيل نهائياً وأيقونات صغيرة) -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <!-- 1. صافي المبيعات المحصلة (بدون توصيل) -->
                    <div class="bg-white p-4 rounded-2xl border-2 border-emerald-500/30 shadow-soft flex flex-col justify-between">
                        <div class="flex justify-between items-start mb-1.5">
                            <div>
                                <p id="sm-lbl-card1-title" class="text-[11px] font-black text-emerald-800">✅ صافي المبيعات المسلّمة</p>
                                <h3 id="sm-dash-total-revenue" class="text-2xl font-black text-emerald-600 mt-0.5">0 <span class="text-xs">ج</span></h3>
                                <span id="sm-lbl-card2-title" class="hidden"></span>
                                <span id="sm-dash-products-revenue" class="hidden"></span>
                            </div>
                            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-sack-dollar"></i></div>
                        </div>
                        <div id="sm-dash-payment-split" class="text-[10px] font-black text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/70 mb-1 flex justify-between">
                            <span>💵 كاش: 0 ج</span>
                            <span>💳 أونلاين: 0 ج</span>
                        </div>
                        <div id="sm-dash-avg-order" class="text-[9px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg flex justify-between">
                            <span>🥩 0 طبق</span>
                            <span>متوسط: 0 ج</span>
                        </div>
                        <div id="sm-dash-collected-vs-pending" class="hidden"></div>
                        <div id="sm-dash-products-sub-split" class="hidden"></div>
                    </div>

                    <!-- 2. صافي الربح الحقيقي (بعد المصروفات والثوابت والهالك) -->
                    <div onclick="updateDashState('activeSubTab', 'ledger_waste')" class="bg-white p-4 rounded-2xl border-2 border-teal-500/40 shadow-soft cursor-pointer hover:border-teal-600 transition-all flex flex-col justify-between">
                        <div class="flex justify-between items-start mb-1.5">
                            <div>
                                <p id="sm-lbl-card3-title" class="text-[11px] font-black text-teal-800">💎 صافي الربح (بعد المصروف)</p>
                                <h3 id="sm-dash-true-net-profit" class="text-2xl font-black text-teal-700 mt-0.5">0 <span class="text-xs">ج</span></h3>
                            </div>
                            <div class="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-gem"></i></div>
                        </div>
                        <div id="sm-dash-expenses-summary" class="text-[10px] font-black text-teal-900 bg-teal-50 px-2.5 py-1.5 rounded-lg border border-teal-200 flex justify-between">
                            <span>مصاريف: 0 ج</span>
                            <span>هالك: 0 ج</span>
                        </div>
                    </div>

                    <!-- 3. الحجوزات المنتظرة قيد التسليم (مفصولة عن المسلّم) -->
                    <div onclick="setDashAccountingMode('pending')" class="bg-amber-50/40 p-4 rounded-2xl border border-amber-300 shadow-soft cursor-pointer hover:border-amber-500 transition-all flex flex-col justify-between">
                        <div class="flex justify-between items-start mb-1.5">
                            <div>
                                <p class="text-[11px] font-black text-amber-900">⏳ حجوزات منتظرة (لم تُسلّم)</p>
                                <h3 id="sm-dash-completed-count" class="text-xl font-black text-amber-600 mt-0.5">0 <span class="text-xs">ج</span></h3>
                            </div>
                            <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-hourglass-half"></i></div>
                        </div>
                        <div id="sm-dash-pipeline-info" class="text-[10px] font-black text-amber-900 bg-white px-2.5 py-1.5 rounded-lg border border-amber-200 flex justify-between">
                            <span>✅ سُلّم: 0</span>
                            <span class="text-slate-400">❌ ملغي: 0</span>
                        </div>
                    </div>

                    <!-- 4. الخصومات والواجب والآجل (بدون توصيل) -->
                    <div onclick="updateDashState('tableSubFilter', 'discounted'); document.getElementById('sm-dash-orders-section')?.scrollIntoView({behavior:'smooth'});" class="bg-white p-4 rounded-2xl border border-red-200 shadow-soft cursor-pointer hover:border-red-400 transition-all flex flex-col justify-between">
                        <div class="flex justify-between items-start mb-1.5">
                            <div>
                                <p class="text-[11px] font-black text-red-600">🎁 الخصومات والآجل بالفترة</p>
                                <h3 id="sm-dash-discounts-total" class="text-xl font-black text-red-600 mt-0.5">0 <span class="text-xs">ج</span></h3>
                            </div>
                            <div class="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-tags"></i></div>
                        </div>
                        <div id="sm-dash-discounts-breakdown" class="text-[10px] font-black text-red-800 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 flex justify-between">
                            <span>فواتير: 0 ج</span>
                            <span>واجب: 0 ج</span>
                        </div>
                        <span id="sm-dash-delivery-revenue" class="hidden"></span>
                        <div id="sm-dash-free-delivery-info" class="text-[9px] font-black text-slate-500 mt-1 px-1 flex justify-between">
                            <span>صافي بدون توصيل</span>
                            <span id="sm-dash-debt-total" class="text-rose-600">آجل: 0 ج</span>
                        </div>
                    </div>
                </div>

                <!-- شريط متوسطات الدفعات المدمج -->
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-soft">
                    <div id="sm-dash-benchmarks-bar" class="grid grid-cols-2 md:grid-cols-4 gap-2.5"></div>
                </div>

                <!-- الدفعات النشطة + درج الأرشيف المطوي -->
                <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-soft">
                    <div class="flex flex-wrap justify-between items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                        <div>
                            <h4 class="text-xs sm:text-sm font-black text-slate-800"><i class="fa-solid fa-layer-group text-teal-600 ml-1"></i> حسابات الدفعات النشطة (صافي المنتجات بدون التوصيل)</h4>
                        </div>
                        <button onclick="updateDashState('sourceFilter', 'all')" id="sm-reset-batch-filter" class="hidden text-[11px] font-black bg-red-50 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 hover:bg-red-600 hover:text-white transition-colors">إلغاء فلتر الدفعة ✕</button>
                    </div>
                    <div id="sm-dash-batches-breakdown" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"></div>
                </div>

                <!-- جرد الأصناف المباعة -->
                <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-soft">
                    <h4 class="text-xs sm:text-sm font-black text-slate-800 mb-3 pb-2 border-b border-slate-100">
                        <i class="fa-solid fa-boxes-packing text-brand-primary ml-1"></i> جرد الأصناف المباعة (الكمية + الصافي بدون توصيل)
                    </h4>
                    <div id="sm-dash-items-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5"></div>
                </div>

                <!-- جدول سجل الطلبات التفصيلي (مختصر ونظيف) -->
                <div id="sm-dash-orders-section" class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-soft space-y-3">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-2 border-b border-slate-100">
                        <h4 class="text-xs sm:text-sm font-black text-slate-800"><i class="fa-solid fa-list-check text-indigo-500 ml-1"></i> سجل الطلبات التفصيلي (صافي المنتجات)</h4>
                        <div class="flex flex-wrap items-center gap-1">
                            <button onclick="updateDashState('tableSubFilter', 'completed')" id="sm-tf-completed" class="sm-tf-btn bg-slate-800 text-white px-2.5 py-1 rounded-lg text-[10px] font-black">✅ المكتمل</button>
                            <button onclick="updateDashState('tableSubFilter', 'all_active')" id="sm-tf-all_active" class="sm-tf-btn bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">⏳ المحجوز</button>
                            <button onclick="updateDashState('tableSubFilter', 'all_valid')" id="sm-tf-all_valid" class="sm-tf-btn bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">📦 الكل</button>
                            <button onclick="updateDashState('tableSubFilter', 'discounted')" id="sm-tf-discounted" class="sm-tf-btn bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">🎁 بخصم</button>
                            <button onclick="updateDashState('tableSubFilter', 'debt')" id="sm-tf-debt" class="sm-tf-btn bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">📕 آجل</button>
                            <button onclick="updateDashState('tableSubFilter', 'canceled')" id="sm-tf-canceled" class="sm-tf-btn bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">❌ ملغي</button>
                        </div>
                    </div>

                    <div class="relative w-full md:w-80">
                        <i class="fa-solid fa-search absolute right-3 top-2.5 text-slate-400 text-xs"></i>
                        <input type="search" id="sm-dash-table-search" oninput="updateDashState('tableSearch', this.value)" placeholder="ابحث باسم عميل، رقم، منطقة، صنف..." class="w-full pr-8 pl-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:bg-white focus:border-brand-primary">
                    </div>

                    <div class="overflow-x-auto custom-scroll max-h-[420px]">
                        <table class="w-full text-right text-xs whitespace-nowrap">
                            <thead class="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    <th class="py-2.5 px-3 font-black">العميل والمنطقة</th>
                                    <th class="py-2.5 px-3 font-black text-center">الدفعة / الحالة</th>
                                    <th class="py-2.5 px-3 font-black text-center">الأصناف</th>
                                    <th class="py-2.5 px-3 font-black text-center">قيمة المنتجات</th>
                                    <th class="py-2.5 px-3 font-black text-center text-red-600">الخصم</th>
                                    <th class="py-2.5 px-3 font-black text-center">صافي المنتجات لك</th>
                                    <th class="py-2.5 px-3 font-black text-center">التاريخ</th>
                                    <th class="py-2.5 px-3 font-black text-center">فتح</th>
                                </tr>
                            </thead>
                            <tbody id="sm-dash-orders-tbody" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ========================================================= -->
            <!-- 🧾 الصفحة الثانية (Ledger, Fixed, Debts & Annual Reset) -->
            <!-- ========================================================= -->
            <div id="sm-panel-ledger_waste" class="hidden space-y-5">

                <!-- أزرار إضافة عملية سريعة في أعلى الصفحة الثانية -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft flex flex-wrap justify-between items-center gap-3">
                    <div>
                        <h4 class="text-sm font-black text-slate-800"><i class="fa-solid fa-vault text-brand-primary ml-1"></i> الخزنة والمصروفات، الديون عليا، الثوابت الشهرية، والجرد السنوي</h4>
                        <p class="text-[11px] font-bold text-slate-400">عند تسجيل أي مصروف يسحب السيستم من الكاش أولاً، وإذا لم يكفِ يسحب الباقي تلقائياً من الأونلاين.</p>
                    </div>
                    <div class="flex flex-wrap gap-1.5 w-full sm:w-auto">
                        <button onclick="openLedgerEntryBox('expense')" class="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-2 rounded-xl text-xs font-black shadow-sm">+ مصروف / شراء</button>
                        <button onclick="openLedgerEntryBox('payable_debt')" class="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-sm">+ تسجيل دين عليا</button>
                        <button onclick="openLedgerEntryBox('waste')" class="flex-1 sm:flex-none bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow-sm">+ هالك / بايظ</button>
                    </div>
                </div>

                <!-- فورم تسجيل (مصروف ذكي / دين عليا / هالك) -->
                <div id="sm-ledger-form-box" class="hidden bg-slate-900 text-white p-5 rounded-2xl shadow-xl space-y-4 border border-slate-700">
                    <div class="flex justify-between items-center pb-2.5 border-b border-white/10">
                        <h4 id="lg-form-title" class="font-black text-xs sm:text-sm text-amber-400">تسجيل عملية جديدة</h4>
                        <button onclick="document.getElementById('sm-ledger-form-box').classList.add('hidden')" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-base"></i></button>
                    </div>
                    <input type="hidden" id="lg-entry-type" value="expense">

                    <!-- 1. حقول المصروف الذكي -->
                    <div id="lg-expense-fields" class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">بند المشتريات / المصروف</label>
                            <select id="lg-exp-category" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none">
                                <option value="علف وتسمين">🌾 علف وتسمين</option>
                                <option value="كتاكيت / بيض تفريخ">🐣 كتاكيت / بيض تفريخ</option>
                                <option value="أجرة وعمالة">👷 أجرة وعمالة</option>
                                <option value="إيجار وكهرباء ومياه">⚡ إيجار وكهرباء ومياه</option>
                                <option value="أطباق وأكياس واستيكرات">📦 أطباق وأكياس واستيكرات</option>
                                <option value="أدوية وفيتامينات">💊 أدوية وفيتامينات</option>
                                <option value="سحب شخصي / مصروف بيت">🏠 سحب شخصي / مصروف بيت</option>
                                <option value="مصروفات أخرى">📝 مصروفات أخرى</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">المبلغ بالجنيه *</label>
                            <input type="number" id="lg-exp-amount" placeholder="مثال: 500" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-amber-400 outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">طريقة السحب من الخزنة</label>
                            <select id="lg-exp-source" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-emerald-300 outline-none">
                                <option value="auto">🤖 تلقائي ذكي (يسحب من الكاش، ولو مش مكفي يكمل من الأونلاين)</option>
                                <option value="online">💳 سحب من محفظة الأونلاين أولاً</option>
                                <option value="credit_debt">🟣 معيش سيولة — سجله في (ديون عليا)</option>
                            </select>
                        </div>
                    </div>

                    <!-- 2. حقول تسجيل (ديون عليا) -->
                    <div id="lg-debt-fields" class="hidden grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label class="text-[10px] font-bold text-purple-300 block mb-1">اسم الشخص / التاجر صاحب الدين *</label>
                            <input type="text" id="lg-debt-creditor" placeholder="مثال: تاجر العلف / الحاج فلان..." class="w-full bg-slate-800 border border-purple-500/50 rounded-xl p-2 text-xs font-black text-white outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-purple-300 block mb-1">مقابل إيه؟ (الغرض)</label>
                            <input type="text" id="lg-debt-category" placeholder="مثال: شكارة علف / مستلزمات / عمالة..." class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-purple-300 block mb-1">المبلغ المطلوب سداده (ج.م) *</label>
                            <input type="number" id="lg-debt-amount" placeholder="مثال: 1500" class="w-full bg-slate-800 border border-purple-500/50 rounded-xl p-2 text-xs font-black text-purple-300 outline-none">
                        </div>
                    </div>

                    <!-- 3. حقول الهالك والبايظ -->
                    <div id="lg-waste-fields" class="hidden grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">نوع الهالك / السحب</label>
                            <select id="lg-waste-kind" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-rose-300 outline-none">
                                <option value="هالك تربية / نافق">🐤 هالك تربية / نافق</option>
                                <option value="بايظ فريزر / تالف تخزين">❄️ بايظ في الفريزر</option>
                                <option value="استهلاك بيتي / هدايا">🏠 استهلاك بيت / هدية</option>
                                <option value="تعويض عميل">🤝 تعويض لعميل</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">الصنف</label>
                            <select id="lg-waste-product" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none"></select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">العدد (طبق/جوز) *</label>
                            <input type="number" id="lg-waste-qty" placeholder="مثال: 2" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-rose-400 outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">التكلفة (اختياري)</label>
                            <input type="number" id="lg-waste-cost" placeholder="يحسب تلقائياً" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none">
                        </div>
                        <div class="md:col-span-4">
                            <label class="inline-flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-[11px] font-black text-cyan-300">
                                <input type="checkbox" id="lg-waste-deduct-fz" class="w-4 h-4 accent-cyan-400 rounded">
                                خصم هذا العدد أوتوماتيك من رصيد الفريزر الحالي ❄️
                            </label>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">ربط بدفعة (اختياري)</label>
                            <select id="lg-batch-name" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none"></select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-300 block mb-1">ملاحظات إضافية</label>
                            <input type="text" id="lg-notes" placeholder="أي تفاصيل..." class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none">
                        </div>
                        <div class="flex items-end">
                            <button onclick="submitLedgerRecord()" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2 rounded-xl text-xs shadow-lg transition-all">💾 حفظ وتسميع في الحسابات</button>
                        </div>
                    </div>
                </div>

                <!-- 📅 القسم (أ): جدول المصاريف الثابتة الشهرية (إيجار، كهرباء، مياه، عمالتي وأجرتي) -->
                <div class="bg-white p-5 rounded-2xl border-2 border-amber-200 shadow-soft space-y-3">
                    <div class="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-slate-100">
                        <div>
                            <h4 class="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                                <i class="fa-solid fa-calendar-check text-amber-500"></i> المصاريف الثابتة الشهرية (إيجار • كهرباء • مياه • عمالتك وأجرتك)
                            </h4>
                            <p class="text-[10px] font-bold text-slate-400">ضع المبالغ الثابتة مرة واحدة؛ وسينبهك السيستم أول أو آخر كل شهر لاعتمادها (أو يخصمها تلقائياً).</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span id="fm-status-badge" class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black">إجمالي الثوابت: 0 ج/شهر</span>
                            <button type="button" onclick="checkAndProcessMonthlyFixedExpenses(true)" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm transition-all">⚡ اعتماد وخصم شهر حالي</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-600 block mb-1">🏠 الإيجار الشهري</label>
                            <input type="number" id="fm-rent" placeholder="0" class="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-center font-black text-xs text-slate-800 outline-none">
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-600 block mb-1">⚡ الكهرباء</label>
                            <input type="number" id="fm-electricity" placeholder="0" class="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-center font-black text-xs text-slate-800 outline-none">
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-600 block mb-1">💧 المياه</label>
                            <input type="number" id="fm-water" placeholder="0" class="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-center font-black text-xs text-slate-800 outline-none">
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-emerald-700 block mb-1">👷 العمالة / أجرتي</label>
                            <input type="number" id="fm-labor" placeholder="0" class="w-full bg-white border border-emerald-200 rounded-lg p-1.5 text-center font-black text-xs text-emerald-800 outline-none">
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-600 block mb-1">📌 ثوابت أخرى</label>
                            <input type="number" id="fm-other" placeholder="0" class="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-center font-black text-xs text-slate-800 outline-none">
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                            <label class="text-[10px] font-black text-slate-600 block mb-1">⏰ موعد التنبيه</label>
                            <select id="fm-timing" class="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-black text-slate-800 outline-none">
                                <option value="start">أول كل شهر (يوم 1)</option>
                                <option value="end">آخر كل شهر (يوم 25)</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
                        <label class="flex items-center gap-2 text-xs font-black text-slate-700 cursor-pointer">
                            <input type="checkbox" id="fm-auto-approve" class="w-4 h-4 accent-brand-primary rounded">
                            تنزيل وخصم تلقائي في موعدها بدون انتظار ضغطة (أو اتركه غير مفعّل ليظهر لك إشعار تذكيري أولاً)
                        </label>
                        <button type="button" onclick="saveFixedMonthlyExpensesConfig()" class="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all">💾 حفظ مبالغ الثوابت</button>
                    </div>
                </div>

                <!-- 🟣 القسم (ب): جدول (الديون اللي عليا) لمنع إضافتها مرتين ومعرفة أصحابها -->
                <div id="sm-payable-debts-section" class="bg-white p-5 rounded-2xl border-2 border-purple-200 shadow-soft space-y-3">
                    <div class="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-purple-100">
                        <div>
                            <h4 class="text-xs sm:text-sm font-black text-purple-900"><i class="fa-solid fa-file-invoice-dollar text-purple-600 ml-1"></i> سجل (الديون اللي عليا) للموردين والتجار والالتزامات</h4>
                            <p class="text-[10px] font-bold text-slate-400">هذه الديون محسوبة في التكلفة ولكن لم تُخصم من الخزنة بعد؛ عند الضغط على (💵 سداد) تُخصم من الخزنة فقط دون تكرارها كمصروف.</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span id="sm-payable-debts-total-badge" class="bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 rounded-xl text-xs font-black">إجمالي المتبقي عليا: 0 ج</span>
                            <button onclick="openLedgerEntryBox('payable_debt')" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm">+ إضافة دين عليا</button>
                        </div>
                    </div>

                    <div class="overflow-x-auto custom-scroll max-h-[300px]">
                        <table class="w-full text-right text-xs whitespace-nowrap">
                            <thead class="bg-purple-50 text-purple-900 border-b border-purple-100">
                                <tr>
                                    <th class="py-2.5 px-3 font-black">صاحب الدين (مين اللي ليه فلوس؟)</th>
                                    <th class="py-2.5 px-3 font-black">مقابل إيه / الدفعة</th>
                                    <th class="py-2.5 px-3 font-black text-center">أصل الدين</th>
                                    <th class="py-2.5 px-3 font-black text-center">المسدد منه</th>
                                    <th class="py-2.5 px-3 font-black text-center">المتبقي عليك</th>
                                    <th class="py-2.5 px-3 font-black text-center">التاريخ</th>
                                    <th class="py-2.5 px-3 font-black text-center">سداد / حذف</th>
                                </tr>
                            </thead>
                            <tbody id="sm-payable-debts-tbody" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>

                <!-- 📋 القسم (ج): سجل المصروفات والهالك التفصيلي -->
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-soft space-y-3">
                    <h4 class="text-xs sm:text-sm font-black text-slate-800 pb-2 border-b border-slate-100">📋 سجل المصروفات المسحوبة والهالك في الفترة</h4>
                    <div class="overflow-x-auto custom-scroll max-h-[360px]">
                        <table class="w-full text-right text-xs whitespace-nowrap">
                            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
                                <tr>
                                    <th class="py-2.5 px-3 font-black">النوع والبند</th>
                                    <th class="py-2.5 px-3 font-black text-center">الدفعة</th>
                                    <th class="py-2.5 px-3 font-black text-center">خصم من خزنة</th>
                                    <th class="py-2.5 px-3 font-black text-center">المبلغ</th>
                                    <th class="py-2.5 px-3 font-black">التفاصيل</th>
                                    <th class="py-2.5 px-3 font-black text-center">التاريخ</th>
                                    <th class="py-2.5 px-3 font-black text-center">حذف</th>
                                </tr>
                            </thead>
                            <tbody id="sm-ledger-records-tbody" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>

                <!-- 🔄 القسم (د): الجرد السنوي وتصفير السيستم لبداية جديدة مع حفظ القديم (سنة 2026) -->
                <div class="bg-gradient-to-l from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-lg space-y-4">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/10">
                        <div>
                            <h4 class="text-sm font-black text-amber-300 flex items-center gap-2">
                                <i class="fa-solid fa-Folder-tree"></i> الجرد السنوي وتصفير الحسابات لبداية جديدة (حفظ القديم في بند مستقل)
                            </h4>
                            <p class="text-[11px] text-slate-300 font-bold mt-0.5">يصفر لك الخزنة والمبيعات والمصاريف الحالية إلى (0 ج) لتبدأ من الصفر وتحسب عمالتك ومصاريفك على نظافة، مع حفظ كل الحسابات السابقة في أرشيف (مثل: جرد سنة 2026).</p>
                        </div>
                        <div class="flex flex-wrap gap-2 shrink-0">
                            <button type="button" onclick="executeAnnualInventoryReset()" class="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow-md transition-all">
                                🔄 عمل جرد سنوي وتصفير السيستم الآن
                            </button>
                            <button type="button" onclick="cancelFiscalResetAndRestoreAll()" id="sm-btn-restore-fiscal" class="hidden bg-white/10 hover:bg-white/20 text-white border border-white/20 font-black px-3 py-2 rounded-xl text-xs transition-all">
                                ↩️ إلغاء التصفير وإظهار القديم
                            </button>
                        </div>
                    </div>

                    <div id="sm-annual-archives-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"></div>
                </div>

            </div>

            <!-- ========================================================= -->
            <!-- 👑 الصفحة الثالثة الفرعية (VIP & Zones): رادار الغائبين والمناطق -->
            <!-- ========================================================= -->
            <div id="sm-panel-vip_zones" class="hidden space-y-4">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-soft flex flex-col">
                        <div class="mb-3 pb-2 border-b border-slate-100">
                            <h4 class="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                                <i class="fa-solid fa-user-clock text-amber-500"></i> رادار استرجاع كبار العملاء الغائبين (VIP)
                            </h4>
                        </div>
                        <div id="sm-vip-churn-list" class="space-y-2 max-h-[420px] overflow-y-auto custom-scroll pr-1"></div>
                    </div>

                    <div class="bg-white p-5 rounded-2xl border border-indigo-100 shadow-soft flex flex-col">
                        <div class="mb-3 pb-2 border-b border-slate-100">
                            <h4 class="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                                <i class="fa-solid fa-map-location-dot text-indigo-600"></i> ترتيب المناطق وأداء المناديب
                            </h4>
                        </div>
                        <div id="sm-zones-profit-list" class="space-y-2 max-h-[420px] overflow-y-auto custom-scroll pr-1"></div>
                    </div>
                </div>
            </div>
        `;

        dashView.appendChild(root);
    };

    // =========================================================================
    // 📅 خامساً: دوال الفلترة الزمنية
    // =========================================================================

    function parseOrderDateObj(o, basis) {
        if (basis === 'effective' && o.status === 'completed') {
            if (o.completedAt && typeof o.completedAt.toMillis === 'function') {
                return new Date(o.completedAt.toMillis());
            }
            if (o.completedAtStr) {
                const parsedComp = new Date(o.completedAtStr);
                if (!isNaN(parsedComp.getTime())) return parsedComp;
            }
        }
        if (o.createdAt && typeof o.createdAt.toMillis === 'function') {
            return new Date(o.createdAt.toMillis());
        }
        if (o.orderDate) {
            const parsedOrd = new Date(o.orderDate);
            if (!isNaN(parsedOrd.getTime())) return parsedOrd;
        }
        return null;
    }

    function isTimestampInSelectedPeriod(dObj) {
        const st = window.dashState;
        if (st.period === 'all_time') return true;
        if (!dObj || isNaN(dObj.getTime())) return false;

        const now = new Date();
        const oYear = dObj.getFullYear();
        const oMonth = dObj.getMonth();
        const oDate = dObj.getDate();

        if (st.period === 'today') {
            return oYear === now.getFullYear() && oMonth === now.getMonth() && oDate === now.getDate();
        }
        if (st.period === 'this_month') {
            return oYear === now.getFullYear() && oMonth === now.getMonth();
        }
        if (st.period === 'last_month') {
            const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return oYear === lastMonthDate.getFullYear() && oMonth === lastMonthDate.getMonth();
        }
        if (st.period === 'pick_month') {
            if (!st.selectedMonth) return true;
            const [selY, selM] = st.selectedMonth.split('-').map(Number);
            return oYear === selY && (oMonth + 1) === selM;
        }
        if (st.period === 'custom') {
            const dayStart = new Date(oYear, oMonth, oDate).getTime();
            if (st.dateFrom) {
                const fromParts = st.dateFrom.split('-').map(Number);
                const fromTime = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]).getTime();
                if (dayStart < fromTime) return false;
            }
            if (st.dateTo) {
                const toParts = st.dateTo.split('-').map(Number);
                const toTime = new Date(toParts[0], toParts[1] - 1, toParts[2]).getTime();
                if (dayStart > toTime) return false;
            }
            return true;
        }
        return true;
    }

    function isOrderInSelectedPeriod(o) {
        const dObj = parseOrderDateObj(o, window.dashState.dateBasis);
        return isTimestampInSelectedPeriod(dObj);
    }

    window.updateDashState = function (key, val) {
        window.dashState[key] = val;

        if (key === 'period') {
            document.querySelectorAll('.dash-period-btn').forEach(btn => {
                btn.className = 'dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all';
            });
            const activeBtn = document.getElementById('d-period-' + val);
            if (activeBtn) {
                activeBtn.className = 'dash-period-btn bg-brand-primary text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition-all';
            }

            const extraWrap = document.getElementById('dash-extra-date-controls');
            const monthWrap = document.getElementById('dash-month-picker-wrap');
            const customWrap = document.getElementById('dash-custom-range-wrap');

            if (val === 'pick_month') {
                extraWrap.classList.remove('hidden');
                monthWrap.classList.remove('hidden');
                customWrap.classList.add('hidden');
            } else if (val === 'custom') {
                extraWrap.classList.remove('hidden');
                customWrap.classList.remove('hidden');
                monthWrap.classList.add('hidden');
            } else {
                extraWrap.classList.add('hidden');
            }
        }

        if (key === 'activeSubTab') {
            ['overview', 'ledger_waste', 'vip_zones'].forEach(tab => {
                const btn = document.getElementById('sm-subtab-' + tab);
                const panel = document.getElementById('sm-panel-' + tab);
                if (btn) {
                    btn.className = (tab === val)
                        ? 'sm-subtab-btn bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all'
                        : 'sm-subtab-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all';
                }
                if (panel) {
                    if (tab === val) panel.classList.remove('hidden');
                    else panel.classList.add('hidden');
                }
            });
        }

        if (key === 'tableSubFilter') {
            document.querySelectorAll('.sm-tf-btn').forEach(btn => {
                btn.className = 'sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all';
            });
            const activeTf = document.getElementById('sm-tf-' + val);
            if (activeTf) {
                activeTf.className = 'sm-tf-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm transition-all';
            }
        }

        if (key === 'sourceFilter') {
            const sel = document.getElementById('dash-source-select');
            if (sel && sel.value !== val) sel.value = val;
            const resetBtn = document.getElementById('sm-reset-batch-filter');
            if (resetBtn) {
                if (val !== 'all') resetBtn.classList.remove('hidden');
                else resetBtn.classList.add('hidden');
            }
        }

        window.renderSmartDashboard();
    };

    // =========================================================================
    // 🔄 سادساً: الريندر الرئيسي الشامل والمضبوط حسابياً 100% (بدون توصيل + خزنة ذكية + ديون عليا + جرد سنوي)
    // =========================================================================

    function getOrderEffectiveTimestampMs(o) {
        if (!o) return 0;
        if (o.completedAt && typeof o.completedAt.toMillis === 'function') return o.completedAt.toMillis();
        if (o.createdAt && typeof o.createdAt.toMillis === 'function') return o.createdAt.toMillis();
        if (o.completedAtStr) {
            const t = new Date(o.completedAtStr).getTime();
            if (!isNaN(t)) return t;
        }
        if (o.orderDate) {
            const t = new Date(o.orderDate).getTime();
            if (!isNaN(t)) return t;
        }
        return 0;
    }

    window.renderSmartDashboard = function () {
        window.initSmartDashboardLayout();
        if (!document.getElementById('smart-dashboard-root')) return;

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};
        const archivedArr = (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData)) ? archivedBatchesData : [];
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const freezerObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};
        const custArr = (typeof customersData !== 'undefined' && Array.isArray(customersData)) ? customersData : [];
        const ledgerRecordsArr = Object.values(window.storeLedgerRecords || {});
        const accCfg = window.storeAccountingConfig || { fiscalResetMs: 0, fixedMonthly: {}, annualArchives: {} };

        const setElHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

        // 0. فحص وتعبئة المصاريف الثابتة الشهرية + إظهار الإشعار الذكي أول أو آخر الشهر
        const fm = accCfg.fixedMonthly || {};
        const setInputIfNotFocused = (id, val) => {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) el.value = val || '';
        };
        setInputIfNotFocused('fm-rent', fm.rent || '');
        setInputIfNotFocused('fm-electricity', fm.electricity || '');
        setInputIfNotFocused('fm-water', fm.water || '');
        setInputIfNotFocused('fm-labor', fm.labor || '');
        setInputIfNotFocused('fm-other', fm.otherFixed || '');
        const fmTimingEl = document.getElementById('fm-timing');
        if (fmTimingEl && document.activeElement !== fmTimingEl) fmTimingEl.value = fm.dueTiming || 'start';
        const fmAutoEl = document.getElementById('fm-auto-approve');
        if (fmAutoEl) fmAutoEl.checked = Boolean(fm.autoApprove);

        const totalFixedMonthlyAmt = (Number(fm.rent) || 0) + (Number(fm.electricity) || 0) + (Number(fm.water) || 0) + (Number(fm.labor) || 0) + (Number(fm.otherFixed) || 0);
        setElHtml('fm-status-badge', `إجمالي الثوابت: ${totalFixedMonthlyAmt.toLocaleString()} ج/شهر`);

        const nowObj = new Date();
        const curMonthKey = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}`;
        const isFixedDueNow = (fm.dueTiming === 'end' ? nowObj.getDate() >= 25 : nowObj.getDate() >= 1);
        const fixedBanner = document.getElementById('sm-fixed-monthly-alert-banner');
        if (fixedBanner) {
            if (totalFixedMonthlyAmt > 0 && fm.lastAppliedMonth !== curMonthKey && isFixedDueNow) {
                fixedBanner.classList.remove('hidden');
                fixedBanner.innerHTML = `
                    <div class="flex items-center gap-2 text-xs font-black">
                        <i class="fa-solid fa-bell animate-bounce text-base"></i>
                        <span>🔔 تذكير المصاريف الأساسية لشهر (${curMonthKey}): إجمالي (إيجار + كهرباء + مياه + عمالة) = <strong>${totalFixedMonthlyAmt.toLocaleString()} ج.م</strong> لم يُخصم بعد!</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="checkAndProcessMonthlyFixedExpenses(true)" class="bg-slate-900 hover:bg-slate-800 text-amber-300 px-3 py-1.5 rounded-xl text-[11px] font-black shadow-sm">⚡ اعتماد وخصم الآن</button>
                        <button type="button" onclick="updateDashState('activeSubTab', 'ledger_waste')" class="bg-white/60 hover:bg-white text-slate-900 px-2.5 py-1.5 rounded-xl text-[10px] font-black">تعديل الثوابت</button>
                    </div>
                `;
            } else {
                fixedBanner.classList.add('hidden');
            }
        }

        // شريط الجرد السنوي إذا كان هناك تصفير مفعل
        const restoreFiscalBtn = document.getElementById('sm-btn-restore-fiscal');
        if (restoreFiscalBtn) {
            restoreFiscalBtn.classList.toggle('hidden', !(Number(accCfg.fiscalResetMs) > 0));
        }
        const fiscalBanner = document.getElementById('sm-fiscal-archive-banner');
        if (fiscalBanner) {
            if (Number(accCfg.fiscalResetMs) > 0) {
                const resetDateFormatted = new Date(Number(accCfg.fiscalResetMs)).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
                fiscalBanner.classList.remove('hidden');
                fiscalBanner.innerHTML = `
                    <div class="text-[11px] font-black flex items-center gap-2">
                        <i class="fa-solid fa-circle-check text-emerald-400"></i>
                        <span>أنت تعمل الآن في دورة محاسبية جديدة بدأت من الصفر بتاريخ (${resetDateFormatted}) — جميع الحسابات الأقدم محفوظة في أرشيف الجرد السنوي بالصفحة الثانية.</span>
                    </div>
                    <button type="button" onclick="updateDashState('activeSubTab', 'ledger_waste')" class="bg-white/10 hover:bg-white/20 text-amber-300 px-2.5 py-1 rounded-lg text-[10px] font-black">📁 عرض أرشيف السنين</button>
                `;
            } else {
                fiscalBanner.classList.add('hidden');
            }
        }

        // 1. تحديث حالة المتجر + حساب الفريزر الفعلي
        const storeBtn = document.getElementById('sm-cmd-store-status');
        if (storeBtn && typeof storeSettings !== 'undefined') {
            const isOpen = storeSettings.storeOpen !== false;
            storeBtn.className = isOpen
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1'
                : 'bg-red-500 hover:bg-red-400 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1';
            storeBtn.innerHTML = isOpen
                ? '<i class="fa-solid fa-circle-check text-[10px]"></i> <span>المتجر مفتوح</span>'
                : '<i class="fa-solid fa-lock text-[10px]"></i> <span>المتجر مغلق</span>';
        }

        let totalFreezerMeatUnits = 0;
        let totalFreezerValue = 0;
        let hasNegativeInFreezer = false;

        Object.keys(freezerObj).forEach(pId => {
            const rawQty = Number(freezerObj[pId]) || 0;
            if (rawQty < 0) hasNegativeInFreezer = true;
            const safeQty = Math.max(0, rawQty);
            if (safeQty > 0) {
                const cls = window.classifyOrderItem({ id: pId, name: prodsObj[pId]?.name || '' });
                if (cls.isMeat) totalFreezerMeatUnits += safeQty;
                const price = window.getProductRealPrice(pId);
                totalFreezerValue += (safeQty * price);
            }
        });

        if (hasNegativeInFreezer) {
            window.sanitizeFreezerNegativeValues(false);
        }

        setElHtml('sm-cmd-freezer-total', `${totalFreezerMeatUnits} طبق | ${totalFreezerValue.toLocaleString()} ج`);

        // 2. بناء قوائم الدفعات الشاملة
        const liveBatchByName = {};
        Object.keys(batchesObj).forEach(bId => {
            if (batchesObj[bId] && batchesObj[bId].name && batchesObj[bId].name !== 'undefined') {
                liveBatchByName[batchesObj[bId].name.trim()] = { id: bId, ...batchesObj[bId] };
            }
        });
        const archBatchByName = {};
        archivedArr.forEach(a => {
            if (a && a.batchName && a.batchName !== 'undefined') {
                archBatchByName[a.batchName.trim()] = a;
            }
        });

        const batchNamesSet = new Set([
            ...Object.keys(liveBatchByName),
            ...Object.keys(archBatchByName)
        ]);
        ordersList.forEach(o => {
            const bName = window.resolveOrderBatchName(o);
            if (bName) batchNamesSet.add(bName);
        });

        const sourceSelect = document.getElementById('dash-source-select');
        const lgBatchSel = document.getElementById('lg-batch-name');
        if (lgBatchSel) {
            const curB = lgBatchSel.value;
            let bOpts = '<option value="">-- عام (غير مربوط بدفعة) --</option>';
            Array.from(batchNamesSet).forEach(bName => {
                bOpts += `<option value="${bName}" ${curB === bName ? 'selected' : ''}>${bName}</option>`;
            });
            lgBatchSel.innerHTML = bOpts;
        }

        const lgProdSel = document.getElementById('lg-waste-product');
        if (lgProdSel) {
            const curP = lgProdSel.value;
            let pOpts = '<option value="">-- سمان عام (قبل التكييس) --</option>';
            Object.keys(prodsObj).forEach(pId => {
                pOpts += `<option value="${pId}" ${curP === pId ? 'selected' : ''}>${prodsObj[pId].name}</option>`;
            });
            lgProdSel.innerHTML = pOpts;
        }

        const isSpecificBatchSelected = window.dashState.sourceFilter.startsWith('batch:');
        const selectedBatchNameTarget = isSpecificBatchSelected ? window.dashState.sourceFilter.replace('batch:', '').trim() : '';

        const periodBadge = document.getElementById('dash-active-period-badge');
        if (periodBadge) {
            if (isSpecificBatchSelected) {
                periodBadge.innerText = `📌 دفعة: ${selectedBatchNameTarget}`;
            } else {
                const pNames = {
                    'this_month': 'هذا الشهر (' + new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }) + ')',
                    'last_month': 'الشهر الماضي',
                    'pick_month': 'شهر: ' + (window.dashState.selectedMonth || ''),
                    'today': 'اليوم فقط',
                    'custom': 'فترة مخصصة',
                    'all_time': 'منذ آخر جرد'
                };
                periodBadge.innerText = pNames[window.dashState.period] || 'هذا الشهر';
            }
        }

        // 3. فلترة السجلات المالية بعد تاريخ الجرد السنوي (إن وجد) وحساب المصروفات والديون عليا والهالك
        const activeFiscalLedgerArr = ledgerRecordsArr.filter(rec => rec && window.isAfterFiscalReset(rec.createdAtMs));

        const wasteByBatchName = {};
        const expensesByBatchName = {};
        let totalOwnerPayableDebtNow = 0; // إجمالي الديون اللي عليا غير المسددة حتى الآن

        activeFiscalLedgerArr.forEach(rec => {
            if (rec.type === 'waste' && rec.batchName) {
                wasteByBatchName[rec.batchName.trim()] = (wasteByBatchName[rec.batchName.trim()] || 0) + (Number(rec.qty) || 0);
            }
            if ((rec.type === 'expense' || rec.type === 'payable_debt') && rec.batchName) {
                expensesByBatchName[rec.batchName.trim()] = (expensesByBatchName[rec.batchName.trim()] || 0) + (Number(rec.amount) || 0);
            }
            if (rec.type === 'payable_debt') {
                const rem = Number(rec.remainingDebt !== undefined ? rec.remainingDebt : rec.amount) || 0;
                if (rem > 0) totalOwnerPayableDebtNow += rem;
            }
        });

        const filterRecordBySource = (rec) => {
            const sf = window.dashState.sourceFilter;
            if (sf === 'all') return true;
            if (sf === 'batches_only') return Boolean(rec.batchName);
            if (sf === 'normal_only') return !rec.batchName;
            if (isSpecificBatchSelected) {
                return (rec.batchName || '').trim() === selectedBatchNameTarget;
            }
            return true;
        };

        const periodLedgerRecords = activeFiscalLedgerArr.filter(rec => {
            if (isSpecificBatchSelected) return filterRecordBySource(rec);
            const dObj = rec.createdAtMs ? new Date(rec.createdAtMs) : (rec.dateStr ? new Date(rec.dateStr) : null);
            return isTimestampInSelectedPeriod(dObj) && filterRecordBySource(rec);
        });

        let periodExpensesCash = 0, periodExpensesOnline = 0;
        let periodDirectExpensesTotal = 0; // مصاريف مدفوعة
        let periodIncurredDebtsTotal = 0;  // مشتريات آجلة (ديون عليا) في الفترة — تُحسب مرة واحدة في التكلفة
        let periodWasteUnits = 0, periodWasteCost = 0;

        periodLedgerRecords.forEach(rec => {
            if (rec.type === 'expense' || rec.type === 'fixed_monthly') {
                const amt = Number(rec.amount) || 0;
                periodDirectExpensesTotal += amt;
                if (rec.cashPaid !== undefined || rec.onlinePaid !== undefined) {
                    periodExpensesCash += Number(rec.cashPaid) || 0;
                    periodExpensesOnline += Number(rec.onlinePaid) || 0;
                } else {
                    if (rec.paymentSource === 'online') periodExpensesOnline += amt;
                    else periodExpensesCash += amt;
                }
            } else if (rec.type === 'payable_debt') {
                // المشتريات الآجلة تُحسب كتكلفة في الفترة مرة واحدة، ولا يُخصم من الخزنة إلا ما تم سداده فعلياً
                periodIncurredDebtsTotal += Number(rec.amount) || 0;
                periodExpensesCash += Number(rec.paidCash) || 0;
                periodExpensesOnline += Number(rec.paidOnline) || 0;
            } else if (rec.type === 'waste') {
                periodWasteUnits += Number(rec.qty) || 0;
                periodWasteCost += Number(rec.amount) || 0;
            }
        });

        // إجمالي مصروفات والتزامات الفترة (دون تكرار سداد الدين مرتين)
        const totalPeriodExpensesAndDebts = periodDirectExpensesTotal + periodIncurredDebtsTotal;

        // 4. تجميع حسابات الدفعات (صافي المنتجات فقط بدون التوصيل، مع احترام نقطة الجرد السنوي)
        const sourcesSummary = {};
        const activeFiscalOrdersList = ordersList.filter(o => o && o.status !== 'trash' && window.isAfterFiscalReset(getOrderEffectiveTimestampMs(o)));

        activeFiscalOrdersList.forEach(o => {
            const resolvedBName = window.resolveOrderBatchName(o);
            const hasBatch = Boolean(resolvedBName);

            if (!hasBatch && !isSpecificBatchSelected && !isOrderInSelectedPeriod(o)) return;

            const bLabel = hasBatch ? resolvedBName : '❄️ طلبات فورية (بدون دفعة)';
            const filterKey = hasBatch ? ('batch:' + bLabel) : 'normal_only';

            if (!sourcesSummary[bLabel]) {
                sourcesSummary[bLabel] = {
                    label: bLabel,
                    filterKey: filterKey,
                    isBatch: hasBatch,
                    batchId: o.batchId || (liveBatchByName[bLabel] ? liveBatchByName[bLabel].id : ''),
                    hasOrderInSelectedPeriod: Boolean(liveBatchByName[bLabel]),
                    completedCount: 0,
                    activeCount: 0,
                    totalValidCount: 0,
                    soldMeatUnits: 0,
                    completedMeatUnits: 0,
                    soldChickUnits: 0,
                    soldEggUnits: 0,
                    totalBatchSales: 0,
                    collectedRevenue: 0,
                    pendingRevenue: 0,
                    productsSubTotal: 0,
                    discounts: 0
                };
            }

            if (isOrderInSelectedPeriod(o)) {
                sourcesSummary[bLabel].hasOrderInSelectedPeriod = true;
            }

            if (o.status === 'canceled') return;

            const fin = window.getAccurateOrderFinancials(o);
            const isComp = (o.status === 'completed');

            sourcesSummary[bLabel].totalValidCount++;
            sourcesSummary[bLabel].totalBatchSales += fin.total;
            sourcesSummary[bLabel].productsSubTotal += fin.subtotal;
            sourcesSummary[bLabel].discounts += (fin.discount + fin.implicitDiscount);

            if (isComp) {
                sourcesSummary[bLabel].completedCount++;
                sourcesSummary[bLabel].collectedRevenue += fin.total;
            } else {
                sourcesSummary[bLabel].activeCount++;
                sourcesSummary[bLabel].pendingRevenue += fin.total;
            }

            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const q = Number(item.quantity) || 0;
                    const cls = window.classifyOrderItem(item);
                    if (cls.type === 'meat') {
                        sourcesSummary[bLabel].soldMeatUnits += q;
                        if (isComp) sourcesSummary[bLabel].completedMeatUnits += q;
                    } else if (cls.type === 'chick') {
                        sourcesSummary[bLabel].soldChickUnits += q;
                    } else if (cls.type === 'egg') {
                        sourcesSummary[bLabel].soldEggUnits += q;
                    }
                });
            }
        });

        // 5. فلترة الطلبات للكروت العلوية والجدول
        const finalPeriodOrders = activeFiscalOrdersList.filter(o => {
            const resolvedBName = window.resolveOrderBatchName(o);
            const hasBatch = Boolean(resolvedBName);
            const sf = window.dashState.sourceFilter;

            if (isSpecificBatchSelected) {
                return resolvedBName === selectedBatchNameTarget;
            }
            if (!isOrderInSelectedPeriod(o)) return false;
            if (sf === 'all') return true;
            if (sf === 'batches_only') return hasBatch;
            if (sf === 'normal_only') return !hasBatch;
            return true;
        });

        if (!window.dashState.calcMode) window.dashState.calcMode = 'completed';
        if (window.dashState.showArchivedDrawer === undefined) window.dashState.showArchivedDrawer = false;

        if (typeof window.setDashAccountingMode !== 'function') {
            window.setDashAccountingMode = function (mode) {
                window.dashState.calcMode = mode;
                if (mode === 'completed') window.dashState.tableSubFilter = 'completed';
                else if (mode === 'pending') window.dashState.tableSubFilter = 'all_active';
                else window.dashState.tableSubFilter = 'all_valid';

                document.querySelectorAll('.sm-tf-btn').forEach(btn => {
                    btn.className = 'sm-tf-btn bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all';
                });
                const activeTf = document.getElementById('sm-tf-' + window.dashState.tableSubFilter);
                if (activeTf) {
                    activeTf.className = 'sm-tf-btn bg-slate-800 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm transition-all';
                }
                window.renderSmartDashboard();
            };

            window.toggleDashArchiveDrawer = function () {
                window.dashState.showArchivedDrawer = !window.dashState.showArchivedDrawer;
                const drawer = document.getElementById('sm-archived-batches-drawer');
                const arrow = document.getElementById('sm-archived-drawer-arrow');
                if (drawer) drawer.classList.toggle('hidden', !window.dashState.showArchivedDrawer);
                if (arrow) arrow.style.transform = window.dashState.showArchivedDrawer ? 'rotate(180deg)' : 'rotate(0deg)';
            };

            window.filterArchivedBatchCards = function (val) {
                const q = String(val || '').toLowerCase().trim();
                document.querySelectorAll('.sm-archived-batch-card').forEach(card => {
                    const name = (card.getAttribute('data-bname') || '').toLowerCase();
                    card.style.display = (!q || name.includes(q)) ? '' : 'none';
                });
            };
        }

        const currentCalcMode = window.dashState.calcMode || 'completed';
        ['completed', 'pending', 'all'].forEach(m => {
            const btn = document.getElementById('sm-cm-' + m);
            if (!btn) return;
            if (m === currentCalcMode) {
                const activeColor = m === 'completed' ? 'bg-emerald-600 text-white' : (m === 'pending' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-white');
                btn.className = `sm-cm-btn ${activeColor} px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm transition-all`;
            } else {
                btn.className = 'sm-cm-btn text-slate-600 hover:bg-white px-2.5 py-1 rounded-lg text-[10px] font-black transition-all';
            }
        });

        if (sourceSelect) {
            const currentVal = window.dashState.sourceFilter;
            const liveNamesArr = Array.from(batchNamesSet).filter(n => Boolean(liveBatchByName[n]));
            const archNamesArr = Array.from(batchNamesSet).filter(n => !liveBatchByName[n]);

            let groupedHtml = `
                <option value="all">📦 كل المبيعات (دفعات + فوري)</option>
                <option value="batches_only">🏷️ طلبات الدفعات فقط</option>
                <option value="normal_only">❄️ الطلبات الفورية فقط</option>
            `;
            if (liveNamesArr.length > 0) {
                groupedHtml += `<optgroup label="🟢 الدفعات النشطة الحالية (${liveNamesArr.length})">`;
                liveNamesArr.forEach(bName => {
                    const valKey = 'batch:' + bName;
                    groupedHtml += `<option value="${valKey}" ${currentVal === valKey ? 'selected' : ''}>🟢 دفعة: ${bName}</option>`;
                });
                groupedHtml += `</optgroup>`;
            }
            if (archNamesArr.length > 0) {
                groupedHtml += `<optgroup label="📂 أرشيف الدفعات السابقة (${archNamesArr.length})">`;
                archNamesArr.forEach(bName => {
                    const valKey = 'batch:' + bName;
                    groupedHtml += `<option value="${valKey}" ${currentVal === valKey ? 'selected' : ''}>📦 أرشيف: ${bName}</option>`;
                });
                groupedHtml += `</optgroup>`;
            }
            sourceSelect.innerHTML = groupedHtml;
            sourceSelect.value = currentVal;
        }

        // 6. الحسابات المالية الدقيقة (صافي المنتجات بدون التوصيل نهائياً)
        let completedCount = 0, activeCount = 0, canceledCount = 0;
        let completedRevenue = 0, activeExpectedRev = 0;
        let cashCompletedRev = 0, onlineCompletedRev = 0;
        let cashPendingRev = 0, onlinePendingRev = 0;

        let completedDirectDisc = 0, completedImplicitDisc = 0, completedDiscOrders = 0;
        let activeDirectDisc = 0, activeImplicitDisc = 0, activeDiscOrders = 0;
        let completedDebtTotal = 0, activeDebtTotal = 0;

        let compMeatUnits = 0, compChickUnits = 0, compEggUnits = 0, compMeatRev = 0;
        let pendMeatUnits = 0, pendChickUnits = 0, pendEggUnits = 0, pendMeatRev = 0;

        const itemsSoldMap = {};
        const zoneStatsMap = {};
        const driverStatsMap = {};

        finalPeriodOrders.forEach(o => {
            const stat = o.status || 'new';
            if (stat === 'canceled') {
                canceledCount++;
                const zName = o.zone || 'غير محدد';
                if (!zoneStatsMap[zName]) zoneStatsMap[zName] = { name: zName, count: 0, canceled: 0, revenue: 0 };
                zoneStatsMap[zName].canceled++;
                return;
            }

            const fin = window.getAccurateOrderFinancials(o);
            const isComp = (stat === 'completed');
            const zName = o.zone || 'غير محدد';
            const oDebt = Number(o.debt) || 0;

            if (!zoneStatsMap[zName]) zoneStatsMap[zName] = { name: zName, count: 0, canceled: 0, revenue: 0 };
            if (isComp || currentCalcMode !== 'completed') {
                zoneStatsMap[zName].count++;
                zoneStatsMap[zName].revenue += fin.total;
            }

            if (isComp) {
                completedCount++;
                completedRevenue += fin.total;
                if (oDebt > 0) completedDebtTotal += oDebt;

                if (o.paymentMethod === 'online') onlineCompletedRev += fin.total;
                else cashCompletedRev += fin.total;

                if (fin.discount > 0 || fin.implicitDiscount > 0) {
                    completedDirectDisc += fin.discount;
                    completedImplicitDisc += fin.implicitDiscount;
                    completedDiscOrders++;
                }

                if (o.driverName) {
                    if (!driverStatsMap[o.driverName]) driverStatsMap[o.driverName] = { name: o.driverName, completed: 0, revenue: 0 };
                    driverStatsMap[o.driverName].completed++;
                    driverStatsMap[o.driverName].revenue += fin.total;
                }
            } else {
                activeCount++;
                activeExpectedRev += fin.total;
                if (oDebt > 0) activeDebtTotal += oDebt;

                if (o.paymentMethod === 'online') onlinePendingRev += fin.total;
                else cashPendingRev += fin.total;

                if (fin.discount > 0 || fin.implicitDiscount > 0) {
                    activeDirectDisc += fin.discount;
                    activeImplicitDisc += fin.implicitDiscount;
                    activeDiscOrders++;
                }
            }

            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const q = Number(item.quantity) || 0;
                    const p = Number(item.price) || 0;
                    const cleanName = item.name || 'صنف';
                    const cls = window.classifyOrderItem(item);

                    if (isComp) {
                        if (cls.type === 'egg') compEggUnits += q;
                        else if (cls.type === 'chick') compChickUnits += q;
                        else { compMeatUnits += q; compMeatRev += (q * p); }
                    } else {
                        if (cls.type === 'egg') pendEggUnits += q;
                        else if (cls.type === 'chick') pendChickUnits += q;
                        else { pendMeatUnits += q; pendMeatRev += (q * p); }
                    }

                    if (!itemsSoldMap[cleanName]) {
                        itemsSoldMap[cleanName] = {
                            qty: 0, revenue: 0,
                            completedQty: 0, completedRev: 0,
                            pendingQty: 0, pendingRev: 0,
                            type: cls.type, unitLabel: cls.unitLabel
                        };
                    }
                    itemsSoldMap[cleanName].qty += q;
                    itemsSoldMap[cleanName].revenue += (q * p);
                    if (isComp) {
                        itemsSoldMap[cleanName].completedQty += q;
                        itemsSoldMap[cleanName].completedRev += (q * p);
                    } else {
                        itemsSoldMap[cleanName].pendingQty += q;
                        itemsSoldMap[cleanName].pendingRev += (q * p);
                    }
                });
            }
        });

        const isPendingMode = (currentCalcMode === 'pending');
        const isAllMode = (currentCalcMode === 'all');

        const shownOrdersCount = isPendingMode ? activeCount : (isAllMode ? (completedCount + activeCount) : completedCount);
        const shownTotalRev = isPendingMode ? activeExpectedRev : (isAllMode ? (completedRevenue + activeExpectedRev) : completedRevenue);
        const shownCashRev = isPendingMode ? cashPendingRev : (isAllMode ? (cashCompletedRev + cashPendingRev) : cashCompletedRev);
        const shownOnlineRev = isPendingMode ? onlinePendingRev : (isAllMode ? (onlineCompletedRev + onlinePendingRev) : onlineCompletedRev);
        const shownDirectDisc = isPendingMode ? activeDirectDisc : (isAllMode ? (completedDirectDisc + activeDirectDisc) : completedDirectDisc);
        const shownImplicitDisc = isPendingMode ? activeImplicitDisc : (isAllMode ? (completedImplicitDisc + activeImplicitDisc) : completedImplicitDisc);
        const shownDiscOrders = isPendingMode ? activeDiscOrders : (isAllMode ? (completedDiscOrders + activeDiscOrders) : completedDiscOrders);
        const shownDebtTotal = isPendingMode ? activeDebtTotal : (isAllMode ? (completedDebtTotal + activeDebtTotal) : completedDebtTotal);

        const shownMeatUnits = isPendingMode ? pendMeatUnits : (isAllMode ? (compMeatUnits + pendMeatUnits) : compMeatUnits);
        const shownChickUnits = isPendingMode ? pendChickUnits : (isAllMode ? (compChickUnits + pendChickUnits) : compChickUnits);
        const shownEggUnits = isPendingMode ? pendEggUnits : (isAllMode ? (compEggUnits + pendEggUnits) : compEggUnits);
        const shownMeatRev = isPendingMode ? pendMeatRev : (isAllMode ? (compMeatRev + pendMeatRev) : compMeatRev);

        const shownAllDiscounts = shownDirectDisc + shownImplicitDisc;
        const avgOrderVal = shownOrdersCount > 0 ? Math.round(shownTotalRev / shownOrdersCount) : 0;

        // صافي الربح الحقيقي = صافي مبيعات المنتجات ناقص (المصاريف + الديون عليا + الهالك) بدون تكرار
        const trueNetProfit = shownTotalRev - totalPeriodExpensesAndDebts - periodWasteCost;

        // 7. تحديث كبسولات الخزنة والديون الـ 5 العلوية (مع التغطية التلقائية بين الكاش والأونلاين)
        let streetCashNow = 0;
        activeFiscalOrdersList.forEach(o => {
            if (o && o.status === 'dispatched' && o.paymentMethod !== 'online') {
                streetCashNow += window.getAccurateOrderFinancials(o).total;
            }
        });
        const totalMarketDebtNow = custArr.reduce((s, c) => s + (Number(c.debt) || 0), 0);

        // إذا سُحب مصروف أكبر من الكاش المتاح في الفترة، يتم تغطية العجز تلقائياً من الأونلاين
        let rawNetCash = cashCompletedRev - periodExpensesCash;
        let rawNetOnline = onlineCompletedRev - periodExpensesOnline;
        if (rawNetCash < 0 && rawNetOnline > 0) {
            const coverFromOnline = Math.min(rawNetOnline, Math.abs(rawNetCash));
            rawNetCash += coverFromOnline;
            rawNetOnline -= coverFromOnline;
        }

        setElHtml('sm-safe-net-cash', `${rawNetCash.toLocaleString()} ج`);
        setElHtml('sm-safe-net-online', `${rawNetOnline.toLocaleString()} ج`);
        setElHtml('sm-safe-owner-debt', `${totalOwnerPayableDebtNow.toLocaleString()} ج`);
        setElHtml('sm-safe-street-cash', `${streetCashNow.toLocaleString()} ج`);
        setElHtml('sm-safe-market-debt', `${totalMarketDebtNow.toLocaleString()} ج`);

        // 8. تحديث الكروت المالية الـ 4 الصافية (بدون توصيل)
        const modeTitleLabel = isPendingMode ? '⏳ قيمة المنتجات المحجوزة' : (isAllMode ? '📊 إجمالي المنتجات الشامل' : '✅ صافي المبيعات المسلّمة');
        setElHtml('sm-lbl-card1-title', modeTitleLabel);
        setElHtml('sm-dash-total-revenue', `${shownTotalRev.toLocaleString()} <span class="text-xs font-bold text-slate-400">ج</span>`);
        setElHtml('sm-dash-products-revenue', `${shownTotalRev.toLocaleString()} ج`);
        setElHtml('sm-dash-payment-split', `<span>💵 كاش: ${shownCashRev.toLocaleString()} ج</span><span>💳 أونلاين: ${shownOnlineRev.toLocaleString()} ج</span>`);

        let unitsBadge = `🥩 ${Number(shownMeatUnits.toFixed(1))} طبق`;
        if (shownChickUnits > 0) unitsBadge += ` • 🐣 ${Number(shownChickUnits.toFixed(0))}`;
        if (shownEggUnits > 0) unitsBadge += ` • 🥚 ${Number(shownEggUnits.toFixed(0))}`;
        const avgMeatUnitPrice = shownMeatUnits > 0 ? Math.round(shownMeatRev / shownMeatUnits) : 0;

        setElHtml('sm-dash-avg-order', `<span>${unitsBadge} (${shownOrdersCount} طلب)</span><span>متوسط: ${avgOrderVal} ج</span>`);

        const profitMargin = shownTotalRev > 0 ? ((trueNetProfit / shownTotalRev) * 100).toFixed(1) : 0;
        const marginBadge = trueNetProfit >= 0
            ? `<span class="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 mr-1">${profitMargin}%</span>`
            : `<span class="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 mr-1">عجز</span>`;
        setElHtml('sm-dash-true-net-profit', `${trueNetProfit.toLocaleString()} <span class="text-xs font-bold">ج</span> ${marginBadge}`);
        setElHtml('sm-dash-expenses-summary', `<span>مصاريف/التزام: ${totalPeriodExpensesAndDebts.toLocaleString()} ج</span><span>هالك: ${periodWasteCost.toLocaleString()} ج</span>`);

        setElHtml('sm-dash-completed-count', `${activeExpectedRev.toLocaleString()} <span class="text-xs font-bold text-amber-800">ج (${activeCount} طلب)</span>`);
        setElHtml('sm-dash-pipeline-info', `<span class="text-emerald-700">✅ سُلّم: ${completedCount} (${completedRevenue.toLocaleString()} ج)</span><span class="text-slate-400">❌ ملغي: ${canceledCount}</span>`);

        setElHtml('sm-dash-discounts-total', `${shownAllDiscounts.toLocaleString()} <span class="text-xs font-bold text-red-400">ج (${shownDiscOrders} طلب)</span>`);
        setElHtml('sm-dash-discounts-breakdown', `<span>خصم: ${shownDirectDisc.toLocaleString()} ج</span><span>واجب: ${shownImplicitDisc.toLocaleString()} ج</span>`);
        setElHtml('sm-dash-debt-total', `آجل العملاء: ${shownDebtTotal.toLocaleString()} ج`);

        // 9. شريط متوسطات الدفعات المدمج
        const visibleBatchesList = Object.values(sourcesSummary).filter(s => s.isBatch && s.hasOrderInSelectedPeriod && s.totalValidCount > 0);
        const batchesCount = visibleBatchesList.length;
        const avgMeatUnitsPerBatch = batchesCount > 0 ? Math.round(visibleBatchesList.reduce((s, b) => s + b.completedMeatUnits, 0) / batchesCount) : 0;
        const avgRevPerBatch = batchesCount > 0 ? Math.round(visibleBatchesList.reduce((s, b) => s + b.collectedRevenue, 0) / batchesCount) : 0;
        const wasteRatio = (shownMeatUnits + periodWasteUnits) > 0 ? ((periodWasteUnits / (shownMeatUnits + periodWasteUnits)) * 100).toFixed(1) : '0.0';

        setElHtml('sm-dash-benchmarks-bar', `
            <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-center">
                <span class="text-[9px] font-bold text-slate-400 block">متوسط المسلّم بالدفعة</span>
                <span class="text-sm font-black text-slate-800">${avgMeatUnitsPerBatch} <span class="text-[10px] text-brand-primary">طبق</span></span>
            </div>
            <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-center">
                <span class="text-[9px] font-bold text-slate-400 block">متوسط صافي الدفعة</span>
                <span class="text-sm font-black text-emerald-700">${avgRevPerBatch.toLocaleString()} <span class="text-[10px]">ج</span></span>
            </div>
            <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-center">
                <span class="text-[9px] font-bold text-slate-400 block">متوسط سعر الطبق</span>
                <span class="text-sm font-black text-indigo-600">${avgMeatUnitPrice} <span class="text-[10px]">ج</span></span>
            </div>
            <div class="bg-rose-50/60 p-2.5 rounded-xl border border-rose-200/70 text-center">
                <span class="text-[9px] font-black text-rose-700 block">نسبة الهالك المسجل</span>
                <span class="text-sm font-black text-rose-600">${wasteRatio}% <span class="text-[10px]">(${periodWasteUnits})</span></span>
            </div>
        `);

        // 10. رسم كروت الدفعات النشطة + درج الأرشيف المطوي
        const batchesCont = document.getElementById('sm-dash-batches-breakdown');
        if (batchesCont) {
            const buildSingleBatchCardHtml = (src, isArchivedCard = false) => {
                const isSelected = window.dashState.sourceFilter === src.filterKey;
                const borderClass = isSelected
                    ? 'border-2 border-brand-primary bg-emerald-50/40 ring-2 ring-brand-primary/10'
                    : (isArchivedCard ? 'border border-slate-200 bg-white hover:border-teal-400' : 'border border-teal-500/30 bg-white hover:border-teal-500');

                let balanceHtml = '';
                let actionBtnHtml = '';
                const pendingMeatUnits = Math.max(0, Number((src.soldMeatUnits - src.completedMeatUnits).toFixed(1)));

                if (src.isBatch) {
                    const liveB = liveBatchByName[src.label] || (src.batchId && batchesObj[src.batchId] ? { id: src.batchId, ...batchesObj[src.batchId] } : null);
                    const archB = archBatchByName[src.label];
                    const bObj = liveB || archB || {};

                    let meatStockTotal = 0;
                    const sObj = bObj.stock || bObj.rawStock || {};
                    Object.keys(sObj).forEach(pId => {
                        const cls = window.classifyOrderItem({ id: pId, name: prodsObj[pId]?.name || '' });
                        if (cls.isMeat) meatStockTotal += (Number(sObj[pId]) || 0);
                    });

                    let meatSlaughteredTotal = 0;
                    const slObj = bObj.slaughtered || {};
                    Object.keys(slObj).forEach(pId => {
                        const cls = window.classifyOrderItem({ id: pId, name: prodsObj[pId]?.name || '' });
                        if (cls.isMeat) meatSlaughteredTotal += (Number(slObj[pId]) || 0);
                    });

                    const actualTarget = Number(bObj.actualPairs) || meatStockTotal || meatSlaughteredTotal || 0;
                    const loggedWaste = wasteByBatchName[src.label] || 0;
                    const batchExp = expensesByBatchName[src.label] || 0;
                    const autoDiff = (actualTarget > 0 && meatSlaughteredTotal > 0 && actualTarget > meatSlaughteredTotal) ? (actualTarget - meatSlaughteredTotal) : 0;
                    const totalShrinkage = loggedWaste + autoDiff;

                    balanceHtml = `
                    <div class="grid grid-cols-3 gap-1 text-center bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                        <div class="bg-emerald-50 border border-emerald-200/80 p-1 rounded-lg">
                            <span class="block text-[8px] font-black text-emerald-700">🟢 مسلّم صافي</span>
                            <span class="text-[11px] font-black text-emerald-800 block">${src.collectedRevenue.toLocaleString()} ج</span>
                            <span class="text-[8px] font-bold text-emerald-600">${src.completedCount} طلب (${Number(src.completedMeatUnits.toFixed(1))})</span>
                        </div>
                        <div class="bg-amber-50 border border-amber-200/80 p-1 rounded-lg">
                            <span class="block text-[8px] font-black text-amber-800">🟠 محجوز</span>
                            <span class="text-[11px] font-black text-amber-700 block">${src.pendingRevenue.toLocaleString()} ج</span>
                            <span class="text-[8px] font-bold text-amber-600">${src.activeCount} طلب (${pendingMeatUnits})</span>
                        </div>
                        <div class="bg-white border border-slate-200 p-1 rounded-lg">
                            <span class="block text-[8px] font-black text-slate-500">⚪ الإجمالي</span>
                            <span class="text-[11px] font-black text-slate-800 block">${src.totalBatchSales.toLocaleString()} ج</span>
                            <span class="text-[8px] font-bold text-slate-500">${src.totalValidCount} طلب (${Number(src.soldMeatUnits.toFixed(1))})</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 gap-1 text-center bg-slate-50/70 p-1 rounded-lg border border-slate-200/60 text-[9px] font-black">
                        <div><span class="text-slate-400 block text-[8px]">العدد</span><span class="text-slate-700">${actualTarget || '-'}</span></div>
                        <div><span class="text-slate-400 block text-[8px]">مذبوح</span><span class="text-indigo-600">${meatSlaughteredTotal || '-'}</span></div>
                        <div><span class="text-slate-400 block text-[8px]">مسلّم</span><span class="text-emerald-600">${Number(src.completedMeatUnits.toFixed(1))}</span></div>
                        <div><span class="text-rose-400 block text-[8px]">هالك</span><span class="text-rose-600">${totalShrinkage}</span></div>
                    </div>
                    ${batchExp > 0 ? `<div class="text-[9px] font-black text-teal-800 bg-teal-50 px-2 py-1 rounded flex justify-between"><span>تكلفة مسجلة: ${batchExp.toLocaleString()} ج</span><span>صافيها: ${(src.collectedRevenue - batchExp).toLocaleString()} ج</span></div>` : ''}
                    `;

                    if (liveB) {
                        const statusLabel = liveB.isOpen ? '🟢 مفتوحة' : '🟠 جاري التوزيع';
                        actionBtnHtml = `
                        <div class="flex justify-between items-center pt-1.5 border-t border-slate-100">
                            <span class="text-[9px] font-black ${liveB.isOpen ? 'text-emerald-600' : 'text-amber-600'}">${statusLabel}</span>
                            <div class="flex gap-1">
                                <button onclick="event.stopPropagation(); openLedgerEntryBox('waste', '${src.label}')" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 px-2 py-0.5 rounded text-[9px] font-black">+ هالك</button>
                                <button onclick="event.stopPropagation(); archiveBatch('${liveB.id}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded text-[9px] font-black">أرشفة</button>
                            </div>
                        </div>`;
                    } else if (archB) {
                        actionBtnHtml = `
                        <div class="flex justify-between items-center pt-1.5 border-t border-slate-100">
                            <span class="text-[9px] font-black text-slate-400">📦 مؤرشفة</span>
                            <button onclick="event.stopPropagation(); openArchiveReport('${archB.id}')" class="bg-slate-800 text-white px-2 py-0.5 rounded text-[9px] font-black">التقرير</button>
                        </div>`;
                    }
                } else {
                    balanceHtml = `
                    <div class="grid grid-cols-2 gap-1 text-center bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                        <div class="bg-emerald-50 p-1 rounded-lg">
                            <span class="block text-[8px] font-black text-emerald-700">🟢 مسلّم</span>
                            <span class="text-[11px] font-black text-emerald-800 block">${src.collectedRevenue.toLocaleString()} ج (${src.completedCount})</span>
                        </div>
                        <div class="bg-amber-50 p-1 rounded-lg">
                            <span class="block text-[8px] font-black text-amber-800">🟠 محجوز</span>
                            <span class="text-[11px] font-black text-amber-700 block">${src.pendingRevenue.toLocaleString()} ج (${src.activeCount})</span>
                        </div>
                    </div>`;
                }

                return `
                <div data-bname="${src.label}" onclick="updateDashState('sourceFilter', '${src.filterKey}')" class="${isArchivedCard ? 'sm-archived-batch-card' : ''} p-3.5 rounded-2xl ${borderClass} cursor-pointer transition-all shadow-sm flex flex-col justify-between gap-2">
                    <div class="flex justify-between items-center">
                        <span class="font-black text-slate-800 text-xs flex items-center gap-1">
                            <i class="fa-solid ${src.isBatch ? 'fa-layer-group text-teal-600' : 'fa-bolt text-amber-500'} text-[10px]"></i>
                            ${src.label}
                        </span>
                        <span class="text-xs font-black text-emerald-700">${src.collectedRevenue.toLocaleString()} ج</span>
                    </div>
                    ${balanceHtml}
                    ${actionBtnHtml}
                </div>`;
            };

            const allSourcesList = Object.values(sourcesSummary);
            const activeLiveSources = allSourcesList.filter(src => {
                const isLiveBatch = src.isBatch && Boolean(liveBatchByName[src.label]);
                const isNormalImmediate = !src.isBatch && src.hasOrderInSelectedPeriod;
                const isCurrentlySelected = window.dashState.sourceFilter === src.filterKey;
                return isLiveBatch || isNormalImmediate || isCurrentlySelected;
            }).sort((a, b) => b.collectedRevenue - a.collectedRevenue);

            const archivedOldSources = allSourcesList.filter(src => {
                const isLiveBatch = src.isBatch && Boolean(liveBatchByName[src.label]);
                const isCurrentlySelected = window.dashState.sourceFilter === src.filterKey;
                return src.isBatch && !isLiveBatch && !isCurrentlySelected;
            }).sort((a, b) => b.totalBatchSales - a.totalBatchSales);

            let finalBatchesSectionHtml = '';

            if (activeLiveSources.length === 0) {
                finalBatchesSectionHtml += `<div class="col-span-full text-center py-4 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">لا توجد دفعات نشطة حالياً في هذه الدورة.</div>`;
            } else {
                finalBatchesSectionHtml += activeLiveSources.map(src => buildSingleBatchCardHtml(src, false)).join('');
            }

            if (archivedOldSources.length > 0) {
                const totalArchivedRev = archivedOldSources.reduce((sum, s) => sum + s.collectedRevenue, 0);
                const isDrawerOpen = window.dashState.showArchivedDrawer === true;

                finalBatchesSectionHtml += `
                <div class="col-span-full mt-1 pt-2 border-t border-slate-100">
                    <button type="button" onclick="toggleDashArchiveDrawer()" class="w-full bg-slate-900 hover:bg-slate-800 text-white p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all">
                        <span class="text-[11px] font-black"><i class="fa-solid fa-box-archive text-amber-300 ml-1"></i> أرشيف الدفعات السابقة (${archivedOldSources.length} دفعة — إجمالي صافيها: ${totalArchivedRev.toLocaleString()} ج)</span>
                        <i id="sm-archived-drawer-arrow" class="fa-solid fa-chevron-down text-amber-300 text-xs transition-transform duration-200" style="transform: ${isDrawerOpen ? 'rotate(180deg)' : 'rotate(0deg)'};"></i>
                    </button>
                    <div id="sm-archived-batches-drawer" class="${isDrawerOpen ? '' : 'hidden'} mt-2 bg-slate-100/80 p-3 rounded-xl border border-slate-200 space-y-2.5">
                        <input type="search" oninput="filterArchivedBatchCards(this.value)" placeholder="🔍 ابحث باسم الدفعة في الأرشيف..." class="w-full sm:w-64 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold outline-none">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto custom-scroll pr-1">
                            ${archivedOldSources.map(src => buildSingleBatchCardHtml(src, true)).join('')}
                        </div>
                    </div>
                </div>`;
            }

            batchesCont.innerHTML = finalBatchesSectionHtml;
        }

        // 11. رسم جرد الأصناف المباعة (مصغر ونظيف)
        const itemsGrid = document.getElementById('sm-dash-items-grid');
        if (itemsGrid) {
            const getItemModeQty = (info) => isPendingMode ? info.pendingQty : (isAllMode ? info.qty : info.completedQty);
            const getItemModeRev = (info) => isPendingMode ? info.pendingRev : (isAllMode ? info.revenue : info.completedRev);

            const sortedItems = Object.keys(itemsSoldMap)
                .filter(k => getItemModeQty(itemsSoldMap[k]) > 0 || itemsSoldMap[k].qty > 0)
                .sort((a, b) => getItemModeRev(itemsSoldMap[b]) - getItemModeRev(itemsSoldMap[a]));

            if (sortedItems.length === 0) {
                itemsGrid.innerHTML = `<div class="col-span-full text-center py-4 text-slate-400 text-xs font-bold">لا توجد أصناف مسجلة في هذا الوضع.</div>`;
            } else {
                itemsGrid.innerHTML = sortedItems.map(itemName => {
                    const info = itemsSoldMap[itemName];
                    const shownQ = getItemModeQty(info);
                    const shownR = getItemModeRev(info);
                    const avgP = shownQ > 0 ? Math.round(shownR / shownQ) : 0;

                    return `
                    <div class="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl text-center shadow-sm flex flex-col justify-between">
                        <span class="text-[10px] font-black text-slate-700 truncate" title="${itemName}">${itemName}</span>
                        <div class="my-1">
                            <span class="text-xl font-black text-brand-primary">${Number(shownQ.toFixed(2))}</span>
                            <span class="text-[9px] font-bold text-slate-400 block">${info.unitLabel} ${avgP > 0 ? `(${avgP}ج)` : ''}</span>
                        </div>
                        <span class="bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[10px] font-black mb-1">
                            ${Math.round(shownR).toLocaleString()} ج
                        </span>
                        <div class="text-[8px] font-black text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200/50 flex justify-between">
                            <span class="text-emerald-700">✅ ${Number(info.completedQty.toFixed(1))}</span>
                            <span class="text-amber-600">⏳ ${Number(info.pendingQty.toFixed(1))}</span>
                        </div>
                    </div>`;
                }).join('');
            }
        }

        // 12. رسم جدول سجل الطلبات التفصيلي (8 أعمدة صافية بدون عمود التوصيل)
        const tbody = document.getElementById('sm-dash-orders-tbody');
        if (tbody) {
            const subFilter = window.dashState.tableSubFilter;
            const q = (window.dashState.tableSearch || '').toLowerCase().trim();

            const tableOrders = finalPeriodOrders.filter(o => {
                if (subFilter === 'all_valid' && o.status === 'canceled') return false;
                if (subFilter === 'completed' && o.status !== 'completed') return false;
                if (subFilter === 'all_active' && !['new', 'processing', 'dispatched', 'deferred', 'no_answer'].includes(o.status)) return false;
                if (subFilter === 'canceled' && o.status !== 'canceled') return false;
                if (subFilter === 'discounted') {
                    const fin = window.getAccurateOrderFinancials(o);
                    if ((fin.discount + fin.implicitDiscount) <= 0 || o.status === 'canceled') return false;
                }
                if (subFilter === 'debt' && (!o.debt || Number(o.debt) <= 0)) return false;

                if (q) {
                    const itemsTxt = (o.items && Array.isArray(o.items)) ? o.items.map(i => i.name).join(' ') : '';
                    const hay = `${o.customerName || ''} ${o.customerPhone || ''} ${o.zone || ''} ${window.resolveOrderBatchName(o)} ${itemsTxt} ${o.adminNote || ''}`.toLowerCase();
                    return hay.includes(q);
                }
                return true;
            });

            if (tableOrders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 font-bold">لا توجد طلبات مطابقة لهذا الفلتر.</td></tr>`;
            } else {
                tbody.innerHTML = tableOrders.map(o => {
                    const fin = window.getAccurateOrderFinancials(o);
                    const itemsBadges = (o.items && Array.isArray(o.items))
                        ? o.items.map(i => `<span class="bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-bold inline-block m-0.5">${i.quantity}x ${i.name} (${i.price}ج)</span>`).join('')
                        : '-';

                    const totalD = fin.discount + fin.implicitDiscount;
                    let discBadge = '<span class="text-slate-300">-</span>';
                    if (totalD > 0) {
                        discBadge = `<span class="bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-black text-[10px]">-${totalD} ج</span>`;
                    }

                    const resolvedBName = window.resolveOrderBatchName(o);
                    const batchLabel = resolvedBName
                        ? `<span class="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded text-[9px] font-black block mb-0.5">${resolvedBName}</span>`
                        : `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold block mb-0.5">فوري</span>`;

                    const statusBadge = o.status === 'completed'
                        ? `<span class="text-[8px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-black">✅ مكتمل</span>`
                        : (o.status === 'canceled' ? `<span class="text-[8px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-black">❌ ملغي</span>` : `<span class="text-[8px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black">⏳ محجوز</span>`);

                    const dObj = parseOrderDateObj(o, window.dashState.dateBasis);
                    const dateFormatted = dObj ? dObj.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) : (o.orderDate || '-');

                    const payBadge = o.paymentMethod === 'online'
                        ? `<span class="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded font-black block">أونلاين</span>`
                        : `<span class="text-[8px] bg-slate-100 text-slate-500 px-1 rounded font-bold block">كاش</span>`;

                    return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                        <td class="py-2.5 px-3">
                            <div onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 cursor-pointer hover:text-brand-primary">${o.customerName || 'بدون اسم'}</div>
                            <div class="text-[9px] text-slate-400 font-bold" dir="ltr">${o.customerPhone || ''} • ${o.zone || ''}</div>
                        </td>
                        <td class="py-2.5 px-3 text-center">${batchLabel}${statusBadge}</td>
                        <td class="py-2.5 px-3 text-center whitespace-normal min-w-[180px]">${itemsBadges}</td>
                        <td class="py-2.5 px-3 text-center font-bold text-slate-700">${fin.subtotal} ج</td>
                        <td class="py-2.5 px-3 text-center">${discBadge}</td>
                        <td class="py-2.5 px-3 text-center">
                            <span class="font-black text-brand-primary text-xs">${fin.total} ج</span>
                            ${payBadge}
                        </td>
                        <td class="py-2.5 px-3 text-center text-[10px] font-bold text-slate-500">${dateFormatted}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button onclick="openEditOrderModal('${o.id}')" class="bg-slate-800 hover:bg-slate-900 text-white px-2 py-1 rounded text-[9px] font-black">فتح</button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }

        // 13-أ. رسم جدول (الديون اللي عليا - Payable Debts) وأصحابها وزر سدادها بدون تكرار
        const debtsTbody = document.getElementById('sm-payable-debts-tbody');
        setElHtml('sm-payable-debts-total-badge', `إجمالي المتبقي عليا: ${totalOwnerPayableDebtNow.toLocaleString()} ج`);

        if (debtsTbody) {
            const allPayableDebts = activeFiscalLedgerArr
                .filter(r => r && r.type === 'payable_debt')
                .sort((a, b) => (b.remainingDebt || 0) - (a.remainingDebt || 0));

            if (allPayableDebts.length === 0) {
                debtsTbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 font-bold">الحمد لله.. لا توجد أي ديون مسجلة عليك حالياً.</td></tr>`;
            } else {
                debtsTbody.innerHTML = allPayableDebts.map(r => {
                    const origAmt = Number(r.amount) || 0;
                    const paidAmt = (Number(r.paidCash) || 0) + (Number(r.paidOnline) || 0);
                    const remAmt = Number(r.remainingDebt !== undefined ? r.remainingDebt : (origAmt - paidAmt)) || 0;
                    const dStr = r.createdAtMs ? new Date(r.createdAtMs).toLocaleDateString('ar-EG') : (r.dateStr || '-');

                    return `
                    <tr class="hover:bg-purple-50/30 transition-colors ${remAmt === 0 ? 'opacity-60 bg-slate-50' : ''}">
                        <td class="py-2.5 px-3 font-black text-purple-950">
                            👤 ${r.creditorName || 'دائن / مورد'}
                            ${remAmt === 0 ? '<span class="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded mr-1">خالص ✅</span>' : ''}
                        </td>
                        <td class="py-2.5 px-3 font-bold text-slate-600">${r.category || '-'}${r.batchName ? ' • <span class="text-teal-700">' + r.batchName + '</span>' : ''}</td>
                        <td class="py-2.5 px-3 text-center font-black text-slate-700">${origAmt.toLocaleString()} ج</td>
                        <td class="py-2.5 px-3 text-center font-black text-emerald-600">${paidAmt.toLocaleString()} ج</td>
                        <td class="py-2.5 px-3 text-center">
                            <span class="px-2 py-0.5 rounded-lg font-black ${remAmt > 0 ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'text-slate-400'}">${remAmt.toLocaleString()} ج</span>
                        </td>
                        <td class="py-2.5 px-3 text-center text-[10px] font-bold text-slate-400">${dStr}</td>
                        <td class="py-2.5 px-3 text-center space-x-1 space-x-reverse">
                            ${remAmt > 0 ? `<button onclick="settleOwnerDebtRecord('${r.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm">💵 سداد</button>` : ''}
                            <button onclick="deleteLedgerRecord('${r.id}')" class="text-red-500 hover:bg-red-50 px-1.5 py-1 rounded text-[10px] font-black"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }

        // 13-ب. رسم جدول سجل المصروفات والهالك
        const ledgerTbody = document.getElementById('sm-ledger-records-tbody');
        if (ledgerTbody) {
            const sortedRecs = periodLedgerRecords
                .filter(r => r && r.type !== 'payable_debt')
                .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

            if (sortedRecs.length === 0) {
                ledgerTbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 font-bold">لا توجد مصروفات أو سجلات هالك مسجلة في هذه الفترة.</td></tr>`;
            } else {
                ledgerTbody.innerHTML = sortedRecs.map(r => {
                    const isWaste = r.type === 'waste';
                    const typeBadge = isWaste
                        ? `<span class="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-lg font-black">⚠️ ${r.category || 'هالك'}</span>`
                        : `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg font-black">💸 ${r.category || 'مصروف'}</span>`;

                    let sourceText = '';
                    if (isWaste) {
                        sourceText = `${r.qty || 0} × ${r.productName || 'سمان'}`;
                    } else if (r.cashPaid !== undefined || r.onlinePaid !== undefined) {
                        const cP = Number(r.cashPaid) || 0;
                        const oP = Number(r.onlinePaid) || 0;
                        if (cP > 0 && oP > 0) sourceText = `💵 ${cP}ج كاش + 💳 ${oP}ج أونلاين`;
                        else if (oP > 0) sourceText = `💳 محفظة الأونلاين (${oP}ج)`;
                        else sourceText = `💵 خزنة الكاش (${cP}ج)`;
                    } else {
                        sourceText = r.paymentSource === 'online' ? '💳 محفظة الأونلاين' : '💵 خزنة الكاش';
                    }

                    const dStr = r.createdAtMs ? new Date(r.createdAtMs).toLocaleDateString('ar-EG') : (r.dateStr || '-');

                    return `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-2.5 px-3">${typeBadge}</td>
                        <td class="py-2.5 px-3 text-center font-bold text-teal-700">${r.batchName || 'عام'}</td>
                        <td class="py-2.5 px-3 text-center font-black text-slate-700">${sourceText}</td>
                        <td class="py-2.5 px-3 text-center font-black ${isWaste ? 'text-rose-600' : 'text-amber-700'}">${(Number(r.amount) || 0).toLocaleString()} ج</td>
                        <td class="py-2.5 px-3 font-bold text-slate-500">${r.notes || '-'}</td>
                        <td class="py-2.5 px-3 text-center text-slate-400 font-bold">${dStr}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button onclick="deleteLedgerRecord('${r.id}')" class="text-red-500 hover:bg-red-50 px-1.5 py-1 rounded font-black"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }

        // 13-ج. رسم كروت أرشيف الجرد السنوي المحفوظة (مثل: جرد سنة 2026)
        const annualCont = document.getElementById('sm-annual-archives-list');
        if (annualCont) {
            const archivesList = Object.values(accCfg.annualArchives || {}).sort((a, b) => (b.closedAtMs || 0) - (a.closedAtMs || 0));
            if (archivesList.length === 0) {
                annualCont.innerHTML = `<div class="col-span-full text-center py-3 text-slate-400 text-xs font-bold bg-white/5 rounded-xl border border-white/10">لا يوجد أرشيف جرد سنوي محفوظ حتى الآن. عند الضغط على (عمل جرد سنوي وتصفير السيستم) سيُحفظ الجرد هنا باسم السنة.</div>`;
            } else {
                annualCont.innerHTML = archivesList.map(arch => `
                    <div class="bg-white/10 border border-white/15 p-3.5 rounded-xl flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <h5 class="font-black text-xs text-amber-300">📁 ${arch.title || 'جرد سنوي'}</h5>
                                <span class="text-[9px] text-slate-300 font-bold">تاريخ الإغلاق: ${arch.closedDateStr || '-'}</span>
                            </div>
                            <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded text-[10px] font-black">الصافي: ${(Number(arch.finalTotalProfit) || 0).toLocaleString()} ج</span>
                        </div>
                        <div class="grid grid-cols-2 gap-1.5 text-[10px] font-bold bg-slate-900/60 p-2 rounded-lg">
                            <span class="text-emerald-300">إجمالي الداخل: ${(Number(arch.totalSalesIn) || 0).toLocaleString()} ج</span>
                            <span class="text-rose-300">إجمالي الخارج: ${(Number(arch.totalExpensesOut) || 0).toLocaleString()} ج</span>
                            <span class="text-slate-300">كاش صافي: ${(Number(arch.finalNetCash) || 0).toLocaleString()} ج</span>
                            <span class="text-slate-300">أونلاين صافي: ${(Number(arch.finalNetOnline) || 0).toLocaleString()} ج</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 14. رسم رادار استرجاع العملاء الغائبين
        const vipCont = document.getElementById('sm-vip-churn-list');
        if (vipCont) {
            const lastOrderMsByPhone = {};
            ordersList.forEach(o => {
                if (!o || o.status === 'canceled' || o.status === 'trash') return;
                const p = typeof window.normalizePhone === 'function' ? window.normalizePhone(o.customerPhone) : o.customerPhone;
                if (!p) return;
                const ms = o.createdAt && typeof o.createdAt.toMillis === 'function' ? o.createdAt.toMillis() : 0;
                if (ms > (lastOrderMsByPhone[p] || 0)) lastOrderMsByPhone[p] = ms;
            });

            const nowMs = Date.now();
            const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

            const absentVips = custArr.filter(c => {
                if (!c || c.isBlacklisted) return false;
                const isVip = (Number(c.ordersCount) >= 2 || Number(c.totalSpent) >= 600 || c.trustRating === 'vip');
                if (!isVip) return false;
                const p = typeof window.normalizePhone === 'function' ? window.normalizePhone(c.phone) : c.phone;
                const lastMs = lastOrderMsByPhone[p] || (c.lastOrder && typeof c.lastOrder.toMillis === 'function' ? c.lastOrder.toMillis() : 0);
                if (!lastMs) return true;
                return (nowMs - lastMs) >= fourteenDaysMs;
            }).sort((a, b) => (Number(b.totalSpent) || 0) - (Number(a.totalSpent) || 0)).slice(0, 30);

            if (absentVips.length === 0) {
                vipCont.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs font-bold">ممتاز! كل عملائك المميزين (VIP) نشطون.</div>`;
            } else {
                vipCont.innerHTML = absentVips.map(c => {
                    const p = typeof window.normalizePhone === 'function' ? window.normalizePhone(c.phone) : c.phone;
                    const lastMs = lastOrderMsByPhone[p] || 0;
                    const daysAgo = lastMs > 0 ? Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24)) : 'قديم';
                    const waPhone = (c.phone || '').startsWith('0') ? '2' + c.phone : c.phone;
                    const waMsg = encodeURIComponent(`أهلاً بحضرتك يا ${c.name || 'فندم'} في سمان ههيا 🌹\nوحشتنا طلباتك! بنفكرك إن دفعة السمان الفريش الجديدة جاهزة، تحب نحجز لحضرتك نصيبك فيها؟`);

                    return `
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/70 flex justify-between items-center gap-2">
                        <div>
                            <div onclick="openCustomerCard('${c.phone}')" class="font-black text-slate-800 text-xs cursor-pointer hover:text-brand-primary">${c.name || 'عميل مميز'} <span class="text-amber-600">(${c.ordersCount || 0} طلب)</span></div>
                            <div class="text-[10px] font-bold text-slate-400">${c.zone || ''} • غائب منذ: <strong class="text-rose-600">${typeof daysAgo === 'number' ? daysAgo + ' يوم' : daysAgo}</strong></div>
                        </div>
                        <a href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" class="bg-[#25D366] hover:bg-green-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0">
                            <i class="fa-brands fa-whatsapp"></i> استرجاع
                        </a>
                    </div>`;
                }).join('');
            }
        }

        // 15. رسم تحليل المناطق والمناديب
        const zonesCont = document.getElementById('sm-zones-profit-list');
        if (zonesCont) {
            const sortedZones = Object.values(zoneStatsMap).filter(z => z.count > 0 || z.canceled > 0).sort((a, b) => b.revenue - a.revenue);
            const sortedDrivers = Object.values(driverStatsMap).sort((a, b) => b.revenue - a.revenue);

            let zh = '';
            if (sortedDrivers.length > 0) {
                zh += `<div class="text-[11px] font-black text-indigo-700 mb-1">🛵 تسليمات المناديب (صافي المنتجات):</div>`;
                zh += sortedDrivers.map(d => `
                    <div class="bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100 flex justify-between items-center text-xs font-black">
                        <span class="text-indigo-950">${d.name}</span>
                        <span class="text-emerald-700">${d.completed} طلب (${d.revenue.toLocaleString()} ج)</span>
                    </div>
                `).join('');
                zh += `<div class="my-2 border-t border-slate-100"></div>`;
            }

            zh += `<div class="text-[11px] font-black text-slate-700 mb-1">📍 ترتيب المناطق (صافي المنتجات):</div>`;
            if (sortedZones.length === 0) {
                zh += `<div class="text-center py-6 text-slate-400 text-xs font-bold">لا توجد بيانات مناطق في هذه الفترة.</div>`;
            } else {
                zh += sortedZones.map(z => `
                    <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 flex justify-between items-center text-xs">
                        <div>
                            <span class="font-black text-slate-800">${z.name}</span>
                            <span class="text-[10px] font-bold text-slate-400 mr-1">(${z.count} طلب)</span>
                        </div>
                        <span class="font-black text-brand-primary">${z.revenue.toLocaleString()} ج</span>
                    </div>
                `).join('');
            }
            zonesCont.innerHTML = zh;
        }
    };

    // طباعة التقرير المالي الشامل للفترة (بدون عمود التوصيل)
    window.printSmartDashboardReport = function () {
        const periodTitle = document.getElementById('dash-active-period-badge')?.innerText || 'تقرير المبيعات';
        const totalRev = document.getElementById('sm-dash-total-revenue')?.innerText || '0';
        const netProfit = document.getElementById('sm-dash-true-net-profit')?.innerText || '0';
        const discTotal = document.getElementById('sm-dash-discounts-total')?.innerText || '0';
        const ownerDebt = document.getElementById('sm-safe-owner-debt')?.innerText || '0';
        const tableHtml = document.getElementById('sm-dash-orders-tbody')?.innerHTML || '';

        const win = window.open('', '_blank', 'width=950,height=820');
        if (!win) return alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير!');

        win.document.write(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تقرير سمان ههيا - ${periodTitle}</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; padding: 25px; color: #0f172a; }
                    h2 { text-align: center; margin-bottom: 5px; }
                    p.sub { text-align: center; color: #64748b; font-size: 13px; margin-top: 0; margin-bottom: 20px; }
                    .summary { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                    .box { flex: 1; min-width: 140px; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 10px; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; }
                    th { background: #f1f5f9; font-weight: 900; }
                    button { display: none !important; }
                </style>
            </head>
            <body>
                <h2>سمان ههيا — التقرير المحاسبي الصافي (بدون توصيل)</h2>
                <p class="sub">الفترة: ${periodTitle} | تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>
                <div class="summary">
                    <div class="box"><strong>صافي المبيعات</strong><br>${totalRev}</div>
                    <div class="box"><strong>صافي الربح الفعلي</strong><br>${netProfit}</div>
                    <div class="box"><strong>الخصومات والواجب</strong><br>${discTotal}</div>
                    <div class="box"><strong>الديون عليا الحالية</strong><br>${ownerDebt}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>العميل والمنطقة</th>
                            <th>الدفعة</th>
                            <th>الأصناف</th>
                            <th>قيمة المنتجات</th>
                            <th>الخصم</th>
                            <th>صافي المنتجات</th>
                            <th>التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>${tableHtml}</tbody>
                </table>
                <script>window.onload = function(){ window.print(); }<\/script>
            </body>
            </html>
        `);
        win.document.close();
    };


    // =========================================================================
    // 🔌 سابعاً: حماية الطلبات من الأرشفة التلقائية + استعادة أي طلب منفرد + الفريزر
    // =========================================================================

    // 1. دالة استعادة طلب واحد من الأرشيف وإرجاعه لشاشة الطلبات الحية (قسم مكتمل) وخصمه من الدفعة المؤرشفة
    window.restoreSingleOrderFromArchive = async function (orderId, arId = '', clearBatchInfo = true) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const o = ordersList.find(x => x.id === orderId);
        if (!o) return alert('لم يتم العثور على هذا الطلب!');

        const archList = Array.isArray(window.archivedBatchesData)
            ? window.archivedBatchesData
            : (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData) ? archivedBatchesData : []);

        // البحث عن الدفعة المؤرشفة التي دخل فيها الطلب
        const a = archList.find(x => x && (x.id === arId || (o.batchId && x.originalBatchId === o.batchId) || (o.batchName && x.batchName === o.batchName)));

        const confirmMsg = clearBatchInfo
            ? `↩️ هل تريد استعادة طلب العميل (${o.customerName}) إلى شاشة الطلبات الحية (قسم مكتمل) كطلب فوري بدون دفعة، وإلغاء أرشفته؟`
            : `↩️ هل تريد استعادة طلب العميل (${o.customerName}) إلى شاشة الطلبات الحية (قسم مكتمل)؟`;
        if (!confirm(confirmMsg)) return;

        try {
            const orderUpdate = {
                isArchived: firebase.firestore.FieldValue.delete()
            };
            if (clearBatchInfo) {
                orderUpdate.batchId = '';
                orderUpdate.batchName = '';
            }

            if (typeof db !== 'undefined') {
                await db.collection('orders').doc(orderId).update(orderUpdate);
            }

            // خصم حساب الطلب من تقرير الدفعة المؤرشفة إذا كان محسوباً فيها
            if (a && o.status === 'completed') {
                const oRev = Number(o.total) || 0;
                const oDel = Number(o.deliveryFee) || 0;
                const oDisc = Number(o.discount) || 0;

                a.totalRevenue = Math.max(0, (Number(a.totalRevenue) || 0) - oRev);
                a.totalDelivery = Math.max(0, (Number(a.totalDelivery) || 0) - oDel);
                a.totalDiscount = Math.max(0, (Number(a.totalDiscount) || 0) - oDisc);
                a.ordersCount = Math.max(0, (Number(a.ordersCount) || 0) - 1);

                if (o.zone && a.zonesSummary && a.zonesSummary[o.zone]) {
                    a.zonesSummary[o.zone] = Math.max(0, a.zonesSummary[o.zone] - 1);
                    if (a.zonesSummary[o.zone] === 0) delete a.zonesSummary[o.zone];
                }
                if (o.items && Array.isArray(o.items) && a.itemsSummary) {
                    o.items.forEach(i => {
                        if (a.itemsSummary[i.name] !== undefined) {
                            a.itemsSummary[i.name] = Math.max(0, a.itemsSummary[i.name] - (Number(i.quantity) || 0));
                            if (a.itemsSummary[i.name] === 0) delete a.itemsSummary[i.name];
                        }
                    });
                }

                if (typeof db !== 'undefined') {
                    await db.collection('inventory').doc('archived_batches').set({ [a.id]: a }, { merge: true }).catch(() => {});
                    await db.collection('archived_batches').doc(a.id).set(a, { merge: true }).catch(() => {});
                }
            }

            // تحديث الذاكرة الحية فوراً ليظهر الطلب في قسم (مكتمل)
            o.isArchived = false;
            if (clearBatchInfo) {
                o.batchId = '';
                o.batchName = '';
            }
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId].isArchived = false;
                if (clearBatchInfo) {
                    globalOrdersMap[orderId].batchId = '';
                    globalOrdersMap[orderId].batchName = '';
                }
            }

            const reportModal = document.getElementById('archive-report-modal');
            if (arId && reportModal && !reportModal.classList.contains('hidden')) {
                window.openArchiveReport(arId);
            }
            if (typeof window.renderArchiveUI === 'function') window.renderArchiveUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            window.renderSmartDashboard();

            window.showToast('✅ تمت استعادة الطلب إلى شاشة (الطلبات الحية -> مكتمل) بنجاح!');
        } catch (e) {
            console.error('Restore single order error:', e);
            alert('حدث خطأ أثناء استعادة الطلب: ' + (e.message || e));
        }
    };

    // 2. ترقية نافذة تقرير الدفعة المؤرشفة لعرض كل الطلبات بداخلها + زر استعادة لأي طلب منفرد
    function installEnhancedArchiveReportModal() {
        window.openArchiveReport = function (arId) {
            const archList = Array.isArray(window.archivedBatchesData)
                ? window.archivedBatchesData
                : (typeof archivedBatchesData !== 'undefined' && Array.isArray(archivedBatchesData) ? archivedBatchesData : []);

            const a = archList.find(x => x && x.id === arId);
            if (!a) return alert('لم يتم العثور على بيانات هذا الأرشيف!');

            const titleEl = document.getElementById('ar-title');
            if (titleEl) titleEl.innerText = a.batchName || 'دفعة مؤرشفة';

            const itemsHtml = Object.keys(a.itemsSummary || {}).sort((k1, k2) => a.itemsSummary[k2] - a.itemsSummary[k1]).map(k => {
                if ((a.itemsSummary[k] || 0) <= 0) return '';
                return `<div class="bg-slate-50 border border-slate-100 p-3 rounded-xl text-center shadow-sm"><span class="block text-[10px] font-bold text-slate-500 mb-1 truncate">${k}</span><span class="text-lg font-black text-brand-primary">${a.itemsSummary[k]}</span></div>`;
            }).join('');

            const zonesHtml = Object.keys(a.zonesSummary || {}).sort((k1, k2) => a.zonesSummary[k2] - a.zonesSummary[k1]).map(k => {
                if ((a.zonesSummary[k] || 0) <= 0) return '';
                return `<span class="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-black border border-indigo-100 shadow-sm">${k} <span class="bg-white text-indigo-500 px-1.5 py-0.5 rounded ml-1">${a.zonesSummary[k]}</span></span>`;
            }).join(' ');

            const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
            const batchArchivedOrders = ordersList.filter(o => {
                if (!o || !o.isArchived) return false;
                const matchById = (a.originalBatchId && o.batchId === a.originalBatchId) || (o.batchId === a.id);
                const matchByName = (a.batchName && window.resolveOrderBatchName(o) === a.batchName.trim());
                const matchOrphan = (!o.batchId || o.batchId === '') && (!o.batchName || o.batchName === '' || o.batchName === 'undefined');
                return matchById || matchByName || matchOrphan;
            });

            const ordersRowsHtml = batchArchivedOrders.map(o => {
                const fin = window.getAccurateOrderFinancials(o);
                const itemsBadges = (o.items && Array.isArray(o.items))
                    ? o.items.map(i => `<span class="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">${i.quantity}x ${i.name}</span>`).join(' ')
                    : '-';
                const isOrphan = (!o.batchId || o.batchId === '');

                return `
                <div class="bg-slate-50 p-3.5 rounded-xl border ${isOrphan ? 'border-2 border-amber-400 bg-amber-50/50' : 'border-slate-200'} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-black text-slate-800 text-xs">${o.customerName || 'عميل'}</span>
                            <span class="text-[10px] font-bold text-slate-400" dir="ltr">${o.customerPhone || ''}</span>
                            <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-black">صافي: ${fin.total} ج</span>
                            ${isOrphan ? '<span class="bg-amber-300 text-slate-950 px-2 py-0.5 rounded text-[9px] font-black">⚠️ دخل الأرشيف بدون دفعة</span>' : ''}
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 mt-1">${o.zone || ''} ${o.customerAddress ? ' - ' + o.customerAddress : ''} • ${o.orderDate || ''}</div>
                        <div class="flex flex-wrap gap-1 mt-1.5">${itemsBadges}</div>
                    </div>
                    <div class="flex flex-wrap gap-1.5 w-full sm:w-auto justify-end shrink-0">
                        <button type="button" onclick="restoreSingleOrderFromArchive('${o.id}', '${a.id}', true)" class="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm transition-all flex items-center gap-1">
                            <i class="fa-solid fa-rotate-left"></i> استعادة للحي (بدون دفعة)
                        </button>
                        <button type="button" onclick="restoreSingleOrderFromArchive('${o.id}', '${a.id}', false)" class="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm transition-all flex items-center gap-1">
                            <i class="fa-solid fa-arrow-up-from-bracket"></i> استعادة مع الدفعة
                        </button>
                    </div>
                </div>`;
            }).join('');

            const html = `
            <div id="print-archive-area">
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
                        <p class="text-[10px] font-bold text-slate-500 mb-1">الطلبات المسلمة</p>
                        <p class="text-2xl font-black text-blue-600">${a.ordersCount || 0}</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-center">
                        <p class="text-[10px] font-bold text-slate-500 mb-1">الخصومات</p>
                        <p class="text-2xl font-black text-red-500">${(a.totalDiscount || 0).toLocaleString()} ج</p>
                    </div>
                    <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm text-center col-span-2 md:col-span-1">
                        <p class="text-[10px] font-bold text-emerald-600 mb-1">الصافي المعتمد</p>
                        <p class="text-2xl font-black text-emerald-700">${(a.totalRevenue || 0).toLocaleString()} ج</p>
                    </div>
                </div>
                
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6">
                    <h4 class="text-xs font-black text-slate-800 mb-4 pb-2 border-b border-slate-50"><i class="fa-solid fa-boxes-packing text-brand-primary mr-1"></i> إجمالي مبيعات الأصناف في هذه الدفعة</h4>
                    <div class="grid grid-cols-3 md:grid-cols-6 gap-3">${itemsHtml || '<span class="text-xs text-slate-400">لا توجد بيانات</span>'}</div>
                </div>

                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6">
                    <h4 class="text-xs font-black text-slate-800 mb-4 pb-2 border-b border-slate-50"><i class="fa-solid fa-map-location-dot text-indigo-500 mr-1"></i> التوزيع الجغرافي</h4>
                    <div class="flex flex-wrap gap-2">${zonesHtml || '<span class="text-xs text-slate-400">لا توجد بيانات</span>'}</div>
                </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border-2 border-amber-200 shadow-sm">
                <div class="mb-3 pb-2 border-b border-slate-100">
                    <h4 class="text-xs font-black text-slate-800"><i class="fa-solid fa-rotate-left text-amber-500 mr-1"></i> الطلبات الموجودة داخل الأرشيف (${batchArchivedOrders.length} طلب) — استعادة طلب منفرد</h4>
                    <p class="text-[10px] font-bold text-slate-400 mt-0.5">اضغط (استعادة للحي بدون دفعة) على أي طلب دخل هنا بالخطأ ليعود فوراً إلى شاشة الطلبات الحية (قسم مكتمل).</p>
                </div>
                <div class="space-y-2.5 max-h-80 overflow-y-auto custom-scroll pr-1">
                    ${ordersRowsHtml || '<div class="text-center py-6 text-xs font-bold text-slate-400">لا توجد طلبات مؤرشفة حالياً.</div>'}
                </div>
            </div>`;

            const contentEl = document.getElementById('archive-report-content');
            if (contentEl) contentEl.innerHTML = html;
            const unarchBtn = document.getElementById('btn-unarchive');
            if (unarchBtn) unarchBtn.onclick = () => { window.unarchiveBatch(arId); };
            if (typeof openModal === 'function') openModal('archive-report-modal');
        };
    }

    // 3. حارس صارم يمنع ذهاب أي طلب للأرشيف تلقائياً عند تحويل حالته إلى (مكتمل) إلا بأمر يدوي صريح منك
    function installStrictAntiAutoArchiveGuard() {
        if (typeof window.updateOrderStatus === 'function' && !window.updateOrderStatus._antiAutoArchiveGuarded) {
            const _origUpdateStatus = window.updateOrderStatus;
            const guardedUpdate = async function (id, newStatus) {
                const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
                const ord = ordersList.find(x => x.id === id);
                const wasArchivedBefore = ord ? Boolean(ord.isArchived) : false;
                const origBatchId = ord ? (ord.batchId || '') : '';
                const origBatchName = ord ? (ord.batchName || '') : '';

                // نعطل مؤقتاً مصفوفة الأرشيف أثناء تنفيذ دالة الاكتمال حتى لا يلتقطها الكود القديم في index.html أو orders.js
                let savedGlobalArch = [];
                try {
                    if (typeof archivedBatchesData !== 'undefined') {
                        savedGlobalArch = archivedBatchesData;
                        archivedBatchesData = [];
                    }
                } catch (e) {}

                try {
                    await _origUpdateStatus.apply(this, arguments);
                } finally {
                    try {
                        if (savedGlobalArch.length > 0) {
                            archivedBatchesData = savedGlobalArch;
                        }
                    } catch (e) {}
                }

                // إذا لم يكن الطلب مؤرشفاً من قبل، نضمن بقاءه في الشاشة الحية وعدم دخوله في أي دفعة بالخطأ
                if (ord && !wasArchivedBefore && ord.isArchived) {
                    ord.isArchived = false;
                    ord.batchId = origBatchId;
                    ord.batchName = origBatchName;
                    if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[id]) {
                        globalOrdersMap[id].isArchived = false;
                        globalOrdersMap[id].batchId = origBatchId;
                        globalOrdersMap[id].batchName = origBatchName;
                    }
                    if (typeof db !== 'undefined') {
                        await db.collection('orders').doc(id).update({
                            isArchived: firebase.firestore.FieldValue.delete(),
                            batchId: origBatchId,
                            batchName: origBatchName
                        }).catch(() => {});
                    }
                    if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
                }
                window.renderSmartDashboard();
            };
            guardedUpdate._antiAutoArchiveGuarded = true;
            window.updateOrderStatus = guardedUpdate;
        }
    }

    // ترقية نافذة الفريزر لمنع ظهور أي رقم سالب وإضافة زر التصفير الفوري
    const _origOpenFreezerModal = window.openFreezerModal;
    window.openFreezerModal = function () {
        window.sanitizeFreezerNegativeValues(false);
        if (typeof _origOpenFreezerModal === 'function') {
            _origOpenFreezerModal();
        }
        const cont = document.getElementById('freezer-items-container');
        if (cont && !document.getElementById('fz-smart-tools-bar')) {
            const toolsDiv = document.createElement('div');
            toolsDiv.id = 'fz-smart-tools-bar';
            toolsDiv.className = 'flex gap-2 mb-3 pb-3 border-b border-slate-200';
            toolsDiv.innerHTML = `
                <button onclick="sanitizeFreezerNegativeValues(true)" class="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-3 rounded-xl text-[11px] font-black shadow-sm transition-all">✨ إصلاح أي رقم سالب</button>
                <button onclick="resetAllFreezerToZero()" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 py-2 px-3 rounded-xl text-[11px] font-black transition-all">🔄 تصفير الكل (0)</button>
            `;
            cont.parentElement.insertBefore(toolsDiv, cont);
        }
    };

    const _origBulkChangeStatus = window.bulkChangeStatus;
    if (typeof _origBulkChangeStatus === 'function') {
        window.bulkChangeStatus = async function (newStatus) {
            await _origBulkChangeStatus(newStatus);
            await window.sanitizeFreezerNegativeValues(false);
        };
    }

    function bootSmartEngine() {
        window.initSmartDashboardLayout();
        installEnhancedArchiveReportModal();
        installStrictAntiAutoArchiveGuard();
        setTimeout(() => {
            installEnhancedArchiveReportModal();
            installStrictAntiAutoArchiveGuard();
            window.sanitizeFreezerNegativeValues(false);
            window.loadAllArchivedBatchesSafe();
            window.loadLedgerRecordsSafe();
            window.renderSmartDashboard();
        }, 550);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', bootSmartEngine);
    } else {
        bootSmartEngine();
    }

    const _origScheduleSystemRender = window.scheduleSystemRender;
    window.scheduleSystemRender = function () {
        if (typeof _origScheduleSystemRender === 'function') {
            _origScheduleSystemRender();
        }
        setTimeout(() => window.renderSmartDashboard(), 180);
    };

    const _origRenderBatchesUI = window.renderBatchesUI;
    if (typeof _origRenderBatchesUI === 'function') {
        window.renderBatchesUI = function () {
            _origRenderBatchesUI();
            window.renderSmartDashboard();
        };
    }

    const _origSwitchTab = window.switchTab;
    if (typeof _origSwitchTab === 'function') {
        window.switchTab = function (tabId, btnElement, isFromBackButton) {
            _origSwitchTab(tabId, btnElement, isFromBackButton);
            if (tabId === 'dashboard') window.renderSmartDashboard();
            if (tabId === 'archive') {
                installEnhancedArchiveReportModal();
                window.renderArchiveUI();
            }
        };
    }
})();
