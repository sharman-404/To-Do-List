document.addEventListener("DOMContentLoaded", async () => {

    if (!requireAdminSession()) return;

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const usersTableBody       = document.getElementById("usersTableBody");
    const adminStatsTotal      = document.getElementById("adminStatsTotal");
    const adminStatsApproved   = document.getElementById("adminStatsApproved");
    const adminStatsPending    = document.getElementById("adminStatsPending");
    const approveAllBtn        = document.getElementById("approveAllBtn");
    const restoreAdminBtn      = document.getElementById("restoreAdminBtn");
    const diagnosticFeedback   = document.getElementById("diagnosticFeedback");
    const feedbackText         = document.getElementById("feedbackText");
    const tasksOverrideTableBody = document.getElementById("tasksOverrideTableBody");
    const taskUserFilterSelect   = document.getElementById("taskUserFilter");
    const adminMainContent       = document.getElementById("adminMainContent");
    const adminFilteredViewPanel = document.getElementById("adminFilteredViewPanel");
    const adminFilteredViewTitle = document.getElementById("adminFilteredViewTitle");
    const adminFilteredViewSub   = document.getElementById("adminFilteredViewSubtitle");
    const adminFilteredTasksBody = document.getElementById("adminFilteredTasksBody");
    const adminClearFilterBtn    = document.getElementById("adminClearFilterBtn");
    const catList       = document.getElementById("catList");
    const catForm       = document.getElementById("catForm");
    const catFormTitle  = document.getElementById("catFormTitle");
    const catFormName   = document.getElementById("catFormName");
    const catFormEmoji  = document.getElementById("catFormEmoji");
    const catFormColor  = document.getElementById("catFormColor");
    const catFormDesc   = document.getElementById("catFormDesc");
    const catFormSave   = document.getElementById("catFormSave");
    const catFormCancel = document.getElementById("catFormCancel");
    const catAddBtn     = document.getElementById("catAddBtn");

    // ── Shared state ─────────────────────────────────────────────────────────
    let registeredUsers = [];
    let allAdminTodos   = [];
    let categories      = [];
    let editingCatId    = null;

    // ── Badge class lookup keyed by color token ───────────────────────────────
    const COLOR_BADGE = {
        sky:     "bg-sky-500/10 text-sky-400 border-sky-500/20",
        violet:  "bg-violet-500/10 text-violet-400 border-violet-500/20",
        indigo:  "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        rose:    "bg-rose-500/10 text-rose-400 border-rose-500/20",
        amber:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
        slate:   "bg-slate-500/10 text-slate-400 border-slate-700",
    };

    const PRIORITY_BADGE = {
        high:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
        medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };

    // ── Helpers that build maps from the live categories array ───────────────
    function buildCatColorMap() {
        const m = {};
        categories.forEach(c => { m[c.name] = COLOR_BADGE[c.color] || COLOR_BADGE.slate; });
        return m;
    }

    function buildCatIconMap() {
        const m = {};
        categories.forEach(c => { m[c.name] = c.emoji || "📌"; });
        return m;
    }

    function categoryOptionsHtml(currentCat) {
        return categories.map(c =>
            `<option value="${c.name}" ${currentCat === c.name ? "selected" : ""}>${c.emoji} ${c.name}</option>`
        ).join("");
    }

    // ── Feedback banner ───────────────────────────────────────────────────────
    function showFeedback(message, type = "success") {
        if (!diagnosticFeedback || !feedbackText) return;
        feedbackText.textContent = message;
        diagnosticFeedback.classList.remove(
            "hidden",
            "bg-emerald-950/20", "border-emerald-500/20", "text-emerald-300",
            "bg-rose-950/20",    "border-rose-500/20",    "text-rose-300"
        );
        if (type === "success") {
            diagnosticFeedback.classList.add("bg-emerald-950/20", "border-emerald-500/20", "text-emerald-300");
        } else {
            diagnosticFeedback.classList.add("bg-rose-950/20", "border-rose-500/20", "text-rose-300");
        }
        setTimeout(() => diagnosticFeedback.classList.add("hidden"), 8000);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  USERS
    // ════════════════════════════════════════════════════════════════════════
    async function loadUsers() {
        try {
            registeredUsers = await apiFetch("/api/admin/users");
            renderUsersTable();
            const total    = registeredUsers.length;
            const approved = registeredUsers.filter(u => u.approved).length;
            if (adminStatsTotal)    adminStatsTotal.textContent    = total;
            if (adminStatsApproved) adminStatsApproved.textContent = approved;
            if (adminStatsPending)  adminStatsPending.textContent  = total - approved;
        } catch (e) {
            showFeedback("Failed to load user table.", "error");
        }
    }

    function renderUsersTable() {
        if (!usersTableBody) return;
        if (registeredUsers.length === 0) {
            usersTableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-sm text-slate-400">No users found.</td></tr>`;
            return;
        }
        usersTableBody.innerHTML = registeredUsers.map(user => {
            const roleColor = user.role === "admin"
                ? "text-sky-400 bg-sky-950/30 border-sky-900/30"
                : "text-slate-400 bg-slate-900/30 border-slate-800/30";

            let statusBadge, actionsHtml;
            if (user.blocked) {
                statusBadge  = `<span class="px-2 py-0.5 border border-rose-900/30 bg-rose-950/20 text-rose-300 text-2xs rounded-lg uppercase tracking-wider font-mono">Blocked</span>`;
                actionsHtml  = `<button data-uid="${user.id}" data-action="unblock" class="user-action-btn px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition">Unblock</button>`;
            } else if (!user.approved) {
                statusBadge  = `<span class="px-2 py-0.5 border border-amber-900/30 bg-amber-950/20 text-amber-300 text-2xs rounded-lg uppercase tracking-wider font-mono">Pending</span>`;
                actionsHtml  = `
                    <button data-uid="${user.id}" data-action="approve" class="user-action-btn px-2.5 py-1 text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium rounded transition mr-1">Approve</button>
                    <button data-uid="${user.id}" data-action="block"   class="user-action-btn px-2.5 py-1 text-xs bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 rounded border border-rose-900/30 transition">Block</button>`;
            } else {
                statusBadge  = `<span class="px-2 py-0.5 border border-emerald-900/30 bg-emerald-950/20 text-emerald-300 text-2xs rounded-lg uppercase tracking-wider font-mono">Approved</span>`;
                actionsHtml  = user.role !== "admin"
                    ? `<button data-uid="${user.id}" data-action="block" class="user-action-btn px-2.5 py-1 text-xs bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 rounded border border-rose-900/30 transition">Block</button>`
                    : `<span class="text-xs text-slate-500 italic">Protected</span>`;
            }
            return `
                <tr class="border-b border-slate-800/40 hover:bg-slate-900/20 text-sm">
                    <td class="p-4 font-semibold text-slate-200">${user.username}</td>
                    <td class="p-4 text-slate-400 font-mono">${user.email}</td>
                    <td class="p-4"><span class="px-2 py-0.5 border text-2xs uppercase font-mono rounded ${roleColor}">${user.role}</span></td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4 text-right">${actionsHtml}</td>
                </tr>`;
        }).join("");

        usersTableBody.querySelectorAll(".user-action-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const uid    = btn.dataset.uid;
                const action = btn.dataset.action;
                btn.disabled = true;
                try {
                    const ep = action === "approve" ? `/api/admin/approve/${uid}`
                             : action === "block"   ? `/api/admin/block/${uid}`
                             :                        `/api/admin/unblock/${uid}`;
                    await apiFetch(ep, { method: "PUT" });
                    showFeedback(`User ${action}d successfully.`, "success");
                    await loadUsers();
                } catch (err) {
                    showFeedback(err.message || `Failed to ${action} user.`, "error");
                    btn.disabled = false;
                }
            });
        });
    }

function renderPendingUsers() {
    const tbody = document.getElementById("pendingUsersTableBody");
    if (!tbody) return;
    const pendingUsers =
        registeredUsers.filter(u => !u.approved);

    if (pendingUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3"
                    class="p-6 text-center text-slate-400">
                    No pending approvals.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pendingUsers.map(user => `
        <tr class="border-b border-slate-800/40">
            <td class="p-4">${user.username}</td>
            <td class="p-4">${user.email}</td>
            <td class="p-4">
                <button
                    data-uid="${user.id}"
                    class="pending-approve-btn px-3 py-1 bg-sky-500 text-slate-950 rounded-lg">
                    Approve
                </button>
            </td>
        </tr>
    `).join("");

    document.querySelectorAll(".pending-approve-btn")
        .forEach(btn => {
            btn.addEventListener("click", async () => {

                const uid = btn.dataset.uid;

                await apiFetch(`/api/admin/approve/${uid}`, {
                    method: "PUT"
                });

                await loadUsers();
                renderPendingUsers();
            });
        });
}

    // ════════════════════════════════════════════════════════════════════════
    //  CATEGORIES  (full CRUD)
    // ════════════════════════════════════════════════════════════════════════
    async function loadCategories() {
        try {
            categories = await apiFetch("/api/admin/categories");
            renderCategoryList();
        } catch (e) {
            if (catList) catList.innerHTML = `<li class="px-3 py-2 text-xs text-rose-400">Failed to load categories.</li>`;
        }
    }

    function renderCategoryList() {
        // ── Sidebar nav category filter buttons ──────────────────────────────
        const navCatDropdown = document.getElementById("navCategoryDropdown");
        if (navCatDropdown) {
            if (categories.length === 0) {
                navCatDropdown.innerHTML = `<span class="px-3 py-2 text-xs text-slate-500 font-mono block">No categories yet.</span>`;
            } else {
                navCatDropdown.innerHTML = categories.map(c =>
                    `<button data-filter-type="category" data-filter-value="${c.name}"
                        class="nav-filter-btn w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-slate-400 hover:text-sky-300 hover:bg-sky-950/10 rounded-lg transition">
                        <span class="shrink-0">${c.emoji}</span>
                        <span>${c.name.charAt(0).toUpperCase() + c.name.slice(1)}</span>
                    </button>`
                ).join("");
                navCatDropdown.querySelectorAll(".nav-filter-btn").forEach(wireNavFilterBtn);
            }
        }

        // ── Category manager list ─────────────────────────────────────────────
        if (!catList) return;
        if (categories.length === 0) {
            catList.innerHTML = `<li class="px-3 py-2 text-xs text-slate-500 font-mono">No categories yet. Click + to add one.</li>`;
            return;
        }
        catList.innerHTML = categories.map(cat => {
            const badge = COLOR_BADGE[cat.color] || COLOR_BADGE.slate;
            return `
            <li data-cat-id="${cat.id}" class="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-900/40 transition">
                <div class="flex items-center space-x-2 min-w-0">
                    <span class="shrink-0 text-sm">${cat.emoji}</span>
                    <span class="text-xs font-medium text-slate-300 truncate">${cat.name}</span>
                    <span class="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-mono rounded border ${badge} uppercase tracking-wide shrink-0">${cat.color}</span>
                </div>
                <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button data-cat-edit="${cat.id}" title="Edit"
                        class="p-1 rounded hover:bg-sky-500/10 text-slate-500 hover:text-sky-400 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button data-cat-delete="${cat.id}" title="Delete"
                        class="p-1 rounded hover:bg-rose-950/30 text-slate-500 hover:text-rose-400 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                    </button>
                </div>
            </li>`;
        }).join("");

        catList.querySelectorAll("[data-cat-edit]").forEach(btn =>
            btn.addEventListener("click", () => openEditForm(parseInt(btn.dataset.catEdit)))
        );
        catList.querySelectorAll("[data-cat-delete]").forEach(btn =>
            btn.addEventListener("click", () => confirmDeleteCategory(parseInt(btn.dataset.catDelete)))
        );
    }

    // ── Category form helpers ─────────────────────────────────────────────────
    function openCreateForm() {
        editingCatId = null;
        catFormTitle.textContent = "New Category";
        catFormName.value  = "";
        catFormEmoji.value = "📌";
        catFormColor.value = "slate";
        catFormDesc.value  = "";
        catForm.classList.remove("hidden");
        catFormName.focus();
    }

    function openEditForm(id) {
        const cat = categories.find(c => c.id === id);
        if (!cat) return;
        editingCatId = id;
        catFormTitle.textContent = "Edit Category";
        catFormName.value  = cat.name;
        catFormEmoji.value = cat.emoji;
        catFormColor.value = cat.color || "slate";
        catFormDesc.value  = cat.description || "";
        catForm.classList.remove("hidden");
        catFormName.focus();
    }

    function closeForm() {
        catForm.classList.add("hidden");
        editingCatId = null;
    }

    async function saveCategory() {
        const name  = catFormName.value.trim();
        const emoji = catFormEmoji.value.trim() || "📌";
        const color = catFormColor.value || "slate";
        const desc  = catFormDesc.value.trim() || null;
        if (!name) { showFeedback("Category name is required.", "error"); catFormName.focus(); return; }

        catFormSave.disabled = true;
        catFormSave.textContent = "Saving…";
        try {
            if (editingCatId === null) {
                const created = await apiFetch("/api/admin/categories", {
                    method: "POST",
                    body: JSON.stringify({ name, emoji, color, description: desc })
                });
                categories.push(created);
                showFeedback(`Category '${created.name}' created.`, "success");
            } else {
                const updated = await apiFetch(`/api/admin/categories/${editingCatId}`, {
                    method: "PUT",
                    body: JSON.stringify({ name, emoji, color, description: desc })
                });
                const idx = categories.findIndex(c => c.id === editingCatId);
                if (idx !== -1) categories[idx] = updated;
                showFeedback(`Category '${updated.name}' updated.`, "success");
            }
            renderCategoryList();
            // Refresh task tables so new category name/options appear
            renderTasksOverrideTable(allAdminTodos);
            closeForm();
        } catch (err) {
            showFeedback(err.message || "Failed to save category.", "error");
        } finally {
            catFormSave.disabled = false;
            catFormSave.textContent = "Save";
        }
    }

    async function confirmDeleteCategory(id) {
        const cat = categories.find(c => c.id === id);
        if (!cat) return;
        if (!window.confirm(`Delete category "${cat.emoji} ${cat.name}"?\n\nTasks in this category will be reassigned to a fallback.`)) return;
        try {
            const result = await apiFetch(`/api/admin/categories/${id}`, { method: "DELETE" });
            categories = categories.filter(c => c.id !== id);
            renderCategoryList();
            showFeedback(result.detail || "Category deleted.", "success");
            await loadTasksForOverride();
        } catch (err) {
            showFeedback(err.message || "Failed to delete category.", "error");
        }
    }

    // ── Wire category form buttons ────────────────────────────────────────────
    if (catAddBtn)     catAddBtn.addEventListener("click", openCreateForm);
    if (catFormSave)   catFormSave.addEventListener("click", saveCategory);
    if (catFormCancel) catFormCancel.addEventListener("click", closeForm);

    // ════════════════════════════════════════════════════════════════════════
    //  TASK OVERRIDE TABLE
    // ════════════════════════════════════════════════════════════════════════
    async function loadTasksForOverride() {
        if (!tasksOverrideTableBody) return;
        try {
            allAdminTodos = await apiFetch("/api/admin/todos");
            populateUserFilter();
            renderTasksOverrideTable(allAdminTodos);
        } catch (e) {
            showFeedback("Failed to load task override panel.", "error");
        }
    }

    function populateUserFilter() {
        if (!taskUserFilterSelect) return;
        const userIds = [...new Set(allAdminTodos.map(t => t.user_id))];
        const opts = userIds.map(uid => {
            const u = registeredUsers.find(u => u.id === uid);
            return `<option value="${uid}">${u ? u.username : `User #${uid}`}</option>`;
        }).join("");
        taskUserFilterSelect.innerHTML = `<option value="all">All Users</option>${opts}`;
        taskUserFilterSelect.onchange = () => {
            const val = taskUserFilterSelect.value;
            renderTasksOverrideTable(val === "all" ? allAdminTodos : allAdminTodos.filter(t => String(t.user_id) === val));
        };
    }

    function renderTasksOverrideTable(todos) {
        if (!tasksOverrideTableBody) return;
        if (todos.length === 0) {
            tasksOverrideTableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-sm text-slate-400">No tasks found.</td></tr>`;
            return;
        }

        // Build fresh maps from the live categories array every render
        const catColorMap = buildCatColorMap();
        const catIconMap  = buildCatIconMap();

        tasksOverrideTableBody.innerHTML = todos.map(task => {
            const owner      = registeredUsers.find(u => u.id === task.user_id);
            const ownerLabel = owner ? owner.username : `#${task.user_id}`;
            const prColor    = PRIORITY_BADGE[task.priority]  || PRIORITY_BADGE.medium;
            const catColor   = catColorMap[task.category]     || COLOR_BADGE.slate;
            const icon       = catIconMap[task.category]      || "📌";
            const titleStyle = task.completed ? "line-through text-slate-500" : "text-slate-200";

            return `
            <tr class="border-b border-slate-800/40 hover:bg-slate-900/20 text-sm" data-task-id="${task.id}">
                <td class="p-4 max-w-[200px]">
                    <p class="font-medium ${titleStyle} truncate" title="${task.title}">${task.title}</p>
                    <p class="text-2xs text-slate-500 font-mono mt-0.5">${ownerLabel}</p>
                </td>
                <td class="p-4">
                    <span class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded border ${prColor} current-priority-badge">${task.priority}</span>
                </td>
                <td class="p-4">
                    <span class="px-2 py-0.5 text-2xs font-mono rounded border ${catColor} current-category-badge">${icon} ${task.category}</span>
                </td>
                <td class="p-4">
                    <select class="priority-override-select glass-input text-xs rounded-lg px-2 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-200 focus:outline-none">
                        <option value="high"   ${task.priority === "high"   ? "selected" : ""}>⬆ High</option>
                        <option value="medium" ${task.priority === "medium" ? "selected" : ""}>➡ Medium</option>
                        <option value="low"    ${task.priority === "low"    ? "selected" : ""}>⬇ Low</option>
                    </select>
                </td>
                <td class="p-4">
                    <select class="category-override-select glass-input text-xs rounded-lg px-2 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-200 focus:outline-none">
                        ${categoryOptionsHtml(task.category)}
                    </select>
                </td>
                <td class="p-4 text-right">
                    <button class="apply-override-btn px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-slate-200 transition">Apply</button>
                </td>
            </tr>`;
        }).join("");

        tasksOverrideTableBody.querySelectorAll(".apply-override-btn").forEach(btn => {
            btn.addEventListener("click", () => applyOverride(btn, tasksOverrideTableBody));
        });
    }

    // ── Shared apply logic used by both tables ────────────────────────────────
    async function applyOverride(btn, tbody) {
        const row         = btn.closest("tr");
        const taskId      = row.dataset.taskId;
        const newPriority = row.querySelector(".priority-override-select").value;
        const newCategory = row.querySelector(".category-override-select").value;

        btn.disabled = true;
        btn.textContent = "Saving…";
        try {
            await apiFetch(`/api/admin/todos/${taskId}/override`, {
                method: "PUT",
                body: JSON.stringify({ priority: newPriority, category: newCategory })
            });

            // Update badges in-place
            const catColorMap = buildCatColorMap();
            const catIconMap  = buildCatIconMap();

            const prBadge  = row.querySelector(".current-priority-badge");
            prBadge.className = `px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded border current-priority-badge ${PRIORITY_BADGE[newPriority]}`;
            prBadge.textContent = newPriority;

            const catBadge = row.querySelector(".current-category-badge");
            catBadge.className = `px-2 py-0.5 text-2xs font-mono rounded border current-category-badge ${catColorMap[newCategory] || COLOR_BADGE.slate}`;
            catBadge.textContent = `${catIconMap[newCategory] || "📌"} ${newCategory}`;

            // Sync local cache
            const cached = allAdminTodos.find(t => String(t.id) === taskId);
            if (cached) { cached.priority = newPriority; cached.category = newCategory; }

            showFeedback(`Task #${taskId} → priority: ${newPriority}, category: ${newCategory}.`, "success");
        } catch (err) {
            showFeedback(err.message || "Failed to update task.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Apply";
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  FILTERED VIEW (sidebar filter buttons)
    // ════════════════════════════════════════════════════════════════════════
    function showMainContent() {
        adminMainContent?.classList.remove("hidden");
        adminFilteredViewPanel?.classList.add("hidden");
        document.querySelectorAll(".nav-filter-btn").forEach(b =>
            b.classList.remove("bg-slate-800/60", "text-slate-100")
        );
    }

    function renderAdminFilteredTasks(todos) {
        if (!adminFilteredTasksBody) return;
        if (todos.length === 0) {
            adminFilteredTasksBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-sm text-slate-400">No tasks match this filter.</td></tr>`;
            return;
        }

        const catColorMap = buildCatColorMap();
        const catIconMap  = buildCatIconMap();

        adminFilteredTasksBody.innerHTML = todos.map(task => {
            const owner      = registeredUsers.find(u => u.id === task.user_id);
            const ownerLabel = owner ? owner.username : `#${task.user_id}`;
            const prColor    = PRIORITY_BADGE[task.priority]  || PRIORITY_BADGE.medium;
            const catColor   = catColorMap[task.category]     || COLOR_BADGE.slate;
            const icon       = catIconMap[task.category]      || "📌";
            const titleStyle = task.completed ? "line-through text-slate-500" : "text-slate-200";

            return `
            <tr class="border-b border-slate-800/40 hover:bg-slate-900/20 text-sm" data-task-id="${task.id}">
                <td class="p-4 max-w-[200px]">
                    <p class="font-medium ${titleStyle} truncate" title="${task.title}">${task.title}</p>
                    <p class="text-2xs text-slate-500 font-mono mt-0.5">${ownerLabel}</p>
                </td>
                <td class="p-4">
                    <span class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded border ${prColor} current-priority-badge">${task.priority}</span>
                </td>
                <td class="p-4">
                    <span class="px-2 py-0.5 text-2xs font-mono rounded border ${catColor} current-category-badge">${icon} ${task.category}</span>
                </td>
                <td class="p-4">
                    <select class="priority-override-select glass-input text-xs rounded-lg px-2 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-200 focus:outline-none">
                        <option value="high"   ${task.priority === "high"   ? "selected" : ""}>⬆ High</option>
                        <option value="medium" ${task.priority === "medium" ? "selected" : ""}>➡ Medium</option>
                        <option value="low"    ${task.priority === "low"    ? "selected" : ""}>⬇ Low</option>
                    </select>
                </td>
                <td class="p-4">
                    <select class="category-override-select glass-input text-xs rounded-lg px-2 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-200 focus:outline-none">
                        ${categoryOptionsHtml(task.category)}
                    </select>
                </td>
                <td class="p-4 text-right">
                    <button class="apply-override-btn px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-slate-200 transition">Apply</button>
                </td>
            </tr>`;
        }).join("");

        adminFilteredTasksBody.querySelectorAll(".apply-override-btn").forEach(btn => {
            btn.addEventListener("click", () => applyOverride(btn, adminFilteredTasksBody));
        });
    }

    function wireNavFilterBtn(btn) {
        btn.addEventListener("click", () => {
            const type  = btn.dataset.filterType;
            const value = btn.dataset.filterValue;

            document.querySelectorAll(".nav-filter-btn").forEach(b =>
                b.classList.remove("bg-slate-800/60", "text-slate-100")
            );
            btn.classList.add("bg-slate-800/60", "text-slate-100");

            adminMainContent?.classList.add("hidden");
            adminFilteredViewPanel?.classList.remove("hidden");

            // Build title
            const titleMap = {
                priority: { high: "⬆ High Priority Tasks", medium: "➡ Medium Priority Tasks", low: "⬇ Low Priority Tasks" },
                status:   { pending: "🕐 Pending Tasks", completed: "✅ Completed Tasks" },
            };
            let titleLabel = titleMap[type]?.[value];
            if (!titleLabel && type === "category") {
                const cat = categories.find(c => c.name === value);
                titleLabel = cat ? `${cat.emoji} ${cat.name.charAt(0).toUpperCase() + cat.name.slice(1)} Tasks` : `📌 ${value} Tasks`;
            }
            if (adminFilteredViewTitle) adminFilteredViewTitle.textContent = titleLabel || value;
            if (adminFilteredViewSub)   adminFilteredViewSub.textContent   = "Click Apply on any row to update priority or category";

            let filtered = allAdminTodos;
            if (type === "priority") filtered = allAdminTodos.filter(t => t.priority === value);
            else if (type === "category") filtered = allAdminTodos.filter(t => t.category === value);
            else if (type === "status") filtered = allAdminTodos.filter(t => value === "completed" ? t.completed : !t.completed);

            renderAdminFilteredTasks(filtered);
        });
    }

    // Wire static nav filter buttons (priority + status — already in HTML)
    document.querySelectorAll(".nav-filter-btn").forEach(wireNavFilterBtn);

    if (adminClearFilterBtn) adminClearFilterBtn.addEventListener("click", showMainContent);

    // ════════════════════════════════════════════════════════════════════════
    //  SIDEBAR COLLAPSIBLES
    // ════════════════════════════════════════════════════════════════════════
    function setupCollapsible(toggleId, dropdownId, chevronId) {
        const toggle   = document.getElementById(toggleId);
        const dropdown = document.getElementById(dropdownId);
        const chevron  = document.getElementById(chevronId);
        if (!toggle || !dropdown) return;
        toggle.addEventListener("click", () => {
            const isOpen = !dropdown.classList.contains("hidden");
            dropdown.classList.toggle("hidden", isOpen);
            if (chevron) chevron.style.transform = isOpen ? "" : "rotate(180deg)";
        });
    }
    setupCollapsible("navPriorityToggle", "navPriorityDropdown", "navPriorityChevron");
    setupCollapsible("navCategoryToggle", "navCategoryDropdown", "navCategoryChevron");
    setupCollapsible("navStatusToggle",   "navStatusDropdown",   "navStatusChevron");

    // ════════════════════════════════════════════════════════════════════════
    //  UTILITY BUTTONS
    // ════════════════════════════════════════════════════════════════════════
    if (approveAllBtn) {
        approveAllBtn.addEventListener("click", async () => {
            approveAllBtn.disabled = true;
            try {
                const res = await apiFetch("/approve-all");
                showFeedback(res.detail || "Mass approval complete.", "success");
                await loadUsers();
            } catch (err) {
                showFeedback(err.message || "Mass approval failed.", "error");
            } finally {
                approveAllBtn.disabled = false;
            }
        });
    }

    if (restoreAdminBtn) {
        restoreAdminBtn.addEventListener("click", async () => {
            restoreAdminBtn.disabled = true;
            try {
                const res = await apiFetch("/reset-admin");
                showFeedback(res.detail || "Admin password restored.", "success");
            } catch (err) {
                showFeedback(err.message || "Restoration failed.", "error");
            } finally {
                restoreAdminBtn.disabled = false;
            }
        });
    }



    // =============================
    // ADMIN SECTION NAVIGATION
    // =============================
    const usersSection = document.getElementById("usersSection");
    const statsSection = document.getElementById("statsSection");
    const pendingSection = document.getElementById("pendingSection");

    function hideAdminSections() {
        usersSection?.classList.add("hidden");
        statsSection?.classList.add("hidden");
        pendingSection?.classList.add("hidden");
    }

    document.querySelectorAll(".admin-nav-btn").forEach(btn =>{
        btn.addEventListener("click", () =>{
            const section = btn.dataset.section;
            if(section === "categoriesSection") {
                document.getElementById("catList")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
                return;
            }

            hideAdminSections();

            if(section === "usersSection") {
                usersSection?.classList.remove("hidden")
            }

            if(section === "statsSection") {
                statsSection?.classList.remove("hidden");
            }

            if (section === "pendingSection") {
                pendingSection?.classList.remove("hidden");
                renderPendingUsers();
            }
        })
    });

    // ════════════════════════════════════════════════════════════════════════
    //  INIT  — load in the correct order so categories[] is ready
    //          before the task table tries to build category dropdowns
    // ════════════════════════════════════════════════════════════════════════
    await loadUsers();
    await loadCategories();
    await loadTasksForOverride();
});
