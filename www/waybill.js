
// www/waybill.js
window.printSingleOrderWaybill = (orderId) => {
    let order = allOrdersRaw.find(o => o.id === orderId);
    if(!order) return;
    printWaybillHtml([order]);
};

window.printSelectedOrdersWaybills = () => {
    let selectedIds = Array.from(document.querySelectorAll('.bulk-order-cb:checked')).map(cb => cb.value);
    if(selectedIds.length === 0) return alert("اختر أوردر واحد على الأقل لطباعة البوالص!");
    let orders = allOrdersRaw.filter(o => selectedIds.includes(o.id));
    printWaybillHtml(orders);
};

window.printWaybillHtml = (orders) => {
    let slogan = document.getElementById('wb-slogan')?.value || 'طازج من مزارعنا لمائدتك';
    let footerMsg = document.getElementById('wb-footer-msg')?.value || 'تشرفنا بخدمتكم.. بالهنا والشفا 🤍';
    
    let html = `
    <html lang="ar" dir="rtl">
    <head>
        <title>بوالص الشحن الحرارية</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Cairo', sans-serif; background: #fff; margin: 0; padding: 0; }
            .waybill { width: 100mm; min-height: 100mm; padding: 5mm; box-sizing: border-box; page-break-after: always; border: 2px solid #000; display: flex; flex-direction: column; justify-content: space-between; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 3px; }
            .title { font-size: 22px; font-weight: 900; margin: 0; }
            .slogan { font-size: 10px; font-weight: 700; }
            .body { font-size: 13px; font-weight: 900; margin-top: 5px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .footer { text-align: center; border-top: 2px dashed #000; padding-top: 5px; font-size: 11px; font-weight: 700; }
        </style>
    </head>
    <body>`;

    orders.forEach(o => {
        let itemsStr = o.items ? o.items.map(i => `${i.quantity}x ${i.name}`).join('، ') : '';
        html += `
        <div class="waybill">
            <div class="header">
                <div class="title">سمان ههيا</div>
                <div class="slogan">${slogan}</div>
            </div>
            <div class="body">
                <div class="row"><span>العميل: ${o.customerName}</span></div>
                <div class="row"><span dir="ltr">الموبايل: ${o.customerPhone}</span></div>
                <div class="row"><span>المنطقة: ${o.zone}</span></div>
                <div class="row"><span>العنوان: ${o.customerAddress || 'بدون تفاصيل'}</span></div>
                <div style="border-top: 1px solid #000; margin: 5px 0; padding-top: 5px;">
                    <div>الطلبات: ${itemsStr}</div>
                </div>
                <div class="row" style="font-size: 16px; margin-top: 5px;">
                    <span>الإجمالي:</span>
                    <span>${o.total} ج.م</span>
                </div>
            </div>
            <div class="footer">${footerMsg}</div>
        </div>`;
    });

    html += `
        <script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }</script>
    </body>
    </html>`;

    let w = window.open('', '', 'width=600,height=800');
    w.document.write(html);
    w.document.close();
};

window.previewSampleWaybill = () => {
    window.printWaybillHtml([{
        customerName: 'أحمد محمد (تجربة)',
        customerPhone: '01012345678',
        zone: 'ههيا',
        customerAddress: 'شارع الجمهورية',
        items: [{quantity: 2, name: 'طبق جامبو'}],
        total: 220
    }]);
};
