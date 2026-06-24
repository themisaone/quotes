/**
 * Data Manager - Export and Import functionality
 * Handles PDF export, JSON backup export, and JSON import
 * 
 * Architecture:
 * - Filter builders: Build URL params and filter objects
 * - UI helpers: Manage button states and status messages
 * - Export functions: PDF and JSON exports
 * - Import function: JSON import with validation
 */

import { API_URL } from './api.js';
import { getNoteTypeConfig } from './noteTypes.js';
import { buildExportParams } from './displayManager.js';
import { getSearchValues } from './searchManager.js';
import { showConfirm } from './confirmDialog.js';

// ============= CONSTANTS =============

const EXPORT_LIMIT = 10000; // Max items for PDF export
const IMPORT_SUCCESS_DELAY = 3000; // Delay before page reload after import

// ============= FILTER BUILDERS =============

/**
 * Add search filters to URL params
 */
function addSearchFilters(params, searchFields) {
  if (searchFields.quote) params.append("quote", searchFields.quote);
  if (searchFields.author) params.append("author", searchFields.author);
  if (searchFields.source) params.append("source", searchFields.source);
  if (searchFields.tags) params.append("tags", searchFields.tags);
  if (searchFields.score) params.append("score", searchFields.score);
}

/**
 * Add type-specific filters to URL params
 */
function addTypeFilters(params, currentNoteTypeFilter, selectedTypes, selectedTrainingTypes, getQuoteTypes) {
  // Add note type filter
  if (currentNoteTypeFilter) {
    params.append("note_type", currentNoteTypeFilter);
  }

  // Add quote type filter (for quotes view)
  if (currentNoteTypeFilter !== 'training' && selectedTypes.length > 0) {
    const quoteTypes = getQuoteTypes();
    const totalTypes = quoteTypes.length;
    
    // Only add types filter if not all types are selected (optimization)
    if (selectedTypes.length < totalTypes) {
      params.append("types", selectedTypes.join(","));
    }
  }
  
  // Add training types filter (for training view)
  if (currentNoteTypeFilter === 'training' && selectedTrainingTypes.length > 0) {
    params.append("training_types", selectedTrainingTypes.join(","));
  }
}

/**
 * Build filter parameters for export/search
 * @param {Object} searchFields - Search input values
 * @param {string} currentNoteTypeFilter - Current note type filter
 * @param {Array} selectedTypes - Selected quote types (for quotes view)
 * @param {Array} selectedTrainingTypes - Selected training types (for training view)
 * @param {Function} getQuoteTypes - Function to get quote types from settings
 * @returns {URLSearchParams}
 */
function buildFilterParams(searchFields, currentNoteTypeFilter, selectedTypes, selectedTrainingTypes, getQuoteTypes) {
  const params = new URLSearchParams();
  addSearchFilters(params, searchFields);
  addTypeFilters(params, currentNoteTypeFilter, selectedTypes, selectedTrainingTypes, getQuoteTypes);
  return params;
}

/**
 * Build filters object for PDF display
 * @param {Object} searchFields - Search input values
 * @param {string} currentNoteTypeFilter - Current note type filter
 * @returns {Object}
 */
function buildFiltersObject(currentNoteTypeFilter) {
  const filters = {};
  
  if (currentNoteTypeFilter) {
    const typeLabel = getNoteTypeConfig(currentNoteTypeFilter)?.label || 'Notes';
    filters.noteType = typeLabel;
    filters.noteTypeValue = currentNoteTypeFilter;
  }

  const s = getSearchValues();
  if (s.quote)  filters.quote  = s.quote;
  if (s.author) filters.author = s.author;
  if (s.source) filters.source = s.source;
  if (s.tags)   filters.tags   = s.tags;
  if (s.score)  filters.score  = s.score;

  return filters;
}

// ============= UI HELPERS =============

/**
 * Get the label for current note type
 */
function getTypeLabel(currentNoteTypeFilter) {
  return currentNoteTypeFilter 
    ? getNoteTypeConfig(currentNoteTypeFilter)?.label || 'Notes' 
    : 'All Notes';
}

/**
 * Set button loading state
 */
function setButtonLoading(button, loadingText) {
  const originalText = button.textContent;
  button.textContent = loadingText;
  button.disabled = true;
  return originalText;
}

/**
 * Reset button to original state
 */
function resetButton(button, originalText) {
  button.textContent = originalText;
  button.disabled = false;
}

/**
 * Generate confirmation message for JSON backup
 */
function generateBackupConfirmationMessage(currentNoteTypeFilter, typeLabel) {
  if (currentNoteTypeFilter) {
    return `Create backup of ${typeLabel}?\n\n` +
           `This will export ALL ${typeLabel.toLowerCase()} (ignoring current search filters).\n\n` +
           `To export only filtered results, use "Export to PDF" instead.`;
  }
  
  return `Create backup of All Notes?\n\n` +
         `This will export your entire database:\n` +
         `• All note types\n` +
         `• All authors and sources\n` +
         `• All tags\n\n` +
         `This may create a large file if you have many notes with images.`;
}

/**
 * Generate confirmation message for import
 */
function getImportCounts(backupData) {
  if (backupData?.counts) return backupData.counts;
  const d = backupData?.data || {};
  return {
    quotes: Array.isArray(d.quotes) ? d.quotes.length : 0,
    authors: Array.isArray(d.authors) ? d.authors.length : 0,
    sources: Array.isArray(d.sources) ? d.sources.length : 0,
    tags: Array.isArray(d.tags) ? d.tags.length : 0,
  };
}

function generateImportConfirmationMessage(backupData) {
  const counts = getImportCounts(backupData);
  return `About to import:\n\n` +
         `• ${counts.quotes} quotes/notes\n` +
         `• ${counts.authors} authors\n` +
         `• ${counts.sources} sources\n` +
         `• ${counts.tags} tags\n\n` +
         `Duplicates will be automatically skipped.\n\n` +
         `This may take a while. Continue?`;
}

function formatImportErrorMessage(error) {
  const msg = error?.message || String(error);
  if (/failed to fetch|networkerror|network error|load failed/i.test(msg)) {
    return 'Lost connection to the server during import. '
      + 'This is not caused by the import dialog — the server stopped responding '
      + '(crashed, was stopped via Services, or timed out on a very large file). '
      + 'Check that the app is still running on the server, then try again.';
  }
  return msg;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate success HTML for import results
 */
function generateImportSuccessHtml(result) {
  const stats = result.stats || result;
  const noteTypesAdded = Array.isArray(result.noteTypesAdded) ? result.noteTypesAdded : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  return `
    <div class="import-status-panel import-status-panel--success">
      <h4>✅ Import Completed!</h4>
      <div style="display: grid; gap: 8px;">
        <p style="margin: 0;"><strong>📚 Quotes/Notes:</strong> ${stats.quotes.created} imported, ${stats.quotes.skipped} skipped (duplicates)</p>
        <p style="margin: 0;"><strong>👤 Authors:</strong> ${stats.authors.created} imported, ${stats.authors.skipped} skipped (duplicates)</p>
        <p style="margin: 0;"><strong>📖 Sources:</strong> ${stats.sources.created} imported, ${stats.sources.skipped} skipped (duplicates)</p>
        <p style="margin: 0;"><strong>🏷️ Tags:</strong> ${stats.tags.created} imported</p>
        ${noteTypesAdded.length > 0 ? `<p style="margin: 0;"><strong>📌 Note types:</strong> ${noteTypesAdded.map(escapeHtml).join(', ')} added to settings</p>` : ""}
      </div>
      ${warnings.length > 0 ? `
        <details class="import-status-errors" style="margin-top: 12px; color: #f59e0b;">
          <summary style="cursor: pointer;"><strong>⚠️ ${warnings.length} warning(s)</strong> — expand for details</summary>
          <pre style="max-height: 160px; overflow: auto; font-size: 11px; background: rgba(245, 158, 11, 0.12); color: var(--text-primary); padding: 8px; border-radius: 6px; margin-top: 8px;">${warnings.map(w => escapeHtml(w)).join('\n')}</pre>
        </details>` : ""}
      ${stats.errors.length > 0 ? `
        <details class="import-status-errors" style="margin-top: 12px; color: #f87171;">
          <summary style="cursor: pointer;"><strong>⚠️ ${stats.errors.length} row-level error(s)</strong> — expand for details</summary>
          <pre style="max-height: 220px; overflow: auto; font-size: 11px; background: rgba(239, 68, 68, 0.12); color: var(--text-primary); padding: 8px; border-radius: 6px; margin-top: 8px;">${stats.errors.slice(0, 80).map(e => String(e).replace(/</g, '&lt;')).join('\n')}${stats.errors.length > 80 ? '\n… ' + (stats.errors.length - 80) + ' more' : ''}</pre>
        </details>` : ""}
    </div>
  `;
}

/**
 * Generate error HTML for import failure
 */
function generateImportErrorHtml(errorMessage) {
  return `
    <div class="import-status-panel import-status-panel--error">
      <h4>❌ Import Failed</h4>
      <p>${escapeHtml(formatImportErrorMessage({ message: errorMessage }))}</p>
    </div>
  `;
}

// ============= FILE OPERATIONS =============

/**
 * Download a blob as a file
 */
function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

/**
 * Generate filename with date suffix
 */
function generateFilename(prefix, extension) {
  const date = new Date().toISOString().split("T")[0];
  return `${prefix}_${date}.${extension}`;
}

/**
 * Validate JSON import file structure (export / backup format)
 */
function validateBackupData(backupData) {
  if (!backupData.data || 
      !backupData.data.authors || 
      !backupData.data.sources || 
      !backupData.data.quotes) {
    throw new Error('Invalid import file format. Expected JSON with authors, sources, and notes.');
  }
}

// ============= EXPORT FUNCTIONS =============

/**
 * Fetch quotes for export
 */
async function fetchQuotesForExport(params) {
  params.append("limit", String(EXPORT_LIMIT));
  const response = await fetch(`${API_URL}/quotes?${params.toString()}`);
  return await response.json();
}

/**
 * Filename prefix from exported notes (handles mixed selections).
 */
function getPdfFilenamePrefix(currentNoteTypeFilter, quotes) {
  if (Array.isArray(quotes) && quotes.length > 0) {
    const types = [...new Set(quotes.map(n => n && n.note_type).filter(Boolean))];
    if (types.length === 1) return types[0];
    if (types.length > 1) return 'mixed_notes';
  }
  return currentNoteTypeFilter || 'all_notes';
}

/**
 * Generate PDF from quotes
 */
async function generatePdf(quotes, filters, pdfColumns = 1) {
  const response = await fetch(`${API_URL}/export/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quotes: quotes,
      filters: filters,
      pdfColumns: pdfColumns === 2 ? 2 : 1,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to generate PDF");
  }

  const blob = await response.blob();
  return new Blob([blob], { type: "application/pdf" });
}

/**
 * Export current view to PDF
 * @param {Object} config - Configuration object
 * @param {Object} config.searchFields - { quote, author, source, tags, score }
 * @param {string} config.currentNoteTypeFilter - Current note type
 * @param {Array} config.selectedTypes - Selected quote types
 * @param {Array} config.selectedTrainingTypes - Selected training types
 * @param {HTMLElement} config.exportBtn - Export button element
 * @param {Function} config.getQuoteTypes - Get quote types from settings
 * @param {Array} [config.notes] - Optional pre-fetched notes array. When
 *     provided, the filter-based fetch is skipped and only these notes are
 *     exported (used when the user has an active selection).
 * @param {number} [config.pdfColumns=1] - PDF layout: 1 or 2 columns.
 */
export async function exportToPdf(config) {
  const {
    currentNoteTypeFilter,
    exportBtn,
    getQuoteTypes,
    getTrainingTypes,
    notes: preFetchedNotes,
    pdfColumns = 1,
  } = config;

  try {
    const typeLabel = getTypeLabel(currentNoteTypeFilter);
    const originalText = exportBtn ? setButtonLoading(exportBtn, "⏳ Generating PDF...") : null;

    let allQuotes;
    if (Array.isArray(preFetchedNotes)) {
      // Select-Action-Bar path: caller already resolved the exact set of
      // notes to export (explicit picks, or all-filtered-minus-excluded).
      allQuotes = preFetchedNotes;
    } else {
      // Default path: export everything matching the current view's filters
      // (search text, type, training year/month, metadata filters, etc.)
      const params = buildExportParams(
        currentNoteTypeFilter,
        getQuoteTypes,
        getTrainingTypes
      );
      allQuotes = await fetchQuotesForExport(params);
    }

    console.log(`Exporting ${allQuotes.length} ${typeLabel.toLowerCase()} to PDF...`);

    if (allQuotes.length === 0) {
      alert(`No ${typeLabel.toLowerCase()} to export!`);
      if (exportBtn) resetButton(exportBtn, originalText);
      return;
    }

    // Generate and download PDF
    const filters = buildFiltersObject(currentNoteTypeFilter);
    const pdfBlob = await generatePdf(allQuotes, filters, pdfColumns);
    
    const filePrefix = getPdfFilenamePrefix(currentNoteTypeFilter, allQuotes);
    const filename = generateFilename(filePrefix, 'pdf');
    downloadBlob(pdfBlob, filename);

    if (exportBtn) resetButton(exportBtn, originalText);
  } catch (error) {
    console.error("Error exporting PDF:", error);
    alert("Failed to export PDF. Please try again.");
    if (exportBtn) {
      exportBtn.textContent = "📄 Export to PDF";
      exportBtn.disabled = false;
    }
  }
}

/**
 * Fetch JSON backup from server
 */
async function fetchJsonBackup(currentNoteTypeFilter) {
  const params = new URLSearchParams();
  if (currentNoteTypeFilter) {
    params.set('note_type', currentNoteTypeFilter);
  }
  const q = params.toString();
  const url = `${API_URL}/export/json${q ? `?${q}` : ''}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to export data");
  }

  return await response.blob();
}

/**
 * Fetch the big-files report generated during the last export.
 * Returns a Blob (text/plain) if there were big files, or null if none.
 */
async function fetchBigFilesReport() {
  const response = await fetch(`${API_URL}/export/big-files-report`);
  if (response.status === 204) return null; // no big files
  if (!response.ok) return null;
  return await response.blob();
}

/**
 * Fetch info about big files from the last export (count + totalMB).
 */
async function fetchBigFilesInfo() {
  const response = await fetch(`${API_URL}/export/big-files-info`);
  if (!response.ok) return { count: 0, totalMB: 0 };
  return await response.json();
}

/**
 * Stream the ZIP of large attachments from the last export.
 * Uses a hidden <a> to trigger the browser download so we don't buffer it in JS.
 */
function triggerBigFilesZipDownload(date) {
  const a = document.createElement('a');
  a.href = `${API_URL}/export/big-files-zip`;
  a.download = `big_files_${date}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export to JSON (backup data)
 * @param {Object} config - Configuration object
 * @param {string} config.currentNoteTypeFilter - Current note type (null for all)
 * @param {HTMLElement} config.exportBtn - Export button element
 */
export async function exportToJson(config) {
  const { currentNoteTypeFilter, exportBtn } = config;

  try {
    const typeLabel = getTypeLabel(currentNoteTypeFilter);
    
    // Show confirmation dialog
    const message = generateBackupConfirmationMessage(currentNoteTypeFilter, typeLabel);
    if (!await showConfirm(message, { icon: '📤', title: 'Export notes', confirmLabel: 'Export' })) {
      return;
    }

    const originalText = setButtonLoading(exportBtn, "⏳ Exporting...");

    // Fetch and download backup JSON
    const blob = await fetchJsonBackup(currentNoteTypeFilter);
    const filePrefix = currentNoteTypeFilter || 'all_notes';
    const dateSuffix = new Date().toISOString().split('T')[0];
    const filename = generateFilename(`${filePrefix}_backup`, 'json');
    downloadBlob(blob, filename);

    resetButton(exportBtn, originalText);

    // Check if there are big files that weren't embedded
    const info = await fetchBigFilesInfo();
    if (info.count === 0) {
      alert(`✅ ${typeLabel} backup created. All attachments are embedded — fully self-contained!`);
      return;
    }

    // Ask the user whether to also download the large attachments as a ZIP
    const doZip = await showConfirm(
      `✅ JSON backup saved.\n\n` +
      `⚠️ ${info.count} attachment file(s) (${info.totalMB} MB total) were kept as vault file references and were not embedded in the JSON.\n\n` +
      `Download them now as a ZIP archive to create a complete backup?\n` +
      `(This may take a while for large collections.)`,
      { icon: '📦', title: 'Download large attachments?', confirmLabel: 'Download ZIP', cancelLabel: 'Skip (JSON only)' }
    );

    if (doZip) {
      // Stream ZIP via a direct browser download (avoids buffering GBs in JS memory)
      triggerBigFilesZipDownload(dateSuffix);
      alert(`📦 ZIP download started — it may take a few minutes.\n\nJSON + ZIP together form a complete backup.`);
    } else {
      // Just download the text report so they know which files need separate backup
      const reportBlob = await fetchBigFilesReport();
      if (reportBlob) {
        await new Promise(r => setTimeout(r, 300));
        downloadBlob(reportBlob, `big_files_${dateSuffix}.txt`);
      }
      alert(`✅ ${typeLabel} backup created.\n\n⚠️ "big_files_${dateSuffix}.txt" lists the ${info.count} large file(s) not in the JSON.\nMake sure your vault folder is also backed up separately.`);
    }
  } catch (error) {
    console.error("Error exporting JSON:", error);
    alert("Failed to create backup. Please try again.");
    exportBtn.textContent = "💾 Backup Data";
    exportBtn.disabled = false;
  }
}

/**
 * Remove authors, sources, and tags that have no linked notes (server-side bulk delete).
 */
export async function pruneUnusedEntitiesRequest() {
  const url = `${API_URL}/maintenance/prune-unused-entities`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "Prune API not found (404). Restart the backend (e.g. stop and run `npm start` again) so it loads the latest server code.",
      );
    }
    throw new Error(data.error || `Prune failed (${response.status})`);
  }
  return data;
}

/**
 * Inspect or apply attachment file moves so paths match each note's current type.
 */
export async function rehomeAttachmentsRequest({ dryRun = true } = {}) {
  const url = `${API_URL}/maintenance/rehome-attachments`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Attachment folder maintenance failed (${response.status})`);
  }
  return data;
}

/**
 * Read-only vault health report: compares active settings, modes, and DB note types.
 */
export async function vaultHealthCheckRequest() {
  const url = `${API_URL}/maintenance/health`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Vault health check failed (${response.status})`);
  }
  return data;
}

// ============= IMPORT FUNCTION =============

const IMPORT_FILE_BTN_LABEL = 'Select Import File';

/**
 * Clear import modal UI (call when opening the dialog)
 */
export function resetImportModal(config) {
  const { importProgress, importStatus, selectFileBtn, importFileInput } = config;
  if (importProgress) importProgress.style.display = 'none';
  if (importStatus) importStatus.innerHTML = '';
  if (selectFileBtn) {
    selectFileBtn.textContent = IMPORT_FILE_BTN_LABEL;
    selectFileBtn.disabled = false;
  }
  if (importFileInput) importFileInput.value = '';
}

/**
 * Send import data to server
 */
async function sendImportToServer(backupData) {
  let response;
  try {
    response = await fetch(`${API_URL}/import/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: backupData.data,
      }),
    });
  } catch (err) {
    throw new Error(formatImportErrorMessage(err));
  }

  let result = {};
  try {
    result = await response.json();
  } catch (_) {
    if (!response.ok) {
      throw new Error(`Server error (${response.status} ${response.statusText})`);
    }
    throw new Error('Invalid response from server');
  }

  if (!response.ok) {
    throw new Error(result.error || result.details || `Import failed (${response.status})`);
  }

  return result;
}

/**
 * Handle successful import
 */
function handleImportSuccess(result, importStatus, selectFileBtn, importModal, onImportComplete) {
  importStatus.innerHTML = generateImportSuccessHtml(result);
  selectFileBtn.textContent = IMPORT_FILE_BTN_LABEL;
  selectFileBtn.disabled = false;

  const errN = result.stats?.errors?.length || 0;
  if (errN > 0) {
    // Leave the modal open so the expandable error list stays readable; no auto-reload.
    const reloadBtn = document.createElement("button");
    reloadBtn.type = "button";
    reloadBtn.className = "btn-primary";
    reloadBtn.style.marginTop = "12px";
    reloadBtn.textContent = "Reload page";
    reloadBtn.addEventListener("click", () => {
      importModal.style.display = "none";
      if (onImportComplete) onImportComplete();
      location.reload();
    });
    importStatus.appendChild(reloadBtn);
    return;
  }

  // Reload data after delay (happy path)
  setTimeout(() => {
    importModal.style.display = "none";
    if (onImportComplete) {
      onImportComplete();
    }
    alert("✅ Import completed successfully! Page will refresh.");
    location.reload();
  }, IMPORT_SUCCESS_DELAY);
}

/**
 * Handle import error
 */
function handleImportError(error, importStatus, selectFileBtn) {
  console.error("Error importing JSON:", error);
  importStatus.innerHTML = generateImportErrorHtml(error.message);
  selectFileBtn.textContent = IMPORT_FILE_BTN_LABEL;
  selectFileBtn.disabled = false;
}

/**
 * Reset file input and button
 */
function resetFileInput(event, selectFileBtn) {
  selectFileBtn.textContent = IMPORT_FILE_BTN_LABEL;
  selectFileBtn.disabled = false;
  event.target.value = "";
}

/**
 * Handle import file selection and processing
 * @param {Event} event - File input change event
 * @param {Object} config - Configuration object
 * @param {HTMLElement} config.importProgress - Progress container element
 * @param {HTMLElement} config.importStatus - Status message element
 * @param {HTMLElement} config.selectFileBtn - Select file button
 * @param {HTMLElement} config.importModal - Import modal element
 * @param {Function} config.onImportComplete - Callback when import completes
 */
export async function handleImportFile(event, config) {
  const {
    importProgress,
    importStatus,
    selectFileBtn,
    importModal,
    onImportComplete,
  } = config;

  const file = event.target.files[0];
  if (!file) return;

  try {
    // Read and parse file
    setButtonLoading(selectFileBtn, "⏳ Reading file...");
    const text = await file.text();
    const backupData = JSON.parse(text);

    // Validate structure
    validateBackupData(backupData);

    // Show confirmation
    const message = generateImportConfirmationMessage(backupData);
    
    if (!await showConfirm(message, { icon: '📥', title: 'Import notes', confirmLabel: 'Import' })) {
      resetFileInput(event, selectFileBtn);
      return;
    }

    // Show progress
    importProgress.style.display = "block";
    importStatus.innerHTML = "<p>⏳ Importing data...</p>";
    selectFileBtn.textContent = "⏳ Importing...";

    // Send to server and handle result
    const result = await sendImportToServer(backupData);
    handleImportSuccess(result, importStatus, selectFileBtn, importModal, onImportComplete);
    event.target.value = "";
  } catch (error) {
    if (importProgress) importProgress.style.display = 'block';
    handleImportError(error, importStatus, selectFileBtn);
    event.target.value = "";
  }
}
