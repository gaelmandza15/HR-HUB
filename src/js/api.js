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

function loadStore() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
    // Données de départ identiques au seed SQLite (src-tauri/src/db/schema.rs)
    const store = {
        roles: ['Caisse', 'Logistique', 'Service Client', 'Management'],
        employees: [
            { id: 1, name: 'Sophie Martin', role: 'Caisse', contract: 35 },
            { id: 2, name: 'Lucas Bernard', role: 'Logistique', contract: 35 },
            { id: 3, name: 'Emma Leroy', role: 'Service Client', contract: 35 },
            { id: 4, name: 'Thomas Petit', role: 'Caisse', contract: 39 },
            { id: 5, name: 'Chloé Moreau', role: 'Logistique', contract: 30 },
        ],
        shifts: [
            ...toShifts(1, [['08:00 - 16:00', '08:00 - 16:00', 'Repos', '10:00 - 18:00', '08:00 - 16:00', 'Repos', 'Repos']]),
            ...toShifts(2, ['12:00 - 20:00', '12:00 - 20:00', '12:00 - 20:00', 'Repos', '12:00 - 20:00', '12:00 - 20:00', 'Repos']),
            ...toShifts(3, ['09:00 - 17:00', '09:00 - 17:00', '09:00 - 17:00', '09:00 - 17:00', 'Repos', 'Repos', 'Repos']),
            ...toShifts(4, ['Repos', '08:00 - 16:00', '08:00 - 16:00', '08:00 - 16:00', '08:00 - 16:00', '08:00 - 16:00', 'Repos']),
            ...toShifts(5, ['10:00 - 16:00', '10:00 - 16:00', 'Repos', '10:00 - 16:00', '10:00 - 16:00', 'Repos', 'Repos']),
        ],
        absences: [
            { id: 1, employeeId: 2, type: 'Congé payé', period: '16 Octobre - 17 Octobre', status: 'En attente' },
            { id: 2, employeeId: 4, type: 'Arrêt maladie', period: '12 Octobre', status: 'Validé' },
            { id: 3, employeeId: 5, type: 'Congé sans solde', period: '14 Octobre', status: 'Refusé' },
        ],
        nextIds: { emp: 6, abs: 4 },
    };
    localStorage.setItem(LS_KEY, JSON.stringify(store));
    return store;
}

function toShifts(empId, values) {
    return values.map((shift, i) => ({ employeeId: empId, week: 42, day: i + 1, shift }));
}

function saveStore(store) {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
}

function localApi() {
    return {
        async listRoles() {
            return loadStore().roles.map((name, i) => ({ id: i + 1, name }));
        },
        async listEmployees() {
            return loadStore().employees;
        },
        async addEmployee({ name, role, contract }) {
            const s = loadStore();
            const id = s.nextIds.emp++;
            s.employees.push({ id, name, role, contract });
            saveStore(s);
            return id;
        },
        async updateEmployee({ id, name, role, contract }) {
            const s = loadStore();
            const emp = s.employees.find((e) => e.id === id);
            Object.assign(emp, { name, role, contract });
            saveStore(s);
        },
        async deleteEmployee({ id }) {
            const s = loadStore();
            s.employees = s.employees.filter((e) => e.id !== id);
            s.shifts = s.shifts.filter((sh) => sh.employeeId !== id);
            s.absences = s.absences.filter((a) => a.employeeId !== id);
            saveStore(s);
        },
        async listShifts({ week }) {
            return loadStore().shifts.filter((sh) => sh.week === week);
        },
        async setShift({ employeeId, week, day, shift }) {
            const s = loadStore();
            const existing = s.shifts.find(
                (sh) => sh.employeeId === employeeId && sh.week === week && sh.day === day
            );
            if (existing) existing.shift = shift;
            else s.shifts.push({ employeeId, week, day, shift });
            saveStore(s);
        },
        async listAbsences() {
            return loadStore().absences;
        },
        async addAbsence({ employeeId, kind, period }) {
            const s = loadStore();
            const id = s.nextIds.abs++;
            s.absences.push({ id, employeeId, type: kind, period, status: 'En attente' });
            saveStore(s);
            return id;
        },
        async setAbsenceStatus({ id, status }) {
            const s = loadStore();
            s.absences.find((a) => a.id === id).status = status;
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
    };
}

export const api = inTauri ? tauriApi() : localApi();
export const isTauri = inTauri;
