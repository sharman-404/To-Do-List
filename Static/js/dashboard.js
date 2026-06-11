document.addEventListener("DOMContentLoaded", async () => {
    // Guard check
    requireSession();
    const usernameDisplay = document.getElementById("usernameDisplay");
    const userRoleBadge = document.getElementById("userRoleBadge");
    const adminTabLink = document.getElementById("adminTabLink");
    const adminTabMobile = document.getElementById("adminTabMobile");
    const statsTotal = document.getElementById("statsTotal");
    const statsPending = document.getElementById("statsPending");
    const statsCompleted = document.getElementById("statsCompleted");
    const completionPercent = document.getElementById("completionPercent");
    const completionProgress = document.getElementById("completionProgress");
    const upcomingTasksList = document.getElementById("upcomingTasksList");
    const calendarGrid = document.getElementById("calendarGrid");
    const insightsContainer = document.getElementById("insightsContainer");
    const refreshInsightsBtn = document.getElementById("refreshInsightsBtn");
    let activeTodos = [];
    let currentProfile = null;

    //  Load User Profile
    async function loadUserProfile() {
        try {
            currentProfile = await apiFetch("/api/me");
            if (currentProfile) {
                if (usernameDisplay) usernameDisplay.textContent = currentProfile.username;
                // Show admin links if user is an administrator
                if (currentProfile.role === "admin") {
                    if (userRoleBadge) {
                        userRoleBadge.textContent = "Admin";
                        userRoleBadge.classList.remove("hidden");
                    }
                    if (adminTabLink) adminTabLink.classList.remove("hidden");
                    if (adminTabMobile) adminTabMobile.style.display = "block";
                } else {
                    if (userRoleBadge) userRoleBadge.classList.add("hidden");
                    if (adminTabLink) adminTabLink.classList.add("hidden");
                    if (adminTabMobile) adminTabMobile.style.display = "none";
                }
            }
        } catch (e) {
            console.error("Failed to load user profile:", e);
        }
    }

    // ── Load Stats and Schedules ─────────────────────────────────────────────
    async function loadTodosAndMetrics() {
        try {
            activeTodos = await apiFetch("/api/todos");
            // Calculate stats
            const total = activeTodos.length;
            const completedCount = activeTodos.filter(t => t.completed).length;
            const pendingCount = total - completedCount;
            const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;
            if (statsTotal) statsTotal.textContent = total;
            if (statsPending) statsPending.textContent = pendingCount;
            if (statsCompleted) statsCompleted.textContent = completedCount;
            if (completionPercent) completionPercent.textContent = `${percentage}%`;
            if (completionProgress) completionProgress.style.width = `${percentage}%`;
            renderUpcomingList();
            renderCalendarVisual();

            // Auto-load AI insights on load
            triggerGenAIInsights();
        } catch (e) {
            console.error("Failed to load todo metrics:", e);
        }
    }

    // Render upcoming tasks summary
    function renderUpcomingList() {
        if (!upcomingTasksList) return;
        let pending = activeTodos.filter(t => !t.completed);
        // Sort by priority (high > medium > low) and due date
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        pending.sort((a, b) => {
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date.localeCompare(b.due_date);
        });

        // Take top 4
        const displayItems = pending.slice(0, 4);
        if (displayItems.length === 0) {
            upcomingTasksList.innerHTML = `
                <div class="p-6 text-center text-slate-400 text-sm glass-card rounded-xl">
                    No active deadlines or pending tasks.
                </div>
            `;
            return;
        }

        upcomingTasksList.innerHTML = displayItems.map(item => {
            const dateStr = item.due_date ? new Date(item.due_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : "No Date";
            const priorityColor = {
                high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }[item.priority] || "bg-slate-500/10 text-slate-400";

            const categoryIcon = {
                work: "💼",
                personal: "👤",
                learning: "📚",
                health: "❤️",
                other: "✨"
            }[item.category] || "📌";
            return `
                <div class="p-4 flex items-center justify-between glass-card rounded-xl border border-slate-850">
                    <div class="flex items-center space-x-3 MIN-W-0">
                        <span class="text-xl shrink-0">${categoryIcon}</span>
                        <div class="truncate">
                            <h4 class="text-sm font-medium text-slate-200 truncate pr-2">${item.title}</h4>
                            <p class="text-xs text-slate-400 truncate">${item.description || "No supplemental details available"}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                        <span class="px-2 py-0.5 border rounded-lg text-2xs uppercase tracking-wide font-mono ${priorityColor}">
                            ${item.priority}
                        </span>
                        <span class="text-xs text-slate-400 font-mono bg-slate-900/40 px-2 py-1 rounded">
                            ${dateStr}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    }

    // Render interactive mini calendar visualizer
    function renderCalendarVisual() {
        if (!calendarGrid) return;
        const now = new Date();
        const startOfWeek = new Date(now);
        // Set to Sunday of current week
        const diff = now.getDate() - now.getDay();
        startOfWeek.setDate(diff);
        let html = "";
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setDate(startOfWeek.getDate() + i);

            const isToday = dayDate.toDateString() === now.toDateString();
            const dayName = dayDate.toLocaleDateString(undefined, {weekday: 'short'}).charAt(0);
            const dayNum = dayDate.getDate();
            const dayStrIso = dayDate.toISOString().split("T")[0];

            // Count pending todos on this day
            const tasksOnDay = activeTodos.filter(t => !t.completed && t.due_date === dayStrIso);
            const hasTasks = tasksOnDay.length > 0;

            const bgClass = isToday
                ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                : "bg-slate-900/30 hover:bg-slate-800/40";

            html += `
                <div class="p-3 rounded-xl border border-slate-800/50 flex flex-col items-center justify-between transition ${bgClass}">
                    <span class="text-xs text-slate-400 tracking-wide font-medium uppercase">${dayName}</span>
                    <span class="text-lg font-bold font-display my-1">${dayNum}</span>
                    ${hasTasks ? `
                        <div class="flex space-x-1 justify-center max-w-full">
                            ${tasksOnDay.slice(0, 3).map(() => `<span class="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0"></span>`).join("")}
                        </div>
                    ` : `
                        <span class="w-1.5 h-1.5 bg-slate-800 rounded-full"></span>
                    `}
                </div>
            `;
        }
        calendarGrid.innerHTML = html;
    }

    //  Fetch Gemini Insights
    async function triggerGenAIInsights() {
        if (!insightsContainer) return;
        insightsContainer.innerHTML = `
            <div class="p-8 text-center flex flex-col items-center justify-center space-y-3">
                <div class="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin"></div>
                <p class="text-xs text-slate-400 tracking-wide font-mono animate-pulse">SYNCHRONIZING SECURE PRODUCTIVITY GRADIENTS...</p>
            </div>
        `;

        try {
            // Strip core attributes for efficiency
            const taskInputs = activeTodos.map(t => ({
                title: t.title,
                priority: t.priority,
                category: t.category,
                completed: t.completed,
                due_date: t.due_date
            }));

            const response = await apiFetch("/api/ai/insights", {
                method: "POST",
                body: JSON.stringify({ tasks: taskInputs })
            });

            if (response && response.insights && response.insights.length > 0) {
                insightsContainer.innerHTML = response.insights.map(ins => {
                    const icon = {
                        alert: "⚠️",
                        recommendation: "💡",
                        trend: "📈"
                    }[ins.type] || "✨";

                    const borderClass = {
                        alert: "border-rose-900/30 hover:border-rose-500/20 bg-rose-950/5",
                        recommendation: "border-sky-900/30 hover:border-sky-500/20 bg-sky-950/5",
                        trend: "border-indigo-900/30 hover:border-indigo-500/20 bg-indigo-950/5"
                    }[ins.type] || "border-slate-800";

                    const titleColor = {
                        alert: "text-rose-400",
                        recommendation: "text-sky-400",
                        trend: "text-indigo-400"
                    }[ins.type] || "text-slate-250";
                    return `
                        <div class="p-4 border rounded-xl transition duration-300 ${borderClass} flex space-x-3">
                            <span class="text-lg shrink-0 mt-0.5">${icon}</span>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-semibold uppercase tracking-wider ${titleColor}">${ins.title}</span>
                                    <span class="text-3xs text-slate-400 font-mono">${ins.date}</span>
                                </div>
                                <p class="text-sm mt-1 text-slate-300 leading-relaxed">${ins.message}</p>
                            </div>
                        </div>
                    `;
                }).join("");
            } else {
                insightsContainer.innerHTML = `
                    <div class="p-6 text-center text-slate-400 text-sm">
                        Unable to fetch insights. Check credentials or try again.
                    </div>
                `;
            }
        } catch (e) {
            console.error(e);
            insightsContainer.innerHTML = `
                <div class="p-6 text-center text-slate-400 text-sm">
                    Fail safe insights unavailable. Connection threshold reached.
                </div>
            `;
        }
    }

    // Manual Refresh trigger
    if (refreshInsightsBtn) {
        refreshInsightsBtn.addEventListener("click", triggerGenAIInsights);
    }

    // Initialize UI Loading
    await loadUserProfile();
    await loadTodosAndMetrics();
});
