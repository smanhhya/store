// =========================================================================
// 🛵 المحرك الموحد للمناديب، التوجيه، الرادار الحي، وتقفيل العهدة المرن (www/drivers.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يعتمد تقفيل المندوب الفعلي (كاش 💵 / فيزا أو محفظة 💳 / نص ونص ⚖️) كمرجع نهائي للداش بورد
// =========================================================================

(function () {
    window.reconShowHistory = false;
    window.reconOpenSplitOrderId = null;

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
        const total = Number(order.total) || 0;
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
            if (cashPart + onlinePart !== total) {
                onlinePart = Math.max(0, total - cashPart);
            }

            let netOnline = (order.settledOnline !== undefined && order.settledOnline !== null)
                ? Math.min(netTotal, Math.max(0, Number(order.settledOnline) || 0))
                : Math.min(netTotal, onlinePart);
            let netCash = Math.max(0, netTotal - netOnline);

            return { method: 'split', cash: cashPart, online: onlinePart, total: total, netCash: netCash, netOnline: netOnline, netTotal: netTotal };
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
    // ب. دالة مطابقة المندوب
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
                (d.name && d.name.trim() === driverPhoneOrName.trim()) ||
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
            window.calculateDriverReconciliation();
        }, 120);
    };

    // 2. رسم قائمة شاشة تقفيل عهدة المناديب
    window.renderReconciliationUI = function () {
        const selectEl = document.getElementById('recon-driver-select');
        if (!selectEl) return;

        const currentSelectedDriver = selectEl.value;
        const driversMap = {};

        (storeSettings?.drivers || []).forEach(d => {
            if (d && d.name) driversMap[d.name.trim()] = { name: d.name.trim(), phone: d.phone || '', openCount: 0 };
        });

        // العهدة المفتوحة = الطلبات التي ما زالت (في الطريق - dispatched) فقط؛ لأن أي طلب (مكتمل) وصلت فلوسه بالفعل
        (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (o.status !== 'dispatched') return;
            if (o.isReconciled || o.isSupplied) return;
            const dName = (o.driverName || '').trim();
            if (!dName) return;
            if (!driversMap[dName]) driversMap[dName] = { name: dName, phone: o.driverPhone || '', openCount: 0 };
            driversMap[dName].openCount++;
        });


        const driversArr = Object.values(driversMap).sort((a, b) => b.openCount - a.openCount);
        let autoSelectedDriver = currentSelectedDriver;
        const firstOpenDriver = driversArr.find(d => d.openCount > 0);
        if (!autoSelectedDriver && firstOpenDriver) {
            autoSelectedDriver = firstOpenDriver.name;
        } else if (autoSelectedDriver && driversMap[autoSelectedDriver] && driversMap[autoSelectedDriver].openCount === 0 && firstOpenDriver && !window.reconShowHistory) {
            autoSelectedDriver = firstOpenDriver.name;
        }

        selectEl.innerHTML = '<option value="">-- اختر المندوب لحساب عهدته وتصفية الوردية --</option>';
        driversArr.forEach(d => {
            const countBadge = d.openCount > 0 ? ` — [عهدة مفتوحة: ${d.openCount} طلب]` : ' — [خالصة ✅]';
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

    // =====================================================================
    // ج. تغيير طريقة دفع أوردر معين مباشرة من داخل شاشة تقفيل العهدة
    // =====================================================================
    window.setOrderPaymentModeInRecon = async function (orderId, newMode) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        const total = Number(order.total) || 0;
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

    // المزامنة اللحظية لخانتي (الكاش) و(الفيزا/المحفظة) داخل كارت الطلب في التقفيل
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

    // حفظ تقسيمة (النص والنص) للطلب الواحد داخل شاشة تقفيل العهدة
    window.saveInlineReconSplit = async function (orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        const total = Number(order.total) || 0;
        const netTotal = getOwnerNetProductTotal(order);

        let cashVal = Number(document.getElementById(`recon-split-cash-${orderId}`)?.value) || 0;
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
    // د. دوال التحكم في الصندوق السفلي لمطابقة الخزنة مع المندوب
    // =====================================================================
    window.applyReconPreset = function (mode, totalAllGross, totalAllNetProducts) {
        const cashInput = document.getElementById('actual-collected-cash');
        const walletInput = document.getElementById('actual-collected-wallet');
        const baseSelect = document.getElementById('recon-target-base');
        if (!cashInput || !walletInput) return;

        if (mode === 'all_cash') {
            if (baseSelect) baseSelect.value = String(totalAllGross);
            cashInput.value = totalAllGross;
            walletInput.value = 0;
        } else if (mode === 'net_cash') {
            if (baseSelect) baseSelect.value = String(totalAllNetProducts);
            cashInput.value = totalAllNetProducts;
            walletInput.value = 0;
        } else if (mode === 'all_wallet') {
            if (baseSelect) baseSelect.value = String(totalAllGross);
            cashInput.value = 0;
            walletInput.value = totalAllGross;
        } else if (mode === 'net_wallet') {
            if (baseSelect) baseSelect.value = String(totalAllNetProducts);
            cashInput.value = 0;
            walletInput.value = totalAllNetProducts;
        } else if (mode === 'split_50_50') {
            const currentTarget = Number(baseSelect?.value) || totalAllNetProducts;
            const half = Math.round(currentTarget / 2);
            cashInput.value = half;
            walletInput.value = Math.max(0, currentTarget - half);
        }
        window.checkCashDifference(totalAllGross, totalAllNetProducts);
    };

    window.onReconSettlementInput = function (changedSide, totalAllGross, totalAllNetProducts) {
        const cashInput = document.getElementById('actual-collected-cash');
        const walletInput = document.getElementById('actual-collected-wallet');
        const autoSplitCb = document.getElementById('recon-auto-split-cb');
        if (!cashInput || !walletInput) return;

        const targetBase = Number(document.getElementById('recon-target-base')?.value) || totalAllNetProducts;

        if (autoSplitCb && autoSplitCb.checked) {
            if (changedSide === 'cash') {
                let c = Number(cashInput.value) || 0;
                if (c < 0) c = 0;
                walletInput.value = Math.max(0, targetBase - c);
            } else {
                let w = Number(walletInput.value) || 0;
                if (w < 0) w = 0;
                cashInput.value = Math.max(0, targetBase - w);
            }
        }
        window.checkCashDifference(totalAllGross, totalAllNetProducts);
    };

    window.checkCashDifference = function (totalAllGross, totalAllNetProducts) {
        const alertEl = document.getElementById('cash-diff-alert');
        if (!alertEl) return;

        const cashVal = Number(document.getElementById('actual-collected-cash')?.value) || 0;
        const walletVal = Number(document.getElementById('actual-collected-wallet')?.value) || 0;
        const totalReceived = cashVal + walletVal;

        const netTarget = (totalAllNetProducts !== undefined) ? totalAllNetProducts : totalAllGross;
        const driverFee = Math.max(0, totalAllGross - netTarget);

        // حساب ما سيسمّع فعلياً في الداش بورد (صافي المنتجات بدون التوصيل)
        let dashOnlinePreview = Math.min(netTarget, walletVal);
        let dashCashPreview = Math.max(0, netTarget - dashOnlinePreview);
        if (walletVal === 0 && cashVal > 0) {
            dashCashPreview = netTarget;
            dashOnlinePreview = 0;
        } else if (cashVal === 0 && walletVal > 0) {
            dashCashPreview = 0;
            dashOnlinePreview = netTarget;
        }

        const dashPreviewLine = `<div class="mt-1.5 pt-1.5 border-t border-black/10 text-[11px] font-black">📊 ما سيسمّع في لوحة القيادة (صافي المنتجات بدون الشحن): [💵 كاش الدرج: ${dashCashPreview.toLocaleString()} ج] + [💳 محفظة/فيزا: ${dashOnlinePreview.toLocaleString()} ج]</div>`;

        if (totalReceived === totalAllGross) {
            alertEl.className = 'mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `✅ مطابق تماماً لإجمالي العهدة شامل الشحن (${totalAllGross.toLocaleString()} ج) — استلام: [💵 كاش: ${cashVal.toLocaleString()} ج + 💳 فيزا/محفظة: ${walletVal.toLocaleString()} ج]${dashPreviewLine}`;
        } else if (totalReceived === netTarget && driverFee > 0) {
            alertEl.className = 'mb-4 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `✅ مطابق تماماً لصافي المنتجات بعد خصم شحن المندوب (${netTarget.toLocaleString()} ج) — استلام: [💵 كاش: ${cashVal.toLocaleString()} ج + 💳 فيزا/محفظة: ${walletVal.toLocaleString()} ج]${dashPreviewLine}`;
        } else if (totalReceived < netTarget) {
            const diffNet = netTarget - totalReceived;
            alertEl.className = 'mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `⚠️ يوجد عجز قدره (${diffNet.toLocaleString()} ج) عن صافي المنتجات (${netTarget.toLocaleString()} ج)!${dashPreviewLine}`;
        } else {
            alertEl.className = 'mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-center text-xs font-black shadow-sm';
            alertEl.innerHTML = `ℹ️ إجمالي المستلم (${totalReceived.toLocaleString()} ج) — [💵 كاش: ${cashVal.toLocaleString()} ج + 💳 فيزا/محفظة: ${walletVal.toLocaleString()} ج]${dashPreviewLine}`;
        }
    };

    // =====================================================================
    // هـ. حاسبة تقفيل عهدة المندوب المطورة
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

        const allDriverOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            o && o.status !== 'trash' && !o.isArchived &&
            isOrderForDriver(o, driverName) &&
            (o.status === 'dispatched' || o.status === 'completed')
        );

        // أي طلب (مكتمل) = استُلم ووصلت فلوسه بالفعل؛ العهدة المفتوحة تضم فقط الطلبات التي ما زالت (في الطريق - dispatched)
        const activeCustodyOrders = allDriverOrders.filter(o => o.status === 'dispatched' && !o.isReconciled && !o.isSupplied);
        const settledHistoryOrders = allDriverOrders.filter(o => o.status === 'completed' || o.isReconciled || o.isSupplied);
        const ordersToDisplay = window.reconShowHistory ? allDriverOrders : activeCustodyOrders;

        if (activeCustodyOrders.length === 0 && !window.reconShowHistory) {
            container.innerHTML = `
                <div class="text-center py-12 bg-white border-2 border-dashed border-emerald-200 rounded-2xl space-y-3">
                    <div class="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl"><i class="fa-solid fa-check-double"></i></div>
                    <h4 class="font-black text-slate-800 text-base">عهدة المندوب (${driverName}) خالصة ومصفاة بالكامل! ✅</h4>
                    <p class="text-xs font-bold text-slate-400">لا توجد أي طلبات معلقة أو مبالغ غير موردة في ذمة هذا المندوب حالياً.</p>
                    ${settledHistoryOrders.length > 0 ? `
                    <button onclick="toggleReconHistoryView(true)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-black transition-all">
                        👁️ عرض وتعديل سجل الطلبات المصفاة سابقاً (${settledHistoryOrders.length} طلب)
                    </button>` : ''}
                </div>`;
            settleBtn.classList.add('hidden');
            return;
        }

        let totalAllGross = 0;
        let totalAllNetProducts = 0;
        let totalDeliveryFees = 0;
        let initialCashNet = 0;
        let initialOnlineNet = 0;
        let totalCashCount = 0;
        let totalOnlineCount = 0;
        let totalSplitCount = 0;
        let ordersHtml = '';

        activeCustodyOrders.forEach(o => {
            const br = window.getOrderPaymentBreakdown(o);
            totalAllGross += br.total;
            totalAllNetProducts += br.netTotal;
            totalDeliveryFees += (Number(o.deliveryFee) || 0);
            initialCashNet += br.netCash;
            initialOnlineNet += br.netOnline;

            if (br.method === 'online') totalOnlineCount++;
            else if (br.method === 'split') totalSplitCount++;
            else totalCashCount++;
        });

        ordersToDisplay.forEach((o, index) => {
            const br = window.getOrderPaymentBreakdown(o);
            const isSettled = Boolean(o.status === 'completed' || o.isReconciled || o.isSupplied);
            const delFee = Number(o.deliveryFee) || 0;
            const isSplitEditorOpen = (window.reconOpenSplitOrderId === o.id || br.method === 'split');

            const badgeStatus = isSettled
                ? '<span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-black">تم التوريد والتقفيل ✅</span>'
                : (o.status === 'completed'
                    ? '<span class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-black border border-emerald-100">تم التسليم (بالعهدة)</span>'
                    : '<span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black border border-indigo-100">في الطريق مع المندوب</span>');

            const paymentBadge = br.method === 'online'
                ? '<span class="bg-emerald-500 text-white px-2 py-0.5 rounded text-[9px] font-black">فيزا / محفظة 💳</span>'
                : (br.method === 'split'
                    ? `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-black">نص ونص ⚖️ (${br.cash}ج كاش + ${br.online}ج فيزا/محفظة)</span>`
                    : '<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-black">كاش 💵</span>');

            // أزرار تحويل طريقة الدفع تعمل على الطلبات الحالية وحتى الطلبات المصفاة سابقاً لتصحيح أي خطأ فوراً
            const quickSwitchButtons = `
                <div class="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-slate-100">
                    <span class="text-[10px] font-black text-slate-400 ml-1">تقفيل هذا الطلب كـ:</span>
                    <button type="button" onclick="setOrderPaymentModeInRecon('${o.id}', 'cash')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${br.method === 'cash' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-amber-50'}">💵 كاش</button>
                    <button type="button" onclick="setOrderPaymentModeInRecon('${o.id}', 'online')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${br.method === 'online' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'}">💳 فيزا / محفظة</button>
                    <button type="button" onclick="setOrderPaymentModeInRecon('${o.id}', 'split')" class="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${br.method === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}">⚖️ نص ونص</button>
                </div>
                ${isSplitEditorOpen ? `
                <div class="mt-2.5 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-wrap items-center gap-2">
                    <div class="flex items-center gap-1.5 flex-1 min-w-[120px]">
                        <span class="text-[10px] font-black text-amber-800 whitespace-nowrap">💵 كاش:</span>
                        <input type="number" id="recon-split-cash-${o.id}" value="${br.cash}" min="0" max="${br.total}" oninput="syncInlineReconSplit('${o.id}', ${br.total}, 'cash')" class="w-full bg-white border border-amber-300 rounded-lg p-1.5 text-center font-black text-xs text-amber-900 outline-none">
                    </div>
                    <div class="flex items-center gap-1.5 flex-1 min-w-[120px]">
                        <span class="text-[10px] font-black text-indigo-800 whitespace-nowrap">💳 فيزا/محفظة:</span>
                        <input type="number" id="recon-split-online-${o.id}" value="${br.online}" min="0" max="${br.total}" oninput="syncInlineReconSplit('${o.id}', ${br.total}, 'online')" class="w-full bg-white border border-indigo-300 rounded-lg p-1.5 text-center font-black text-xs text-indigo-900 outline-none">
                    </div>
                    <button type="button" onclick="saveInlineReconSplit('${o.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm transition-all">حفظ التقسيمة ✅</button>
                </div>` : ''}
            `;

            ordersHtml += `
            <div class="bg-white p-4 rounded-2xl border ${isSettled ? 'border-slate-300 bg-slate-50/50' : (br.method === 'online' ? 'border-emerald-200 bg-emerald-50/20' : (br.method === 'split' ? 'border-indigo-200 bg-indigo-50/10' : 'border-slate-200/80'))} shadow-sm mb-2.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div class="flex-1 w-full">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="text-xs font-black text-slate-400">#${index + 1}</span>
                        <h5 onclick="openCustomerCard('${o.customerPhone}')" class="font-black text-slate-800 text-sm cursor-pointer hover:text-brand-primary">${o.customerName || 'عميل'}</h5>
                        ${badgeStatus}
                        ${paymentBadge}
                    </div>
                    <p class="text-[11px] font-bold text-slate-500"><i class="fa-solid fa-location-dot text-indigo-400 mr-1"></i> ${o.zone || ''} - ${o.customerAddress || ''}</p>
                    <p class="text-[10px] text-slate-400 font-bold mt-0.5" dir="ltr">📞 ${o.customerPhone || ''} • صافي المنتجات: ${br.netTotal} ج • شحن: ${delFee} ج • الإجمالي: ${br.total} ج</p>
                    ${quickSwitchButtons}
                </div>
                <div class="text-left flex flex-col items-end w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 shrink-0">
                    <span class="text-[10px] font-bold text-slate-400">صافي المنتجات بالداش بورد</span>
                    <span class="font-black ${br.method === 'online' ? 'text-emerald-600' : (br.method === 'split' ? 'text-indigo-600' : 'text-brand-primary')} text-base">
                        ${br.method === 'online' ? `${br.netOnline} ج (فيزا/محفظة)` : (br.method === 'split' ? `${br.netCash}ج كاش + ${br.netOnline}ج محفظة` : `${br.netCash} ج (كاش)`)}
                    </span>
                </div>
            </div>`;
        });

        container.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <span class="text-xs font-black text-slate-700">📊 ملخص العهدة المفتوحة للمندوب: <strong class="text-brand-primary">${driverName}</strong></span>
                <label class="flex items-center gap-1.5 text-[11px] font-black text-slate-500 cursor-pointer">
                    <input type="checkbox" ${window.reconShowHistory ? 'checked' : ''} onchange="toggleReconHistoryView(this.checked)" class="w-4 h-4 accent-brand-primary rounded">
                    إظهار المصفى سابقاً لتعديله (${settledHistoryOrders.length})
                </label>
            </div>

            <!-- كروت ملخص العهدة -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm text-center">
                    <p class="text-[10px] font-bold text-slate-400 mb-1">أوردرات العهدة المفتوحة</p>
                    <p class="text-lg font-black text-slate-800">${activeCustodyOrders.length}</p>
                    <p class="text-[9px] font-bold text-slate-400 mt-0.5">${totalCashCount} كاش | ${totalOnlineCount} فيزا/محفظة | ${totalSplitCount} نص</p>
                </div>
                <div class="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-sm text-center">
                    <p class="text-[10px] font-bold text-emerald-700 mb-1">إجمالي العهدة (شامل الشحن)</p>
                    <p class="text-lg font-black text-brand-primary">${totalAllGross.toLocaleString()} ج</p>
                </div>
                <div class="bg-white p-3.5 rounded-2xl border border-sky-200 shadow-sm text-center">
                    <p class="text-[10px] font-bold text-sky-700 mb-1">إجمالي شحن المندوب</p>
                    <p class="text-lg font-black text-sky-600">${totalDeliveryFees.toLocaleString()} ج</p>
                </div>
                <div class="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-sm text-center">
                    <p class="text-[10px] font-black text-amber-800 mb-1">صافي المنتجات (بدون الشحن)</p>
                    <p class="text-lg font-black text-amber-600">${totalAllNetProducts.toLocaleString()} ج</p>
                </div>
            </div>

            ${activeCustodyOrders.length > 0 ? `
            <!-- حاسبة مطابقة الخزنة المرنة (المرجع النهائي للداش بورد) -->
            <div class="bg-slate-900 text-white p-5 rounded-2xl shadow-lg mb-4 space-y-4">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-3">
                    <div>
                        <h4 class="font-black text-sm text-amber-400 mb-1"><i class="fa-solid fa-calculator mr-1"></i> كيف استلمت فلوس هذه العهدة من المندوب؟ (يسمّع مباشرة في الداش بورد)</h4>
                        <p class="text-[11px] text-slate-300 font-bold">اختر بضغطة واحدة أو اكتب المبلغ الذي سلمه المندوب لك كاش أو فيزا/محفظة:</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button type="button" onclick="applyReconPreset('net_cash', ${totalAllGross}, ${totalAllNetProducts})" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm transition-all">💵 استلام الصافي كاش (${totalAllNetProducts} ج)</button>
                        <button type="button" onclick="applyReconPreset('all_cash', ${totalAllGross}, ${totalAllNetProducts})" class="bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black border border-emerald-500/40 transition-all">💵 الكل كاش بالشحن (${totalAllGross} ج)</button>
                        <button type="button" onclick="applyReconPreset('net_wallet', ${totalAllGross}, ${totalAllNetProducts})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-sm transition-all">💳 استلام الصافي فيزا/محفظة (${totalAllNetProducts} ج)</button>
                        <button type="button" onclick="applyReconPreset('all_wallet', ${totalAllGross}, ${totalAllNetProducts})" class="bg-indigo-500/30 hover:bg-indigo-600 text-indigo-200 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black border border-indigo-400/40 transition-all">💳 الكل فيزا/محفظة بالشحن (${totalAllGross} ج)</button>
                        <button type="button" onclick="applyReconPreset('split_50_50', ${totalAllGross}, ${totalAllNetProducts})" class="bg-purple-500/30 hover:bg-purple-600 text-purple-200 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black border border-purple-400/40 transition-all">⚖️ تقسيمة نص ونص</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div class="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
                        <label class="text-[10px] font-black text-emerald-400 block mb-1.5">💵 إجمالي المستلم كاش في الإيد (ج.م)</label>
                        <input type="number" id="actual-collected-cash" value="${initialCashNet}" min="0" oninput="onReconSettlementInput('cash', ${totalAllGross}, ${totalAllNetProducts})" class="w-full bg-slate-900 border-2 border-emerald-500/40 rounded-xl p-2.5 text-center font-black text-white text-base outline-none focus:border-emerald-400 transition-all">
                    </div>

                    <div class="bg-slate-800/90 p-3 rounded-xl border border-slate-700">
                        <label class="text-[10px] font-black text-indigo-300 block mb-1.5">💳 إجمالي المستلم فيزا / محفظة (ج.م)</label>
                        <input type="number" id="actual-collected-wallet" value="${initialOnlineNet}" min="0" oninput="onReconSettlementInput('wallet', ${totalAllGross}, ${totalAllNetProducts})" class="w-full bg-slate-900 border-2 border-indigo-500/40 rounded-xl p-2.5 text-center font-black text-white text-base outline-none focus:border-indigo-400 transition-all">
                    </div>

                    <div class="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex flex-col justify-between gap-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-black text-slate-300">حساب التقسيمة على أساس:</span>
                            <select id="recon-target-base" onchange="onReconSettlementInput('cash', ${totalAllGross}, ${totalAllNetProducts})" class="bg-slate-900 text-amber-300 border border-slate-600 rounded-lg px-2 py-1 text-[10px] font-black outline-none">
                                <option value="${totalAllNetProducts}" selected>الصافي بدون شحن (${totalAllNetProducts} ج)</option>
                                <option value="${totalAllGross}">الإجمالي بالشحن (${totalAllGross} ج)</option>
                            </select>
                        </div>
                        <label class="flex items-center gap-2 text-[11px] font-black text-amber-300 cursor-pointer select-none">
                            <input type="checkbox" id="recon-auto-split-cb" class="w-4 h-4 accent-amber-400 rounded">
                            حساب الباقي تلقائياً (نص ونص)
                        </label>
                    </div>
                </div>

            </div>
            <div id="cash-diff-alert" class="mb-4 text-center text-xs font-black"></div>
            ` : ''}

            <!-- قائمة أوردرات العهدة -->
            <div class="space-y-2 max-h-[48vh] overflow-y-auto custom-scroll pr-1">
                ${ordersHtml}
            </div>
        `;

        if (activeCustodyOrders.length > 0) {
            window.checkCashDifference(totalAllGross, totalAllNetProducts);
            settleBtn.classList.remove('hidden');
            settleBtn.onclick = () => window.confirmAndSettleDriverReconciliation(driverName, totalAllGross, totalAllNetProducts);
        } else {
            settleBtn.classList.add('hidden');
        }
    };

    // =====================================================================
    // و. تأكيد استلام النقدية/المحفظة وتقفيل العهدة (تسميع مباشر 100% في الداش بورد)
    // =====================================================================
    window.confirmAndSettleDriverReconciliation = async function (driverName, totalAllGross, totalAllNetProducts) {
        const cashInput = document.getElementById('actual-collected-cash');
        const walletInput = document.getElementById('actual-collected-wallet');
        const actualCash = cashInput ? (Number(cashInput.value) || 0) : totalAllGross;
        const actualWallet = walletInput ? (Number(walletInput.value) || 0) : 0;

        // التقفيل ينطبق فقط على طلبات المندوب التي ما زالت (في الطريق - dispatched) حتى لا نعيد لمس أو تغيير حساب أي طلب مكتمل سابقاً
        const targetOrders = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(o =>
            o && o.status !== 'trash' && !o.isArchived &&
            isOrderForDriver(o, driverName) &&
            o.status === 'dispatched' &&
            !o.isReconciled && !o.isSupplied
        );

        if (targetOrders.length === 0) return alert('لا توجد طلبات مفتوحة في عهدة هذا المندوب!');

        // تحديد صافي المنتجات الذي سيدخل في الداش بورد كـ (كاش) وكـ (فيزا/محفظة) حسب ما استلمه المالك فعلياً من المندوب
        let targetNetOnline = 0;
        let targetNetCash = 0;

        if (actualWallet === 0 && actualCash > 0) {
            // المندوب سلم العهدة كلها كاش
            targetNetOnline = 0;
            targetNetCash = totalAllNetProducts;
        } else if (actualCash === 0 && actualWallet > 0) {
            // المندوب سلم العهدة كلها فيزا / محفظة
            targetNetOnline = totalAllNetProducts;
            targetNetCash = 0;
        } else {
            // تقسيمة نص ونص بين الكاش والفيزا/المحفظة
            targetNetOnline = Math.min(totalAllNetProducts, Math.max(0, Math.round(actualWallet)));
            targetNetCash = Math.max(0, totalAllNetProducts - targetNetOnline);
        }

        const confirmMsg = `✅ تأكيد تصفية وتقفيل عهدة المندوب (${driverName})؟\n\n` +
            `📦 عدد الطلبات: ${targetOrders.length} طلب\n` +
            `💵 المستلم من المندوب كاش: ${actualCash.toLocaleString()} ج.م\n` +
            `💳 المستلم من المندوب فيزا / محفظة: ${actualWallet.toLocaleString()} ج.م\n` +
            `────────────────────\n` +
            `📊 ما سيسمّع في لوحة القيادة (صافي المنتجات بدون الشحن):\n` +
            `• 💵 صافي كاش الدرج: ${targetNetCash.toLocaleString()} ج.م\n` +
            `• 💳 محفظة الأونلاين / الفيزا: ${targetNetOnline.toLocaleString()} ج.م`;

        const okSettle = (typeof window.execConfirm === 'function')
            ? await window.execConfirm(confirmMsg, { title: 'تأكيد تصفية وتقفيل العهدة', tone: 'success', confirmText: 'تأكيد الاستلام والتقفيل' })
            : confirm(confirmMsg);
        if (!okSettle) return;


        const btn = document.getElementById('btn-settle-recon');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تصفية العهدة وتحديث الخزنة والداش بورد...';
        btn.disabled = true;

        try {
            const nowStr = new Date().toLocaleDateString('en-US');
            const timeStr = new Date().toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const ptsPer100 = Number(storeSettings?.pointsPer100) || 5;

            let remNetOnlineToAllocate = targetNetOnline;

            for (let i = 0; i < targetOrders.length; i += 400) {
                const chunk = targetOrders.slice(i, i + 400);
                const batchProcess = db.batch();

                chunk.forEach(o => {
                    const ref = db.collection('orders').doc(o.id);
                    const wasCompleted = (o.status === 'completed');
                    const orderGross = Number(o.total) || 0;
                    const orderDelFee = Number(o.deliveryFee) || 0;
                    const orderNetProd = getOwnerNetProductTotal(o);

                    let orderSettledOnline = 0;
                    let orderSettledCash = 0;
                    let finalOrderMethod = 'cash';
                    let finalPaidCash = orderGross;
                    let finalPaidOnline = 0;

                    if (remNetOnlineToAllocate > 0 && orderNetProd > 0) {
                        orderSettledOnline = Math.min(orderNetProd, remNetOnlineToAllocate);
                        remNetOnlineToAllocate -= orderSettledOnline;
                    }
                    orderSettledCash = Math.max(0, orderNetProd - orderSettledOnline);

                    if (orderSettledCash === 0 && orderSettledOnline > 0) {
                        finalOrderMethod = 'online';
                        finalPaidCash = 0;
                        finalPaidOnline = orderGross;
                    } else if (orderSettledOnline === 0) {
                        finalOrderMethod = 'cash';
                        finalPaidCash = orderGross;
                        finalPaidOnline = 0;
                    } else {
                        finalOrderMethod = 'split';
                        finalPaidOnline = orderSettledOnline;
                        finalPaidCash = Math.max(0, orderGross - finalPaidOnline);
                    }

                    const settledCompMs = o.completedAtMs || Date.now();
                    const alreadyAwardedPts = Boolean(o.loyaltyPointsAwarded);
                    batchProcess.update(ref, {
                        status: 'completed',
                        paymentMethod: finalOrderMethod,
                        paidCash: finalPaidCash,
                        paidOnline: finalPaidOnline,
                        settledCash: orderSettledCash,
                        settledOnline: orderSettledOnline,
                        completedAtMs: settledCompMs,
                        completedAtStr: o.completedAtStr || nowStr,
                        completedTimeDisplay: o.completedTimeDisplay || timeStr,
                        completedAt: o.completedAt || firebase.firestore.FieldValue.serverTimestamp(),
                        loyaltyPointsAwarded: true,
                        isReconciled: true,
                        isSupplied: true,
                        reconciledAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    o.completedAtMs = settledCompMs;
                    o.loyaltyPointsAwarded = true;

                    // إضافة نقاط الولاء للعميل إن لم يكن الطلب مكتملاً من قبل
                    if (!wasCompleted && !alreadyAwardedPts && o.customerPhone) {
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
                    o.paymentMethod = finalOrderMethod;
                    o.paidCash = finalPaidCash;
                    o.paidOnline = finalPaidOnline;
                    o.settledCash = orderSettledCash;
                    o.settledOnline = orderSettledOnline;
                    o.completedAtStr = o.completedAtStr || nowStr;
                    o.completedTimeDisplay = o.completedTimeDisplay || timeStr;
                    o.isReconciled = true;
                    o.isSupplied = true;

                    if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                        globalOrdersMap[o.id].status = 'completed';
                        globalOrdersMap[o.id].paymentMethod = finalOrderMethod;
                        globalOrdersMap[o.id].paidCash = finalPaidCash;
                        globalOrdersMap[o.id].paidOnline = finalPaidOnline;
                        globalOrdersMap[o.id].settledCash = orderSettledCash;
                        globalOrdersMap[o.id].settledOnline = orderSettledOnline;
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

            if (typeof window.showToast === 'function') {
                window.showToast(`🎉 تم تقفيل عهدة (${driverName}) — كاش الدرج: ${targetNetCash} ج | فيزا/محفظة: ${targetNetOnline} ج`);
            }
            alert(`تم تقفيل عهدة المندوب (${driverName}) بنجاح! 🎉\n\n📊 ما تم تسميعه في لوحة القيادة:\n💵 صافي كاش الدرج: ${targetNetCash.toLocaleString()} ج.م\n💳 محفظة الأونلاين/الفيزا: ${targetNetOnline.toLocaleString()} ج.م`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ تصفية العهدة في قاعدة البيانات!');
        }

        btn.innerHTML = origHtml;
        btn.disabled = false;
    };
})();
