
// www/drivers.js
window.dispatchOrdersRaw = [];
window.pendingDispatchData = null;

window.openDispatchModal = () => {
    const sel = document.getElementById('dispatch-driver-select'); 
    sel.innerHTML = '<option value="">-- اختر المندوب --</option>';
    (storeSettings.drivers || []).forEach(d => sel.innerHTML += `<option value="${d.phone}">${d.name} (${d.phone})</option>`);
    
    const cont = document.getElementById('dispatch-orders-list');
    let processingOrders = allOrdersRaw.filter(o => o.status === 'processing');
    dispatchOrdersRaw = processingOrders;

    if(processingOrders.length === 0) { 
        cont.innerHTML = '<div class="text-center py-10 border-2 border-dashed rounded-2xl"><p class="text-xs font-bold text-slate-400">لا توجد طلبات قيد التجهيز.</p></div>'; 
    } else { 
        cont.innerHTML = processingOrders.map(o => `
            <div class="bg-slate-50 p-4 rounded-xl border flex items-start gap-3">
                <input type="checkbox" class="disp-cb accent-indigo-500 w-4 h-4" value="${o.id}">
                <div class="flex-1">
                    <h5 class="font-black text-sm text-slate-800">${o.customerName} <span class="text-xs text-brand-primary">${o.total} ج</span></h5>
                    <p class="text-[11px] text-slate-500 font-bold">${o.zone} - ${o.customerAddress || ''}</p>
                </div>
            </div>`).join('');
    }
    openModal('dispatch-modal');
};

window.toggleAllDispatchCheckboxes = () => {
    let cbs = document.querySelectorAll('.disp-cb');
    let allChecked = Array.from(cbs).every(cb => cb.checked);
    cbs.forEach(cb => cb.checked = !allChecked);
};

window.previewDispatchMessage = () => {
    const select = document.getElementById('dispatch-driver-select');
    let phone = select.value;
    if(!phone) return alert("اختر المندوب أولاً!");
    let selectedIds = Array.from(document.querySelectorAll('.disp-cb:checked')).map(cb => cb.value);
    if(selectedIds.length === 0) return alert("اختر طلبات للتوجيه!");
    
    let selectedOrders = dispatchOrdersRaw.filter(o => selectedIds.includes(o.id));
    let msg = `*🗺️ خط سير المندوب*\n\n`;
    selectedOrders.forEach((o, i) => {
        msg += `[ ${i+1} ] ${o.customerName} - ${o.customerPhone}\nالعنوان: ${o.zone} / ${o.customerAddress || ''}\nالمطلوب: ${o.total} ج\n\n`;
    });

    let cleanPhone = phone.startsWith('0') ? '2' + phone : phone;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    
    selectedIds.forEach(async id => {
        await db.collection('orders').doc(id).update({ status: 'dispatched' });
    });
    closeModal('dispatch-modal');
};

window.setRadarDriverFilter = () => {};
window.toggleRadarSupplied = () => {};
window.setRadarStatusFilter = () => {};
window.renderDriversRadarUI = () => {};
window.calculateDriverReconciliation = () => {};
window.renderReconciliationUI = () => {};
