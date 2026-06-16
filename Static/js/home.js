document.addEventListener("DOMContentLoaded", () => {
    const btnContainer = document.getElementById("navAuthButtons");
    if (!btnContainer) return;
    const token = _getToken();
    const username = _tabUsername();
    if (token && username) {
        btnContainer.innerHTML = `
            <a href="/dashboard" class="px-5 py-2.5 bg-slate-800 text-slate-100 hover:bg-slate-700 rounded-xl transition duration-200 border border-slate-700/50 flex items-center space-x-2">
                <span>Go to Dashboard</span>
                <span class="-translate-y-[1px]">→</span>
            </a>
            <button id="navLogout" class="px-5 py-2.5 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40 rounded-xl border border-rose-900/30 transition duration-200">
                Sign Out
            </button>
        `;
        document.getElementById("navLogout").addEventListener("click", () => {
            _clearTabSession();
            window.location.reload();
        });
    } else {
        btnContainer.innerHTML = `
            <a href="/login" class="text-slate-400 hover:text-slate-100 transition duration-200 py-2">Sign In</a>
            <a href="/signup" class="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 rounded-xl font-medium tracking-tight text-slate-900 shadow-lg shadow-sky-500/10 transition duration-200">
                Join Bloom
            </a>
        `;
    }
});
