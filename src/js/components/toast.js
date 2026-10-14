/**
 * Composant Toast : notifications éphémères (pas d'alert() natif).
 */

const container = () => document.getElementById('toast-container');

export function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className =
        'bg-[#2f3640] text-[#f5f6fa] px-6 py-3 rounded-full border-2 border-white text-sm font-semibold flex items-center space-x-3';
    const icon = isError ? 'fa-circle-exclamation' : 'fa-circle-check';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
    toast.querySelector('span').textContent = message;
    container().appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
