// === www/orders.js - غرفة عمليات الطلبات V2 (Safe Overlay) ===
// تمت البرمجة لضمان الأمان المحاسبي والسرعة المطلقة

let compactModeV2 = false;

// 1. الفلترة الذكية والملخص اللحظي
window.renderOrdersList = () => {
    const listCont = document.getElementById('orders-list-vertical');
    if (!listCont) return;

    let q = (document.getElementById('search-order') ? document.getElementById('search-order').value.toLowerCase().trim() : '');
    let zoneFilter = document.getElementById('smart-filter-zone') ? document.getElementById('smart-filter-zone').value : 'all';
    let paymentFilter = document.getElementById('smart-filter-payment') ? document.getElementById('smart-filter-payment').value : 'all';

    let filtered = allOrdersRaw.filter(o => {
        let matchTab = (currentOrderTab === 'all') || (o.status === currentOrderTab);
        let matchSearch = q === '' || (o.name && o.name.toLowerCase().includes(q)) || (o.phone && o.phone.includes(q)) || (o.id && o.id.toLowerCase().includes(q));
        let matchZone = (zoneFilter === 'all') || (o.zone === zoneFilter);
        let matchPayment = (paymentFilter === 'all') || 
                           (paymentFilter === 'online' && o.paymentMethod === 'online') || 
                           (paymentFilter === 'cash' && (!o.paymentMethod || o.paymentMethod === 'cash'));
        
        return matchTab && matchSearch && matchZone && matchPayment;
    });

    // ترتيب زمني تنازلي (الأحدث أولاً)
    filtered.sort((a, b) => new Date(b.createdAtStr || 0) - new Date(a.createdAtStr || 0));

    // تحديث الملخص اللحظي
    let totalItemsCount = 0;
    let totalRevenue = 0;
    filtered.forEach(o => {
        totalRevenue += (Number(o.total) || 0);
        if(o.items) o.items.forEach(i => totalItemsCount += (Number(i.qty) || 0));
    });

    if(document.getElementById('strip-count')) document.getElementById('strip-count').innerText = filtered.length;
    if(document.getElementById('strip-items')) document.getElementById('strip-items').innerText = totalItemsCount;
    if(document.getElementById('strip-total')) document.getElementById('strip-total').innerText = totalRevenue.toLocaleString();

    listCont.innerHTML = '';

    if (filtered.length === 0) {
        listCont.innerHTML = `<div class="text-center text-slate-400 py-10 font-bold text-sm bg-white rounded-2xl border border-slate-100"><i class="fa-solid fa-box-open text-4xl mb-3 text-slate-200 block"></i> لا توجد طلبات تطابق الفلتر الحالي</div>`;
        return;
    }

    filtered.forEach(order => {
        listCont.innerHTML += buildSmartOrderCardV2(order);
    });

    if(typeof updateOrderBadges === 'function') updateOrderBadges();
    populateSmartFiltersV2();
};

// 2. الجيل الجديد من كارت الطلب (Smart Card 2.0)
function buildSmartOrderCardV2(order) {
    let statusColors = { 
        'new': 'bg-blue-100 text-blue-700 border-blue-200', 
        'processing': 'bg-amber-100 text-amber-700 border-amber-200', 
        'dispatched': 'bg-indigo-100 text-indigo-700 border-indigo-200',
        'deferred': 'bg-orange-100 text-orange-700 border-orange-200', 
        'no_answer': 'bg-purple-100 text-purple-700 border-purple-200', 
        'completed': 'bg-emerald-100 text-emerald-700 border-emerald-200', 
        'canceled': 'bg-slate-100 text-slate-600 border-slate-200' 
    };
    
    let statusNames = {
        'new': 'جديد', 'processing': 'تجهيز', 'dispatched': 'في الطريق', 'deferred': 'مؤجل', 'no_answer': 'لم يرد', 'completed': 'مكتمل', 'canceled': 'ملغي'
    };

    let sColor = statusColors[order.status] || statusColors['new'];
    let sName = statusNames[order.status] || order.status;
    
    // المساعد البيعي الذكي (Upsell AI)
    let aiUpsellHtml = '';
    if(order.status === 'new') {
        let history = allOrdersRaw.filter(o => o.phone === order.phone && o.status === 'completed');
        if(history.length > 0) {
            history.sort((a,b) => new Date(b.createdAtStr) - new Date(a.createdAtStr));
            let daysSince = (new Date() - new Date(history[0].createdAtStr)) / (1000*3600*24);
            
            if(daysSince > 30) {
                aiUpsellHtml = `<div class="w-full bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200/50 p-2.5 rounded-xl text-[10px] font-black mt-2 mb-2 flex items-center gap-2 shadow-sm"><i class="fa-solid fa-wand-magic-sparkles text-amber-500 animate-pulse text-sm"></i> <span>العميل غايب من ${Math.floor(daysSince)} يوم! اقترح عليه منتج إضافي أو هدية لضمان استمراره.</span></div>`;
            }
        }
    }

    // زر الخطوة التالية السريع
    let nextStepBtn = '';
    if(order.status === 'new') {
        nextStepBtn = `<button onclick="updateOrderStatusV2('${order.id}', 'processing')" class="bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black transition-colors border border-amber-200 shadow-sm flex-1"><i class="fa-solid fa-hourglass-half mr-1"></i> نقل للتجهيز</button>`;
    } else if(order.status === 'processing') {
        nextStepBtn = `<button onclick="updateOrderStatusV2('${order.id}', 'dispatched')" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black transition-colors border border-indigo-200 shadow-sm flex-1"><i class="fa-solid fa-motorcycle mr-1"></i> خروج للتوصيل</button>`;
    } else if(order.status === 'dispatched') {
        nextStepBtn = `<button onclick="updateOrderStatusV2('${order.id}', 'completed')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black transition-colors border border-emerald-200 shadow-sm flex-1"><i class="fa-solid fa-check-double mr-1"></i> تأكيد التسليم</button>`;
    }

    let itemsHtml = (order.items||[]).map(i => `<div class="flex justify-between text-xs font-bold text-slate-700 mb-1.5 last:mb-0"><span class="flex items-center gap-1.5"><i class="fa-solid fa-box text-[9px] text-brand-primary"></i> ${i.qty}x ${i.name}</span><span class="text-slate-600">${i.price * i.qty} ج</span></div>`).join('');

    if(compactModeV2) {
        return `
        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center gap-3 hover:border-brand-primary/30 transition-all cursor-pointer" ondblclick="if(typeof openEditOrderModal === 'function') openEditOrderModal('${order.id}')">
            <input type="checkbox" value="${order.id}" class="order-checkbox w-5 h-5 accent-brand-primary shrink-0 rounded" onchange="updateBulkBarV2()">
            <div class="flex-1 flex items-center gap-3 overflow-hidden">
                <span class="text-xs font-black text-slate-800 truncate w-24">${order.name}</span>
                <span class="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg shrink-0">${order.zone || 'بدون منطقة'}</span>
                <span class="text-xs font-black text-emerald-600 shrink-0">${order.total} ج</span>
            </div>
            <span class="${sColor} px-2 py-1 rounded-lg text-[10px] font-black shrink-0 border">${sName}</span>
        </div>`;
    }

    return `
    <div class="bg-white p-4 lg:p-5 rounded-[1.5rem] border border-slate-100 shadow-soft hover:border-brand-primary/20 transition-all relative group">
        <div class="absolute top-4 left-4 flex gap-2 z-10">
            ${order.paymentMethod === 'online' ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg text-[9px] font-black border border-emerald-100 shadow-sm"><i class="fa-regular fa-credit-card"></i> خالص</span>` : ''}
            <span class="${sColor} px-2.5 py-1 rounded-lg text-[10px] font-black border shadow-sm">${sName}</span>
            <input type="checkbox" value="${order.id}" class="order-checkbox w-5 h-5 accent-brand-primary rounded shadow-sm cursor-pointer" onchange="updateBulkBarV2()">
        </div>
        
        <div class="flex items-start gap-3 mb-3 relative z-0">
            <div class="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                ${(order.name && order.name.length > 0) ? order.name.charAt(0) : '?'}
            </div>
            <div class="pr-1">
                <h3 class="font-black text-slate-800 text-sm flex items-center gap-2 cursor-pointer hover:text-brand-primary transition-colors" onclick="if(typeof openEditOrderModal === 'function') openEditOrderModal('${order.id}')">${order.name} <i class="fa-solid fa-pen text-[10px] text-slate-300"></i></h3>
                <p class="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span class="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded"><i class="fa-solid fa-phone text-slate-400"></i> <span dir="ltr">${order.phone}</span></span>
                    <span class="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded"><i class="fa-solid fa-location-dot text-slate-400"></i> ${order.zone || 'بدون منطقة'}</span>
                </p>
            </div>
        </div>
        
        ${aiUpsellHtml}

        <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4 shadow-inner">
            ${itemsHtml}
            <div class="border-t border-slate-200 mt-2 pt-2 flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-100">التوصيل: ${order.deliveryFee} ج</span>
                <span class="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100 shadow-sm">الإجمالي: ${order.total} ج</span>
            </div>
        </div>
        
        <div class="flex flex-wrap gap-2 items-center">
            ${nextStepBtn}
            <button onclick="splitOrderV2('${order.id}')" class="bg-white text-slate-600 hover:bg-slate-800 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black transition-all border border-slate-200 shadow-sm"><i class="fa-solid fa-scissors mr-1"></i> تقسيم</button>
            <a href="https://wa.me/2${order.phone}?text=${encodeURIComponent('أهلاً بك يا فندم من سمان ههيا، بخصوص أوردر حضرتك...')}" target="_blank" class="w-9 h-9 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white rounded-xl flex items-center justify-center transition-all border border-[#25D366]/20 shadow-sm shrink-0"><i class="fa-brands fa-whatsapp text-lg"></i></a>
        </div>
    </div>`;
}

// 3. المحاسبة وتغيير الحالة لطلب واحد (دالة آمنة تضمن نقاط العميل والتواريخ)
window.updateOrderStatusV2 = async (orderId, newStatus) => {
    try {
        let orderRef = db.collection("orders").doc(orderId);
        let orderData = allOrdersRaw.find(o => o.id === orderId);
        if(!orderData) return;

        let now = new Date().toISOString();
        let updates = { status: newStatus, lastModified: now };

        // محاسبة النقاط للعميل عند الاكتمال
        if(newStatus === 'completed' && orderData.status !== 'completed') {
            updates.completedAtStr = now;
            if(typeof storeSettings !== 'undefined' && storeSettings.pointsPer100) {
                let pts = Math.floor(orderData.total / 100) * storeSettings.pointsPer100;
                if(pts > 0 && orderData.phone) {
                    let cusRef = db.collection("customers").doc(orderData.phone);
                    await cusRef.set({ points: firebase.firestore.FieldValue.increment(pts) }, { merge: true });
                }
            }
        }

        await orderRef.update(updates);
        orderData.status = newStatus;
        if(updates.completedAtStr) orderData.completedAtStr = updates.completedAtStr;
        renderOrdersList();
        
    } catch (e) {
        console.error("Error updating status:", e);
        alert('حدث خطأ أثناء تغيير الحالة');
    }
};

// 4. إصلاح المحاسبة في التحديد الجماعي الذكي 
window.bulkChangeStatusV2 = async (newStatus) => {
    let checkboxes = document.querySelectorAll('.order-checkbox:checked');
    if(checkboxes.length === 0) return alert('يرجى تحديد طلبات أولاً!');
    
    if(!confirm(`هل أنت متأكد من تغيير حالة ${checkboxes.length} طلب؟`)) return;

    let btn = document.querySelector(`button[onclick="bulkChangeStatusV2('${newStatus}')"]`);
    let origHtml = btn ? btn.innerHTML : '';
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; btn.disabled = true; }

    try {
        let batchProcess = db.batch();
        let now = new Date().toISOString();
        
        for(let cb of checkboxes) {
            let oid = cb.value;
            let orderRef = db.collection("orders").doc(oid);
            let orderData = allOrdersRaw.find(o => o.id === oid);
            if(!orderData) continue;
            
            let updates = { status: newStatus, lastModified: now };
            
            if(newStatus === 'completed' && orderData.status !== 'completed') {
                updates.completedAtStr = now;
                if(typeof storeSettings !== 'undefined' && storeSettings.pointsPer100) {
                    let pts = Math.floor(orderData.total / 100) * storeSettings.pointsPer100;
                    if(pts > 0 && orderData.phone) {
                        let cusRef = db.collection("customers").doc(orderData.phone);
                        batchProcess.set(cusRef, { points: firebase.firestore.FieldValue.increment(pts) }, { merge: true });
                    }
                }
            }
            batchProcess.update(orderRef, updates);
        }
        
        await batchProcess.commit();
        document.getElementById('select-all-orders').checked = false;
        document.getElementById('bulk-actions-bar').classList.add('hidden');
        alert('تم تنفيذ الإجراء الجماعي بنجاح! ✅');
        
    } catch(e) {
        console.error(e);
        alert('حدث خطأ في النظام الجماعي! تأكد من الاتصال بالإنترنت.');
    }
    
    if(btn) { btn.innerHTML = origHtml; btn.disabled = false; }
};

// 5. تقسيم الأوردر بضغطة واحدة (مثالي لو رصيد الفريزر لا يكفي)
window.splitOrderV2 = async (orderId) => {
    let originalOrder = allOrdersRaw.find(o => o.id === orderId);
    if(!originalOrder) return;
    
    if(!originalOrder.items || originalOrder.items.length !== 1) {
        return alert("عذراً، يجب أن يحتوي الطلب على صنف واحد فقط لتفعيل التقسيم الآلي السريع.");
    }
    
    let currentQty = parseInt(originalOrder.items[0].qty);
    if(currentQty <= 1) {
        return alert("الكمية 1 ولا يمكن تقسيمها أكثر من ذلك.");
    }

    let qtyToSplit = prompt(`الطلب يحتوي على ${currentQty} ${originalOrder.items[0].name}.\nأدخل الكمية التي تريد فصلها لترحيلها في طلب جديد (مؤجل):`);
    qtyToSplit = parseInt(qtyToSplit);
    
    if(!qtyToSplit || isNaN(qtyToSplit) || qtyToSplit <= 0 || qtyToSplit >= currentQty) {
        return alert("تم الإلغاء أو الكمية المدخلة غير صحيحة.");
    }

    let newOrder = JSON.parse(JSON.stringify(originalOrder)); // نسخ دقيق للبيانات
    newOrder.id = 'ord_' + Date.now() + Math.floor(Math.random()*1000);
    newOrder.status = 'deferred'; 
    newOrder.createdAtStr = new Date().toISOString();
    
    // تعديل الكميات وتوزيعها
    originalOrder.items[0].qty = currentQty - qtyToSplit;
    newOrder.items[0].qty = qtyToSplit;
    
    // إعادة حساب الإجمالي للماليّات بدقة
    originalOrder.total = (originalOrder.items[0].qty * originalOrder.items[0].price) + (parseInt(originalOrder.deliveryFee) || 0);
    newOrder.total = (newOrder.items[0].qty * newOrder.items[0].price) + (parseInt(newOrder.deliveryFee) || 0);

    try {
        await Promise.all([
            db.collection("orders").doc(originalOrder.id).set(originalOrder),
            db.collection("orders").doc(newOrder.id).set(newOrder)
        ]);
        alert("تم شق الأوردر بنجاح! ✂️\nالجزء المفصول تم تحويله لحالة 'مؤجل'.");
    } catch(e) { 
        console.error("Error splitting order", e);
        alert("حدث خطأ أثناء التقسيم."); 
    }
};

// 6. الترتيب الجغرافي الذكي للبوالص (Smart Waybill Routing)
window.smartPrintWaybillsV2 = () => {
    let checkboxes = document.querySelectorAll('.order-checkbox:checked');
    if(checkboxes.length === 0) return alert('يرجى تحديد طلبات لطباعة بوالصها أولاً.');
    
    let selectedIds = Array.from(checkboxes).map(cb => cb.value);
    let selectedOrders = allOrdersRaw.filter(o => selectedIds.includes(o.id));
    
    // الفرز الجغرافي لترتيب الورق للمندوب وتسهيل خط السير
    selectedOrders.sort((a, b) => (a.zone || '').localeCompare(b.zone || ''));
    
    localStorage.setItem('waybill_orders', JSON.stringify(selectedOrders));
    window.open('waybill.html', '_blank');
};

// --- دوال الواجهة المساعدة ---
window.toggleSelectAllV2 = (isChecked) => {
    let checkboxes = document.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => {
        if(cb.closest('div').parentElement.style.display !== 'none') {
            cb.checked = isChecked;
        }
    });
    updateBulkBarV2();
};

window.updateBulkBarV2 = () => {
    let checkedCount = document.querySelectorAll('.order-checkbox:checked').length;
    let bar = document.getElementById('bulk-actions-bar');
    if(bar) {
        if(checkedCount > 0) { 
            bar.classList.remove('hidden'); 
            let countSpan = document.getElementById('bulk-count');
            if(countSpan) countSpan.innerText = checkedCount; 
        } else { 
            bar.classList.add('hidden'); 
        }
    }
};

window.toggleCompactModeV2 = () => { 
    compactModeV2 = !compactModeV2; 
    renderOrdersList(); 
};

window.populateSmartFiltersV2 = () => {
    let zSelect = document.getElementById('smart-filter-zone');
    if(zSelect && zSelect.options.length <= 1 && typeof storeSettings !== 'undefined' && storeSettings.deliveryZones) {
        storeSettings.deliveryZones.forEach(z => {
            if(z.name && !Array.from(zSelect.options).some(opt => opt.value === z.name)) {
                zSelect.innerHTML += `<option value="${z.name}">${z.name}</option>`;
            }
        });
    }
};
