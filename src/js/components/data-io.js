/**
 * Composant Import / Export des données (barre d'outils réutilisable).
 *
 * - Export : la commande backend (`export_data` en Tauri, ou le fallback
 *   localStorage en mode navigateur) produit le contenu au format choisi
 *   (JSON, CSV, TSV/Excel, Markdown, SQL), puis un <a download> l'enregistre.
 * - Import : lecture du fichier via <input type=file>, envoi au backend
 *   (`import_data`) avec deux modes : fusionner ou remplacer.
 *
 * Les formats sont déclarés ici une seule fois (aucune valeur codée en dur
 * ailleurs) ; backend Rust et fallback JS les prennent tous en charge.
 */

import { api } from '../api.js';
import { showToast } from './toast.js';

export const EXPORT_FORMATS = [
    { id: 'json', label: 'JSON (complet, réimportable)', icon: 'fa-code' },
    { id: 'csv', label: 'CSV (Excel / LibreOffice)', icon: 'fa-file-csv' },
    { id: 'tsv', label: 'TSV (classeur, collable)', icon: 'fa-table' },
    { id: 'md', label: 'Markdown (lisible)', icon: 'fa-file-lines' },
    { id: 'sql', label: 'SQL (dump de la base)', icon: 'fa-database' },
];

const IMPORT_ACCEPT = '.json,.csv,.tsv,.txt';

function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'application/octet-stream;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révocation différée : certains navigateurs annulent le téléchargement
    // si l'URL objet est libérée trop tôt.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function formatFromFilename(name) {
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    if (ext === 'json') return 'json';
    if (ext === 'csv') return 'csv';
    if (ext === 'tsv' || ext === 'txt') return 'tsv';
    return ''; // le backend/fallback tentera JSON par défaut
}

/**
 * Rend la barre Import/Export dans `container`.
 * `onImported` : callback async appelé après un import réussi (re-render).
 */
export function mountDataIO(container, onImported) {
    container.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
            <select data-export-format class="border-2 border-[#2f3640] rounded-full px-3 py-1.5 text-sm outline-none bg-white">
                ${EXPORT_FORMATS.map((f) => `<option value="${f.id}">${f.label}</option>`).join('')}
            </select>
            <button data-export-btn class="pill-btn bg-[#2f3640] text-[#f5f6fa] px-4 py-1.5 text-xs font-semibold inline-flex items-center gap-2">
                <i class="fa-solid fa-file-arrow-down"></i>Exporter
            </button>
            <span class="w-px h-6 bg-gray-300 mx-1 hidden sm:block"></span>
            <select data-import-mode class="border-2 border-[#2f3640] rounded-full px-3 py-1.5 text-sm outline-none bg-white"
                title="Fusionner ajoute les données sans rien supprimer ; Remplacer vide les tables du fichier avant import.">
                <option value="merge">Fusionner</option>
                <option value="replace">Remplacer</option>
            </select>
            <label data-import-btn class="pill-btn border-2 border-[#2f3640] px-4 py-1.5 text-xs font-semibold cursor-pointer inline-flex items-center gap-2 hover:bg-[#2f3640] hover:text-[#f5f6fa] transition-colors">
                <i class="fa-solid fa-file-arrow-up"></i>Importer
                <input type="file" data-import-file accept="${IMPORT_ACCEPT}" class="hidden" />
            </label>
        </div>`;

    const formatSelect = container.querySelector('[data-export-format]');
    const modeSelect = container.querySelector('[data-import-mode]');
    const fileInput = container.querySelector('[data-import-file]');

    container.querySelector('[data-export-btn]').addEventListener('click', async () => {
        try {
            const payload = await api.exportData({ format: formatSelect.value });
            if (!payload || typeof payload.content !== 'string') {
                throw new Error('réponse d\u2019export inattendue (app recompilée ?)');
            }
            triggerDownload(payload.content, payload.filename ?? `hrhub-export.${formatSelect.value}`);
            showToast(`Export ${formatSelect.value.toUpperCase()} téléchargé`);
        } catch (err) {
            showToast(`Erreur export : ${err.message ?? err}`, true);
        }
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
            const content = await file.text();
            const detected = formatFromFilename(file.name);
            // Pour un .json mal nommé, on détecte aussi le contenu.
            const format = detected || (content.trim().startsWith('{') ? 'json' : '');
            await api.importData({ content, format, mode: modeSelect.value });
            showToast(`Import terminé (${modeSelect.value === 'merge' ? 'fusion' : 'remplacement'})`);
            if (onImported) await onImported();
        } catch (err) {
            showToast(`Erreur import : ${err.message ?? err}`, true);
        } finally {
            fileInput.value = ''; // permet de réimporter le même fichier
        }
    });
}
