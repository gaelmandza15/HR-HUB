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
    };
}

export const api = inTauri ? tauriApi() : localApi();
export const isTauri = inTauri;
