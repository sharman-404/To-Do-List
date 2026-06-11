document.addEventListener("DOMContentLoaded", async () => {
    // Guard check
    requireAdminSession();
    const usersTableBody = document.getElementById("usersTableBody");
    const adminStatsTotal = document.getElementById("adminStatsTotal");
    const adminStatsApproved = document.getElementById("adminStatsApproved");
    const adminStatsPending = document.getElementById("adminStatsPending"); 
    const approveAllBtn = document.getElementById("approveAllBtn");
    const restoreAdminBtn = document.getElementById("restoreAdminBtn");
    const diagnosticFeedback = document.getElementById("diagnosticFeedback");
    const feedbackText = document.getElementById("feedbackText");
    // Task override panel elements
    const tasksOverrideTableBody = document.getElementById("tasksOverrideTableBody");
    const taskUserFilterSelect = document.getElementById("taskUserFilter");
    let registeredUsers = [];
    let allAdminTodos = [];
 
    function showDiagnosticFeedback(message, type = "success") {
        if (!diagnosticFeedback || !feedbackText) return;
        feedbackText.textContent = message;
        diagnosticFeedback.classList.remove(
            "hidden",
            "bg-emerald-950/20", "border-emerald-500/20", "text-emerald-300",
            "bg-rose-950/20", "border-rose-500/20", "text-rose-300"
        );
        if (type === "success") {
            diagnosticFeedback.classList.add("bg-emerald-950/20", "border-emerald-500/20", "text-emerald-300");
        } else {
            diagnosticFeedback.classList.add("bg-rose-950/20", "border-rose-500/20", "text-rose-300");
        }
        setTimeout(() => diagnosticFeedback.classList.add("hidden"), 10000);
    }
 
    //  Load users + admin stats 
    async function loadAdminDataAll() {
        try {
            registeredUsers = await apiFetch("/api/admin/users");
            renderUsersTable();
            const total = registeredUsers.length;
            const approved = registeredUsers.filter(u => u.approved).length;
            const pending = total - approved;
 
            if (adminStatsTotal) adminStatsTotal.textContent = total;
            if (adminStatsApproved) adminStatsApproved.textContent = approved;
            if (adminStatsPending) adminStatsPending.textContent = pending;
        } catch (e) {
            console.error(e);
            showDiagnosticFeedback("Failed to synchronize administrative table registers.", "error");
        }
    }
 
    function renderUsersTable() {
        if (!usersTableBody) return;
        if (registeredUsers.length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-sm text-slate-400">
                        No user account registers located in the active directory SQL.
                    </td>
                </tr>`;
            return;
        }
 
        usersTableBody.innerHTML = registeredUsers.map(user => {
            const roleColor = user.role === "admin"
                ? "text-sky-400 bg-sky-950/30 border-sky-900/30"
                : "text-slate-400 bg-slate-900/30 border-slate-800/30";
 
            let statusBadge = "";
            let actionsHtml = "";
 
            if (user.blocked) {
                statusBadge = `<span class="px-2 py-0.5 border border-rose-900/30 bg-rose-950/20 text-rose-300 text-2xs rounded-lg uppercase tracking-wider font-mono">Blocked</span>`;
                actionsHtml = `<button data-user-id="${user.id}" data-action="unblock" class="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 hover:text-slate-100 text-slate-300 rounded border border-slate-700 transition">Unblock</button>`;
            } else if (!user.approved) {
                statusBadge = `<span class="px-2 py-0.5 border border-amber-900/30 bg-amber-950/20 text-amber-300 text-2xs rounded-lg uppercase tracking-wider font-mono">Pending</span>`;
                actionsHtml = `
                    <button data-user-id="${user.id}" data-action="approve" class="px-2.5 py-1 text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium rounded transition mr-1 shadow shadow-sky-500/10">Approve</button>
                    <button data-user-id="${user.id}" data-action="block" class="px-2.5 py-1 text-xs bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 rounded border border-rose-900/30 transition">Block</button>`;
            } else {
                statusBadge = `<span class="px-2 py-0.5 border border-emerald-900/30 bg-emerald-950/20 text-emerald-300 text-2xs rounded-lg uppercase tracking-wider font-mono">Approved</span>`;
                actionsHtml = user.role !== "admin"
                    ? `<button data-user-id="${user.id}" data-action="block" class="px-2.5 py-1 text-xs bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 rounded border border-rose-900/30 transition">Block</button>`
                    : `<span class="text-xs text-slate-500 italic">Protected</span>`;
            }
            return `
                <tr class="border-b border-slate-800/40 hover:bg-slate-900/20 text-sm">
                    <td class="p-4 font-semibold text-slate-200">${user.username}</td>
                    <td class="p-4 text-slate-400 font-mono">${user.email}</td>
                    <td class="p-4"><span class="px-2 py-0.5 border border-slate-800 text-2xs uppercase font-mono rounded ${roleColor}">${user.role}</span></td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4 text-right">${actionsHtml}</td>
                </tr>`;
        }).join("");
 
        usersTableBody.querySelectorAll("button[data-user-id]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const uid = btn.getAttribute("data-user-id");
                const action = btn.getAttribute("data-action");
                btn.disabled = true;
                try {
                    const ep = action === "approve" ? `/api/admin/approve/${uid}`
                             : action === "block"   ? `/api/admin/block/${uid}`
                             :                        `/api/admin/unblock/${uid}`;
                    await apiFetch(ep, { method: "PUT" });
                    showDiagnosticFeedback(`Successfully executed [${action}] on user.`, "success");
                    await loadAdminDataAll();
                } catch (err) {
                    showDiagnosticFeedback(err.message || `Failed executing [${action}].`, "error");
                    btn.disabled = false;
                }
            });
        });
    }
 
    //  Task Priority & Category Override Panel
    async function loadAllTasksForOverride() {
        if (!tasksOverrideTableBody) return;
        try {
            allAdminTodos = await apiFetch("/api/admin/todos");
            populateUserFilter();
            renderTasksOverrideTable(allAdminTodos);
        } catch (e) {
            console.error("Failed to load tasks for override:", e);
            showDiagnosticFeedback("Failed to load task override panel.", "error");
        }
    }
 
    function populateUserFilter() {
        if (!taskUserFilterSelect) return;
        const userIds = [...new Set(allAdminTodos.map(t => t.user_id))];
        const options = userIds.map(uid => {
            const user = registeredUsers.find(u => u.id === uid);
            const label = user ? user.username : `User #${uid}`;
            return `<option value="${uid}">${label}</option>`;
        }).join("");
        taskUserFilterSelect.innerHTML = `<option value="all">All Users</option>${options}`;
        taskUserFilterSelect.onchange = () => {
            const val = taskUserFilterSelect.value;
            const filtered = val === "all" ? allAdminTodos : allAdminTodos.filter(t => String(t.user_id) === val);
            renderTasksOverrideTable(filtered);
        };
    }
 
    function renderTasksOverrideTable(todos) {
        if (!tasksOverrideTableBody) return;
        if (todos.length === 0) {
            tasksOverrideTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-sm text-slate-400">No tasks found.</td>
                </tr>`;
            return;
        }
 
        const priorityBadgeColor = {
            high:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
            medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
            low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        };
 
        const categoryBadgeColor = {
            work:     "bg-sky-500/10 text-sky-400 border-sky-500/20",
            personal: "bg-violet-500/10 text-violet-400 border-violet-500/20",
            learning: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
            health:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
            other:    "bg-slate-500/10 text-slate-400 border-slate-700"
        };
 
        const categoryIcon = { work: "💼", personal: "👤", learning: "📚", health: "❤️", other: "✨" };
 
        tasksOverrideTableBody.innerHTML = todos.map(task => {
            const owner = registeredUsers.find(u => u.id === task.user_id);
            const ownerLabel = owner ? owner.username : `#${task.user_id}`;
            const prColor  = priorityBadgeColor[task.priority] || "bg-slate-500/10 text-slate-400 border-slate-700";
            const catColor = categoryBadgeColor[task.category] || "bg-slate-500/10 text-slate-400 border-slate-700";
            const titleStyle = task.completed ? "line-through text-slate-500" : "text-slate-200";
            const icon = categoryIcon[task.category] || "📌";
            return `
            <tr class="border-b border-slate-800/40 hover:bg-slate-900/20 text-sm" data-task-id="${task.id}">

                <!-- Title + owner -->
                <td class="p-4 max-w-[200px]">
                    <p class="font-medium ${titleStyle} truncate" title="${task.title}">${task.title}</p>
                    <p class="text-2xs text-slate-500 font-mono mt-0.5">${ownerLabel}</p>
                </td>

                <!-- Current priority badge -->
                <td class="p-4">
                    <span class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded border ${prColor} current-priority-badge">
                        ${task.priority}
                    </span>
                </td>

                <!-- Current category badge -->
                <td class="p-4">
                    <span class="px-2 py-0.5 text-2xs font-mono rounded border ${catColor} current-category-badge">
                        ${icon} ${task.category}
                    </span>
                </td>
 
                <!-- Priority override select -->
                <td class="p-4">
                    <select class="priority-override-select glass-input text-xs rounded-lg px-2 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-slate-500" data-task-id="${task.id}">
                        <option value="high"   ${task.priority === "high"   ? "selected" : ""}>⬆ High</option>
                        <option value="medium" ${task.priority === "medium" ? "selected" : ""}>➡ Medium</option>
                        <option value="low"    ${task.priority === "low"    ? "selected" : ""}>⬇ Low</option>
                    </select>
                </td>
 
                <!-- Category override select -->
                <td class="p-4">
                    <select class="category-override-select glass-input text-xs rounded-lg px-2 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-slate-500" data-task-id="${task.id}">
                        <option value="work"     ${task.category === "work"     ? "selected" : ""}>💼 Work</option>
                        <option value="personal" ${task.category === "personal" ? "selected" : ""}>👤 Personal</option>
                        <option value="learning" ${task.category === "learning" ? "selected" : ""}>📚 Learning</option>
                        <option value="health"   ${task.category === "health"   ? "selected" : ""}>❤️ Health</option>
                        <option value="other"    ${task.category === "other"    ? "selected" : ""}>✨ Other</option>
                    </select>
                </td>
 
                <!-- Apply button -->
                <td class="p-4 text-right">
                    <button data-task-id="${task.id}" class="apply-override-btn px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-slate-200 transition">
                        Apply
                    </button>
                </td>
            </tr>`;
        }).join("");
 
        // Wire up Apply buttons
        tasksOverrideTableBody.querySelectorAll(".apply-override-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const taskId = btn.getAttribute("data-task-id");
                const row = tasksOverrideTableBody.querySelector(`tr[data-task-id="${taskId}"]`);
                const newPriority = row.querySelector(".priority-override-select").value;
                const newCategory = row.querySelector(".category-override-select").value;
 
                btn.disabled = true;
                btn.textContent = "Saving...";
 
                try {
                    await apiFetch(`/api/admin/todos/${taskId}/override`, {
                        method: "PUT",
                        body: JSON.stringify({ priority: newPriority, category: newCategory })
                    });
 
                    // Update priority badge
                    const prBadge = row.querySelector(".current-priority-badge");
                    const prColors = {
                        high:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
                        medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                        low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    };
                    prBadge.className = `px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded border current-priority-badge ${prColors[newPriority]}`;
                    prBadge.textContent = newPriority;
 
                    // Update category badge
                    const catBadge = row.querySelector(".current-category-badge");
                    const catColors = {
                        work:     "bg-sky-500/10 text-sky-400 border-sky-500/20",
                        personal: "bg-violet-500/10 text-violet-400 border-violet-500/20",
                        learning: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                        health:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                        other:    "bg-slate-500/10 text-slate-400 border-slate-700"
                    };
                    const catIcons = { work: "💼", personal: "👤", learning: "📚", health: "❤️", other: "✨" };
                    catBadge.className = `px-2 py-0.5 text-2xs font-mono rounded border current-category-badge ${catColors[newCategory]}`;
                    catBadge.textContent = `${catIcons[newCategory]} ${newCategory}`;
 
                    // Update local cache
                    const cached = allAdminTodos.find(t => String(t.id) === taskId);
                    if (cached) { cached.priority = newPriority; cached.category = newCategory; }
 
                    showDiagnosticFeedback(`Task #${taskId} updated → priority: ${newPriority}, category: ${newCategory}.`, "success");
                } catch (err) {
                    showDiagnosticFeedback(err.message || "Failed to update task.", "error");
                } finally {
                    btn.disabled = false;
                    btn.textContent = "Apply";
                }
            });
        });
    }
 
    //  Approve All 
    if (approveAllBtn) {
        approveAllBtn.addEventListener("click", async () => {
            approveAllBtn.disabled = true;
            try {
                const res = await apiFetch("/approve-all");
                showDiagnosticFeedback(res.detail || "Successfully completed mass approval.", "success");
                await loadAdminDataAll();
            } catch (err) {
                showDiagnosticFeedback(err.message || "Mass approval failed.", "error");
            } finally {
                approveAllBtn.disabled = false;
            }
        });
    }
 
    //  Restore Admin Password
    if (restoreAdminBtn) {
        restoreAdminBtn.addEventListener("click", async () => {
            restoreAdminBtn.disabled = true;
            try {
                const res = await apiFetch("/reset-admin");
                showDiagnosticFeedback(res.detail || "Successfully restored admin login.", "success");
            } catch (err) {
                showDiagnosticFeedback(err.message || "Restoration failed.", "error");
            } finally {
                restoreAdminBtn.disabled = false;
            }
        });
    }
 
    //  Init 
    await loadAdminDataAll();
    await loadAllTasksForOverride();
});
