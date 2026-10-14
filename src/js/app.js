/**
 * Point d'entrée de l'application HR HUB (Tauri).
 *
 * Orchestre : initialisation des composants partagés (modal, sidebar),
 * routage entre les pages et premier rendu.
 */

import { initModal } from './components/modal.js';
import { initSidebar, switchTab } from './components/sidebar.js';
import { showToast } from './components/toast.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderPlanning } from './pages/planning.js';
import { renderTeam } from './pages/team.js';
import { renderAbsences } from './pages/absences.js';

const PAGES = {
    dashboard: renderDashboard,
    planning: renderPlanning,
    team: renderTeam,
    absences: renderAbsences,
};

const container = () => document.getElementById('page-container');

async function navigate(tabId) {
    const page = PAGES[tabId];
    if (!page) return;
    try {
        await page(container());
    } catch (err) {
        console.error(err);
        showToast(`Erreur : ${err.message ?? err}`, true);
    }
}

// Les pages écoutent l'événement émis par la sidebar
window.addEventListener('tab-change', (e) => navigate(e.detail));

// Démarrage à plat : pas d'ombres ni de dégradés (design system "flat")
const style = document.createElement('style');
style.textContent = `
    * { box-shadow: none !important; background-image: none !important; }
    body { background-color: #f5f6fa; color: #2f3640; font-family: 'Inter', sans-serif; }
    .pill-btn { border-radius: 9999px; transition: background-color 0.15s ease, color 0.15s ease; }
`;
document.head.appendChild(style);

initModal();
initSidebar();
switchTab('dashboard');
