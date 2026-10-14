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
import { renderSettings } from './pages/settings.js';

const PAGES = {
    dashboard: renderDashboard,
    planning: renderPlanning,
    team: renderTeam,
    absences: renderAbsences,
    settings: renderSettings,
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

import '../css/app.css';

// Les pages écoutent l'événement émis par la sidebar
window.addEventListener('tab-change', (e) => navigate(e.detail));

initModal();
initSidebar();
switchTab('dashboard');
