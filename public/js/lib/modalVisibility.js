/**
 * Open/close overlay modals via class, not inline display.
 * Layers cannot beat inline style="display: …"; .modal.is-open keeps
 * centering (display:flex) in CSS without !important.
 */

export function openModal(el) {
  if (!el) return;
  el.classList.add('is-open');
  el.style.removeProperty('display');
}

export function closeModal(el) {
  if (!el) return;
  el.classList.remove('is-open');
  el.style.removeProperty('display');
}

export function isModalOpen(el) {
  return !!(el && el.classList.contains('is-open'));
}
