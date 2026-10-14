/**
 * Composant Sidebar : génère la navigation et notifie l'application
 * à chaque changement d'onglet via un événement personnalisé.
 */

export const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie' },
    { id: 'planning', label: 'Planification', icon: 'fa-calendar-days' },
    { id: 'team', label: 'Équipe & Postes', icon: 'fa-users' },
    { id: 'absences', label: 'Absences & Congés', icon: 'fa-plane-slash' },
    { id: 'settings', label: 'Réglages', icon: 'fa-gear' },
];

const BASE_CLASS =
    'w-full flex items-center space-x-3 px-4 py-3 rounded-full font-medium transition-colors text-left text-[#f5f6fa] hover:bg-white/10';
const ACTIVE_CLASS =
    'w-full flex items-center space-x-3 px-4 py-3 rounded-full font-medium transition-colors text-left bg-[#f5f6fa] text-[#2f3640]';

export function initSidebar() {
    const nav = document.getElementById('main-nav');
    nav.innerHTML = '';
    TABS.forEach((tab) => {
        const btn = document.createElement('button');
        btn.id = `nav-${tab.id}`;
        btn.className = BASE_CLASS;
        btn.innerHTML = `<i class="fa-solid ${tab.icon} w-5"></i><span>${tab.label}</span>`;
        btn.addEventListener('click', () => switchTab(tab.id));
        nav.appendChild(btn);
    });
}

export function switchTab(tabId) {
    TABS.forEach((t) => {
        document.getElementById(`nav-${t.id}`).className = t.id === tabId ? ACTIVE_CLASS : BASE_CLASS;
    });
    window.dispatchEvent(new CustomEvent('tab-change', { detail: tabId }));
}
