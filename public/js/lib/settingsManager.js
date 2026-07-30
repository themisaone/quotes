/**
 * Settings Manager - Centralized settings management
 * Handles all application settings: core settings, type management, and color customization
 * 
 * Architecture:
 * 1. Core Settings - Load, save, apply, migrate
 * 2. Type Management - Quote types and training types (UI + logic)
 * 3. Color Management - Color customization for UI elements
 * 4. UI Initialization - Settings panel and event listeners
 */

import { API_URL } from './api.js';
import { getElementByIdSafe } from '../constants.js';
import { showConfirm } from './confirmDialog.js';
import { initNoteTypes } from './noteTypes.js';
import { escapeHtml } from './utils.js?v=20260703color1';

// ============= GLOBAL STATE =============

let globalSettings = null;

const DEFAULT_APP_FONT = 'system';
const APP_FONT_OPTIONS = Object.freeze([
  {
    value: 'system',
    label: 'System Sans (current)',
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    value: 'segoe',
    label: 'Noto Sans / Segoe UI',
    stack: '"Noto Sans", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  },
  {
    value: 'arial',
    label: 'Liberation Sans / Arial',
    stack: '"Liberation Sans", Arial, Helvetica, sans-serif',
  },
  {
    value: 'verdana',
    label: 'DejaVu Sans / Verdana',
    stack: '"DejaVu Sans", Verdana, Geneva, sans-serif',
  },
  {
    value: 'trebuchet',
    label: 'Ubuntu / Trebuchet MS',
    stack: 'Ubuntu, "Trebuchet MS", "Segoe UI", sans-serif',
  },
  {
    value: 'georgia',
    label: 'Noto Serif / Georgia',
    stack: '"Noto Serif", Georgia, "Times New Roman", Times, serif',
  },
  {
    value: 'times',
    label: 'Liberation Serif / Times',
    stack: '"Liberation Serif", "Times New Roman", Times, serif',
  },
  {
    value: 'mono',
    label: 'Monospace',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace',
  },
]);

// ============= CORE SETTINGS =============

/**
 * Load settings from server
 */
export async function loadSettings() {
  try {
    const response = await fetch(`${API_URL}/settings`);
    if (response.ok) {
      globalSettings = await response.json();
      console.log('✅ Settings loaded from file:', globalSettings);
      
      // Migrate localStorage to file if needed
      await migrateLocalStorageToFile();
      
      // Apply settings to UI
      applySettingsToUI();
      
      return globalSettings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  
  // Fallback to localStorage if server fails
  console.warn('⚠️  Using localStorage fallback');
  return null;
}

/**
 * Reload settings.json from the server and sync in-memory note types the same
 * way as startup (respecting `window._modeAllowedTypes` when set).
 * Call when opening Options so manual edits to the settings file show up
 * without a full page reload.
 */
export async function refreshSettingsForOptionsPanel() {
  const prev = await loadSettings();
  if (!globalSettings?.noteTypes) return prev;

  const allowed =
    typeof window !== 'undefined' && Array.isArray(window._modeAllowedTypes)
      ? window._modeAllowedTypes
      : null;
  if (allowed?.length) {
    const filtered = globalSettings.noteTypes.filter((t) => allowed.includes(t.value));
    initNoteTypes(filtered.length ? filtered : globalSettings.noteTypes);
  } else {
    initNoteTypes(globalSettings.noteTypes);
  }

  return globalSettings;
}

function wireNoteTypeShortcuts(row, typeValue, rebuildMenuFn) {
  const input = row.querySelector('.shortcut-tag-input');
  const addBtn = row.querySelector('.btn-shortcut-add');
  const listEl = row.querySelector('.shortcut-tags-list');
  if (!listEl || !typeValue) return;

  const renderList = () => {
    const tags = globalSettings?.highlightedTags?.[typeValue] || [];
    listEl.innerHTML = tags.map((tag) => `
      <span class="shortcut-tag-chip">
        ${escapeHtml(tag)}
        <button type="button" class="shortcut-tag-remove" data-tag="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">&times;</button>
      </span>`).join('');
    listEl.querySelectorAll('.shortcut-tag-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tagName = btn.dataset.tag;
        if (!tagName) return;
        if (!await showConfirm(`Remove "${tagName}" from quick tag shortcuts for this note type?`, {
          title: 'Remove tag shortcut?',
          danger: true,
        })) return;
        if (!globalSettings.highlightedTags) globalSettings.highlightedTags = {};
        globalSettings.highlightedTags[typeValue] = (globalSettings.highlightedTags[typeValue] || [])
          .filter((v) => v !== tagName);
        await saveSettings(globalSettings);
        renderList();
        if (rebuildMenuFn) rebuildMenuFn();
      });
    });
  };

  const doAdd = async () => {
    const tag = input?.value?.trim();
    if (!tag) return;
    if (!globalSettings.highlightedTags) globalSettings.highlightedTags = {};
    const arr = globalSettings.highlightedTags[typeValue] || [];
    if (!arr.includes(tag)) {
      arr.push(tag);
      globalSettings.highlightedTags[typeValue] = arr;
      await saveSettings(globalSettings);
      if (rebuildMenuFn) rebuildMenuFn();
    }
    if (input) input.value = '';
    renderList();
  };

  renderList();
  addBtn?.addEventListener('click', doAdd);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
}

/**
 * Save settings to server
 */
export async function saveSettings(settings) {
  try {
    const response = await fetch(`${API_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    
    if (response.ok) {
      globalSettings = settings;
      console.log('✅ Settings saved to file');
      return true;
    }
  } catch (error) {
    console.error('Error saving settings:', error);
  }
  return false;
}

/**
 * Update a single setting
 */
export async function updateSetting(key, value) {
  // Update localStorage (backup)
  localStorage.setItem(key, value);
  
  // Update global settings
  if (!globalSettings) return;
  
  // Handle nested keys (e.g., "colors.button")
  if (key.includes('.')) {
    const parts = key.split('.');
    let obj = globalSettings;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  } else {
    globalSettings[key] = value;
  }
  
  // Save to file
  await saveSettings(globalSettings);
}

/**
 * Get global settings object
 */
export function getGlobalSettings() {
  return globalSettings;
}

/**
 * Get an effective display setting for a specific note type.
 * Falls back to the global value when no per-type override is set.
 *
 * @param {string} key       - e.g. 'displayByRealSize' | 'showLongExpanded'
 * @param {string} noteType  - e.g. 'training' | 'quote' (pass null for global)
 */
export function getDisplaySetting(key, noteType) {
  if (noteType) {
    const nt = globalSettings?.noteTypes?.find(t => t.value === noteType);
    const override = nt?.displaySettings?.[key];
    if (override !== undefined) return override;
  }
  // Fall back to global key (support both new short key and legacy key names)
  const legacyMap = {
    displayByRealSize: 'displayQuotesByRealSize',
    showLongExpanded:  'showLongQuotesExpanded',
  };
  return globalSettings?.[key] ?? globalSettings?.[legacyMap[key]];
}

/**
 * Save a per-type display setting override into the noteType's displaySettings block.
 */
export async function updateNoteTypeDisplaySetting(noteType, key, value) {
  const nt = globalSettings?.noteTypes?.find(t => t.value === noteType);
  if (!nt) return;
  if (!nt.displaySettings) nt.displaySettings = {};
  nt.displaySettings[key] = value;
  await saveSettings(globalSettings);
}

/**
 * Render per-type override checkboxes into a container element.
 * Each note type gets a checkbox reflecting its effective value for `settingKey`.
 */
export function renderPerTypeOverrides(containerId, settingKey, globalKey, callbacks) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const noteTypes = globalSettings?.noteTypes || [];
  const globalVal = globalSettings?.[globalKey] === true;

  container.innerHTML = `<span class="per-type-label">Per-type effective values (highlighted = override):</span>`;

  noteTypes.forEach(nt => {
    const override = nt.displaySettings?.[settingKey];
    const effectiveVal = override !== undefined ? override : globalVal;
    const isOverridden  = override !== undefined && override !== globalVal;

    const lbl = document.createElement('label');
    lbl.className = 'per-type-item' + (isOverridden ? ' per-type-overridden' : '');
    lbl.title = isOverridden
      ? `Override active: ${effectiveVal ? 'on' : 'off'} (default: ${globalVal ? 'on' : 'off'})`
      : `Uses default: ${globalVal ? 'on' : 'off'}`;
    lbl.innerHTML = `<input type="checkbox" ${effectiveVal ? 'checked' : ''}><span>${nt.icon} ${nt.label}</span>`;

    const cb = lbl.querySelector('input');
    cb.addEventListener('change', async (e) => {
      await updateNoteTypeDisplaySetting(nt.value, settingKey, e.target.checked);
      lbl.classList.toggle('per-type-overridden', e.target.checked !== globalVal);
      lbl.title = e.target.checked !== globalVal
        ? `Override active: ${e.target.checked ? 'on' : 'off'} (default: ${globalVal ? 'on' : 'off'})`
        : `Uses default: ${globalVal ? 'on' : 'off'}`;
      if (callbacks?.loadQuotes) callbacks.loadQuotes();
    });

    container.appendChild(lbl);
  });
}

/**
 * Migrate localStorage settings to file (one-time)
 */
async function migrateLocalStorageToFile() {
  // Skip if this one-time migration has already completed.
  // Without this guard the migration re-runs on every page load and
  // overwrites palette colors saved in settings.json with stale
  // localStorage values (e.g. old buttonColor / appBgColor entries).
  if (localStorage.getItem('settingsMigratedToFile') === 'done') return;

  // If the server already returned a "real" vault / custom layout (any note type
  // beyond the four shipped defaults in server.js), never merge+PUT from localStorage.
  // Otherwise opening the app via Docker after using localhost can overwrite vault
  // colors — or worse, if the first GET ever returned bootstrap defaults, persist them.
  const bootstrapTypeValues = new Set(['quote', 'note', 'training', 'puzzle']);
  const nt = globalSettings?.noteTypes;
  if (Array.isArray(nt) && nt.some((t) => t && !bootstrapTypeValues.has(t.value))) {
    localStorage.setItem('settingsMigratedToFile', 'done');
    return;
  }

  // Check if localStorage has any settings worth migrating
  const hasLocalSettings = 
    localStorage.getItem('downscaleQuoteImages') !== null ||
    localStorage.getItem('externalStorageThreshold') !== null ||
    localStorage.getItem('compactMode') !== null ||
    localStorage.getItem('quoteTypes') !== null ||
    localStorage.getItem('enableTagOperations') !== null ||
    localStorage.getItem('enableQuoteMetaSearches') !== null ||
    localStorage.getItem('displayQuotesByRealSize') !== null ||
    localStorage.getItem('showLongQuotesExpanded') !== null ||
    localStorage.getItem('displayScoreInCards') !== null ||
    localStorage.getItem('buttonColor') !== null;
  
  if (!hasLocalSettings) {
    // Nothing to migrate; mark as done so we never check again.
    localStorage.setItem('settingsMigratedToFile', 'done');
    return;
  }
  
  console.log('🔄 Migrating localStorage settings to file...');
  
  // Merge localStorage into global settings
  const migratedSettings = { ...globalSettings };
  
  // Quote types
  if (localStorage.getItem('quoteTypes')) {
    try {
      migratedSettings.quoteTypes = JSON.parse(localStorage.getItem('quoteTypes'));
    } catch (e) {}
  }
  
  // Boolean settings
  if (localStorage.getItem('downscaleQuoteImages') !== null) {
    migratedSettings.downscaleQuoteImages = localStorage.getItem('downscaleQuoteImages') !== 'false';
  }
  
  if (localStorage.getItem('compactMode') !== null) {
    migratedSettings.compactMode = localStorage.getItem('compactMode') === 'true';
  }
  
  if (localStorage.getItem('enableTagOperations') !== null) {
    migratedSettings.enableTagOperations = localStorage.getItem('enableTagOperations') !== 'false';
  }
  
  if (localStorage.getItem('enableQuoteMetaSearches') !== null) {
    migratedSettings.enableQuoteMetaSearches = localStorage.getItem('enableQuoteMetaSearches') === 'true';
  }
  
  if (localStorage.getItem('displayQuotesByRealSize') !== null) {
    migratedSettings.displayQuotesByRealSize = localStorage.getItem('displayQuotesByRealSize') === 'true';
  }
  
  if (localStorage.getItem('showLongQuotesExpanded') !== null) {
    migratedSettings.showLongQuotesExpanded = localStorage.getItem('showLongQuotesExpanded') === 'true';
  }
  
  if (localStorage.getItem('displayScoreInCards') !== null) {
    migratedSettings.displayScoreInCards = localStorage.getItem('displayScoreInCards') === 'true';
  }
  
  if (localStorage.getItem('enableWordWrap') !== null) {
    migratedSettings.enableWordWrap = localStorage.getItem('enableWordWrap') === 'true';
  }
  
  // Numeric settings
  if (localStorage.getItem('externalStorageThreshold')) {
    migratedSettings.externalStorageThreshold = parseFloat(localStorage.getItem('externalStorageThreshold'));
  }
  
  if (localStorage.getItem('wordWrapChars')) {
    migratedSettings.wordWrapChars = parseInt(localStorage.getItem('wordWrapChars')) || 66;
  }
  
  // Colors
  if (!migratedSettings.colors) {
    migratedSettings.colors = {};
  }
  
  const colorKeys = ['button', 'header', 'tag', 'delete', 'cancel', 'activeCounter', 'totalCounter', 'menu', 'appBg'];
  colorKeys.forEach(key => {
    const localKey = key + 'Color';
    if (localStorage.getItem(localKey)) {
      migratedSettings.colors[key] = localStorage.getItem(localKey);
    }
  });
  
  // Save to file
  const success = await saveSettings(migratedSettings);
  
  if (success) {
    console.log('✅ Migration complete - settings saved to file');
    // Mark migration as complete so it never re-runs and never
    // overwrites palette colors with stale localStorage values.
    localStorage.setItem('settingsMigratedToFile', 'done');
  }
}

/**
 * Apply settings to UI
 */
function applySettingsToUI() {
  if (!globalSettings) return;
  
  // Apply compact mode
  if (globalSettings.compactMode) {
    document.body.classList.add('compact-mode');
  }

  const activeFont = applyAppFont(globalSettings.appFont || DEFAULT_APP_FONT);
  const appFontSelect = getElementByIdSafe('appFontSelect', 'applyCoreSettings');
  if (appFontSelect) {
    populateAppFontSelect(appFontSelect);
    appFontSelect.value = activeFont;
  }
  
  // Apply all checkbox settings
  const checkboxMappings = [
    // Note: 'compactModeToggle' removed - feature deprecated, element doesn't exist in HTML
    { id: 'enableTagOperations', setting: 'enableTagOperations' },
    { id: 'enableQuoteMetaSearches', setting: 'enableQuoteMetaSearches' },
    { id: 'displayQuotesMultipleAddButton', setting: 'displayQuotesMultipleAddButton' },
    { id: 'displayQuotesByRealSize', setting: 'displayQuotesByRealSize' },
    { id: 'showLongQuotesExpanded', setting: 'showLongQuotesExpanded' },
    { id: 'displayScoreInCards', setting: 'displayScoreInCards' },
    { id: 'stretchImagesWhenEmpty', setting: 'stretchImagesWhenEmpty' },
    { id: 'displayEmptyTitleInCard', setting: 'displayEmptyTitleInCard' },
    { id: 'downscaleQuoteImages', setting: 'downscaleQuoteImages' },
    { id: 'enableWordWrap', setting: 'enableWordWrap' },
    { id: 'hideEncryptedNotes', setting: 'hideEncryptedNotes' },
    { id: 'hideNotesWithTag', setting: 'hideNotesWithTag' }
  ];
  
  checkboxMappings.forEach(({ id, setting }) => {
    const checkbox = getElementByIdSafe(id, 'applyCoreSettings');
    if (checkbox && globalSettings.hasOwnProperty(setting)) {
      checkbox.checked = globalSettings[setting];
    }
  });
  
  // Apply external storage threshold
  const thresholdSelect = getElementByIdSafe('externalStorageThreshold', 'applyCoreSettings');
  if (thresholdSelect && globalSettings.externalStorageThreshold) {
    thresholdSelect.value = globalSettings.externalStorageThreshold;
  }

  // Vault path is loaded asynchronously from /api/vault/info (lives in local.json)
  // Apply ALL saved colors to CSS on every page load.
  // Every key that exists in colorConfigs must also appear here so that
  // a hard-refresh restores the full palette without needing to open Settings.
  if (globalSettings.colors) {
    const c = globalSettings.colors;
    if (c.appBg)         applyAppBgColor(c.appBg);
    if (c.menu)          applyMenuColor(c.menu);
    if (c.card)          applyCardColor(c.card);
    if (c.cardHover)     applyCardHoverColor(c.cardHover);
    if (c.inputBg)       applyInputBgColor(c.inputBg);
    if (c.inputBorder)   applyInputBorderColor(c.inputBorder);
    if (c.textColor)     applyTextColor(c.textColor);
    if (c.header)        applyHeaderColor(c.header);
    if (c.modalFooter)   applyModalFooterColor(c.modalFooter);
    if (c.button)        applyButtonColor(c.button);
    if (c.linkColor)     applyLinkColor(c.linkColor);
    if (c.delete)        applyDeleteColor(c.delete);
    if (c.cancel)        applyCancelColor(c.cancel);
    if (c.tag)           applyTagColor(c.tag);
    if (c.activeCounter) applyActiveCounterColor(c.activeCounter);
    if (c.totalCounter)  applyTotalCounterColor(c.totalCounter);
  }
  
  // Apply colors to color picker inputs
  const colorInputMappings = [
    { id: 'buttonColor', colorKey: 'button' },
    { id: 'linkColorColor', colorKey: 'linkColor' },
    { id: 'headerColor', colorKey: 'header' },
    { id: 'tagColor', colorKey: 'tag' },
    { id: 'deleteColor', colorKey: 'delete' },
    { id: 'cancelColor', colorKey: 'cancel' },
    { id: 'activeCounterColor', colorKey: 'activeCounter' },
    { id: 'totalCounterColor', colorKey: 'totalCounter' },
    { id: 'menuColor', colorKey: 'menu' },
    { id: 'appBgColor', colorKey: 'appBg' },
    { id: 'modalFooterColor', colorKey: 'modalFooter' }
  ];
  
  colorInputMappings.forEach(({ id, colorKey }) => {
    const input = getElementByIdSafe(id, 'applyCoreSettings');
    if (input && globalSettings.colors && globalSettings.colors[colorKey]) {
      input.value = globalSettings.colors[colorKey];
    }
  });
}

/**
 * Apply color to CSS custom property
 */
export function applyColorToCSS(colorType, colorValue) {
  // Update in global settings
  if (globalSettings) {
    if (!globalSettings.colors) globalSettings.colors = {};
    globalSettings.colors[colorType] = colorValue;
    saveSettings(globalSettings);
  }
  
  // Apply to UI
  switch (colorType) {
    case 'button':        applyButtonColor(colorValue); break;
    case 'linkColor':     applyLinkColor(colorValue); break;
    case 'header':        applyHeaderColor(colorValue); break;
    case 'tag':           applyTagColor(colorValue); break;
    case 'delete':        applyDeleteColor(colorValue); break;
    case 'cancel':        applyCancelColor(colorValue); break;
    case 'activeCounter': applyActiveCounterColor(colorValue); break;
    case 'totalCounter':  applyTotalCounterColor(colorValue); break;
    case 'menu':          applyMenuColor(colorValue); break;
    case 'appBg':         applyAppBgColor(colorValue); break;
    case 'modalFooter':   applyModalFooterColor(colorValue); break;
    case 'card':          applyCardColor(colorValue); break;
    case 'cardHover':     applyCardHoverColor(colorValue); break;
    case 'inputBg':       applyInputBgColor(colorValue); break;
    case 'inputBorder':   applyInputBorderColor(colorValue); break;
    case 'textColor':     applyTextColor(colorValue); break;
  }
}

// ============= TYPE MANAGEMENT - QUOTES =============

/**
 * Get quote subTypes — derived from noteTypes[behavior='quote'].subTypes
 * Falls back to legacy globalSettings.quoteTypes for backward compat.
 */
export function getQuoteTypes() {
  if (!globalSettings) {
    throw new Error('Settings not loaded. Please refresh the page.');
  }
  // New structure: subTypes nested inside the quote noteType
  const quoteNoteType = (globalSettings.noteTypes || []).find(t => t.behavior === 'quote');
  if (quoteNoteType?.subTypes?.length) return quoteNoteType.subTypes;
  // Legacy fallback
  if (globalSettings.quoteTypes?.length) return globalSettings.quoteTypes;
  return [{ value: 'ASSORTED', label: 'Assorted', icon: '📝' }];
}

/**
 * Save quote subtypes back into noteTypes[behavior='quote'].subTypes
 */
export function saveQuoteTypes(types) {
  if (!globalSettings) return;
  const nt = (globalSettings.noteTypes || []).find(t => t.behavior === 'quote');
  if (nt) nt.subTypes = types;
  // keep legacy key in sync so old code paths don't break
  globalSettings.quoteTypes = types;
  saveSettings(globalSettings);
}

/**
 * Render quote types list — now a no-op shim; subTypes rendered inside renderNoteTypesList
 */
export function renderQuoteTypesList(populateTypeDropdowns, populateTypeFilterCheckboxes) {
  if (populateTypeDropdowns) populateTypeDropdowns();
  if (populateTypeFilterCheckboxes) populateTypeFilterCheckboxes();
}

/**
 * Save quote types and refresh UI
 */
function saveQuoteTypesAndRefresh(types, populateTypeDropdowns, populateTypeFilterCheckboxes) {
  saveQuoteTypes(types);
  saveSettings(globalSettings).then(success => {
    if (success) {
      if (populateTypeDropdowns) populateTypeDropdowns();
      if (populateTypeFilterCheckboxes) populateTypeFilterCheckboxes();
    }
  });
}

// ============= TYPE MANAGEMENT - TRAINING =============

/**
 * Get training subTypes — derived from noteTypes[behavior='training'].subTypes
 * Falls back to legacy globalSettings.trainingTypes for backward compat.
 */
export function getTrainingTypes(noteTypeValue = null) {
  if (!globalSettings) {
    throw new Error('Settings not loaded. Please refresh the page.');
  }

  if (noteTypeValue) {
    const noteType = (globalSettings.noteTypes || []).find(t => t.value === noteTypeValue);
    if (noteType?.behavior === 'training' || noteType?.behavior === 'diary') return noteType.subTypes || [];
    return [];
  }

  const trainingNoteType = (globalSettings.noteTypes || []).find(t => t.value === 'training')
    || (globalSettings.noteTypes || []).find(t => t.behavior === 'training');
  if (trainingNoteType?.subTypes?.length) return trainingNoteType.subTypes;
  if (globalSettings.trainingTypes?.length) return globalSettings.trainingTypes;
  return [{ value: 'GENERAL', label: 'General', icon: '💪' }];
}

/**
 * Save training subtypes back into noteTypes[behavior='training'].subTypes
 */
export function saveTrainingTypes(types) {
  if (!globalSettings) return;
  const nt = (globalSettings.noteTypes || []).find(t => t.behavior === 'training');
  if (nt) nt.subTypes = types;
  globalSettings.trainingTypes = types;
  saveSettings(globalSettings);
}

/**
 * Render training types list — now a no-op shim; subTypes rendered inside renderNoteTypesList
 */
export function renderTrainingTypesList(populateTrainingTypeFilterCheckboxes) {
  if (populateTrainingTypeFilterCheckboxes) populateTrainingTypeFilterCheckboxes();
}

/**
 * Save training types and refresh UI
 */
function saveTrainingTypesAndRefresh(types, populateTrainingTypeFilterCheckboxes) {
  saveTrainingTypes(types);
  saveSettings(globalSettings).then(success => {
    if (success) {
      if (populateTrainingTypeFilterCheckboxes) populateTrainingTypeFilterCheckboxes();
    }
  });
}

/**
 * Setup event listeners for type management buttons
 */
export function setupTypeManagementListeners(populateTypeDropdowns, populateTypeFilterCheckboxes, populateTrainingTypeFilterCheckboxes, rebuildNoteTypeMenuFn) {
  // Quote Types - Add button
  const addQuoteTypeBtn = getElementByIdSafe('addQuoteTypeBtn');
  if (addQuoteTypeBtn) {
    // Remove old listener by cloning
    const newAddQuoteTypeBtn = addQuoteTypeBtn.cloneNode(true);
    addQuoteTypeBtn.parentNode.replaceChild(newAddQuoteTypeBtn, addQuoteTypeBtn);
    
    newAddQuoteTypeBtn.addEventListener('click', () => {
      const types = getQuoteTypes();
      types.push({
        icon: '📝',
        value: 'CUSTOM',
        label: 'Custom Type'
      });
      saveQuoteTypesAndRefresh(types, populateTypeDropdowns, populateTypeFilterCheckboxes);
    });
  }
  
  // Training Types - Add button
  const addTrainingTypeBtn = getElementByIdSafe('addTrainingTypeBtn');
  if (addTrainingTypeBtn) {
    // Remove old listener by cloning
    const newAddTrainingTypeBtn = addTrainingTypeBtn.cloneNode(true);
    addTrainingTypeBtn.parentNode.replaceChild(newAddTrainingTypeBtn, addTrainingTypeBtn);
    
    newAddTrainingTypeBtn.addEventListener('click', () => {
      const types = getTrainingTypes();
      types.push({
        icon: '💪',
        value: 'CUSTOM',
        label: 'Custom Training'
      });
      saveTrainingTypesAndRefresh(types, populateTrainingTypeFilterCheckboxes);
    });
  }

  // Note Types - handled by setupNoteTypeManagementListeners (called separately)
  if (rebuildNoteTypeMenuFn) {
    setupNoteTypeManagementListeners(rebuildNoteTypeMenuFn);
  }
}

// ============= TYPE MANAGEMENT - NOTE TYPES =============

/**
 * Default display mode for a note type from settings (not localStorage).
 * Date-based types: `calendar` | `list`. Others: `cards` | `list-pane`.
 */
export function getNoteTypeDefaultDisplayMode(noteTypeValue) {
  const types = globalSettings?.noteTypes;
  const fallback = noteTypeValue === 'training' ? 'calendar' : 'cards';
  if (!types || !noteTypeValue) return fallback;
  const nt = types.find((t) => t.value === noteTypeValue);
  if (!nt) return fallback;
  const isTraining = nt.behavior === 'training' || nt.value === 'training';
  const isDiary = nt.behavior === 'diary';
  const mode = nt.defaultDisplayMode;
  if (isTraining) {
    return (mode === 'list' || mode === 'calendar') ? mode : 'calendar';
  }
  if (isDiary) {
    return (mode === 'cards' || mode === 'list' || mode === 'calendar') ? mode : 'calendar';
  }
  return (mode === 'list-pane' || mode === 'cards') ? mode : 'cards';
}

/**
 * Get note types from settings
 */
export function getNoteTypesSettings() {
  if (!globalSettings) {
    throw new Error('Settings not loaded. Please refresh the page.');
  }
  if (!globalSettings.noteTypes || !Array.isArray(globalSettings.noteTypes)) {
    // Return sensible defaults if not configured yet
    return [
      { value: 'quote',    label: 'Quotes',   icon: '💬', behavior: 'quote',    core: true },
      { value: 'note',     label: 'Notes',    icon: '📝', behavior: 'generic',  core: true },
      { value: 'training', label: 'Training', icon: '💪', behavior: 'training', core: true },
      { value: 'puzzle',   label: 'Puzzles',  icon: '🧩', behavior: 'generic',  core: true },
    ];
  }
  return globalSettings.noteTypes;
}

/**
 * Render note types list in settings UI — includes inline subTypes for quote/training behaviors
 */
export function renderNoteTypesList(rebuildMenuFn) {
  const container = getElementByIdSafe('noteTypesList', 'renderNoteTypesList');
  if (!container) return;

  const allTypes = getNoteTypesSettings();
  const allowed =
    typeof window !== 'undefined' && Array.isArray(window._modeAllowedTypes)
      ? window._modeAllowedTypes
      : null;
  const isSingleTypeInstance = allowed?.length === 1;
  const types = isSingleTypeInstance
    ? allTypes.filter((t) => allowed.includes(t.value))
    : allTypes;

  const addNoteTypeBtn = document.getElementById('addNoteTypeBtn');
  if (addNoteTypeBtn) addNoteTypeBtn.style.display = isSingleTypeInstance ? 'none' : '';

  let hintEl = document.getElementById('singleTypeNoteTypesHint');
  if (isSingleTypeInstance) {
    if (!hintEl) {
      hintEl = document.createElement('p');
      hintEl.id = 'singleTypeNoteTypesHint';
      hintEl.className = 'settings-single-type-hint';
      container.parentElement?.insertBefore(hintEl, container);
    }
    hintEl.textContent = 'This instance runs a single note type — only that type is shown here.';
    hintEl.style.display = '';
  } else if (hintEl) {
    hintEl.style.display = 'none';
  }

  const behaviorLabel = (b) => ({
    quote: '📖 Quote',
    training: '🏋️ Training',
    diary: '📅 Diary',
    generic: '📄 Generic'
  }[b] || b);

  const isTrainingType = (type) => type.behavior === 'training' || type.value === 'training';
  const isDiaryType = (type) => type.behavior === 'diary';

  const displayModeSelectHtml = (type) => {
    const isTraining = isTrainingType(type);
    const isDiary = isDiaryType(type);
    const current = type.defaultDisplayMode || (isTraining || isDiary ? 'calendar' : 'cards');
    if (isTraining) {
      return `<select class="note-type-display-mode-select" aria-label="Default display mode">
        <option value="calendar" ${current === 'calendar' ? 'selected' : ''}>Calendar</option>
        <option value="list" ${current === 'list' ? 'selected' : ''}>List</option>
      </select>`;
    }
    if (isDiary) {
      return `<select class="note-type-display-mode-select" aria-label="Default display mode">
        <option value="calendar" ${current === 'calendar' ? 'selected' : ''}>Calendar</option>
        <option value="list" ${current === 'list' ? 'selected' : ''}>List</option>
        <option value="cards" ${current === 'cards' ? 'selected' : ''}>Cards</option>
      </select>`;
    }
    return `<select class="note-type-display-mode-select" aria-label="Default display mode">
      <option value="cards" ${current === 'cards' ? 'selected' : ''}>Cards</option>
      <option value="list-pane" ${current === 'list-pane' ? 'selected' : ''}>List</option>
    </select>`;
  };

  const normalizeDisplayModeForType = (type, mode) => {
    if (isTrainingType(type)) {
      return (mode === 'list' || mode === 'calendar') ? mode : 'calendar';
    }
    if (isDiaryType(type)) {
      return (mode === 'cards' || mode === 'list' || mode === 'calendar') ? mode : 'calendar';
    }
    return (mode === 'list-pane' || mode === 'cards') ? mode : 'cards';
  };

  const subTypeRowHtml = (sub, ntIdx, sIdx, canDelete, isDefault) => `
    <div class="subtype-item" data-nt="${ntIdx}" data-si="${sIdx}">
      <input type="radio" class="subtype-default" name="subtype-default-${ntIdx}" aria-label="Default sub-type" ${isDefault ? 'checked' : ''} />
      <input type="text" class="subtype-icon"  value="${sub.icon}"  placeholder="📝" maxlength="2" aria-label="Sub-type icon" />
      <input type="text" class="subtype-value" value="${sub.value}" placeholder="VALUE" aria-label="Sub-type internal key" />
      <input type="text" class="subtype-label" value="${sub.label}" placeholder="Label" aria-label="Sub-type display label" />
      ${canDelete ? `<button type="button" class="btn-icon-small btn-delete-subtype" aria-label="Delete sub-type">🗑️</button>` : ''}
    </div>`;

  container.innerHTML = types.map((type) => {
    const index = allTypes.findIndex((t) => t.value === type.value);
    const hasSubs = type.behavior === 'quote'
      || type.behavior === 'training'
      || type.behavior === 'diary'
      || type.behavior === 'generic';
    const subs = type.subTypes || [];
    const behaviorOpts = ['quote','training','diary','generic'].map(b =>
      `<option value="${b}" ${(type.behavior||'generic')===b?'selected':''}>${behaviorLabel(b)}</option>`).join('');
    const subsHtml = hasSubs ? `
        <div class="subtype-section">
          <div class="subtype-header">
            <span class="subtype-header-title">Sub-types (${subs.length})</span>
            <button type="button" class="btn-add-subtype btn-icon-small" data-nt="${index}" aria-label="Add sub-type">➕</button>
          </div>
          <div class="subtype-columns-header" aria-hidden="true">
            <span class="subtype-col-default">Default</span>
            <span>Icon</span>
            <span>Internal key</span>
            <span>Display label</span>
            <span class="subtype-col-actions"></span>
          </div>
          <div class="subtype-list" data-nt="${index}">
            ${subs.map((s, si) => subTypeRowHtml(s, index, si, subs.length > 1, !!s.isDefault)).join('')}
          </div>
        </div>` : `
        <div class="note-type-subtypes-empty">No sub-types for this behavior.</div>`;

    return `
    <div class="quote-type-item note-type-row" data-index="${index}">
      <div class="note-type-card-layout">
        <div class="note-type-fields-col">
          <div class="note-type-fields-stack">
            <div class="note-type-field">
              <label class="note-type-field-label">Icon</label>
              <input type="text" class="note-type-icon-input" value="${type.icon}" placeholder="📝" maxlength="2" />
            </div>
            <div class="note-type-field">
              <label class="note-type-field-label">Internal key stored in database</label>
              <input type="text" class="note-type-value-input" value="${type.value}" placeholder="value" />
            </div>
            <div class="note-type-field">
              <label class="note-type-field-label">Display label</label>
              <input type="text" class="note-type-label-input" value="${type.label}" placeholder="Label" />
            </div>
            <div class="note-type-field">
              <label class="note-type-field-label">Edit modal behavior</label>
              <select class="note-type-behavior-select">
                ${behaviorOpts}
              </select>
            </div>
            <div class="note-type-field">
              <label class="note-type-field-label">Default display mode</label>
              ${displayModeSelectHtml(type)}
            </div>
            <div class="note-type-field note-type-shortcuts">
              <label class="note-type-field-label">Quick tag shortcuts</label>
              <div class="note-type-shortcuts-add">
                <input type="text" class="shortcut-tag-input" placeholder="Tag name…" autocomplete="off" />
                <button type="button" class="btn btn-primary btn-shortcut-add">Add</button>
              </div>
              <div class="shortcut-tags-list"></div>
            </div>
          </div>
          <div class="quote-type-actions">
            <button type="button" class="btn-icon-small btn-delete-type" aria-label="Delete note type">🗑️ Delete type</button>
          </div>
        </div>
        <div class="note-type-subtypes-col">
          ${subsHtml}
        </div>
      </div>
    </div>`;
  }).join('');

  // ── Wire up note type main row ──
  container.querySelectorAll('.note-type-row').forEach((row) => {
    const index = parseInt(row.dataset.index, 10);
    if (Number.isNaN(index)) return;
    const iconInput     = row.querySelector('.note-type-icon-input');
    const valueInput    = row.querySelector('.note-type-value-input');
    const labelInput    = row.querySelector('.note-type-label-input');
    const behaviorSel   = row.querySelector('.note-type-behavior-select');
    const displayModeSel = row.querySelector('.note-type-display-mode-select');
    const deleteBtn     = row.querySelector('.btn-delete-type');

    const updateType = () => {
      const current = getNoteTypesSettings();
      const next = {
        ...current[index],
        icon:     iconInput.value  || '📝',
        label:    labelInput.value || 'Custom',
        value:    valueInput?.value?.trim()  || current[index].value,
        behavior: behaviorSel?.value         || current[index].behavior,
      };
      next.defaultDisplayMode = normalizeDisplayModeForType(
        next,
        displayModeSel?.value || next.defaultDisplayMode,
      );
      current[index] = next;
      saveNoteTypesAndRefresh(current, rebuildMenuFn);
    };
    iconInput.addEventListener('change', updateType);
    labelInput.addEventListener('change', updateType);
    if (valueInput)   valueInput.addEventListener('change', updateType);
    if (behaviorSel)  behaviorSel.addEventListener('change', updateType);
    if (displayModeSel) displayModeSel.addEventListener('change', updateType);

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const current = getNoteTypesSettings();
        if (await showConfirm(`Existing notes of this type will still exist but won't appear in the menu.`, {
          title: `Delete note type "${current[index].label}"?`,
          danger: true,
        })) {
          const removed = current[index];
          current.splice(index, 1);
          if (removed?.value && globalSettings?.highlightedTags?.[removed.value]) {
            delete globalSettings.highlightedTags[removed.value];
          }
          saveNoteTypesAndRefresh(current, rebuildMenuFn);
        }
      });
    }

    // ── Wire up subtype rows ──
    row.querySelectorAll('.subtype-item').forEach((sRow) => {
      const ntIdx = parseInt(sRow.dataset.nt);
      const siIdx = parseInt(sRow.dataset.si);
      const iconI    = sRow.querySelector('.subtype-icon');
      const valueI   = sRow.querySelector('.subtype-value');
      const labelI   = sRow.querySelector('.subtype-label');
      const defaultR = sRow.querySelector('.subtype-default');
      const delBtn   = sRow.querySelector('.btn-delete-subtype');

      const updateSub = () => {
        const current = getNoteTypesSettings();
        if (!current[ntIdx].subTypes) current[ntIdx].subTypes = [];
        current[ntIdx].subTypes[siIdx] = {
          ...current[ntIdx].subTypes[siIdx],
          icon:  iconI.value  || '📝',
          value: (valueI.value || 'CUSTOM').toUpperCase().replace(/[^A-Z0-9/\-_]/g, ''),
          label: labelI.value || 'Custom',
        };
        saveNoteTypesAndRefresh(current, rebuildMenuFn);
      };
      iconI.addEventListener('change', updateSub);
      valueI.addEventListener('change', updateSub);
      labelI.addEventListener('change', updateSub);

      if (defaultR) {
        defaultR.addEventListener('change', () => {
          if (!defaultR.checked) return;
          const current = getNoteTypesSettings();
          if (!current[ntIdx].subTypes) return;
          current[ntIdx].subTypes = current[ntIdx].subTypes.map((s, i) => ({
            ...s,
            isDefault: i === siIdx
          }));
          saveNoteTypesAndRefresh(current, rebuildMenuFn);
        });
      }

      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          const current = getNoteTypesSettings();
          if (await showConfirm(`This sub-type will be removed from the menu.`, {
            title: `Delete sub-type "${current[ntIdx].subTypes[siIdx].label}"?`,
            danger: true,
          })) {
            current[ntIdx].subTypes.splice(siIdx, 1);
            saveNoteTypesAndRefresh(current, rebuildMenuFn);
          }
        });
      }
    });

    // ── Add sub-type button ──
    const addSubBtn = row.querySelector('.btn-add-subtype');
    if (addSubBtn) {
      addSubBtn.addEventListener('click', () => {
        const ntIdx = parseInt(addSubBtn.dataset.nt);
        const current = getNoteTypesSettings();
        if (!current[ntIdx].subTypes) current[ntIdx].subTypes = [];
        current[ntIdx].subTypes.push({ icon: '📝', value: 'CUSTOM', label: 'New Sub-type' });
        saveNoteTypesAndRefresh(current, rebuildMenuFn);
      });
    }

    const typeValue = getNoteTypesSettings()[index]?.value;
    wireNoteTypeShortcuts(row, typeValue, rebuildMenuFn);
  });
}

function saveNoteTypesAndRefresh(types, rebuildMenuFn) {
  if (globalSettings) {
    globalSettings.noteTypes = types;
    // Re-filter menu to active mode before persisting (avoids showing all types)
    window.reapplyModeUi?.({ rebuildMenu: true });
    renderNoteTypesList(rebuildMenuFn);
    saveSettings(globalSettings).then(success => {
      if (success) console.log('✅ Note types updated');
    });
  }
}

/**
 * Setup Add Note Type button listener
 */
export function setupNoteTypeManagementListeners(rebuildMenuFn) {
  const addNoteTypeBtn = getElementByIdSafe('addNoteTypeBtn');
  if (!addNoteTypeBtn) return;

  const newBtn = addNoteTypeBtn.cloneNode(true);
  addNoteTypeBtn.parentNode.replaceChild(newBtn, addNoteTypeBtn);

  newBtn.addEventListener('click', () => {
    const types = getNoteTypesSettings();
    const base = 'custom';
    let value = base;
    let n = 1;
    while (types.find(t => t.value === value)) {
      value = `${base}${n++}`;
    }
    types.push({
      icon: '📌',
      value,
      label: 'Custom Type',
      behavior: 'generic',
      defaultDisplayMode: 'cards',
    });
    saveNoteTypesAndRefresh(types, rebuildMenuFn);
  });
}

// ============= FONT MANAGEMENT =============

function getAppFontOption(fontKey) {
  return APP_FONT_OPTIONS.find((option) => option.value === fontKey) || APP_FONT_OPTIONS[0];
}

function populateAppFontSelect(select) {
  if (!select || select.dataset.fontOptionsReady === 'true') return;

  select.innerHTML = '';
  APP_FONT_OPTIONS.forEach((font) => {
    const option = document.createElement('option');
    option.value = font.value;
    option.textContent = font.label;
    option.style.fontFamily = font.stack;
    select.appendChild(option);
  });
  select.dataset.fontOptionsReady = 'true';
}

function applyAppFont(fontKey) {
  const font = getAppFontOption(fontKey);
  document.documentElement.style.setProperty('--app-font-family', font.stack);
  const preview = document.getElementById('appFontPreview');
  if (preview) preview.style.fontFamily = font.stack;
  return font.value;
}

// ============= COLOR MANAGEMENT =============

/**
 * Lighten a hex color by percentage
 */
function lightenColor(hex, percent) {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Lighten
  const newR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
  
  // Convert back to hex
  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * Darken a hex color by percentage
 */
function darkenColor(hex, percent) {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Darken
  const newR = Math.max(0, Math.floor(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.floor(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.floor(b * (1 - percent / 100)));
  
  // Convert back to hex
  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * Return the RGB-inverted hex colour (255 - each channel).
 * Used as the hover colour for primary buttons so it's always the visual
 * complement of the chosen palette button colour.
 */
function invertColor(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = 255 - parseInt(hex.substring(0, 2), 16);
  const g = 255 - parseInt(hex.substring(2, 4), 16);
  const b = 255 - parseInt(hex.substring(4, 6), 16);
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Apply button color. The hover colour is derived as the RGB invert of the
 * chosen primary colour, so it's always the visual complement of the
 * palette's button colour and visibly distinct on hover.
 */
function applyButtonColor(color) {
  document.documentElement.style.setProperty('--primary-color', color);
  document.documentElement.style.setProperty('--primary-hover', invertColor(color));
}

function applyLinkColor(color) {
  document.documentElement.style.setProperty('--link-color', color);
  const hoverColor = darkenColor(color, 15);
  document.documentElement.style.setProperty('--link-hover', hoverColor);
}

/**
 * Apply header color
 */
function applyHeaderColor(color) {
  document.documentElement.style.setProperty('--header-color', color);
}

/**
 * Apply tag color
 */
function applyTagColor(color) {
  document.documentElement.style.setProperty('--tag-color', color);
}

/**
 * Apply delete button color
 */
function applyDeleteColor(color) {
  document.documentElement.style.setProperty('--delete-color', color);
  document.documentElement.style.setProperty('--delete-hover', darkenColor(color, 10));
}

/**
 * Apply cancel button color
 */
function applyCancelColor(color) {
  document.documentElement.style.setProperty('--cancel-color', color);
  // Calculate hover color (darker)
  const hoverColor = darkenColor(color, 15);
  document.documentElement.style.setProperty('--cancel-hover', hoverColor);
}

/**
 * Apply active counter color
 */
function applyActiveCounterColor(color) {
  document.documentElement.style.setProperty('--active-counter-color', color);
}

/**
 * Apply total counter color
 */
function applyTotalCounterColor(color) {
  document.documentElement.style.setProperty('--total-counter-color', color);
}

/**
 * Apply menu color
 */
function applyMenuColor(color) {
  const sideMenu = document.querySelector('.side-menu');
  if (sideMenu) {
    // Calculate gradient colors
    const midColor = lightenColor(color, 5);
    const endColor = lightenColor(color, 15);
    sideMenu.style.background = `linear-gradient(135deg, ${color} 0%, ${midColor} 50%, ${endColor} 100%)`;
  }
}

/**
 * Apply app background color
 */
function applyAppBgColor(color) {
  document.documentElement.style.setProperty('--background', color);
  // Create a subtle gradient from the base color
  const lighterColor = lightenColor(color, 3);
  const darkerColor = darkenColor(color, 2);
  document.body.style.background = `linear-gradient(135deg, ${darkerColor} 0%, ${color} 50%, ${lighterColor} 100%)`;
}

function applyCardColor(color) {
  document.documentElement.style.setProperty('--surface', color);
}

function applyCardHoverColor(color) {
  document.documentElement.style.setProperty('--card-hover-bg', color);
}

function applyInputBgColor(color) {
  document.documentElement.style.setProperty('--input-bg', color);
}

function applyInputBorderColor(color) {
  document.documentElement.style.setProperty('--input-border', color);
  document.documentElement.style.setProperty('--border', color);
}

function applyTextColor(color) {
  document.documentElement.style.setProperty('--text-primary', color);
  document.documentElement.style.setProperty('--text-secondary', lightenColor(color, 30));
}

function applyModalFooterColor(color) {
  document.documentElement.style.setProperty('--modal-footer-bg', color);
}

/**
 * Apply word wrap to the Quill editor
 * @param {boolean} enabled - Whether word wrap is enabled
 * @param {number} chars - Number of characters to wrap at
 */
function applyWordWrap(enabled, chars) {
  const style = document.getElementById('wordWrapStyle') || document.createElement('style');
  style.id = 'wordWrapStyle';
  
  if (enabled) {
    // Limit max-width but keep text left-aligned
    style.textContent = `
      .ql-editor {
        max-width: 100% !important;
        width: 100% !important;
        white-space: pre-wrap !important;
        box-sizing: border-box !important;
      }
      .ql-editor > *,
      .quote-text > * {
        max-width: ${chars}ch !important;
        margin-left: 0 !important;
        margin-right: auto !important;
      }
      .ql-editor > p,
      .ql-editor > h1,
      .ql-editor > h2,
      .ql-editor > h3,
      .ql-editor > ul,
      .ql-editor > ol,
      .ql-editor > blockquote,
      .ql-editor > pre,
      .quote-text > p,
      .quote-text > h1,
      .quote-text > h2,
      .quote-text > h3,
      .quote-text > ul,
      .quote-text > ol,
      .quote-text > blockquote,
      .quote-text > pre {
        max-width: ${chars}ch !important;
        margin-left: 0 !important;
        margin-right: auto !important;
      }
      .welcome-quote-text {
        max-width: ${chars}ch !important;
      }
    `;
  } else {
    style.textContent = `
      .ql-editor {
        max-width: 100% !important;
        width: 100% !important;
        white-space: pre-wrap !important;
      }
      .ql-editor > *,
      .quote-text > * {
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
      .welcome-quote-text {
        max-width: 100% !important;
      }
    `;
  }
  
  if (!style.parentNode) {
    document.head.appendChild(style);
  }
}

// Export color functions for external use
export {
  lightenColor,
  darkenColor,
  applyButtonColor,
  applyLinkColor,
  applyHeaderColor,
  applyTagColor,
  applyDeleteColor,
  applyCancelColor,
  applyActiveCounterColor,
  applyTotalCounterColor,
  applyMenuColor,
  applyAppBgColor,
  applyModalFooterColor,
};

// ============= UI TOGGLE HELPERS =============

/**
 * Toggle metadata search section visibility
 */
export function toggleMetadataSearchSection(show) {
  const metadataContainer = getElementByIdSafe('metadataFiltersContainer');
  console.log('toggleMetadataSearchSection called:', show, 'metadataContainer found:', !!metadataContainer);
  if (metadataContainer) {
    metadataContainer.style.display = show ? 'block' : 'none';
    console.log('Set metadataContainer display to:', metadataContainer.style.display);
  }
}

/**
 * Apply quote sizing mode
 */
export function applyQuoteSizingMode(useRealSize) {
  const quotesList = getElementByIdSafe('quotesList');
  if (!quotesList) return;
  
  if (useRealSize) {
    quotesList.classList.add('natural-sizing');
  } else {
    quotesList.classList.remove('natural-sizing');
  }
}

/**
 * Toggle tag operations panel visibility
 */
export function toggleTagOperationsPanel(show) {
  const tagOpsPanel = document.querySelector('.tag-operations-panel');
  if (tagOpsPanel) {
    tagOpsPanel.style.display = show ? 'block' : 'none';
  }
}

// ============= SETTINGS INITIALIZATION =============

const SETTINGS_OPTIONS_TAB_KEY = 'settingsOptionsTab';
const VALID_SETTINGS_TABS = new Set(['general', 'colors', 'data-management', 'services', 'maintenance', 'note-types']);

function moveColorSettingsToTab() {
  const colorsRow = document.getElementById('settingsColorsRow');
  const colorSection = document.querySelector('.settings-section-colors');
  if (!colorsRow || !colorSection || colorSection.parentElement === colorsRow) return;

  colorSection.classList.add('settings-section-wide');
  colorsRow.appendChild(colorSection);

  const oldColumn = document.querySelector('.settings-general-colors-col');
  if (oldColumn && !oldColumn.querySelector('.settings-section-colors')) {
    oldColumn.remove();
  }
}

function initializeSettingsTabs() {
  moveColorSettingsToTab();

  const tabBtns = document.querySelectorAll('.settings-tab-btn[data-settings-tab]');
  const panels = document.querySelectorAll('.settings-tab-panel[data-settings-panel]');
  if (!tabBtns.length || !panels.length) return;

  const setTab = (tabId) => {
    if (!VALID_SETTINGS_TABS.has(tabId)) tabId = 'general';
    tabBtns.forEach((btn) => {
      const on = btn.dataset.settingsTab === tabId;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const on = panel.dataset.settingsPanel === tabId;
      panel.classList.toggle('active', on);
      panel.hidden = !on;
    });
    try { localStorage.setItem(SETTINGS_OPTIONS_TAB_KEY, tabId); } catch { /* ignore */ }
  };

  let saved = null;
  try { saved = localStorage.getItem(SETTINGS_OPTIONS_TAB_KEY); } catch { /* ignore */ }
  setTab(VALID_SETTINGS_TABS.has(saved) ? saved : 'general');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.settingsTab));
  });
}

/**
 * Initialize settings UI and event listeners
 * This is a large function that sets up all settings-related event listeners
 * @param {Object} callbacks - Callbacks for UI updates
 */
export function initializeSettings(callbacks = {}) {
  const {
    loadQuotes,
    populateTypeDropdowns,
    populateTypeFilterCheckboxes,
    populateTrainingTypeFilterCheckboxes,
    rebuildNoteTypeMenu,
    renderNoteTypesList: renderNoteTypesListCb,
    updateBulkButtonVisibility,
  } = callbacks;

  initializeSettingsTabs();

  const enableTagOpsCheckbox = getElementByIdSafe('enableTagOperations');
  const enableQuoteMetaSearchesCheckbox = getElementByIdSafe('enableQuoteMetaSearches');
  const displayQuotesMultipleAddButtonCheckbox = getElementByIdSafe('displayQuotesMultipleAddButton');
  const displayQuotesByRealSizeCheckbox = getElementByIdSafe('displayQuotesByRealSize');
  const showLongQuotesExpandedCheckbox = getElementByIdSafe('showLongQuotesExpanded');
  const displayScoreInCardsCheckbox = getElementByIdSafe('displayScoreInCards');
  const downscaleQuoteImagesCheckbox = getElementByIdSafe('downscaleQuoteImages');
  const appFontSelect = getElementByIdSafe('appFontSelect');

  if (appFontSelect) {
    populateAppFontSelect(appFontSelect);
    appFontSelect.value = applyAppFont(globalSettings?.appFont || DEFAULT_APP_FONT);
    appFontSelect.addEventListener('change', (e) => {
      const fontKey = applyAppFont(e.target.value);
      e.target.value = fontKey;
      updateSetting('appFont', fontKey);
    });
  }
  
  // Tag Operations setting
  if (enableTagOpsCheckbox) {
    // Load saved setting from globalSettings (default: true)
    const tagOpsEnabled = globalSettings?.enableTagOperations !== false;
    enableTagOpsCheckbox.checked = tagOpsEnabled;
    
    // Apply initial state
    toggleTagOperationsPanel(tagOpsEnabled);
    
    // Listen for changes
    enableTagOpsCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('enableTagOperations', isEnabled);
      toggleTagOperationsPanel(isEnabled);
    });
  }
  
  // Downscale Quote Images setting
  if (downscaleQuoteImagesCheckbox) {
    // Load saved setting from globalSettings (default: true/checked)
    const downscaleEnabled = globalSettings?.downscaleQuoteImages !== false;
    downscaleQuoteImagesCheckbox.checked = downscaleEnabled;
    
    // Listen for changes
    downscaleQuoteImagesCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('downscaleQuoteImages', isEnabled);
      console.log(`Image downscaling ${isEnabled ? 'ENABLED' : 'DISABLED'} - ${isEnabled ? 'images will be resized to 1024px' : 'RAW images will be stored (may use external storage)'}`);
    });
  }
  
  // External Storage Threshold setting
  const externalStorageThresholdSelect = getElementByIdSafe('externalStorageThreshold');
  if (externalStorageThresholdSelect) {
    // Load saved setting from globalSettings (default: 1 MB)
    const savedThreshold = globalSettings?.externalStorageThreshold || 1;
    externalStorageThresholdSelect.value = savedThreshold;
    
    // Listen for changes
    externalStorageThresholdSelect.addEventListener('change', (e) => {
      const thresholdMB = parseFloat(e.target.value);
      updateSetting('externalStorageThreshold', thresholdMB);
      console.log(`📦 External storage threshold set to ${thresholdMB} MB`);
      console.log(`   Files ≥ ${thresholdMB} MB will be stored in attachments/ folder`);
    });
    
    // Fetch default from server for display
    fetch(`${API_URL}/config/storage`)
      .then(res => res.json())
      .then(config => {
        console.log(`ℹ️ Server default threshold: ${config.defaultMaxDbSizeMB} MB (can be changed in Settings)`);
      })
      .catch(err => console.log('Could not fetch storage config:', err));
  }

  // ── Vault Path ─────────────────────────────────────────────────────────
  const vaultInput    = getElementByIdSafe('vaultPathInput');
  const vaultStatus   = getElementByIdSafe('vaultStatus');
  const vaultInfo     = getElementByIdSafe('vaultInfo');
  const vaultValidBtn = getElementByIdSafe('vaultValidateBtn');

  function setVaultStatus(msg, ok) {
    if (!vaultStatus) return;
    vaultStatus.textContent = msg;
    vaultStatus.style.color = ok === true ? 'var(--primary-color)' : ok === false ? 'var(--delete-color)' : 'var(--text-secondary)';
  }

  async function loadVaultInfo() {
    try {
      const r = await fetch(`${API_URL}/vault/info`);
      const d = await r.json();
      if (vaultInput && !vaultInput.dataset.userEditing) {
        vaultInput.value = d.vaultPath || '';
      }
      if (vaultInfo) {
        if (d.error) { vaultInfo.textContent = '⚠️ ' + d.error; return; }
        const label = d.isDefault ? ' (default, inside app folder)' : '';
        vaultInfo.textContent = `Active vault: ${d.vaultPath || '(default)'}${label} — ${d.totalFiles} files, ${d.totalSizeMB} MB | Settings: ${d.settingsFile} | Palettes: ${d.palettesDir}`;
      }
    } catch(e) { if (vaultInfo) vaultInfo.textContent = ''; }
  }

  if (vaultInput) {
    vaultInput.addEventListener('focus', () => { vaultInput.dataset.userEditing = '1'; });
    vaultInput.addEventListener('blur',  () => { delete vaultInput.dataset.userEditing; });
    // Vault path is saved via the settings save (updateSetting), which the server
    // now routes to local.json. Mark it pending change on blur.
    vaultInput.addEventListener('change', () => {
      updateSetting('vaultPath', vaultInput.value.trim());
    });
  }

  if (vaultValidBtn) {
    vaultValidBtn.addEventListener('click', async () => {
      const p = vaultInput?.value.trim() || '';
      setVaultStatus('Checking…', null);
      try {
        const r = await fetch(`${API_URL}/vault/validate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vaultPath: p })
        });
        const d = await r.json();
        setVaultStatus(d.message, d.valid);
      } catch(e) { setVaultStatus('Error: ' + e.message, false); }
    });
  }

  loadVaultInfo();
  // ── End Vault Path ──────────────────────────────────────────────────────

  // ── Migrate DB Attachments → Disk ────────────────────────────────────────
  const migrateAttachmentsBtn    = getElementByIdSafe('migrateAttachmentsBtn');
  const migrateAttachmentsResult = getElementByIdSafe('migrateAttachmentsResult');

  if (migrateAttachmentsBtn) {
    migrateAttachmentsBtn.addEventListener('click', async () => {
      if (!confirm('This will write all DB-stored attachment_full values to disk and update the database references. Continue?')) return;
      migrateAttachmentsBtn.disabled = true;
      migrateAttachmentsBtn.textContent = '⏳ Migrating…';
      if (migrateAttachmentsResult) migrateAttachmentsResult.textContent = '';
      try {
        const resp = await fetch('/api/migrate/attachments-to-disk', { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Migration failed');
        const msg = `✅ Migrated ${data.migrated} attachment(s) to disk, skipped ${data.skipped} (already on disk or invalid).`;
        if (migrateAttachmentsResult) {
          migrateAttachmentsResult.style.color = 'var(--success, green)';
          migrateAttachmentsResult.textContent = msg;
        }
      } catch (err) {
        const msg = `❌ Migration failed: ${err.message}`;
        if (migrateAttachmentsResult) {
          migrateAttachmentsResult.style.color = 'var(--danger, red)';
          migrateAttachmentsResult.textContent = msg;
        }
      } finally {
        migrateAttachmentsBtn.disabled = false;
        migrateAttachmentsBtn.textContent = '🔄 Migrate Attachments to Disk';
      }
    });
  }
  // ── End Migrate DB Attachments ────────────────────────────────────────────

  // Quote Meta Searches setting
  if (enableQuoteMetaSearchesCheckbox) {
    // Load saved setting from globalSettings (default: false)
    const quoteMetaSearchesEnabled = globalSettings?.enableQuoteMetaSearches === true;
    enableQuoteMetaSearchesCheckbox.checked = quoteMetaSearchesEnabled;
    
    // Apply initial state
    toggleMetadataSearchSection(quoteMetaSearchesEnabled);
    
    // Listen for changes
    enableQuoteMetaSearchesCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('enableQuoteMetaSearches', isEnabled);
      toggleMetadataSearchSection(isEnabled);
    });
  }

  // Quotes multiple-add button setting
  if (displayQuotesMultipleAddButtonCheckbox) {
    displayQuotesMultipleAddButtonCheckbox.checked = globalSettings?.displayQuotesMultipleAddButton === true;

    displayQuotesMultipleAddButtonCheckbox.addEventListener('change', (e) => {
      updateSetting('displayQuotesMultipleAddButton', e.target.checked);
      if (typeof updateBulkButtonVisibility === 'function') {
        updateBulkButtonVisibility();
      }
    });
  }
  
  // Display Notes by Natural Height setting (global default + per-type overrides)
  if (displayQuotesByRealSizeCheckbox) {
    const realSizeEnabled = globalSettings?.displayQuotesByRealSize === true;
    displayQuotesByRealSizeCheckbox.checked = realSizeEnabled;
    applyQuoteSizingMode(realSizeEnabled);
    renderPerTypeOverrides('perTypeOverrides-displayByRealSize', 'displayByRealSize', 'displayQuotesByRealSize', { loadQuotes });

    displayQuotesByRealSizeCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('displayQuotesByRealSize', isEnabled);
      applyQuoteSizingMode(isEnabled);
      // Re-render per-type rows so override indicators update relative to new global
      renderPerTypeOverrides('perTypeOverrides-displayByRealSize', 'displayByRealSize', 'displayQuotesByRealSize', { loadQuotes });
    });
  }

  // Display Long Notes Expanded setting (global default + per-type overrides)
  if (showLongQuotesExpandedCheckbox) {
    const expandLongEnabled = globalSettings?.showLongQuotesExpanded === true;
    showLongQuotesExpandedCheckbox.checked = expandLongEnabled;
    renderPerTypeOverrides('perTypeOverrides-showLongExpanded', 'showLongExpanded', 'showLongQuotesExpanded', { loadQuotes });

    showLongQuotesExpandedCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('showLongQuotesExpanded', isEnabled);
      renderPerTypeOverrides('perTypeOverrides-showLongExpanded', 'showLongExpanded', 'showLongQuotesExpanded', { loadQuotes });
      if (loadQuotes) loadQuotes();
    });
  }
  
  // Display Score in Cards setting
  if (displayScoreInCardsCheckbox) {
    // Load saved setting from globalSettings (default: false)
    const scoreInCardsEnabled = globalSettings?.displayScoreInCards === true;
    displayScoreInCardsCheckbox.checked = scoreInCardsEnabled;
    
    // Listen for changes
    displayScoreInCardsCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('displayScoreInCards', isEnabled);
      // Reload quotes to apply the setting
      if (loadQuotes) loadQuotes();
    });
  }

  // Stretch images when text is empty
  const stretchImagesWhenEmptyCheckbox = getElementByIdSafe('stretchImagesWhenEmpty');
  if (stretchImagesWhenEmptyCheckbox) {
    stretchImagesWhenEmptyCheckbox.checked = globalSettings?.stretchImagesWhenEmpty === true;
    stretchImagesWhenEmptyCheckbox.addEventListener('change', (e) => {
      updateSetting('stretchImagesWhenEmpty', e.target.checked);
      if (loadQuotes) loadQuotes();
    });
  }

  // Display empty title in card
  const displayEmptyTitleInCardCheckbox = getElementByIdSafe('displayEmptyTitleInCard');
  if (displayEmptyTitleInCardCheckbox) {
    displayEmptyTitleInCardCheckbox.checked = globalSettings?.displayEmptyTitleInCard === true;
    displayEmptyTitleInCardCheckbox.addEventListener('change', (e) => {
      updateSetting('displayEmptyTitleInCard', e.target.checked);
      if (loadQuotes) loadQuotes();
    });
  }

  // Word Wrap setting
  const enableWordWrapCheckbox = getElementByIdSafe('enableWordWrap');
  const wordWrapCharsInput = getElementByIdSafe('wordWrapChars');
  
  if (enableWordWrapCheckbox) {
    const wordWrapEnabled = globalSettings?.enableWordWrap !== false;
    enableWordWrapCheckbox.checked = wordWrapEnabled;
    
    const wordWrapChars = globalSettings?.wordWrapChars || 66;
    if (wordWrapCharsInput) {
      wordWrapCharsInput.value = wordWrapChars;
    }
    
    // Apply initial word wrap
    applyWordWrap(wordWrapEnabled, wordWrapChars);
    
    // Listen for checkbox changes
    enableWordWrapCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('enableWordWrap', isEnabled);
      const chars = wordWrapCharsInput ? parseInt(wordWrapCharsInput.value) || 66 : 66;
      applyWordWrap(isEnabled, chars);
    });
  }
  
  if (wordWrapCharsInput) {
    wordWrapCharsInput.addEventListener('change', (e) => {
      const chars = parseInt(e.target.value) || 66;
      updateSetting('wordWrapChars', chars);
      const isEnabled = enableWordWrapCheckbox ? enableWordWrapCheckbox.checked : true;
      applyWordWrap(isEnabled, chars);
    });
  }
  
  // Initialize color customization
  initializeColorCustomization();
  
  // Initialize type management
  renderQuoteTypesList(populateTypeDropdowns, populateTypeFilterCheckboxes);
  renderTrainingTypesList(populateTrainingTypeFilterCheckboxes);
  if (renderNoteTypesListCb) renderNoteTypesListCb();
  setupTypeManagementListeners(populateTypeDropdowns, populateTypeFilterCheckboxes, populateTrainingTypeFilterCheckboxes, rebuildNoteTypeMenu);
}

/**
 * Initialize color customization UI
 * (Extracted to keep initializeSettings more readable)
 */
function initializeColorCustomization() {
  // ── Color pickers and their controls ─────────────────────────────────────
  // Defined first so the palette loader can reference it directly (avoiding
  // the race condition caused by dispatching 16 concurrent saveSettings calls).
  const colorConfigs = [
    { id: 'appBg',        default: '#f8fafc', apply: applyAppBgColor },
    { id: 'menu',         default: '#2c3e50', apply: applyMenuColor },
    { id: 'card',         default: '#ffffff', apply: applyCardColor },
    { id: 'cardHover',    default: '#f0fff4', apply: applyCardHoverColor },
    { id: 'inputBg',      default: '#ffffff', apply: applyInputBgColor },
    { id: 'inputBorder',  default: '#e2e8f0', apply: applyInputBorderColor },
    { id: 'textColor',    default: '#1e293b', apply: applyTextColor },
    { id: 'header',       default: '#166534', apply: applyHeaderColor },
    { id: 'modalFooter',  default: '#d4d4d4', apply: applyModalFooterColor },
    { id: 'button',       default: '#1e40af', apply: applyButtonColor },
    { id: 'linkColor',    default: '#1e40af', apply: applyLinkColor },
    { id: 'delete',       default: '#ef4444', apply: applyDeleteColor },
    { id: 'cancel',       default: '#6b7280', apply: applyCancelColor },
    { id: 'tag',          default: '#2d6a4f', apply: applyTagColor },
    { id: 'activeCounter',default: '#dc2626', apply: applyActiveCounterColor },
    { id: 'totalCounter', default: '#047857', apply: applyTotalCounterColor },
  ];

  colorConfigs.forEach(config => {
    const picker = getElementByIdSafe(`${config.id}Color`);
    const text = getElementByIdSafe(`${config.id}ColorText`);
    const resetBtn = getElementByIdSafe(`reset${config.id.charAt(0).toUpperCase() + config.id.slice(1)}Color`);

    if (!picker) return;

    // Load saved color from globalSettings
    const savedColor = globalSettings?.colors?.[config.id] || config.default;
    picker.value = savedColor;
    if (text) text.value = savedColor;
    config.apply(savedColor);

    // Handle color picker changes
    picker.addEventListener('input', (e) => {
      const color = e.target.value;
      if (text) text.value = color;
      config.apply(color);
      updateSetting(`colors.${config.id}`, color);
    });

    // Handle text input changes
    if (text) {
      text.addEventListener('change', (e) => {
        const color = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) {
          picker.value = color;
          config.apply(color);
          updateSetting(`colors.${config.id}`, color);
        }
      });
    }

    // Handle reset button
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        picker.value = config.default;
        if (text) text.value = config.default;
        config.apply(config.default);
        updateSetting(`colors.${config.id}`, config.default);
      });
    }
  });

  // ── Palette toolbar: server-side select / save / delete + file import ────
  const savePaletteBtn   = getElementByIdSafe('savePaletteBtn');
  const loadPaletteBtn   = getElementByIdSafe('loadPaletteBtn');
  const paletteFileInput = getElementByIdSafe('paletteFileInput');
  const paletteSelect    = getElementByIdSafe('paletteSelect');
  const applyPaletteBtn  = getElementByIdSafe('applyPaletteBtn');
  const deletePaletteBtn = getElementByIdSafe('deletePaletteBtn');
  const paletteSaveStatus = getElementByIdSafe('paletteSaveStatus');

  function setPaletteStatus(msg, ok) {
    if (!paletteSaveStatus) return;
    paletteSaveStatus.textContent = msg;
    paletteSaveStatus.style.color = ok === true ? 'var(--primary-color)' : ok === false ? 'var(--delete-color)' : 'var(--text-secondary)';
  }

  async function refreshPaletteList(selectName) {
    if (!paletteSelect) return;
    try {
      const r = await fetch(`${API_URL}/palettes`);
      const names = await r.json();
      // Rebuild options
      paletteSelect.innerHTML = '<option value="">— select saved palette —</option>';
      for (const n of names) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        if (n === selectName) opt.selected = true;
        paletteSelect.appendChild(opt);
      }
    } catch (_) {}
  }

  // Helper: apply a palette object to UI + globalSettings (no save)
  async function applyPaletteObj(palette) {
    if (!palette.colors || typeof palette.colors !== 'object') {
      alert('Invalid palette — missing "colors" object.');
      return 0;
    }
    let applied = 0;
    for (const config of colorConfigs) {
      const color = palette.colors[config.id];
      if (!color) continue;
      config.apply(color);
      const picker = document.getElementById(`${config.id}Color`);
      const text   = document.getElementById(`${config.id}ColorText`);
      if (picker) picker.value = color;
      if (text)   text.value   = color;
      if (globalSettings) {
        if (!globalSettings.colors) globalSettings.colors = {};
        globalSettings.colors[config.id] = color;
      }
      applied++;
    }
    if (applied > 0) await saveSettings(globalSettings);
    return applied;
  }

  // Apply button — load from server and apply
  if (applyPaletteBtn) {
    applyPaletteBtn.addEventListener('click', async () => {
      const name = paletteSelect?.value;
      if (!name) { setPaletteStatus('Select a palette first.', false); return; }
      setPaletteStatus('Loading…', null);
      try {
        const r = await fetch(`${API_URL}/palettes/${encodeURIComponent(name)}`);
        if (!r.ok) { setPaletteStatus('Palette not found.', false); return; }
        const palette = await r.json();
        const applied = await applyPaletteObj(palette);
        setPaletteStatus(`✅ "${name}" applied — ${applied} colors.`, true);
      } catch (e) { setPaletteStatus('Error: ' + e.message, false); }
    });
  }

  // Delete button
  if (deletePaletteBtn) {
    deletePaletteBtn.addEventListener('click', async () => {
      const name = paletteSelect?.value;
      if (!name) { setPaletteStatus('Select a palette first.', false); return; }
      if (!confirm(`Delete palette "${name}"?`)) return;
      try {
        await fetch(`${API_URL}/palettes/${encodeURIComponent(name)}`, { method: 'DELETE' });
        setPaletteStatus(`Deleted "${name}".`, true);
        await refreshPaletteList('');
      } catch (e) { setPaletteStatus('Error: ' + e.message, false); }
    });
  }

  // Save as… button — save current colors to server
  if (savePaletteBtn) {
    savePaletteBtn.addEventListener('click', async () => {
      const suggestedName = paletteSelect?.value || 'my-palette';
      const name = prompt('Save palette as:', suggestedName);
      if (!name) return;
      const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!safeName) { setPaletteStatus('Invalid name.', false); return; }
      const palette = {
        name: safeName,
        savedAt: new Date().toISOString(),
        colors: globalSettings?.colors || {}
      };
      setPaletteStatus('Saving…', null);
      try {
        const r = await fetch(`${API_URL}/palettes/${encodeURIComponent(safeName)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(palette)
        });
        if (!r.ok) throw new Error(await r.text());
        setPaletteStatus(`✅ Saved as "${safeName}".`, true);
        await refreshPaletteList(safeName);
      } catch (e) { setPaletteStatus('Error: ' + e.message, false); }
    });
  }

  // Import JSON (file picker) — same as before but also offers to save to server
  if (loadPaletteBtn && paletteFileInput) {
    loadPaletteBtn.addEventListener('click', () => paletteFileInput.click());

    paletteFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const palette = JSON.parse(ev.target.result);
          const applied = await applyPaletteObj(palette);
          const name = palette.name ? `"${palette.name}"` : 'palette';
          const saveIt = applied > 0 && confirm(`✅ Imported ${name} — ${applied} colors applied.\n\nSave to vault as "${palette.name || 'imported'}"?`);
          if (saveIt) {
            const safeName = (palette.name || 'imported').replace(/[^a-zA-Z0-9_-]/g, '-');
            await fetch(`${API_URL}/palettes/${encodeURIComponent(safeName)}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...palette, name: safeName, savedAt: new Date().toISOString() })
            });
            await refreshPaletteList(safeName);
            setPaletteStatus(`Saved as "${safeName}".`, true);
          }
        } catch {
          alert('Could not read palette file — make sure it is a valid JSON file.');
        }
        paletteFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // Initial palette list load
  refreshPaletteList('');

  // Hide Notes with Encrypted Attachments setting
  const hideEncryptedNotesCheckbox = getElementByIdSafe('hideEncryptedNotes', 'initializeSettings');
  if (hideEncryptedNotesCheckbox) {
    hideEncryptedNotesCheckbox.addEventListener('change', (e) => {
      updateSetting('hideEncryptedNotes', e.target.checked);
      if (callbacks?.loadQuotes) callbacks.loadQuotes();
    });
  }

  // Hide Notes with Tag setting
  const hideTagCheckbox  = getElementByIdSafe('hideNotesWithTag', 'initializeSettings');
  const hideTagNameInput = getElementByIdSafe('hideTagName',      'initializeSettings');
  const hideTagNameRow   = getElementByIdSafe('hideTagNameRow',   'initializeSettings');

  // Restore saved tag name
  if (hideTagNameInput && globalSettings?.hideTagName) {
    hideTagNameInput.value = globalSettings.hideTagName;
  }
  // Show/hide the tag-name field based on current checkbox state
  if (hideTagNameRow && hideTagCheckbox) {
    hideTagNameRow.style.display = hideTagCheckbox.checked ? "flex" : "none";
  }

  if (hideTagCheckbox) {
    hideTagCheckbox.addEventListener('change', (e) => {
      updateSetting('hideNotesWithTag', e.target.checked);
      if (hideTagNameRow) hideTagNameRow.style.display = e.target.checked ? "flex" : "none";
      if (callbacks?.loadQuotes) callbacks.loadQuotes();
    });
  }

  if (hideTagNameInput) {
    hideTagNameInput.addEventListener('change', (e) => {
      updateSetting('hideTagName', e.target.value.trim());
      if (globalSettings) globalSettings.hideTagName = e.target.value.trim();
      if (callbacks?.loadQuotes) callbacks.loadQuotes();
    });
  }
}
