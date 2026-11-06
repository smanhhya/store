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

    // تدقيق حسابات الطلب الواحد (يضمن صحة الأرقام حتى للطلبات القديمة أو المعدلة)
    window.getAccurateOrderFinancials = function (o) {
        if (!o) return { subtotal: 0, delivery: 0, discount: 0, total: 0, implicitDiscount: 0 };
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

        const delivery = Number(o.deliveryFee) || 0;
        const discount = Number(o.discount) || 0;
        const rawTotal = Number(o.total);
        const rawSub = Number(o.subtotal);

        const subtotal = !isNaN(rawSub) && rawSub > 0
            ? rawSub
            : (itemsCalcSum > 0 ? itemsCalcSum : Math.max(0, (rawTotal || 0) - delivery + discount));

        const total = !isNaN(rawTotal) && rawTotal >= 0
            ? rawTotal
            : Math.max(0, subtotal + delivery - discount);

        return {
            subtotal: Math.round(subtotal),
            delivery: Math.round(delivery),
            discount: Math.round(discount),
            total: Math.round(total),
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
    // 🧾 ثالثاً: محرك المصروفات وسجل الهالك والبايظ والخزنة (Ledger & Waste)
    // =========================================================================

    window.loadLedgerRecordsSafe = async function () {
        if (typeof db === 'undefined') return;
        try {
            const doc = await db.collection('inventory').doc('ledger_records').get();
            if (doc.exists) {
                window.storeLedgerRecords = doc.data() || {};
            }
            window.renderSmartDashboard();
        } catch (e) {
            console.log('Ledger load info:', e);
        }
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

    window.openLedgerEntryBox = function (mode, prefillBatchName = '') {
        window.updateDashState('activeSubTab', 'ledger_waste');
        const box = document.getElementById('sm-ledger-form-box');
        if (!box) return;
        box.classList.remove('hidden');

        const typeInput = document.getElementById('lg-entry-type');
        if (typeInput) typeInput.value = mode;

        const expWrap = document.getElementById('lg-expense-fields');
        const wasteWrap = document.getElementById('lg-waste-fields');
        const formTitle = document.getElementById('lg-form-title');

        if (mode === 'waste') {
            formTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-500 mr-1.5"></i> تسجيل هالك / بايظ / استهلاك بيت / تعويض';
            expWrap.classList.add('hidden');
            wasteWrap.classList.remove('hidden');
        } else {
            formTitle.innerHTML = '<i class="fa-solid fa-money-bill-transfer text-amber-500 mr-1.5"></i> تسجيل مصروف تشغيل أو سحب نقدي';
            wasteWrap.classList.add('hidden');
            expWrap.classList.remove('hidden');
        }

        const batchSel = document.getElementById('lg-batch-name');
        if (batchSel && prefillBatchName) {
            batchSel.value = prefillBatchName;
        }

        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

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

        if (mode === 'expense') {
            const category = document.getElementById('lg-exp-category')?.value || 'علف وتسمين';
            const amount = Number(document.getElementById('lg-exp-amount')?.value) || 0;
            const paySource = document.getElementById('lg-exp-source')?.value || 'cash';

            if (amount <= 0) return alert('برجاء إدخال مبلغ المصروف بشكل صحيح!');

            recordObj.category = category;
            recordObj.amount = amount;
            recordObj.paymentSource = paySource;
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
            window.storeLedgerRecords[recId] = recordObj;
            await db.collection('inventory').doc('ledger_records').set({
                [recId]: recordObj
            }, { merge: true });

            if (document.getElementById('lg-exp-amount')) document.getElementById('lg-exp-amount').value = '';
            if (document.getElementById('lg-waste-qty')) document.getElementById('lg-waste-qty').value = '';
            if (document.getElementById('lg-waste-cost')) document.getElementById('lg-waste-cost').value = '';
            if (document.getElementById('lg-notes')) document.getElementById('lg-notes').value = '';
            document.getElementById('sm-ledger-form-box')?.classList.add('hidden');

            window.renderSmartDashboard();
            window.showToast(mode === 'waste' ? '✅ تم تسجيل الهالك/الاستهلاك وتحديث الحسابات' : '✅ تم تسجيل المصروف وخصمه من صافي الربح');
        } catch (e) {
            alert('حدث خطأ أثناء حفظ السجل: ' + (e.message || e));
        }
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
    // 🎨 رابعاً: بناء الهيكل البصري الفائق للوحة القيادة
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
        root.className = 'space-y-6 pb-16';

        root.innerHTML = `
            <!-- ⚡ 1. شريط صلاحيات القائد السريعة (Super-Admin Command Bar) -->
            <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 rounded-[1.5rem] shadow-lg flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-lg shrink-0">
                        <i class="fa-solid fa-bolt-lightning"></i>
                    </div>
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="text-sm sm:text-base font-black text-white">غرفة القيادة المركزية والحسابات الدقيقة</h3>
                            <span id="dash-active-period-badge" class="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-[11px] font-black">هذا الشهر</span>
                        </div>
                        <p class="text-[11px] text-slate-300 font-bold mt-0.5">حسابات شاملة للدفعات (المباع الكلي + المحصل + قيد التحصيل)، وفريزر محمي من السالب، وفصل دقيق للسمان والكتاكيت والبيض.</p>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <button onclick="quickToggleStoreOpenStatus()" id="sm-cmd-store-status" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5">
                        <i class="fa-solid fa-power-off"></i> <span>المتجر مفتوح</span>
                    </button>
                    <button onclick="openFreezerModal()" class="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-snowflake"></i> الفريزر (<span id="sm-cmd-freezer-total">0 طبق | 0 ج</span>)
                    </button>
                    <button onclick="openLedgerEntryBox('expense')" class="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5">
                        <i class="fa-solid fa-plus"></i> تسجيل مصروف/سحب
                    </button>
                    <button onclick="openLedgerEntryBox('waste')" class="bg-rose-500 hover:bg-rose-400 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5">
                        <i class="fa-solid fa-triangle-exclamation"></i> تسجيل هالك/بايظ
                    </button>
                    <button onclick="printSmartDashboardReport()" class="bg-white/10 hover:bg-white/20 text-white border border-white/15 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-print text-amber-300"></i> طباعة التقرير
                    </button>
                </div>
            </div>

            <!-- 🎛️ 2. شريط الفلترة الزمنية وفلترة الدفعات + أقسام اللوحة -->
            <div class="bg-white p-4 sm:p-5 rounded-[1.5rem] border border-slate-200/80 shadow-soft space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button onclick="updateDashState('period', 'this_month')" id="d-period-this_month" class="dash-period-btn bg-brand-primary text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition-all">📅 هذا الشهر</button>
                        <button onclick="updateDashState('period', 'last_month')" id="d-period-last_month" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all">⏪ الشهر الماضي</button>
                        <button onclick="updateDashState('period', 'pick_month')" id="d-period-pick_month" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all">🗓️ شهر محدد</button>
                        <button onclick="updateDashState('period', 'today')" id="d-period-today" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all">☀️ اليوم فقط</button>
                        <button onclick="updateDashState('period', 'custom')" id="d-period-custom" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all">📆 فترة مخصصة</button>
                        <button onclick="updateDashState('period', 'all_time')" id="d-period-all_time" class="dash-period-btn bg-slate-100 text-slate-600 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-black transition-all">🌍 كل الأوقات</button>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <select id="dash-source-select" onchange="updateDashState('sourceFilter', this.value)" class="flex-1 md:flex-none border-2 border-teal-500/30 bg-teal-50/40 rounded-xl px-3 py-2 text-xs font-black text-teal-900 outline-none focus:border-teal-600">
                            <option value="all">📦 كل المبيعات (دفعات + فوري)</option>
                            <option value="batches_only">🏷️ طلبات الدفعات فقط</option>
                            <option value="normal_only">❄️ الطلبات الفورية فقط</option>
                        </select>

                        <select id="dash-date-basis" onchange="updateDashState('dateBasis', this.value)" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none">
                            <option value="effective">حسب: تاريخ التسليم</option>
                            <option value="created">حسب: تاريخ الطلب</option>
                        </select>
                    </div>
                </div>

                <!-- خيارات التاريخ المخصص أو الشهر -->
                <div id="dash-extra-date-controls" class="hidden pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
                    <div id="dash-month-picker-wrap" class="hidden flex items-center gap-2">
                        <label class="text-xs font-black text-slate-600">اختر الشهر والسنة:</label>
                        <input type="month" id="dash-month-input" value="${defaultMonthStr}" onchange="updateDashState('selectedMonth', this.value)" class="border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black bg-white outline-none">
                    </div>
                    <div id="dash-custom-range-wrap" class="hidden flex flex-wrap items-center gap-2">
                        <label class="text-xs font-black text-slate-600">من:</label>
                        <input type="date" id="dash-date-from" onchange="updateDashState('dateFrom', this.value)" class="border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black bg-white outline-none">
                        <label class="text-xs font-black text-slate-600">إلى:</label>
                        <input type="date" id="dash-date-to" onchange="updateDashState('dateTo', this.value)" class="border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black bg-white outline-none">
                    </div>
                </div>

                <!-- تبويبات التنقل السريع داخل لوحة القيادة -->
                <div class="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    <button onclick="updateDashState('activeSubTab', 'overview')" id="sm-subtab-overview" class="sm-subtab-btn bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all">
                        <i class="fa-solid fa-chart-line text-emerald-400 mr-1"></i> الملخص المالي والدفعات والأصناف
                    </button>
                    <button onclick="updateDashState('activeSubTab', 'ledger_waste')" id="sm-subtab-ledger_waste" class="sm-subtab-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">
                        <i class="fa-solid fa-scale-balanced text-rose-500 mr-1"></i> الخزنة والمصروفات وميزان الهالك والبايظ
                    </button>
                    <button onclick="updateDashState('activeSubTab', 'vip_zones')" id="sm-subtab-vip_zones" class="sm-subtab-btn bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black transition-all">
                        <i class="fa-solid fa-crown text-amber-500 mr-1"></i> رادار العملاء الغائبين (VIP) وربحية المناطق
                    </button>
                </div>
            </div>

            <!-- 🏦 3. شريط الخزن والمحافظ الـ 4 اللحظية (يظهر دائماً) -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="bg-gradient-to-br from-emerald-900 to-brand-dark text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-[10px] font-bold text-emerald-200">💵 صافي كاش الدرج (للمسلم بعد المصروف)</p>
                        <h4 id="sm-safe-net-cash" class="text-xl font-black text-white mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-cash-register text-2xl text-emerald-400/70"></i>
                </div>
                <div class="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p class="text-[10px] font-black text-emerald-700">💳 محفظة الأونلاين (فودافون/إنستا)</p>
                        <h4 id="sm-safe-net-online" class="text-xl font-black text-emerald-600 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-mobile-screen-button text-2xl text-emerald-500/60"></i>
                </div>
                <div onclick="switchTab('radar', document.querySelector('button[onclick*=\\'radar\\']'))" class="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all">
                    <div>
                        <p class="text-[10px] font-black text-amber-700">🛵 كاش في الشارع مع المناديب الآن</p>
                        <h4 id="sm-safe-street-cash" class="text-xl font-black text-amber-600 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-motorcycle text-2xl text-amber-500/60"></i>
                </div>
                <div onclick="switchTab('debts', document.querySelector('button[onclick*=\\'debts\\']'))" class="bg-white p-4 rounded-2xl border border-red-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-red-400 transition-all">
                    <div>
                        <p class="text-[10px] font-black text-red-700">📕 إجمالي ديون لك في السوق</p>
                        <h4 id="sm-safe-market-debt" class="text-xl font-black text-red-600 mt-0.5">0 ج</h4>
                    </div>
                    <i class="fa-solid fa-hand-holding-dollar text-2xl text-red-500/60"></i>
                </div>
            </div>

            <!-- 💰 4. الكروت المالية الـ 6 (تظهر المباع الكلي + المحصل الفعلي بوضوح تام) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- 1. إجمالي المبيعات الكلي والمحصل -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-amber-200/80 shadow-soft">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="text-xs font-black text-slate-500">إجمالي المبيعات الكلي (المسلم + قيد التسليم)</p>
                            <h3 id="sm-dash-total-revenue" class="text-3xl font-black text-amber-600 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-lg"><i class="fa-solid fa-wallet"></i></div>
                    </div>
                    <div id="sm-dash-collected-vs-pending" class="text-[11px] font-black text-slate-700 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200/70 mb-1.5 flex justify-between">
                        <span class="text-emerald-700">✅ محصل: 0 ج</span>
                        <span class="text-blue-600">⏳ قيد التحصيل: 0 ج</span>
                    </div>
                    <div id="sm-dash-payment-split" class="text-[10px] font-black text-slate-600 bg-amber-50/70 px-3 py-1 rounded-lg border border-amber-100 flex justify-between">
                        <span>💵 كاش: 0 ج</span>
                        <span>💳 أونلاين: 0 ج</span>
                    </div>
                </div>

                <!-- 2. صافي قيمة المنتجات -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-emerald-200/80 shadow-soft">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="text-xs font-black text-slate-500">إيراد المنتجات الصافي (بدون توصيل)</p>
                            <h3 id="sm-dash-products-revenue" class="text-3xl font-black text-brand-primary mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg"><i class="fa-solid fa-sack-dollar"></i></div>
                    </div>
                    <div id="sm-dash-products-sub-split" class="text-[11px] font-black text-slate-700 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200/70 mb-1.5 flex justify-between">
                        <span class="text-emerald-700">✅ مسلم: 0 ج</span>
                        <span class="text-blue-600">⏳ محجوز: 0 ج</span>
                    </div>
                    <div id="sm-dash-avg-order" class="text-[10px] font-black text-emerald-800 bg-emerald-50/70 px-3 py-1 rounded-lg border border-emerald-100 flex justify-between">
                        <span>متوسط الطلب: 0 ج</span>
                        <span>🥩 0 لحم</span>
                    </div>
                </div>

                <!-- 3. صافي الربح الحقيقي بعد المصروفات والهالك -->
                <div onclick="updateDashState('activeSubTab', 'ledger_waste')" class="bg-white p-5 rounded-[1.5rem] border-2 border-teal-500/40 shadow-soft cursor-pointer hover:border-teal-600 transition-all">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-teal-800">💎 صافي الربح (بعد المصروف والهالك)</p>
                            <h3 id="sm-dash-true-net-profit" class="text-3xl font-black text-teal-700 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-11 h-11 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center text-lg"><i class="fa-solid fa-gem"></i></div>
                    </div>
                    <div id="sm-dash-expenses-summary" class="text-[11px] font-black text-teal-900 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200 flex justify-between">
                        <span>مصروفات: 0 ج</span>
                        <span>هالك/بايظ: 0 وحدة (0 ج)</span>
                    </div>
                </div>

                <!-- 4. إجمالي الخصومات والواجب -->
                <div onclick="updateDashState('activeSubTab', 'overview'); updateDashState('tableSubFilter', 'discounted'); document.getElementById('sm-dash-orders-section').scrollIntoView({behavior:'smooth'});" class="bg-white p-5 rounded-[1.5rem] border border-red-200 shadow-soft cursor-pointer hover:border-red-400 transition-all">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-red-600">🎁 إجمالي الخصومات والواجب بالفترة</p>
                            <h3 id="sm-dash-discounts-total" class="text-2xl font-black text-red-600 mt-1">0 <span class="text-sm">ج</span></h3>
                        </div>
                        <div class="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-base"><i class="fa-solid fa-tags"></i></div>
                    </div>
                    <div id="sm-dash-discounts-breakdown" class="text-[11px] font-black text-red-800 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 flex justify-between">
                        <span>خصم فواتير: 0 ج</span>
                        <span>فروق أسعار: 0 ج</span>
                    </div>
                </div>

                <!-- 5. الطلبات المسلمة وقيد التنفيذ -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-blue-100 shadow-soft">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">إجمالي الطلبات الفعالة وحركة التسليم</p>
                            <h3 id="sm-dash-completed-count" class="text-2xl font-black text-blue-600 mt-1">0 <span class="text-xs text-slate-400">طلب</span></h3>
                        </div>
                        <div class="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-base"><i class="fa-solid fa-check-double"></i></div>
                    </div>
                    <div id="sm-dash-pipeline-info" class="text-[11px] font-black text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 flex justify-between">
                        <span class="text-amber-600">⏳ قيد التنفيذ: 0 (0 ج)</span>
                        <span class="text-slate-400">❌ ملغي: 0</span>
                    </div>
                </div>

                <!-- 6. إيراد التوصيل والآجل -->
                <div class="bg-white p-5 rounded-[1.5rem] border border-indigo-100 shadow-soft">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <p class="text-xs font-black text-slate-500">إيرادات التوصيل والآجل المسجل</p>
                            <h3 id="sm-dash-delivery-revenue" class="text-2xl font-black text-indigo-600 mt-1">0 <span class="text-sm">ج توصيل</span></h3>
                        </div>
                        <div class="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-base"><i class="fa-solid fa-truck-fast"></i></div>
                    </div>
                    <div id="sm-dash-free-delivery-info" class="text-[11px] font-black text-indigo-800 bg-indigo-50/60 px-3 py-1.5 rounded-xl border border-indigo-100 flex justify-between">
                        <span>توصيل مجاني: 0 طلب</span>
                        <span id="sm-dash-debt-total" class="text-rose-600">آجل الفترة: 0 ج</span>
                    </div>
                </div>
            </div>

            <!-- 📊 5. شريط متوسطات الدفعات التاريخي (خاص بلحوم السمان فقط) -->
            <div class="bg-white p-5 rounded-[1.5rem] border border-slate-200/80 shadow-soft">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fa-solid fa-gauge-high text-brand-primary"></i> مؤشر متوسطات الدفعات ومقياس الكفاءة (محسوب على أطباق السمان المذبوح فقط)
                    </h4>
                    <span class="text-[10px] font-bold text-slate-400">معزول عن أعداد البيض والكتاكيت</span>
                </div>
                <div id="sm-dash-benchmarks-bar" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>
            </div>

            <!-- ========================================================= -->
            <!-- القسم الأول (Overview): مقارنة الدفعات + جرد الأصناف + الجدول -->
            <!-- ========================================================= -->
            <div id="sm-panel-overview" class="space-y-6">
                <!-- تفصيل وأرشفة الدفعات وميزان كل دفعة -->
                <div class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                        <div>
                            <h4 class="text-sm font-black text-slate-800"><i class="fa-solid fa-layer-group text-teal-600 mr-1.5"></i> الحساب الكامل للدفعات (إجمالي مبيعات الدفعة الكلي + المحصل + المتبقي + الميزان)</h4>
                            <p class="text-[10px] font-bold text-slate-400 mt-0.5">يعرض لك كارت كل دفعة إجمالي مبيعاتها الكلي بالكامل دون قصّ الطلبات التي حُجزت في نهاية الشهر السابق.</p>
                        </div>
                        <button onclick="updateDashState('sourceFilter', 'all')" id="sm-reset-batch-filter" class="hidden text-xs font-black bg-red-50 text-red-600 px-3 py-1 rounded-lg border border-red-200 hover:bg-red-600 hover:text-white transition-colors">إلغاء فلتر الدفعة ✕</button>
                    </div>
                    <div id="sm-dash-batches-breakdown" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                </div>

                <!-- جرد الأصناف المباعة في الفترة -->
                <div class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft">
                    <h4 class="text-sm font-black text-slate-800 mb-4 pb-2 border-b border-slate-100">
                        <i class="fa-solid fa-boxes-packing text-brand-primary mr-1.5"></i> جرد الأصناف المباعة في الفترة (الكمية الكلية + الإيراد + متوسط سعر الوحدة)
                    </h4>
                    <div id="sm-dash-items-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"></div>
                </div>

                <!-- جدول سجل الطلبات التفصيلي للفترة -->
                <div id="sm-dash-orders-section" class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft space-y-4">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-slate-100">
                        <div>
                            <h4 class="text-sm font-black text-slate-800"><i class="fa-solid fa-list-check text-indigo-500 mr-1.5"></i> السجل التفصيلي لطلبات الفترة / الدفعة</h4>
                            <p class="text-[11px] font-bold text-slate-400 mt-0.5">يعرض كل تفاصيل المبيعات والخصومات للطلبات المفلترة.</p>
                        </div>

                        <div class="flex flex-wrap items-center gap-1.5">
                            <button onclick="updateDashState('tableSubFilter', 'all_valid')" id="sm-tf-all_valid" class="sm-tf-btn bg-slate-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-black">📦 كل المباع (مكتمل + حي)</button>
                            <button onclick="updateDashState('tableSubFilter', 'completed')" id="sm-tf-completed" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">✅ المكتمل فقط</button>
                            <button onclick="updateDashState('tableSubFilter', 'all_active')" id="sm-tf-all_active" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">⏳ قيد التحصيل فقط</button>
                            <button onclick="updateDashState('tableSubFilter', 'discounted')" id="sm-tf-discounted" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">🎁 بها خصم/واجب</button>
                            <button onclick="updateDashState('tableSubFilter', 'debt')" id="sm-tf-debt" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">📕 عليها آجل</button>
                            <button onclick="updateDashState('tableSubFilter', 'canceled')" id="sm-tf-canceled" class="sm-tf-btn bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black">❌ الملغي</button>
                        </div>
                    </div>

                    <div class="relative w-full md:w-96">
                        <i class="fa-solid fa-search absolute right-3.5 top-3 text-slate-400 text-xs"></i>
                        <input type="search" id="sm-dash-table-search" oninput="updateDashState('tableSearch', this.value)" placeholder="ابحث داخل الجدول (اسم، رقم، منطقة، صنف)..." class="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:bg-white focus:border-brand-primary">
                    </div>

                    <div class="overflow-x-auto custom-scroll max-h-[520px]">
                        <table class="w-full text-right text-xs whitespace-nowrap">
                            <thead class="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    <th class="py-3 px-4 font-black">العميل والمنطقة</th>
                                    <th class="py-3 px-4 font-black text-center">الدفعة / الحالة</th>
                                    <th class="py-3 px-4 font-black text-center">الأصناف</th>
                                    <th class="py-3 px-4 font-black text-center">المنتجات</th>
                                    <th class="py-3 px-4 font-black text-center">التوصيل</th>
                                    <th class="py-3 px-4 font-black text-center text-red-600">الخصم / الواجب</th>
                                    <th class="py-3 px-4 font-black text-center">الصافي النهائي</th>
                                    <th class="py-3 px-4 font-black text-center">التاريخ</th>
                                    <th class="py-3 px-4 font-black text-center">إجراء</th>
                                </tr>
                            </thead>
                            <tbody id="sm-dash-orders-tbody" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ========================================================= -->
            <!-- القسم الثاني (Ledger & Waste): المصروفات وميزان الهالك والبايظ -->
            <!-- ========================================================= -->
            <div id="sm-panel-ledger_waste" class="hidden space-y-6">
                <div class="bg-white p-5 rounded-[1.5rem] border border-slate-200/80 shadow-soft flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h4 class="text-base font-black text-slate-800"><i class="fa-solid fa-scale-balanced text-rose-500 mr-1.5"></i> إدارة المصروفات وسجل الهالك والبايظ واستهلاك البيت</h4>
                        <p class="text-xs font-bold text-slate-400 mt-0.5">سجل مصاريف العلف والذبح والتغليف، أو سجل أي سمان نافق/بايظ أو مسحوب للبيت لخصمه من الفريزر وحساب صافي ربحك بدقة.</p>
                    </div>
                    <div class="flex gap-2 w-full sm:w-auto">
                        <button onclick="openLedgerEntryBox('expense')" class="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-sm">+ إضافة مصروف / سحب</button>
                        <button onclick="openLedgerEntryBox('waste')" class="flex-1 sm:flex-none bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-sm">+ تسجيل هالك / بايظ / بيت</button>
                    </div>
                </div>

                <div id="sm-ledger-form-box" class="hidden bg-slate-900 text-white p-6 rounded-[1.5rem] shadow-xl space-y-4">
                    <div class="flex justify-between items-center pb-3 border-b border-white/10">
                        <h4 id="lg-form-title" class="font-black text-sm text-amber-400">تسجيل عملية جديدة</h4>
                        <button onclick="document.getElementById('sm-ledger-form-box').classList.add('hidden')" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                    <input type="hidden" id="lg-entry-type" value="expense">

                    <div id="lg-expense-fields" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">بند المصروف / السحب</label>
                            <select id="lg-exp-category" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-white outline-none">
                                <option value="علف وتسمين">🌾 علف وتسمين</option>
                                <option value="كتاكيت / بيض تفريخ">🐣 كتاكيت / بيض تفريخ</option>
                                <option value="أجرة ذبح وتنظيف">🔪 أجرة ذبح وتنظيف</option>
                                <option value="أطباق وأكياس واستيكرات">📦 أطباق وأكياس واستيكرات</option>
                                <option value="كهرباء وتدفئة ومياه">⚡ كهرباء وتدفئة ومياه</option>
                                <option value="أدوية وفيتامينات">💊 أدوية وفيتامينات</option>
                                <option value="سحب شخصي / مصروف بيت">🏠 سحب شخصي / مصروف بيت</option>
                                <option value="مصروفات أخرى">📝 مصروفات أخرى</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">المبلغ بالجنيه *</label>
                            <input type="number" id="lg-exp-amount" placeholder="مثال: 500" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-amber-400 outline-none">
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">مخصوم من خزنة</label>
                            <select id="lg-exp-source" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-white outline-none">
                                <option value="cash">💵 خزنة الكاش (الدرج)</option>
                                <option value="online">💳 محفظة الأونلاين</option>
                            </select>
                        </div>
                    </div>

                    <div id="lg-waste-fields" class="hidden grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">نوع الهالك / السحب</label>
                            <select id="lg-waste-kind" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-rose-300 outline-none">
                                <option value="هالك تربية / نافق">🐤 هالك تربية / نافق قبل الذبح</option>
                                <option value="تالف ذبح / فرزة تانية">🔪 تالف ذبح / كسر</option>
                                <option value="بايظ فريزر / تالف تخزين">❄️ بايظ في الفريزر / تالف تخزين</option>
                                <option value="استهلاك بيتي / هدايا">🏠 استهلاك بيت / هدية مجانية</option>
                                <option value="تعويض عميل">🤝 تعويض لعميل</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">الصنف (اختياري)</label>
                            <select id="lg-waste-product" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-white outline-none"></select>
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">العدد (جوز / طبق) *</label>
                            <input type="number" id="lg-waste-qty" placeholder="مثال: 3" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-rose-400 outline-none">
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">التكلفة التقديرية بالـ ج (اختياري)</label>
                            <input type="number" id="lg-waste-cost" placeholder="يحسب تلقائياً لو تركته فارغاً" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-white outline-none">
                        </div>
                        <div class="md:col-span-4">
                            <label class="inline-flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-2 rounded-xl border border-white/10 text-xs font-black text-cyan-300">
                                <input type="checkbox" id="lg-waste-deduct-fz" class="w-4 h-4 accent-cyan-400 rounded">
                                خصم هذا العدد أوتوماتيك من رصيد مخزن الفريزر الحالي (دون نزول تحت الصفر) ❄️
                            </label>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">ربط بدفعة معينة (اختياري)</label>
                            <select id="lg-batch-name" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-black text-white outline-none"></select>
                        </div>
                        <div>
                            <label class="text-[11px] font-bold text-slate-300 block mb-1">ملاحظات وتفاصيل إضافية</label>
                            <input type="text" id="lg-notes" placeholder="اكتب أي تفاصيل..." class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                        </div>
                        <div class="flex items-end">
                            <button onclick="submitLedgerRecord()" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 rounded-xl text-xs shadow-lg transition-all">💾 حفظ وتسميع في الحسابات</button>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-soft">
                    <h4 class="text-sm font-black text-slate-800 mb-4 pb-2 border-b border-slate-100">📋 سجل المصروفات والهالك المسجل في الفترة المحددة</h4>
                    <div class="overflow-x-auto custom-scroll max-h-[450px]">
                        <table class="w-full text-right text-xs whitespace-nowrap">
                            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
                                <tr>
                                    <th class="py-3 px-4 font-black">النوع والبند</th>
                                    <th class="py-3 px-4 font-black text-center">الدفعة المرتبطة</th>
                                    <th class="py-3 px-4 font-black text-center">الكمية / الصنف</th>
                                    <th class="py-3 px-4 font-black text-center">المبلغ / التكلفة</th>
                                    <th class="py-3 px-4 font-black">ملاحظات</th>
                                    <th class="py-3 px-4 font-black text-center">التاريخ</th>
                                    <th class="py-3 px-4 font-black text-center">حذف</th>
                                </tr>
                            </thead>
                            <tbody id="sm-ledger-records-tbody" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ========================================================= -->
            <!-- القسم الثالث (VIP & Zones): رادار الغائبين وربحية المناطق -->
            <!-- ========================================================= -->
            <div id="sm-panel-vip_zones" class="hidden space-y-6">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white p-6 rounded-[1.5rem] border border-amber-200/80 shadow-soft flex flex-col">
                        <div class="mb-4 pb-3 border-b border-slate-100">
                            <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
                                <i class="fa-solid fa-user-clock text-amber-500"></i> رادار استرجاع كبار العملاء الغائبين (VIP Churn Radar)
                            </h4>
                            <p class="text-[11px] font-bold text-slate-400 mt-0.5">عملاء مميزون اشتروا منك سابقاً ولم يطلبوا منذ أكثر من 14 يوماً — راسلهم بضغطة زر لتنشيط المبيعات.</p>
                        </div>
                        <div id="sm-vip-churn-list" class="space-y-2.5 max-h-[450px] overflow-y-auto custom-scroll pr-1"></div>
                    </div>

                    <div class="bg-white p-6 rounded-[1.5rem] border border-indigo-100 shadow-soft flex flex-col">
                        <div class="mb-4 pb-3 border-b border-slate-100">
                            <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
                                <i class="fa-solid fa-map-location-dot text-indigo-600"></i> ترتيب ربحية المناطق وأداء المناديب في الفترة
                            </h4>
                            <p class="text-[11px] font-bold text-slate-400 mt-0.5">يكشف لك أكثر المناطق شراءً وأعلى المناديب إنجازاً في الشهر المحدد.</p>
                        </div>
                        <div id="sm-zones-profit-list" class="space-y-2.5 max-h-[450px] overflow-y-auto custom-scroll pr-1"></div>
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
    // 🔄 سادساً: الريندر الرئيسي الشامل والمضبوط حسابياً 100%
    // =========================================================================

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

        const setElHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

        // 1. تحديث حالة المتجر + حساب الفريزر الفعلي (مع منع أي رقم سالب واستخدام السعر الحقيقي)
        const storeBtn = document.getElementById('sm-cmd-store-status');
        if (storeBtn && typeof storeSettings !== 'undefined') {
            const isOpen = storeSettings.storeOpen !== false;
            storeBtn.className = isOpen
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5'
                : 'bg-red-500 hover:bg-red-400 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5';
            storeBtn.innerHTML = isOpen
                ? '<i class="fa-solid fa-circle-check"></i> <span>المتجر مفتوح</span>'
                : '<i class="fa-solid fa-lock"></i> <span>المتجر مغلق</span>';
        }

        let totalFreezerMeatUnits = 0;
        let totalFreezerValue = 0;
        let hasNegativeInFreezer = false;

        Object.keys(freezerObj).forEach(pId => {
            const rawQty = Number(freezerObj[pId]) || 0;
            if (rawQty < 0) hasNegativeInFreezer = true;
            // منع أي رقم سالب من تشويه رصيد الفريزر
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
        if (sourceSelect) {
            const currentVal = window.dashState.sourceFilter;
            let optionsHtml = `
                <option value="all">📦 كل المبيعات (دفعات + فوري)</option>
                <option value="batches_only">🏷️ طلبات الدفعات فقط</option>
                <option value="normal_only">❄️ الطلبات الفورية فقط</option>
            `;
            Array.from(batchNamesSet).forEach(bName => {
                const valKey = 'batch:' + bName;
                optionsHtml += `<option value="${valKey}" ${currentVal === valKey ? 'selected' : ''}>📌 دفعة: ${bName}</option>`;
            });
            sourceSelect.innerHTML = optionsHtml;
            sourceSelect.value = currentVal;
        }

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
                periodBadge.innerText = `📌 كل حسابات دفعة: ${selectedBatchNameTarget}`;
            } else {
                const pNames = {
                    'this_month': 'هذا الشهر (' + new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }) + ')',
                    'last_month': 'الشهر الماضي',
                    'pick_month': 'شهر: ' + (window.dashState.selectedMonth || ''),
                    'today': 'اليوم فقط',
                    'custom': 'فترة مخصصة',
                    'all_time': 'كل الأوقات (شامل)'
                };
                periodBadge.innerText = pNames[window.dashState.period] || 'هذا الشهر';
            }
        }

        // 3. حساب الهالك والمصروفات لكل دفعة وللفترة
        const wasteByBatchName = {};
        const expensesByBatchName = {};
        ledgerRecordsArr.forEach(rec => {
            if (!rec) return;
            if (rec.type === 'waste' && rec.batchName) {
                wasteByBatchName[rec.batchName.trim()] = (wasteByBatchName[rec.batchName.trim()] || 0) + (Number(rec.qty) || 0);
            }
            if (rec.type === 'expense' && rec.batchName) {
                expensesByBatchName[rec.batchName.trim()] = (expensesByBatchName[rec.batchName.trim()] || 0) + (Number(rec.amount) || 0);
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

        const periodLedgerRecords = ledgerRecordsArr.filter(rec => {
            if (!rec) return false;
            if (isSpecificBatchSelected) return filterRecordBySource(rec);
            const dObj = rec.createdAtMs ? new Date(rec.createdAtMs) : (rec.dateStr ? new Date(rec.dateStr) : null);
            return isTimestampInSelectedPeriod(dObj) && filterRecordBySource(rec);
        });

        let periodExpensesCash = 0, periodExpensesOnline = 0, periodWasteUnits = 0, periodWasteCost = 0;
        periodLedgerRecords.forEach(rec => {
            if (rec.type === 'expense') {
                if (rec.paymentSource === 'online') periodExpensesOnline += Number(rec.amount) || 0;
                else periodExpensesCash += Number(rec.amount) || 0;
            } else if (rec.type === 'waste') {
                periodWasteUnits += Number(rec.qty) || 0;
                periodWasteCost += Number(rec.amount) || 0;
            }
        });
        const totalPeriodExpenses = periodExpensesCash + periodExpensesOnline;

        // 4. 🎯 الحل الجذري لحساب الدفعات (الدفعة وحدة محاسبية متكاملة لا تُقصّ بين الشهور!)
        // نجمع كل طلبات الدفعة الكلية (المكتملة + الحية) حتى تظهر الـ 20,000 ج كاملة وتحتها تفصيل (المحصل + قيد التحصيل)
        const sourcesSummary = {};

        ordersList.forEach(o => {
            if (!o || o.status === 'trash') return;
            const resolvedBName = window.resolveOrderBatchName(o);
            const hasBatch = Boolean(resolvedBName);

            // بالنسبة للطلبات الفورية (بدون دفعة)، تُفلتر حسب الفترة المختارة فقط
            if (!hasBatch && !isSpecificBatchSelected && !isOrderInSelectedPeriod(o)) return;

            // بالنسبة للدفعات: نظهر كل دفعة لها نشاط في الفترة المختارة (أو هي دفعة حية حالياً)، ولكن نحسب أرقام الدفعة كاملة دون قصّ!
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
                    soldMeatUnits: 0,     // أطباق سمان فقط (مكتمل + حي)
                    completedMeatUnits: 0,
                    soldChickUnits: 0,
                    soldEggUnits: 0,
                    totalBatchSales: 0,   // إجمالي مبيعات الدفعة الكلي (مثلاً 20,000 ج)
                    collectedRevenue: 0,  // المحصل فعلياً للمكتمل (مثلاً 7,000 ج)
                    pendingRevenue: 0,    // قيد التحصيل للحي (مثلاً 13,000 ج)
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

        // دمج بيانات أي دفعة مؤرشفة إذا كانت طلباتها القديمة غير محملة أو مؤرشفة بتقرير ثابت
        archivedArr.forEach(a => {
            if (!a || !a.batchName) return;
            const bLabel = a.batchName.trim();
            const archRev = Number(a.totalRevenue) || 0;
            if (sourcesSummary[bLabel] && archRev > sourcesSummary[bLabel].totalBatchSales) {
                sourcesSummary[bLabel].totalBatchSales = archRev;
                sourcesSummary[bLabel].collectedRevenue = archRev;
                sourcesSummary[bLabel].completedCount = Math.max(sourcesSummary[bLabel].completedCount, Number(a.ordersCount) || 0);
            }
        });

        // 5. فلترة الطلبات للكروت العلوية والجدول:
        // إذا اختار المستخدم دفعة محددة، نعرض كل طلبات تلك الدفعة بالكامل دون قصّها بتاريخ الشهر!
        const finalPeriodOrders = ordersList.filter(o => {
            if (!o || o.status === 'trash') return false;
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

        // 6. الحسابات المالية للكروت الـ 6 (شاملة للمباع الكلي + المحصل + قيد التحصيل)
        let completedCount = 0, activeCount = 0, canceledCount = 0;
        let completedRevenue = 0, activeExpectedRev = 0;
        let cashCompletedRev = 0, onlineCompletedRev = 0;
        let cashAllValidRev = 0, onlineAllValidRev = 0;

        let completedProductsSub = 0, activeProductsSub = 0;
        let completedDeliveryRev = 0, activeDeliveryRev = 0, freeDeliveryCount = 0;
        let directDiscounts = 0, implicitPriceDiscounts = 0, discountedOrdersCount = 0;
        let periodDebtTotal = 0;

        // فصل الكميات لـ 3 قطاعات (شامل لكل الطلبات الفعالة غير الملغية)
        let totalMeatUnits = 0, totalChickUnits = 0, totalEggUnits = 0;
        let meatRevenueTotal = 0;

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
            zoneStatsMap[zName].count++;
            zoneStatsMap[zName].revenue += fin.total;

            if (oDebt > 0) periodDebtTotal += oDebt;

            if (o.paymentMethod === 'online') onlineAllValidRev += fin.total;
            else cashAllValidRev += fin.total;

            if (fin.delivery === 0 && fin.total > 0) freeDeliveryCount++;

            if (fin.discount > 0 || fin.implicitDiscount > 0) {
                directDiscounts += fin.discount;
                implicitPriceDiscounts += fin.implicitDiscount;
                discountedOrdersCount++;
            }

            if (isComp) {
                completedCount++;
                completedRevenue += fin.total;
                completedProductsSub += fin.subtotal;
                completedDeliveryRev += fin.delivery;

                if (o.paymentMethod === 'online') onlineCompletedRev += fin.total;
                else cashCompletedRev += fin.total;

                if (o.driverName) {
                    if (!driverStatsMap[o.driverName]) driverStatsMap[o.driverName] = { name: o.driverName, completed: 0, revenue: 0 };
                    driverStatsMap[o.driverName].completed++;
                    driverStatsMap[o.driverName].revenue += fin.total;
                }
            } else {
                activeCount++;
                activeExpectedRev += fin.total;
                activeProductsSub += fin.subtotal;
                activeDeliveryRev += fin.delivery;
            }

            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const q = Number(item.quantity) || 0;
                    const p = Number(item.price) || 0;
                    const cleanName = item.name || 'صنف';
                    const cls = window.classifyOrderItem(item);

                    if (cls.type === 'egg') {
                        totalEggUnits += q;
                    } else if (cls.type === 'chick') {
                        totalChickUnits += q;
                    } else {
                        totalMeatUnits += q;
                        meatRevenueTotal += (q * p);
                    }

                    if (!itemsSoldMap[cleanName]) {
                        itemsSoldMap[cleanName] = { qty: 0, completedQty: 0, revenue: 0, type: cls.type, unitLabel: cls.unitLabel };
                    }
                    itemsSoldMap[cleanName].qty += q;
                    if (isComp) itemsSoldMap[cleanName].completedQty += q;
                    itemsSoldMap[cleanName].revenue += (q * p);
                });
            }
        });

        const grandTotalSales = completedRevenue + activeExpectedRev;
        const grandProductsSubtotal = completedProductsSub + activeProductsSub;
        const grandDeliveryRevenue = completedDeliveryRev + activeDeliveryRev;
        const totalValidOrdersCount = completedCount + activeCount;
        const totalAllDiscounts = directDiscounts + implicitPriceDiscounts;
        const avgOrderVal = totalValidOrdersCount > 0 ? Math.round(grandTotalSales / totalValidOrdersCount) : 0;

        // صافي الربح المبني على إجمالي مبيعات المنتجات الفعلي بعد خصم المصاريف والهالك
        const trueNetProfit = grandProductsSubtotal - totalPeriodExpenses - periodWasteCost;

        // 7. حساب الخزن الـ 4 اللحظية
        let streetCashNow = 0;
        ordersList.forEach(o => {
            if (o && o.status === 'dispatched' && o.paymentMethod !== 'online') {
                streetCashNow += window.getAccurateOrderFinancials(o).total;
            }
        });
        const totalMarketDebtNow = custArr.reduce((s, c) => s + (Number(c.debt) || 0), 0);
        const netSafeCash = cashCompletedRev - periodExpensesCash;
        const netSafeOnline = onlineCompletedRev - periodExpensesOnline;

        setElHtml('sm-safe-net-cash', `${netSafeCash.toLocaleString()} ج`);
        setElHtml('sm-safe-net-online', `${netSafeOnline.toLocaleString()} ج`);
        setElHtml('sm-safe-street-cash', `${streetCashNow.toLocaleString()} ج`);
        setElHtml('sm-safe-market-debt', `${totalMarketDebtNow.toLocaleString()} ج`);

        // 8. تحديث الكروت المالية الـ 6 (إظهار الـ 20,000 والـ 7,000 معاً بوضوح تام)
        setElHtml('sm-dash-total-revenue', `${grandTotalSales.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج</span>`);
        setElHtml('sm-dash-collected-vs-pending', `
            <span class="text-emerald-700">✅ محصل (مكتمل): ${completedRevenue.toLocaleString()} ج</span>
            <span class="text-blue-600">⏳ قيد التحصيل: ${activeExpectedRev.toLocaleString()} ج</span>
        `);
        setElHtml('sm-dash-payment-split', `<span>💵 كاش: ${cashAllValidRev.toLocaleString()} ج</span><span>💳 أونلاين: ${onlineAllValidRev.toLocaleString()} ج</span>`);

        setElHtml('sm-dash-products-revenue', `${grandProductsSubtotal.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج</span>`);
        setElHtml('sm-dash-products-sub-split', `
            <span class="text-emerald-700">✅ منتجات مسلمة: ${completedProductsSub.toLocaleString()} ج</span>
            <span class="text-blue-600">⏳ منتجات محجوزة: ${activeProductsSub.toLocaleString()} ج</span>
        `);

        let unitsBadge = `🥩 ${Number(totalMeatUnits.toFixed(1))} طبق سمان`;
        if (totalChickUnits > 0) unitsBadge += ` | 🐣 ${Number(totalChickUnits.toFixed(0))} كتكوت`;
        if (totalEggUnits > 0) unitsBadge += ` | 🥚 ${Number(totalEggUnits.toFixed(0))} بيض`;
        setElHtml('sm-dash-avg-order', `<span>متوسط الطلب: ${avgOrderVal.toLocaleString()} ج</span><span class="text-[10px] font-black">${unitsBadge}</span>`);

        const profitMargin = grandProductsSubtotal > 0 ? ((trueNetProfit / grandProductsSubtotal) * 100).toFixed(1) : 0;
        const marginBadge = trueNetProfit >= 0
            ? `<span class="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-200 ml-1">هامش ${profitMargin}%</span>`
            : `<span class="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg border border-rose-200 ml-1">عجز</span>`;
        setElHtml('sm-dash-true-net-profit', `${trueNetProfit.toLocaleString()} <span class="text-sm font-bold">ج</span> ${marginBadge}`);
        setElHtml('sm-dash-expenses-summary', `<span>مصروفات: ${totalPeriodExpenses.toLocaleString()} ج</span><span>هالك/بايظ: ${periodWasteUnits} (${periodWasteCost.toLocaleString()} ج)</span>`);

        setElHtml('sm-dash-discounts-total', `${totalAllDiscounts.toLocaleString()} <span class="text-sm font-bold text-red-400">ج</span> <span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">في ${discountedOrdersCount} طلب</span>`);
        setElHtml('sm-dash-discounts-breakdown', `<span>خصم فواتير: ${directDiscounts.toLocaleString()} ج</span><span>واجب/فرق سعر: ${implicitPriceDiscounts.toLocaleString()} ج</span>`);

        setElHtml('sm-dash-completed-count', `${totalValidOrdersCount} <span class="text-xs font-bold text-slate-400">طلب فعلي (منها ${completedCount} مكتمل)</span>`);
        setElHtml('sm-dash-pipeline-info', `<span class="text-amber-600">⏳ قيد التسليم: ${activeCount} (${activeExpectedRev.toLocaleString()} ج)</span><span class="text-slate-400">❌ ملغي: ${canceledCount}</span>`);

        setElHtml('sm-dash-delivery-revenue', `${grandDeliveryRevenue.toLocaleString()} <span class="text-sm font-bold text-slate-400">ج توصيل</span>`);
        setElHtml('sm-dash-free-delivery-info', `<span>توصيل مجاني: ${freeDeliveryCount} طلب</span><span class="text-rose-600">آجل الفترة: ${periodDebtTotal.toLocaleString()} ج</span>`);

        // 9. شريط متوسطات الدفعات التاريخي (مبني على أطباق السمان المذبوح فقط!)
        const visibleBatchesList = Object.values(sourcesSummary).filter(s => s.isBatch && s.hasOrderInSelectedPeriod && s.totalValidCount > 0);
        const batchesCount = visibleBatchesList.length;
        const avgMeatUnitsPerBatch = batchesCount > 0 ? Math.round(visibleBatchesList.reduce((s, b) => s + b.soldMeatUnits, 0) / batchesCount) : 0;
        const avgRevPerBatch = batchesCount > 0 ? Math.round(visibleBatchesList.reduce((s, b) => s + b.totalBatchSales, 0) / batchesCount) : 0;
        const avgMeatUnitPrice = totalMeatUnits > 0 ? Math.round(meatRevenueTotal / totalMeatUnits) : 0;
        const wasteRatio = (totalMeatUnits + periodWasteUnits) > 0 ? ((periodWasteUnits / (totalMeatUnits + periodWasteUnits)) * 100).toFixed(1) : '0.0';

        setElHtml('sm-dash-benchmarks-bar', `
            <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-center">
                <span class="text-[10px] font-bold text-slate-400 block">متوسط سمان الدفعة المباع</span>
                <span class="text-lg font-black text-slate-800">${avgMeatUnitsPerBatch} <span class="text-xs text-brand-primary">طبق سمان</span></span>
            </div>
            <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-center">
                <span class="text-[10px] font-bold text-slate-400 block">متوسط مبيعات الدفعة الواحدة</span>
                <span class="text-lg font-black text-emerald-700">${avgRevPerBatch.toLocaleString()} <span class="text-xs">ج</span></span>
            </div>
            <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-center">
                <span class="text-[10px] font-bold text-slate-400 block">متوسط سعر بيع طبق السمان</span>
                <span class="text-lg font-black text-indigo-600">${avgMeatUnitPrice} <span class="text-xs">ج/طبق</span></span>
            </div>
            <div class="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-200/70 text-center">
                <span class="text-[10px] font-black text-rose-700 block">نسبة الهالك والفاقد المسجل</span>
                <span class="text-lg font-black text-rose-600">${wasteRatio}% <span class="text-xs">(${periodWasteUnits} وحدة)</span></span>
            </div>
        `);

        // 10. رسم كروت ميزان الدفعات (تعرض إجمالي الدفعة الكلي 20,000 ج + المحصل 7,000 ج + قيد التحصيل 13,000 ج)
        const batchesCont = document.getElementById('sm-dash-batches-breakdown');
        if (batchesCont) {
            const sortedSources = Object.values(sourcesSummary)
                .filter(src => src.hasOrderInSelectedPeriod || window.dashState.sourceFilter === src.filterKey)
                .sort((a, b) => b.totalBatchSales - a.totalBatchSales);

            if (sortedSources.length === 0) {
                batchesCont.innerHTML = `<div class="col-span-full text-center py-6 text-slate-400 text-xs font-bold">لا توجد بيانات دفعات أو طلبات في هذه الفترة.</div>`;
            } else {
                batchesCont.innerHTML = sortedSources.map(src => {
                    const isSelected = window.dashState.sourceFilter === src.filterKey;
                    const borderClass = isSelected ? 'border-2 border-brand-primary bg-emerald-50/40 ring-2 ring-brand-primary/10' : 'border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-teal-400';

                    let balanceHtml = '';
                    let actionBtnHtml = '';

                    if (src.isBatch) {
                        const liveB = liveBatchByName[src.label] || (src.batchId && batchesObj[src.batchId] ? { id: src.batchId, ...batchesObj[src.batchId] } : null);
                        const archB = archBatchByName[src.label];
                        const bObj = liveB || archB || {};

                        // حساب مخزن ومذبوح لحم السمان فقط في الدفعة
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

                        let extrasLine = '';
                        if (src.soldChickUnits > 0 || src.soldEggUnits > 0) {
                            extrasLine = `<div class="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex justify-between">
                                <span>🐣 كتاكيت بالدفعة: ${src.soldChickUnits}</span>
                                <span>🥚 أطباق بيض: ${src.soldEggUnits}</span>
                            </div>`;
                        }

                        balanceHtml = `
                        <div class="grid grid-cols-2 gap-1.5 text-[10px] font-black bg-white p-2 rounded-xl border border-slate-200/70">
                            <div class="text-emerald-700">✅ محصل: ${src.collectedRevenue.toLocaleString()} ج (${src.completedCount})</div>
                            <div class="text-blue-600 text-left">⏳ قيد التحصيل: ${src.pendingRevenue.toLocaleString()} ج (${src.activeCount})</div>
                        </div>
                        <div class="grid grid-cols-4 gap-1 text-center bg-white p-2 rounded-xl border border-slate-200/60 text-[10px] font-black">
                            <div><span class="text-slate-400 block text-[9px]">العدد الكلي</span><span class="text-slate-700">${actualTarget || '-'}</span></div>
                            <div><span class="text-slate-400 block text-[9px]">المذبوح</span><span class="text-indigo-600">${meatSlaughteredTotal || '-'}</span></div>
                            <div><span class="text-slate-400 block text-[9px]">المباع (سمان)</span><span class="text-emerald-600">${Number(src.soldMeatUnits.toFixed(1))}</span></div>
                            <div><span class="text-rose-400 block text-[9px]">هالك/فاقد</span><span class="text-rose-600">${totalShrinkage}</span></div>
                        </div>
                        ${extrasLine}
                        ${batchExp > 0 ? `<div class="text-[10px] font-black text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg flex justify-between"><span>مصاريف الدفعة: ${batchExp.toLocaleString()} ج</span><span>صافيها: ${(src.productsSubTotal - batchExp).toLocaleString()} ج</span></div>` : ''}
                        `;

                        if (liveB) {
                            const statusLabel = liveB.isOpen ? 'مفتوحة للحجز' : 'مغلقة الحجز';
                            actionBtnHtml = `
                            <div class="flex flex-wrap justify-between items-center gap-1 pt-2 mt-1 border-t border-slate-200/60">
                                <span class="text-[10px] font-black ${liveB.isOpen ? 'text-emerald-600' : 'text-amber-600'}">● ${statusLabel}</span>
                                <div class="flex gap-1">
                                    <button onclick="event.stopPropagation(); openLedgerEntryBox('waste', '${src.label}')" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 px-2 py-1 rounded-lg text-[10px] font-black transition-all" title="تسجيل هالك أو بايظ لهذه الدفعة">+ هالك</button>
                                    <button onclick="event.stopPropagation(); archiveBatch('${liveB.id}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm transition-all">
                                        <i class="fa-solid fa-box-archive mr-0.5"></i> أرشفة الدفعة
                                    </button>
                                </div>
                            </div>`;
                        } else if (archB) {
                            actionBtnHtml = `
                            <div class="flex justify-between items-center pt-2 mt-1 border-t border-slate-200/60">
                                <span class="text-[10px] font-black text-slate-400">📦 محفوظة في الأرشيف</span>
                                <button onclick="event.stopPropagation(); openArchiveReport('${archB.id}')" class="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm transition-all">
                                    تقرير الأرشيف / استعادة
                                </button>
                            </div>`;
                        }
                    } else {
                        balanceHtml = `
                        <div class="grid grid-cols-2 gap-1.5 text-[10px] font-black bg-white p-2 rounded-xl border border-slate-200/70">
                            <div class="text-emerald-700">✅ محصل: ${src.collectedRevenue.toLocaleString()} ج (${src.completedCount})</div>
                            <div class="text-blue-600 text-left">⏳ قيد التحصيل: ${src.pendingRevenue.toLocaleString()} ج (${src.activeCount})</div>
                        </div>`;
                    }

                    return `
                    <div onclick="updateDashState('sourceFilter', '${src.filterKey}')" class="p-4 rounded-2xl ${borderClass} cursor-pointer transition-all shadow-sm flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <span class="font-black text-slate-800 text-xs flex items-center gap-1.5">
                                <i class="fa-solid ${src.isBatch ? 'fa-layer-group text-teal-600' : 'fa-bolt text-amber-500'}"></i>
                                ${src.label}
                            </span>
                            <div class="text-left">
                                <span class="text-base font-black text-brand-primary block">${src.totalBatchSales.toLocaleString()} ج</span>
                                <span class="text-[9px] font-bold text-slate-400 block">إجمالي الدفعة (${src.totalValidCount} طلب)</span>
                            </div>
                        </div>
                        ${balanceHtml}
                        <div class="flex flex-wrap justify-between items-center text-[10px] font-bold text-slate-500 pt-1">
                            <span>منتجات صافي: ${src.productsSubTotal.toLocaleString()} ج</span>
                            <span class="text-red-600">🎁 خصومات: ${src.discounts.toLocaleString()} ج</span>
                        </div>
                        ${actionBtnHtml}
                    </div>`;
                }).join('');
            }
        }

        // 11. رسم جرد الأصناف المباعة
        const itemsGrid = document.getElementById('sm-dash-items-grid');
        if (itemsGrid) {
            const sortedItems = Object.keys(itemsSoldMap).sort((a, b) => itemsSoldMap[b].revenue - itemsSoldMap[a].revenue);
            if (sortedItems.length === 0) {
                itemsGrid.innerHTML = `<div class="col-span-full text-center py-6 text-slate-400 text-xs font-bold">لا توجد أصناف مسجلة في هذه الفترة.</div>`;
            } else {
                itemsGrid.innerHTML = sortedItems.map(itemName => {
                    const info = itemsSoldMap[itemName];
                    const avgP = info.qty > 0 ? Math.round(info.revenue / info.qty) : 0;
                    return `
                    <div class="bg-slate-50 border border-slate-200/70 p-3.5 rounded-2xl text-center shadow-sm flex flex-col justify-between">
                        <span class="text-[11px] font-black text-slate-700 mb-1 leading-snug flex flex-col items-center justify-center gap-1">
                            <span>${itemName}</span>
                            ${info.type === 'egg' ? '<span class="bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded text-[9px]">(بيض 🥚)</span>' :
                              info.type === 'chick' ? '<span class="bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded text-[9px]">(كتاكيت 🐣)</span>' :
                              '<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded text-[9px]">(لحم 🥩)</span>'}
                        </span>
                        <div class="my-1">
                            <span class="text-2xl font-black text-brand-primary">${Number(info.qty.toFixed(2))}</span>
                            <span class="text-[10px] font-bold text-slate-400 block">${info.unitLabel} (بـ ${avgP} ج)</span>
                        </div>
                        <span class="bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-lg text-[11px] font-black">
                            ${Math.round(info.revenue).toLocaleString()} ج
                        </span>
                    </div>`;
                }).join('');
            }
        }

        // 12. رسم جدول سجل الطلبات التفصيلي
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
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-slate-400 font-bold">لا توجد طلبات مطابقة لهذا الفلتر في الفترة المحددة.</td></tr>`;
            } else {
                tbody.innerHTML = tableOrders.map(o => {
                    const fin = window.getAccurateOrderFinancials(o);
                    const itemsBadges = (o.items && Array.isArray(o.items))
                        ? o.items.map(i => `<span class="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold inline-block m-0.5">${i.quantity}x ${i.name} (${i.price}ج)</span>`).join('')
                        : '-';

                    const totalD = fin.discount + fin.implicitDiscount;
                    let discBadge = '<span class="text-slate-300">-</span>';
                    if (totalD > 0) {
                        discBadge = `<span class="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg font-black text-[11px]">-${totalD} ج</span>`;
                        if (fin.implicitDiscount > 0 && fin.discount > 0) {
                            discBadge += `<span class="block text-[9px] text-red-400 mt-0.5">(${fin.discount} فاتورة + ${fin.implicitDiscount} واجب)</span>`;
                        } else if (fin.implicitDiscount > 0) {
                            discBadge += `<span class="block text-[9px] text-amber-600 mt-0.5">(فرق سعر قديم/واجب)</span>`;
                        }
                    }

                    const resolvedBName = window.resolveOrderBatchName(o);
                    const batchLabel = resolvedBName
                        ? `<span class="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-lg text-[10px] font-black block mb-0.5">${resolvedBName}</span>`
                        : `<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[10px] font-bold block mb-0.5">فوري</span>`;

                    const statusBadge = o.status === 'completed'
                        ? `<span class="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-black">✅ مكتمل</span>`
                        : (o.status === 'canceled' ? `<span class="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-black">❌ ملغي</span>` : `<span class="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black">⏳ قيد التسليم</span>`);

                    const dObj = parseOrderDateObj(o, window.dashState.dateBasis);
                    const dateFormatted = dObj ? dObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : (o.orderDate || '-');

                    const payBadge = o.paymentMethod === 'online'
                        ? `<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black block mt-0.5">أونلاين</span>`
                        : `<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold block mt-0.5">كاش</span>`;

                    return `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                        <td class="py-3 px-4">
                            <div onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 cursor-pointer hover:text-brand-primary">${o.customerName || 'بدون اسم'}</div>
                            <div class="text-[10px] text-slate-400 font-bold" dir="ltr">${o.customerPhone || ''} • ${o.zone || ''}</div>
                        </td>
                        <td class="py-3 px-4 text-center">${batchLabel}${statusBadge}</td>
                        <td class="py-3 px-4 text-center whitespace-normal min-w-[220px]">${itemsBadges}</td>
                        <td class="py-3 px-4 text-center font-bold text-slate-700">${fin.subtotal} ج</td>
                        <td class="py-3 px-4 text-center font-bold text-indigo-600">${fin.delivery} ج</td>
                        <td class="py-3 px-4 text-center">${discBadge}</td>
                        <td class="py-3 px-4 text-center">
                            <span class="font-black text-brand-primary text-sm">${fin.total} ج</span>
                            ${payBadge}
                        </td>
                        <td class="py-3 px-4 text-center text-[11px] font-bold text-slate-500">${dateFormatted}</td>
                        <td class="py-3 px-4 text-center">
                            <button onclick="openEditOrderModal('${o.id}')" class="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm">فتح</button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }

        // 13. رسم جدول سجل المصروفات والهالك
        const ledgerTbody = document.getElementById('sm-ledger-records-tbody');
        if (ledgerTbody) {
            const sortedRecs = [...periodLedgerRecords].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
            if (sortedRecs.length === 0) {
                ledgerTbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 font-bold">لا توجد مصروفات أو سجلات هالك مسجلة في هذه الفترة.</td></tr>`;
            } else {
                ledgerTbody.innerHTML = sortedRecs.map(r => {
                    const isWaste = r.type === 'waste';
                    const typeBadge = isWaste
                        ? `<span class="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg font-black">⚠️ ${r.category || 'هالك/بايظ'}</span>`
                        : `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg font-black">💸 ${r.category || 'مصروف'}</span>`;
                    const qtyStr = isWaste ? `${r.qty || 0} × ${r.productName || 'سمان'}` : (r.paymentSource === 'online' ? '💳 محفظة أونلاين' : '💵 خزنة الكاش');
                    const dStr = r.createdAtMs ? new Date(r.createdAtMs).toLocaleDateString('ar-EG') : (r.dateStr || '-');

                    return `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-3 px-4">${typeBadge}</td>
                        <td class="py-3 px-4 text-center font-bold text-teal-700">${r.batchName || 'عام'}</td>
                        <td class="py-3 px-4 text-center font-black text-slate-700">${qtyStr}</td>
                        <td class="py-3 px-4 text-center font-black ${isWaste ? 'text-rose-600' : 'text-amber-700'}">${(Number(r.amount) || 0).toLocaleString()} ج</td>
                        <td class="py-3 px-4 font-bold text-slate-500">${r.notes || '-'}</td>
                        <td class="py-3 px-4 text-center text-slate-400 font-bold">${dStr}</td>
                        <td class="py-3 px-4 text-center">
                            <button onclick="deleteLedgerRecord('${r.id}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg font-black"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`;
                }).join('');
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
                vipCont.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs font-bold">ممتاز! كل عملائك المميزين (VIP) نشطون في الطلبات الأخيرة.</div>`;
            } else {
                vipCont.innerHTML = absentVips.map(c => {
                    const p = typeof window.normalizePhone === 'function' ? window.normalizePhone(c.phone) : c.phone;
                    const lastMs = lastOrderMsByPhone[p] || 0;
                    const daysAgo = lastMs > 0 ? Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24)) : 'أرشيف قديم';
                    const waPhone = (c.phone || '').startsWith('0') ? '2' + c.phone : c.phone;
                    const waMsg = encodeURIComponent(`أهلاً بحضرتك يا ${c.name || 'فندم'} في سمان ههيا 🌹\nوحشتنا طلباتك! بنفكرك إن دفعة السمان الفريش الجديدة جاهزة، تحب نحجز لحضرتك نصيبك فيها؟`);

                    return `
                    <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 flex justify-between items-center gap-3">
                        <div>
                            <div onclick="openCustomerCard('${c.phone}')" class="font-black text-slate-800 text-xs cursor-pointer hover:text-brand-primary">${c.name || 'عميل مميز'} <span class="text-amber-600">(${c.ordersCount || 0} طلبات • ${(Number(c.totalSpent) || 0).toLocaleString()} ج)</span></div>
                            <div class="text-[10px] font-bold text-slate-400 mt-0.5">${c.zone || ''} • غائب منذ: <strong class="text-rose-600">${typeof daysAgo === 'number' ? daysAgo + ' يوم' : daysAgo}</strong></div>
                        </div>
                        <a href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" class="bg-[#25D366] hover:bg-green-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm flex items-center gap-1 shrink-0">
                            <i class="fa-brands fa-whatsapp text-sm"></i> استرجاع
                        </a>
                    </div>`;
                }).join('');
            }
        }

        // 15. رسم تحليل ربحية المناطق والمناديب
        const zonesCont = document.getElementById('sm-zones-profit-list');
        if (zonesCont) {
            const sortedZones = Object.values(zoneStatsMap).filter(z => z.count > 0 || z.canceled > 0).sort((a, b) => b.revenue - a.revenue);
            const sortedDrivers = Object.values(driverStatsMap).sort((a, b) => b.revenue - a.revenue);

            let zh = '';
            if (sortedDrivers.length > 0) {
                zh += `<div class="text-[11px] font-black text-indigo-700 mb-1">🛵 أداء المناديب في الفترة:</div>`;
                zh += sortedDrivers.map(d => `
                    <div class="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 flex justify-between items-center text-xs font-black">
                        <span class="text-indigo-950">${d.name}</span>
                        <span class="text-emerald-700">${d.completed} طلب مسلم (${d.revenue.toLocaleString()} ج)</span>
                    </div>
                `).join('');
                zh += `<div class="my-3 border-t border-slate-100"></div>`;
            }

            zh += `<div class="text-[11px] font-black text-slate-700 mb-1">📍 ترتيب المناطق حسب المبيعات:</div>`;
            if (sortedZones.length === 0) {
                zh += `<div class="text-center py-8 text-slate-400 text-xs font-bold">لا توجد بيانات مناطق في هذه الفترة.</div>`;
            } else {
                zh += sortedZones.map(z => `
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/70 flex justify-between items-center text-xs">
                        <div>
                            <span class="font-black text-slate-800">${z.name}</span>
                            <span class="text-[10px] font-bold text-slate-400 mr-2">(📦 ${z.count} طلب ${z.canceled > 0 ? '• ❌ ' + z.canceled + ' ملغي' : ''})</span>
                        </div>
                        <span class="font-black text-brand-primary">${z.revenue.toLocaleString()} ج</span>
                    </div>
                `).join('');
            }
            zonesCont.innerHTML = zh;
        }
    };

    // طباعة التقرير المالي الشامل للفترة
    window.printSmartDashboardReport = function () {
        const periodTitle = document.getElementById('dash-active-period-badge')?.innerText || 'تقرير المبيعات';
        const totalRev = document.getElementById('sm-dash-total-revenue')?.innerText || '0';
        const prodRev = document.getElementById('sm-dash-products-revenue')?.innerText || '0';
        const netProfit = document.getElementById('sm-dash-true-net-profit')?.innerText || '0';
        const discTotal = document.getElementById('sm-dash-discounts-total')?.innerText || '0';
        const delRev = document.getElementById('sm-dash-delivery-revenue')?.innerText || '0';
        const compCount = document.getElementById('sm-dash-completed-count')?.innerText || '0';
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
                    .box { flex: 1; min-width: 130px; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 10px; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; }
                    th { background: #f1f5f9; font-weight: 900; }
                    button { display: none !important; }
                </style>
            </head>
            <body>
                <h2>سمان ههيا — التقرير المالي والتحليلي الشامل</h2>
                <p class="sub">الفترة: ${periodTitle} | تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>
                <div class="summary">
                    <div class="box"><strong>إجمالي المبيعات</strong><br>${totalRev}</div>
                    <div class="box"><strong>إيراد المنتجات</strong><br>${prodRev}</div>
                    <div class="box"><strong>صافي الربح الفعلي</strong><br>${netProfit}</div>
                    <div class="box"><strong>إجمالي الخصومات</strong><br>${discTotal}</div>
                    <div class="box"><strong>إيراد التوصيل</strong><br>${delRev}</div>
                    <div class="box"><strong>الطلبات</strong><br>${compCount}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>العميل والمنطقة</th>
                            <th>الدفعة</th>
                            <th>الأصناف</th>
                            <th>المنتجات</th>
                            <th>التوصيل</th>
                            <th>الخصم</th>
                            <th>الصافي</th>
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
    // 🔌 سابعاً: ترقية نافذة الفريزر والتحديد الجماعي والربط التلقائي
    // =========================================================================

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

    // حماية التحديد الجماعي (bulkChangeStatus) ليسجل تاريخ الاكتمال ويمنع نزول الفريزر للسالب
    const _origBulkChangeStatus = window.bulkChangeStatus;
    if (typeof _origBulkChangeStatus === 'function') {
        window.bulkChangeStatus = async function (newStatus) {
            await _origBulkChangeStatus(newStatus);
            await window.sanitizeFreezerNegativeValues(false);
        };
    }

    function bootSmartEngine() {
        window.initSmartDashboardLayout();
        setTimeout(() => {
            window.sanitizeFreezerNegativeValues(false);
            window.loadAllArchivedBatchesSafe();
            window.loadLedgerRecordsSafe();
            window.renderSmartDashboard();
        }, 450);
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
            if (tabId === 'archive') window.renderArchiveUI();
        };
    }
})();
