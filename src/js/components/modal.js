/**
 * Composant Modal : fenêtre modale unique réutilisée par toutes les pages.
 * L'ouverture accepte un titre, du HTML et un callback optionnel exécuté
 * après injection (pour brancher les écouteurs du formulaire).
 */

let currentOnMount = null;

export function openModal(title, htmlContent, onMount = null) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = htmlContent;
    document.getElementById('app-modal').classList.remove('hidden');
    currentOnMount = onMount;
    if (currentOnMount) currentOnMount();
}

export function closeModal() {
    document.getElementById('app-modal').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    currentOnMount = null;
}

/** Fermeture via le bouton [data-close-modal] ou clic sur le fond. */
export function initModal() {
    document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
    const overlay = document.getElementById('app-modal');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
}
