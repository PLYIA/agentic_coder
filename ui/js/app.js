/**
 * Agentic Coder Pro - Logic v2.1
 * Système d'onglets, Terminal interactif et Détection de langage
 */

lucide.createIcons();

// --- 1. ÉTAT GLOBAL DE L'APPLICATION ---
let openFiles = {};          // Format: { path: { model: monaco_model, name: string } }
let activeFilePath = null;
let chatHistory = [];
let fullAiResponse = "";
let isGenerating = false;    // Si l'IA est en train de répondre
let isExecuting = false;     // Si un script Python est en cours dans le terminal
let appliedDiffs = new Set();
let timerInterval = null;
let currentSeconds = 0;
let currentResponseDiv = null;
let changesCountThisTurn = 0; // Pour annuler plusieurs changements d'un coup
let hasReceivedFirstToken = false;
let autoFixTriggeredThisRun = false;
let terminalErrorBuffer = "";
let autoFixDebounceTimer = null;
let explorerRefreshInterval = null;
let expandedFolders = new Set();
let currentWorkspacePath = null;
let contextTarget = null;
const INTEGRATED_THINKING_MODEL_PATTERN = /(deepseek[-_ ]?r1|distill|reasoner|thinking|qwen.*r1)/i;

// Dictionnaire de correspondance Extension -> Langage Monaco
const extensionToLanguage = {
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown',
    'sql': 'sql',
    'c': 'c',
    'cpp': 'cpp',
    'java': 'java',
    'sh': 'shell',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'txt': 'plaintext',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'toml': 'ini',
    'ini': 'ini'
};

function detectLanguageFromFilename(filename = "") {
    const normalized = String(filename).trim().toLowerCase();
    if (!normalized) return 'plaintext';
    const parts = normalized.split('.');
    if (parts.length < 2) return 'plaintext';
    const ext = parts.pop();
    return extensionToLanguage[ext] || 'plaintext';
}

function modelSupportsIntegratedThoughts(modelName = "") {
    return INTEGRATED_THINKING_MODEL_PATTERN.test(String(modelName || ""));
}

function removeThinkingBlocks(text = "") {
    return String(text)
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<think>[\s\S]*$/gi, "");
}

function renderResponseWithThinking(text = "") {
    let html = String(text);
    html = html.replace(/<think>([\s\S]*?)(<\/think>|$)/gi, (m, content, endTag) => {
        const done = Boolean(endTag);
        return `<details class="border border-purple-500/30 rounded-lg"><summary class="bg-purple-500/10 p-2 text-[10px] text-purple-300">🧠 PENSEE ${done ? '✔️' : '...'}</summary><div class="p-3 text-[11px] font-mono text-purple-200 bg-black/40 whitespace-pre-wrap">${escapeHtml((content || "").trim())}</div></details>`;
    });
    return html;
}

function updateModelCapabilitiesUI(modelName = "") {
    const capEl = document.getElementById('model-capabilities');
    if (!capEl) return;
    const hasThinking = modelSupportsIntegratedThoughts(modelName);
    capEl.classList.toggle('hidden', !hasThinking);
    capEl.classList.toggle('flex', hasThinking);
}

function markCurrentFileAsSaved() {
    if (!activeFilePath || !openFiles[activeFilePath]?.model) return;
    openFiles[activeFilePath].savedVersionId = openFiles[activeFilePath].model.getAlternativeVersionId();
    updateTabsUI();
}

function isFileDirty(path) {
    const entry = openFiles[path];
    if (!entry?.model) return false;
    if (String(path).includes("new_")) {
        return entry.model.getValue().trim().length > 0;
    }
    if (typeof entry.savedVersionId !== 'number') return false;
    return entry.model.getAlternativeVersionId() !== entry.savedVersionId;
}

// --- 2. INITIALISATION DE MONACO EDITOR ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
    const initialModel = monaco.editor.createModel("# Agentic Coder Pro\n# Utilisez l'explorateur pour commencer.", 'python');

    window.editor = monaco.editor.create(document.getElementById('monaco-container'), {
        model: initialModel,
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        fontFamily: "'Fira Code', monospace",
        minimap: { enabled: true, side: 'right' },
        lineNumbers: "on",
        renderLineHighlight: "all",
        scrollbar: { vertical: 'visible', verticalScrollbarSize: 8 },
        cursorBlinking: "smooth",
        smoothScrolling: true
    });

    // Raccourci de sauvegarde manuel
    window.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, actionSaveFile);
    window.editor.onDidChangeModelContent(() => updateTabsUI());

    // Mise à jour de l'UI initiale
    updateStatusBar('python');
});

// --- 3. DÉMARRAGE ET CONNEXION ---
window.addEventListener('pywebviewready', async () => {
    try {
        const state = await window.pywebview.api.get_initial_state();
        currentWorkspacePath = state.workspace_path;

        // Sync des paramètres de la modale
        if (document.getElementById('setting-auto-fix'))
            document.getElementById('setting-auto-fix').checked = state.settings.auto_fix;
        if (document.getElementById('setting-agentic-mode'))
            document.getElementById('setting-agentic-mode').checked = Boolean(state.settings.agentic_mode);

        // Chargement des modèles
        const models = await window.pywebview.api.get_models();
        const select = document.getElementById('model-list');
        if (select) {
            select.innerHTML = "";
            models.forEach(m => select.add(new Option(m, m)));
            if (models.length > 0) updateModelCapabilitiesUI(models[0]);
            if (models.length > 0) loadModel();
        }

        // Affichage Sandbox par défaut
        updateWorkspaceUI(state.workspace_name, state.tree);
        startExplorerAutoRefresh();
        refreshDeps();
        refreshEnvironmentStatus();

    } catch (err) {
        console.error("Erreur Init:", err);
    }
});

// --- 4. BARRE D'ÉTAT (FOOTER) ---

function updateStatusBar(langId) {
    const el = document.getElementById('status-lang');
    if (el) el.innerText = langId.toUpperCase();
}

async function refreshEnvironmentStatus() {
    const info = await window.pywebview.api.check_venv();
    const el = document.getElementById('status-venv');
    if (el) el.innerText = info.active ? `Python (${info.name})` : "Python (Global)";
}

// --- 5. GESTION DES FICHIERS ET ONGLETS ---

function updateWorkspaceUI(name, tree) {
    const wsName = document.getElementById('workspace-name');
    if (wsName) wsName.innerText = name.toUpperCase();

    const container = document.getElementById('explorer');
    if (!container) return;
    container.innerHTML = "";

    if (tree.length === 0) return container.innerHTML = '<div class="opacity-20 italic text-[10px] text-center mt-4">Dossier vide</div>';
    renderExplorerNodes(container, tree, 0);
    lucide.createIcons();
    refreshEnvironmentStatus();
}

function renderExplorerNodes(container, nodes, level) {
    nodes.forEach(item => {
        const safePath = item.path.replace(/\\/g, '/');
        const row = document.createElement('div');
        row.className = "flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-[11px] group transition-all";
        row.style.paddingLeft = `${12 + (level * 14)}px`;

        if (item.type === 'folder') {
            const isOpen = expandedFolders.has(safePath);
            row.innerHTML = `<i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}" class="w-3 h-3 text-gray-500"></i><i data-lucide="folder" class="w-4 h-4 text-blue-400/80"></i><span class="group-hover:text-white truncate">${item.name}</span>`;
            row.onclick = async () => {
                if (expandedFolders.has(safePath)) expandedFolders.delete(safePath);
                else expandedFolders.add(safePath);
                await refreshExplorerTree();
            };
        } else {
            row.innerHTML = `<i data-lucide="file-code" class="w-4 h-4 text-gray-500 ml-3"></i><span class="group-hover:text-white truncate">${item.name}</span>`;
            row.onclick = () => openFileFromTree(safePath, item.name);
        }
        row.oncontextmenu = (e) => {
            e.preventDefault();
            showExplorerContextMenu(e.clientX, e.clientY, { path: safePath, type: item.type, name: item.name });
        };
        container.appendChild(row);

        if (item.type === 'folder' && expandedFolders.has(safePath) && Array.isArray(item.children) && item.children.length > 0) {
            renderExplorerNodes(container, item.children, level + 1);
        }
    });
}

async function buildExplorerTree(path) {
    const nodes = await window.pywebview.api.get_file_tree(path);
    const out = [];
    for (const node of nodes) {
        const safePath = node.path.replace(/\\/g, '/');
        const item = { ...node, path: safePath };
        if (item.type === 'folder' && expandedFolders.has(safePath)) {
            item.children = await buildExplorerTree(safePath);
        }
        out.push(item);
    }
    return out;
}

async function refreshExplorerTree() {
    if (!currentWorkspacePath) return;
    const tree = await buildExplorerTree(currentWorkspacePath);
    const wsName = document.getElementById('workspace-name');
    updateWorkspaceUI(wsName ? wsName.innerText : "WORKSPACE", tree);
}

function startExplorerAutoRefresh() {
    if (explorerRefreshInterval) clearInterval(explorerRefreshInterval);
    explorerRefreshInterval = setInterval(async () => {
        try {
            if (!currentWorkspacePath) return;
            const rootTree = await buildExplorerTree(currentWorkspacePath);
            const wsName = document.getElementById('workspace-name');
            updateWorkspaceUI(wsName ? wsName.innerText : "WORKSPACE", rootTree);
        } catch (_) {}
    }, 2000);
}

function showExplorerContextMenu(x, y, target) {
    const menu = document.getElementById('explorer-context-menu');
    if (!menu) return;
    contextTarget = target;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
}

function hideExplorerContextMenu() {
    const menu = document.getElementById('explorer-context-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    contextTarget = null;
}

async function openFileFromTree(path, name) {
    if (!openFiles[path]) {
        const res = await window.pywebview.api.load_file_content(path);
        if (res.success) {
            const lang = detectLanguageFromFilename(name);
            const model = monaco.editor.createModel(res.content, lang);
            openFiles[path] = { name: name, model: model, savedVersionId: model.getAlternativeVersionId() };
        }
    }
    switchToFile(path);
}

async function switchToFile(path) {
    if (!openFiles[path]) return;
    activeFilePath = path;
    await window.pywebview.api.set_current_open_file(path);
    const file = openFiles[path];
    window.editor.setModel(file.model);

    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.innerText = file.name;
    const breadcrumb = document.getElementById('breadcrumb-path');
    if (breadcrumb) breadcrumb.innerText = path;
    updateStatusBar(file.model.getLanguageId());

    updateTabsUI();
    window.editor.focus();
}

function updateTabsUI() {
    const container = document.getElementById('tabs-container');
    if (!container) return;
    container.innerHTML = "";
    Object.keys(openFiles).forEach(path => {
        const isActive = (path === activeFilePath);
        const isDirty = isFileDirty(path);
        const tab = document.createElement('div');
        tab.className = `tab ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}`;
        tab.innerHTML = `<span class="tab-title truncate">${openFiles[path].name}</span>${isDirty ? '<span class="dirty-dot">●</span>' : ''}<i data-lucide="x" class="close-tab w-3 h-3 ml-2 hover:bg-white/10 rounded" onclick="closeTab(event, '${path}')"></i>`;
        tab.onclick = () => switchToFile(path);
        container.appendChild(tab);
    });
    lucide.createIcons();
}

function closeTab(event, path) {
    event.stopPropagation();
    delete openFiles[path];
    const paths = Object.keys(openFiles);
    if (activeFilePath === path) {
        if (paths.length > 0) switchToFile(paths[paths.length - 1]);
        else {
            activeFilePath = null;
            window.pywebview.api.set_current_open_file(null);
            window.editor.setModel(monaco.editor.createModel("", "plaintext"));
            updateStatusBar('plaintext');
        }
    }
    updateTabsUI();
}

// --- 6. TERMINAL INTERACTIF ---

async function handleRunClick() {
    if (isExecuting) {
        await window.pywebview.api.stop_current_process();
        appendToTerminal("\n> Processus stoppé par l'utilisateur.", "text-red-500 font-bold");
        onProcessFinished();
    } else {
        const saved = await actionSaveFile();
        if (!saved) return;

        isExecuting = true;
        autoFixTriggeredThisRun = false;
        terminalErrorBuffer = "";
        updateRunButtonState(true);
        clearTerminal();
        appendToTerminal(`> LANCEMENT\n`, 'text-blue-400 font-bold');
        document.getElementById('terminal-status').innerText = "running";

        const res = await window.pywebview.api.run_current_file();
        if (!res.async) {
            appendToTerminal(res.output + "\n", res.success ? "text-green-400" : "text-red-400");
            onProcessFinished();
        }
    }
}

function updateRunButtonState(exec) {
    const btn = document.getElementById('run-btn');
    const text = document.getElementById('run-text');
    const icon = document.getElementById('run-icon');
    if (!btn) return;
    if (exec) {
        btn.className = "flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white text-[11px] font-black transition-all border border-red-500/20 shadow-lg";
        text.innerText = "STOP"; icon.setAttribute('data-lucide', 'square');
    } else {
        btn.className = "flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 text-green-400 hover:bg-green-600 hover:text-white text-[11px] font-black transition-all border border-green-500/20 shadow-lg";
        text.innerText = "EXÉCUTER"; icon.setAttribute('data-lucide', 'play');
    }
    lucide.createIcons();
}

function onProcessFinished() {
    isExecuting = false;
    updateRunButtonState(false);
    document.getElementById('terminal-status').innerText = "idle";
    if (autoFixDebounceTimer) {
        clearTimeout(autoFixDebounceTimer);
        autoFixDebounceTimer = null;
    }
    // Force un dernier passage auto-correct à la fin pour capter la traceback complète.
    maybeTriggerAutoFix(terminalErrorBuffer, true);
}

function appendToTerminal(text, colorClass = "text-gray-300") {
    const termOut = document.getElementById('terminal-output');
    if (!termOut) return;
    const span = document.createElement('span');
    span.className = colorClass;
    const normalized = text.replace(/\\n/g, '\n');
    span.appendChild(document.createTextNode(normalized));
    termOut.appendChild(span);
    termOut.scrollTop = termOut.scrollHeight;

    if (isExecuting) {
        terminalErrorBuffer += normalized;
        if (terminalErrorBuffer.length > 8000) {
            terminalErrorBuffer = terminalErrorBuffer.slice(-8000);
        }
        if (autoFixDebounceTimer) clearTimeout(autoFixDebounceTimer);
        autoFixDebounceTimer = setTimeout(() => {
            maybeTriggerAutoFix(terminalErrorBuffer, false);
        }, 700);
    }
}

function clearTerminal() {
    const out = document.getElementById('terminal-output');
    if(out) out.innerHTML = "";
}

document.getElementById('terminal-stdin').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = e.target.value;
        if (!val.trim()) return;
        appendToTerminal(val + "\n", "text-white font-bold");
        await window.pywebview.api.send_terminal_input(val);
        e.target.value = "";
    }
});

// --- 7. ACTIONS MENUS ---

async function actionSaveFile() {
    const code = window.editor.getValue();
    const res = await window.pywebview.api.save_file(code, activeFilePath);
    if (res.success) {
        markCurrentFileAsSaved();
        if (res.tree) updateWorkspaceUI(document.getElementById('workspace-name').innerText, res.tree);
        return true;
    }
    return false;
}

async function actionNewFile() {
    await window.pywebview.api.new_file();
    const temp = "new_" + Date.now() + ".py";
    const model = monaco.editor.createModel("", "python");
    openFiles[temp] = { name: "script.py", model: model, savedVersionId: model.getAlternativeVersionId() };
    switchToFile(temp);
}

async function actionOpenFolder() {
    const data = await window.pywebview.api.open_folder_dialog();
    if (data) {
        currentWorkspacePath = data.workspace_path || currentWorkspacePath;
        expandedFolders.clear();
        const rootTree = await buildExplorerTree(currentWorkspacePath);
        updateWorkspaceUI(data.workspace_name, rootTree.length ? rootTree : data.tree);
        openFiles = {}; updateTabsUI(); clearChatHistory();
    }
}

async function actionCreateFile() {
    const target = window.prompt("Chemin du nouveau fichier (ex: src/main.py)");
    if (!target) return;
    const res = await window.pywebview.api.create_file(target.trim());
    if (res?.success && res.tree) {
        await refreshExplorerTree();
    }
}

async function actionCreateFolder() {
    const target = window.prompt("Chemin du nouveau dossier (ex: src/utils)");
    if (!target) return;
    const res = await window.pywebview.api.create_folder(target.trim());
    if (res?.success && res.tree) {
        await refreshExplorerTree();
    }
}

async function actionRenamePath(target = contextTarget) {
    if (!target?.path) return;
    const newName = window.prompt(`Nouveau nom pour ${target.name}:`, target.name);
    if (!newName || newName.trim() === target.name) return;
    const relative = toRelativeWorkspacePath(target.path);
    const res = await window.pywebview.api.rename_path(relative, newName.trim());
    if (!res?.success) return;
    patchOpenTabsAfterRename(target.path, res.new_path.replace(/\\/g, '/'), newName.trim());
    await refreshExplorerTree();
}

async function actionDeletePath(target = contextTarget) {
    if (!target?.path) return;
    const confirmed = window.confirm(`Supprimer ${target.type === 'folder' ? 'le dossier' : 'le fichier'} "${target.name}" ?`);
    if (!confirmed) return;
    const relative = toRelativeWorkspacePath(target.path);
    const res = await window.pywebview.api.delete_path(relative);
    if (!res?.success) return;
    patchOpenTabsAfterDelete(target.path);
    await refreshExplorerTree();
}

function actionUndo() { if(window.editor) { window.editor.focus(); window.editor.trigger('keyboard', 'undo', null); } }
function actionRedo() { if(window.editor) { window.editor.focus(); window.editor.trigger('keyboard', 'redo', null); } }

function applySmartUpdate(newContent) {
    const model = window.editor.getModel();
    window.editor.executeEdits("ai-agent", [{ range: model.getFullModelRange(), text: newContent, forceMoveMarkers: true }]);
}

// --- 8. IA ET AGENT ---

async function loadModel() {
    const name = document.getElementById('model-list').value;
    const led = document.getElementById('led');
    const input = document.getElementById('ai-input');
    const sendBtn = document.getElementById('send-btn');
    updateModelCapabilitiesUI(name);
    if (led) led.className = "w-2 h-2 rounded-full bg-yellow-500 animate-pulse-led";
    const ok = await window.pywebview.api.select_model(name);
    if (led) led.className = ok ? "w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" : "w-2 h-2 rounded-full bg-red-500";
    if (input) input.disabled = !ok;
    if (sendBtn) sendBtn.disabled = !ok;
}

function handleSendClick() { if (isGenerating) window.pywebview.api.stop_generation(); else askAi(); }

async function askAi() {
    const input = document.getElementById('ai-input');
    const msg = input.value.trim();
    if (!msg) return;
    isGenerating = true;
    updateSendButtonState(true);
    input.value = ""; input.disabled = true;
    const index = chatHistory.length;
    chatHistory.push({ role: "user", content: msg });
    addChatMessage('user', msg, index);

    // On passe les réglages de la modale
    const options = getAgentOptions();
    await window.pywebview.api.send_to_agent(chatHistory, window.editor.getValue(), "", options);
}

function prepareForResponse() {
    fullAiResponse = ""; currentSeconds = 0; appliedDiffs.clear(); changesCountThisTurn = 0;
    hasReceivedFirstToken = false;
    const container = document.getElementById('chat-box');
    const wrapper = document.createElement('div');
    wrapper.className = "chat-msg-wrapper text-left animate-in fade-in";
    wrapper.setAttribute('data-index', chatHistory.length);
    wrapper.innerHTML = `<p class="text-[9px] font-black text-blue-500 uppercase mb-2">Assistant</p><div class="content text-[11px] text-gray-300 space-y-2 leading-relaxed"></div><div id="ai-status-bar" class="flex items-center justify-between gap-3 text-[9px] text-gray-500 font-mono border-t border-white/5 pt-2 mt-2"><div class="flex items-center gap-2"><i data-lucide="cpu" class="w-3 h-3 text-yellow-500 animate-pulse"></i><span class="ai-phase uppercase tracking-wide">RÉFLÉCHIS...</span></div><span class="timer-text">00:00</span></div>`;
    container.appendChild(wrapper);
    currentResponseDiv = wrapper.querySelector('.content');
    window.activeMessageWrapper = wrapper;
    const timerEl = wrapper.querySelector('.timer-text');
    lucide.createIcons();
    container.scrollTop = container.scrollHeight;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        currentSeconds++;
        let m = Math.floor(currentSeconds / 60).toString().padStart(2, '0');
        let s = (currentSeconds % 60).toString().padStart(2, '0');
        if (timerEl) timerEl.innerText = `${m}:${s}`;
    }, 1000);
}

function appendToken(token) {
    if (!hasReceivedFirstToken) {
        hasReceivedFirstToken = true;
        const phaseEl = window.activeMessageWrapper?.querySelector('.ai-phase');
        if (phaseEl) phaseEl.innerText = "GÉNÉRATION...";
    }

    fullAiResponse += token;
    if(currentResponseDiv) {
        let html = renderResponseWithThinking(fullAiResponse);
        html = html.replace(/<file name="([^"]+)">([\s\S]*?)(<\/file>|$)/g, (m, f, c, ct) => {
            return `<details open class="border border-white/10 rounded-lg"><summary class="bg-white/5 p-2 text-[10px]">📄 ${f} ${ct ? '✔️' : '...'}</summary><div class="p-3 text-[11px] font-mono text-blue-300 bg-black/50">${escapeHtml(c.trim())}</div></details>`;
        });
        html = html.replace(/<diff(?:\s+file="([^"]+)")?>\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)(<\/replace>|$)/g, (m, file, s, r, cr) => {
            const target = file ? ` - ${escapeHtml(file)}` : "";
            const cleanedReplace = sanitizeDiffContent(r);
            return `<details open class="border border-white/10 rounded-lg"><summary class="bg-white/5 p-2 text-[10px] text-green-400">⚡ DIFF${target} ${cr ? '✔️' : '...'}</summary><div class="p-3 text-[11px] font-mono text-green-300 bg-black/50">${escapeHtml(cleanedReplace)}</div></details>`;
        });
        // Nettoie les balises partielles non converties (<search>, </search>, etc.)
        html = html.replace(/<\/?(search|replace|diff|file|folder)(?:\s+[^>]*)?>/g, "");
        currentResponseDiv.innerHTML = html;
        document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;

        // Auto-Diff Monaco (Buffer only)
        const actionableResponse = removeThinkingBlocks(fullAiResponse);
        const regexDiff = /<diff(?:\s+file="([^"]+)")?>\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>\s*<\/diff>/g;
        let md; while ((md = regexDiff.exec(actionableResponse)) !== null) {
            let targetFile = (md[1] || "").trim();
            let s = sanitizeDiffContent(md[2]);
            let r = sanitizeDiffContent(md[3]);
            if (!s || !r) continue;
            const diffKey = `${targetFile}::${s}::${r}`;
            if (!appliedDiffs.has(diffKey)) {
                appliedDiffs.add(diffKey);
                if (targetFile) {
                    applyDiffToWorkspaceFile(targetFile, s, r);
                } else {
                    let cur = window.editor.getValue();
                    if (cur.includes(s)) { applySmartUpdate(cur.replace(s, r)); changesCountThisTurn++; }
                }
            }
        }
    }
}

async function approveAllChanges() {
    const folderRegex = /<folder name="([^"]+)"\s*\/?>|<folder name="([^"]+)"><\/folder>/g;
    let fd;
    while ((fd = folderRegex.exec(fullAiResponse)) !== null) {
        const folderPath = (fd[1] || fd[2] || "").trim();
        if (folderPath) await window.pywebview.api.create_folder(folderPath);
    }

    const regex = /<file name="([^"]+)">([\s\S]*?)<\/file>/g;
    let m; while ((m = regex.exec(fullAiResponse)) !== null) await window.pywebview.api.save_generated_file(m[1], m[2].trim());
    // Evite la boite "Enregistrer sous" quand l'onglet actif est temporaire (new_...).
    // On sauvegarde l'editeur actif uniquement s'il pointe deja vers un vrai fichier.
    if (activeFilePath && !String(activeFilePath).includes("new_")) {
        await actionSaveFile();
    }
    await refreshExplorerTree();
    window.activeMessageWrapper.querySelector('.review-actions').innerHTML = `<span class="text-green-500 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> Validé</span>`;
    lucide.createIcons();
}

function revertAllChanges() {
    for (let i = 0; i < changesCountThisTurn; i++) actionUndo();
    window.activeMessageWrapper.querySelector('.review-actions').innerHTML = `<span class="text-red-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1"><i data-lucide="x-circle" class="w-3 h-3"></i> Annulé</span>`;
    lucide.createIcons();
}

function onStreamFinished() {
    clearInterval(timerInterval);
    isGenerating = false;
    updateSendButtonState(false);

    const sb = window.activeMessageWrapper.querySelector('#ai-status-bar');
    if (sb) {
        const phaseEl = sb.querySelector('.ai-phase');
        if (phaseEl) phaseEl.innerText = "TERMINÉ";
    }

    const actionableResponse = removeThinkingBlocks(fullAiResponse);
    const hasCompleteFile = /<file name="[^"]+">[\s\S]*?<\/file>/.test(actionableResponse);
    const hasCompleteDiff = /<diff(?:\s+file="[^"]+")?>\s*<search>[\s\S]*?<\/search>\s*<replace>[\s\S]*?<\/replace>\s*<\/diff>/.test(actionableResponse);
    if (hasCompleteFile || hasCompleteDiff) {
        const div = document.createElement('div');
        div.className = "review-actions flex gap-2 mt-3 pt-3 border-t border-white/5";
        div.innerHTML = `<button onclick="approveAllChanges()" class="btn-approve px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-[10px] font-bold hover:bg-green-500 hover:text-white transition">Approuver</button><button onclick="revertAllChanges()" class="btn-revert px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold hover:bg-red-500 hover:text-white transition">Annuler</button>`;
        window.activeMessageWrapper.appendChild(div);
    }

    chatHistory.push({ role: "assistant", content: fullAiResponse });
    document.getElementById('ai-input').disabled = false;
    document.getElementById('ai-input').focus();
}

// --- UTILS ---
function addChatMessage(role, text, index) {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg-wrapper ${role === 'user' ? 'text-right' : 'text-left'}`;
    wrapper.setAttribute('data-index', index);
    if (role === 'user') wrapper.innerHTML = `<div class="user-message-wrapper inline-block group"><div class="bg-blue-600 p-3 rounded-2xl rounded-tr-none text-[11px] text-white shadow-lg inline-block text-left">${escapeHtml(text)}</div><div onclick="regenerateFrom(${index})" class="retry-btn flex items-center justify-end gap-1.5 mt-2 text-[9px] text-blue-400 hover:text-blue-300 font-black cursor-pointer uppercase"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> Régénérer</div></div>`;
    document.getElementById('chat-box').appendChild(wrapper);
    document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;
}

async function regenerateFrom(index) {
    if (isGenerating) return;
    chatHistory = chatHistory.slice(0, index + 1);
    const wrappers = document.querySelectorAll('.chat-msg-wrapper');
    wrappers.forEach(w => { if (parseInt(w.getAttribute('data-index')) > index) w.remove(); });
    isGenerating = true; updateSendButtonState(true);
    await window.pywebview.api.send_to_agent(chatHistory, window.editor.getValue(), "", getAgentOptions());
}

function updateSendButtonState(gen) {
    const btn = document.getElementById('send-btn');
    if (!btn) return;
    btn.innerHTML = gen ? '<i data-lucide="square" class="w-4 h-4"></i>' : '<i data-lucide="send" class="w-4 h-4"></i>';
    if (gen) { btn.classList.remove('bg-blue-600'); btn.classList.add('bg-red-600'); }
    else { btn.classList.remove('bg-red-600'); btn.classList.add('bg-blue-600'); }
    lucide.createIcons();
}

async function refreshDeps() { const deps = await window.pywebview.api.get_dependencies(); document.getElementById('deps-list').innerHTML = deps.map(d => `<div class="flex justify-between px-2"><span>${d.name}</span><span class="opacity-30">${d.version}</span></div>`).join(''); }
async function saveSettings() {
    const s = {
        auto_fix: document.getElementById('setting-auto-fix').checked,
        agentic_mode: Boolean(document.getElementById('setting-agentic-mode')?.checked)
    };
    await window.pywebview.api.save_settings(s);
}
function escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function clearChatHistory() { chatHistory = []; document.getElementById('chat-box').innerHTML = ""; }

function sanitizeDiffContent(text) {
    if (!text) return "";
    return String(text)
        .replace(/^\s*<\/?(search|replace)\b[^>]*>/gi, "")
        .replace(/<\/?(search|replace)\b[^>]*>\s*$/gi, "")
        .trim();
}

function getAgentOptions() {
    const agentic = Boolean(document.getElementById('setting-agentic-mode')?.checked);
    const selectedModel = document.getElementById('model-list')?.value || "";
    return {
        agentic_mode: agentic,
        selected_model: selectedModel,
        supports_integrated_thoughts: modelSupportsIntegratedThoughts(selectedModel),
        current_language: activeFilePath ? detectLanguageFromFilename(openFiles[activeFilePath]?.name) : window.editor.getModel().getLanguageId()
    };
}

function toRelativeWorkspacePath(absolutePath) {
    if (!currentWorkspacePath) return absolutePath;
    const ws = currentWorkspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
    const p = absolutePath.replace(/\\/g, '/');
    if (p.startsWith(ws + '/')) return p.slice(ws.length + 1);
    return p;
}

function patchOpenTabsAfterRename(oldPath, newPath, newName) {
    const oldNorm = oldPath.replace(/\\/g, '/');
    const newNorm = newPath.replace(/\\/g, '/');
    const updated = {};
    Object.keys(openFiles).forEach(path => {
        const p = path.replace(/\\/g, '/');
        if (p === oldNorm || p.startsWith(oldNorm + '/')) {
            const suffix = p.slice(oldNorm.length);
            const nextPath = newNorm + suffix;
            updated[nextPath] = openFiles[path];
            if (p === oldNorm) updated[nextPath].name = newName;
            if (activeFilePath === path) activeFilePath = nextPath;
        } else {
            updated[path] = openFiles[path];
        }
    });
    openFiles = updated;
    updateTabsUI();
}

function patchOpenTabsAfterDelete(deletedPath) {
    const deletedNorm = deletedPath.replace(/\\/g, '/');
    Object.keys(openFiles).forEach(path => {
        const p = path.replace(/\\/g, '/');
        if (p === deletedNorm || p.startsWith(deletedNorm + '/')) {
            delete openFiles[path];
            if (activeFilePath === path) activeFilePath = null;
        }
    });
    if (!activeFilePath) {
        const remaining = Object.keys(openFiles);
        if (remaining.length > 0) switchToFile(remaining[remaining.length - 1]);
        else {
            window.editor.setModel(monaco.editor.createModel("", "plaintext"));
            updateStatusBar('plaintext');
            window.pywebview.api.set_current_open_file(null);
        }
    }
    updateTabsUI();
}

function isAutoFixEnabled() {
    return Boolean(document.getElementById('setting-auto-fix')?.checked);
}

function textLooksLikeRuntimeError(text) {
    return /(traceback|exception|error:|syntaxerror|nameerror|typeerror|valueerror|indexerror|keyerror|attributeerror|modulenotfounderror|importerror|referenceerror|segmentation fault)/i.test(text);
}

async function maybeTriggerAutoFix(newChunk, forceAtEnd = false) {
    if (!isAutoFixEnabled()) return;
    if (autoFixTriggeredThisRun) return;
    if (isGenerating) return;
    const chunkHasError = textLooksLikeRuntimeError(newChunk || "");
    const bufferHasError = textLooksLikeRuntimeError(terminalErrorBuffer || "");
    // Même en fin d'exécution, ne déclenche QUE s'il y a une vraie erreur détectée.
    if (!chunkHasError && !bufferHasError) return;
    // Hors fin d'exécution, évite les déclenchements trop agressifs.
    if (!forceAtEnd && !chunkHasError) return;

    const input = document.getElementById('ai-input');
    const sendBtn = document.getElementById('send-btn');
    if (!input || input.disabled || !sendBtn || sendBtn.disabled) return;

    autoFixTriggeredThisRun = true;
    const errorExcerpt = terminalErrorBuffer.trim().slice(-2000);
    const autoPrompt = [
        "[AUTO-CORRECTION]",
        "Le terminal a detecte une erreur pendant l'execution.",
        "Corrige le code du fichier actif pour resoudre cette erreur.",
        "Erreur terminal:",
        errorExcerpt || "(aucun detail)"
    ].join("\n");

    isGenerating = true;
    updateSendButtonState(true);
    input.disabled = true;
    const index = chatHistory.length;
    chatHistory.push({ role: "user", content: autoPrompt });
    addChatMessage('user', autoPrompt, index);
    await window.pywebview.api.send_to_agent(chatHistory, window.editor.getValue(), "", getAgentOptions());
}

async function applyDiffToWorkspaceFile(relativePath, search, replace) {
    try {
        const res = await window.pywebview.api.apply_diff_to_file(relativePath, search, replace);
        if (!res || !res.success) return;
        await refreshExplorerTree();
        const normalizedTarget = String(relativePath || "").replace(/\\/g, '/').toLowerCase();
        const openedPath = Object.keys(openFiles).find(p => p.replace(/\\/g, '/').toLowerCase().endsWith(normalizedTarget));
        if (openedPath) {
            const reload = await window.pywebview.api.load_file_content(openedPath);
            if (reload?.success) {
                openFiles[openedPath].model.setValue(reload.content);
                openFiles[openedPath].savedVersionId = openFiles[openedPath].model.getAlternativeVersionId();
                updateTabsUI();
            }
        }
    } catch (e) {
        console.error("Diff fichier impossible:", e);
    }
}

const agenticCheckbox = document.getElementById('setting-agentic-mode');
const autoFixCheckbox = document.getElementById('setting-auto-fix');
if (agenticCheckbox) agenticCheckbox.addEventListener('change', saveSettings);
if (autoFixCheckbox) autoFixCheckbox.addEventListener('change', saveSettings);

const renameBtn = document.getElementById('explorer-rename-btn');
const deleteBtn = document.getElementById('explorer-delete-btn');
if (renameBtn) renameBtn.addEventListener('click', async () => {
    const target = contextTarget;
    hideExplorerContextMenu();
    await actionRenamePath(target);
});
if (deleteBtn) deleteBtn.addEventListener('click', async () => {
    const target = contextTarget;
    hideExplorerContextMenu();
    await actionDeletePath(target);
});
document.addEventListener('click', (e) => {
    const menu = document.getElementById('explorer-context-menu');
    if (!menu) return;
    if (!menu.contains(e.target)) hideExplorerContextMenu();
});
document.addEventListener('contextmenu', (e) => {
    const menu = document.getElementById('explorer-context-menu');
    const explorer = document.getElementById('explorer');
    if (!menu || !explorer) return;
    if (!explorer.contains(e.target)) hideExplorerContextMenu();
});
