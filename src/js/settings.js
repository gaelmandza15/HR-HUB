/**
 * Store de paramètres applicatifs (postes, types d'absence, statuts, jours…).
 *
 * Rien n'est codé en dur côté frontend : toutes les listes proviennent de la
 * base SQLite via l'API (`getSettings` / `setSetting`). Les valeurs de repli
 * ne servent qu'au tout premier chargement navigateur (mode démo local).
 */

import { api } from './api.js';

let cache = null; // { key: value }

async function load() {
    if (!cache) {
        const rows = await api.getSettings();
        cache = Object.fromEntries(rows.map((s) => [s.key, s.value]));
    }
    return cache;
}

function splitList(raw) {
    return String(raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Liste de jours de semaine configurables. */
export async function getDaysOfWeek() {
    const s = await load();
    return splitList(s.days_of_week);
}

/** Types d'absence configurables. */
export async function getAbsenceTypes() {
    const s = await load();
    return splitList(s.absence_types);
}

/** Statuts d'absence configurables (le 1er = statut initial d'une demande). */
export async function getAbsenceStatuses() {
    const s = await load();
    return splitList(s.absence_statuses);
}

/** Créneau par défaut ('Repos'), configurable. */
export async function getDefaultShift() {
    const s = await load();
    return s.default_shift || '';
}

/** Contrat hebdomadaire par défaut, configurable. */
export async function getDefaultContractHours() {
    const s = await load();
    return Number(s.default_contract_hours) || 0;
}

/** Année de référence pour le calcul des semaines ISO. */
export async function getWeekStartYear() {
    const s = await load();
    return Number(s.week_start_year) || new Date().getFullYear();
}

/** Valeur brute d'un paramètre (chaîne), ou '' si absent. */
export async function getSetting(key) {
    const s = await load();
    return s[key] ?? '';
}

/** Liste de postes configurables (paramètre `roles`). */
export async function getRolesList() {
    const s = await load();
    return splitList(s.roles);
}

/** Écrase un paramètre en base et invalide le cache mémoire. */
export async function saveSetting(key, value) {
    await api.setSetting({ key, value });
    const s = await load();
    s[key] = value;
}

/** Force relecture des paramètres après modification. */
export function invalidateSettings() {
    cache = null;
}
