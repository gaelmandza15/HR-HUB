/**
 * Couche API : abstraction des appels backend.
 *
 * - Dans l'application Tauri : invoke() vers les commandes Rust (SQLite).
 * - Hors Tauri (aperçu navigateur via `npm run dev`) : fallback localStorage
 *   qui reproduit le même contrat d'interface, pour développer sans Rust.
 */

const inTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// ---------------- Backend Tauri (Rust + SQLite) ----------------

async function tauriInvoke(cmd, args = {}) {
    return window.__TAURI__.invoke(cmd, args);
}

// ---------------- Fallback localStorage (mode navigateur) ----------------

const LS_KEY = 'hrhub-db-v1';

function saveStore(store) {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
}

// Les données de démo sont servies depuis `hrhub-demo.json` (fichier séparé,
// régénéré par l'app Tauri à chaque démarrage) — rien n'est codé en dur.
let demoPromise = null;
function fetchDemo() {
    if (!demoPromise) {
        demoPromise = fetch('hrhub-demo.json')
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
    }
    return demoPromise;
}

async function getStore() {
    const raw = localStorage.getItem(LS_KEY);
    let store;
    if (raw) {
        try {
            store = JSON.parse(raw);
        } catch {
            // localStorage corrompu (ex. troncature) : on repart du seed démo
            localStorage.removeItem(LS_KEY);
            store = null;
        }
    }
    if (!store) {
        const demo = await fetchDemo();
        store = demo ?? {
            settings: {},
            roles: [],
            employees: [],
            shifts: [],
            absences: [],
            nextIds: { emp: 1, abs: 1 },
        };
    }
    // Migrateurs défensifs pour d'éventuels anciens formats localStorage
    store.roles ??= [];
    store.shifts ??= [];
    store.absences ??= [];
    store.nextIds ??= { emp: 1, abs: 1 };
    store.settings ??= {};
    store.settings.week_start_year ??= String(new Date().getFullYear());
    localStorage.setItem(LS_KEY, JSON.stringify(store));
    return store;
}

function localApi() {
    return {
        async listRoles() {
            return (await getStore()).roles.map((name, i) => ({ id: i + 1, name }));
        },
        async listEmployees() {
            return (await getStore()).employees;
        },
        async addEmployee({ name, role, contract }) {
            const s = await getStore();
            const id = s.nextIds.emp++;
            s.employees.push({ id, name, role, contract });
            saveStore(s);
            return id;
        },
        async updateEmployee({ id, name, role, contract }) {
            const s = await getStore();
            const emp = s.employees.find((e) => e.id === id);
            // Garde-fou : l'employé peut ne plus exister (supprimé entre-temps)
            // -> éviter "Cannot convert undefined or null to object".
            if (!emp) return;
            Object.assign(emp, { name, role, contract });
            saveStore(s);
        },
        async deleteEmployee({ id }) {
            const s = await getStore();
            s.employees = s.employees.filter((e) => e.id !== id);
            s.shifts = s.shifts.filter((sh) => sh.employeeId !== id);
            s.absences = s.absences.filter((a) => a.employeeId !== id);
            saveStore(s);
        },
        async listShifts({ week }) {
            return (await getStore()).shifts.filter((sh) => sh.week === week);
        },
        async setShift({ employeeId, week, day, shift }) {
            const s = await getStore();
            const existing = s.shifts.find(
                (sh) => sh.employeeId === employeeId && sh.week === week && sh.day === day
            );
            if (existing) existing.shift = shift;
            else s.shifts.push({ employeeId, week, day, shift });
            saveStore(s);
        },
        async listAbsences() {
            return (await getStore()).absences;
        },
        async addAbsence({ employeeId, kind, period }) {
            const s = await getStore();
            const id = s.nextIds.abs++;
            const statuses = (s.settings.absence_statuses || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
            s.absences.push({ id, employeeId, type: kind, period, status: statuses[0] || 'A traiter' });
            saveStore(s);
            return id;
        },
        async setAbsenceStatus({ id, status }) {
            const s = await getStore();
            const abs = s.absences.find((a) => a.id === id);
            if (!abs) return; // demande supprimée entre-temps : no-op défensif
            abs.status = status;
            saveStore(s);
        },
        async addRole({ name }) {
            const s = await getStore();
            if (!s.roles.includes(name)) s.roles.push(name);
            s.settings.roles = s.roles.join(', ');
            saveStore(s);
            return s.roles.length;
        },
        async updateRole({ id, name }) {
            const s = await getStore();
            const old = s.roles[id - 1];
            if (old === undefined) return;
            s.roles[id - 1] = name;
            s.employees.forEach((e) => { if (e.role === old) e.role = name; });
            s.settings.roles = s.roles.join(', ');
            saveStore(s);
        },
        async deleteRole({ id }) {
            const s = await getStore();
            const [removed] = s.roles.splice(id - 1, 1);
            s.settings.roles = s.roles.join(', ');
            s.employees = s.employees.filter((e) => e.role !== removed);
            saveStore(s);
        },
        async exportData({ format }) {
            const s = await getStore();
            return buildExportPayload(s, format);
        },
        async importData({ content, format, mode }) {
            const s = await getStore();
            applyImportPayload(s, content, format, mode);
            saveStore(s);
        },
        async getSettings() {
            const s = await getStore();
            return Object.entries(s.settings).map(([key, value]) => ({ key, value }));
        },
        async setSetting({ key, value }) {
            const s = await getStore();
            s.settings[key] = value;
            if (key === 'roles') s.roles = value.split(',').map((x) => x.trim()).filter(Boolean);
            saveStore(s);
        },
    };
}

function tauriApi() {
    return {
        listRoles: () => tauriInvoke('list_roles'),
        listEmployees: () => tauriInvoke('list_employees'),
        addEmployee: ({ name, role, contract }) => tauriInvoke('add_employee', { name, role, contract }),
        updateEmployee: ({ id, name, role, contract }) => tauriInvoke('update_employee', { id, name, role, contract }),
        deleteEmployee: ({ id }) => tauriInvoke('delete_employee', { id }),
        listShifts: ({ week }) => tauriInvoke('list_shifts', { week }),
        setShift: ({ employeeId, week, day, shift }) => tauriInvoke('set_shift', { employeeId, week, day, shift }),
        listAbsences: () => tauriInvoke('list_absences'),
        addAbsence: ({ employeeId, kind, period }) => tauriInvoke('add_absence', { employeeId, kind, period }),
        setAbsenceStatus: ({ id, status }) => tauriInvoke('set_absence_status', { id, status }),
        addRole: ({ name }) => tauriInvoke('add_role', { name }),
        updateRole: ({ id, name }) => tauriInvoke('update_role', { id, name }),
        deleteRole: ({ id }) => tauriInvoke('delete_role', { id }),
        getSettings: () => tauriInvoke('get_settings'),
        setSetting: ({ key, value }) => tauriInvoke('set_setting', { key, value }),
        exportData: ({ format }) => tauriInvoke('export_data', { format }),
        importData: ({ content, format, mode }) => tauriInvoke('import_data', { content, format, mode }),
    };
}


// ---------------- Sérialisation pour le mode navigateur ----------------
// Reproduit fidèlement le contrat des commandes Rust `export_data` /
// `import_data` (mêmes formats : json | csv | tsv | md | sql), pour que
// l'aperçu navigateur et l'app Tauri échangent les mêmes fichiers.

const EXPORT_TABLES = ['settings', 'roles', 'employees', 'shifts', 'absences'];

function toModel(store) {
    return {
        app: 'HR HUB',
        version: '1.0.0',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        settings: Object.entries(store.settings ?? {}).map(([key, value]) => ({ key, value })),
        roles: (store.roles ?? []).map((name, i) => ({ id: i + 1, name })),
        employees: store.employees ?? [],
        shifts: store.shifts ?? [],
        absences: store.absences ?? [],
    };
}

function headersOf(rows) {
    const headers = [];
    for (const row of rows) {
        if (row && typeof row === 'object') {
            for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);
        }
    }
    return headers;
}

function cellStr(v) {
    return v === null || v === undefined ? '' : String(v);
}

function csvEscape(value, sep) {
    if (value.includes(sep) || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

function splitRow(rawLine, sep) {
    // Les exports contiennent des fins de ligne Windows (\r\n) : on retire le
    // \r résiduel sinon il pollue la dernière cellule et casse les comparaisons.
    const line = String(rawLine).replace(/\r$/, '');
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = !quoted;
        else if (c === sep && !quoted) { cells.push(cur); cur = ''; }
        else cur += c;
    }
    cells.push(cur);
    return cells;
}

function renderDelimited(model, sep, bom) {
    let out = bom ? '\uFEFF' : '';
    for (const name of EXPORT_TABLES) {
        const rows = model[name] ?? [];
        const headers = headersOf(rows);
        out += '# ' + name + '\n';
        out += headers.map((h) => csvEscape(h, sep)).join(sep) + '\n';
        for (const row of rows) {
            out += headers.map((h) => csvEscape(cellStr(row[h]), sep)).join(sep) + '\n';
        }
        out += '\n';
    }
    return out;
}

function renderMarkdown(model) {
    let out = '# HR HUB — Export du ' + (model.exportedAt ?? '?') + '\n\n';
    for (const name of EXPORT_TABLES) {
        const rows = model[name] ?? [];
        const headers = headersOf(rows);
        out += '## ' + name + '\n\n';
        if (!rows.length) { out += '_(vide)_\n\n'; continue; }
        out += '| ' + headers.join(' | ') + ' |\n';
        out += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
        for (const row of rows) {
            out += '| ' + headers.map((h) => cellStr(row[h]).replace(/\|/g, '\\\\|')).join(' | ') + ' |\n';
        }
        out += '\n';
    }
    return out;
}

function sqlQuote(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
}

function renderSql(model) {
    let out = '-- HR HUB : dump SQL réimportable (exécuter sur une base vide)\nBEGIN;\nPRAGMA foreign_keys = OFF;\n\n';
    for (const name of EXPORT_TABLES) {
        const rows = model[name] ?? [];
        if (!rows.length) continue;
        const headers = headersOf(rows);
        for (const row of rows) {
            out += 'INSERT INTO ' + name + ' (' + headers.join(', ') + ') VALUES (' +
                headers.map((h) => sqlQuote(row[h])).join(', ') + ');\n';
        }
        out += '\n';
    }
    out += '\nPRAGMA foreign_keys = ON;\nCOMMIT;\n';
    return out;
}

function renderExport(model, format) {
    switch ((format ?? 'json').toLowerCase()) {
        case 'csv': return renderDelimited(model, ',', true);
        case 'tsv': case 'excel': return renderDelimited(model, '\t', false);
        case 'md': case 'markdown': return renderMarkdown(model);
        case 'sql': return renderSql(model);
        default: return JSON.stringify(model, null, 2);
    }
}

function suggestedFilename(format) {
    const ext = { tsv: 'tsv', excel: 'tsv', md: 'md', markdown: 'md', sql: 'sql', csv: 'csv' }[(format ?? 'json').toLowerCase()] ?? 'json';
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return 'hrhub-export-' + stamp + '.' + ext;
}

function buildExportPayload(store, format) {
    const model = toModel(store);
    return {
        content: renderExport(model, format),
        filename: suggestedFilename(format),
        format: (format ?? 'json').toLowerCase(),
    };
}

function parseDelimited(content, sep) {
    const model = {};
    const lines = content.split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].replace(/\r$/, '');
        i++;
        if (!line.trim()) continue;
        if (line.startsWith('# ')) {
            const name = line.slice(2).trim();
            if (i >= lines.length) break;
            const headers = splitRow(lines[i], sep);
            i++;
            const rows = [];
            while (i < lines.length) {
                const rowLine = lines[i].replace(/\r$/, '');
                i++;
                if (!rowLine.trim() || rowLine.startsWith('# ')) break;
                const cells = splitRow(rowLine, sep);
                const obj = {};
                headers.forEach((h, idx) => {
                    const raw = cells[idx] ?? '';
                    const asNum = raw.trim() === '' ? NaN : Number(raw);
                    obj[h] = Number.isInteger(asNum) && /^-?\d+$/.test(raw.trim()) ? asNum : raw;
                });
                rows.push(obj);
            }
            if (i < lines.length && lines[i - 1].startsWith('# ')) i--;
            model[name] = rows;
        }
    }
    return model;
}

function applyImportPayload(store, content, format, mode) {
    const fmt = (format ?? '').toLowerCase();
    let model;
    const trimmed = String(content ?? '').trim();
    // Détection automatique si le format n'est pas précisé ou mal déduit
    // (ex. un fichier .txt qui est en réalité du JSON, ou l'inverse).
    const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
    try {
        if (fmt === 'csv' && !looksJson) model = parseDelimited(content, ',');
        else if ((fmt === 'tsv' || fmt === 'excel') && !looksJson) model = parseDelimited(content, '\t');
        else if (trimmed.startsWith('# ') || trimmed.startsWith('--')) throw new Error('format non réimportable (Markdown/SQL) — utilisez JSON, CSV ou TSV');
        else model = JSON.parse(content);
    } catch (err) {
        throw new Error('Fichier invalide : ' + err.message);
    }
    const known = EXPORT_TABLES.filter((t) => Array.isArray(model[t]));
    if (!known.length) throw new Error('Aucune table reconnue dans ce fichier.');
    const merge = mode === 'merge';

    store.settings ??= {};
    store.roles ??= [];
    store.employees ??= [];
    store.shifts ??= [];
    store.absences ??= [];
    store.nextIds ??= { emp: 1, abs: 1 };

    if (known.includes('roles')) {
        const names = merge ? store.roles : [];
        for (const r of model.roles) {
            const n = String(r.name ?? '').trim();
            if (n && !names.includes(n)) names.push(n);
        }
        store.roles = names;
        store.settings.roles = names.join(', ');
    }
    if (known.includes('employees')) {
        if (!merge) store.employees = [];
        for (const e of model.employees) {
            const name = String(e.name ?? '').trim();
            if (!name) continue;
            const role = String(e.role ?? store.roles[0] ?? '').trim();
            if (role && !store.roles.includes(role)) store.roles.push(role);
            const contract = Number(e.contract) || 35;
            const existing = store.employees.find((x) => x.id === Number(e.id));
            if (existing) Object.assign(existing, { name, role, contract });
            else if (merge && store.employees.some((x) => x.name === name && x.role === role)) continue;
            else store.employees.push({ id: Number(e.id) || store.nextIds.emp++, name, role, contract });
        }
        store.nextIds.emp = Math.max(store.nextIds.emp, ...store.employees.map((x) => x.id + 1), 1);
    }
    if (known.includes('shifts')) {
        if (!merge) store.shifts = [];
        for (const sh of model.shifts) {
            const employeeId = Number(sh.employeeId ?? sh.employee_id);
            const week = Number(sh.week);
            const day = Number(sh.day);
            if (!employeeId || !week || !day) continue;
            const found = store.shifts.find((x) => x.employeeId === employeeId && x.week === week && x.day === day);
            if (found) found.shift = String(sh.shift ?? 'Repos');
            else store.shifts.push({ employeeId, week, day, shift: String(sh.shift ?? 'Repos') });
        }
    }
    if (known.includes('absences')) {
        if (!merge) store.absences = [];
        for (const a of model.absences) {
            const employeeId = Number(a.employeeId ?? a.employee_id);
            if (!employeeId) continue;
            const rec = {
                id: Number(a.id) || store.nextIds.abs++,
                employeeId,
                type: String(a.type ?? ''),
                period: String(a.period ?? ''),
                status: String(a.status ?? 'En attente'),
            };
            const found = store.absences.find((x) => x.id === rec.id);
            if (found) Object.assign(found, rec);
            else store.absences.push(rec);
        }
        store.nextIds.abs = Math.max(store.nextIds.abs, ...store.absences.map((x) => x.id + 1), 1);
    }
    if (known.includes('settings')) {
        if (!merge) {
            // conserve `roles` qui vient d'être réaligné sur la table des postes
            const keepRoles = store.settings.roles;
            store.settings = {};
            if (keepRoles !== undefined) store.settings.roles = keepRoles;
        }
        for (const st of model.settings) {
            if (st.key === undefined || st.key === null || st.key === '') continue;
            store.settings[String(st.key)] = String(st.value ?? '');
        }
    }
}

export const api = inTauri ? tauriApi() : localApi();
export const isTauri = inTauri;
