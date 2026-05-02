// ============================================================
// htmlSourceViewer.js — show / edit raw HTML of the Quill editor.
// ============================================================
//
// The note-edit modal has a "📄 HTML" toggle button that lets the user
// inspect (and paste) the raw HTML behind the rich-text editor.  The two
// handlers are exposed on `window` because the buttons in index.html use
// inline `onclick="toggleHtmlSource()" / onclick="applyHtmlSource()"`.
//
// Usage:
//   import { initHtmlSourceViewer } from './js/lib/htmlSourceViewer.js?v=20260502a';
//   initHtmlSourceViewer({ getQuillEditor: () => quillEditor });
//
// The `getQuillEditor` callback is read every time the user toggles the
// panel so the module never holds a stale reference (the Quill instance
// is created lazily in app.js).

let _getQuillEditor = () => null;

/**
 * Wire the two `window` handlers so inline `onclick` attributes in
 * index.html keep working.  Call once on page load.
 */
export function initHtmlSourceViewer({ getQuillEditor }) {
  if (typeof getQuillEditor === 'function') {
    _getQuillEditor = getQuillEditor;
  }
  window.toggleHtmlSource = toggleHtmlSource;
  window.applyHtmlSource  = applyHtmlSource;
}

function toggleHtmlSource() {
  const panel = document.getElementById('htmlSourcePanel');
  const area  = document.getElementById('htmlSourceArea');
  if (!panel || !area) return;
  if (panel.style.display === 'none') {
    const hidden = document.getElementById('quoteText');
    const quill  = _getQuillEditor();
    area.value = hidden ? hidden.value : (quill?.root?.innerHTML || '');
    panel.style.display = 'block';
    document.getElementById('viewHtmlBtn').textContent = '📄 Hide HTML';
  } else {
    panel.style.display = 'none';
    document.getElementById('viewHtmlBtn').textContent = '📄 HTML';
  }
}

function applyHtmlSource() {
  const area  = document.getElementById('htmlSourceArea');
  const quill = _getQuillEditor();
  if (!area || !quill) return;
  quill.clipboard.dangerouslyPasteHTML(area.value);
  document.getElementById('htmlSourcePanel').style.display = 'none';
  document.getElementById('viewHtmlBtn').textContent = '📄 HTML';
}
