// =========================================================================
// 🛵 المحرك الموحد للمناديب، التوجيه، الرادار الحي، وتقفيل العهدة الذكي (www/drivers.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// ربط كامل 100% بين: تطبيق المندوب (كاش / تحويل / جزء وجزء) ↔ تقفيل العهدة ↔ لوحة القيادة
// =========================================================================

(function () {
    window.reconShowHistory = false;
    window.reconOpenSplitOrderId = null;
    window.reconSelectedOrderIds = null; // null = تحديد تلقائي (المسلمة أولاً وإلا في الطريق)
    window._reconLastDriverKey = '';

    function escAttr(str) {
        return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // حساب صافي قيمة المنتجات للمالك (بدون مصاريف التوصيل) للتطابق التام مع dashboard.js
    function getOwnerNetProductTotal(order) {
        if (!order) return 0;
        if (typeof window.getAccurateOrderFinancials === 'function') {
            return window.getAccurateOrderFinancials(order).total;
        }
        const rawTotal = Number(order.total) || 0;
        const delFee = Number(order.deliveryFee) || 0;
        const discount = Number(order.discount) || 0;
        const rawSub = Number(order.subtotal);
        const subtotal = (!isNaN(rawSub) && rawSub > 0) ? rawSub : Math.max(0, rawTotal - delFee + discount);
        return Math.max(0, Math.round(subtotal - discount));
    }

    // قراءة تفصيلة دفع الطلب الواحد (شامل الشحن للمندوب + صافي المنتجات للداش بورد)
    window.getOrderPaymentBreakdown = function (order) {
        if (!order) return { method: 'cash', cash: 0, online: 0, total: 0, netCash: 0, netOnline: 0, netTotal: 0 };
        const total = Math.round(Number(order.total) || 0);
        const netTotal = getOwnerNetProductTotal(order);
        const method = order.paymentMethod || 'cash';

        if (method === 'online') {
            return { method: 'online', cash: 0, online: total, total: total, netCash: 0, netOnline: netTotal, netTotal: netTotal };
        }
        if (method === 'split') {
            let cashPart = (order.paidCash !== undefined && order.paidCash !== null) ? Number(order.paidCash) : Math.round(total / 2);
            if (cashPart < 0) cashPart = 0;
            if (cashPart > total) cashPart = total;
            let onlinePart = (order.paidOnline !== undefined && order.paidOnline !== null) ? Number(order.paidOnline) : Math.max(0, total - cashPart);
            if (Math.abs((cashPart + onlinePart) - total) > 1) {
                onlinePart = Math.max(0, total - cashPart);
            }

            let netOnline = (order.settledOnline !== undefined && order.settledOnline !== null)
                ? Math.min(netTotal, Math.max(0, Number(order.settledOnline) || 0))
                : Math.min(netTotal, onlinePart);
            let netCash = Math.max(0, netTotal - netOnline);

            return { method: 'split', cash: Math.round(cashPart), online: Math.round(onlinePart), total: total, netCash: Math.round(netCash), netOnline: Math.round(netOnline), netTotal: netTotal };
        }
        return { method: 'cash', cash: total, online: 0, total: total, netCash: netTotal, netOnline: 0, netTotal: netTotal };
    };

    // إظهار أو إخفاء خانات التقسيم (نص ونص) داخل نافذة إضافة طلب أو تعديل طلب
    window.toggleOrderSplitBox = function (prefix) {
        const sel = document.getElementById(`${prefix}-payment-method`);
        const box = document.getElementById(`${prefix}-split-box`);
        const totalInput = document.getElementById(`${prefix}-total`);
        const cashInput = document.getElementById(`${prefix}-paid-cash`);
        const onlineInput = document.getElementById(`${prefix}-paid-online`);
        if (!sel || !box) return;

        const total = Number(totalInput?.value) || 0;
        if (sel.value === 'split') {
            box.classList.remove('hidden');
            let currentCash = Number(cashInput?.value) || 0;
            let currentOnline = Number(onlineInput?.value) || 0;
            if (currentCash + currentOnline !== total || (currentCash === 0 && currentOnline === 0 && total > 0)) {
                const half = Math.round(total / 2);
                if (cashInput) cashInput.value = half;
                if (onlineInput) onlineInput.value = Math.max(0, total - half);
            }
        } else {
            box.classList.add('hidden');
            if (sel.value === 'online') {
                if (cashInput) cashInput.value = 0;
                if (onlineInput) onlineInput.value = total;
            } else {
                if (cashInput) cashInput.value = total;
                if (onlineInput) onlineInput.value = 0;
            }
        }
    };

    // المزامنة التلقائية بين خانة الكاش وخانة الفيزا/المحفظة عند الكتابة
    window.syncOrderSplitInputs = function (prefix, changedSide) {
        const total = Number(document.getElementById(`${prefix}-total`)?.value) || 0;
        const cashInput = document.getElementById(`${prefix}-paid-cash`);
        const onlineInput = document.getElementById(`${prefix}-paid-online`);
        if (!cashInput || !onlineInput) return;

        if (changedSide === 'cash') {
            let cVal = Number(cashInput.value) || 0;
            if (cVal < 0) cVal = 0;
            if (cVal > total && total > 0) {
                cVal = total;
                cashInput.value = cVal;
            }
            onlineInput.value = Math.max(0, total - cVal);
        } else {
            let oVal = Number(onlineInput.value) || 0;
            if (oVal < 0) oVal = 0;
            if (oVal > total && total > 0) {
                oVal = total;
                onlineInput.value = oVal;
            }
            cashInput.value = Math.max(0, total - oVal);
        }
    };

    // ربط تلقائي آمن مع دوال فتح وتعديل وحفظ الطلبات في index.html
    function attachSplitPaymentHooks() {
        if (typeof window.calcTotal === 'function' && !window._calcTotalSplitHooked) {
            const origCalcTotal = window.calcTotal;
            window.calcTotal = function (prefix) {
                origCalcTotal(prefix);
                const sel = document.getElementById(`${prefix}-payment-method`);
                if (sel && sel.value === 'split') {
                    window.syncOrderSplitInputs(prefix, 'cash');
                }
            };
            window._calcTotalSplitHooked = true;
        }

        if (typeof window.calcEditTotal === 'function' && !window._calcEditTotalSplitHooked) {
            const origCalcEditTotal = window.calcEditTotal;
            window.calcEditTotal = function () {
                origCalcEditTotal();
                const sel = document.getElementById('edit-payment-method');
                if (sel && sel.value === 'split') {
                    window.syncOrderSplitInputs('edit', 'cash');
                }
            };
            window._calcEditTotalSplitHooked = true;
        }

        if (typeof window.openEditOrderModal === 'function' && !window._openEditSplitHooked) {
            const origOpenEdit = window.openEditOrderModal;
            window.openEditOrderModal = function (id) {
                origOpenEdit(id);
                const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === id);
                if (!order) return;
                const breakdown = window.getOrderPaymentBreakdown(order);
                const sel = document.getElementById('edit-payment-method');
                const cashInput = document.getElementById('edit-paid-cash');
                const onlineInput = document.getElementById('edit-paid-online');
                if (sel) sel.value = breakdown.method;
                if (cashInput) cashInput.value = breakdown.cash;
                if (onlineInput) onlineInput.value = breakdown.online;
                window.toggleOrderSplitBox('edit');
            };
            window._openEditSplitHooked = true;
        }

        if (typeof window.saveEditedOrder === 'function' && !window._saveEditedSplitHooked) {
            const origSaveEdited = window.saveEditedOrder;
            window.saveEditedOrder = async function () {
                const targetId = (typeof editingOrderData !== 'undefined' && editingOrderData) ? editingOrderData.id : null;
                const method = document.getElementById('edit-payment-method')?.value || 'cash';
                const total = Number(document.getElementById('edit-total')?.value) || 0;
                const delFee = Number(document.getElementById('edit-delivery')?.value) || 0;
                const netProdTotal = Math.max(0, total - delFee);

                let paidCash = total;
                let paidOnline = 0;
                let settledCash = netProdTotal;
                let settledOnline = 0;

                if (method === 'online') {
                    paidCash = 0;
                    paidOnline = total;
                    settledCash = 0;
                    settledOnline = netProdTotal;
                } else if (method === 'split') {
                    paidCash = Number(document.getElementById('edit-paid-cash')?.value) || 0;
                    paidOnline = Number(document.getElementById('edit-paid-online')?.value) || Math.max(0, total - paidCash);
                    settledOnline = Math.min(netProdTotal, paidOnline);
                    settledCash = Math.max(0, netProdTotal - settledOnline);
                }

                await origSaveEdited();

                if (targetId && typeof db !== 'undefined') {
                    try {
                        await db.collection('orders').doc(targetId).update({
                            paymentMethod: method,
                            paidCash: paidCash,
                            paidOnline: paidOnline,
                            settledCash: settledCash,
                            settledOnline: settledOnline
                        });
                        const localOrder = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === targetId);
                        if (localOrder) {
                            localOrder.paymentMethod = method;
                            localOrder.paidCash = paidCash;
                            localOrder.paidOnline = paidOnline;
                            localOrder.settledCash = settledCash;
                            localOrder.settledOnline = settledOnline;
                        }
                        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[targetId]) {
                            globalOrdersMap[targetId].paymentMethod = method;
                            globalOrdersMap[targetId].paidCash = paidCash;
                            globalOrdersMap[targetId].paidOnline = paidOnline;
                            globalOrdersMap[targetId].settledCash = settledCash;
                            globalOrdersMap[targetId].settledOnline = settledOnline;
                        }
                        if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
                        if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
                    } catch (e) {
                        console.error('Error updating split fields on edited order:', e);
                    }
                }
            };
            window._saveEditedSplitHooked = true;
        }
    }

    setTimeout(attachSplitPaymentHooks, 500);
    setTimeout(attachSplitPaymentHooks, 2000);

    // =====================================================================
    // ب. مطابقة المندوب وحساب العهدة المفتوحة (تشمل المسلّم من التطبيق + بالطريق)
    // =====================================================================
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

    function isDriverFinishedOrder(o) {
        return Boolean(o && (o.status === 'completed' || (o.status === 'dispatched' && o.driverDelivered === true)));
    }

    function isOrderOpenCustody(o) {
        if (!o || o.status === 'trash' || o.isArchived) return false;
        if (o.isReconciled === true) return false; // لا تُغلق العهدة لدى الإدارة إلا بتأكيد الأدمن
        if (o.deliveryType === 'pickup') return false;
        if (!o.driverName && !o.driverPhone) return false;
        return o.status === 'completed' || o.status === 'dispatched';
    }

    // 1. الانتقال السريع من شاشة "رادار المناديب" إلى "تقفيل العهدة"
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
                (d.name && d.name.trim() === String(driverPhoneOrName || '').trim()) ||
                (d.phone && (window.normalizePhone ? window.normalizePhone(d.phone) : d.phone) === normTarget)
            );

            if (foundDrv && foundDrv.name) {
                sel.value = foundDrv.name;
            } else {
                Array.from(sel.options).forEach(opt => {
                    if (opt.value === driverPhoneOrName || opt.text.includes(driverPhoneOrName)) {
                        sel.value = opt.value;
                    }
                });
            }
            window.reconSelectedOrderIds = null;
            window.calculateDriverReconciliation();
        }, 120);
    };

    // 2. رسم قائمة المناديب في شاشة تقفيل العهدة
    window.renderReconciliationUI = function () {
        const selectEl = document.getElementById('recon-driver-select');
        if (!selectEl) return;

        const currentSelectedDriver = selectEl.value;
        const driversMap = {};

        (storeSettings?.drivers || []).forEach(d => {
            if (d && d.name) {
                driversMap[d.name.trim()] = { name: d.name.trim(), phone: d.phone || '', completedOpen: 0, dispatchedOpen: 0, requestedSupply: 0, disputeOpen: 0 };
            }
        });

        (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
            if (!isOrderOpenCustody(o)) return;
            const dName = (o.driverName || '').trim() || (o.driverPhone || '').trim();
            if (!dName) return;

            // توحيد الاسم مع قائمة المناديب المسجلة لو التطابق برقم الهاتف
            let key = dName;
            const found = Object.values(driversMap).find(d => isOrderForDriver(o, d.name));
            if (found) key = found.name;
            else if (!driversMap[key]) driversMap[key] = { name: key, phone: o.driverPhone || '', completedOpen: 0, dispatchedOpen: 0, requestedSupply: 0, disputeOpen: 0 };

            if (o.customerDispute === true) driversMap[key].disputeOpen++;
            if (isDriverFinishedOrder(o)) {
                driversMap[key].completedOpen++;
                if (o.isSupplied === true) driversMap[key].requestedSupply++;
            } else if (o.status === 'dispatched') {
                driversMap[key].dispatchedOpen++;
            }
        });

        const driversArr = Object.values(driversMap).sort((a, b) =>
            (b.completedOpen * 10 + b.dispatchedOpen) - (a.completedOpen * 10 + a.dispatchedOpen)
        );

        let autoSelectedDriver = currentSelectedDriver;
        const firstOpenDriver = driversArr.find(d => (d.completedOpen + d.dispatchedOpen) > 0);
        if (!autoSelectedDriver && firstOpenDriver) {
            autoSelectedDriver = firstOpenDriver.name;
        } else if (autoSelectedDriver && driversMap[autoSelectedDriver] && (driversMap[autoSelectedDriver].completedOpen + driversMap[autoSelectedDriver].dispatchedOpen) === 0 && firstOpenDriver && !window.reconShowHistory) {
            autoSelectedDriver = firstOpenDriver.name;
        }

        selectEl.innerHTML = '<option value="">-- اختر المندوب لحساب عهدته وتصفية الوردية --</option>';
        driversArr.forEach(d => {
            const totalOpen = d.completedOpen + d.dispatchedOpen;
            let countBadge = ' — [خالصة ✅]';
            if (totalOpen > 0) {
                const parts = [];
                if (d.completedOpen > 0) parts.push(`${d.completedOpen} مُسلّم`);
                if (d.dispatchedOpen > 0) parts.push(`${d.dispatchedOpen} بالطريق`);
                countBadge = ` — [${parts.join(' + ')}${d.disputeOpen > 0 ? ` 🚨 ${d.disputeOpen} بلاغ` : ''}${d.requestedSupply > 0 ? ' 🔔 طلب توريد' : ''}]`;
            }
            selectEl.innerHTML += `<option value="${d.name}" ${autoSelectedDriver === d.name ? 'selected' : ''}>🛵 ${d.name} (${d.phone || 'بدون رقم'})${countBadge}</option>`;
        });

        if (autoSelectedDriver) {
            selectEl.value = autoSelectedDriver;
            window.calculateDriverReconciliation();
        }
    };

    window.toggleReconHistoryView = function (checked) {
        window.reconShowHistory = checked;
        window.calculateDriverReconciliation();
    };

    window.toggleReconOrderCheck = function (orderId, checked) {
        if (!window.reconSelectedOrderIds) window.reconSelectedOrderIds = new Set();
        if (checked) window.reconSelectedOrderIds.add(orderId);
        else window.reconSelectedOrderIds.delete(orderId);
        window.calculateDriverReconciliation();
    };

    window.selectReconOrdersPreset = function (mode) {
        const driverName = document.getElementById('recon-driver-select')?.value;
        if (!driverName) return;
        const openOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            isOrderOpenCustody(o) && isOrderForDriver(o, driverName)
        );
        const todayStr = new Date().toLocaleDateString('en-US');
        window.reconSelectedOrderIds = new Set();

        openOrders.forEach(o => {
            const drvDone = isDriverFinishedOrder(o);
            if (mode === 'all') window.reconSelectedOrderIds.add(o.id);
            else if (mode === 'matched' && drvDone && o.customerConfirmed === true && !o.customerDispute) window.reconSelectedOrderIds.add(o.id);
            else if (mode === 'completed' && drvDone && !o.customerDispute) window.reconSelectedOrderIds.add(o.id);
            else if (mode === 'today' && drvDone && !o.customerDispute) {
                const dStr = o.completedAtStr || (o.driverDeliveredAtMs ? new Date(o.driverDeliveredAtMs).toLocaleDateString('en-US') : '');
                if (dStr === todayStr) window.reconSelectedOrderIds.add(o.id);
            }
        });
        window.calculateDriverReconciliation();
    };

    // =====================================================================
    // ج. تغيير طريقة دفع أوردر معين مباشرة من داخل شاشة تقفيل العهدة
    // =====================================================================
    window.setOrderPaymentModeInRecon = async function (orderId, newMode) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        const total = Math.round(Number(order.total) || 0);
        const netTotal = getOwnerNetProductTotal(order);

        if (newMode === 'split') {
            window.reconOpenSplitOrderId = (window.reconOpenSplitOrderId === orderId) ? null : orderId;
            if (order.paymentMethod !== 'split') {
                const half = Math.round(total / 2);
                const onlineHalf = Math.max(0, total - half);
                const netOnline = Math.min(netTotal, onlineHalf);
                const netCash = Math.max(0, netTotal - netOnline);

                order.paymentMethod = 'split';
                order.paidCash = half;
                order.paidOnline = onlineHalf;
                order.settledCash = netCash;
                order.settledOnline = netOnline;

                await db.collection('orders').doc(orderId).update({
                    paymentMethod: 'split',
                    paidCash: half,
                    paidOnline: onlineHalf,
                    settledCash: netCash,
                    settledOnline: netOnline
                });
            }
            window.calculateDriverReconciliation();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            return;
        }

        window.reconOpenSplitOrderId = null;
        const paidCash = (newMode === 'online') ? 0 : total;
        const paidOnline = (newMode === 'online') ? total : 0;
        const settledCash = (newMode === 'online') ? 0 : netTotal;
        const settledOnline = (newMode === 'online') ? netTotal : 0;

        order.paymentMethod = newMode;
        order.paidCash = paidCash;
        order.paidOnline = paidOnline;
        order.settledCash = settledCash;
        order.settledOnline = settledOnline;

        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
            globalOrdersMap[orderId].paymentMethod = newMode;
            globalOrdersMap[orderId].paidCash = paidCash;
            globalOrdersMap[orderId].paidOnline = paidOnline;
            globalOrdersMap[orderId].settledCash = settledCash;
            globalOrdersMap[orderId].settledOnline = settledOnline;
        }

        try {
            await db.collection('orders').doc(orderId).update({
                paymentMethod: newMode,
                paidCash: paidCash,
                paidOnline: paidOnline,
                settledCash: settledCash,
                settledOnline: settledOnline
            });
            window.calculateDriverReconciliation();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
        } catch (e) {
            alert('حدث خطأ أثناء تحديث طريقة دفع الطلب!');
        }
    };

    window.syncInlineReconSplit = function (orderId, total, changedSide) {
        const cashEl = document.getElementById(`recon-split-cash-${orderId}`);
        const onlineEl = document.getElementById(`recon-split-online-${orderId}`);
        if (!cashEl || !onlineEl) return;

        if (changedSide === 'cash') {
            let c = Number(cashEl.value) || 0;
            if (c < 0) c = 0;
            if (c > total) { c = total; cashEl.value = c; }
            onlineEl.value = Math.max(0, total - c);
        } else {
            let o = Number(onlineEl.value) || 0;
            if (o < 0) o = 0;
            if (o > total) { o = total; onlineEl.value = o; }
            cashEl.value = Math.max(0, total - o);
        }
    };

    window.saveInlineReconSplit = async function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        const total = Math.round(Number(order.total) || 0);
        const netTotal = getOwnerNetProductTotal(order);

        let cashVal = Math.round(Number(document.getElementById(`recon-split-cash-${orderId}`)?.value) || 0);
        if (cashVal < 0) cashVal = 0;
        if (cashVal > total) cashVal = total;
        let onlineVal = Math.max(0, total - cashVal);

        let finalMethod = 'split';
        let settledCash = 0;
        let settledOnline = 0;

        if (cashVal === 0 && onlineVal === total) {
            finalMethod = 'online';
            settledCash = 0;
            settledOnline = netTotal;
        } else if (cashVal === total && onlineVal === 0) {
            finalMethod = 'cash';
            settledCash = netTotal;
            settledOnline = 0;
        } else {
            settledOnline = Math.min(netTotal, onlineVal);
            settledCash = Math.max(0, netTotal - settledOnline);
        }

        order.paymentMethod = finalMethod;
        order.paidCash = cashVal;
        order.paidOnline = onlineVal;
        order.settledCash = settledCash;
        order.settledOnline = settledOnline;

        if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
            globalOrdersMap[orderId].paymentMethod = finalMethod;
            globalOrdersMap[orderId].paidCash = cashVal;
            globalOrdersMap[orderId].paidOnline = onlineVal;
            globalOrdersMap[orderId].settledCash = settledCash;
            globalOrdersMap[orderId].settledOnline = settledOnline;
        }

        window.reconOpenSplitOrderId = null;

        try {
            await db.collection('orders').doc(orderId).update({
                paymentMethod: finalMethod,
                paidCash: cashVal,
                paidOnline: onlineVal,
                settledCash: settledCash,
                settledOnline: settledOnline
            });
            window.calculateDriverReconciliation();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
        } catch (e) {
            alert('حدث خطأ أثناء حفظ تقسيمة الطلب!');
        }
    };

    // =====================================================================
    // د. حاسبة مطابقة الخزنة الموحدة (صافي الكاش من المندوب + صافي التحويلات)
    // =====================================================================
    window._lastReconSummary = null;

    window.applyReconPreset = function (mode) {
        const s = window._lastReconSummary;
        const cashInput = document.getElementById('actual-collected-cash');
        const walletInput = document.getElementById('actual-collected-wallet');
        if (!s || !cashInput || !walletInput) return;

        if (mode === 'exact_match') {
            cashInput.value = s.expectedCashFromDriver;
            walletInput.value = s.expectedNetOnline;
        } else if (mode === 'net_cash') {
            cashInput.value = s.totalAllNetProducts;
            walletInput.value = 0;
        } else if (mode === 'net_wallet') {
            cashInput.value = 0;
            walletInput.value = s.totalAllNetProducts;
        }
        window.checkCashDifference();
    };

    window.onReconSettlementInput = function (changedSide) {
        const s = window._lastReconSummary;
        const cashInput = document.getElementById('actual-collected-cash');
        const walletInput = document.getElementById('actual-collected-wallet');
        const autoSplitCb = document.getElementById('recon-auto-split-cb');
        if (!s || !cashInput || !walletInput) return;

        if (autoSplitCb && autoSplitCb.checked) {
            if (changedSide === 'cash') {
                let c = Math.max(0, Number(cashInput.value) || 0);
                walletInput.value = Math.max(0, s.totalAllNetProducts - c);
            } else {
                let w = Math.max(0, Number(walletInput.value) || 0);
                cashInput.value = Math.max(0, s.totalAllNetProducts - w);
            }
        }
        window.checkCashDifference();
    };

    window.checkCashDifference = function () {
        const s = window._lastReconSummary;
        const alertEl = document.getElementById('cash-diff-alert');
        if (!s || !alertEl) return;

        const cashVal = Math.max(0, Math.round(Number(document.getElementById('actual-collected-cash')?.value) || 0));
        const walletVal = Math.max(0, Math.round(Number(document.getElementById('actual-collected-wallet')?.value) || 0));
        const totalReceived = cashVal + walletVal;
        const netTarget = s.totalAllNetProducts;

        let dashOnlinePreview = Math.min(netTarget, walletVal);
        let dashCashPreview = Math.max(0, netTarget - dashOnlinePreview);
        if (walletVal === 0 && cashVal > 0) {
            dashCashPreview = netTarget;
            dashOnlinePreview = 0;
        } else if (cashVal === 0 && walletVal > 0) {
            dashCashPreview = 0;
            dashOnlinePreview = netTarget;
        }

        const dashLine = `<div class="mt-1.5 pt-1.5 border-t border-black/10 text-[11px] font-black">📊 ما سيسمّع في لوحة القيادة (صافي المنتجات): [💵 كاش الدرج: ${dashCashPreview.toLocaleString()} ج] + [💳 محفظة/إنستاباي: ${dashOnlinePreview.toLocaleString()} ج]</div>`;

        if (totalReceived === netTarget) {
            alertEl.className = 'mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `✅ مطابق 100% لصافي المنتجات (${netTarget.toLocaleString()} ج) — [💵 كاش: ${cashVal.toLocaleString()} ج + 💳 تحويلات: ${walletVal.toLocaleString()} ج]${dashLine}`;
        } else if (totalReceived < netTarget) {
            const diffNet = netTarget - totalReceived;
            alertEl.className = 'mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `⚠️ يوجد عجز قدره (${diffNet.toLocaleString()} ج) عن صافي المنتجات (${netTarget.toLocaleString()} ج)!${dashLine}`;
        } else {
            const extra = totalReceived - netTarget;
            alertEl.className = 'mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `ℹ️ المجموع (${totalReceived.toLocaleString()} ج) يزيد (${extra.toLocaleString()} ج) عن صافي المنتجات (شامل جزء من الشحن)${dashLine}`;
        }
    };

    // =====================================================================
    // هـ. حاسبة تقفيل عهدة المندوب الموحدة (متطابقة بالجنيه مع تطبيق المندوب)
    // =====================================================================
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

        if (window._reconLastDriverKey !== driverName) {
            window._reconLastDriverKey = driverName;
            window.reconSelectedOrderIds = null;
        }

        const allDriverOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            o && o.status !== 'trash' && !o.isArchived &&
            o.deliveryType !== 'pickup' &&
            isOrderForDriver(o, driverName) &&
            (o.status === 'dispatched' || o.status === 'completed')
        );

        const activeCustodyOrders = allDriverOrders.filter(o => !o.isReconciled);
        const settledHistoryOrders = allDriverOrders.filter(o => o.isReconciled === true);

        // ترتيب ذكي: البلاغات أولاً للمراجعة، ثم المسلّم من المندوب، ثم تأكيد العميل فقط، ثم بالطريق
        const reconRank = (o) => {
            if (o.customerDispute) return 0;
            if (isDriverFinishedOrder(o)) return 1;
            if (o.customerConfirmed) return 2;
            return 3;
        };
        activeCustodyOrders.sort((a, b) => {
            const rA = reconRank(a), rB = reconRank(b);
            if (rA !== rB) return rA - rB;
            return (b.driverDeliveredAtMs || b.completedAtMs || b.createdAt?.toMillis?.() || 0) - (a.driverDeliveredAtMs || a.completedAtMs || a.createdAt?.toMillis?.() || 0);
        });

        // تهيئة التحديد الذكي: يحدد الطلبات المسلّمة السليمة تلقائياً (ويستبعد البلاغات للمراجعة أولاً)
        const activeIdsSet = new Set(activeCustodyOrders.map(o => o.id));
        if (!window.reconSelectedOrderIds) {
            const deliveredSafe = activeCustodyOrders.filter(o => isDriverFinishedOrder(o) && !o.customerDispute);
            const defaultPick = deliveredSafe.length > 0 ? deliveredSafe : activeCustodyOrders.filter(o => !o.customerDispute);
            window.reconSelectedOrderIds = new Set(defaultPick.map(o => o.id));
        } else {
            // إزالة أي IDs لم تعد مفتوحة
            window.reconSelectedOrderIds.forEach(id => {
                if (!activeIdsSet.has(id)) window.reconSelectedOrderIds.delete(id);
            });
        }

        const ordersToDisplay = window.reconShowHistory ? [...activeCustodyOrders, ...settledHistoryOrders] : activeCustodyOrders;

        if (activeCustodyOrders.length === 0 && !window.reconShowHistory) {
            container.innerHTML = `
                <div class="text-center py-12 bg-white border-2 border-dashed border-emerald-200 rounded-2xl space-y-3">
                    <div class="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl"><i class="fa-solid fa-check-double"></i></div>
                    <h4 class="font-black text-slate-800 text-base">عهدة المندوب (${driverName}) خالصة ومصفاة بالكامل! ✅</h4>
                    <p class="text-xs font-bold text-slate-400">لا توجد أي طلبات مسلمة أو في الطريق غير مقفلة في ذمة هذا المندوب حالياً.</p>
                    ${settledHistoryOrders.length > 0 ? `
                    <button type="button" onclick="toggleReconHistoryView(true)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-black transition-all">
                        👁️ عرض وتعديل سجل الطلبات المصفاة سابقاً (${settledHistoryOrders.length} طلب)
                    </button>` : ''}
                </div>`;
            settleBtn.classList.add('hidden');
            return;
        }

        // الحساب المالي الموحد للطلبات المحددة للتقفيل
        const selectedOpenOrders = activeCustodyOrders.filter(o => window.reconSelectedOrderIds.has(o.id));
        let totalAllGross = 0;
        let totalAllNetProducts = 0;
        let totalDeliveryFees = 0;
        let totalCashInDriverHand = 0;
        let totalOnlineToStore = 0;
        let totalCashCount = 0;
        let totalOnlineCount = 0;
        let totalSplitCount = 0;

        selectedOpenOrders.forEach(o => {
            const br = window.getOrderPaymentBreakdown(o);
            totalAllGross += br.total;
            totalAllNetProducts += br.netTotal;
            totalDeliveryFees += (Number(o.deliveryFee) || 0);
            totalCashInDriverHand += br.cash;
            totalOnlineToStore += br.online;

            if (br.method === 'online') totalOnlineCount++;
            else if (br.method === 'split') totalSplitCount++;
            else totalCashCount++;
        });

        // المعادلة الموحدة 100% مع تطبيق المندوب:
        // لو الكاش في إيد المندوب >= عمولته: يخصم عمولته من الكاش ويسلّمك الصافي كاش
        // لو الكاش < عمولته (التحويلات غطت الكاش): لا يسلّمك كاش، بل له باقي عمولة عندك = Math.abs(netCashDiff)
        const netCashDiff = totalCashInDriverHand - totalDeliveryFees;
        const expectedCashFromDriver = Math.max(0, netCashDiff);
        const ownerOwesDriver = netCashDiff < 0 ? Math.abs(netCashDiff) : 0;
        const expectedNetOnline = Math.max(0, totalAllNetProducts - expectedCashFromDriver);

        window._lastReconSummary = {
            driverName,
            totalAllGross,
            totalAllNetProducts,
            totalDeliveryFees,
            totalCashInDriverHand,
            totalOnlineToStore,
            expectedCashFromDriver,
            ownerOwesDriver,
            expectedNetOnline
        };

        const completedOpenCnt = activeCustodyOrders.filter(o => isDriverFinishedOrder(o) && !o.customerDispute).length;
        const matchedOpenCnt = activeCustodyOrders.filter(o => isDriverFinishedOrder(o) && o.customerConfirmed === true && !o.customerDispute).length;
        const dispatchedOpenCnt = activeCustodyOrders.filter(o => o.status === 'dispatched' && !o.driverDelivered).length;
        const disputeOpenCnt = activeCustodyOrders.filter(o => o.customerDispute === true).length;

        let ordersHtml = '';
        ordersToDisplay.forEach((o, index) => {
            const br = window.getOrderPaymentBreakdown(o);
            const isSettled = Boolean(o.isReconciled === true);
            const isChecked = !isSettled && window.reconSelectedOrderIds.has(o.id);
            const delFee = Number(o.deliveryFee) || 0;
            const isSplitEditorOpen = (window.reconOpenSplitOrderId === o.id || br.method === 'split');
            const drvDone = isDriverFinishedOrder(o);
            const custOk = Boolean(o.customerConfirmed);
            const hasDispute = Boolean(o.customerDispute);
            const custTracked = Boolean(o.customerTracked || custOk || hasDispute);

            let badgeStatus = '';
            if (isSettled) {
                badgeStatus = '<span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-black">تم التقفيل نهائياً ✅</span>';
            } else if (hasDispute) {
                badgeStatus = '<span class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-black animate-pulse">🚨 بلاغ مشكلة من العميل</span>';
            } else if (drvDone && custOk) {
                badgeStatus = `<span class="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] font-black">🟢 تطابق تام (المندوب + العميل)</span>${o.isSupplied ? ' <span class="bg-cyan-100 text-cyan-900 px-2 py-0.5 rounded text-[10px] font-black border border-cyan-300">🔔 طلب توريد</span>' : ''}`;
            } else if (drvDone) {
                badgeStatus = o.isSupplied
                    ? '<span class="bg-cyan-100 text-cyan-900 px-2 py-0.5 rounded text-[10px] font-black border border-cyan-300">🔔 طلب توريد (المندوب فقط)</span>'
                    : '<span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[10px] font-black border border-amber-300">🟡 المندوب سلّم (العميل لم يؤكد)</span>';
            } else if (custOk) {
                badgeStatus = '<span class="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-black">🟠 العميل استلم — المندوب لم يسجّل!</span>';
            } else {
                badgeStatus = '<span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black border border-indigo-200">🛵 في الطريق</span>';
            }

            if (!isSettled && custTracked && !custOk && !hasDispute) {
                badgeStatus += ' <span class="bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded text-[9px] font-black">👁️ دخل التتبع</span>';
            }

            const paymentBadge = br.method === 'online'
                ? `<span class="bg-emerald-500 text-white px-2 py-0.5 rounded text-[9px] font-black">💳 تحويل للمتجر (${br.online} ج)</span>`
                : (br.method === 'split'
                    ? `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-black">⚖️ نص ونص (${br.cash}ج كاش + ${br.online}ج تحويل)</span>`
                    : `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-black">💵 كاش (${br.cash} ج)</span>`);

            const latestDrvNote = o.driverNote ? String(o.driverNote).split('\n---\n').pop() : '';

            const quickSwitchButtons = `
                <div class="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-slate-100">
                    <span class="text-[10px] font-black text-slate-400 ml-1">طريقة الدفع الفعلية:</span>
                    <button type="button" onclick="setOrderPaymentModeInRecon('${o.id}', 'cash')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${br.method === 'cash' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-amber-50'}">💵 كاش</button>
                    <button type="button" onclick="setOrderPaymentModeInRecon('${o.id}', 'online')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${br.method === 'online' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'}">💳 تحويل للمتجر</button>
                    <button type="button" onclick="setOrderPaymentModeInRecon('${o.id}', 'split')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${br.method === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}">⚖️ جزء وجزء</button>
                </div>
                ${isSplitEditorOpen ? `
                <div class="mt-2.5 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-wrap items-center gap-2">
                    <div class="flex items-center gap-1.5 flex-1 min-w-[120px]">
                        <span class="text-[10px] font-black text-amber-800 whitespace-nowrap">💵 كاش:</span>
                        <input type="number" id="recon-split-cash-${o.id}" value="${br.cash}" min="0" max="${br.total}" oninput="syncInlineReconSplit('${o.id}', ${br.total}, 'cash')" class="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-center font-black text-xs text-amber-900 outline-none">
                    </div>
                    <div class="flex items-center gap-1.5 flex-1 min-w-[120px]">
                        <span class="text-[10px] font-black text-indigo-800 whitespace-nowrap">💳 تحويل:</span>
                        <input type="number" id="recon-split-online-${o.id}" value="${br.online}" min="0" max="${br.total}" oninput="syncInlineReconSplit('${o.id}', ${br.total}, 'online')" class="w-full bg-white border border-indigo-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-900 outline-none">
                    </div>
                    <button type="button" onclick="saveInlineReconSplit('${o.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm transition-all">حفظ التقسيمة ✅</button>
                </div>` : ''}
            `;

            ordersHtml += `
            <div class="bg-white p-4 rounded-2xl border ${isSettled ? 'border-slate-300 bg-slate-50/60 opacity-80' : (hasDispute ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200' : (isChecked ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200 opacity-65'))} shadow-sm mb-2.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div class="flex items-start gap-2.5 flex-1 w-full">
                    ${!isSettled ? `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleReconOrderCheck('${o.id}', this.checked)" class="w-4 h-4 mt-1 accent-brand-primary cursor-pointer shrink-0">` : ''}
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5 mb-1">
                            <span class="text-xs font-black text-slate-400">#${index + 1}</span>
                            <h5 onclick="openCustomerCard('${escAttr(o.customerPhone)}')" class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary">${o.customerName || 'عميل'}</h5>
                            ${badgeStatus}
                            ${paymentBadge}
                        </div>
                        <p class="text-[11px] font-bold text-slate-500"><i class="fa-solid fa-location-dot text-indigo-400 mr-1"></i> ${o.zone || ''} ${o.customerAddress ? '- ' + o.customerAddress : ''}</p>
                        <p class="text-[10px] text-slate-400 font-bold mt-0.5" dir="ltr">📞 ${o.customerPhone || ''} • منتجات: ${br.netTotal} ج • شحن: ${delFee} ج • فاتورة: ${br.total} ج</p>
                        ${latestDrvNote ? `<p class="text-[10px] font-black text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 mt-1.5"><i class="fa-solid fa-comment-dots text-blue-500 ml-1"></i> ${latestDrvNote}</p>` : ''}
                        ${quickSwitchButtons}
                    </div>
                </div>
                <div class="text-left flex flex-col items-end w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 shrink-0">
                    <span class="text-[10px] font-bold text-slate-400">مع المندوب كاش / للمتجر تحويل</span>
                    <span class="font-black ${br.method === 'online' ? 'text-indigo-600' : (br.method === 'split' ? 'text-purple-700' : 'text-brand-primary')} text-sm">
                        💵 ${br.cash} ج | 💳 ${br.online} ج
                    </span>
                </div>
            </div>`;
        });

        const settlementHeadlineHtml = ownerOwesDriver > 0
            ? `
            <div class="bg-gradient-to-l from-amber-500 to-orange-500 text-slate-950 p-4 rounded-2xl shadow-md mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="text-xs font-black block">⚠️ التحويلات الأونلاين غطت الكاش — المندوب له باقي عمولة عندك:</span>
                    <span class="text-[11px] font-bold opacity-90">الكاش في إيده (${totalCashInDriverHand.toLocaleString()} ج) أقل من عمولته (${totalDeliveryFees.toLocaleString()} ج) — التحويلات اللي وصلتك (${totalOnlineToStore.toLocaleString()} ج) شاملة باقي عمولته</span>
                </div>
                <span class="bg-slate-950 text-amber-300 px-4 py-2 rounded-xl text-xl font-black shrink-0">ادفع للمندوب: ${ownerOwesDriver.toLocaleString()} ج</span>
            </div>`
            : `
            <div class="bg-gradient-to-l from-emerald-700 via-brand-dark to-slate-900 text-white p-4 rounded-2xl shadow-md mb-4 flex flex-wrap items-center justify-between gap-2 border border-emerald-400/30">
                <div>
                    <span class="text-xs font-black text-emerald-200 block">💵 المطلوب تستلمه كاش من المندوب الآن (بعد خصم عمولته):</span>
                    <span class="text-[11px] font-bold text-slate-300">كاش في إيده (${totalCashInDriverHand.toLocaleString()} ج) − عمولته (${totalDeliveryFees.toLocaleString()} ج) | ومعاك بالفعل تحويلات (${totalOnlineToStore.toLocaleString()} ج)</span>
                </div>
                <span class="bg-amber-400 text-slate-950 px-4 py-2 rounded-xl text-xl font-black shrink-0 shadow">استلم كاش: ${expectedCashFromDriver.toLocaleString()} ج</span>
            </div>`;

        container.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-2 mb-3">
                <span class="text-xs font-black text-slate-700">📊 عهدة المندوب: <strong class="text-brand-primary">${driverName}</strong> (محدد ${selectedOpenOrders.length} من ${activeCustodyOrders.length} طلب)</span>
                <div class="flex flex-wrap items-center gap-1.5">
                    ${matchedOpenCnt > 0 ? `<button type="button" onclick="selectReconOrdersPreset('matched')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm">🟢 المطابق فقط (${matchedOpenCnt})</button>` : ''}
                    ${completedOpenCnt > 0 ? `<button type="button" onclick="selectReconOrdersPreset('completed')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-black">المُسلّم من المندوب (${completedOpenCnt})</button>` : ''}
                    ${activeCustodyOrders.length > 0 ? `<button type="button" onclick="selectReconOrdersPreset('all')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-black">تحديد الكل (${activeCustodyOrders.length})</button>` : ''}
                    <label class="flex items-center gap-1.5 text-[11px] font-black text-slate-500 cursor-pointer mr-1">
                        <input type="checkbox" ${window.reconShowHistory ? 'checked' : ''} onchange="toggleReconHistoryView(this.checked)" class="w-4 h-4 accent-brand-primary rounded">
                        السجل السابق (${settledHistoryOrders.length})
                    </label>
                </div>
            </div>
            ${disputeOpenCnt > 0 ? `<div class="mb-3 bg-rose-50 border-2 border-rose-300 text-rose-900 px-3 py-2 rounded-xl text-xs font-black flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation text-rose-600"></i><span>تنبيه: يوجد (${disputeOpenCnt}) طلب عليه بلاغ مشكلة من العميل — تم استبعاده من التحديد التلقائي لمراجعته قبل التقفيل.</span></div>` : ''}

            <!-- كروت مطابقة الأرقام اللحظية (نفس أرقام تطبيق المندوب بالجنيه) -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
                <div class="bg-amber-50/70 p-3 rounded-2xl border border-amber-200 shadow-sm text-center">
                    <p class="text-[10px] font-black text-amber-800 mb-0.5">💵 الكاش في إيد المندوب</p>
                    <p class="text-lg font-black text-slate-900">${totalCashInDriverHand.toLocaleString()} <span class="text-xs">ج</span></p>
                    <p class="text-[9px] font-bold text-slate-500">${totalCashCount} كاش | ${totalSplitCount} نص</p>
                </div>
                <div class="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-200 shadow-sm text-center">
                    <p class="text-[10px] font-black text-indigo-800 mb-0.5">💳 تحويلات دخلت المتجر</p>
                    <p class="text-lg font-black text-indigo-700">${totalOnlineToStore.toLocaleString()} <span class="text-xs">ج</span></p>
                    <p class="text-[9px] font-bold text-indigo-500">${totalOnlineCount} تحويل كامل | ${totalSplitCount} نص</p>
                </div>
                <div class="bg-sky-50/70 p-3 rounded-2xl border border-sky-200 shadow-sm text-center">
                    <p class="text-[10px] font-black text-sky-800 mb-0.5">🛵 عمولة المندوب (الشحن)</p>
                    <p class="text-lg font-black text-sky-700">${totalDeliveryFees.toLocaleString()} <span class="text-xs">ج</span></p>
                    <p class="text-[9px] font-bold text-slate-500">من إجمالي ${totalAllGross.toLocaleString()} ج</p>
                </div>
                <div class="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200 shadow-sm text-center">
                    <p class="text-[10px] font-black text-emerald-800 mb-0.5">💎 صافي منتجاتك</p>
                    <p class="text-lg font-black text-emerald-700">${totalAllNetProducts.toLocaleString()} <span class="text-xs">ج</span></p>
                    <p class="text-[9px] font-bold text-emerald-600">يدخل لوحة القيادة</p>
                </div>
            </div>

            ${selectedOpenOrders.length > 0 ? settlementHeadlineHtml : ''}

            ${selectedOpenOrders.length > 0 ? `
            <!-- صندوق التأكيد والتسوية النهائية (مجهز تلقائياً بالرقم المضبوط 100%) -->
            <div class="bg-slate-900 text-white p-4 rounded-2xl shadow-lg mb-4 space-y-3">
                <div class="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-2.5">
                    <h4 class="font-black text-xs sm:text-sm text-amber-400"><i class="fa-solid fa-vault ml-1"></i> تأكيد دخول الفلوس في خزنتك (يسمّع في لوحة القيادة)</h4>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button type="button" onclick="applyReconPreset('exact_match')" class="bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm">⚡ المطابقة التلقائية</button>
                        <button type="button" onclick="applyReconPreset('net_cash')" class="bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black border border-emerald-500/40">💵 الكل كاش</button>
                        <button type="button" onclick="applyReconPreset('net_wallet')" class="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-black border border-indigo-400/40">💳 الكل تحويل</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                    <div class="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                        <label class="text-[10px] font-black text-emerald-400 block mb-1">💵 صافي الكاش الداخل للدرج (ج)</label>
                        <input type="number" id="actual-collected-cash" value="${expectedCashFromDriver}" min="0" oninput="onReconSettlementInput('cash')" class="w-full bg-slate-900 border-2 border-emerald-500/40 rounded-xl p-2 text-center font-black text-white text-base outline-none focus:border-emerald-400">
                    </div>
                    <div class="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                        <label class="text-[10px] font-black text-indigo-300 block mb-1">💳 صافي التحويلات بمحفظتك (ج)</label>
                        <input type="number" id="actual-collected-wallet" value="${expectedNetOnline}" min="0" oninput="onReconSettlementInput('wallet')" class="w-full bg-slate-900 border-2 border-indigo-500/40 rounded-xl p-2 text-center font-black text-white text-base outline-none focus:border-indigo-400">
                    </div>
                    <div class="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700 flex items-center justify-center h-full">
                        <label class="flex items-center gap-2 text-[11px] font-black text-amber-300 cursor-pointer select-none">
                            <input type="checkbox" id="recon-auto-split-cb" checked class="w-4 h-4 accent-amber-400 rounded">
                            <span>إكمال الفرق تلقائياً</span>
                        </label>
                    </div>
                </div>
            </div>
            <div id="cash-diff-alert" class="mb-4 text-center text-xs font-black"></div>
            ` : ''}

            <div class="space-y-2 max-h-[48vh] overflow-y-auto custom-scroll pr-1">
                ${ordersHtml}
            </div>
        `;

        if (selectedOpenOrders.length > 0) {
            window.checkCashDifference();
            settleBtn.classList.remove('hidden');
            settleBtn.onclick = () => window.confirmAndSettleDriverReconciliation(driverName);
        } else {
            settleBtn.classList.add('hidden');
        }
    };

    // =====================================================================
    // و. تأكيد وتقفيل العهدة (حفظ حقيقي بدون لخبطة طرق الدفع + منح النقاط + تصفير تطبيق المندوب)
    // =====================================================================
    window.confirmAndSettleDriverReconciliation = async function (driverName) {
        const s = window._lastReconSummary;
        if (!s) return;

        const actualCash = Math.max(0, Math.round(Number(document.getElementById('actual-collected-cash')?.value) || 0));
        const actualWallet = Math.max(0, Math.round(Number(document.getElementById('actual-collected-wallet')?.value) || 0));

        const targetOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            isOrderOpenCustody(o) &&
            isOrderForDriver(o, driverName) &&
            window.reconSelectedOrderIds &&
            window.reconSelectedOrderIds.has(o.id)
        );

        if (targetOrders.length === 0) return alert('اختر طلباً واحداً على الأقل لتقفيل عهدته!');

        const totalAllNetProducts = s.totalAllNetProducts;
        let targetNetOnline = Math.min(totalAllNetProducts, actualWallet);
        let targetNetCash = Math.max(0, totalAllNetProducts - targetNetOnline);
        if (actualWallet === 0 && actualCash > 0) {
            targetNetOnline = 0;
            targetNetCash = totalAllNetProducts;
        } else if (actualCash === 0 && actualWallet > 0) {
            targetNetOnline = totalAllNetProducts;
            targetNetCash = 0;
        }

        const isManualGlobalOverride = (actualCash !== s.expectedCashFromDriver || actualWallet !== s.expectedNetOnline);
        const driverCashLine = s.ownerOwesDriver > 0
            ? `⚠️ باقي عمولة تدفعها للمندوب: ${s.ownerOwesDriver.toLocaleString()} ج.م`
            : `💵 كاش تستلمه من المندوب: ${actualCash.toLocaleString()} ج.م`;

        const selectedDisputesCnt = targetOrders.filter(o => o.customerDispute === true).length;
        const selectedNotDrvDoneCnt = targetOrders.filter(o => !isDriverFinishedOrder(o)).length;
        const warnLines = [
            selectedDisputesCnt > 0 ? `🚨 تحذير: ضمن المحدد (${selectedDisputesCnt}) طلب عليه بلاغ مشكلة من العميل!` : '',
            selectedNotDrvDoneCnt > 0 ? `⚠️ ملاحظة: ضمن المحدد (${selectedNotDrvDoneCnt}) طلب لم يسجّل المندوب تسليمه بعد.` : ''
        ].filter(Boolean).join('\n');

        const confirmMsg = `✅ تأكيد تصفية وتقفيل عهدة (${driverName})؟\n\n` +
            (warnLines ? `${warnLines}\n\n` : '') +
            `📦 عدد الطلبات المقفلة نهائياً: ${targetOrders.length} طلب\n` +
            `${driverCashLine}\n` +
            `💳 تحويلات دخلت المتجر: ${s.totalOnlineToStore.toLocaleString()} ج.م\n` +
            `────────────────────\n` +
            `📊 ما سيسمّع في لوحة القيادة (صافي المنتجات بدون الشحن):\n` +
            `• 💵 كاش الدرج: ${targetNetCash.toLocaleString()} ج.م\n` +
            `• 💳 محفظة / إنستاباي: ${targetNetOnline.toLocaleString()} ج.م`;

        const okSettle = (typeof window.execConfirm === 'function')
            ? await window.execConfirm(confirmMsg, { title: 'تأكيد تصفية وتقفيل العهدة', tone: 'success', confirmText: 'تأكيد الاستلام والتقفيل' })
            : confirm(confirmMsg);
        if (!okSettle) return;

        const btn = document.getElementById('btn-settle-recon');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تصفية العهدة وتحديث الخزنة وتطبيق المندوب...';
        btn.disabled = true;

        try {
            const nowStr = new Date().toLocaleDateString('en-US');
            const timeStr = new Date().toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const ptsPer100 = Number(storeSettings?.pointsPer100) || 5;

            // توزيع settledOnline / settledCash بدقة على مرحلتين مع الحفاظ على طريقة دفع كل عميل الحقيقية
            const allocs = targetOrders.map(o => {
                const netProd = getOwnerNetProductTotal(o);
                const br = window.getOrderPaymentBreakdown(o);
                const baseOnl = Math.min(netProd, br.online);
                return { order: o, netProd, br, settledOnline: baseOnl };
            });

            let curSumOnl = allocs.reduce((acc, a) => acc + a.settledOnline, 0);
            let diffOnl = targetNetOnline - curSumOnl;

            if (diffOnl > 0) {
                for (let a of allocs) {
                    if (diffOnl <= 0) break;
                    const room = Math.max(0, a.netProd - a.settledOnline);
                    if (room > 0) {
                        const add = Math.min(room, diffOnl);
                        a.settledOnline += add;
                        diffOnl -= add;
                    }
                }
            } else if (diffOnl < 0) {
                let toTrim = Math.abs(diffOnl);
                for (let a of allocs) {
                    if (toTrim <= 0) break;
                    if (a.settledOnline > 0) {
                        const sub = Math.min(a.settledOnline, toTrim);
                        a.settledOnline -= sub;
                        toTrim -= sub;
                    }
                }
            }

            // التقطيع بـ 200 طلب لضمان عدم تجاوز حد 500 عملية في Firestore Batch مع تجميع نقاط كل عميل بدقة
            for (let i = 0; i < allocs.length; i += 200) {
                const chunk = allocs.slice(i, i + 200);
                const batchProcess = db.batch();
                const settleTs = firebase.firestore.FieldValue.serverTimestamp();
                const chunkPtsDeltas = {};

                chunk.forEach(a => {
                    const o = a.order;
                    const ref = db.collection('orders').doc(o.id);
                    const orderSettledOnline = Math.round(a.settledOnline);
                    const orderSettledCash = Math.max(0, a.netProd - orderSettledOnline);

                    // نحافظ على طريقة دفع العميل الحقيقية إلا إذا اختار الأدمن يدوياً (الكل كاش) أو (الكل تحويل)
                    let finalMethod = a.br.method;
                    let finalPaidCash = a.br.cash;
                    let finalPaidOnline = a.br.online;

                    if (isManualGlobalOverride && actualWallet === 0 && actualCash > 0) {
                        finalMethod = 'cash';
                        finalPaidCash = a.br.total;
                        finalPaidOnline = 0;
                    } else if (isManualGlobalOverride && actualCash === 0 && actualWallet > 0) {
                        finalMethod = 'online';
                        finalPaidCash = 0;
                        finalPaidOnline = a.br.total;
                    }

                    const settledCompMs = o.completedAtMs || o.driverDeliveredAtMs || Date.now();
                    const alreadyAwardedPts = Boolean(o.loyaltyPointsAwarded);

                    const updatePayload = {
                        status: 'completed',
                        driverDelivered: true,
                        customerDispute: false,
                        adminClosedAtMs: Date.now(),
                        paymentMethod: finalMethod,
                        paidCash: finalPaidCash,
                        paidOnline: finalPaidOnline,
                        settledCash: orderSettledCash,
                        settledOnline: orderSettledOnline,
                        completedAtMs: settledCompMs,
                        completedAtStr: o.completedAtStr || nowStr,
                        completedTimeDisplay: o.completedTimeDisplay || o.driverDeliveredTimeDisplay || timeStr,
                        completedAt: o.completedAt || settleTs,
                        loyaltyPointsAwarded: true,
                        isReconciled: true,
                        isSupplied: true,
                        reconciledAt: settleTs,
                        suppliedAt: o.suppliedAt || settleTs
                    };

                    // منح نقاط الولاء بالمعادلة الموحدة (صافي المنتجات × مضاعف السُلّم + البونص)
                    if (!alreadyAwardedPts && o.customerPhone) {
                        let earnedPts = 0;
                        if (typeof window.calcOrderEarnedPoints === 'function') {
                            earnedPts = window.calcOrderEarnedPoints(o);
                        } else {
                            const netProductsForPts = Math.max(0, (Number(o.subtotal) || Number(o.total) || 0) - (Number(o.discount) || 0));
                            const basePts = netProductsForPts >= 100 ? Math.floor(netProductsForPts / 100) * ptsPer100 : 0;
                            const mult = Math.max(1, Number(o.pointsMultiplier) || 1);
                            const bonusPts = Math.max(0, Number(o.bonusPoints) || 0);
                            earnedPts = Math.round(basePts * mult) + bonusPts;
                        }
                        updatePayload.earnedPoints = earnedPts;
                        o.earnedPoints = earnedPts;

                        if (earnedPts > 0) {
                            const normP = window.normalizePhone ? window.normalizePhone(o.customerPhone) : String(o.customerPhone).trim();
                            const cleanPhone = normP.startsWith('0') ? normP : '0' + normP;
                            if (cleanPhone.length >= 10) {
                                chunkPtsDeltas[cleanPhone] = (chunkPtsDeltas[cleanPhone] || 0) + earnedPts;
                            }
                        }
                    }

                    batchProcess.update(ref, updatePayload);

                    // تحديث الذاكرة الحية فوراً
                    Object.assign(o, {
                        status: 'completed',
                        driverDelivered: true,
                        customerDispute: false,
                        paymentMethod: finalMethod,
                        paidCash: finalPaidCash,
                        paidOnline: finalPaidOnline,
                        settledCash: orderSettledCash,
                        settledOnline: orderSettledOnline,
                        completedAtMs: settledCompMs,
                        completedAtStr: updatePayload.completedAtStr,
                        completedTimeDisplay: updatePayload.completedTimeDisplay,
                        loyaltyPointsAwarded: true,
                        isReconciled: true,
                        isSupplied: true
                    });

                    if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                        Object.assign(globalOrdersMap[o.id], o);
                    }
                    if (typeof window.syncOrderToGoogleSheet === 'function') {
                        window.syncOrderToGoogleSheet(o, 'update');
                    }
                });

                Object.keys(chunkPtsDeltas).forEach(pKey => {
                    if (chunkPtsDeltas[pKey] > 0) {
                        batchProcess.set(db.collection('customers').doc(pKey), {
                            walletPoints: firebase.firestore.FieldValue.increment(chunkPtsDeltas[pKey])
                        }, { merge: true });
                    }
                });

                await batchProcess.commit();
            }

            if (typeof window.syncWeightHoldForOrderStatus === 'function') {
                for (const a of allocs) {
                    await window.syncWeightHoldForOrderStatus(a.order, 'completed');
                }
            }

            window.reconSelectedOrderIds = null;
            window.renderReconciliationUI();
            window.calculateDriverReconciliation();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderOrdersList === 'function') window.renderOrdersList();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();

            if (typeof window.showToast === 'function') {
                window.showToast(`🎉 تم تقفيل عهدة (${driverName}) — كاش الدرج: ${targetNetCash} ج | تحويلات: ${targetNetOnline} ج`);
            }
            alert(`تم تقفيل عهدة المندوب (${driverName}) وتصفير محفظته بنجاح! 🎉\n\n📊 ما تم تسميعه في لوحة القيادة:\n💵 صافي كاش الدرج: ${targetNetCash.toLocaleString()} ج.م\n💳 محفظة / إنستاباي: ${targetNetOnline.toLocaleString()} ج.م`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ تصفية العهدة في قاعدة البيانات!');
        } finally {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };
    // [إضافة أمان] منع الضغط المزدوج على «تأكيد تصفية العهدة» أثناء نافذة التأكيد أو التنفيذ
    (function () {
        const _settleInner = window.confirmAndSettleDriverReconciliation;
        window.confirmAndSettleDriverReconciliation = async function () {
            if (window._settleReconBusy) return;
            window._settleReconBusy = true;
            try { return await _settleInner.apply(this, arguments); }
            finally { window._settleReconBusy = false; }
        };
    })();
})();
