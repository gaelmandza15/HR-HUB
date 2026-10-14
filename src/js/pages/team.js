/**
 * Page Équipe & Postes : CRUD des employés (nom, rôle, contrat).
 */

import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let employees = [];
let roles = [];

export async function renderTeam(container) {
    const [emps, r] = await Promise.all([api.listEmployees(), api.listRoles()]);
    employees = emps.map((emp) => ({ ...emp, contract: Number(emp.contract) || 0 }));
    roles = r;

    container.innerHTML = `
        <div class="space-y-6">
            <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-[#2f3640]">Gestion des Employés & Postes</h1>
                    <p class="text-sm text-gray-600">Ajoutez des collaborateurs et définissez leurs contrats et rôles.</p>
                </div>
                <button id="btn-add-emp" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2.5 text-sm font-semibold hover:opacity-90">
                    <i class="fa-solid fa-user-plus mr-2"></i>Nouvel employé
                </button>
            </header>

            <div class="bg-white border-2 border-[#2f3640] rounded-3xl overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                        <tr class="border-b-2 border-[#2f3640] bg-[#f5f6fa]">
                            <th class="p-4 font-bold text-sm">Employé</th>
                            <th class="p-4 font-bold text-sm">Poste / Rôle</th>
                            <th class="p-4 font-bold text-sm">Contrat (Heures)</th>
                            <th class="p-4 font-bold text-sm text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="team-table-body" class="divide-y-2 divide-[#2f3640]"></tbody>
                </table>
            </div>
        </div>`;

    const tbody = document.getElementById('team-table-body');
    tbody.innerHTML = employees
        .map(
            (emp) => `
        <tr class="hover:bg-[#f5f6fa] transition-colors">
            <td class="p-4 font-semibold text-sm">${escapeHtml(emp.name)}</td>
            <td class="p-4 text-sm">
                <span class="pill-btn border-2 border-[#2f3640] px-3 py-1 text-xs font-bold">${escapeHtml(emp.role)}</span>
            </td>
            <td class="p-4 text-sm font-semibold">${Number(emp.contract) || 0}h / semaine</td>
            <td class="p-4 text-right space-x-2">
                <button data-edit-emp="${emp.id}" class="pill-btn border-2 border-[#2f3640] px-3 py-1 text-xs font-semibold hover:bg-[#2f3640] hover:text-white">Modifier</button>
                <button data-delete-emp="${emp.id}" class="pill-btn border-2 border-red-600 text-red-600 px-3 py-1 text-xs font-semibold hover:bg-red-600 hover:text-white">Supprimer</button>
            </td>
        </tr>`
        )
        .join('');

    document.getElementById('btn-add-emp').addEventListener('click', () => openEmployeeForm(container));
    tbody.querySelectorAll('[data-edit-emp]').forEach((btn) =>
        btn.addEventListener('click', () =>
            openEmployeeForm(container, employees.find((e) => e.id === Number(btn.dataset.editEmp)))
        )
    );
    tbody.querySelectorAll('[data-delete-emp]').forEach((btn) =>
        btn.addEventListener('click', async () => {
            await api.deleteEmployee({ id: Number(btn.dataset.deleteEmp) });
            await renderTeam(container);
            showToast('Employé supprimé');
        })
    );
}

/** Formulaire unique réutilisé pour création et édition. */
function openEmployeeForm(container, emp = null) {
    const isEdit = emp !== null;
    const roleOptions = roles
        .map((r) => `<option value="${escapeHtml(r.name)}" ${isEdit && emp.role === r.name ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
        .join('');

    openModal(
        isEdit ? "Modifier l'employé" : 'Ajouter un nouvel employé',
        `
        <form id="emp-form" class="space-y-4">
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Nom complet</label>
                <input type="text" id="emp-name" value="${isEdit ? escapeHtml(emp.name) : ''}" required
                    class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm outline-none" placeholder="Ex: Julie Dupont">
            </div>
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Poste / Rôle</label>
                <select id="emp-role" class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm bg-white outline-none">
                    ${roleOptions}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold uppercase mb-1">Contrat (Heures par semaine)</label>
                <input type="number" id="emp-contract" value="${isEdit ? emp.contract : 35}" required
                    class="w-full border-2 border-[#2f3640] rounded-full px-4 py-2 text-sm outline-none">
            </div>
            <div class="flex justify-end space-x-2 pt-2">
                <button type="button" data-close-modal-2 class="pill-btn border-2 border-[#2f3640] px-4 py-2 text-sm font-semibold">Annuler</button>
                <button type="submit" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2 text-sm font-semibold">${isEdit ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
        </form>`,
        () => {
            document.querySelector('[data-close-modal-2]').addEventListener('click', closeModal);
            document.getElementById('emp-form').addEventListener('submit', async (event) => {
                event.preventDefault();
                const payload = {
                    name: document.getElementById('emp-name').value,
                    role: document.getElementById('emp-role').value,
                    contract: parseInt(document.getElementById('emp-contract').value, 10),
                };
                if (isEdit) {
                    await api.updateEmployee({ id: emp.id, ...payload });
                    showToast('Informations mises à jour');
                } else {
                    const id = await api.addEmployee(payload);
                    // Initialisation des créneaux de la semaine courante à 'Repos'
                    for (let day = 1; day <= 7; day++) {
                        await api.setShift({ employeeId: id, week: 42, day, shift: 'Repos' });
                    }
                    showToast('Employé ajouté avec succès');
                }
                closeModal();
                await renderTeam(container);
            });
        }
    );
}
