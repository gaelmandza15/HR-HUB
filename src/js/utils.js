/**
 * Utilitaires partagés : constantes, calculs d'heures, helpers DOM.
 */

export const DAYS_OF_WEEK = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const ABSENCE_TYPES = ['Congé payé', 'Arrêt maladie', 'Congé sans solde'];

export const WEEK_START_YEAR = 2026;

/** Échappe le HTML injecté dynamiquement (protection XSS de base). */
export function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** Convertit une chaîne de créneau ("08:00 - 16:00") en heures travaillées. */
export function parseShiftHours(shiftString) {
    if (!shiftString) return 0;
    const lower = shiftString.toLowerCase();
    if (lower.includes('repos') || lower.includes('congé')) return 0;
    const parts = shiftString.split('-');
    if (parts.length !== 2) return 0;
    const [sh, sm] = parts[0].trim().split(':').map(Number);
    const [eh, em] = parts[1].trim().split(':').map(Number);
    const diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
    return diff > 0 ? diff : 0;
}

/** Total des heures planifiées pour un employé sur une semaine. */
export function totalHoursFor(employeeId, shifts) {
    return shifts
        .filter((s) => s.employeeId === employeeId)
        .reduce((acc, s) => acc + parseShiftHours(s.shift), 0);
}

/** Récupère le créneau d'un employé pour un jour donné ('Repos' par défaut). */
export function getShift(employeeId, day, shifts) {
    const found = shifts.find((s) => s.employeeId === employeeId && s.day === day);
    return found ? found.shift : 'Repos';
}

/** Numéro de semaine ISO pour une date. */
export function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Lundi de la semaine ISO donnée (lundi -> dimanche), pour une année fournie. */
export function weekRange(week, year = WEEK_START_YEAR) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const monday = new Date(simple);
    monday.setDate(simple.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${fmt(monday)} - ${fmt(sunday)}`;
}

/** Petit helper de création d'élément. */
export function el(tag, className, innerHTML = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.innerHTML = innerHTML;
    return node;
}
