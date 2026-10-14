/**
 * Page Planning : grille hebdomadaire des créneaux, navigation entre semaines,
 * filtre par poste, ajout/édition de quarts via la modale.
 */

import { api } from '../api.js';
import {
    DAYS_OF_WEEK,
    escapeHtml,
    getShift,
    isoWeekNumber,
    totalHoursFor,
    weekRange,
} from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

// État local à la page (seule la semaine courante est chargée depuis SQLite)
let currentWeek = isoWeekNumber(new Date());
let shifts = [];
let employees = [];
let roles = [];

async function reload() {
    const [s, e, r] = await Promise.all([
        api.listShifts({ week: currentWeek }),
        api.listEmployees(),
        api.listRoles(),
    ]);
    // Normalisation défensive : quelle que soit la source (Tauri/SQLite ou
    // localStorage), `shift` reste une chaîne et `contract` un nombre.
    // Évite l'erreur "shiftString.toLowerCase is not a function".
    shifts = s.map((sh) => ({ ...sh, shift: String(sh.shift ?? 'Repos') }));
    employees = e.map((emp) => ({ ...emp, contract: Number(emp.contract) || 0 }));
    roles = r;
}

export async function renderPlanning(container) {
    await reload();

    container.innerHTML = `
        <div class="space-y-6">
            <header class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-[#2f3640]">Planification Hebdomadaire</h1>
                    <p class="text-sm text-gray-600">Semaine ${currentWeek} (${weekRange(currentWeek)})</p>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                    <div class="inline-flex rounded-full border-2 border-[#2f3640] overflow-hidden bg-white">
                        <button id="btn-prev-week" class="px-4 py-2 text-sm font-semibold border-r-2 border-[#2f3640] hover:bg-[#2f3640] hover:text-white transition-colors"><i class="fa-solid fa-chevron-left"></i></button>
                        <span id="lbl-week" class="px-4 py-2 text-sm font-semibold flex items-center">Semaine ${currentWeek}</span>
                        <button id="btn-next-week" class="px-4 py-2 text-sm font-semibold border-l-2 border-[#2f3640] hover:bg-[#2f3640] hover:text-white transition-colors"><i class="fa-solid fa-chevron-right"></i></button>
                    </div>
                    <select id="filter-role" class="border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm font-semibold bg-white outline-none">
                        <option value="all">Tous les postes</option>
                        ${roles.map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('')}
                    </select>
                    <button id="btn-add-shift" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2.5 text-sm font-semibold hover:opacity-90">
                        <i class="fa-solid fa-plus mr-2"></i>Ajouter un quart
                    </button>
                </div>
            </header>

            <div class="bg-white border-2 border-[#2f3640] rounded-3xl overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                        <tr class="border-b-2 border-[#2f3640] bg-[#f5f6fa]">
                            <th class="p-4 font-bold text-sm">Employé / Poste</th>
                            ${DAYS_OF_WEEK.map((d, i) => `<th class="p-4 font-bold text-sm text-center">${d} ${dayOfMonth(weekStartMonday(), i)}</th>`).join('')}
                            <th class="p-4 font-bold text-sm text-center">Total Heures</th>
                        </tr>
                    </thead>
                    <tbody id="planning-table-body" class="divide-y-2 divide-[#2f3640]"></tbody>
                </table>
            </div>
        </div>`;

    document.getElementById('btn-prev-week').addEventListener('click', () => changeWeek(-1, container));
    document.getElementById('btn-next-week').addEventListener('click', () => changeWeek(1, container));
    document.getElementById('filter-role').addEventListener('change', () => drawTable(container));
    document.getElementById('btn-add-shift').addEventListener('click', () => openAddShiftModal(container));

    drawTable(container);
}

/** Lundi de la semaine courante (calcul simple à partir du n° de semaine). */
function weekStartMonday() {
    const simple = new Date(new Date().getFullYear(), 0, 1 + (currentWeek - 1) * 7);
    const dow = simple.getDay();
    simple.setDate(simple.getDate() - (dow === 0 ? 6 : dow - 1));
    return simple;
}

function dayOfMonth(monday, offset) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    return d.getDate();
}

async function changeWeek(direction, container) {
    currentWeek += direction;
    if (currentWeek < 1) currentWeek = 52;
    if (currentWeek > 52) currentWeek = 1;
    await renderPlanning(container);
    showToast(`Semaine ${currentWeek}`);
}

function drawTable(container) {
    const tbody = container.querySelector('#planning-table-body');
    const selectedRole = container.querySelector('#filter-role').value;
    const filtered = selectedRole === 'all' ? employees : employees.filter((e) => e.role === selectedRole);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-gray-500">Aucun employé trouvé pour ce poste.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered
        .map((emp) => {
            const totalH = totalHoursFor(emp.id, shifts);
            const isOver = totalH > emp.contract;
            const cells = DAYS_OF_WEEK.map((_, i) => {
                const day = i + 1;
                const shiftVal = getShift(emp.id, day, shifts);
                return `
                    <td class="p-3 text-center">
                        <button data-edit-shift data-emp="${emp.id}" data-day="${day}"
                            class="w-full py-2 px-2 border-2 border-[#2f3640] rounded-2xl text-xs font-medium hover:bg-[#2f3640] hover:text-[#f5f6fa] transition-colors">
                            ${escapeHtml(shiftVal)}
                        </button>
                    </td>`;
            }).join('');

            return `
                <tr class="hover:bg-[#f5f6fa] transition-colors">
                    <td class="p-4 font-semibold text-sm">
                        <div>${escapeHtml(emp.name)}</div>
                        <span class="pill-btn inline-block border-2 border-[#2f3640] px-2 py-0.5 text-xs mt-1">${escapeHtml(emp.role)}</span>
                    </td>
                    ${cells}
                    <td class="p-4 text-center">
                        <span class="font-bold text-sm ${isOver ? 'text-red-600' : ''}">${totalH}h / ${emp.contract}h</span>
                        ${isOver ? '<div class="text-[10px] text-red-600 font-bold">Heures Sup.</div>' : ''}
                    </td>
                </tr>`;
        })
        .join('');

    // Écouteurs des cellules de créneau
    tbody.querySelectorAll('[data-edit-shift]').forEach((btn) =>
        btn.addEventListener('click', () =>
            openEditShiftModal(container, Number(btn.dataset.emp), Number(btn.dataset.day))
        )
    );
}

// ---------- Modales ----------

function openEditShiftModal(container, empId, day) {
    const emp = employees.find((e) => e.id === empId);
    const currentShift = getShift(empId, day, shifts);

    openModal(
        `Modifier le quart (${DAYS_OF_WEEK[day - 1]})`,
        `
        <form id="shift-form" class="space-y-4">
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Employé : ${escapeHtml(emp.name)}</label>
                <p class="text-sm font-semibold">Jour : ${DAYS_OF_WEEK[day - 1]}</p>
            </div>
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Créneau horaire ou Statut</label>
                <input type="text" id="shift-input" value="${escapeHtml(currentShift)}" required
                    class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm outline-none"
                    placeholder="Ex: 08:00 - 16:00 ou Repos">
            </div>
            <div class="flex justify-end space-x-2 pt-2">
                <button type="button" data-close-modal-2 class="pill-btn border-2 border-[#2f3640] px-4 py-2 text-sm font-semibold">Annuler</button>
                <button type="submit" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2 text-sm font-semibold">Enregistrer</button>
            </div>
        </form>`,
        () => {
            document.querySelector('[data-close-modal-2]').addEventListener('click', closeModal);
            document.getElementById('shift-form').addEventListener('submit', async (event) => {
                event.preventDefault();
                const val = document.getElementById('shift-input').value;
                await api.setShift({ employeeId: empId, week: currentWeek, day, shift: val });
                closeModal();
                await renderPlanning(container);
                showToast('Planning mis à jour avec succès');
            });
        }
    );
}

function openAddShiftModal(container) {
    openModal(
        'Ajouter / Assigner un quart',
        `
        <form id="new-shift-form" class="space-y-4">
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Employé</label>
                <select id="new-shift-emp" class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm bg-white outline-none">
                    ${employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.role)})</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Jour de la semaine</label>
                <select id="new-shift-day" class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm bg-white outline-none">
                    ${DAYS_OF_WEEK.map((d, i) => `<option value="${i + 1}">${d}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Créneau horaire</label>
                <input type="text" id="new-shift-val" value="08:00 - 16:00" required
                    class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm outline-none">
            </div>
            <div class="flex justify-end space-x-2 pt-2">
                <button type="button" data-close-modal-2 class="pill-btn border-2 border-[#2f3640] px-4 py-2 text-sm font-semibold">Annuler</button>
                <button type="submit" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2 text-sm font-semibold">Attribuer</button>
            </div>
        </form>`,
        () => {
            document.querySelector('[data-close-modal-2]').addEventListener('click', closeModal);
            document.getElementById('new-shift-form').addEventListener('submit', async (event) => {
                event.preventDefault();
                const employeeId = Number(document.getElementById('new-shift-emp').value);
                const day = Number(document.getElementById('new-shift-day').value);
                const shift = document.getElementById('new-shift-val').value;
                await api.setShift({ employeeId, week: currentWeek, day, shift });
                closeModal();
                await renderPlanning(container);
                showToast('Quart de travail attribué');
            });
        }
    );
}
