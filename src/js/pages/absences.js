/**
 * Page Absences & Congés : déclaration, validation et refus des demandes.
 */

import { api } from '../api.js';
import { ABSENCE_TYPES, escapeHtml } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export async function renderAbsences(container) {
    const [absences, employees] = await Promise.all([api.listAbsences(), api.listEmployees()]);
    const empById = new Map(employees.map((e) => [e.id, e]));

    container.innerHTML = `
        <div class="space-y-6">
            <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-[#2f3640]">Suivi des Absences & Congés</h1>
                    <p class="text-sm text-gray-600">Validez ou refusez les demandes de congés et arrêts maladie.</p>
                </div>
                <button id="btn-add-abs" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2.5 text-sm font-semibold hover:opacity-90">
                    <i class="fa-solid fa-calendar-plus mr-2"></i>Déclarer une absence
                </button>
            </header>

            <div class="bg-white border-2 border-[#2f3640] rounded-3xl overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                        <tr class="border-b-2 border-[#2f3640] bg-[#f5f6fa]">
                            <th class="p-4 font-bold text-sm">Employé</th>
                            <th class="p-4 font-bold text-sm">Type d'absence</th>
                            <th class="p-4 font-bold text-sm">Période</th>
                            <th class="p-4 font-bold text-sm">Statut</th>
                            <th class="p-4 font-bold text-sm text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="absences-table-body" class="divide-y-2 divide-[#2f3640]"></tbody>
                </table>
            </div>
        </div>`;

    const tbody = document.getElementById('absences-table-body');
    tbody.innerHTML = absences
        .map((abs) => {
            const emp = empById.get(abs.employeeId);
            return `
            <tr class="hover:bg-[#f5f6fa] transition-colors">
                <td class="p-4 font-semibold text-sm">${escapeHtml(emp ? emp.name : 'Inconnu')}</td>
                <td class="p-4 text-sm">${escapeHtml(abs.type)}</td>
                <td class="p-4 text-sm">${escapeHtml(abs.period)}</td>
                <td class="p-4 text-sm">
                    <span class="pill-btn border-2 border-[#2f3640] px-3 py-1 text-xs font-bold">${escapeHtml(abs.status)}</span>
                </td>
                <td class="p-4 text-right space-x-2">
                    <button data-abs-validate="${abs.id}" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-3 py-1 text-xs font-semibold">Valider</button>
                    <button data-abs-reject="${abs.id}" class="pill-btn border-2 border-[#2f3640] px-3 py-1 text-xs font-semibold">Refuser</button>
                </td>
            </tr>`;
        })
        .join('');

    async function setStatus(id, status) {
        await api.setAbsenceStatus({ id, status });
        await renderAbsences(container);
        showToast(`Demande marquée comme : ${status}`);
    }

    tbody.querySelectorAll('[data-abs-validate]').forEach((btn) =>
        btn.addEventListener('click', () => setStatus(Number(btn.dataset.absValidate), 'Validé'))
    );
    tbody.querySelectorAll('[data-abs-reject]').forEach((btn) =>
        btn.addEventListener('click', () => setStatus(Number(btn.dataset.absReject), 'Refusé'))
    );

    document.getElementById('btn-add-abs').addEventListener('click', () => {
        openModal(
            'Déclarer une absence',
            `
            <form id="abs-form" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold uppercase mb-1">Employé</label>
                    <select id="abs-emp" class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm bg-white outline-none">
                        ${employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold uppercase mb-1">Type d'absence</label>
                    <select id="abs-type" class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm bg-white outline-none">
                        ${ABSENCE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold uppercase mb-1">Période</label>
                    <input type="text" id="abs-period" required
                        class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm outline-none"
                        placeholder="Ex: 20 Octobre - 22 Octobre">
                </div>
                <div class="flex justify-end space-x-2 pt-2">
                    <button type="button" data-close-modal-2 class="pill-btn border-2 border-[#2f3640] px-4 py-2 text-sm font-semibold">Annuler</button>
                    <button type="submit" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2 text-sm font-semibold">Soumettre</button>
                </div>
            </form>`,
            () => {
                document.querySelector('[data-close-modal-2]').addEventListener('click', closeModal);
                document.getElementById('abs-form').addEventListener('submit', async (event) => {
                    event.preventDefault();
                    await api.addAbsence({
                        employeeId: Number(document.getElementById('abs-emp').value),
                        kind: document.getElementById('abs-type').value,
                        period: document.getElementById('abs-period').value,
                    });
                    closeModal();
                    await renderAbsences(container);
                    showToast('Déclaration enregistrée');
                });
            }
        );
    });
}
