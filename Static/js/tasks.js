document.addEventListener("DOMContentLoaded", async () => {
    // Guard check
    requireSession();
 
    // Elements
    const tasksTableBody = document.getElementById("tasksTableBody");
    const taskForm = document.getElementById("taskForm");
    const searchTaskInput = document.getElementById("searchTask");
    const categoryFilterSelect = document.getElementById("categoryFilter");
    const priorityFilterSelect = document.getElementById("priorityFilter");
    const statusFilterSelect = document.getElementById("statusFilter"); 
    // AI Priority suggestion elements
    const taskTitleInput = document.getElementById("taskTitle");
    const taskPrioritySelect = document.getElementById("taskPriority");
    const suggestPriorityBtn = document.getElementById("suggestPriorityBtn");
    const prioritySuggestionBadge = document.getElementById("prioritySuggestionBadge");
    // OCR Modal/Scanner Selectors
    const ocrDropzone = document.getElementById("ocrDropzone");
    const ocrFileInput = document.getElementById("ocrFileInput");
    const ocrScanningLoader = document.getElementById("ocrScanningLoader");
    const ocrResultsPanel = document.getElementById("ocrResultsPanel");
    const ocrTasksList = document.getElementById("ocrTasksList");
    const importOcrBtn = document.getElementById("importOcrBtn");
    const cancelOcrBtn = document.getElementById("cancelOcrBtn");
    // Sidebar admin links
    const adminTabLink = document.getElementById("adminTabLink");
    const adminTabMobile = document.getElementById("adminTabMobile");
    let allTasksList = [];
    let ocrParsedPendingTasks = [];

    // Reveal admin sidebar links if current user is admin
    async function initAdminNav() {
        try {
            const profile = await apiFetch("/api/me");
            if (profile && profile.role === "admin") {
                if (adminTabLink) adminTabLink.classList.remove("hidden");
                if (adminTabMobile) adminTabMobile.style.display = "block";
            }
        } catch (e) {
            // silently ignore — non-critical
        }
    }
 
    // Load active checklists
    async function loadCheckedTasks() {
        try {
            allTasksList = await apiFetch("/api/todos");
            renderCheckedTasks();
        } catch (e) {
            console.error("Failed to fetch checklists:", e);
        }
    }
 
    // Render client list matching active filters
    function renderCheckedTasks() {
        if (!tasksTableBody) return;
        const searchText = (searchTaskInput?.value || "").toLowerCase();
        const selectedCat = categoryFilterSelect?.value || "all";
        const selectedPrior = priorityFilterSelect?.value || "all";
        const selectedStatus = statusFilterSelect?.value || "all";
        let filtered = allTasksList.filter(item => {
            const matchesSearch = item.title.toLowerCase().includes(searchText) ||
                                  (item.description && item.description.toLowerCase().includes(searchText));
            const matchesCat = selectedCat === "all" || item.category === selectedCat;
            const matchesPrior = selectedPrior === "all" || item.priority === selectedPrior;
            let matchesStatus = true;
            if (selectedStatus === "completed") matchesStatus = item.completed;
            else if (selectedStatus === "pending") matchesStatus = !item.completed;
            return matchesSearch && matchesCat && matchesPrior && matchesStatus;
        });
 
        // Sort: Completed tasks sink, high priority rises
        const priorityScore = { high: 1, medium: 2, low: 3 };
        filtered.sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            return priorityScore[a.priority] - priorityScore[b.priority];
        });
 
        if (filtered.length === 0) {
            tasksTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-sm text-slate-400">
                        No checklist items coincide with your search constraints.
                    </td>
                </tr>
            `;
            return;
        }
 
        tasksTableBody.innerHTML = filtered.map(item => {
            const dateDisplay = item.due_date
                ? new Date(item.due_date).toLocaleDateString(undefined, {month: "short", day: "numeric"})
                : '<span class="text-slate-600">-</span>';

            const checkboxChecked = item.completed ? "checked" : "";
            const textLineDecoration = item.completed ? "line-through text-slate-500" : "text-slate-100";
            const descStyle = item.completed ? "text-slate-600" : "text-slate-400";

            const priorityBadgeColor = {
                high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }[item.priority] || "bg-slate-500/10 text-slate-400";

            const catLabel = {
                work: "💼 Work",
                personal: "👤 Personal",
                learning: "📚 Learning",
                health: "❤️ Health",
                other: "✨ Other"
            }[item.category] || `📌 ${item.category}`;

            // Priority and category are admin-only after creation — show lock indicator
            const adminOnlyTitle = "title=\"Priority and category can only be changed by an admin\"";
            const aiBadge = item.ai_generated
                ? `<span class="mx-1.5 shrink-0 px-1.5 py-0.5 rounded ai-badge text-[9px] font-mono tracking-widest font-bold uppercase">AI</span>`
                : "";
            return `
                <tr class="border-b border-slate-900/30 hover:bg-slate-900/10 transition-all text-sm group">
                    <td class="p-4 w-10 shrink-0">
                        <input type="checkbox" ${checkboxChecked} data-todo-id="${item.id}" class="checkbox-anim w-4.5 h-4.5 rounded border-slate-700 bg-slate-900 focus:ring-0 cursor-pointer">
                    </td>
                    <td class="p-4">
                        <div class="flex items-center">
                            <span class="font-medium ${textLineDecoration}">${item.title}</span>
                            ${aiBadge}
                        </div>
                        ${item.description ? `<p class="text-xs ${descStyle} mt-0.5 max-w-lg truncate h-4 hover:h-auto overflow-hidden">${item.description}</p>` : ""}
                    </td>
                    <td class="p-4"><span ${adminOnlyTitle} class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono font-medium rounded-lg text-slate-300 bg-slate-900/40 border border-slate-800 cursor-default select-none">${catLabel} <span class="opacity-40 text-[9px]">🔒</span></span></td>
                    <td class="p-4"><span ${adminOnlyTitle} class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded ${priorityBadgeColor} cursor-default select-none">${item.priority} <span class="opacity-40 text-[9px]">🔒</span></span></td>
                    <td class="p-4 font-mono text-xs text-slate-400">${dateDisplay}</td>
                    <td class="p-4 text-right">
                        <button data-todo-id="${item.id}" class="delete-task-btn p-1.5 rounded-lg border border-transparent hover:border-rose-900/30 bg-transparent hover:bg-rose-955/20 text-slate-500 hover:text-rose-400 opacity-80 group-hover:opacity-100 transition">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
 
        // Reconnect icons in table dynamically
        lucide.createIcons();
 
        // Checkbox toggle actions
        tasksTableBody.querySelectorAll("input[type='checkbox']").forEach(chk => {
            chk.addEventListener("change", async () => {
                const todoId = chk.getAttribute("data-todo-id");
                try {
                    await apiFetch(`/api/todos/${todoId}/toggle`, { method: "PUT" });
                    await loadCheckedTasks();
                } catch (e) {
                    alert("Failure updating checklist toggle: " + e.message);
                    chk.checked = !chk.checked; // revert
                }
            });
        });
 
        // Delete button triggers
        tasksTableBody.querySelectorAll(".delete-task-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const todoId = btn.getAttribute("data-todo-id");
                if (confirm("Delete this checklist goal?")) {
                    try {
                        await apiFetch(`/api/todos/${todoId}`, { method: "DELETE" });
                        await loadCheckedTasks();
                    } catch (e) {
                        alert("Failure removing checklist item: " + e.message);
                    }
                }
            });
        });
    }
 
    //  AI Priority Suggestion
    if (suggestPriorityBtn) {
        suggestPriorityBtn.addEventListener("click", async () => {
            const title = taskTitleInput?.value?.trim();
            if (!title) {
                alert("Enter a task title first so AI can assess its priority.");
                return;
            }
            suggestPriorityBtn.disabled = true;
            suggestPriorityBtn.textContent = "Analyzing...";
            try {
                const desc = document.getElementById("taskDesc")?.value || null;
                const dueDate = document.getElementById("taskDueDate")?.value || null;
                const result = await apiFetch("/api/ai/suggest-priority", {
                    method: "POST",
                    body: JSON.stringify({ title, description: desc, due_date: dueDate })
                });
 
                if (result && result.priority) {
                    // Apply the suggestion to the dropdown
                    if (taskPrioritySelect) taskPrioritySelect.value = result.priority;
                    // Show the reason badge
                    if (prioritySuggestionBadge) {
                        const colorMap = {
                            high: "text-rose-400 border-rose-500/20 bg-rose-950/10",
                            medium: "text-amber-400 border-amber-500/20 bg-amber-950/10",
                            low: "text-emerald-400 border-emerald-500/20 bg-emerald-950/10"
                        };
                        const colors = colorMap[result.priority] || "text-slate-400 border-slate-700 bg-slate-900/30";
                        prioritySuggestionBadge.className = `mt-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${colors}`;
                        prioritySuggestionBadge.innerHTML = `🤖 AI set priority to <strong>${result.priority}</strong>${result.reason ? ` — ${result.reason}` : ""}`;
                        prioritySuggestionBadge.classList.remove("hidden");
                    }
                }
            } catch (err) {
                alert("AI priority suggestion failed: " + err.message);
            } finally {
                suggestPriorityBtn.disabled = false;
                suggestPriorityBtn.textContent = "✦ AI Suggest";
            }
        });
    }
 
    // Task Creation Form handling
    if (taskForm) {
        taskForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitBtn = taskForm.querySelector("button[type='submit']");
            submitBtn.disabled = true;
            submitBtn.textContent = "🤖 AI is classifying task...";
            const title = document.getElementById("taskTitle").value;
            const description = document.getElementById("taskDesc").value;
            const due_date = document.getElementById("taskDueDate").value || null;

            try {
                // Always let AI decide both priority and category
                let priority = "medium"; // fallback
                let category = "work";   // fallback
                try {
                    const aiResult = await apiFetch("/api/ai/suggest-priority", {
                        method: "POST",
                        body: JSON.stringify({ title, description, due_date })
                    });
                    if (aiResult && aiResult.priority) {
                        priority = aiResult.priority;
                    }
                    if (aiResult && aiResult.category) {
                        category = aiResult.category;
                    }
                } catch (aiErr) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Create Goal";
                        alert("Could not assign AI priority/category: " + aiErr.message + "\nPlease try again in a moment.");
                        return;
                    }

                await apiFetch("/api/todos", {
                    method: "POST",
                    body: JSON.stringify({
                        title,
                        description,
                        category,
                        priority,
                        due_date,
                        ai_generated: true
                    })
                });
                taskForm.reset();
                await loadCheckedTasks();
            } catch (err) {
            alert("Creation failure: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Goal";
        }
    });
}
 
    // Sidebar collapsible toggles
    function setupSidebarCollapsible(toggleId, dropdownId, chevronId) {
        const toggle = document.getElementById(toggleId);
        const dropdown = document.getElementById(dropdownId);
        const chevron = document.getElementById(chevronId);
        if (!toggle || !dropdown) return;
        toggle.addEventListener("click", () => {
            const isOpen = !dropdown.classList.contains("hidden");
            dropdown.classList.toggle("hidden", isOpen);
            if (chevron) chevron.style.transform = isOpen ? "" : "rotate(180deg)";
        });
    }
    setupSidebarCollapsible("navPriorityToggle", "navPriorityDropdown", "navPriorityChevron");
    setupSidebarCollapsible("navCategoryToggle", "navCategoryDropdown", "navCategoryChevron");
    setupSidebarCollapsible("navStatusToggle",   "navStatusDropdown",   "navStatusChevron");

    // Filtered view elements
    const mainContent = document.getElementById("mainContent");
    const filteredViewPanel = document.getElementById("filteredViewPanel");
    const filteredViewTitle = document.getElementById("filteredViewTitle");
    const filteredViewSubtitle = document.getElementById("filteredViewSubtitle");
    const filteredTasksTableBody = document.getElementById("filteredTasksTableBody");
    const clearFilterBtn = document.getElementById("clearFilterBtn");

    function showMainContent() {
        if (mainContent) mainContent.classList.remove("hidden");
        if (filteredViewPanel) filteredViewPanel.classList.add("hidden");
        // Clear active state from all nav filter buttons
        document.querySelectorAll(".nav-filter-btn").forEach(b => b.classList.remove("bg-slate-800/60", "text-slate-100"));
    }

    function renderFilteredTasks(tasks) {
        if (!filteredTasksTableBody) return;
        if (tasks.length === 0) {
            filteredTasksTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-sm text-slate-400">
                        No tasks match this filter.
                    </td>
                </tr>`;
            return;
        }

        const adminOnlyTitle = `title="Priority and category can only be changed by an admin"`;
        filteredTasksTableBody.innerHTML = tasks.map(item => {
            const dateDisplay = item.due_date
                ? new Date(item.due_date).toLocaleDateString(undefined, {month: "short", day: "numeric"})
                : '<span class="text-slate-600">-</span>';
            const checkboxChecked = item.completed ? "checked" : "";
            const textLineDecoration = item.completed ? "line-through text-slate-500" : "text-slate-100";
            const descStyle = item.completed ? "text-slate-600" : "text-slate-400";
            const priorityBadgeColor = {
                high:   "bg-rose-500/10 text-rose-400 border-rose-500/20",
                medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }[item.priority] || "bg-slate-500/10 text-slate-400";
            const catLabel = {
                work: "💼 Work", personal: "👤 Personal", learning: "📚 Learning",
                health: "❤️ Health", other: "✨ Other"
            }[item.category] || `📌 ${item.category}`;
            const aiBadge = item.ai_generated
                ? `<span class="mx-1.5 shrink-0 px-1.5 py-0.5 rounded ai-badge text-[9px] font-mono tracking-widest font-bold uppercase">AI</span>`
                : "";
            return `
                <tr class="border-b border-slate-900/30 hover:bg-slate-900/10 transition-all text-sm group">
                    <td class="p-4 w-10 shrink-0">
                        <input type="checkbox" ${checkboxChecked} data-todo-id="${item.id}" class="filtered-checkbox checkbox-anim w-4.5 h-4.5 rounded border-slate-700 bg-slate-900 focus:ring-0 cursor-pointer">
                    </td>
                    <td class="p-4">
                        <div class="flex items-center">
                            <span class="font-medium ${textLineDecoration}">${item.title}</span>
                            ${aiBadge}
                        </div>
                        ${item.description ? `<p class="text-xs ${descStyle} mt-0.5 max-w-lg truncate">${item.description}</p>` : ""}
                    </td>
                    <td class="p-4"><span ${adminOnlyTitle} class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono font-medium rounded-lg text-slate-300 bg-slate-900/40 border border-slate-800 cursor-default select-none">${catLabel} <span class="opacity-40 text-[9px]">🔒</span></span></td>
                    <td class="p-4"><span ${adminOnlyTitle} class="px-2 py-0.5 text-2xs uppercase tracking-wide font-mono rounded ${priorityBadgeColor} cursor-default select-none">${item.priority} <span class="opacity-40 text-[9px]">🔒</span></span></td>
                    <td class="p-4 font-mono text-xs text-slate-400">${dateDisplay}</td>
                    <td class="p-4 text-right">
                        <button data-todo-id="${item.id}" class="filtered-delete-btn p-1.5 rounded-lg border border-transparent hover:border-rose-900/30 bg-transparent hover:bg-rose-955/20 text-slate-500 hover:text-rose-400 opacity-80 group-hover:opacity-100 transition">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>`;
        }).join("");

        lucide.createIcons();

        filteredTasksTableBody.querySelectorAll(".filtered-checkbox").forEach(chk => {
            chk.addEventListener("change", async () => {
                const todoId = chk.getAttribute("data-todo-id");
                try {
                    await apiFetch(`/api/todos/${todoId}/toggle`, { method: "PUT" });
                    await loadCheckedTasks();
                    // Re-apply current filter after reload
                    const activeBtn = document.querySelector(".nav-filter-btn.bg-slate-800\\/60");
                    if (activeBtn) activeBtn.click();
                } catch (e) {
                    chk.checked = !chk.checked;
                }
            });
        });

        filteredTasksTableBody.querySelectorAll(".filtered-delete-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const todoId = btn.getAttribute("data-todo-id");
                if (confirm("Delete this task?")) {
                    try {
                        await apiFetch(`/api/todos/${todoId}`, { method: "DELETE" });
                        await loadCheckedTasks();
                        const activeBtn = document.querySelector(".nav-filter-btn.bg-slate-800\\/60");
                        if (activeBtn) activeBtn.click();
                    } catch (e) {
                        alert("Failed to delete: " + e.message);
                    }
                }
            });
        });
    }

    // Wire up all sidebar filter buttons
    document.querySelectorAll(".nav-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.getAttribute("data-filter-type");
            const value = btn.getAttribute("data-filter-value");

            // Highlight active button
            document.querySelectorAll(".nav-filter-btn").forEach(b => b.classList.remove("bg-slate-800/60", "text-slate-100"));
            btn.classList.add("bg-slate-800/60", "text-slate-100");

            // Hide main content, show filtered panel
            if (mainContent) mainContent.classList.add("hidden");
            if (filteredViewPanel) filteredViewPanel.classList.remove("hidden");

            // Title labels
            const titleMap = {
                priority: { high: "⬆ High Priority Tasks", medium: "➡ Medium Priority Tasks", low: "⬇ Low Priority Tasks" },
                category: { work: "💼 Work Tasks", personal: "👤 Personal Tasks", learning: "📚 Learning Tasks", health: "❤️ Health Tasks", other: "✨ Other Tasks" },
                status:   { pending: "🕐 Pending Tasks", completed: "✅ Completed Tasks" }
            };
            const subtitleMap = {
                priority: "Filtered by priority level",
                category: "Filtered by category",
                status:   "Filtered by completion status"
            };

            if (filteredViewTitle) filteredViewTitle.textContent = titleMap[type]?.[value] || value;
            if (filteredViewSubtitle) filteredViewSubtitle.textContent = subtitleMap[type] || "";

            // Filter tasks
            let filtered = allTasksList;
            if (type === "priority") filtered = allTasksList.filter(t => t.priority === value);
            else if (type === "category") filtered = allTasksList.filter(t => t.category === value);
            else if (type === "status") filtered = allTasksList.filter(t => value === "completed" ? t.completed : !t.completed);

            renderFilteredTasks(filtered);
        });
    });

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener("click", () => {
            showMainContent();
        });
    }

    // Connect real-time filters (toolbar dropdowns)
    searchTaskInput?.addEventListener("input", renderCheckedTasks);
    categoryFilterSelect?.addEventListener("change", renderCheckedTasks);
    priorityFilterSelect?.addEventListener("change", renderCheckedTasks);
    statusFilterSelect?.addEventListener("change", renderCheckedTasks);
 
 
    //  OCR Drag and Drop task scanner triggers 
    // Prevent defaults on drag triggers
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        ocrDropzone?.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
 
    ['dragenter', 'dragover'].forEach(eventName => {
        ocrDropzone?.addEventListener(eventName, () => {
            ocrDropzone.classList.add("border-olive-500", "bg-olive-950/20");
        });
    });
 
    ['dragleave', 'drop'].forEach(eventName => {
        ocrDropzone?.addEventListener(eventName, () => {
            ocrDropzone.classList.remove("border-olive-500", "bg-olive-950/20");
        });
    });
 
    ocrDropzone?.addEventListener("drop", (e) => {
        const fileTransfer = e.dataTransfer;
        const files = fileTransfer.files;
        if (files.length > 0) {
            handleOcrFileScan(files[0]);
        }
    });
 
    ocrDropzone?.addEventListener("click", () => {
        ocrFileInput?.click();
    });
 
    ocrFileInput?.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleOcrFileScan(e.target.files[0]);
        }
    });
 
    // File base64 reader and OCR extraction network trigger
    function handleOcrFileScan(file) {
        const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
        if (!allowedTypes.includes(file.type)) {
            alert("Scanner supports image files only (PNG, JPG, JPEG, WEBP).");
            return;
        }
 
        const reader = new FileReader();
        reader.onload = async () => {
            const base64Data = reader.result; // full data URI
 
            // Animate Loader state
            ocrDropzone.classList.add("hidden");
            ocrScanningLoader.classList.remove("hidden");
            ocrResultsPanel.classList.add("hidden");
            try {
                const response = await apiFetch("/api/ai/extract", {
                    method: "POST",
                    body: JSON.stringify({
                        image_base64: base64Data,
                        mime_type: file.type
                    })
                });
 
                if (response && response.success) {
                    ocrParsedPendingTasks = response.tasks;
                    renderOcrFindings(response.extractedText);
                } else {
                    alert("OCR scanner returned an unexpected response.");
                    resetOcrModule();
                }
            } catch (err) {
                alert("OCR Parse failed: " + err.message);
                resetOcrModule();
            }
        };
        reader.onerror = () => {
            alert("Failed to read the image file.");
            resetOcrModule();
        };
        reader.readAsDataURL(file);
    }
 
    function renderOcrFindings(summaryText) {
        ocrScanningLoader.classList.add("hidden");
        ocrResultsPanel.classList.remove("hidden");
        const summaryBox = document.getElementById("ocrExtractedTextSummary");
        if (summaryBox) {
            summaryBox.textContent = `Raw OCR Read: "${summaryText || "No text identified"}"`;
        }
        if (!ocrTasksList) return;
        if (ocrParsedPendingTasks.length === 0) {
            ocrTasksList.innerHTML = `
                <div class="p-6 text-center text-sm text-slate-400">
                    Model processed image but located 0 structured goals.
                </div>
            `;
            return;
        }
 
        ocrTasksList.innerHTML = ocrParsedPendingTasks.map((t, idx) => {
            const prColor = {
                high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }[t.priority] || "bg-slate-500/10 text-slate-400";
            return `
                <div class="p-3 border border-slate-800/60 bg-slate-900/40 rounded-xl flex items-start justify-between">
                    <div class="min-w-0 pr-3">
                        <div class="flex items-center flex-wrap gap-2">
                            <h5 class="text-sm font-semibold text-slate-200">${t.title}</h5>
                            <span class="px-1.5 py-0.5 rounded border leading-none font-mono text-3xs uppercase ${prColor}">${t.priority}</span>
                        </div>
                        <p class="text-xs text-slate-400 mt-1">${t.description || "Parsed raw action item."}</p>
                        ${t.dueDate ? `<span class="text-3xs font-mono text-olive-400 mt-1 block">Due: ${t.dueDate}</span>` : ""}
                    </div>
                    <button data-ocr-idx="${idx}" class="remove-ocr-item px-2 py-1 text-2xs bg-rose-950/20 text-rose-300 border border-rose-900/30 hover:bg-rose-950/40 hover:text-rose-200 rounded transition shrink-0">Clear</button>
                </div>
            `;
        }).join("");
 
        // Single item deletion from parsed results
        ocrTasksList.querySelectorAll(".remove-ocr-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-ocr-idx"), 10);
                ocrParsedPendingTasks.splice(idx, 1);
                renderOcrFindings(summaryText);
            });
        });
    }
 
    // Mass import pending OCR parsed items recursively back into DB
    importOcrBtn?.addEventListener("click", async () => {
        if (ocrParsedPendingTasks.length === 0) {
            resetOcrModule();
            return;
        }
        importOcrBtn.disabled = true;
        let successCount = 0;
        for (const task of ocrParsedPendingTasks) {
            try {
                await apiFetch("/api/todos", {
                    method: "POST",
                    body: JSON.stringify({
                        title: task.title,
                        description: task.description,
                        category: task.category || "work",
                        priority: task.priority || "medium",
                        due_date: task.dueDate || null,
                        ai_generated: true
                    })
                });
                successCount++;
            } catch (err) {
                console.error("Subsegment task insertion failed:", err);
            }
        }
        alert(`Successfully synchronized ${successCount} verified tasks into the database!`);
        resetOcrModule();
        await loadCheckedTasks();
    });
    cancelOcrBtn?.addEventListener("click", resetOcrModule);
    function resetOcrModule() {
        ocrParsedPendingTasks = [];
        if (ocrFileInput) ocrFileInput.value = "";
        ocrScanningLoader.classList.add("hidden");
        ocrResultsPanel.classList.add("hidden");
        ocrDropzone.classList.remove("hidden");
        if (importOcrBtn) importOcrBtn.disabled = false;
    }
 
    // Initialize
    await initAdminNav();
    await loadCheckedTasks();
});
