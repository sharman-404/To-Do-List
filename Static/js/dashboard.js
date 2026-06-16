document.addEventListener("DOMContentLoaded", async () => {
    if (!requireSession()) return;
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

    // Initialize UI Loading
    await loadUserProfile();
    await loadTodosAndMetrics();
});
