/**
 * Page Réglages : gestion des listes configurables (postes, types d'absence,
 * statuts, jours de semaine) et valeurs par défaut. Rien n'est codé en dur :
 * tout est stocké dans la table SQLite `settings`.
 */

import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { saveSetting, invalidateSettings } from '../settings.js';
import { mountDataIO } from '../components/data-io.js';

// Libellés affichés pour chaque paramètre modifiable
const LISTS = [
    { key: 'absence_types', label: "Types d'absence", icon: 'fa-calendar-xmark' },
    { key: 'absence_statuses', label: "Statuts d'absence (1er = initial)", icon: 'fa-flag' },
    { key: 'days_of_week', label: 'Jours de la semaine', icon: 'fa-week' },
];

const DEFAULTS = [
    { key: 'default_shift', label: 'Créneau par défaut' },
    { key: 'default_contract_hours', label: 'Contrat par défaut (h/semaine)' },
];

export async function renderSettings(container) {
    const [rows, roles] = await Promise.all([api.getSettings(), api.listRoles()]);
    // Garde-fou : jamais passer null/undefined à Object.fromEntries
    // ("Cannot convert undefined or null to object").
    const settings = Object.fromEntries(
        (Array.isArray(rows) ? rows : []).map((s) => [s.key, s.value])
    );
    // Les postes sont une entité à part entière (table SQLite `roles`) :
    // ajout/suppression via l'API dédiée, jamais en tapant dans une chaîne.
    const roleItems = roles.map((r) => ({ id: r.id, value: r.name }));

    container.innerHTML = `
        <div class="space-y-6">
            <header>
                <h1 class="text-2xl font-bold text-[#2f3640]">Réglages</h1>
                <p class="text-sm text-gray-600">Toutes les listes sont modifiables et enregistrées dans la base locale.</p>
            </header>

            <div class="bg-white border-2 border-[#2f3640] rounded-3xl p-6">
                <h3 class="text-base font-bold mb-1 flex items-center gap-2">
                    <i class="fa-solid fa-right-left"></i>Import / Export des données
                </h3>
                <p class="text-xs text-gray-500 mb-4">Sauvegarde complète (postes, employés, planning, absences, réglages) aux formats JSON, CSV, TSV, Markdown ou SQL. À l'import : « Fusionner » ajoute sans rien écraser, « Remplacer » recharge les tables du fichier.</p>
                <div id="data-io-bar"></div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6" id="settings-lists"></div>

            <div class="bg-white border-2 border-[#2f3640] rounded-3xl p-6">
                <h3 class="text-base font-bold mb-3 flex items-center gap-2">
                    <i class="fa-solid fa-briefcase"></i>Postes / Rôles
                </h3>
                <p class="text-xs text-gray-500 mb-3">Entités enregistrées dans la base : ajout et suppression sans limite.</p>
                <div class="flex flex-wrap gap-2 mb-4" id="roles-chips"></div>
                <form data-add-role class="flex gap-2">
                    <input required placeholder="Nouveau poste (ex: Boucherie)…" class="flex-1 border-2 border-[#2f3640] rounded-full px-3 py-1.5 text-sm outline-none" />
                    <button type="submit" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-4 py-1.5 text-xs font-semibold">Ajouter</button>
                </form>
            </div>

            <div class="bg-white border-2 border-[#2f3640] rounded-3xl p-6 space-y-4">
                <h3 class="text-lg font-bold">Valeurs par défaut</h3>
                ${DEFAULTS.map(
                    (d) => `
                    <div class="flex items-center justify-between gap-4">
                        <label class="text-sm font-semibold">${escapeHtml(d.label)}</label>
                        <div class="flex gap-2">
                            <input id="def-${d.key}" value="${escapeHtml(settings[d.key] ?? '')}"
                                class="w-40 border-2 border-[#2f3640] rounded-full px-3 py-1.5 text-sm outline-none" />
                            <button data-save-default="${d.key}" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-4 py-1.5 text-xs font-semibold">Enregistrer</button>
                        </div>
                    </div>`
                ).join('')}
            </div>
        </div>`;

    // Barre Import / Export (composant réutilisable)
    mountDataIO(container.querySelector('#data-io-bar'), () => renderSettings(container));

    // Cartes de listes éditables (paramètres clé/valeur)
    document.getElementById('settings-lists').innerHTML = LISTS.map(
        (list) => `
        <div class="bg-white border-2 border-[#2f3640] rounded-3xl p-6">
            <h3 class="text-base font-bold mb-3 flex items-center gap-2">
                <i class="fa-solid ${list.icon}"></i>${escapeHtml(list.label)}
            </h3>
            <div class="flex flex-wrap gap-2 mb-4">
                ${(settings[list.key] ?? '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map(
                        (item) => `
                        <span class="inline-flex items-center gap-2 pill-btn border-2 border-[#2f3640] px-3 py-1 text-xs font-bold">
                            ${escapeHtml(item)}
                            <button data-remove-item="${list.key}" data-value="${escapeHtml(item)}" title="Retirer"
                                class="text-red-600 hover:scale-110"><i class="fa-solid fa-xmark"></i></button>
                        </span>`
                    )
                    .join('')}
            </div>
            <form data-add-form="${list.key}" class="flex gap-2">
                <input required placeholder="Ajouter…" class="flex-1 border-2 border-[#2f3640] rounded-full px-3 py-1.5 text-sm outline-none" />
                <button type="submit" class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-4 py-1.5 text-xs font-semibold">Ajouter</button>
            </form>
        </div>`
    ).join('');

    // Postes / Rôles : entités SQLite (ajout/suppression illimités)
    document.getElementById('roles-chips').innerHTML = roleItems.length
        ? roleItems
              .map(
                  (r) => `
            <span class="inline-flex items-center gap-2 pill-btn border-2 border-[#2f3640] px-3 py-1 text-xs font-bold">
                ${escapeHtml(r.value)}
                <button data-remove-role="${r.id}" data-value="${escapeHtml(r.value)}" title="Supprimer le poste"
                    class="text-red-600 hover:scale-110"><i class="fa-solid fa-xmark"></i></button>
            </span>`
              )
              .join('')
        : '<p class="text-xs text-gray-500 italic">Aucun poste pour le moment.</p>';

    container.querySelector('[data-add-role]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = event.target.querySelector('input');
        const value = input.value.trim();
        if (!value) return;
        try {
            await api.addRole({ name: value });
            invalidateSettings();
            await renderSettings(container);
            showToast(`Poste « ${value} » ajouté`);
        } catch (err) {
            showToast(`Erreur : ${err.message ?? err}`, true);
        }
    });

    container.querySelectorAll('[data-remove-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
            openModal(
                'Supprimer un poste',
                `<p class="text-sm">Retirer le poste « <b>${escapeHtml(btn.dataset.value)}</b> » ?<br>
                 Impossible si des employés y sont encore rattachés.</p>
                 <div class="flex justify-end gap-2 pt-4">
                    <button data-close-modal-2 class="pill-btn border-2 border-[#2f3640] px-4 py-2 text-sm font-semibold">Annuler</button>
                    <button id="confirm-remove-role" class="pill-btn bg-red-600 text-white px-4 py-2 text-sm font-semibold">Supprimer</button>
                 </div>`,
                () => {
                    document.querySelector('[data-close-modal-2]').addEventListener('click', closeModal);
                    document.getElementById('confirm-remove-role').addEventListener('click', async () => {
                        try {
                            await api.deleteRole({ id: Number(btn.dataset.removeRole) });
                            invalidateSettings();
                            closeModal();
                            await renderSettings(container);
                            showToast('Poste supprimé');
                        } catch (err) {
                            closeModal();
                            showToast(`Erreur : ${err.message ?? err}`, true);
                        }
                    });
                }
            );
        });
    });

    // Ajout d'un élément dans une liste de paramètres
    container.querySelectorAll('[data-add-form]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const key = form.dataset.addForm;
            const input = form.querySelector('input');
            const value = input.value.trim();
            if (!value) return;
            const current = (settings[key] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
            if (current.some((x) => x.toLowerCase() === value.toLowerCase())) {
                showToast('Cette valeur existe déjà', true);
                return;
            }
            current.push(value);
            await persistList(key, current);
            await renderSettings(container);
            showToast('Élément ajouté');
        });
    });

    // Retrait d'un élément
    container.querySelectorAll('[data-remove-item]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.removeItem;
            const value = btn.dataset.value;
            const current = (settings[key] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
            const next = current.filter((x) => x !== value);
            openModal(
                'Confirmer la suppression',
                `<p class="text-sm">Retirer « <b>${escapeHtml(value)}</b » de la liste ? Les données existantes liées ne seront pas supprimées.</p>
                 <div class="flex justify-end gap-2 pt-4">
                    <button data-close-modal-2 class="pill-btn border-2 border-[#2f3640] px-4 py-2 text-sm font-semibold">Annuler</button>
                    <button id="confirm-remove" class="pill-btn bg-red-600 text-white px-4 py-2 text-sm font-semibold">Retirer</button>
                 </div>`,
                () => {
                    document.querySelector('[data-close-modal-2]').addEventListener('click', closeModal);
                    document.getElementById('confirm-remove').addEventListener('click', async () => {
                        await persistList(key, next);
                        closeModal();
                        await renderSettings(container);
                        showToast('Élément retiré');
                    });
                }
            );
        });
    });

    // Valeurs par défaut
    container.querySelectorAll('[data-save-default]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.saveDefault;
            const value = document.getElementById(`def-${key}`).value.trim();
            if (!value) return;
            await saveSetting(key, value);
            invalidateSettings();
            showToast('Réglage enregistré');
        });
    });
}

/** Sauvegarde une liste complète + invalide le cache frontend. */
async function persistList(key, items) {
    await saveSetting(key, items.join(', '));
    invalidateSettings();
}
