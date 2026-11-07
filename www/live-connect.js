// =========================================================================
// ⚡ محرك الترابط الحي، الكبسولات التفاعلية، ونبض النظام (www/live-connect.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يعمل بتكامل تام مع index.html + www/orders.js + www/dashboard.js
// =========================================================================

(function () {
    // 1. حالة نظام الترابط الحي والطي الذكي
    window.liveConnectState = {
        toolbarCollapsed: false,
        autoCollapseOnScroll: true,
        lastScrollTop: 0,
        activePopoverOrderId: null
    };

    // =========================================================================
    // 🎨 2. حقن تنسيقات الكبسولات الحية والقوائم الطائرة والطي الناعم
    // =========================================================================
    function injectLiveConnectStyles() {
        if (document.getElementById('live-connect-styles')) return;
        const style = document.createElement('style');
        style.id = 'live-connect-styles';
        style.innerHTML = `
            .lc-capsule {
                cursor: pointer !important;
                transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
                user-select: none;
            }
            .lc-capsule:hover {
                transform: translateY(-1px) scale(1.03);
                box-shadow: 0 4px 12px -2px rgba(6, 78, 59, 0.18) !important;
            }
            .lc-capsule:active {
                transform: scale(0.96);
            }
            #lc-floating-popover {
                animation: lcPopIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes lcPopIn {
                from { opacity: 0; transform: translateY(6px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            #smart-orders-toolbar {
                transition: max-height 0.28s ease, opacity 0.22s ease, margin 0.22s ease, padding 0.22s ease;
                overflow: hidden;
                max-height: 500px;
                opacity: 1;
            }
            #smart-orders-toolbar.lc-collapsed {
                max-height: 0 !important;
                opacity: 0 !important;
                margin-top: 0 !important;
                padding-top: 0 !important;
                border-top-width: 0 !important;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // 🎈 3. نظام النافذة الطائرة الموضعية السريعة (Micro-Popover Engine)
    // =========================================================================
    function getOrCreatePopover() {
        let pop = document.getElementById('lc-floating-popover');
        if (!pop) {
            pop = document.createElement('div');
            pop.id = 'lc-floating-popover';
            pop.className = 'fixed z-[250] hidden bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-3.5 w-72 max-w-[92vw] text-right';
            document.body.appendChild(pop);

            document.addEventListener('click', (e) => {
                if (!pop.classList.contains('hidden')) {
                    if (!pop.contains(e.target) && !e.target.closest('[data-lc-trigger]')) {
                        window.closeLivePopover();
                    }
                }
            });
        }
        return pop;
    }

    window.openLivePopover = function (anchorEl, htmlContent) {
        const pop = getOrCreatePopover();
        pop.innerHTML = htmlContent;
        pop.classList.remove('hidden');

        if (!anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const popRect = pop.getBoundingClientRect();

        let top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - (popRect.width / 2);

        if (top + popRect.height > window.innerHeight - 12) {
            top = Math.max(12, rect.top - popRect.height - 8);
        }
        if (left < 10) left = 10;
        if (left + popRect.width > window.innerWidth - 10) {
            left = window.innerWidth - popRect.width - 10;
        }

        pop.style.top = `${top}px`;
        pop.style.left = `${left}px`;
    };

    window.closeLivePopover = function () {
        const pop = document.getElementById('lc-floating-popover');
        if (pop) pop.classList.add('hidden');
    };

    function notifyQuickToast(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg);
            return;
        }
        if (typeof window.showQuickAppToast === 'function') {
            window.showQuickAppToast(msg);
            return;
        }
        let t = document.getElementById('lc-quick-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'lc-quick-toast';
            t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-xl transition-opacity duration-300';
            document.body.appendChild(t);
        }
        t.innerText = msg;
        t.style.opacity = '1';
        t.classList.remove('hidden');
        clearTimeout(window._lcToastTimer);
        window._lcToastTimer = setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.classList.add('hidden'), 300);
        }, 2400);
    }

    // =========================================================================
    // 💊 4. تفعيل الكبسولات الحية على كروت الطلبات (Interactive Micro-Capsules)
    // =========================================================================
    window.enhanceOrderCardsLive = function () {
        const container = document.getElementById('orders-list-vertical');
        if (!container) return;

        const cards = container.querySelectorAll('.order-card[data-id]');
        cards.forEach(card => {
            const orderId = card.getAttribute('data-id');
            const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
            if (!order) return;

            // 1. كبسولة طريقة الدفع (💵 كاش ⇄ 💳 خالص أونلاين)
            const paySpans = card.querySelectorAll('span');
            paySpans.forEach(sp => {
                const txt = sp.innerText.trim();
                if ((txt === 'كاش' || txt === 'خالص (أونلاين)') && !sp.hasAttribute('data-lc-pay')) {
                    sp.setAttribute('data-lc-pay', '1');
                    sp.setAttribute('data-lc-trigger', '1');
                    sp.classList.add('lc-capsule');
                    sp.title = 'اضغط للتحويل الفوري بين كاش وخالص أونلاين';
                    sp.onclick = (e) => {
                        e.stopPropagation();
                        window.openPaymentCapsulePopover(sp, orderId);
                    };
                }

                // 2. كبسولة تسوية المديونية السريعة (آجل X ج)
                if (txt.startsWith('آجل (') && !sp.hasAttribute('data-lc-debt')) {
                    sp.setAttribute('data-lc-debt', '1');
                    sp.setAttribute('data-lc-trigger', '1');
                    sp.classList.add('lc-capsule');
                    sp.title = 'اضغط لتسديد المديونية أو إرسال تذكير واتساب';
                    sp.onclick = (e) => {
                        e.stopPropagation();
                        window.openDebtCapsulePopover(sp, order.customerPhone, orderId);
                    };
                }

                // 3. كبسولة نبض المندوب (🛵 مع: ...)
                if (txt.startsWith('مع:') && !sp.hasAttribute('data-lc-driver')) {
                    sp.setAttribute('data-lc-driver', '1');
                    sp.setAttribute('data-lc-trigger', '1');
                    sp.classList.add('lc-capsule');
                    sp.title = 'اضغط لعرض نبض المندوب أو تغيير المندوب أو تقفيل عهدته';
                    sp.onclick = (e) => {
                        e.stopPropagation();
                        window.openDriverCapsulePopover(sp, orderId, order.driverName);
                    };
                }
            });

            // 4. كبسولة المنطقة الذكية (📍 المنطقة)
            const zoneSpan = card.querySelector('span[ondblclick*="\'zone\'"]');
            if (zoneSpan && !zoneSpan.hasAttribute('data-lc-zone')) {
                zoneSpan.setAttribute('data-lc-zone', '1');
                zoneSpan.setAttribute('data-lc-trigger', '1');
                zoneSpan.classList.add('lc-capsule', 'bg-indigo-50/70', 'px-2', 'py-0.5', 'rounded-md');
                zoneSpan.title = 'اضغط لخيارات المنطقة السريعة (أو مرتين للتعديل)';
                zoneSpan.onclick = (e) => {
                    e.stopPropagation();
                    if (window._lcZoneClickTimer) {
                        clearTimeout(window._lcZoneClickTimer);
                        window._lcZoneClickTimer = null;
                        return;
                    }
                    window._lcZoneClickTimer = setTimeout(() => {
                        window._lcZoneClickTimer = null;
                        window.openZoneCapsulePopover(zoneSpan, orderId, order.zone);
                    }, 220);
                };
            }

            // 5. كبسولة تعديل كمية الصنف السريع (+ / - من خارج الكارت)
            if (!['completed', 'canceled', 'trash'].includes(order.status)) {
                const itemBoxes = card.querySelectorAll('.bg-slate-50\\/80 > span.bg-white');
                itemBoxes.forEach((box, idx) => {
                    const nameSpan = box.querySelector('span.font-black.text-slate-800');
                    if (nameSpan && !nameSpan.hasAttribute('data-lc-item')) {
                        nameSpan.setAttribute('data-lc-item', '1');
                        nameSpan.setAttribute('data-lc-trigger', '1');
                        nameSpan.classList.add('lc-capsule', 'hover:text-brand-primary');
                        nameSpan.title = 'اضغط لتعديل الكمية (+ / -) فوراً';
                        nameSpan.onclick = (e) => {
                            e.stopPropagation();
                            window.openItemQtyCapsulePopover(box, orderId, idx);
                        };
                    }
                });
            }
        });
    };

    // --- 4.1: منطق كبسولة طريقة الدفع ---
    window.openPaymentCapsulePopover = function (anchorEl, orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;
        const isOnline = order.paymentMethod === 'online';

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-slate-800"><i class="fa-solid fa-wallet text-emerald-600 ml-1"></i> تبديل حالة الدفع</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <p class="text-[11px] font-bold text-slate-500">العميل: <strong class="text-slate-800">${order.customerName || ''}</strong> (${order.total || 0} ج)</p>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="quickSwitchOrderPayment('${orderId}', 'cash')" class="p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 ${!isOnline ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}">
                        <i class="fa-solid fa-money-bill-1-wave text-sm"></i>
                        <span>💵 كاش</span>
                    </button>
                    <button onclick="quickSwitchOrderPayment('${orderId}', 'online')" class="p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 ${isOnline ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}">
                        <i class="fa-solid fa-check-double text-sm"></i>
                        <span>💳 خالص أونلاين</span>
                    </button>
                </div>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    window.quickSwitchOrderPayment = async function (orderId, newMethod) {
        window.closeLivePopover();
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order || order.paymentMethod === newMethod) return;

        try {
            const updateObj = {
                paymentMethod: newMethod,
                isPrepaidConfirmed: newMethod === 'online'
            };
            await db.collection('orders').doc(orderId).update(updateObj);
            order.paymentMethod = newMethod;
            order.isPrepaidConfirmed = newMethod === 'online';
            if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[orderId]) {
                globalOrdersMap[orderId].paymentMethod = newMethod;
            }
            if (typeof window.syncOrderToGoogleSheet === 'function') {
                window.syncOrderToGoogleSheet(order, 'update');
            }
            window.renderOrdersList();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.calculateDriverReconciliation === 'function') window.calculateDriverReconciliation();
            notifyQuickToast(newMethod === 'online' ? '💳 تم تحويل الطلب إلى: خالص أونلاين' : '💵 تم تحويل الطلب إلى: الدفع كاش');
        } catch (e) {
            alert('حدث خطأ أثناء تحديث طريقة الدفع!');
        }
    };

    // --- 4.2: منطق كبسولة تعديل كمية الصنف (+ / -) الفوري ---
    window.openItemQtyCapsulePopover = function (anchorEl, orderId, itemIdx) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order || !Array.isArray(order.items) || !order.items[itemIdx]) return;
        const item = order.items[itemIdx];

        const html = `
            <div class="space-y-3">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-slate-800 truncate"><i class="fa-solid fa-boxes-stacked text-indigo-500 ml-1"></i> ${item.name}</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-1.5">
                    <button type="button" onclick="stepLiveItemQty(-1)" class="w-9 h-9 rounded-lg bg-white border border-slate-200 text-red-600 font-black hover:bg-red-50 text-base shadow-sm">-</button>
                    <input type="number" id="lc-item-qty-input" value="${item.quantity}" min="0" step="0.5" class="w-20 bg-transparent text-center font-black text-lg text-brand-primary outline-none">
                    <button type="button" onclick="stepLiveItemQty(1)" class="w-9 h-9 rounded-lg bg-white border border-slate-200 text-emerald-600 font-black hover:bg-emerald-50 text-base shadow-sm">+</button>
                </div>
                <div class="flex gap-2">
                    <button onclick="saveLiveItemQtyChange('${orderId}', ${itemIdx})" class="flex-1 bg-brand-primary hover:bg-emerald-800 text-white py-2 rounded-xl text-xs font-black shadow-sm transition-all">
                        <i class="fa-solid fa-check ml-1"></i> حفظ وتحديث الحساب
                    </button>
                </div>
                <p class="text-[9px] font-bold text-slate-400 text-center">ملاحظة: وضع الكمية 0 يحذف الصنف من الطلب</p>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    window.stepLiveItemQty = function (delta) {
        const inp = document.getElementById('lc-item-qty-input');
        if (!inp) return;
        let v = parseFloat(inp.value) || 0;
        v = Math.max(0, Number((v + delta).toFixed(2)));
        inp.value = v;
    };

    window.saveLiveItemQtyChange = async function (orderId, itemIdx) {
        const inp = document.getElementById('lc-item-qty-input');
        if (!inp) return;
        const newQty = Math.max(0, parseFloat(inp.value) || 0);
        window.closeLivePopover();

        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order || !Array.isArray(order.items) || !order.items[itemIdx]) return;

        const targetItem = order.items[itemIdx];
        const oldQty = Number(targetItem.quantity) || 0;
        const diffQty = newQty - oldQty;
        if (diffQty === 0) return;

        const newItems = [...order.items];
        if (newQty === 0) {
            if (newItems.length === 1) {
                return alert('لا يمكن حذف الصنف الوحيد في الطلب! يمكنك إلغاء الطلب أو تعديله بالكامل.');
            }
            newItems.splice(itemIdx, 1);
        } else {
            newItems[itemIdx] = { ...targetItem, quantity: newQty };
        }

        const newSubtotal = newItems.reduce((sum, i) => sum + ((Number(i.quantity) || 0) * (Number(i.price) || 0)), 0);
        const delFee = Number(order.deliveryFee) || 0;
        const disc = Number(order.discount) || 0;
        const newTotal = Math.max(0, newSubtotal + delFee - disc);
        const totalMoneyDiff = newTotal - (Number(order.total) || 0);

        try {
            const batch = db.batch();
            const orderRef = db.collection('orders').doc(orderId);
            batch.update(orderRef, {
                items: newItems,
                subtotal: newSubtotal,
                total: newTotal
            });

            // تحديث مخزون الحجز وحصة الدفعة والفريزر
            if (targetItem.id) {
                batch.set(db.collection('inventory').doc('stock'), {
                    [targetItem.id]: firebase.firestore.FieldValue.increment(-diffQty)
                }, { merge: true });

                if (order.batchId && typeof storeBatches !== 'undefined' && storeBatches[order.batchId]) {
                    batch.set(db.collection('inventory').doc('batches'), {
                        [order.batchId]: {
                            booked: { [targetItem.id]: firebase.firestore.FieldValue.increment(diffQty) }
                        }
                    }, { merge: true });
                }

                if (['processing', 'dispatched', 'deferred'].includes(order.status) && typeof storeFreezer !== 'undefined') {
                    const curFz = Math.max(0, Number(storeFreezer[targetItem.id]) || 0);
                    const nextFz = Math.max(0, curFz - diffQty);
                    storeFreezer[targetItem.id] = nextFz;
                    batch.set(db.collection('inventory').doc('freezer'), {
                        [targetItem.id]: nextFz
                    }, { merge: true });
                }
            }

            if (totalMoneyDiff !== 0 && order.customerPhone) {
                const cleanPhone = order.customerPhone.startsWith('0') ? order.customerPhone : '0' + order.customerPhone;
                batch.set(db.collection('customers').doc(cleanPhone), {
                    totalSpent: firebase.firestore.FieldValue.increment(totalMoneyDiff)
                }, { merge: true });
            }

            await batch.commit();
            order.items = newItems;
            order.subtotal = newSubtotal;
            order.total = newTotal;

            if (typeof window.syncOrderToGoogleSheet === 'function') {
                window.syncOrderToGoogleSheet(order, 'update');
            }
            window.renderOrdersList();
            notifyQuickToast(`✅ تم تحديث الكمية والإجمالي (${newTotal} ج)`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء حفظ الكمية الجديدة!');
        }
    };

    // --- 4.3: منطق كبسولة تسوية المديونية اللحظية (في الطلبات والعملاء) ---
    window.openDebtCapsulePopover = function (anchorEl, customerPhone, orderId = null) {
        const normP = window.normalizePhone ? window.normalizePhone(customerPhone) : customerPhone;
        const cust = (typeof customersData !== 'undefined' ? customersData : []).find(c => window.normalizePhone(c.phone) === normP);
        const order = orderId ? (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId) : null;

        const debtVal = order && Number(order.debt) > 0 ? Number(order.debt) : (Number(cust?.debt) || 0);
        const cName = order?.customerName || cust?.name || 'العميل';
        const phoneToUse = cust?.phone || customerPhone;

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-red-100 pb-2">
                    <span class="text-xs font-black text-red-700"><i class="fa-solid fa-hand-holding-dollar ml-1"></i> تسوية مديونية سريعة</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="bg-red-50 border border-red-100 rounded-xl p-2.5 flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-700">${cName}</span>
                    <span class="text-sm font-black text-red-600">${debtVal} ج</span>
                </div>
                <div class="space-y-1.5">
                    <button onclick="executeQuickDebtSettle('${phoneToUse}', ${debtVal}, '${orderId || ''}', 'full')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all">
                        <i class="fa-solid fa-check-double"></i> سدد المبلغ بالكامل (${debtVal} ج)
                    </button>
                    <button onclick="executeQuickDebtSettle('${phoneToUse}', ${debtVal}, '${orderId || ''}', 'partial')" class="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all">
                        <i class="fa-solid fa-coins text-amber-400"></i> سدد جزء من المبلغ...
                    </button>
                    <button onclick="sendQuickDebtWhatsAppReminder('${phoneToUse}', '${cName}', ${debtVal})" class="w-full bg-[#25D366] hover:bg-[#1ebd57] text-white py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all">
                        <i class="fa-brands fa-whatsapp"></i> إرسال تذكير واتساب بالمتبقي
                    </button>
                </div>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    window.executeQuickDebtSettle = async function (phone, currentDebt, orderId, mode) {
        window.closeLivePopover();
        if (!phone || currentDebt <= 0) return;

        let payAmount = currentDebt;
        if (mode === 'partial') {
            const inp = prompt(`المبلغ المتبقي الحالي: ${currentDebt} ج\nأدخل المبلغ الذي دفعه العميل الآن:`, '');
            if (inp === null || inp.trim() === '') return;
            payAmount = parseFloat(inp);
            if (isNaN(payAmount) || payAmount <= 0 || payAmount > currentDebt) {
                return alert('يرجى إدخال مبلغ صحيح لا يتخطى قيمة المديونية!');
            }
        } else {
            if (!confirm(`تأكيد استلام مبلغ (${payAmount} ج) وتسوية مديونية العميل؟`)) return;
        }

        try {
            const cleanPhone = phone.startsWith('0') ? phone : '0' + phone;
            const batch = db.batch();
            const custRef = db.collection('customers').doc(cleanPhone);

            const noteText = `[${new Date().toLocaleDateString('ar-EG')}] ✅ تم تحصيل ${payAmount} ج من المديونية السابقه.`;
            batch.set(custRef, {
                debt: firebase.firestore.FieldValue.increment(-payAmount),
                timelineNotes: firebase.firestore.FieldValue.arrayUnion({
                    id: 'debt_' + Date.now(),
                    text: noteText,
                    type: 'note',
                    timestamp: Date.now()
                })
            }, { merge: true });

            if (orderId) {
                const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
                if (order) {
                    const remOrderDebt = Math.max(0, (Number(order.debt) || 0) - payAmount);
                    const updatedAdminNote = order.adminNote ? `${order.adminNote}\n---\n${noteText}` : noteText;
                    batch.update(db.collection('orders').doc(orderId), {
                        debt: remOrderDebt,
                        adminNote: updatedAdminNote
                    });
                    order.debt = remOrderDebt;
                    order.adminNote = updatedAdminNote;
                }
            }

            await batch.commit();
            if (typeof window.refreshCustomersData === 'function') window.refreshCustomersData();
            window.renderOrdersList();
            notifyQuickToast(`✅ تم تسديد ${payAmount} ج وتحديث سجل المديونيات`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء تسوية المديونية!');
        }
    };

    window.sendQuickDebtWhatsAppReminder = function (phone, name, amount) {
        window.closeLivePopover();
        const storePhone = (typeof storeSettings !== 'undefined' && storeSettings.storePhone) ? storeSettings.storePhone : '01208027294';
        const msg = `أهلاً بحضرتك يا ${name || 'فندم'} 🌹\nتذكير ودي من "سمان ههيا" بخصوص باقي الحساب المسجل بقيمة (${amount} ج.م).\nيمكنك التحويل عبر فودافون كاش أو إنستاباي على الرقم:\n*${storePhone}*\nشكراً جزيلاً لذوقك وتعاملك معنا 🤍`;
        const cleanPhone = (phone || '').toString().trim();
        const waNumber = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;
        if (waNumber) window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // --- 4.4: منطق كبسولة نبض المندوب على كارت الطلب ---
    window.openDriverCapsulePopover = function (anchorEl, orderId, driverName) {
        const dName = (driverName || '').trim();
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const drvOrders = ordersList.filter(o => o && o.status !== 'trash' && !o.isArchived && (o.driverName || '').trim() === dName);

        const inWayCount = drvOrders.filter(o => o.status === 'dispatched').length;
        const unsettledOrders = drvOrders.filter(o => o.status === 'completed' && !o.isReconciled && !o.isSupplied);
        const cashWithDriver = unsettledOrders.reduce((s, o) => s + (o.paymentMethod === 'online' ? 0 : (Number(o.total) || 0)), 0);

        const drvObj = (storeSettings?.drivers || []).find(d => (d.name || '').trim() === dName);
        const drvPhone = drvObj?.phone || '';

        let otherDriversOpts = `<option value="">-- نقل الأوردر لمندوب آخر --</option>`;
        (storeSettings?.drivers || []).forEach(d => {
            if (d.name && d.name.trim() !== dName) {
                otherDriversOpts += `<option value="${d.name.trim()}|${d.phone || ''}">🛵 ${d.name}</option>`;
            }
        });
        otherDriversOpts += `<option value="REMOVE|">❌ إلغاء تعيين المندوب</option>`;

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-blue-800"><i class="fa-solid fa-motorcycle ml-1"></i> نبض المندوب: ${dName}</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="grid grid-cols-2 gap-2 text-center">
                    <div class="bg-blue-50 border border-blue-100 p-2 rounded-xl">
                        <span class="text-[10px] font-bold text-blue-600 block">معه بالطريق</span>
                        <span class="text-sm font-black text-blue-900">${inWayCount} طلب</span>
                    </div>
                    <div class="bg-amber-50 border border-amber-200 p-2 rounded-xl">
                        <span class="text-[10px] font-bold text-amber-700 block">كاش بعهدته</span>
                        <span class="text-sm font-black text-amber-900">${cashWithDriver} ج</span>
                    </div>
                </div>
                <select onchange="if(this.value) reassignOrderDriverQuick('${orderId}', this.value)" class="w-full border border-slate-200 rounded-xl p-2 text-[11px] font-black text-slate-700 bg-slate-50 outline-none">
                    ${otherDriversOpts}
                </select>
                <div class="grid grid-cols-2 gap-1.5 pt-1">
                    <button onclick="closeLivePopover(); setOrdersQuickFilter('driver', '${dName}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-[10px] font-black">
                        🔍 فلترة طلباته
                    </button>
                    <button onclick="jumpToDriverReconcile('${dName}')" class="bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-[10px] font-black">
                        💰 تقفيل عهدته
                    </button>
                </div>
                ${drvPhone ? `<a href="tel:${drvPhone}" class="block text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-[11px] font-black"><i class="fa-solid fa-phone ml-1"></i> اتصال بالمندوب (${drvPhone})</a>` : ''}
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    window.reassignOrderDriverQuick = async function (orderId, valStr) {
        window.closeLivePopover();
        const [newName, newPhone] = valStr.split('|');
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        try {
            if (newName === 'REMOVE') {
                await db.collection('orders').doc(orderId).update({
                    driverName: firebase.firestore.FieldValue.delete(),
                    driverPhone: firebase.firestore.FieldValue.delete(),
                    status: 'processing'
                });
                delete order.driverName;
                delete order.driverPhone;
                order.status = 'processing';
                notifyQuickToast('🔄 تم إلغاء تعيين المندوب وإرجاع الطلب للتجهيز');
            } else {
                await db.collection('orders').doc(orderId).update({
                    driverName: newName,
                    driverPhone: newPhone || '',
                    status: 'dispatched',
                    dispatchedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                order.driverName = newName;
                order.driverPhone = newPhone || '';
                order.status = 'dispatched';
                notifyQuickToast(`🛵 تم نقل الطلب للمندوب: ${newName}`);
            }
            window.renderOrdersList();
        } catch (e) {
            alert('حدث خطأ أثناء تغيير المندوب!');
        }
    };

    window.jumpToDriverReconcile = function (driverName) {
        window.closeLivePopover();
        const reconBtn = document.querySelector('button[onclick*="switchTab(\'reconciliation\'"]');
        if (reconBtn) switchTab('reconciliation', reconBtn);
        setTimeout(() => {
            const sel = document.getElementById('recon-driver-select');
            if (sel && driverName) {
                sel.value = driverName;
                if (typeof window.calculateDriverReconciliation === 'function') {
                    window.calculateDriverReconciliation();
                }
            }
        }, 120);
    };

    // --- 4.5: منطق كبسولة المنطقة السريعة ---
    window.openZoneCapsulePopover = function (anchorEl, orderId, zoneName) {
        const z = (zoneName || 'غير مسجل').trim();
        const procInZone = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).filter(
            o => o && o.status === 'processing' && !o.isArchived && (o.zone || 'غير مسجل').trim() === z
        );

        const html = `
            <div class="space-y-2">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-indigo-800"><i class="fa-solid fa-map-location-dot ml-1"></i> منطقة: ${z}</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <button onclick="closeLivePopover(); setOrdersQuickFilter('zone', '${z}')" class="w-full bg-indigo-50 hover:bg-indigo-600 text-indigo-800 hover:text-white py-2 px-3 rounded-xl text-xs font-black text-right transition-all flex items-center justify-between">
                    <span>🔍 عرض طلبات (${z}) فقط</span>
                    <i class="fa-solid fa-filter text-[10px]"></i>
                </button>
                <button onclick="quickDispatchZoneOrders('${z}')" class="w-full bg-blue-50 hover:bg-blue-600 text-blue-800 hover:text-white py-2 px-3 rounded-xl text-xs font-black text-right transition-all flex items-center justify-between">
                    <span>🛵 توجيه جاهز المنطقة للمندوب</span>
                    <span class="bg-white text-blue-700 px-1.5 py-0.5 rounded text-[10px]">${procInZone.length} طلب</span>
                </button>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    window.quickDispatchZoneOrders = function (zoneName) {
        window.closeLivePopover();
        if (typeof window.openDispatchModal === 'function') {
            window.openDispatchModal();
            setTimeout(() => {
                document.querySelectorAll('.disp-cb').forEach(cb => {
                    const o = (typeof dispatchOrdersRaw !== 'undefined' ? dispatchOrdersRaw : []).find(x => x.id === cb.value);
                    cb.checked = !!(o && (o.zone || 'غير مسجل').trim() === zoneName);
                });
            }, 120);
        }
    };

    // =========================================================================
    // 💓 5. إحياء الشريط العلوي (Header Pulse) وعدادات القائمة الجانبية الحية
    // =========================================================================
    window.initLiveHeaderAndSidebarUI = function () {
        // 1. حقن كبسولات النبض في الهيدر العلوي مكان شارة "متصل لايف" الصامتة
        const headerRight = document.querySelector('header .flex.items-center.gap-3');
        if (headerRight && !document.getElementById('lc-header-pulse-bar')) {
            const staticLiveSpan = headerRight.querySelector('span.text-emerald-600');
            if (staticLiveSpan) staticLiveSpan.classList.add('hidden');

            const pulseBar = document.createElement('div');
            pulseBar.id = 'lc-header-pulse-bar';
            pulseBar.className = 'flex items-center gap-1.5';
            pulseBar.innerHTML = `
                <button onclick="openFreezerModal()" id="lc-hdr-freezer-btn" title="رصيد الفريزر الفعلي الآن (اضغط للفتح)" class="lc-capsule bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-snowflake text-cyan-600"></i>
                    <span class="hidden sm:inline">الفريزر:</span>
                    <strong id="lc-hdr-freezer-count">0</strong>
                </button>

                <button onclick="jumpToRadarOrRecon()" id="lc-hdr-drivers-btn" title="حركة المناديب وعهدة الكاش بالشارع" class="lc-capsule bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-motorcycle text-indigo-600"></i>
                    <strong id="lc-hdr-drivers-count">0</strong>
                </button>

                <button onclick="openSmartBellNotifications(this)" data-lc-trigger="1" id="lc-hdr-bell-btn" title="جرس التنبيهات الذكي" class="lc-capsule relative bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm">
                    <i class="fa-solid fa-bell text-sm"></i>
                    <span id="lc-hdr-bell-badge" class="hidden absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm">0</span>
                </button>
            `;
            headerRight.insertBefore(pulseBar, headerRight.firstChild);
        }

        // 2. حقن شارات العدادات الحية داخل أزرار القائمة الجانبية (#sidebar)
        const sidebarMap = [
            { tab: 'orders', id: 'lc-sb-orders', cls: 'bg-amber-500 text-slate-950' },
            { tab: 'notes', id: 'lc-sb-notes', cls: 'bg-rose-500 text-white' },
            { tab: 'debts', id: 'lc-sb-debts', cls: 'bg-red-500 text-white' },
            { tab: 'batches', id: 'lc-sb-batches', cls: 'bg-teal-500 text-white' },
            { tab: 'radar', id: 'lc-sb-radar', cls: 'bg-indigo-500 text-white' },
            { tab: 'reconciliation', id: 'lc-sb-recon', cls: 'bg-emerald-500 text-white' }
        ];

        sidebarMap.forEach(item => {
            const btn = document.querySelector(`#sidebar button[onclick*="switchTab('${item.tab}'"]`);
            if (btn && !document.getElementById(item.id)) {
                btn.classList.add('justify-between');
                const labelText = btn.innerHTML;
                btn.innerHTML = `<span class="flex items-center">${labelText}</span><span id="${item.id}" class="hidden ${item.cls} text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">0</span>`;
            }
        });
    };

    window.updateLiveHeaderAndSidebar = function () {
        window.initLiveHeaderAndSidebarUI();

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const custList = (typeof customersData !== 'undefined' && Array.isArray(customersData)) ? customersData : [];
        const freezerObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};

        // 1. حساب إجمالي أطباق الفريزر
        const totalFreezer = Object.values(freezerObj).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
        const fzEl = document.getElementById('lc-hdr-freezer-count');
        if (fzEl) fzEl.innerText = totalFreezer;

        // 2. حساب الطلبات الحية والملاحظات والرادار وعهدة المناديب
        let newCount = 0, procCount = 0, dispCount = 0, notesCount = 0, unsettledDriverCash = 0;
        const todayIso = new Date().toISOString().split('T')[0];
        let dueTodayOrders = [];

        ordersList.forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (o.status === 'new') newCount++;
            if (o.status === 'processing') procCount++;
            if (o.status === 'dispatched') dispCount++;

            if (!['completed', 'canceled'].includes(o.status) && (o.adminNote || o.driverNote)) {
                notesCount++;
            }
            if (o.status === 'completed' && o.driverName && !o.isReconciled && !o.isSupplied && o.paymentMethod !== 'online') {
                unsettledDriverCash += Number(o.total) || 0;
            }
            if (['new', 'processing', 'deferred'].includes(o.status) && (o.deliveryStart === todayIso || o.deliveryEnd === todayIso)) {
                dueTodayOrders.push(o);
            }
        });

        // تحديث كبسولة المناديب بالهيدر
        const drvBtn = document.getElementById('lc-hdr-drivers-btn');
        const drvCnt = document.getElementById('lc-hdr-drivers-count');
        if (drvCnt) {
            if (unsettledDriverCash > 0) {
                drvCnt.innerText = `${dispCount} بالطريق | ${unsettledDriverCash}ج عهدة`;
                if (drvBtn) drvBtn.className = 'lc-capsule bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-sm';
            } else {
                drvCnt.innerText = `${dispCount} بالطريق`;
                if (drvBtn) drvBtn.className = 'lc-capsule bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-sm';
            }
        }

        // تحديث جرس التنبيهات الذكي
        const totalAlerts = newCount + dueTodayOrders.length + (unsettledDriverCash > 0 ? 1 : 0);
        const bellBadge = document.getElementById('lc-hdr-bell-badge');
        if (bellBadge) {
            if (totalAlerts > 0) {
                bellBadge.innerText = totalAlerts;
                bellBadge.classList.remove('hidden');
            } else {
                bellBadge.classList.add('hidden');
            }
        }

        // 3. تحديث عدادات القائمة الجانبية
        const setSbBadge = (id, val, suffix = '') => {
            const el = document.getElementById(id);
            if (!el) return;
            if (val > 0) {
                el.innerText = val.toLocaleString() + suffix;
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        };

        const totalMarketDebt = custList.reduce((s, c) => s + (Number(c.debt) > 0 ? Number(c.debt) : 0), 0);
        const openBatchesCount = Object.values(batchesObj).filter(b => b && b.isOpen && b.name && b.name !== 'undefined').length;

        setSbBadge('lc-sb-orders', newCount + procCount);
        setSbBadge('lc-sb-notes', notesCount);
        setSbBadge('lc-sb-debts', totalMarketDebt, ' ج');
        setSbBadge('lc-sb-batches', openBatchesCount);
        setSbBadge('lc-sb-radar', dispCount);
        setSbBadge('lc-sb-recon', unsettledDriverCash, ' ج');
    };

    window.jumpToRadarOrRecon = function () {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const hasUnsettled = ordersList.some(o => o && o.status === 'completed' && o.driverName && !o.isReconciled && !o.isSupplied && o.paymentMethod !== 'online');
        const targetTab = hasUnsettled ? 'reconciliation' : 'radar';
        const btn = document.querySelector(`#sidebar button[onclick*="switchTab('${targetTab}'"]`);
        if (btn) switchTab(targetTab, btn);
    };

    window.openSmartBellNotifications = function (anchorEl) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const todayIso = new Date().toISOString().split('T')[0];

        const newOrders = ordersList.filter(o => o && o.status === 'new' && !o.isArchived);
        const dueToday = ordersList.filter(o => o && ['new', 'processing', 'deferred'].includes(o.status) && !o.isArchived && (o.deliveryStart === todayIso || o.deliveryEnd === todayIso));
        const unsettledCash = ordersList
            .filter(o => o && o.status === 'completed' && o.driverName && !o.isReconciled && !o.isSupplied && o.paymentMethod !== 'online')
            .reduce((s, o) => s + (Number(o.total) || 0), 0);

        let itemsHtml = '';
        if (newOrders.length > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('orders', document.querySelector('#sidebar button[onclick*=\\'orders\\']')); setOrderTab('new');" class="p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer flex justify-between items-center">
                    <span class="text-xs font-black text-blue-900">🆕 طلبات جديدة تنتظر المراجعة</span>
                    <span class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">${newOrders.length}</span>
                </div>`;
        }
        if (dueToday.length > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('orders', document.querySelector('#sidebar button[onclick*=\\'orders\\']'));" class="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer flex justify-between items-center">
                    <span class="text-xs font-black text-amber-900">📅 طلبات موعد تسليمها اليوم</span>
                    <span class="bg-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">${dueToday.length}</span>
                </div>`;
        }
        if (unsettledCash > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); jumpToRadarOrRecon();" class="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer flex justify-between items-center">
                    <span class="text-xs font-black text-emerald-900">💰 كاش جاهز للتوريد مع المناديب</span>
                    <span class="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">${unsettledCash} ج</span>
                </div>`;
        }

        if (!itemsHtml) {
            itemsHtml = `<div class="text-center py-6 text-xs font-bold text-slate-400">لا توجد تنبيهات عاجلة حالياً، كل شيء منتظم ✅</div>`;
        }

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-slate-800"><i class="fa-solid fa-bell text-amber-500 ml-1"></i> مركز التنبيهات الفوري</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="space-y-2">${itemsHtml}</div>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    // =========================================================================
    // 🌪️ 6. نظام الطي الذكي ومنع التراكم في شاشة الطلبات (Zero-Clutter Collapse)
    // =========================================================================
    window.initZeroClutterOrdersScroll = function () {
        const sortBtn = document.getElementById('btn-sort-orders');
        if (sortBtn && !document.getElementById('lc-btn-toggle-toolbar')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'lc-btn-toggle-toolbar';
            toggleBtn.onclick = () => window.toggleSmartOrdersToolbarCollapse();
            toggleBtn.className = 'px-3 shrink-0 bg-white border border-slate-200 rounded-xl text-slate-700 hover:text-brand-primary hover:border-brand-primary hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5 shadow-sm text-xs font-black';
            toggleBtn.title = 'إظهار / طي شريط الفلاتر والملخص لمنع الزحام';
            toggleBtn.innerHTML = '<i class="fa-solid fa-sliders text-brand-primary"></i> <span class="hidden sm:inline">الفلاتر</span>';
            sortBtn.parentElement.insertBefore(toggleBtn, sortBtn);
        }

        const mainScroll = document.querySelector('main > div.flex-1.overflow-y-auto.custom-scroll');
        if (mainScroll && !mainScroll.hasAttribute('data-lc-scroll-bound')) {
            mainScroll.setAttribute('data-lc-scroll-bound', '1');
            mainScroll.addEventListener('scroll', () => {
                const ordersView = document.getElementById('view-orders');
                if (!ordersView || !ordersView.classList.contains('active')) return;
                const toolbar = document.getElementById('smart-orders-toolbar');
                if (!toolbar) return;

                const st = mainScroll.scrollTop;
                if (st > 140 && st > window.liveConnectState.lastScrollTop + 25 && !window.liveConnectState.toolbarCollapsed) {
                    toolbar.classList.add('lc-collapsed');
                    window.liveConnectState.toolbarCollapsed = true;
                } else if (st < 40 && window.liveConnectState.toolbarCollapsed) {
                    toolbar.classList.remove('lc-collapsed');
                    window.liveConnectState.toolbarCollapsed = false;
                }
                window.liveConnectState.lastScrollTop = st;
            }, { passive: true });
        }
    };

    window.toggleSmartOrdersToolbarCollapse = function () {
        const toolbar = document.getElementById('smart-orders-toolbar');
        if (!toolbar) return;
        window.liveConnectState.toolbarCollapsed = !window.liveConnectState.toolbarCollapsed;
        if (window.liveConnectState.toolbarCollapsed) {
            toolbar.classList.add('lc-collapsed');
        } else {
            toolbar.classList.remove('lc-collapsed');
        }
    };

    // =========================================================================
    // 🤝 7. توحيد مثلث المناديب (الرادار ⇄ تقفيل العهدة ⇄ الخزنة)
    // =========================================================================
    window.renderReconciliationUI = function () {
        const sel = document.getElementById('recon-driver-select');
        if (!sel) return;
        const curVal = sel.value;

        const driversSet = new Set();
        (storeSettings?.drivers || []).forEach(d => { if (d && d.name) driversSet.add(d.name.trim()); });
        (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).forEach(o => {
            if (o && o.driverName && o.driverName.trim()) driversSet.add(o.driverName.trim());
        });

        let html = `<option value="">-- اختر المندوب لتصفية عهدته --</option>`;
        Array.from(driversSet).forEach(dName => {
            html += `<option value="${dName}" ${curVal === dName ? 'selected' : ''}>🛵 ${dName}</option>`;
        });
        sel.innerHTML = html;
        if (curVal) window.calculateDriverReconciliation();
    };

    window.calculateDriverReconciliation = function () {
        const sel = document.getElementById('recon-driver-select');
        const cont = document.getElementById('recon-details-container');
        const settleBtn = document.getElementById('btn-settle-recon');
        if (!sel || !cont || !settleBtn) return;

        const dName = sel.value.trim();
        if (!dName) {
            cont.innerHTML = `<div class="text-center py-10 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl bg-white">برجاء اختيار مندوب لعرض عهدته.</div>`;
            settleBtn.classList.add('hidden');
            return;
        }

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const drvOrders = ordersList.filter(o => o && o.status !== 'trash' && !o.isArchived && (o.driverName || '').trim() === dName);

        const inWayOrders = drvOrders.filter(o => o.status === 'dispatched');
        const unsettledCompleted = drvOrders.filter(o => o.status === 'completed' && !o.isReconciled && !o.isSupplied);

        let totalCashRequired = 0;
        let totalDeliveryFees = 0;
        let onlineCount = 0;

        unsettledCompleted.forEach(o => {
            if (o.paymentMethod === 'online') {
                onlineCount++;
            } else {
                totalCashRequired += Number(o.total) || 0;
            }
            totalDeliveryFees += Number(o.deliveryFee) || 0;
        });

        const netStoreMoney = Math.max(0, totalCashRequired - totalDeliveryFees);

        let listHtml = unsettledCompleted.map(o => `
            <div class="bg-white p-3.5 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                    <div class="font-black text-slate-800 text-xs">${o.customerName || 'عميل'} <span class="text-indigo-600">(${o.zone || ''})</span></div>
                    <div class="text-[10px] font-bold text-slate-400">${(o.items || []).map(i => `${i.quantity}x ${i.name}`).join(' + ')}</div>
                </div>
                <div class="text-left">
                    ${o.paymentMethod === 'online'
                        ? `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-black">خالص أونلاين</span>`
                        : `<span class="font-black text-brand-primary text-sm">${o.total || 0} ج</span>`}
                </div>
            </div>
        `).join('');

        if (!listHtml) {
            listHtml = `<div class="text-center py-8 text-slate-400 font-bold bg-white rounded-xl border border-dashed border-slate-200">لا توجد طلبات مسلمة غير مقفلة لهذا المندوب حالياً ✅</div>`;
        }

        cont.innerHTML = `
            <div class="space-y-4">
                ${inWayOrders.length > 0 ? `
                <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl flex justify-between items-center text-xs font-black text-amber-800">
                    <span>⚠️ تنبيه: المندوب ما زال معه (${inWayOrders.length}) طلبات في الطريق لم تُسلم بعد</span>
                    <button onclick="switchTab('radar', document.querySelector('#sidebar button[onclick*=\\'radar\\']'))" class="bg-amber-600 text-white px-2.5 py-1 rounded-lg text-[10px]">فتح الرادار</button>
                </div>` : ''}

                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                        <span class="text-[10px] font-bold text-slate-400 block mb-1">طلبات مسلمة بالعهدة</span>
                        <span class="text-xl font-black text-slate-800">${unsettledCompleted.length} <span class="text-[10px] text-emerald-600">(${onlineCount} أونلاين)</span></span>
                    </div>
                    <div class="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-sm">
                        <span class="text-[10px] font-black text-amber-700 block mb-1">إجمالي الكاش مع المندوب</span>
                        <span class="text-xl font-black text-amber-700">${totalCashRequired.toLocaleString()} ج</span>
                    </div>
                    <div class="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200 shadow-sm">
                        <span class="text-[10px] font-black text-indigo-700 block mb-1">إجمالي الشحن بالطلبات</span>
                        <span class="text-xl font-black text-indigo-700">${totalDeliveryFees.toLocaleString()} ج</span>
                    </div>
                    <div class="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-sm">
                        <span class="text-[10px] font-black text-emerald-700 block mb-1">صافي المنتجات للدرج</span>
                        <span class="text-xl font-black text-emerald-700">${netStoreMoney.toLocaleString()} ج</span>
                    </div>
                </div>

                <div class="space-y-2 max-h-80 overflow-y-auto custom-scroll pr-1">${listHtml}</div>
            </div>
        `;

        if (unsettledCompleted.length > 0) {
            settleBtn.classList.remove('hidden');
            settleBtn.onclick = () => window.settleDriverCustodyUnified(dName, unsettledCompleted, totalCashRequired);
        } else {
            settleBtn.classList.add('hidden');
        }
    };

    window.settleDriverCustodyUnified = async function (driverName, ordersToSettle, totalCash) {
        if (!confirm(`تأكيد استلام مبلغ (${totalCash.toLocaleString()} ج) من المندوب (${driverName}) وتقفيل عهدة (${ordersToSettle.length}) طلبات في التقفيل والرادار معاً؟`)) return;

        const btn = document.getElementById('btn-settle-recon');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تصفية العهدة وتحديث الرادار...';
            btn.disabled = true;
        }

        try {
            const batch = db.batch();
            const nowStr = new Date().toLocaleDateString('en-US');

            ordersToSettle.forEach(o => {
                const ref = db.collection('orders').doc(o.id);
                batch.update(ref, {
                    isReconciled: true,
                    isSupplied: true,
                    reconciledAtStr: nowStr,
                    reconciledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                o.isReconciled = true;
                o.isSupplied = true;
                o.reconciledAtStr = nowStr;
                if (typeof globalOrdersMap !== 'undefined' && globalOrdersMap[o.id]) {
                    globalOrdersMap[o.id].isReconciled = true;
                    globalOrdersMap[o.id].isSupplied = true;
                }
            });

            await batch.commit();
            window.calculateDriverReconciliation();
            if (typeof window.renderDriversRadarUI === 'function') window.renderDriversRadarUI();
            if (typeof window.renderSmartDashboard === 'function') window.renderSmartDashboard();
            window.updateLiveHeaderAndSidebar();
            notifyQuickToast(`✅ تم تقفيل عهدة المندوب (${driverName}) وتصفير الرادار بنجاح`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء تقفيل عهدة المندوب!');
        }
        if (btn) {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // =========================================================================
    // 🔗 8. الربط التلقائي مع دوال النظام الأساسية (Auto-Hooking)
    // =========================================================================
    function hookIntoSystemFunctions() {
        // ربط مع renderOrdersList في www/orders.js
        if (typeof window.renderOrdersList === 'function' && !window.renderOrdersList._lcHooked) {
            const _origRenderOrders = window.renderOrdersList;
            const wrappedRenderOrders = function () {
                const res = _origRenderOrders.apply(this, arguments);
                window.initZeroClutterOrdersScroll();
                window.enhanceOrderCardsLive();
                window.updateLiveHeaderAndSidebar();
                return res;
            };
            wrappedRenderOrders._lcHooked = true;
            window.renderOrdersList = wrappedRenderOrders;
        }

        // ربط مع refreshCustomersData لتفعيل كبسولة المديونية في جدول العملاء أيضاً
        if (typeof window.refreshCustomersData === 'function' && !window.refreshCustomersData._lcHooked) {
            const _origRefreshCust = window.refreshCustomersData;
            const wrappedRefreshCust = function () {
                const res = _origRefreshCust.apply(this, arguments);
                setTimeout(() => {
                    document.querySelectorAll('#customers-tbody span[title*="عليه فلوس"]').forEach(sp => {
                        if (!sp.hasAttribute('data-lc-cust-debt')) {
                            sp.setAttribute('data-lc-cust-debt', '1');
                            sp.setAttribute('data-lc-trigger', '1');
                            sp.classList.add('lc-capsule');
                            const row = sp.closest('tr');
                            const phoneEl = row ? row.querySelector('div[dir="ltr"]') : null;
                            const phone = phoneEl ? phoneEl.innerText.trim() : '';
                            if (phone) {
                                sp.onclick = (e) => {
                                    e.stopPropagation();
                                    window.openDebtCapsulePopover(sp, phone, null);
                                };
                            }
                        }
                    });
                    window.updateLiveHeaderAndSidebar();
                }, 400);
                return res;
            };
            wrappedRefreshCust._lcHooked = true;
            window.refreshCustomersData = wrappedRefreshCust;
        }
    }

    function bootLiveConnect() {
        injectLiveConnectStyles();
        hookIntoSystemFunctions();
        window.initLiveHeaderAndSidebarUI();
        window.initZeroClutterOrdersScroll();
        window.enhanceOrderCardsLive();
        window.updateLiveHeaderAndSidebar();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => setTimeout(bootLiveConnect, 500));
    } else {
        setTimeout(bootLiveConnect, 500);
    }
})();
