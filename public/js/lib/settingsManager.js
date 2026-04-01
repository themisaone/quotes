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

// ============= GLOBAL STATE =============

let globalSettings = null;

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

  container.innerHTML = '<span class="per-type-label">Per type:</span>';

  noteTypes.forEach(nt => {
    const override = nt.displaySettings?.[settingKey];
    const effectiveVal = override !== undefined ? override : globalVal;
    const isOverridden  = override !== undefined && override !== globalVal;

    const lbl = document.createElement('label');
    lbl.className = 'per-type-item' + (isOverridden ? ' per-type-overridden' : '');
    lbl.title = isOverridden ? `Override active (global default: ${globalVal})` : 'Same as global default';
    lbl.innerHTML = `<input type="checkbox" ${effectiveVal ? 'checked' : ''}><span>${nt.icon} ${nt.label}</span>`;

    const cb = lbl.querySelector('input');
    cb.addEventListener('change', async (e) => {
      await updateNoteTypeDisplaySetting(nt.value, settingKey, e.target.checked);
      lbl.classList.toggle('per-type-overridden', e.target.checked !== globalVal);
      lbl.title = e.target.checked !== globalVal
        ? `Override active (global default: ${globalVal})`
        : 'Same as global default';
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

  // Check if localStorage has any settings worth migrating
  const hasLocalSettings = 
    localStorage.getItem('downscaleQuoteImages') !== null ||
    localStorage.getItem('externalStorageThreshold') !== null ||
    localStorage.getItem('compactMode') !== null ||
    localStorage.getItem('quoteTypes') !== null ||
    localStorage.getItem('enableTagOperations') !== null ||
    localStorage.getItem('enableQuoteMetaSearches') !== null ||
    localStorage.getItem('displayQuotesByRealSize') !== null ||
    localStorage.getItem('displayImageQuotesLong') !== null ||
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
  
  if (localStorage.getItem('displayImageQuotesLong') !== null) {
    migratedSettings.displayImageQuotesLong = localStorage.getItem('displayImageQuotesLong') === 'true';
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
  
  // Apply all checkbox settings
  const checkboxMappings = [
    // Note: 'compactModeToggle' removed - feature deprecated, element doesn't exist in HTML
    { id: 'enableTagOperations', setting: 'enableTagOperations' },
    { id: 'enableQuoteMetaSearches', setting: 'enableQuoteMetaSearches' },
    { id: 'displayQuotesByRealSize', setting: 'displayQuotesByRealSize' },
    { id: 'displayImageQuotesLong', setting: 'displayImageQuotesLong' },
    { id: 'showLongQuotesExpanded', setting: 'showLongQuotesExpanded' },
    { id: 'displayScoreInCards', setting: 'displayScoreInCards' },
    { id: 'downscaleQuoteImages', setting: 'downscaleQuoteImages' },
    { id: 'enableWordWrap', setting: 'enableWordWrap' }
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
export function getTrainingTypes() {
  if (!globalSettings) {
    throw new Error('Settings not loaded. Please refresh the page.');
  }
  const trainingNoteType = (globalSettings.noteTypes || []).find(t => t.behavior === 'training');
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

  const types = getNoteTypesSettings();

  const behaviorLabel = (b) => ({ quote: '📖 Quote', training: '🏋️ Training', generic: '📄 Generic' }[b] || b);

  const subTypeRowHtml = (sub, ntIdx, sIdx, canDelete) => `
    <div class="subtype-item" data-nt="${ntIdx}" data-si="${sIdx}">
      <input type="text" class="subtype-icon"  value="${sub.icon}"  placeholder="📝" maxlength="2" />
      <input type="text" class="subtype-value" value="${sub.value}" placeholder="VALUE" style="width:90px;text-transform:uppercase;" />
      <input type="text" class="subtype-label" value="${sub.label}" placeholder="Label" />
      ${canDelete ? `<button type="button" class="btn-icon-small btn-delete-subtype" title="Delete subtype">🗑️</button>` : ''}
    </div>`;

  container.innerHTML = types.map((type, index) => {
    const hasSubs = type.behavior === 'quote' || type.behavior === 'training';
    const subs = type.subTypes || [];
    const behaviorOpts = ['quote','training','generic'].map(b =>
      `<option value="${b}" ${(type.behavior||'generic')===b?'selected':''}>${behaviorLabel(b)}</option>`).join('');
    const subsHtml = hasSubs ? `
      <div class="subtype-section">
        <div class="subtype-header">
          <span>↳ Sub-types (${subs.length})</span>
          <button type="button" class="btn-add-subtype btn-icon-small" data-nt="${index}" title="Add sub-type">➕</button>
        </div>
        <div class="subtype-list" data-nt="${index}">
          ${subs.map((s, si) => subTypeRowHtml(s, index, si, subs.length > 1)).join('')}
        </div>
      </div>` : '';

    return `
    <div class="quote-type-item note-type-row" data-index="${index}">
      <div class="note-type-main-row">
        <input type="text" class="note-type-icon-input"  value="${type.icon}"  placeholder="📝" maxlength="2" title="Icon" />
        <input type="text" class="note-type-value-input" value="${type.value}" placeholder="value" title="Internal key stored in database" />
        <input type="text" class="note-type-label-input" value="${type.label}" placeholder="Label" title="Display label" />
        <select class="note-type-behavior-select" title="Controls which fields appear in the edit modal">
          ${behaviorOpts}
        </select>
        <div class="quote-type-actions">
          <button type="button" class="btn-icon-small btn-delete-type" title="Delete note type">🗑️</button>
        </div>
      </div>
      ${subsHtml}
    </div>`;
  }).join('');

  // ── Wire up note type main row ──
  container.querySelectorAll('.note-type-row').forEach((row, index) => {
    const iconInput     = row.querySelector('.note-type-icon-input');
    const valueInput    = row.querySelector('.note-type-value-input');
    const labelInput    = row.querySelector('.note-type-label-input');
    const behaviorSel   = row.querySelector('.note-type-behavior-select');
    const deleteBtn     = row.querySelector('.btn-delete-type');

    const updateType = () => {
      const current = getNoteTypesSettings();
      current[index] = {
        ...current[index],
        icon:     iconInput.value  || '📝',
        label:    labelInput.value || 'Custom',
        value:    valueInput?.value?.trim()  || current[index].value,
        behavior: behaviorSel?.value         || current[index].behavior,
      };
      saveNoteTypesAndRefresh(current, rebuildMenuFn);
    };
    iconInput.addEventListener('change', updateType);
    labelInput.addEventListener('change', updateType);
    if (valueInput)   valueInput.addEventListener('change', updateType);
    if (behaviorSel)  behaviorSel.addEventListener('change', updateType);

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const current = getNoteTypesSettings();
        if (await showConfirm(`Existing notes of this type will still exist but won't appear in the menu.`, {
          title: `Delete note type "${current[index].label}"?`,
          danger: true,
        })) {
          current.splice(index, 1);
          saveNoteTypesAndRefresh(current, rebuildMenuFn);
        }
      });
    }

    // ── Wire up subtype rows ──
    row.querySelectorAll('.subtype-item').forEach((sRow) => {
      const ntIdx = parseInt(sRow.dataset.nt);
      const siIdx = parseInt(sRow.dataset.si);
      const iconI  = sRow.querySelector('.subtype-icon');
      const valueI = sRow.querySelector('.subtype-value');
      const labelI = sRow.querySelector('.subtype-label');
      const delBtn = sRow.querySelector('.btn-delete-subtype');

      const updateSub = () => {
        const current = getNoteTypesSettings();
        if (!current[ntIdx].subTypes) current[ntIdx].subTypes = [];
        current[ntIdx].subTypes[siIdx] = {
          icon:  iconI.value  || '📝',
          value: (valueI.value || 'CUSTOM').toUpperCase().replace(/[^A-Z0-9/\-_]/g, ''),
          label: labelI.value || 'Custom'
        };
        saveNoteTypesAndRefresh(current, rebuildMenuFn);
      };
      iconI.addEventListener('change', updateSub);
      valueI.addEventListener('change', updateSub);
      labelI.addEventListener('change', updateSub);

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
  });
}

function saveNoteTypesAndRefresh(types, rebuildMenuFn) {
  if (globalSettings) {
    globalSettings.noteTypes = types;
    saveSettings(globalSettings).then(success => {
      if (success) {
        // Re-init the dynamic noteTypes module
        import('./noteTypes.js').then(({ initNoteTypes }) => {
          initNoteTypes(types);
          renderNoteTypesList(rebuildMenuFn);
          if (rebuildMenuFn) rebuildMenuFn();
          console.log('✅ Note types updated');
        });
      }
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
    types.push({ icon: '📌', value, label: 'Custom Type', behavior: 'generic' });
    saveNoteTypesAndRefresh(types, rebuildMenuFn);
  });
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
 * Apply button color
 */
function applyButtonColor(color) {
  document.documentElement.style.setProperty('--primary-color', color);
  // Calculate hover color (darker)
  const hoverColor = darkenColor(color, 15);
  document.documentElement.style.setProperty('--primary-hover', hoverColor);
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
  const counters = document.querySelectorAll(
    '#filteredQuotesCount, #filteredAuthorsCount, #filteredSourcesCount, #filteredTagsCount'
  );
  counters.forEach(counter => {
    counter.style.backgroundColor = color;
  });
}

/**
 * Apply total counter color
 */
function applyTotalCounterColor(color) {
  const counters = document.querySelectorAll(
    '#totalQuotesCount, #totalAuthorsCount, #totalSourcesCount, #totalTagsCount'
  );
  counters.forEach(counter => {
    counter.style.backgroundColor = color;
  });
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
      .ql-editor > * {
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
      .ql-editor > pre {
        max-width: ${chars}ch !important;
        margin-left: 0 !important;
        margin-right: auto !important;
      }
    `;
  } else {
    style.textContent = `
      .ql-editor {
        max-width: 100% !important;
        width: 100% !important;
        white-space: pre-wrap !important;
      }
      .ql-editor > * {
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
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
  } = callbacks;

  const enableTagOpsCheckbox = getElementByIdSafe('enableTagOperations');
  const enableQuoteMetaSearchesCheckbox = getElementByIdSafe('enableQuoteMetaSearches');
  const displayQuotesByRealSizeCheckbox = getElementByIdSafe('displayQuotesByRealSize');
  const displayImageQuotesLongCheckbox = getElementByIdSafe('displayImageQuotesLong');
  const showLongQuotesExpandedCheckbox = getElementByIdSafe('showLongQuotesExpanded');
  const displayScoreInCardsCheckbox = getElementByIdSafe('displayScoreInCards');
  const downscaleQuoteImagesCheckbox = getElementByIdSafe('downscaleQuoteImages');
  
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

  // Display Image Notes Full Width setting
  if (displayImageQuotesLongCheckbox) {
    const imageLongEnabled = globalSettings?.displayImageQuotesLong === true;
    displayImageQuotesLongCheckbox.checked = imageLongEnabled;

    displayImageQuotesLongCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('displayImageQuotesLong', isEnabled);
      if (loadQuotes) loadQuotes();
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

  // ── Quick Tag Shortcuts ──────────────────────────────────────────────────
  const shortcutTypeSelect = getElementByIdSafe('shortcutNoteTypeSelect');
  const shortcutTagInput   = getElementByIdSafe('shortcutTagInput');
  const shortcutAddBtn     = getElementByIdSafe('shortcutTagAddBtn');
  const shortcutList       = getElementByIdSafe('shortcutTagsList');

  function renderShortcutTags() {
    if (!shortcutList || !shortcutTypeSelect) return;
    const type = shortcutTypeSelect.value;
    const tags = globalSettings?.highlightedTags?.[type] || [];
    shortcutList.innerHTML = tags.map(tag => `
      <span style="display:inline-flex;align-items:center;gap:0.3rem;background:var(--tag-color);color:white;padding:0.2rem 0.55rem;border-radius:12px;font-size:0.85rem;">
        ${tag}
        <span data-remove="${tag}" style="cursor:pointer;font-weight:bold;opacity:0.8;" title="Remove">&times;</span>
      </span>`).join('');
    shortcutList.querySelectorAll('[data-remove]').forEach(x => {
      x.addEventListener('click', async () => {
        const t = x.dataset.remove;
        if (!globalSettings.highlightedTags) globalSettings.highlightedTags = {};
        globalSettings.highlightedTags[type] = (globalSettings.highlightedTags[type] || []).filter(v => v !== t);
        await saveSettings(globalSettings);
        renderShortcutTags();
        if (rebuildNoteTypeMenu) rebuildNoteTypeMenu();
      });
    });
  }

  if (shortcutTypeSelect) {
    // Populate the note-type selector
    const noteTypes = globalSettings?.noteTypes || [];
    noteTypes.forEach(nt => {
      const opt = document.createElement('option');
      opt.value = nt.value;
      opt.textContent = `${nt.icon || ''} ${nt.label}`;
      shortcutTypeSelect.appendChild(opt);
    });
    shortcutTypeSelect.addEventListener('change', renderShortcutTags);
    renderShortcutTags();
  }

  if (shortcutAddBtn && shortcutTagInput && shortcutTypeSelect) {
    const doAdd = async () => {
      const tag  = shortcutTagInput.value.trim();
      const type = shortcutTypeSelect.value;
      if (!tag || !type) return;
      if (!globalSettings.highlightedTags) globalSettings.highlightedTags = {};
      const arr = globalSettings.highlightedTags[type] || [];
      if (!arr.includes(tag)) {
        arr.push(tag);
        globalSettings.highlightedTags[type] = arr;
        await saveSettings(globalSettings);
        if (rebuildNoteTypeMenu) rebuildNoteTypeMenu();
      }
      shortcutTagInput.value = '';
      renderShortcutTags();
    };
    shortcutAddBtn.addEventListener('click', doAdd);
    shortcutTagInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  }
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

  // ── Save / Load palette buttons ──────────────────────────────────────────
  // The load handler uses colorConfigs directly to avoid the race condition
  // that occurred when 16 concurrent updateSetting() calls all called
  // saveSettings() and the last-to-arrive overwrote later colors with stale data.
  const savePaletteBtn   = getElementByIdSafe('savePaletteBtn');
  const loadPaletteBtn   = getElementByIdSafe('loadPaletteBtn');
  const paletteFileInput = getElementByIdSafe('paletteFileInput');

  if (savePaletteBtn) {
    savePaletteBtn.addEventListener('click', () => {
      const colors = globalSettings?.colors || {};
      const palette = {
        name: 'My Palette',
        exportedAt: new Date().toISOString(),
        colors
      };
      const blob = new Blob([JSON.stringify(palette, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `palette-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (loadPaletteBtn && paletteFileInput) {
    loadPaletteBtn.addEventListener('click', () => paletteFileInput.click());

    paletteFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const palette = JSON.parse(ev.target.result);
          if (!palette.colors || typeof palette.colors !== 'object') {
            alert('Invalid palette file — missing "colors" object.');
            return;
          }

          // Apply every color synchronously via colorConfigs, update globalSettings,
          // then do ONE saveSettings call — no race condition possible.
          let applied = 0;
          for (const config of colorConfigs) {
            const color = palette.colors[config.id];
            if (!color) continue;

            // Apply CSS variable immediately
            config.apply(color);

            // Update picker + text display
            const picker = document.getElementById(`${config.id}Color`);
            const text   = document.getElementById(`${config.id}ColorText`);
            if (picker) picker.value = color;
            if (text)   text.value   = color;

            // Accumulate into globalSettings (no save yet)
            if (globalSettings) {
              if (!globalSettings.colors) globalSettings.colors = {};
              globalSettings.colors[config.id] = color;
            }
            applied++;
          }

          // Single atomic save for all color changes
          if (applied > 0) await saveSettings(globalSettings);

          const name = palette.name ? `"${palette.name}"` : 'palette';
          alert(`✅ Loaded ${name} — ${applied} colors applied.`);
        } catch {
          alert('Could not read palette file — make sure it is a valid JSON file.');
        }
        paletteFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }
}
