// =========================================================================
// ⚡ محرك الترابط الحي، تثبيت تبويبات الطلبات الذكي، الكبسولات، ووضع المسابقة (live-connect.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM) - النسخة البريميوم الكاملة
// =========================================================================

(function () {
    // 1. حالة نظام الترابط الحي والتمرير الذكي
    window.liveConnectState = {
        toolbarCollapsed: false,
        autoCollapseOnScroll: true,
        lastScrollTop: 0,
        activePopoverOrderId: null
    };

    // =========================================================================
    // 🎨 2. حقن تنسيقات التثبيت الدائم لتبويبات (جديد ومكتمل) والطي الذكي للبحث
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
                transform: translateY(-1px) scale(1.02);
                box-shadow: 0 4px 12px -2px rgba(6, 78, 59, 0.16) !important;
            }
            .lc-capsule:active {
                transform: scale(0.95);
            }
            #lc-floating-popover {
                animation: lcPopIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes lcPopIn {
                from { opacity: 0; transform: translateY(6px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            /* السطر العلوي الموحد الرشيق (46px فقط — منع أي تداخل بين العنوان والأيقونات) */
            header {
                height: 46px !important;
                min-height: 46px !important;
                max-height: 46px !important;
                gap: 0.35rem !important;
                padding-left: 0.5rem !important;
                padding-right: 0.5rem !important;
                transition: max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), height 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, border-width 0.18s ease !important;
                overflow: hidden;
            }
            @media (max-width: 639px) {
                #sman-live-sync-pill {
                    padding: 0.2rem !important;
                    min-width: 18px !important;
                    height: 18px !important;
                    justify-content: center !important;
                }
                #sman-live-sync-pill span:not(.rounded-full) {
                    display: none !important;
                }
            }
            @media (min-width: 1024px) {
                header {
                    padding-left: 1.25rem !important;
                    padding-right: 1.25rem !important;
                }
            }

            /* منع ارتداد المتصفح التلقائي (Scroll Anchoring) المسبب للرعشة أثناء السحب */
            main > div.flex-1.overflow-y-auto.custom-scroll {
                overflow-anchor: none !important;
                -webkit-overflow-scrolling: touch;
                overscroll-behavior-y: contain;
            }

            /* تثبيت الكروت بدون اهتزاز التكبير والتصغير عند اللمس على الموبايل */
            .order-card {
                transform: none !important;
                contain: layout style;
            }

            /* ضمان ظهور القائمة الجانبية دائماً فوق شريط البحث والتبويبات بدون أي تداخل */
            #mobile-overlay {
                z-index: 54 !important;
            }
            #sidebar {
                z-index: 58 !important;
            }

            /* 🔥 الإصلاح الجذري: إلغاء قفل الارتفاع (h-full) عن شاشة الطلبات لتظل تبويبات (جديد ومكتمل) ثابتة لآخر طلب في الصفحة */
            #view-orders.page-view.active {
                height: auto !important;
                min-height: 100% !important;
                overflow: visible !important;
                transform: none !important;
                animation: none !important;
            }

            /* الحاوية المثبتة دائماً في أعلى شاشة الطلبات (بدون blur مسبب للرعشة وبـ z-index آمن خلف القائمة الجانبية) */
            #lc-orders-sticky-shell {
                position: sticky !important;
                top: -1rem !important;
                z-index: 20 !important;
                background: #f1f5f9 !important;
                transform: translateZ(0);
                backface-visibility: hidden;
                margin-left: -1rem !important;
                margin-right: -1rem !important;
                padding-left: 0.75rem !important;
                padding-right: 0.75rem !important;
                padding-top: 0.45rem !important;
                padding-bottom: 0.45rem !important;
                border-bottom: 1px solid rgba(203, 213, 225, 0.9) !important;
                box-shadow: 0 4px 12px -4px rgba(15, 23, 42, 0.07) !important;
            }
            @media (min-width: 1024px) {
                #lc-orders-sticky-shell {
                    top: -2rem !important;
                    margin-left: -2rem !important;
                    margin-right: -2rem !important;
                    padding-left: 2rem !important;
                    padding-right: 2rem !important;
                }
            }

            /* ثبات تام للشريط المثبت بدون أي تغيير ارتفاع يسبب رعشة أثناء السكرول */
            #lc-collapsible-search-row {
                margin-bottom: 0;
            }
            #lc-quick-unfold-search-btn {
                display: inline-flex !important;
            }

            /* تمرير أفقي فائق النعومة لتبويبات المراحل */
            .lc-no-scrollbar {
                overflow-x: auto;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                touch-action: pan-x;
                scrollbar-width: none;
            }
            .lc-no-scrollbar::-webkit-scrollbar {
                display: none;
            }

            /* قناع حماية خصوصية أرقام العملاء أثناء العرض أمام لجنة المسابقة */
            body.pitch-privacy-mode [dir="ltr"]:not(input):not(textarea) {
                filter: blur(4px);
                transition: filter 0.2s ease;
                user-select: none;
            }
            body.pitch-privacy-mode [dir="ltr"]:not(input):not(textarea):hover {
                filter: blur(0);
            }

            /* 👑 القائمة الجانبية البريميوم بنظام شبكة التطبيقات الملكية (Royal Bento Grid) 👑 */
            #sidebar {
                background: linear-gradient(180deg, #031d18 0%, #052e25 58%, #021612 100%) !important;
                border-left: 1px solid rgba(245, 158, 11, 0.24) !important;
                box-shadow: -12px 0 34px rgba(2, 20, 16, 0.5) !important;
            }
            #sidebar > div:first-child {
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(6, 78, 59, 0.35)) !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            }
            #sidebar .sb-hero-tile {
                background: rgba(255, 255, 255, 0.06) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                padding: 0.6rem 0.75rem !important;
                margin-bottom: 0 !important;
                border-radius: 1rem !important;
                color: #ecfdf5 !important;
            }
            #sidebar .sb-hero-tile > div > i {
                width: 2rem !important;
                height: 2rem !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: 0.7rem !important;
                background: rgba(16, 185, 129, 0.18) !important;
                border: 1px solid rgba(52, 211, 153, 0.3) !important;
                font-size: 0.9rem !important;
                flex-shrink: 0 !important;
            }
            #sidebar .sb-tile {
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
                justify-content: space-between !important;
                gap: 0.45rem !important;
                padding: 0.65rem 0.7rem !important;
                margin: 0 !important;
                border-radius: 1rem !important;
                background: rgba(255, 255, 255, 0.055) !important;
                border: 1px solid rgba(255, 255, 255, 0.09) !important;
                color: rgba(236, 253, 245, 0.9) !important;
                text-align: right !important;
                transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.14s ease !important;
            }
            #sidebar .sb-tile:active {
                transform: scale(0.96);
            }
            #sidebar .sb-tile:hover {
                background: rgba(255, 255, 255, 0.1) !important;
                border-color: rgba(245, 158, 11, 0.3) !important;
                color: #ffffff !important;
            }
            #sidebar .sb-tile > i {
                width: 1.9rem !important;
                height: 1.9rem !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: 0.65rem !important;
                background: rgba(255, 255, 255, 0.09) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                font-size: 0.85rem !important;
                margin: 0 !important;
            }
            #sidebar .sb-tile-label {
                display: block;
                font-size: 0.72rem;
                font-weight: 800;
                line-height: 1.25;
                width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #sidebar .sb-tile-badge {
                position: absolute;
                top: 0.45rem;
                left: 0.45rem;
                font-size: 0.6rem;
                font-weight: 900;
                padding: 0.1rem 0.42rem;
                border-radius: 9999px;
                line-height: 1.2;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
            }
            #sidebar .nav-btn.active {
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.24) 0%, rgba(16, 185, 129, 0.28) 100%) !important;
                border: 1px solid rgba(245, 158, 11, 0.65) !important;
                color: #ffffff !important;
                box-shadow: 0 6px 16px -6px rgba(245, 158, 11, 0.35) !important;
            }
            #sidebar .nav-btn.active > i,
            #sidebar .sb-hero-tile.active > div > i {
                background: linear-gradient(135deg, #f59e0b, #fbbf24) !important;
                color: #031d18 !important;
                border-color: #fde68a !important;
            }
            #sidebar .sb-mini-foot {
                margin: 0 !important;
                padding: 0.4rem 0.5rem !important;
            }


            /* ترقية رؤوس وجداول الصفحات القديمة (البلاك ليست، المديونيات، أرشيف الدفعات، سلة المحذوفات) */
            #view-blacklist > div:first-child,
            #view-debts > div:first-child,
            #view-archive > div:first-child,
            #view-trash > div:first-child {
                background: linear-gradient(135deg, #042f2e 0%, #064e3b 58%, #0f172a 100%) !important;
                border: 1.5px solid rgba(245, 158, 11, 0.38) !important;
                color: #ffffff !important;
                box-shadow: 0 12px 28px -8px rgba(4, 47, 46, 0.28) !important;
            }
            #view-blacklist > div:first-child h2,
            #view-debts > div:first-child h2,
            #view-archive > div:first-child h3,
            #view-trash > div:first-child h3 {
                color: #fef3c7 !important;
            }
            #view-blacklist > div:first-child p,
            #view-debts > div:first-child p,
            #view-archive > div:first-child p,
            #view-trash > div:first-child p {
                color: rgba(209, 250, 229, 0.85) !important;
            }
            #view-blacklist > div:first-child input,
            #view-debts > div:first-child input {
                background: rgba(255, 255, 255, 0.96) !important;
                color: #0f172a !important;
                border-color: rgba(245, 158, 11, 0.4) !important;
            }
            #view-blacklist thead,
            #view-debts thead {
                background: linear-gradient(90deg, #064e3b, #0f172a) !important;
                color: #fde68a !important;
            }
            #view-debts thead th {
                color: #fde68a !important;
            }
        `;
        document.head.appendChild(style);
    }


    // =========================================================================
    // 🧩 3. فصل الخانات العلوية عن تبويبات (جديد ومكتمل) لتثبيت التبويبات وحدها
    // =========================================================================
    window.restructureOrdersStickyLayout = function () {
        const ordersView = document.getElementById('view-orders');
        if (!ordersView) return;

        // إزالة h-full من شاشة الطلبات حتى لا ينكسر التثبيت بعد أول شاشة
        ordersView.classList.remove('h-full');

        const searchInput = document.getElementById('search-order');
        const tabAllBtn = document.getElementById('tab-all');
        const bulkBar = document.getElementById('bulk-actions-bar');
        const ordersListContainer = document.getElementById('orders-list-vertical');

        if (!searchInput || !tabAllBtn || !ordersListContainer) return;

        // إذا تم تقسيم الهيكل بنجاح من قبل، نتأكد فقط من نقل شريط الملخص الأسود للأعلى
        if (document.getElementById('lc-orders-sticky-shell')) {
            const smartToolbar = document.getElementById('smart-orders-toolbar');
            const nonStickyTop = document.getElementById('lc-orders-nonsticky-top');
            if (smartToolbar && nonStickyTop && smartToolbar.parentElement !== nonStickyTop) {
                nonStickyTop.appendChild(smartToolbar);
            }
            return;
        }

        // العثور على الحاوية العلوية الأصلية
        const origStickyWrapper = searchInput.closest('.sticky') || document.getElementById('orders-sticky-search-bar') || ordersView.firstElementChild;
        if (!origStickyWrapper) return;

        // 1. إنشاء حاوية غير مثبتة في أعلى الصفحة للأدوات الرباعية وشريط الملخص الأسود (تتحرك طبيعياً مع السكرول ولا تأكل الشاشة)
        const nonStickyTop = document.createElement('div');
        nonStickyTop.id = 'lc-orders-nonsticky-top';
        nonStickyTop.className = 'bg-white p-3 rounded-2xl border border-slate-200/80 shadow-soft mb-2.5 space-y-2';

        // 2. إنشاء الحاوية المثبتة الرشيقة التي تلازم أعلى الشاشة دائماً
        const stickyShell = document.createElement('div');
        stickyShell.id = 'lc-orders-sticky-shell';
        stickyShell.className = 'mb-3';

        // أ) وضع الأدوات والملخص ومربع البحث في الجزء العلوي المتحرك طبيعياً (صفر تغيير ارتفاع = صفر هزة)
        const searchRowDrawer = document.createElement('div');
        searchRowDrawer.id = 'lc-collapsible-search-row';

        const toolsFourGrid = origStickyWrapper.querySelector('.grid.grid-cols-4') || document.querySelector('#orders-top-tools-area .grid.grid-cols-4');
        if (toolsFourGrid) {
            nonStickyTop.appendChild(toolsFourGrid);
        }

        const smartToolbar = document.getElementById('smart-orders-toolbar');
        if (smartToolbar) {
            nonStickyTop.appendChild(smartToolbar);
        }

        const searchBarWrap = document.createElement('div');
        searchBarWrap.className = 'flex gap-1.5 items-center pt-1';
        const searchInputBox = searchInput.parentElement;
        const sortBtn = document.getElementById('btn-sort-orders');
        if (searchInputBox) searchBarWrap.appendChild(searchInputBox);
        if (sortBtn) searchBarWrap.appendChild(sortBtn);
        searchRowDrawer.appendChild(searchBarWrap);
        nonStickyTop.appendChild(searchRowDrawer);

        // ب) الشريط المثبت يحتوي فقط على تبويبات المراحل بارتفاع ثابت 100% + زر عدسة يطلعك للبحث بلمسة
        const tabsRow = tabAllBtn.parentElement;
        if (tabsRow) {
            tabsRow.className = 'flex items-center gap-1.5 lc-no-scrollbar pb-0.5 shrink-0';

            if (!document.getElementById('lc-quick-unfold-search-btn')) {
                const unfoldBtn = document.createElement('button');
                unfoldBtn.type = 'button';
                unfoldBtn.id = 'lc-quick-unfold-search-btn';
                unfoldBtn.onclick = () => {
                    const mainScroll = document.querySelector('main > div.flex-1.overflow-y-auto.custom-scroll');
                    if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => document.getElementById('search-order')?.focus(), 220);
                };
                unfoldBtn.className = 'bg-brand-primary text-white w-8 h-8 rounded-xl text-xs font-black items-center justify-center shrink-0 shadow-sm active:scale-90 transition-transform';
                unfoldBtn.title = 'الانتقال السريع لمربع البحث';
                unfoldBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
                tabsRow.insertBefore(unfoldBtn, tabsRow.firstChild);
            }
        }

        if (tabsRow) stickyShell.appendChild(tabsRow);
        if (bulkBar) {
            bulkBar.classList.add('mt-2');
            stickyShell.appendChild(bulkBar);
        }


        // إدراج الحاويتين قبل قائمة كروت الطلبات وإزالة الحاوية القديمة الفارغة
        ordersView.insertBefore(nonStickyTop, ordersListContainer);
        ordersView.insertBefore(stickyShell, ordersListContainer);

        const oldToolsArea = document.getElementById('orders-top-tools-area');
        if (oldToolsArea && oldToolsArea !== nonStickyTop) oldToolsArea.remove();
        if (origStickyWrapper && origStickyWrapper !== stickyShell && origStickyWrapper !== nonStickyTop) {
            origStickyWrapper.remove();
        }
    };

    // =========================================================================
    // 🎈 4. نظام النافذة الطائرة الموضعية السريعة (Micro-Popover Engine)
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
    // 🏆 5. محرك وضع العرض التنفيذي للمسابقة (Competition Pitch Mode)
    // =========================================================================
    window.togglePitchPrivacyMask = function () {
        document.body.classList.toggle('pitch-privacy-mode');
        const isMasked = document.body.classList.contains('pitch-privacy-mode');
        const btn = document.getElementById('pitch-privacy-btn');
        if (btn) {
            btn.className = isMasked
                ? 'bg-emerald-500 text-slate-950 px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md transition-all'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all';
            btn.innerHTML = isMasked
                ? '<i class="fa-solid fa-eye-slash"></i> إخفاء أرقام العملاء: مفعّل ✅'
                : '<i class="fa-solid fa-user-shield text-amber-400"></i> تمويه أرقام العملاء أمام اللجنة';
        }
        notifyQuickToast(isMasked ? '🔒 تم تمويه أرقام الهواتف لحماية خصوصية العملاء أثناء العرض' : '🔓 تم إظهار أرقام الهواتف بشكل طبيعي');
    };

    window.togglePitchFullscreen = function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            notifyQuickToast('🖥️ تم تفعيل وضع ملء الشاشة السينمائي للعرض');
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    window.jumpFromPitchModal = function (actionType) {
        const modal = document.getElementById('competition-pitch-modal');
        if (modal) modal.classList.add('hidden');

        if (actionType === 'printer') {
            if (typeof window.openWaybillSettingsModal === 'function') window.openWaybillSettingsModal();
        } else if (actionType === 'safe') {
            switchTab('dashboard', document.querySelector('#sidebar button[onclick*="dashboard"]'));
            if (typeof window.updateDashState === 'function') window.updateDashState('activeSubTab', 'ledger_waste');
        } else if (actionType === 'batches') {
            switchTab('batches', document.querySelector('#sidebar button[onclick*="batches"]'));
        } else if (actionType === 'orders') {
            switchTab('orders', document.querySelector('#sidebar button[onclick*="orders"]'));
        } else if (actionType === 'blacklist') {
            switchTab('blacklist', document.querySelector('#sidebar button[onclick*="blacklist"]'));
        }
    };

    window.openCompetitionPitchModal = function () {
        const t0 = performance.now();
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw.filter(o => o && o.status !== 'trash') : [];
        const custList = (typeof customersData !== 'undefined' && Array.isArray(customersData)) ? customersData : [];
        const compOrders = ordersList.filter(o => o.status === 'completed').length;
        const completionRate = ordersList.length > 0 ? Math.round((compOrders / ordersList.length) * 100) : 100;
        const isMasked = document.body.classList.contains('pitch-privacy-mode');
        const elapsedMs = Math.max(0.2, (performance.now() - t0)).toFixed(2);

        let modal = document.getElementById('competition-pitch-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'competition-pitch-modal';
            modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[240] hidden flex items-center justify-center p-3 sm:p-5';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-slate-900 text-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] border-2 border-amber-500/40">
                <div class="bg-gradient-to-l from-emerald-950 via-slate-900 to-slate-950 p-5 border-b border-white/10 flex flex-wrap justify-between items-center gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 text-2xl shadow-lg">
                            <i class="fa-solid fa-trophy"></i>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-base sm:text-lg font-black text-white">سمان ههيا — نظام تخطيط الموارد والإدارة المركزية (Mini-ERP & CRM)</h3>
                                <span class="bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] font-black">سرعة الاستجابة: ${elapsedMs} ms ⚡</span>
                            </div>
                            <p class="text-xs text-slate-300 font-bold mt-0.5">بنية هجينة فائقة السرعة (Offline-First Mirror + Native Android Hardware Bridge 203 DPI)</p>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('competition-pitch-modal').classList.add('hidden')" class="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div class="p-5 overflow-y-auto custom-scroll space-y-5 flex-1">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white/5 p-3 rounded-2xl border border-white/10">
                        <button type="button" id="pitch-privacy-btn" onclick="togglePitchPrivacyMask()" class="${isMasked ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'} px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all">
                            <i class="fa-solid ${isMasked ? 'fa-eye-slash' : 'fa-user-shield text-amber-400'}"></i>
                            <span>${isMasked ? 'إخفاء أرقام العملاء: مفعّل ✅' : 'تمويه أرقام العملاء أمام اللجنة (Privacy Mode)'}</span>
                        </button>
                        <button type="button" onclick="togglePitchFullscreen()" class="bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all">
                            <i class="fa-solid fa-expand text-sky-400"></i>
                            <span>تفعيل وضع ملء الشاشة السينمائي (Fullscreen)</span>
                        </button>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div class="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                            <span class="text-[10px] text-slate-400 font-bold block">إجمالي الطلبات المدارة</span>
                            <span class="text-2xl font-black text-amber-400 mt-1 block">${ordersList.length.toLocaleString()}</span>
                        </div>
                        <div class="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                            <span class="text-[10px] text-slate-400 font-bold block">قاعدة بيانات العملاء</span>
                            <span class="text-2xl font-black text-emerald-400 mt-1 block">${custList.length.toLocaleString()}</span>
                        </div>
                        <div class="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                            <span class="text-[10px] text-slate-400 font-bold block">كفاءة إتمام التسليم</span>
                            <span class="text-2xl font-black text-sky-400 mt-1 block">${completionRate}%</span>
                        </div>
                        <div class="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                            <span class="text-[10px] text-slate-400 font-bold block">زمن القراءة من الكاش</span>
                            <span class="text-2xl font-black text-purple-400 mt-1 block">0.0 s</span>
                        </div>
                    </div>

                    <div class="space-y-2.5">
                        <h4 class="text-xs font-black text-amber-300 flex items-center gap-1.5">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> اضغط على أي ابتكار لاستعراضه مباشرة أمام لجنة التحكيم:
                        </h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div onclick="jumpFromPitchModal('printer')" class="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400 p-3.5 rounded-2xl cursor-pointer transition-all">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-black text-amber-300">🖨️ 1. محرك الطباعة الحراري الأصلي (TSPL 203 DPI)</span>
                                    <i class="fa-solid fa-arrow-up-left-from-square text-[10px] text-slate-400"></i>
                                </div>
                                <p class="text-[11px] text-slate-300 font-bold leading-relaxed">يرسم البوليصة وتكت ميزان الفراخ بالجرام على Canvas ويحولها لأوامر هاردوير مباشرة عبر بلوتوث APK وUSB لطابعة Deli E750W.</p>
                            </div>

                            <div onclick="jumpFromPitchModal('safe')" class="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400 p-3.5 rounded-2xl cursor-pointer transition-all">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-black text-emerald-300">🏦 2. الخزنة المزدوجة الذكية والجرد السنوي</span>
                                    <i class="fa-solid fa-arrow-up-left-from-square text-[10px] text-slate-400"></i>
                                </div>
                                <p class="text-[11px] text-slate-300 font-bold leading-relaxed">فصل تام لصافي المنتجات عن الشحن، مع تغطية تلقائية للمصروفات من الكاش ثم الأونلاين أو تحويل الباقي لديون آجلة بأقساط مؤرخة.</p>
                            </div>

                            <div onclick="jumpFromPitchModal('batches')" class="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-teal-400 p-3.5 rounded-2xl cursor-pointer transition-all">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-black text-teal-300">🐣 3. التتبع البيولوجي للدفعات ومصفوفة الجرامات</span>
                                    <i class="fa-solid fa-arrow-up-left-from-square text-[10px] text-slate-400"></i>
                                </div>
                                <p class="text-[11px] text-slate-300 font-bold leading-relaxed">يحسب عمر الطائر يومياً من تاريخ الفقس، ويوزع الأصناف ذكياً، ويرحل المذبوح للفريزر الفعلي مع خصم أوزان الفرخات بالجرام.</p>
                            </div>

                            <div onclick="jumpFromPitchModal('blacklist')" class="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-rose-400 p-3.5 rounded-2xl cursor-pointer transition-all">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-black text-rose-300">🛡️ 4. رادار كشف التحايل والبلاك ليست المشروط</span>
                                    <i class="fa-solid fa-arrow-up-left-from-square text-[10px] text-slate-400"></i>
                                </div>
                                <p class="text-[11px] text-slate-300 font-bold leading-relaxed">يكتشف تحايل العميل المحظور حتى لو غيّر رقم هاتفه عبر مطابقة الاسم والعنوان الذكية، ولا يفك الحظر إلا بعد التزامه بطلبات مسبقة الدفع.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    };

    // =========================================================================
    // 💊 6. تفعيل الكبسولات الحية على كروت الطلبات
    // =========================================================================
    window.enhanceOrderCardsLive = function () {
        const container = document.getElementById('orders-list-vertical');
        if (!container) return;

        const cards = container.querySelectorAll('.order-card[data-id]');
        cards.forEach(card => {
            const orderId = card.getAttribute('data-id');
            const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
            if (!order) return;

            const paySpans = card.querySelectorAll('span');
            paySpans.forEach(sp => {
                const txt = sp.innerText.trim();

                if ((txt === 'كاش' || txt === 'خالص (أونلاين)' || txt === 'خالص أونلاين') && !sp.hasAttribute('data-lc-pay')) {
                    sp.setAttribute('data-lc-pay', '1');
                    sp.setAttribute('data-lc-trigger', '1');
                    sp.classList.add('lc-capsule');
                    sp.title = 'اضغط للتحويل الفوري بين كاش وخالص أونلاين';
                    sp.onclick = (e) => {
                        e.stopPropagation();
                        window.openPaymentCapsulePopover(sp, orderId);
                    };
                }

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

            const zoneSpan = card.querySelector('[data-zone-pill="1"]') || card.querySelector('span[ondblclick*="\'zone\'"]');
            if (zoneSpan && !zoneSpan.hasAttribute('data-lc-zone')) {
                zoneSpan.setAttribute('data-lc-zone', '1');
                zoneSpan.setAttribute('data-lc-trigger', '1');
                zoneSpan.classList.add('lc-capsule');
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

            if (!['completed', 'canceled', 'trash'].includes(order.status)) {
                const itemBoxes = card.querySelectorAll('[data-item-idx]');
                itemBoxes.forEach(box => {
                    const idx = parseInt(box.getAttribute('data-item-idx'));
                    if (isNaN(idx)) return;
                    const nameTarget = box.querySelector('span.font-black.text-slate-800') || box;
                    if (nameTarget && !nameTarget.hasAttribute('data-lc-item')) {
                        nameTarget.setAttribute('data-lc-item', '1');
                        nameTarget.setAttribute('data-lc-trigger', '1');
                        nameTarget.classList.add('lc-capsule');
                        nameTarget.title = 'اضغط لتعديل كمية الصنف (+ / -) فوراً';
                        nameTarget.onclick = (e) => {
                            if (e.target && e.target.getAttribute('ondblclick')) return;
                            e.stopPropagation();
                            window.openItemQtyCapsulePopover(box, orderId, idx);
                        };
                    }
                });
            }
        });
    };

    window.openQuickDriverDispatch = function (anchorEl, orderId) {
        const order = (typeof allOrdersRaw !== 'undefined' ? allOrdersRaw : []).find(o => o.id === orderId);
        if (!order) return;

        const drivers = (typeof storeSettings !== 'undefined' && Array.isArray(storeSettings.drivers)) ? storeSettings.drivers : [];
        if (drivers.length === 0) {
            if (typeof window.openDispatchModal === 'function') return window.openDispatchModal();
            return alert('يرجى إضافة مندوب أولاً من قسم إعدادات المتجر!');
        }

        const drvRows = drivers.map(d => {
            const safeName = (d.name || '').replace(/'/g, "\\'");
            const safePhone = (d.phone || '').replace(/'/g, "\\'");
            return `
                <div class="flex items-center gap-1.5">
                    <button onclick="assignSingleOrderToDriver('${orderId}', '${safeName}', '${safePhone}', false)" class="flex-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-900 hover:text-white py-2 px-3 rounded-xl text-xs font-black text-right transition-all flex items-center justify-between border border-indigo-100">
                        <span>🛵 ${d.name}</span>
                        <span class="text-[10px] opacity-75">تحويل للطريق</span>
                    </button>
                    <button onclick="assignSingleOrderToDriver('${orderId}', '${safeName}', '${safePhone}', true)" class="bg-[#25D366] hover:bg-[#1ebd57] text-white w-9 h-9 rounded-xl text-sm font-black flex items-center justify-center shadow-sm shrink-0" title="تحويل للطريق + إرسال تفاصيل الطلب واتساب للمندوب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                </div>
            `;
        }).join('');

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-indigo-800"><i class="fa-solid fa-motorcycle ml-1"></i> إرسال الطلب مع مندوب</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="bg-slate-50 p-2 rounded-xl border border-slate-100 text-[11px] font-bold text-slate-600">
                    👤 <strong class="text-slate-800">${order.customerName || ''}</strong> (${order.zone || ''}) - <strong class="text-brand-primary">${order.total || 0} ج</strong>
                </div>
                <div class="space-y-1.5 max-h-52 overflow-y-auto custom-scroll pr-0.5">${drvRows}</div>
                <button onclick="closeLivePopover(); openDispatchModalForOrder('${orderId}')" class="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-list-check text-amber-400"></i> فتح شاشة التوجيه الجماعي وخطوط السير
                </button>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    window.openDispatchModalForOrder = function (orderId) {
        if (typeof window.openDispatchModal === 'function') {
            window.openDispatchModal();
            setTimeout(() => {
                document.querySelectorAll('.disp-cb').forEach(cb => {
                    cb.checked = (cb.value === orderId);
                });
            }, 150);
        }
    };

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
                    const prevMap = (order.freezerDeductedMap && typeof order.freezerDeductedMap === 'object') ? { ...order.freezerDeductedMap } : {};
                    const prevDed = Math.max(0, Number(prevMap[targetItem.id]) || 0);
                    let nextFz = curFz;
                    let nextDed = prevDed;

                    if (diffQty > 0) {
                        const actualDed = Math.min(curFz, diffQty);
                        nextFz = Number((curFz - actualDed).toFixed(3));
                        nextDed = Number((prevDed + actualDed).toFixed(3));
                    } else if (diffQty < 0) {
                        const actualReturn = Math.min(prevDed, Math.abs(diffQty));
                        nextFz = Number((curFz + actualReturn).toFixed(3));
                        nextDed = Number(Math.max(0, prevDed - actualReturn).toFixed(3));
                    }

                    prevMap[targetItem.id] = nextDed;
                    order.freezerDeductedMap = prevMap;
                    batch.update(db.collection('orders').doc(orderId), { freezerDeductedMap: prevMap });
                    if (nextFz !== curFz) {
                        storeFreezer[targetItem.id] = nextFz;
                        batch.set(db.collection('inventory').doc('freezer'), {
                            [targetItem.id]: nextFz
                        }, { merge: true });
                    }
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

            const noteText = `[${new Date().toLocaleDateString('ar-EG')}] ✅ تم تحصيل ${payAmount} ج من المديونية السابقة.`;
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

    window.openDriverCapsulePopover = function (anchorEl, orderId, driverName) {
        const dName = (driverName || '').trim();
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const drvOrders = ordersList.filter(o => o && o.status !== 'trash' && !o.isArchived && (o.driverName || '').trim() === dName);

        const inWayOrders = drvOrders.filter(o => o.status === 'dispatched');
        const inWayCount = inWayOrders.length;
        const cashWithDriver = inWayOrders.reduce((s, o) => s + getOrderCashForDriver(o), 0);

        const drvObj = (storeSettings?.drivers || []).find(d => (d.name || '').trim() === dName);
        const drvPhone = drvObj?.phone || '';

        let otherDriversOpts = `<option value="">-- نقل الأوردر لمندوب آخر --</option>`;
        (storeSettings?.drivers || []).forEach(d => {
            if (d.name && d.name.trim() !== dName) {
                otherDriversOpts += `<option value="${d.name.trim()}|${d.phone || ''}">🛵 ${d.name}</option>`;
            }
        });
        otherDriversOpts += `<option value="REMOVE|">❌ إلغاء تعيين المندوب (إرجاع للتجهيز)</option>`;

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
    // 💓 7. السطر العلوي الموحد الرشيق (46px فقط) + شريط الموبايل السفلي
    // =========================================================================
    window.syncBottomDockActiveTab = function (activeTabId) {
        const cur = activeTabId || window.smanCurrentActiveTab || 'dashboard';
        document.querySelectorAll('.lc-dock-btn').forEach(btn => {
            const t = btn.getAttribute('data-dock-tab');
            if (t === cur) {
                btn.className = 'lc-dock-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-brand-primary font-black scale-105 transition-all';
            } else {
                btn.className = 'lc-dock-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-400 hover:text-slate-700 font-bold transition-all';
            }
        });
    };

    window.initLiveHeaderAndSidebarUI = function () {
        const oldSecondRibbon = document.getElementById('lc-top-five-icons-ribbon');
        if (oldSecondRibbon) oldSecondRibbon.remove();

        const headerEl = document.querySelector('header');
        const headerLeftGroup = headerEl ? headerEl.firstElementChild : null;
        const headerRight = document.querySelector('header .flex.items-center.gap-3') || (headerEl ? headerEl.lastElementChild : null);

        if (headerLeftGroup) {
            headerLeftGroup.className = 'flex items-center gap-1.5 shrink-0 min-w-0';
            const hdrTitle = document.getElementById('header-title');
            if (hdrTitle) {
                hdrTitle.className = 'text-xs sm:text-base font-black text-slate-800 tracking-tight truncate max-w-[90px] sm:max-w-none';
            }
            const menuBtn = headerLeftGroup.querySelector('button[onclick*="toggleSidebar"]');
            if (menuBtn) {
                menuBtn.className = 'md:hidden w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0 text-xs';
            }
        }

        if (headerRight) {
            headerRight.className = 'flex items-center gap-1 sm:gap-1.5 lc-no-scrollbar py-0.5';

            const oldUpdateBtn = headerRight.querySelector('button[onclick*="forceUpdateAppNow"]:not([data-lc-slim])');
            if (oldUpdateBtn) oldUpdateBtn.classList.add('hidden');

            const staticLiveSpan = headerRight.querySelector('span.text-emerald-600');
            if (staticLiveSpan) staticLiveSpan.classList.add('hidden');

            const origAddBtn = headerRight.querySelector('button[onclick*="add-order-modal"], button[onclick*="safeOpenAddOrderModal"]');
            if (origAddBtn) {
                origAddBtn.className = 'hidden md:flex bg-brand-primary hover:bg-emerald-800 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-sm transition-all items-center gap-1 active:scale-95 shrink-0';
                origAddBtn.setAttribute('onclick', 'safeOpenAddOrderModal()');
                origAddBtn.innerHTML = '<i class="fa-solid fa-plus text-amber-300"></i> <span>طلب جديد</span>';
            }

            const saveBtn = document.getElementById('global-save-btn');
            if (saveBtn) {
                const showSaveNow = ['inventory', 'settings', 'marketing', 'batches'].includes(window.smanCurrentActiveTab || '');
                saveBtn.className = `bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-sm transition-all flex items-center gap-1 shrink-0${showSaveNow ? '' : ' hidden'}`;
                saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up text-amber-400"></i> <span>حفظ</span>';
            }


            if (!document.getElementById('lc-header-pulse-bar')) {
                const inlineBar = document.createElement('div');
                inlineBar.id = 'lc-header-pulse-bar';
                inlineBar.className = 'flex items-center gap-1 sm:gap-1.5 shrink-0';
                inlineBar.innerHTML = `
                    <!-- 1. كبسولة الفريزر -->
                    <button type="button" onclick="openFreezerModal()" id="lc-hdr-freezer-btn" title="مخزن الفريزر الفعلي" class="lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border border-cyan-200/80 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shrink-0">
                        <i class="fa-solid fa-snowflake text-cyan-600"></i>
                        <strong id="lc-hdr-freezer-count">0</strong>
                    </button>

                    <!-- 2. كبسولة المناديب -->
                    <button type="button" onclick="jumpToRadarOrRecon()" id="lc-hdr-drivers-btn" title="رادار وتقفيل المناديب" class="lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200/80 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shrink-0">
                        <i class="fa-solid fa-motorcycle text-indigo-600"></i>
                        <strong id="lc-hdr-drivers-count">0</strong>
                    </button>

                    <!-- 3. كبسولة طابعة البوالص (Deli 750W) -->
                    <button type="button" onclick="if(window.openWaybillSettingsModal) openWaybillSettingsModal();" id="lc-hdr-printer-btn" title="استوديو طابعة البوالص الحرارية Deli 750W" class="lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shrink-0">
                        <i class="fa-solid fa-print text-amber-600"></i>
                        <span class="hidden sm:inline">Deli</span>
                    </button>

                    <!-- 4. كبسولة جرس المهام -->
                    <button type="button" onclick="openSmartBellNotifications(this)" data-lc-trigger="1" id="lc-hdr-bell-btn" title="رادار المهام والتنبيهات الفوري" class="lc-capsule relative h-8 w-8 sm:w-auto sm:px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 text-[10px] sm:text-[11px] font-black flex items-center justify-center gap-1 shrink-0">
                        <i class="fa-solid fa-bell text-emerald-600"></i>
                        <span class="hidden lg:inline">المهام</span>
                        <span id="lc-hdr-bell-badge" class="hidden absolute -top-1 -left-1 bg-red-600 text-white text-[9px] font-black min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center shadow-sm border border-white">0</span>
                    </button>

                    <!-- 5. كبسولة وضع المسابقة 🏆 -->
                    <button type="button" onclick="openCompetitionPitchModal()" id="lc-pitch-mode-btn" title="وضع العرض التنفيذي للمسابقة وإخفاء أرقام العملاء" class="lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 border border-amber-500/30 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shadow-sm shrink-0">
                        <i class="fa-solid fa-trophy text-slate-950"></i>
                        <span class="hidden xl:inline">المسابقة</span>
                    </button>

                    <!-- 6. كبسولة التحديث الواضحة -->
                    <button type="button" data-lc-slim="1" onclick="forceUpdateAppNow()" title="تحديث فوري لأحدث نسخة" class="lc-capsule h-8 px-2.5 rounded-xl bg-sky-50 hover:bg-sky-600 text-sky-900 hover:text-white border border-sky-300 text-[10px] sm:text-[11px] font-black flex items-center justify-center gap-1 shadow-sm shrink-0">
                        <i class="fa-solid fa-rotate text-sky-600"></i>
                        <span>تحديث</span>
                    </button>
                `;
                headerRight.insertBefore(inlineBar, headerRight.firstChild);
            }
        }

        const oldFab = document.getElementById('lc-mobile-fab-add-order');
        if (oldFab) oldFab.remove();

        if (!document.getElementById('lc-mobile-bottom-dock')) {
            const dock = document.createElement('nav');
            dock.id = 'lc-mobile-bottom-dock';
            dock.className = 'md:hidden fixed bottom-0 inset-x-0 z-[65] bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-[0_-8px_25px_rgba(15,23,42,0.08)] grid grid-cols-5 items-center';
            dock.innerHTML = `
                <button type="button" data-dock-tab="dashboard" onclick="switchTab('dashboard', document.querySelector('#sidebar button[onclick*=\\'dashboard\\']')); syncBottomDockActiveTab('dashboard');" class="lc-dock-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-brand-primary font-black">
                    <i class="fa-solid fa-chart-pie text-sm mb-0.5"></i>
                    <span class="text-[10px]">القيادة</span>
                </button>
                <button type="button" data-dock-tab="orders" onclick="switchTab('orders', document.querySelector('#sidebar button[onclick*=\\'orders\\']')); syncBottomDockActiveTab('orders');" class="lc-dock-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-400 font-bold">
                    <i class="fa-solid fa-bolt text-sm mb-0.5"></i>
                    <span class="text-[10px]">الطلبات</span>
                </button>
                <button type="button" onclick="safeOpenAddOrderModal()" class="flex flex-col items-center justify-center -mt-5">
                    <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-dark to-emerald-600 text-white shadow-lg shadow-brand-primary/35 border-2 border-white flex items-center justify-center text-lg active:scale-90 transition-transform">
                        <i class="fa-solid fa-plus text-amber-300"></i>
                    </div>
                    <span class="text-[9px] font-black text-brand-primary mt-0.5">طلب جديد</span>
                </button>
                <button type="button" data-dock-tab="batches" onclick="switchTab('batches', document.querySelector('#sidebar button[onclick*=\\'batches\\']')); syncBottomDockActiveTab('batches');" class="lc-dock-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-400 font-bold">
                    <i class="fa-solid fa-layer-group text-sm mb-0.5"></i>
                    <span class="text-[10px]">الدفعات</span>
                </button>
                <button type="button" data-dock-tab="radar" onclick="jumpToRadarOrRecon(); syncBottomDockActiveTab('radar');" class="lc-dock-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-400 font-bold">
                    <i class="fa-solid fa-satellite-dish text-sm mb-0.5"></i>
                    <span class="text-[10px]">المناديب</span>
                </button>
            `;
            document.body.appendChild(dock);
        }

        window.syncBottomDockActiveTab();

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

    function getOrderCashForDriver(o) {
        if (!o || o.paymentMethod === 'online') return 0;
        if (o.paymentMethod === 'split') {
            return (o.paidCash !== undefined) ? (Number(o.paidCash) || 0) : Math.max(0, (Number(o.total) || 0) - (Number(o.paidOnline) || 0));
        }
        return Number(o.total) || 0;
    }

    window.updateLiveHeaderAndSidebar = function () {
        window.initLiveHeaderAndSidebarUI();
        window.restructureOrdersStickyLayout();

        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const custList = (typeof customersData !== 'undefined' && Array.isArray(customersData)) ? customersData : [];
        const freezerObj = (typeof storeFreezer !== 'undefined' && storeFreezer) ? storeFreezer : {};
        const prodsObj = (typeof storeProducts !== 'undefined' && storeProducts) ? storeProducts : {};
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};

        let totalFreezerMeat = 0;
        Object.keys(freezerObj).forEach(pId => {
            const q = Math.max(0, Number(freezerObj[pId]) || 0);
            if (q > 0) {
                const pName = String(prodsObj[pId]?.name || '').toLowerCase();
                const isExtra = prodsObj[pId]?.isExtra || pId === 'eggs' || pId === 'chicks' || pName.includes('بيض') || pName.includes('كتكوت') || pName.includes('كتاكيت');
                if (!isExtra) totalFreezerMeat += q;
            }
        });
        const fzEl = document.getElementById('lc-hdr-freezer-count');
        if (fzEl) fzEl.innerHTML = `${totalFreezerMeat}<span class="hidden sm:inline mr-0.5">طبق</span>`;

        let newCount = 0, procCount = 0, dispCount = 0, noAnsCount = 0, notesCount = 0;
        let unsettledGrossCash = 0;

        ordersList.forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (o.status === 'new') newCount++;
            else if (o.status === 'processing') procCount++;
            else if (o.status === 'dispatched') dispCount++;
            else if (o.status === 'no_answer' || o.status === 'deferred') noAnsCount++;

            if (!['completed', 'canceled'].includes(o.status) && (o.adminNote || o.driverNote)) {
                notesCount++;
            }
            // الكاش بعهدة المندوب = الطلبات التي ما زالت (في الطريق - dispatched) فقط؛ لأن أي طلب مكتمل وصلت فلوسه بالفعل
            if (o.status === 'dispatched' && o.driverName) {
                unsettledGrossCash += getOrderCashForDriver(o);
            }
        });

        let unsettledCountForPill = 0;
        ordersList.forEach(o => {
            if (o && o.status !== 'trash' && !o.isArchived && o.status === 'completed' && o.driverName && !o.isReconciled && !o.isSupplied && getOrderCashForDriver(o) > 0) {
                unsettledCountForPill++;
            }
        });

        const drvBtn = document.getElementById('lc-hdr-drivers-btn');
        const drvCnt = document.getElementById('lc-hdr-drivers-count');
        if (drvCnt) {
            if (unsettledGrossCash > 0) {
                const mobileVal = dispCount > 0 ? `${dispCount} • ${unsettledGrossCash.toLocaleString()}ج` : `${unsettledCountForPill} للتوريد`;
                drvCnt.innerHTML = `<span class="md:hidden">${mobileVal}</span><span class="hidden md:inline">${dispCount} • ${unsettledGrossCash.toLocaleString()}ج</span>`;
                if (drvBtn) drvBtn.className = 'lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shrink-0';
            } else if (dispCount > 0) {
                drvCnt.innerHTML = `<span>${dispCount}</span><span class="hidden sm:inline"> بالطريق</span>`;
                if (drvBtn) drvBtn.className = 'lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shrink-0';
            } else {
                drvCnt.innerHTML = `<span>0</span>`;
                if (drvBtn) drvBtn.className = 'lc-capsule h-8 px-2 sm:px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 text-[10px] sm:text-[11px] font-black flex items-center gap-1 shrink-0';
            }
        }

        let batchAlertCount = 0;
        Object.keys(batchesObj).forEach(bId => {
            if (batchesObj[bId]?.isOpen && typeof window.getBatchCeilingAndRemaining === 'function') {
                const cap = window.getBatchCeilingAndRemaining(bId);
                if (cap.ceilingPairs > 0 && cap.remainingPairs <= 5) batchAlertCount++;
            }
        });

        const pendingFarmBatches = Object.keys(batchesObj).filter(bId => batchesObj[bId] && batchesObj[bId].pendingApproval === true);
        if (typeof window.checkPendingFarmBatchesBanner === 'function') {
            window.checkPendingFarmBatchesBanner(pendingFarmBatches);
        }

        let activeTasksGroups = 0;
        if (pendingFarmBatches.length > 0) activeTasksGroups++;
        if (newCount > 0) activeTasksGroups++;
        if (procCount > 0) activeTasksGroups++;
        if (noAnsCount > 0) activeTasksGroups++;
        if (unsettledGrossCash > 0) activeTasksGroups++;
        if (batchAlertCount > 0) activeTasksGroups++;

        const bellBadge = document.getElementById('lc-hdr-bell-badge');
        if (bellBadge) {
            if (activeTasksGroups > 0) {
                bellBadge.innerText = activeTasksGroups;
                bellBadge.classList.remove('hidden');
            } else {
                bellBadge.classList.add('hidden');
            }
        }

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

        setSbBadge('lc-sb-orders', newCount + procCount + dispCount);
        setSbBadge('lc-sb-notes', notesCount);
        setSbBadge('lc-sb-debts', totalMarketDebt, ' ج');
        setSbBadge('lc-sb-batches', openBatchesCount);
        setSbBadge('lc-sb-radar', dispCount);
        setSbBadge('lc-sb-recon', unsettledGrossCash, ' ج');
    };

    window.jumpToRadarOrRecon = function () {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const firstDispatched = ordersList.find(o => o && o.status === 'dispatched' && !o.isArchived && o.driverName);
        if (firstDispatched && typeof window.jumpToDriverRecon === 'function') {
            window.jumpToDriverRecon(firstDispatched.driverName);
            return;
        }
        const btn = document.querySelector(`#sidebar button[onclick*="switchTab('radar'"]`);
        if (btn) switchTab('radar', btn);
    };

    window.openSmartBellNotifications = function (anchorEl) {
        const ordersList = (typeof allOrdersRaw !== 'undefined' && Array.isArray(allOrdersRaw)) ? allOrdersRaw : [];
        const batchesObj = (typeof storeBatches !== 'undefined' && storeBatches) ? storeBatches : {};

        let newCount = 0, newMoney = 0;
        let procCount = 0, dispCount = 0, noAnsCount = 0;
        let unsettledCash = 0, unsettledOrdersCount = 0;

        ordersList.forEach(o => {
            if (!o || o.status === 'trash' || o.isArchived) return;
            if (o.status === 'new') { newCount++; newMoney += (Number(o.total) || 0); }
            else if (o.status === 'processing') procCount++;
            else if (o.status === 'dispatched') {
                dispCount++;
                if (o.driverName) {
                    const c = getOrderCashForDriver(o);
                    if (c > 0) { unsettledCash += c; unsettledOrdersCount++; }
                }
            }
            else if (o.status === 'no_answer' || o.status === 'deferred') noAnsCount++;
        });

        let itemsHtml = '';
        const pendingFarmIds = Object.keys(batchesObj).filter(bId => batchesObj[bId] && batchesObj[bId].pendingApproval === true);
        if (pendingFarmIds.length > 0) {
            const firstName = batchesObj[pendingFarmIds[0]]?.name || 'دفعة جديدة';
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('batches', document.querySelector('#sidebar button[onclick*=\\'batches\\']'));" class="p-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-amber-400 cursor-pointer flex justify-between items-center transition-all shadow-sm">
                    <div>
                        <span class="text-xs font-black text-amber-950 block">🐣 دفعة من المزرعة بانتظار إذنك!</span>
                        <span class="text-[10px] font-bold text-amber-800">${firstName}${pendingFarmIds.length > 1 ? ` (+${pendingFarmIds.length - 1} أخرى)` : ''} — مخفية عن المتجر حالياً</span>
                    </div>
                    <span class="bg-slate-900 text-amber-300 text-[10px] font-black px-2.5 py-1 rounded-xl shrink-0">اعتماد</span>
                </div>`;
        }

        if (newCount > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('orders', document.querySelector('#sidebar button[onclick*=\\'orders\\']')); setOrderTab('new');" class="p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer flex justify-between items-center transition-all">
                    <div>
                        <span class="text-xs font-black text-blue-950 block">🆕 طلبات جديدة تنتظر التأكيد</span>
                        <span class="text-[10px] font-bold text-blue-700">إجمالي قيمتها: ${newMoney.toLocaleString()} ج</span>
                    </div>
                    <span class="bg-blue-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-sm">${newCount} طلب</span>
                </div>`;
        }

        if (procCount > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('orders', document.querySelector('#sidebar button[onclick*=\\'orders\\']')); setOrderTab('processing');" class="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer flex justify-between items-center transition-all">
                    <div>
                        <span class="text-xs font-black text-amber-950 block">⏳ طلبات قيد التجهيز والتحضير</span>
                        <span class="text-[10px] font-bold text-amber-700">اضغط لمراجعتها أو توجيهها للمندوب</span>
                    </div>
                    <span class="bg-amber-500 text-slate-950 text-xs font-black px-2.5 py-1 rounded-xl shadow-sm">${procCount} طلب</span>
                </div>`;
        }

        if (unsettledCash > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('reconciliation', document.querySelector('#sidebar button[onclick*=\\'reconciliation\\']'));" class="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer flex justify-between items-center transition-all">
                    <div>
                        <span class="text-xs font-black text-emerald-950 block">💰 عهدة كاش مع المناديب للتوريد</span>
                        <span class="text-[10px] font-bold text-emerald-700">من إجمالي (${unsettledOrdersCount}) طلبات مسلمة</span>
                    </div>
                    <span class="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-sm">${unsettledCash.toLocaleString()} ج</span>
                </div>`;
        }

        if (dispCount > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('radar', document.querySelector('#sidebar button[onclick*=\\'radar\\']'));" class="p-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer flex justify-between items-center transition-all">
                    <div>
                        <span class="text-xs font-black text-indigo-950 block">🛵 طلبات في الطريق مع المناديب</span>
                        <span class="text-[10px] font-bold text-indigo-700">اضغط لفتح رادار خطوط السير</span>
                    </div>
                    <span class="bg-indigo-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-sm">${dispCount} طلب</span>
                </div>`;
        }

        if (noAnsCount > 0) {
            itemsHtml += `
                <div onclick="closeLivePopover(); switchTab('orders', document.querySelector('#sidebar button[onclick*=\\'orders\\']')); setOrderTab('no_answer');" class="p-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 cursor-pointer flex justify-between items-center transition-all">
                    <div>
                        <span class="text-xs font-black text-purple-950 block">📵 طلبات لم يرد / مؤجلة</span>
                        <span class="text-[10px] font-bold text-purple-700">تحتاج إعادة تواصل مع العميل</span>
                    </div>
                    <span class="bg-purple-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-sm">${noAnsCount} طلب</span>
                </div>`;
        }

        Object.keys(batchesObj).forEach(bId => {
            const b = batchesObj[bId];
            if (b && b.isOpen && typeof window.getBatchCeilingAndRemaining === 'function') {
                const cap = window.getBatchCeilingAndRemaining(bId);
                if (cap.ceilingPairs > 0 && cap.remainingPairs <= 5) {
                    itemsHtml += `
                        <div onclick="closeLivePopover(); switchTab('batches', document.querySelector('#sidebar button[onclick*=\\'batches\\']'));" class="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer flex justify-between items-center transition-all">
                            <div>
                                <span class="text-xs font-black text-rose-950 block">🐣 دفعة (${b.name}) أوشكت على الاكتمال</span>
                                <span class="text-[10px] font-bold text-rose-700">حُجز ${cap.bookedPairs} من ${cap.ceilingPairs} جوز</span>
                            </div>
                            <span class="bg-rose-600 text-white text-[10px] font-black px-2 py-1 rounded-xl">متبقي ${cap.remainingPairs}</span>
                        </div>`;
                }
            }
        });

        if (!itemsHtml) {
            itemsHtml = `<div class="text-center py-6 text-xs font-bold text-slate-400">لا توجد مهام معلقة حالياً، كل العمليات منتظمة ✅</div>`;
        }

        const html = `
            <div class="space-y-2.5">
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-xs font-black text-slate-800"><i class="fa-solid fa-bell text-amber-500 ml-1"></i> رادار المهام والعمليات الفوري</span>
                    <button onclick="closeLivePopover()" class="text-slate-400 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="space-y-2 max-h-80 overflow-y-auto custom-scroll pr-0.5">${itemsHtml}</div>
            </div>
        `;
        window.openLivePopover(anchorEl, html);
    };

    // =========================================================================
    // 🌪️ 8. نظام التمرير المستقر المضاد للاهتزاز (Zero-Jitter Hysteresis Scroll)
    // =========================================================================
        window.initZeroClutterOrdersScroll = function () {
        document.body.classList.remove('lc-bars-hidden-on-scroll');
        const mainScroll = document.querySelector('main > div.flex-1.overflow-y-auto.custom-scroll');
        if (mainScroll && !mainScroll.hasAttribute('data-lc-scroll-bound')) {
            mainScroll.setAttribute('data-lc-scroll-bound', '1');
            mainScroll.addEventListener('scroll', () => {
                if (window.liveConnectState) {
                    window.liveConnectState.lastScrollTop = Math.max(0, mainScroll.scrollTop);
                }
            }, { passive: true });
        }
    };

    // =========================================================================
    // 🔗 9. الربط التلقائي السريع مع دوال النظام
    // =========================================================================
    function hookIntoSystemFunctions() {
        if (typeof window.renderOrdersList === 'function' && !window.renderOrdersList._lcHooked) {
            const _origRenderOrders = window.renderOrdersList;
            let _lcHdrSyncTimer = null;
            const wrappedRenderOrders = function () {
                const res = _origRenderOrders.apply(this, arguments);
                window.restructureOrdersStickyLayout();
                window.initZeroClutterOrdersScroll();
                window.enhanceOrderCardsLive();
                clearTimeout(_lcHdrSyncTimer);
                _lcHdrSyncTimer = setTimeout(() => {
                    window.updateLiveHeaderAndSidebar();
                }, 180);
                return res;
            };
            wrappedRenderOrders._lcHooked = true;
            window.renderOrdersList = wrappedRenderOrders;
        }

        if (typeof window.refreshCustomersData === 'function' && !window.refreshCustomersData._lcHooked) {
            const _origRefreshCust = window.refreshCustomersData;
            const wrappedRefreshCust = function () {
                const res = _origRefreshCust.apply(this, arguments);
                setTimeout(() => {
                    window.updateLiveHeaderAndSidebar();
                }, 250);
                return res;
            };
            wrappedRefreshCust._lcHooked = true;
            window.refreshCustomersData = wrappedRefreshCust;
        }
    }
    // 🔔 إشعار حي فوري + نغمة لطيفة عند وصول أي دفعة جديدة من المزرعة/المفرخة بانتظار إذن المدير
    window._notifiedFarmBatchIds = window._notifiedFarmBatchIds || {};
    window._farmBannerDismissedKey = '';

    window.checkPendingFarmBatchesBanner = function (pendingIds) {
        let banner = document.getElementById('lc-farm-approval-banner');
        const list = Array.isArray(pendingIds) ? pendingIds : [];

        if (list.length === 0) {
            if (banner) banner.classList.add('hidden');
            return;
        }

        const sig = list.slice().sort().join(',');
        let hasBrandNew = false;
        list.forEach(id => {
            if (!window._notifiedFarmBatchIds[id]) {
                window._notifiedFarmBatchIds[id] = true;
                hasBrandNew = true;
            }
        });

        if (hasBrandNew && typeof window.playDeferredAlarmChime === 'function') {
            window.playDeferredAlarmChime();
        }

        if (window._farmBannerDismissedKey === sig) return;

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'lc-farm-approval-banner';
            banner.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-[210] w-[94vw] max-w-xl bg-gradient-to-l from-[#042f2e] via-[#064e3b] to-[#0f172a] text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center justify-between gap-3';
            document.body.appendChild(banner);
        }

        const firstBatch = (typeof storeBatches !== 'undefined' && storeBatches[list[0]]) ? storeBatches[list[0]] : {};
        banner.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-base shrink-0 shadow">
                    <i class="fa-solid fa-bell fa-shake"></i>
                </span>
                <div class="min-w-0">
                    <div class="text-xs sm:text-sm font-black text-amber-300 truncate">🐣 وصلت دفعة جديدة من المزرعة بانتظار إذنك!</div>
                    <div class="text-[11px] font-bold text-emerald-100 truncate">${firstBatch.name || 'دفعة جديدة'}${list.length > 1 ? ` (+${list.length - 1} دفعات أخرى)` : ''} • مخفية عن موقع العملاء حتى توافق</div>
                </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="window._farmBannerDismissedKey='${sig}'; document.getElementById('lc-farm-approval-banner').classList.add('hidden'); switchTab('batches', document.querySelector('#sidebar button[onclick*=\\'batches\\']'));" class="bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl text-[11px] font-black shadow active:scale-95">
                    مراجعة الآن
                </button>
                <button type="button" onclick="window._farmBannerDismissedKey='${sig}'; document.getElementById('lc-farm-approval-banner').classList.add('hidden');" class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center justify-center">✕</button>
            </div>
        `;
        banner.classList.remove('hidden');
    };

    function bootLiveConnect() {
        injectLiveConnectStyles();
        hookIntoSystemFunctions();
        window.initLiveHeaderAndSidebarUI();
        window.restructureOrdersStickyLayout();
        window.initZeroClutterOrdersScroll();
        window.enhanceOrderCardsLive();
        window.updateLiveHeaderAndSidebar();
    }

    // حقن ستايلات الهيدر والقائمة فوراً قبل أول فريم لمنع ومضة الواجهة القديمة
    injectLiveConnectStyles();

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', bootLiveConnect, { once: true });
    } else {
        bootLiveConnect();
    }

})();
