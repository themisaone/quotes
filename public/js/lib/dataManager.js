/**
 * Data Manager - Export and Import functionality
 * Handles PDF export, JSON backup, and data restoration
 * 
 * Architecture:
 * - Filter builders: Build URL params and filter objects
 * - UI helpers: Manage button states and status messages
 * - Export functions: PDF and JSON exports
 * - Import function: JSON import with validation
 */

import { API_URL } from './api.js';
import { NOTE_TYPES } from './noteTypes.js';

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
function buildFiltersObject(searchFields, currentNoteTypeFilter) {
  const filters = {};
  
  if (currentNoteTypeFilter) {
    const typeLabel = NOTE_TYPES[currentNoteTypeFilter]?.label || 'Notes';
    filters.noteType = typeLabel;
  }
  
  if (searchFields.quote) filters.quote = searchFields.quote;
  if (searchFields.author) filters.author = searchFields.author;
  if (searchFields.source) filters.source = searchFields.source;
  if (searchFields.tags) filters.tags = searchFields.tags;
  if (searchFields.score) filters.score = searchFields.score;

  return filters;
}

// ============= UI HELPERS =============

/**
 * Get the label for current note type
 */
function getTypeLabel(currentNoteTypeFilter) {
  return currentNoteTypeFilter 
    ? NOTE_TYPES[currentNoteTypeFilter]?.label || 'Notes' 
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
function generateImportConfirmationMessage(backupData) {
  return `About to import:\n\n` +
         `• ${backupData.counts.quotes} quotes/notes\n` +
         `• ${backupData.counts.authors} authors\n` +
         `• ${backupData.counts.sources} sources\n` +
         `• ${backupData.counts.tags} tags\n\n` +
         `Duplicates will be automatically skipped.\n\n` +
         `This may take a while. Continue?`;
}

/**
 * Generate success HTML for import results
 */
function generateImportSuccessHtml(stats) {
  return `
    <div style="background: #d1fae5; padding: 15px; border-radius: 8px; margin-top: 10px;">
      <h4 style="margin-top: 0; color: #065f46;">✅ Import Completed!</h4>
      <div style="display: grid; gap: 8px;">
        <p style="margin: 0;"><strong>📚 Quotes/Notes:</strong> ${stats.quotes.created} imported, ${stats.quotes.skipped} skipped (duplicates)</p>
        <p style="margin: 0;"><strong>👤 Authors:</strong> ${stats.authors.created} imported, ${stats.authors.skipped} skipped (duplicates)</p>
        <p style="margin: 0;"><strong>📖 Sources:</strong> ${stats.sources.created} imported, ${stats.sources.skipped} skipped (duplicates)</p>
        <p style="margin: 0;"><strong>🏷️ Tags:</strong> ${stats.tags.created} imported</p>
      </div>
      ${stats.errors.length > 0 ? `<p style="color: #dc2626; margin-top: 12px; margin-bottom: 0;"><strong>⚠️ Errors:</strong> ${stats.errors.length} (check console)</p>` : ""}
    </div>
  `;
}

/**
 * Generate error HTML for import failure
 */
function generateImportErrorHtml(errorMessage) {
  return `
    <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin-top: 10px;">
      <h4 style="margin-top: 0; color: #991b1b;">❌ Import Failed</h4>
      <p>${errorMessage}</p>
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
 * Validate backup file structure
 */
function validateBackupData(backupData) {
  if (!backupData.data || 
      !backupData.data.authors || 
      !backupData.data.sources || 
      !backupData.data.quotes) {
    throw new Error("Invalid backup file format");
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
 * Generate PDF from quotes
 */
async function generatePdf(quotes, filters) {
  const response = await fetch(`${API_URL}/export/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quotes: quotes,
      filters: filters,
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
 */
export async function exportToPdf(config) {
  const {
    searchFields,
    currentNoteTypeFilter,
    selectedTypes,
    selectedTrainingTypes,
    exportBtn,
    getQuoteTypes,
  } = config;

  try {
    const typeLabel = getTypeLabel(currentNoteTypeFilter);
    const originalText = setButtonLoading(exportBtn, "⏳ Generating PDF...");

    // Build filter parameters and fetch quotes
    const params = buildFilterParams(
      searchFields,
      currentNoteTypeFilter,
      selectedTypes,
      selectedTrainingTypes,
      getQuoteTypes
    );

    const allQuotes = await fetchQuotesForExport(params);
    
    console.log(`Exporting ${allQuotes.length} ${typeLabel.toLowerCase()} to PDF...`);

    if (allQuotes.length === 0) {
      alert(`No ${typeLabel.toLowerCase()} to export!`);
      resetButton(exportBtn, originalText);
      return;
    }

    // Generate and download PDF
    const filters = buildFiltersObject(searchFields, currentNoteTypeFilter);
    const pdfBlob = await generatePdf(allQuotes, filters);
    
    const filePrefix = currentNoteTypeFilter || 'all_notes';
    const filename = generateFilename(filePrefix, 'pdf');
    downloadBlob(pdfBlob, filename);

    resetButton(exportBtn, originalText);
  } catch (error) {
    console.error("Error exporting PDF:", error);
    alert("Failed to export PDF. Please try again.");
    exportBtn.textContent = "📄 Export to PDF";
    exportBtn.disabled = false;
  }
}

/**
 * Fetch JSON backup from server
 */
async function fetchJsonBackup(currentNoteTypeFilter) {
  let url = `${API_URL}/export/json`;
  if (currentNoteTypeFilter) {
    url += `?note_type=${currentNoteTypeFilter}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to export data");
  }

  return await response.blob();
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
    if (!confirm(message)) {
      return;
    }
    
    const originalText = setButtonLoading(exportBtn, "⏳ Exporting...");

    // Fetch and download backup
    const blob = await fetchJsonBackup(currentNoteTypeFilter);
    const filePrefix = currentNoteTypeFilter || 'all_notes';
    const filename = generateFilename(`${filePrefix}_backup`, 'json');
    downloadBlob(blob, filename);

    resetButton(exportBtn, originalText);
    alert(`✅ ${typeLabel} backup created successfully!`);
  } catch (error) {
    console.error("Error exporting JSON:", error);
    alert("Failed to create backup. Please try again.");
    exportBtn.textContent = "💾 Backup Data";
    exportBtn.disabled = false;
  }
}

// ============= IMPORT FUNCTION =============

/**
 * Send import data to server
 */
async function sendImportToServer(backupData) {
  const response = await fetch(`${API_URL}/import/json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: backupData.data,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Import failed");
  }

  return result;
}

/**
 * Handle successful import
 */
function handleImportSuccess(result, importStatus, selectFileBtn, importModal, onImportComplete) {
  importStatus.innerHTML = generateImportSuccessHtml(result.stats);
  selectFileBtn.textContent = "Select Backup File";
  selectFileBtn.disabled = false;

  // Reload data after delay
  setTimeout(() => {
    importModal.style.display = "none";
    if (onImportComplete) {
      onImportComplete();
    }
    alert("✅ Data restored successfully! Page will refresh.");
    location.reload();
  }, IMPORT_SUCCESS_DELAY);
}

/**
 * Handle import error
 */
function handleImportError(error, importStatus, selectFileBtn) {
  console.error("Error importing JSON:", error);
  importStatus.innerHTML = generateImportErrorHtml(error.message);
  selectFileBtn.textContent = "Select Backup File";
  selectFileBtn.disabled = false;
}

/**
 * Reset file input and button
 */
function resetFileInput(event, selectFileBtn) {
  selectFileBtn.textContent = "Select Backup File";
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
    
    if (!confirm(message)) {
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
    handleImportError(error, importStatus, selectFileBtn);
    event.target.value = "";
  }
}
