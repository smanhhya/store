// =========================================================================
// 💎 محرك النوافذ التنفيذية الفاخرة (Executive Dialogs Engine - dialogs.js)
// خاص بمشروع: سمان ههيا | الإدارة المركزية (CRM)
// يستبدل نوافذ المتصفح التقليدية (alert / confirm / prompt) بنوافذ متناسقة مع هوية المشروع
// =========================================================================

(function () {
    const dialogQueue = [];
    let isDialogOpen = false;
    let activeResolver = null;
    let activeDialogType = null;
    let observerAttached = false;

    if (!window._nativeBrowserAlert) {
        window._nativeBrowserAlert = window.alert.bind(window);
    }

    function detectToneFromMessage(msg, explicitTone) {
        if (explicitTone) return explicitTone;
        const text = String(msg || '');
        if (text.includes('⛔') || text.includes('❌') || text.includes('خطأ') || text.includes('فشل') || text.includes('تعذر') || text.includes('حذف') || text.includes('إلغاء') || text.includes('بلاك ليست') || text.includes('حظر') || text.includes('تصفير')) {
            return 'danger';
        }
        if (text.includes('⚠️') || text.includes('تحذير') || text.includes('انتباه') || text.includes('تنبيه') || text.includes('أرشفة')) {
            return 'warning';
        }
        if (text.includes('✅') || text.includes('🎉') || text.includes('بنجاح') || text.includes('مبروك')) {
            return 'success';
        }
        return 'brand';
    }

    function getToneVisuals(tone) {
        if (tone === 'danger') {
            return {
                headerBg: 'from-slate-900 via-rose-950 to-red-900',
                iconWrap: 'bg-red-500/20 border-red-400/40 text-red-300',
                iconClass: 'fa-solid fa-shield-exclamation',
                defaultTitle: 'تنبيه وتأكيد مهم',
                confirmBtn: 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/25'
            };
        }
        if (tone === 'warning') {
            return {
                headerBg: 'from-slate-900 via-amber-950 to-slate-900',
                iconWrap: 'bg-amber-500/20 border-amber-400/40 text-amber-300',
                iconClass: 'fa-solid fa-triangle-exclamation',
                defaultTitle: 'تنبيه من النظام',
                confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/25'
            };
        }
        if (tone === 'success') {
            return {
                headerBg: 'from-slate-900 via-emerald-950 to-brand-dark',
                iconWrap: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300',
                iconClass: 'fa-solid fa-circle-check',
                defaultTitle: 'تمت العملية بنجاح',
                confirmBtn: 'bg-brand-primary hover:bg-emerald-800 text-white shadow-brand-primary/25'
            };
        }
        return {
            headerBg: 'from-slate-900 via-slate-800 to-emerald-950',
            iconWrap: 'bg-amber-500/20 border-amber-400/40 text-amber-300',
            iconClass: 'fa-solid fa-crown',
            defaultTitle: 'سمان ههيا — الإدارة المركزية',
            confirmBtn: 'bg-brand-primary hover:bg-emerald-800 text-white shadow-brand-primary/25'
        };
    }

    function ensureExecutiveModalDOM() {
        let modal = document.getElementById('sman-exec-dialog-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'sman-exec-dialog-modal';
        modal.className = 'fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[350] hidden flex items-center justify-center p-4 transition-opacity';
        modal.innerHTML = `
            <div id="sman-exec-dialog-card" class="bg-white rounded-[1.75rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
                <div id="sman-exec-dialog-header" class="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
                    <div class="flex items-center gap-3 min-w-0">
                        <div id="sman-exec-dialog-icon-wrap" class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center text-lg shrink-0">
                            <i id="sman-exec-dialog-icon" class="fa-solid fa-crown"></i>
                        </div>
                        <h3 id="sman-exec-dialog-title" class="text-sm sm:text-base font-black text-white truncate">سمان ههيا</h3>
                    </div>
                    <button type="button" id="sman-exec-dialog-close-x" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-colors shrink-0">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>

                <div class="p-5 bg-slate-50/70 space-y-4">
                    <p id="sman-exec-dialog-message" class="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed whitespace-pre-line break-words max-h-[50vh] overflow-y-auto custom-scroll"></p>

                    <div id="sman-exec-dialog-input-wrap" class="hidden">
                        <input type="text" id="sman-exec-dialog-input" class="w-full border-2 border-slate-200 focus:border-brand-primary rounded-xl px-3.5 py-2.5 text-sm font-black text-slate-800 bg-white outline-none shadow-sm transition-all" autocomplete="off">
                    </div>
                </div>

                <div id="sman-exec-dialog-actions" class="px-5 py-3.5 bg-white border-t border-slate-100 flex items-center gap-2.5 shrink-0">
                    <button type="button" id="sman-exec-dialog-confirm-btn" class="flex-1 bg-brand-primary hover:bg-emerald-800 text-white font-black py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-check"></i>
                        <span id="sman-exec-dialog-confirm-label">موافق</span>
                    </button>
                    <button type="button" id="sman-exec-dialog-cancel-btn" class="hidden bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-all active:scale-95">
                        تراجع
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // إغلاق عند الضغط على الخلفية
        modal.addEventListener('click', (e) => {
            if (e.target === modal && isDialogOpen) {
                cancelActiveDialog();
            }
        });

        document.getElementById('sman-exec-dialog-close-x').addEventListener('click', () => cancelActiveDialog());
        document.getElementById('sman-exec-dialog-cancel-btn').addEventListener('click', () => cancelActiveDialog());
        document.getElementById('sman-exec-dialog-confirm-btn').addEventListener('click', () => acceptActiveDialog());

        const inp = document.getElementById('sman-exec-dialog-input');
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                acceptActiveDialog();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelActiveDialog();
            }
        });

        // ربط كامل مع زر الرجوع في الأندرويد (إذا أغلقت دالة closeModal النافذة خارجياً)
        if (!observerAttached) {
            observerAttached = true;
            const obs = new MutationObserver(() => {
                if (modal.classList.contains('hidden') && isDialogOpen) {
                    const fallbackVal = activeDialogType === 'confirm' ? false : (activeDialogType === 'prompt' ? null : undefined);
                    finishActiveDialog(fallbackVal);
                }
            });
            obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }

        return modal;
    }

    document.addEventListener('keydown', (e) => {
        if (!isDialogOpen) return;
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelActiveDialog();
        } else if (e.key === 'Enter' && activeTag !== 'INPUT') {
            e.preventDefault();
            acceptActiveDialog();
        }
    });

    function acceptActiveDialog() {
        if (!isDialogOpen) return;
        if (activeDialogType === 'prompt') {
            const val = document.getElementById('sman-exec-dialog-input')?.value ?? '';
            finishActiveDialog(val);
        } else if (activeDialogType === 'confirm') {
            finishActiveDialog(true);
        } else {
            finishActiveDialog(undefined);
        }
    }

    function cancelActiveDialog() {
        if (!isDialogOpen) return;
        if (activeDialogType === 'prompt') {
            finishActiveDialog(null);
        } else if (activeDialogType === 'confirm') {
            finishActiveDialog(false);
        } else {
            finishActiveDialog(undefined);
        }
    }

    function finishActiveDialog(resultValue) {
        if (!isDialogOpen) return;
        const resolver = activeResolver;
        activeResolver = null;
        activeDialogType = null;
        isDialogOpen = false;

        const modal = document.getElementById('sman-exec-dialog-modal');
        if (modal) modal.classList.add('hidden');

        if (typeof resolver === 'function') {
            resolver(resultValue);
        }

        setTimeout(processNextDialog, 40);
    }

    function processNextDialog() {
        if (isDialogOpen || dialogQueue.length === 0) return;
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', processNextDialog, { once: true });
            return;
        }

        const item = dialogQueue.shift();
        const cfg = item.config;
        const modal = ensureExecutiveModalDOM();

        isDialogOpen = true;
        activeResolver = item.resolve;
        activeDialogType = cfg.type;

        const tone = detectToneFromMessage(cfg.message, cfg.tone);
        const vis = getToneVisuals(tone);

        const headerEl = document.getElementById('sman-exec-dialog-header');
        const iconWrap = document.getElementById('sman-exec-dialog-icon-wrap');
        const iconEl = document.getElementById('sman-exec-dialog-icon');
        const titleEl = document.getElementById('sman-exec-dialog-title');
        const msgEl = document.getElementById('sman-exec-dialog-message');
        const inputWrap = document.getElementById('sman-exec-dialog-input-wrap');
        const inputEl = document.getElementById('sman-exec-dialog-input');
        const confirmBtn = document.getElementById('sman-exec-dialog-confirm-btn');
        const confirmLabel = document.getElementById('sman-exec-dialog-confirm-label');
        const cancelBtn = document.getElementById('sman-exec-dialog-cancel-btn');

        headerEl.className = `bg-gradient-to-l ${vis.headerBg} text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0`;
        iconWrap.className = `w-10 h-10 rounded-xl border flex items-center justify-center text-lg shrink-0 ${vis.iconWrap}`;
        iconEl.className = cfg.icon || vis.iconClass;
        titleEl.textContent = cfg.title || vis.defaultTitle;
        msgEl.textContent = String(cfg.message ?? '');

        confirmBtn.className = `flex-1 font-black py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 ${vis.confirmBtn}`;

        if (cfg.type === 'alert') {
            inputWrap.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            confirmLabel.textContent = cfg.confirmText || 'حسناً';
        } else if (cfg.type === 'confirm') {
            inputWrap.classList.add('hidden');
            cancelBtn.classList.remove('hidden');
            cancelBtn.textContent = cfg.cancelText || 'إلغاء';
            confirmLabel.textContent = cfg.confirmText || 'تأكيد وتنفيذ';
        } else if (cfg.type === 'prompt') {
            inputWrap.classList.remove('hidden');
            cancelBtn.classList.remove('hidden');
            cancelBtn.textContent = cfg.cancelText || 'إلغاء';
            confirmLabel.textContent = cfg.confirmText || 'حفظ وتأكيد';
            inputEl.type = cfg.inputType || 'text';
            inputEl.placeholder = cfg.placeholder || 'اكتب هنا...';
            inputEl.value = cfg.defaultValue !== undefined && cfg.defaultValue !== null ? String(cfg.defaultValue) : '';
        }

        modal.classList.remove('hidden');

        if (cfg.type === 'prompt') {
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 60);
        } else {
            setTimeout(() => confirmBtn.focus(), 60);
        }
    }

    function enqueueDialog(config) {
        return new Promise((resolve) => {
            dialogQueue.push({ config, resolve });
            processNextDialog();
        });
    }

    // 1. دالة التنبيه التنفيذية
    window.execAlert = function (message, options = {}) {
        return enqueueDialog({
            type: 'alert',
            message: message,
            title: options.title || '',
            tone: options.tone || '',
            confirmText: options.confirmText || 'حسناً'
        });
    };

    // 2. دالة التأكيد التنفيذية (تُستخدم مع await)
    window.execConfirm = function (message, options = {}) {
        return enqueueDialog({
            type: 'confirm',
            message: message,
            title: options.title || '',
            tone: options.tone || '',
            confirmText: options.confirmText || 'تأكيد وتنفيذ',
            cancelText: options.cancelText || 'تراجع'
        });
    };

    // 3. دالة الإدخال التنفيذية (تُستخدم مع await)
    window.execPrompt = function (message, defaultValue = '', options = {}) {
        return enqueueDialog({
            type: 'prompt',
            message: message,
            defaultValue: defaultValue,
            title: options.title || 'إدخال بيانات',
            tone: options.tone || 'brand',
            placeholder: options.placeholder || 'اكتب هنا...',
            inputType: options.inputType || 'text',
            confirmText: options.confirmText || 'حفظ وتأكيد',
            cancelText: options.cancelText || 'إلغاء'
        });
    };

    // استبدال شامل وآمن لدالة alert في جميع ملفات المشروع الـ 9 دفعة واحدة
    window.alert = function (message) {
        window.execAlert(message);
    };
})();
