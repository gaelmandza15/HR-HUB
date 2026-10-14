/**
 * Page Dashboard : indicateurs clés, aperçu des rôles et absences récentes.
 */

import { api } from '../api.js';
import { escapeHtml, totalHoursFor } from '../utils.js';
import { switchTab } from '../components/sidebar.js';

const CARD_CLASS = 'bg-white border-2 border-[#2f3640] rounded-3xl p-6 flex flex-col justify-between';

function statCard(label, icon, valueId, extraClass = '') {
    return `
        <div class="${CARD_CLASS}">
            <div class="flex justify-between items-start mb-4">
                <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">${label}</span>
                <div class="w-8 h-8 rounded-full border-2 border-[#2f3640] flex items-center justify-center text-sm font-bold">
                    <i class="fa-solid ${icon}"></i>
                </div>
            </div>
            <div>
                <h3 id="${valueId}" class="text-3xl font-bold ${extraClass}">0</h3>
                <p class="text-xs text-gray-500 mt-1">&nbsp;</p>
            </div>
        </div>`;
}

export async function renderDashboard(container) {
    container.innerHTML = `
        <div class="space-y-8">
            <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-[#2f3640]">Tableau de Bord RH</h1>
                    <p class="text-sm text-gray-600">Vue d'ensemble de l'activité et des indicateurs clés de la semaine.</p>
                </div>
                <button data-goto="planning" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-5 py-2.5 text-sm font-semibold hover:opacity-90">
                    <i class="fa-solid fa-plus mr-2"></i>Nouveau planning
                </button>
            </header>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                ${statCard("Employés Actifs", 'fa-users', 'stat-total-emp')}
                ${statCard('Heures Planifiées', 'fa-clock', 'stat-total-hours')}
                ${statCard('Alertes Heures Sup.', 'fa-triangle-exclamation', 'stat-overtime', 'text-red-600')}
                ${statCard('Absences en Attente', 'fa-calendar-xmark', 'stat-pending-abs')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white border-2 border-[#2f3640] rounded-3xl p-6">
                    <h3 class="text-lg font-bold mb-4 flex items-center justify-between">
                        <span>Aperçu des Rôles & Postes</span>
                        <button data-goto="team" class="text-xs font-bold underline">Voir tout</button>
                    </h3>
                    <div id="dashboard-roles-list" class="space-y-3"></div>
                </div>
                <div class="bg-white border-2 border-[#2f3640] rounded-3xl p-6">
                    <h3 class="text-lg font-bold mb-4 flex items-center justify-between">
                        <span>Demandes d'absences récentes</span>
                        <button data-goto="absences" class="text-xs font-bold underline">Gérer</button>
                    </h3>
                    <div id="dashboard-absences-list" class="space-y-3"></div>
                </div>
            </div>
        </div>`;

    // Navigation interne
    container.querySelectorAll('[data-goto]').forEach((btn) =>
        btn.addEventListener('click', () => switchTab(btn.dataset.goto))
    );

    // Chargement des données depuis SQLite (via l'API Tauri)
    const [employees, roles, shifts, absences] = await Promise.all([
        api.listEmployees(),
        api.listRoles(),
        api.listShifts({ week: 42 }),
        api.listAbsences(),
    ]);

    let totalCompanyHours = 0;
    let overtimeCount = 0;
    employees.forEach((emp) => {
        const hours = totalHoursFor(emp.id, shifts);
        totalCompanyHours += hours;
        if (hours > emp.contract) overtimeCount++;
    });

    document.getElementById('stat-total-emp').textContent = employees.length;
    document.getElementById('stat-total-hours').textContent = `${totalCompanyHours}h`;
    document.getElementById('stat-overtime').textContent = overtimeCount;
    document.getElementById('stat-pending-abs').textContent = absences.filter(
        (a) => a.status === 'En attente'
    ).length;

    // Aperçu des rôles
    document.getElementById('dashboard-roles-list').innerHTML = roles
        .map((role) => {
            const count = employees.filter((e) => e.role === role.name).length;
            return `
                <div class="flex items-center justify-between p-3 rounded-2xl border-2 border-[#2f3640]">
                    <span class="font-semibold text-sm">${escapeHtml(role.name)}</span>
                    <span class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-3 py-1 text-xs font-bold">${count} employés</span>
                </div>`;
        })
        .join('');

    // Absences récentes (3 dernières)
    const empById = new Map(employees.map((e) => [e.id, e]));
    document.getElementById('dashboard-absences-list').innerHTML = absences
        .slice(0, 3)
        .map((abs) => {
            const emp = empById.get(abs.employeeId);
            return `
                <div class="flex items-center justify-between p-3 rounded-2xl border-2 border-[#2f3640]">
                    <div>
                        <p class="font-semibold text-sm">${escapeHtml(emp ? emp.name : 'Inconnu')}</p>
                        <p class="text-xs text-gray-500">${escapeHtml(abs.type)} (${escapeHtml(abs.period)})</p>
                    </div>
                    <span class="text-xs font-bold px-3 py-1 rounded-full border-2 border-[#2f3640]">${escapeHtml(abs.status)}</span>
                </div>`;
        })
        .join('');
}
