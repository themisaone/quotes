/**
 * ============================================================================
 * QUOTE EDITOR
 * ============================================================================
 * Manages the quote/note editing modal including Quill editor setup,
 * form submission, validation, and modal lifecycle.
 * 
 * Main functions:
 * - initializeQuillEditor() - Setup Quill rich text editor
 * - handleFormSubmit() - Process and save quote/note data
 * - deleteQuote() - Delete a quote with confirmation
 * - closeModal() - Close modal and reset state
 * 
 * Dependencies:
 * - Quill.js for rich text editing
 * - modalRenderer.js for modal setup
 */

import { MODAL_IDS, getElementByIdSafe, getElementValue } from '../constants.js';
import { downscaleImage } from './attachments.js';
import { getNoteTypeConfig, hasGenericSubTypeField } from './noteTypes.js';
import { showConfirm } from './confirmDialog.js';
import {
  NOTE_FORMAT_HTML,
  NOTE_FORMAT_MARKDOWN,
  normalizeNoteFormat,
  renderMarkdown,
} from './markdown.js?v=20260702format1';

// ============= CONSTANTS =============

const QUILL_TOOLBAR_CONFIG = [
  ['bold', 'italic', 'underline'],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'header': [1, 2, 3, false] }],
  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  ['image'],
  ['clean']
];

// Max dimension (px) for images inserted inline into Quill
const INLINE_IMAGE_MAX_PX = 1200;

const QUILL_PLACEHOLDER = 'Enter the quote text...';

const KEYBOARD_SHORTCUTS = {
  ESCAPE: 'Escape',
  F11: 'F11'
};

// ============= STATE =============

let quillEditorInstance = null;
let markdownEditorWired = false;
let markdownSourceVisible = false;
const MARKDOWN_HIGHLIGHT_COLOR = '#fff3a3';

// ============= HELPERS =============

function _readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Show a small size-picker dialog and resolve with the chosen max dimension.
 * Resolves with null if cancelled.
 */
function _showImageSizeDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: #fff; border-radius: 10px; padding: 1.5rem 2rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25); min-width: 260px; text-align: center;
    `;

    box.innerHTML = `
      <p style="margin: 0 0 1rem; font-weight: 600; font-size: 1rem; color: #1e293b;">
        📐 Image size (longest side)
      </p>
    `;

    const sizes = [300, 500, 1200];
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 0.6rem; justify-content: center; margin-bottom: 0.9rem;';

    sizes.forEach(px => {
      const btn = document.createElement('button');
      btn.textContent = `${px}px`;
      btn.style.cssText = `
        padding: 0.5rem 1rem; border: none; border-radius: 6px;
        background: #1e40af; color: #fff; font-size: 0.9rem;
        cursor: pointer; font-weight: 500;
      `;
      btn.onmouseenter = () => btn.style.background = '#1d4ed8';
      btn.onmouseleave = () => btn.style.background = '#1e40af';
      btn.onclick = () => { document.body.removeChild(overlay); resolve(px); };
      btnRow.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 0.4rem 1rem; border: 1px solid #cbd5e1; border-radius: 6px;
      background: #f1f5f9; color: #475569; font-size: 0.85rem; cursor: pointer;
    `;
    cancelBtn.onclick = () => { document.body.removeChild(overlay); resolve(null); };

    box.appendChild(btnRow);
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } };
    document.body.appendChild(overlay);
  });
}

/**
 * Downscale base64 image to chosen size and insert into Quill at current cursor.
 */
async function _insertInlineImageFor(quill, base64) {
  const maxPx = await _showImageSizeDialog();
  if (maxPx === null) return; // cancelled
  try {
    const downscaled = await downscaleImage(base64, maxPx, maxPx);
    const range = quill.getSelection(true);
    const idx = range ? range.index : quill.getLength();
    quill.insertEmbed(idx, 'image', downscaled);
    quill.setSelection(idx + 1);
  } catch (err) {
    console.error('Error inserting inline image:', err);
  }
}

function _wireQuillInstance(quill, hiddenInputId, { onTextChange } = {}) {
  quill.on('text-change', (delta, oldDelta, source) => {
    const html = quill.root.innerHTML;
    const hiddenInput = getElementByIdSafe(hiddenInputId);
    if (hiddenInput && getActiveNoteFormat() === NOTE_FORMAT_HTML) hiddenInput.value = html;
    onTextChange?.(source);
  });

  const toolbar = quill.getModule('toolbar');
  toolbar.addHandler('image', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const base64 = await _readFileAsBase64(file);
      await _insertInlineImageFor(quill, base64);
    };
    input.click();
  });

  quill.root.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const base64 = await _readFileAsBase64(item.getAsFile());
        await _insertInlineImageFor(quill, base64);
        break;
      }
    }
  });
}

function getMarkdownEditorElement() {
  return document.getElementById('markdownEditor');
}

function getMarkdownPreviewElement() {
  return document.getElementById('markdownPreviewEditor');
}

function getNoteFormatInput() {
  return document.getElementById('noteFormat');
}

function getHtmlSourceButton() {
  return document.getElementById('viewHtmlBtn');
}

function getMarkdownSourceToggleButton() {
  return document.getElementById('toggleMarkdownSourceBtn');
}

function getMarkdownFormatControls() {
  return document.getElementById('markdownFormatControls');
}

function setSiblingQuillToolbarHidden(quillHost, hidden) {
  const parent = quillHost?.parentElement;
  if (!parent) return;
  Array.from(parent.children)
    .filter((child) => child.classList?.contains('ql-toolbar'))
    .forEach((toolbar) => {
      toolbar.hidden = hidden;
    });
}

function wireMarkdownEditor(hiddenInputId = 'quoteText') {
  const markdownEditor = getMarkdownEditorElement();
  const markdownPreview = getMarkdownPreviewElement();
  const toggleButton = getMarkdownSourceToggleButton();
  if ((!markdownEditor && !markdownPreview) || markdownEditorWired) return;
  markdownEditorWired = true;
  markdownEditor?.addEventListener('input', () => {
    if (getActiveNoteFormat() !== NOTE_FORMAT_MARKDOWN) return;
    const hiddenInput = getElementByIdSafe(hiddenInputId);
    if (hiddenInput) hiddenInput.value = markdownEditor.value;
  });
  markdownPreview?.addEventListener('input', () => {
    if (getActiveNoteFormat() !== NOTE_FORMAT_MARKDOWN || markdownSourceVisible) return;
    maybeApplyMarkdownBlockShortcut(markdownPreview);
    syncHiddenMarkdownFromActiveView(hiddenInputId);
    updateMarkdownPreviewEmptyState();
  });
  markdownPreview?.addEventListener('keydown', (event) => {
    if (getActiveNoteFormat() !== NOTE_FORMAT_MARKDOWN || markdownSourceVisible) return;
    if (handleMarkdownFormatShortcut(event, hiddenInputId)) return;
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (handleMarkdownPreviewEnter(markdownPreview)) {
      event.preventDefault();
      syncHiddenMarkdownFromActiveView(hiddenInputId);
      updateMarkdownPreviewEmptyState();
    }
  });
  markdownPreview?.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    document.execCommand('insertText', false, text);
  });
  toggleButton?.addEventListener('click', () => {
    if (getActiveNoteFormat() !== NOTE_FORMAT_MARKDOWN) return;
    setMarkdownSourceVisible(!markdownSourceVisible, hiddenInputId);
  });
  getMarkdownFormatControls()?.querySelectorAll('[data-markdown-format]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      applyMarkdownInlineFormat(button.dataset.markdownFormat, hiddenInputId);
    });
  });
}

function updateMarkdownFormatControlsVisibility() {
  const controls = getMarkdownFormatControls();
  if (!controls) return;
  controls.hidden = getActiveNoteFormat() !== NOTE_FORMAT_MARKDOWN || markdownSourceVisible;
}

function updateMarkdownPreviewEmptyState() {
  const preview = getMarkdownPreviewElement();
  if (!preview) return;
  const hasVisualContent = !!preview.querySelector('hr, img, pre, blockquote, ul, ol, h1, h2, h3, h4, h5, h6');
  const empty = !preview.textContent.trim() && !hasVisualContent;
  preview.dataset.empty = empty ? 'true' : 'false';
  if (empty && !preview.innerHTML.trim()) preview.innerHTML = '<p><br></p>';
}

function setMarkdownPreviewContent(markdown) {
  const preview = getMarkdownPreviewElement();
  if (!preview) return;
  preview.innerHTML = renderMarkdown(markdown) || '<p><br></p>';
  updateMarkdownPreviewEmptyState();
}

function markdownFromChildren(node) {
  return Array.from(node.childNodes).map(markdownFromNode).join('');
}

function markdownFromInlineChildren(node) {
  return markdownFromChildren(node).replace(/\n{2,}$/g, '');
}

function isHighlightedElement(node) {
  if (node.tagName?.toLowerCase() === 'mark') return true;
  const style = node.getAttribute?.('style') || '';
  return /background(?:-color)?\s*:\s*(?!transparent|none)/i.test(style);
}

function markdownFromNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '---\n\n';
  if (/^h[1-6]$/.test(tag)) {
    return `${'#'.repeat(Number(tag[1]))} ${markdownFromInlineChildren(node).trim()}\n\n`;
  }
  if (tag === 'p' || tag === 'div') {
    const text = markdownFromInlineChildren(node).trim();
    return text ? `${text}\n\n` : '\n';
  }
  if (tag === 'ul') {
    return `${Array.from(node.children).map((li) => `- ${markdownFromInlineChildren(li).trim()}`).join('\n')}\n\n`;
  }
  if (tag === 'ol') {
    return `${Array.from(node.children).map((li, index) => `${index + 1}. ${markdownFromInlineChildren(li).trim()}`).join('\n')}\n\n`;
  }
  if (tag === 'li') return markdownFromInlineChildren(node);
  if (tag === 'blockquote') {
    return markdownFromChildren(node).trim().split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
  }
  if (tag === 'pre') return `\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`;
  if (tag === 'code') return `\`${node.textContent || ''}\``;
  if (isHighlightedElement(node)) return `==${markdownFromInlineChildren(node)}==`;
  if (tag === 'strong' || tag === 'b') return `**${markdownFromInlineChildren(node)}**`;
  if (tag === 'em' || tag === 'i') return `*${markdownFromInlineChildren(node)}*`;
  if (tag === 'u') return `++${markdownFromInlineChildren(node)}++`;
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${markdownFromInlineChildren(node)}~~`;
  if (tag === 'a') {
    const label = markdownFromInlineChildren(node) || node.getAttribute('href') || '';
    return `[${label}](${node.getAttribute('href') || ''})`;
  }
  return markdownFromChildren(node);
}

function markdownFromPreview() {
  const preview = getMarkdownPreviewElement();
  if (!preview) return '';
  return markdownFromChildren(preview).trim();
}

function syncHiddenMarkdownFromActiveView(hiddenInputId = 'quoteText') {
  const hiddenInput = getElementByIdSafe(hiddenInputId);
  if (!hiddenInput) return;
  hiddenInput.value = markdownSourceVisible
    ? (getMarkdownEditorElement()?.value || '')
    : markdownFromPreview();
}

function setMarkdownSourceVisible(showSource, hiddenInputId = 'quoteText') {
  const markdownEditor = getMarkdownEditorElement();
  const preview = getMarkdownPreviewElement();
  const toggleButton = getMarkdownSourceToggleButton();
  if (!markdownEditor || !preview) return;

  if (showSource) {
    markdownEditor.value = markdownFromPreview();
  } else {
    setMarkdownPreviewContent(markdownEditor.value);
  }

  markdownSourceVisible = showSource;
  markdownEditor.hidden = !showSource;
  preview.hidden = showSource;
  if (toggleButton) toggleButton.textContent = showSource ? 'Preview' : 'Raw Markdown';
  updateMarkdownFormatControlsVisibility();
  syncHiddenMarkdownFromActiveView(hiddenInputId);
}

function focusMarkdownPreview() {
  const preview = getMarkdownPreviewElement();
  preview?.focus();
  return preview;
}

function wrapSelectionWithElement(tagName) {
  const selection = window.getSelection();
  const preview = getMarkdownPreviewElement();
  if (!selection || selection.rangeCount === 0 || !preview?.contains(selection.anchorNode)) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;

  const wrapper = document.createElement(tagName);
  try {
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.addRange(nextRange);
    return true;
  } catch {
    return false;
  }
}

function applyMarkdownInlineFormat(format, hiddenInputId = 'quoteText') {
  if (getActiveNoteFormat() !== NOTE_FORMAT_MARKDOWN || markdownSourceVisible) return;
  focusMarkdownPreview();

  if (format === 'highlight') {
    if (!wrapSelectionWithElement('mark')) {
      document.execCommand('hiliteColor', false, MARKDOWN_HIGHLIGHT_COLOR);
      document.execCommand('backColor', false, MARKDOWN_HIGHLIGHT_COLOR);
    }
  } else {
    const commandByFormat = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      strike: 'strikeThrough',
    };
    const command = commandByFormat[format];
    if (command) document.execCommand(command, false, null);
  }

  syncHiddenMarkdownFromActiveView(hiddenInputId);
  updateMarkdownPreviewEmptyState();
}

function handleMarkdownFormatShortcut(event, hiddenInputId = 'quoteText') {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return false;

  const key = event.key.toLowerCase();
  let format = null;
  if (!event.shiftKey && key === 'b') format = 'bold';
  if (!event.shiftKey && key === 'i') format = 'italic';
  if (!event.shiftKey && key === 'u') format = 'underline';
  if (event.shiftKey && key === 'x') format = 'strike';
  if (event.shiftKey && key === 'h') format = 'highlight';
  if (!format) return false;

  event.preventDefault();
  applyMarkdownInlineFormat(format, hiddenInputId);
  return true;
}

function placeCursorAtEnd(element) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getSelectionBlock(root) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  let node = selection.anchorNode;
  if (!node || !root.contains(node)) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== root) {
    if (/^(p|div|h[1-6]|li)$/i.test(node.tagName || '')) return node;
    node = node.parentElement;
  }
  return null;
}

function findAncestorWithin(node, root, selector) {
  let current = node;
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && current.matches(selector)) return current;
    current = current.parentElement;
  }
  return null;
}

function isVisuallyEmpty(element) {
  return !String(element?.textContent || '').trim();
}

function insertParagraphAfter(node) {
  const paragraph = document.createElement('p');
  paragraph.innerHTML = '<br>';
  node.after(paragraph);
  placeCursorAtEnd(paragraph);
  return paragraph;
}

function handleMarkdownPreviewEnter(root) {
  const block = getSelectionBlock(root);
  if (!block) return false;

  const quote = findAncestorWithin(block, root, 'blockquote');
  if (quote && /^(p|div)$/i.test(block.tagName) && isVisuallyEmpty(block)) {
    block.remove();
    insertParagraphAfter(quote);
    return true;
  }

  if (block.tagName?.toLowerCase() === 'li' && isVisuallyEmpty(block)) {
    const list = block.parentElement;
    block.remove();
    if (list && !list.querySelector('li')) {
      insertParagraphAfter(list);
      list.remove();
      return true;
    }
    insertParagraphAfter(list || block);
    return true;
  }

  return false;
}

function maybeApplyMarkdownBlockShortcut(root) {
  const block = getSelectionBlock(root);
  if (!block || !/^(p|div)$/i.test(block.tagName)) return false;
  const text = block.textContent || '';
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text)) {
    const hr = document.createElement('hr');
    const next = document.createElement('p');
    next.innerHTML = '<br>';
    block.replaceWith(hr, next);
    placeCursorAtEnd(next);
    return true;
  }
  const blockquote = text.match(/^>\s(.*)$/);
  if (blockquote) {
    const quote = document.createElement('blockquote');
    const paragraph = document.createElement('p');
    paragraph.textContent = blockquote[1] || '';
    if (!paragraph.textContent) paragraph.innerHTML = '<br>';
    quote.appendChild(paragraph);
    block.replaceWith(quote);
    placeCursorAtEnd(paragraph);
    return true;
  }
  const unorderedList = text.match(/^[-*+]\s(.*)$/);
  if (unorderedList) {
    const list = document.createElement('ul');
    const item = document.createElement('li');
    item.textContent = unorderedList[1] || '';
    if (!item.textContent) item.innerHTML = '<br>';
    list.appendChild(item);
    block.replaceWith(list);
    placeCursorAtEnd(item);
    return true;
  }
  const orderedList = text.match(/^\d+[.)]\s(.*)$/);
  if (orderedList) {
    const list = document.createElement('ol');
    const item = document.createElement('li');
    item.textContent = orderedList[1] || '';
    if (!item.textContent) item.innerHTML = '<br>';
    list.appendChild(item);
    block.replaceWith(list);
    placeCursorAtEnd(item);
    return true;
  }
  const heading = text.match(/^(#{1,3})\s(.*)$/);
  if (heading) {
    const next = document.createElement(`h${heading[1].length}`);
    next.textContent = heading[2] || '';
    if (!next.textContent) next.innerHTML = '<br>';
    block.replaceWith(next);
    placeCursorAtEnd(next);
    return true;
  }
  return false;
}

export function getActiveNoteFormat() {
  return normalizeNoteFormat(getNoteFormatInput()?.value);
}

export function setModalTextEditorFormat(format, hiddenInputId = 'quoteText') {
  const normalized = normalizeNoteFormat(format);
  const noteFormatInput = getNoteFormatInput();
  const quillHost = document.getElementById('quoteEditor');
  const markdownEditor = getMarkdownEditorElement();
  const markdownPreview = getMarkdownPreviewElement();
  const htmlSourceButton = getHtmlSourceButton();
  const markdownSourceButton = getMarkdownSourceToggleButton();
  const useMarkdown = normalized === NOTE_FORMAT_MARKDOWN;

  if (noteFormatInput) noteFormatInput.value = normalized;
  if (quillHost) {
    quillHost.hidden = useMarkdown;
    setSiblingQuillToolbarHidden(quillHost, useMarkdown);
  }
  if (markdownEditor) markdownEditor.required = false;
  if (markdownPreview) markdownPreview.hidden = !useMarkdown || markdownSourceVisible;
  if (markdownEditor) markdownEditor.hidden = !useMarkdown || !markdownSourceVisible;
  if (htmlSourceButton) {
    htmlSourceButton.style.display = useMarkdown ? 'none' : '';
  }
  if (markdownSourceButton) markdownSourceButton.hidden = !useMarkdown;
  updateMarkdownFormatControlsVisibility();
  wireMarkdownEditor(hiddenInputId);
}

export function setModalEditorText(format, text, quill, hiddenInputId = 'quoteText') {
  const normalized = normalizeNoteFormat(format);
  const hiddenInput = getElementByIdSafe(hiddenInputId);
  const markdownEditor = getMarkdownEditorElement();
  const markdownPreview = getMarkdownPreviewElement();
  setModalTextEditorFormat(normalized, hiddenInputId);

  if (normalized === NOTE_FORMAT_MARKDOWN) {
    markdownSourceVisible = false;
    if (markdownEditor) markdownEditor.value = text || '';
    if (markdownPreview) setMarkdownPreviewContent(text || '');
    setMarkdownSourceVisible(false, hiddenInputId);
    if (hiddenInput) hiddenInput.value = text || '';
    return;
  }

  if (markdownEditor) markdownEditor.value = '';
  if (markdownPreview) {
    markdownPreview.innerHTML = '';
    markdownPreview.hidden = true;
  }
  if (quill) {
    quill.setText('');
    if (text) {
      if (text.includes('<')) {
        quill.clipboard.dangerouslyPasteHTML(text);
      } else {
        quill.setText(text);
      }
    }
    if (hiddenInput) hiddenInput.value = quill.root.innerHTML;
  } else if (hiddenInput) {
    hiddenInput.value = text || '';
  }
}

export function getModalEditorText(hiddenInputId = 'quoteText') {
  const hiddenInput = getElementByIdSafe(hiddenInputId);
  if (document.getElementById('quoteModal')?.classList.contains('modal-properties-only')) {
    return hiddenInput?.value || '';
  }
  if (getActiveNoteFormat() === NOTE_FORMAT_MARKDOWN) {
    return markdownSourceVisible
      ? (getMarkdownEditorElement()?.value || hiddenInput?.value || '')
      : markdownFromPreview();
  }
  return quillEditorInstance?.root?.innerHTML || hiddenInput?.value || '';
}

export function focusActiveEditor() {
  if (getActiveNoteFormat() === NOTE_FORMAT_MARKDOWN) {
    if (markdownSourceVisible) {
      getMarkdownEditorElement()?.focus();
    } else {
      getMarkdownPreviewElement()?.focus();
    }
  } else if (quillEditorInstance) {
    quillEditorInstance.focus();
  }
}

// ============= QUILL EDITOR INITIALIZATION =============

/**
 * Create a Quill editor on any selector (does not replace the modal singleton).
 */
export function createQuillEditor(editorSelector, hiddenInputId = 'quoteText', options = {}) {
  if (!document.querySelector(editorSelector)) {
    console.error(`Quill editor element not found: ${editorSelector}`);
    return null;
  }

  const quill = new Quill(editorSelector, {
    theme: 'snow',
    modules: { toolbar: QUILL_TOOLBAR_CONFIG },
    placeholder: options.placeholder || QUILL_PLACEHOLDER,
  });
  _wireQuillInstance(quill, hiddenInputId, options);
  return quill;
}

/**
 * Initialize Quill rich text editor (modal — stored as singleton)
 */
export function initializeQuillEditor(editorSelector = '#quoteEditor', hiddenInputId = 'quoteText') {
  quillEditorInstance = createQuillEditor(editorSelector, hiddenInputId);
  if (!quillEditorInstance) return null;

  wireMarkdownEditor(hiddenInputId);
  setupFullscreenEditor();
  console.log('✅ Quill editor initialized');
  return quillEditorInstance;
}

/**
 * Get the current Quill editor instance
 * @returns {Object|null} Quill editor instance
 */
export function getQuillEditor() {
  return quillEditorInstance;
}

// ============= FULLSCREEN EDITOR =============

/**
 * Setup fullscreen editor toggle functionality
 */
function setupFullscreenEditor() {
  const toggleBtn = getElementByIdSafe('toggleFullscreenEditor', 'setupFullscreenEditor');
  const editorGroup = document.querySelector('.quote-editor-group');
  
  if (!toggleBtn || !editorGroup) return;
  
  let isFullscreen = false;
  
  toggleBtn.addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    toggleFullscreenMode(isFullscreen, editorGroup, toggleBtn);
  });
  
  // ESC key to exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === KEYBOARD_SHORTCUTS.ESCAPE && isFullscreen) {
      isFullscreen = false;
      toggleFullscreenMode(false, editorGroup, toggleBtn);
    }
    
    // F11 to toggle fullscreen
    if (e.key === KEYBOARD_SHORTCUTS.F11) {
      e.preventDefault();
      isFullscreen = !isFullscreen;
      toggleFullscreenMode(isFullscreen, editorGroup, toggleBtn);
    }
  });
}

/**
 * Toggle fullscreen mode for editor
 * @param {boolean} enable - Enable or disable fullscreen
 * @param {HTMLElement} editorGroup - Editor container element
 * @param {HTMLElement} toggleBtn - Toggle button element
 */
function toggleFullscreenMode(enable, editorGroup, toggleBtn) {
  if (enable) {
    // Enter fullscreen
    editorGroup.classList.add('fullscreen');
    toggleBtn.textContent = '✕';
    toggleBtn.title = 'Exit Fullscreen (Esc)';
    
    // Focus editor
    focusActiveEditor();
  } else {
    // Exit fullscreen
    editorGroup.classList.remove('fullscreen');
    toggleBtn.textContent = '⛶';
    toggleBtn.title = 'Fullscreen Editor (F11)';
  }
}

// ============= DATE PARSING =============

/**
 * Parse Norwegian date format (dd.mm.yyyy) to ISO format (YYYY-MM-DD)
 * @param {string} dateStr - Date string in dd.mm.yyyy format
 * @returns {string|null} ISO date string or null if invalid
 */
function parseNorwegianDate(dateStr) {
  if (!dateStr) return null;
  
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    const [_, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

// ============= FORM DATA COLLECTION =============

/**
 * Read the group input that is actually visible for the given note type.
 * Three separate inputs exist (quote/training/generic); all three get
 * pre-filled when the modal opens, so falling back via || would return a
 * stale value from a hidden input whenever the user clears the visible one.
 * Pick exactly one input based on behavior + note type.
 */
function _readGroupInput(noteType) {
  const behavior = getNoteTypeConfig(noteType)?.behavior;
  let inputId;
  if (behavior === 'generic') {
    inputId = 'genericTranslationGroup';
  } else if (noteType === 'training' || behavior === 'training') {
    inputId = MODAL_IDS.TRANSLATION_GROUP_INPUT; // 'translationGroup' — training form
  } else {
    inputId = 'quoteTranslationGroup'; // quote / tegneserie / ... default
  }
  const raw = getElementValue(inputId) || '';
  return raw.trim() || null;
}

/**
 * Collect form data for quote submission
 * @param {Object} state - Current application state
 * @returns {Object} Form data object
 */
export function collectFormData(state) {
  const noteType = getElementValue(MODAL_IDS.NOTE_TYPE_SELECT);
  
  // Parse note_date for training notes
  let parsedNoteDate = null;
  if (noteType === 'training') {
    const noteDateInput = getElementValue(MODAL_IDS.NOTE_DATE_INPUT);
    parsedNoteDate = parseNorwegianDate(noteDateInput);
  }
  
  return {
    note_text: getModalEditorText(MODAL_IDS.QUOTE_TEXT),
    note_format: getActiveNoteFormat(),
    note_title: (document.getElementById('noteTitle')?.value?.trim() || null),
    author: getElementValue(MODAL_IDS.AUTHOR_INPUT),
    source: getElementValue(MODAL_IDS.SOURCE_INPUT),
    sourceType: noteType === 'training' 
      ? getElementValue(MODAL_IDS.TRAINING_TYPE_SELECT)
      : (hasGenericSubTypeField(noteType)
          ? getElementValue('genericSubType')
          : (getElementValue(MODAL_IDS.SOURCE_TYPE_SELECT) || "ASSORTED")),
    sourceId: window.currentSourceId || null,
    tags: getElementValue(MODAL_IDS.TAG_INPUT),
    comment: getElementValue(MODAL_IDS.COMMENT_INPUT),
    score: document.querySelector('input[name="quoteScore"]:checked')?.value || "0",
    thumbnail: state.currentQuoteImage,
    attachment_full: state.currentQuoteImageFull,
    attachment_type: state.currentAttachmentType,
    note_type: noteType,
    note_date: parsedNoteDate,
    translation_group: _readGroupInput(noteType),
    storageThresholdMB: state.globalSettings?.externalStorageThreshold || 1,
  };
}

// ============= FORM SUBMISSION =============

/**
 * Handle form submission (create or update quote)
 * @param {Event} e - Submit event
 * @param {Object} config - Configuration object with state and callbacks
 * @returns {Promise<void>}
 */
export async function handleFormSubmit(e, config) {
  e.preventDefault();

  const { apiUrl, state, callbacks } = config;
  const quoteData = collectFormData(state);

  // Validate training type is selected
  if (quoteData.note_type === 'training' && !quoteData.sourceType) {
    const select = document.getElementById('trainingType');
    if (select) {
      select.style.outline = '2px solid #e74c3c';
      select.style.borderColor = '#e74c3c';
      setTimeout(() => {
        select.style.outline = '';
        select.style.borderColor = '';
      }, 3000);
    }
    alert('⚠️ Please select a Training Type before saving.');
    return;
  }

  // Validate generic sub-type is selected when sub-types are configured for this type
  if (hasGenericSubTypeField(quoteData.note_type) && !quoteData.sourceType) {
    const select = document.getElementById('genericSubType');
    if (select) {
      select.style.outline = '2px solid #e74c3c';
      select.style.borderColor = '#e74c3c';
      setTimeout(() => {
        select.style.outline = '';
        select.style.borderColor = '';
      }, 3000);
    }
    alert('⚠️ Please select a Type before saving.');
    return;
  }

  console.log("Submitting quote data:", quoteData);

  try {
    let response;
    if (state.editingQuoteId) {
      response = await fetch(`${apiUrl}/quotes/${state.editingQuoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteData),
      });
    } else {
      response = await fetch(`${apiUrl}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteData),
      });
    }

    if (response.ok) {
      if (callbacks.onSuccess) {
        const savedNote = await response.json().catch(() => null);
        callbacks.onSuccess(savedNote);
      }
    } else {
      const errorData = await response.json();
      const errorMsg = errorData.error || "Please try again.";
      if (callbacks.onError) {
        callbacks.onError(errorMsg);
      } else {
        alert("Failed to save note: " + errorMsg);
      }
    }
  } catch (error) {
    console.error("Error saving note:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message);
    } else {
      alert("Failed to save note. Please try again.");
    }
  }
}

// ============= QUOTE DELETION =============

/**
 * Delete a quote with confirmation
 * @param {number} id - Quote ID
 * @param {string} apiUrl - API URL
 * @param {Object} callbacks - Success/error callbacks
 * @returns {Promise<void>}
 */
export async function deleteQuote(id, apiUrl, callbacks) {
  if (!await showConfirm("Delete this note? This cannot be undone.", { danger: true, title: "Delete note" })) {
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/quotes/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      if (callbacks.onSuccess) {
        callbacks.onSuccess();
      }
    } else {
      const errorMsg = "Failed to delete note";
      if (callbacks.onError) {
        callbacks.onError(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  } catch (error) {
    console.error("Error deleting note:", error);
    if (callbacks.onError) {
      callbacks.onError(error.message);
    } else {
      alert("Failed to delete note. Please try again.");
    }
  }
}

// ============= MODAL LIFECYCLE =============

/**
 * Close modal and reset state
 * @param {Object} elements - DOM elements to reset
 * @param {Function} resetStateCallback - Callback to reset app state
 */
export function closeModal(elements, resetStateCallback) {
  if (elements.modal) {
    elements.modal.style.display = "none";
  }
  
  if (elements.form) {
    elements.form.reset();
  }
  
  if (quillEditorInstance) {
    quillEditorInstance.setText('');
  }
  
  // Reset autocomplete suggestions
  if (elements.authorSuggestions) {
    elements.authorSuggestions.classList.remove("show");
  }
  if (elements.sourceSuggestions) {
    elements.sourceSuggestions.classList.remove("show");
  }
  
  // Reset app state via callback
  if (resetStateCallback) {
    resetStateCallback();
  }
}

// ============= INITIALIZATION =============

/**
 * Initialize quote editor with all event listeners
 * @param {Object} config - Configuration object
 * @returns {Object} Editor instance and cleanup function
 */
export function initializeQuoteEditor(config) {
  const {
    editorSelector,
    hiddenInputId,
    formElement,
    apiUrl,
    state,
    callbacks
  } = config;
  
  // Initialize Quill editor
  const editor = initializeQuillEditor(editorSelector, hiddenInputId);
  
  // Setup form submission
  if (formElement) {
    const submitHandler = (e) => handleFormSubmit(e, { apiUrl, state, callbacks });
    formElement.addEventListener('submit', submitHandler);
    
    // Return cleanup function
    return {
      editor,
      cleanup: () => {
        formElement.removeEventListener('submit', submitHandler);
      }
    };
  }
  
  return { editor, cleanup: () => {} };
}
