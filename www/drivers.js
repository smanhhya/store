// =========================================================================
// 🛵 المحرك الموحد للمناديب، التوجيه، الرادار الحي، وتقفيل العهدة (www/drivers.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// =========================================================================

(function () {
    window.reconShowHistory = false;

    // دالة مطابقة ذكية للمندوب (تطابق بالاسم أو برقم الهاتف معاً لحل مشكلة اختلاف القوائم)
    function isOrderForDriver(order, driverIdentifier) {
        if (!order || !driverIdentifier) return false;
        const cleanId = driverIdentifier.toString().trim();
        const normIdPhone = window.normalizePhone ? window.normalizePhone(cleanId) : cleanId;

        const driversList = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
        const matchedDriverObj = driversList.find(d =>
            (d.name && d.name.trim() === cleanId) ||
            (d.phone && (window.normalizePhone ? window.normalizePhone(d.phone) : d.phone.trim()) === normIdPhone && normIdPhone !== '')
        );

        const targetName = matchedDriverObj ? (matchedDriverObj.name || '').trim() : cleanId;
        const targetPhone = matchedDriverObj ? (window.normalizePhone ? window.normalizePhone(matchedDriverObj.phone) : '') : normIdPhone;

        const oName = (order.driverName || '').trim();
        const oPhone = window.normalizePhone ? window.normalizePhone(order.driverPhone || '') : (order.driverPhone || '').trim();

        if (targetName && oName && targetName === oName) return true;
        if (targetPhone && oPhone && targetPhone === oPhone) return true;
        return false;
    }

    // 1. إصلاح الانتقال السريع من شاشة "رادار المناديب" إلى "تقفيل العهدة"
    window.jumpToDriverRecon = function (driverPhoneOrName) {
        const reconBtn = document.querySelector('button[onclick*="switchTab(\'reconciliation\'"]');
        if (reconBtn && typeof window.switchTab === 'function') {
            window.switchTab('reconciliation', reconBtn);
        }

        setTimeout(() => {
            window.renderReconciliationUI();
            const sel = document.getElementById('recon-driver-select');
            if (!sel) return;

            const normTarget = window.normalizePhone ? window.normalizePhone(driverPhoneOrName) : driverPhoneOrName;
            const driversList = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
            const foundDrv = driversList.find(d =>
                (d.name && d.name.trim() === driverPhoneOrName.trim()) ||
                (d.phone && (window.normalizePhone ? window.normalizePhone(d.phone) : d.phone) === normTarget)
            );

            if (foundDrv && foundDrv.name) {
                sel.value = foundDrv.name;
            } else {
                // محاولة اختيار الخيار المطابق
                Array.from(sel.options).forEach(opt => {
                    if (opt.value === driverPhoneOrName || opt.text.includes(driverPhoneOrName)) {
                        sel.value = opt.value;
                    }
                });
            }
            window.calculateDriverReconciliation();
        }, 120);
    };

    // 2. رسم قائمة شاشة تقفيل عهدة المناديب (تشمل المناديب المسجلين + أي مندوب لديه عهدة مفتوحة)
    window.renderReconciliationUI = function () {
        const selectEl = document.getElementById('recon-driver-select');
        if (!selectEl) return;

        const currentSelectedDriver = selectEl.value;
        const driversMap = {};

        (storeSettings?.drivers || []).forEach(d => {
            if (d && d.name) driversMap[d.name.trim()] = { name: d.name.trim(), phone: d.phone || '', openCount: 0 };
        });

        (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (!['dispatched', 'completed'].includes(o.status)) return;
            if (o.isReconciled || o.isSupplied) return;
            const dName = (o.driverName || '').trim();
            if (!dName) return;
            if (!driversMap[dName]) driversMap[dName] = { name: dName, phone: o.driverPhone || '', openCount: 0 };
            driversMap[dName].openCount++;
        });

        selectEl.innerHTML = '<option value="">-- اختر المندوب لحساب عهدته وتصفية الوردية --</option>';
        Object.values(driversMap).forEach(d => {
            const countBadge = d.openCount > 0 ? ` — [عهدة مفتوحة: ${d.openCount} طلب]` : ' — [خالصة ✅]';
            selectEl.innerHTML += `<option value="${d.name}" ${currentSelectedDriver === d.name ? 'selected' : ''}>🛵 ${d.name} (${d.phone || 'بدون رقم'})${countBadge}</option>`;
        });

        if (currentSelectedDriver) {
            window.calculateDriverReconciliation();
        }
    };

    window.toggleReconHistoryView = function (checked) {
        window.reconShowHistory = checked;
        window.calculateDriverReconciliation();
    };

    // 3. حاسبة تقفيل عهدة المندوب المطورة (تستبعد الطلبات التي تم تقفيلها سابقاً + تحسب الصافي بعد عمولة التوصيل)
    window.calculateDriverReconciliation = function () {
        const driverName = document.getElementById('recon-driver-select')?.value;
        const container = document.getElementById('recon-details-container');
        const settleBtn = document.getElementById('btn-settle-recon');
        if (!container || !settleBtn) return;

        if (!driverName) {
            container.innerHTML = '<div class="text-center py-10 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl bg-white">برجاء اختيار مندوب لعرض تفاصيل عهدته المالية.</div>';
            settleBtn.classList.add('hidden');
            return;
        }

        const allDriverOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            o && o.status !== 'trash' &&
            isOrderForDriver(o, driverName) &&
            (o.status === 'dispatched' || o.status === 'completed')
        );

        // الطلبات غير المصفاة فقط (إلا إذا فعل المستخدم خيار إظهار السجل المصفى)
        const activeCustodyOrders = allDriverOrders.filter(o => !o.isReconciled && !o.isSupplied);
        const settledHistoryOrders = allDriverOrders.filter(o => o.isReconciled || o.isSupplied);
        const ordersToDisplay = window.reconShowHistory ? allDriverOrders : activeCustodyOrders;

        if (activeCustodyOrders.length === 0 && !window.reconShowHistory) {
            container.innerHTML = `
                <div class="text-center py-12 bg-white border-2 border-dashed border-emerald-200 rounded-2xl space-y-3">
                    <div class="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl"><i class="fa-solid fa-check-double"></i></div>
                    <h4 class="font-black text-slate-800 text-base">عهدة المندوب (${driverName}) خالصة ومصفاة بالكامل! ✅</h4>
                    <p class="text-xs font-bold text-slate-400">لا توجد أي طلبات معلقة أو مبالغ غير موردة في ذمة هذا المندوب حالياً.</p>
                    ${settledHistoryOrders.length > 0 ? `
                    <button onclick="toggleReconHistoryView(true)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-black transition-all">
                        👁️ عرض سجل الطلبات المصفاة سابقاً (${settledHistoryOrders.length} طلب)
                    </button>` : ''}
                </div>`;
            settleBtn.classList.add('hidden');
            return;
        }

        let totalGrossCash = 0;      // إجمالي الكاش شامل التوصيل
        let totalDeliveryFees = 0;   // إجمالي رسوم التوصيل (عمولة المندوب)
        let totalOnlineCount = 0;
        let totalCashCount = 0;
        let ordersHtml = '';

        activeCustodyOrders.forEach(o => {
            const isOnline = (o.paymentMethod === 'online');
            const orderTotal = Number(o.total) || 0;
            const delFee = Number(o.deliveryFee) || 0;

            if (!isOnline) {
                totalGrossCash += orderTotal;
                totalCashCount++;
            } else {
                totalOnlineCount++;
            }
            totalDeliveryFees += delFee;
        });

        const netAfterDriverFee = Math.max(0, totalGrossCash - totalDeliveryFees);

        ordersToDisplay.forEach((o, index) => {
            const isOnline = (o.paymentMethod === 'online');
            const isSettled = Boolean(o.isReconciled || o.isSupplied);
            const orderTotal = Number(o.total) || 0;
            const delFee = Number(o.deliveryFee) || 0;

            const badgeStatus = isSettled
                ? '<span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-black">تم التوريد والتقفيل ✅</span>'
                : (o.status === 'completed'
                    ? '<span class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-black border border-emerald-100">تم التسليم (بالعهدة)</span>'
                    : '<span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black border border-indigo-100">في الطريق مع المندوب</span>');

            const paymentBadge = isOnline
                ? '<span class="bg-emerald-500 text-white px-2 py-0.5 rounded text-[9px] font-black">خالص أونلاين 💳</span>'
                : '<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-black">كاش 💵</span>';

            ordersHtml += `
            <div class="bg-white p-4 rounded-2xl border ${isSettled ? 'border-slate-200 opacity-60' : (isOnline ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200/80')} shadow-sm mb-2.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="text-xs font-black text-slate-400">#${index + 1}</span>
                        <h5 onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary">${o.customerName || 'عميل'}</h5>
                        ${badgeStatus}
                        ${paymentBadge}
                    </div>
                    <p class="text-[11px] font-bold text-slate-500"><i class="fa-solid fa-location-dot text-indigo-400 mr-1"></i> ${o.zone || ''} - ${o.customerAddress || ''}</p>
                    <p class="text-[10px] text-slate-400 font-bold mt-0.5" dir="ltr">📞 ${o.customerPhone || ''} • شحن: ${delFee} ج</p>
                </div>
                <div class="text-left flex flex-col items-end w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                    <span class="text-[10px] font-bold text-slate-400">المطلوب من العميل</span>
                    <span class="font-black ${isOnline ? 'text-emerald-600' : 'text-brand-primary'} text-lg">${isOnline ? '0 ج (أونلاين)' : orderTotal + ' ج.م'}</span>
                </div>
            </div>`;
        });

        container.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <span class="text-xs font-black text-slate-700">📊 ملخص العهدة المفتوحة للمندوب: <strong class="text-brand-primary">${driverName}</strong></span>
                <label class="flex items-center gap-1.5 text-[11px] font-black text-slate-500 cursor-pointer">
                    <input type="checkbox" ${window.reconShowHistory ? 'checked' : ''} onchange="toggleReconHistoryView(this.checked)" class="w-4 h-4 accent-brand-primary rounded">
                    إظهار المصفى سابقاً (${settledHistoryOrders.length})
                </label>
            </div>

            <!-- كروت ملخص العهدة (4 مؤشرات دقيقة) -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
                    <p class="text-[10px] font-bold text-slate-400 mb-1">أوردرات العهدة الحالية</p>
                    <p class="text-xl font-black text-slate-800">${activeCustodyOrders.length} <span class="text-xs text-slate-400">(${totalCashCount} كاش / ${totalOnlineCount} أونلاين)</span></p>
                </div>
                <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
                    <p class="text-[10px] font-bold text-slate-400 mb-1">إجمالي الكاش (شامل الشحن)</p>
                    <p class="text-xl font-black text-brand-primary">${totalGrossCash.toLocaleString()} ج</p>
                </div>
                <div class="bg-white p-4 rounded-2xl border border-sky-200 shadow-sm text-center">
                    <p class="text-[10px] font-bold text-sky-700 mb-1">إجمالي شحن المندوب</p>
                    <p class="text-xl font-black text-sky-600">${totalDeliveryFees.toLocaleString()} ج</p>
                </div>
                <div class="bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-sm text-center">
                    <p class="text-[10px] font-black text-amber-800 mb-1">الصافي بعد خصم الشحن</p>
                    <p class="text-xl font-black text-amber-600">${netAfterDriverFee.toLocaleString()} ج</p>
                </div>
            </div>

            <!-- حاسبة مطابقة الخزنة المرنة -->
            <div class="bg-slate-900 text-white p-5 rounded-2xl shadow-lg mb-4 space-y-3">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h4 class="font-black text-sm text-amber-400 mb-1"><i class="fa-solid fa-calculator mr-1"></i> مطابقة الخزنة الفعلية مع المندوب</h4>
                        <p class="text-[11px] text-slate-300 font-bold">اختر طريقة المحاسبة أو اكتب المبلغ النقدي المستلم فعلياً:</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" onclick="document.getElementById('actual-collected-cash').value='${totalGrossCash}'; checkCashDifference(${totalGrossCash});" class="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl text-[10px] font-black border border-white/15">استلام الكل (${totalGrossCash} ج)</button>
                        <button type="button" onclick="document.getElementById('actual-collected-cash').value='${netAfterDriverFee}'; checkCashDifference(${netAfterDriverFee});" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded-xl text-[10px] font-black border border-amber-400/30">استلام الصافي بعد الشحن (${netAfterDriverFee} ج)</button>
                        <input type="number" id="actual-collected-cash" value="${totalGrossCash}" oninput="checkCashDifference(${totalGrossCash})" class="w-32 bg-slate-800 border-2 border-slate-700 rounded-xl p-2.5 text-center font-black text-white text-base outline-none focus:border-amber-400 transition-all">
                    </div>
                </div>
            </div>
            <div id="cash-diff-alert" class="mb-4 text-center text-xs font-black"></div>

            <!-- قائمة أوردرات العهدة -->
            <div class="space-y-2 max-h-[48vh] overflow-y-auto custom-scroll pr-1">
                ${ordersHtml}
            </div>
        `;

        if (activeCustodyOrders.length > 0) {
            settleBtn.classList.remove('hidden');
            settleBtn.onclick = () => window.confirmAndSettleDriverReconciliation(driverName, totalGrossCash);
        } else {
            settleBtn.classList.add('hidden');
        }
    };

    // 4. تأكيد استلام النقدية وتقفيل العهدة (يعلّم الطلبات بـ isReconciled + isSupplied لتختفي فوراً من الرادار والتقفيل)
    window.confirmAndSettleDriverReconciliation = async function (driverName, expectedCash) {
        const actualInput = document.getElementById('actual-collected-cash');
        const actualCash = actualInput ? (Number(actualInput.value) || 0) : expectedCash;

        const targetOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            o && o.status !== 'trash' &&
            isOrderForDriver(o, driverName) &&
            (o.status === 'dispatched' || o.status === 'completed') &&
            !o.isReconciled && !o.isSupplied
        );

        if (targetOrders.length === 0) return alert('لا توجد طلبات مفتوحة في عهدة هذا المندوب!');

        if (!confirm(`✅ تأكيد تصفية وتقفيل عهدة المندوب (${driverName})؟\n\n- عدد الطلبات: ${targetOrders.length} طلب\n- النقدية المستلمة للدرج: ${actualCash.toLocaleString()} ج.م\n\nسيتم تحويل الطلبات إلى (مكتمل) وإغلاق عهدتها في الرادار والتقفيل فوراً.`)) return;

        const btn = document.getElementById('btn-settle-recon');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تصفية العهدة وتحديث الخزنة...';
        btn.disabled = true;

        try {
            const nowStr = new Date().toLocaleDateString('en-US');
            const timeStr = new Date().toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const ptsPer100 = Number(storeSettings?.pointsPer100) || 5;

            for (let i = 0; i < targetOrders.length; i += 400) {
                const chunk = targetOrders.slice(i, i + 400);
                const batchProcess = db.batch();

                chunk.forEach(o => {
                    const ref = db.collection('orders').doc(o.id);
                    const wasCompleted = (o.status === 'completed');

                    batchProcess.update(ref, {
                        status: 'completed',
                        completedAtStr: o.completedAtStr || nowStr,
                        completedTimeDisplay: o.completedTimeDisplay || timeStr,
                        completedAt: o.completedAt || firebase.firestore.FieldValue.serverTimestamp(),
                        isReconciled: true,
                        isSupplied: true,
                        reconciledAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // إضافة نقاط الولاء للعميل إن لم يكن الطلب مكتملاً من قبل
                    if (!wasCompleted && o.customerPhone) {
                        const sub = Number(o.subtotal) || Number(o.total) || 0;
                        if (sub >= 100) {
                            const earnedPts = Math.floor(sub / 100) * ptsPer100;
                            if (earnedPts > 0) {
                                const cleanPhone = o.customerPhone.startsWith('0') ? o.customerPhone : '0' + o.customerPhone;
                                batchProcess.set(db.collection('customers').doc(cleanPhone), {
                                    walletPoints: firebase.firestore.FieldValue.increment(earnedPts)
                                }, { merge: true });
                            }
                        }
                    }

                    // تحديث الذاكرة الحية فوراً
                    o.status = 'completed';
                    o.completedAtStr = o.completedAtStr || nowStr;
                    o.completedTimeDisplay = o.completedTimeDisplay || timeStr;
                    o.isReconciled = true;
                    o.isSupplied = true;

                    if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                        globalOrdersMap[o.id].status = 'completed';
                        globalOrdersMap[o.id].completedAtStr = o.completedAtStr;
                        globalOrdersMap[o.id].completedTimeDisplay = o.completedTimeDisplay;
                        globalOrdersMap[o.id].isReconciled = true;
                        globalOrdersMap[o.id].isSupplied = true;
                    }
                });

                await batchProcess.commit();
            }

            window.renderReconciliationUI();
            window.calculateDriverReconciliation();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            if (typeof window.showToast === 'function') window.showToast(`🎉 تم تقفيل عهدة (${driverName}) واستلام ${actualCash.toLocaleString()} ج!`);
            alert(`تم تقفيل عهدة المندوب (${driverName}) بنجاح!\nتم إغلاق ${targetOrders.length} طلب وتوريد النقدية لخزنة اليوم. 🎉`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ تصفية العهدة في قاعدة البيانات!');
        }

        btn.innerHTML = origHtml;
        btn.disabled = false;
    };
})();
