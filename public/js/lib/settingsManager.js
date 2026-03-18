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
 * Migrate localStorage settings to file (one-time)
 */
async function migrateLocalStorageToFile() {
  // Check if localStorage has any settings
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
  
  if (!hasLocalSettings) return;
  
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
    // Keep localStorage for now (don't break if offline)
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
  
  // Apply colors to CSS
  if (globalSettings.colors) {
    if (globalSettings.colors.button) applyButtonColor(globalSettings.colors.button);
    if (globalSettings.colors.header) applyHeaderColor(globalSettings.colors.header);
    if (globalSettings.colors.tag) applyTagColor(globalSettings.colors.tag);
    if (globalSettings.colors.delete) applyDeleteColor(globalSettings.colors.delete);
    if (globalSettings.colors.cancel) applyCancelColor(globalSettings.colors.cancel);
    if (globalSettings.colors.activeCounter) applyActiveCounterColor(globalSettings.colors.activeCounter);
    if (globalSettings.colors.totalCounter) applyTotalCounterColor(globalSettings.colors.totalCounter);
    if (globalSettings.colors.menu) applyMenuColor(globalSettings.colors.menu);
    if (globalSettings.colors.appBg) applyAppBgColor(globalSettings.colors.appBg);
    if (globalSettings.colors.modalFooter) applyModalFooterColor(globalSettings.colors.modalFooter);
  }
  
  // Apply colors to color picker inputs
  const colorInputMappings = [
    { id: 'buttonColor', colorKey: 'button' },
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
 * Get quote types (from global settings)
 */
export function getQuoteTypes() {
  // Require global settings to be loaded
  if (!globalSettings) {
    console.error('❌ FATAL: globalSettings not loaded! Settings must be initialized before calling getQuoteTypes()');
    throw new Error('Settings not loaded. Please refresh the page.');
  }
  
  if (!globalSettings.quoteTypes || !Array.isArray(globalSettings.quoteTypes)) {
    console.error('❌ FATAL: quoteTypes missing or invalid in settings:', globalSettings);
    throw new Error('Quote types configuration is missing or invalid in settings.json');
  }
  
  return globalSettings.quoteTypes;
}

/**
 * Save quote types (deprecated - use saveSettings instead)
 */
export function saveQuoteTypes(types) {
  // Update global settings
  if (globalSettings) {
    globalSettings.quoteTypes = types;
    saveSettings(globalSettings);
  } else {
    // Fallback to localStorage
    localStorage.setItem('quoteTypes', JSON.stringify(types));
  }
}

/**
 * Render quote types list in settings UI
 */
export function renderQuoteTypesList(populateTypeDropdowns, populateTypeFilterCheckboxes) {
  const container = getElementByIdSafe('quoteTypesList', 'renderQuoteTypesList');
  if (!container) return;
  
  const types = getQuoteTypes();
  
  container.innerHTML = types.map((type, index) => `
    <div class="quote-type-item" data-index="${index}">
      <input type="text" class="quote-type-icon-input" value="${type.icon}" placeholder="📖" maxlength="2" />
      <input type="text" class="quote-type-value-input" value="${type.value}" placeholder="BOOK" />
      <input type="text" class="quote-type-label-input" value="${type.label}" placeholder="Book" />
      <div class="quote-type-actions">
        ${types.length > 1 ? '<button class="btn-icon-small btn-delete-type" title="Delete Type">🗑️</button>' : ''}
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  container.querySelectorAll('.quote-type-item').forEach((item, index) => {
    const iconInput = item.querySelector('.quote-type-icon-input');
    const valueInput = item.querySelector('.quote-type-value-input');
    const labelInput = item.querySelector('.quote-type-label-input');
    const deleteBtn = item.querySelector('.btn-delete-type');
    
    // Update on change
    const updateType = () => {
      const types = getQuoteTypes();
      types[index] = {
        icon: iconInput.value || '📖',
        value: valueInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'CUSTOM',
        label: labelInput.value || 'Custom'
      };
      saveQuoteTypesAndRefresh(types, populateTypeDropdowns, populateTypeFilterCheckboxes);
    };
    
    iconInput.addEventListener('change', updateType);
    valueInput.addEventListener('change', updateType);
    labelInput.addEventListener('change', updateType);
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete type "${types[index].label}"? This cannot be undone.`)) {
          const types = getQuoteTypes();
          types.splice(index, 1);
          saveQuoteTypesAndRefresh(types, populateTypeDropdowns, populateTypeFilterCheckboxes);
        }
      });
    }
  });
}

/**
 * Save quote types and refresh UI
 */
function saveQuoteTypesAndRefresh(types, populateTypeDropdowns, populateTypeFilterCheckboxes) {
  // Save to file via API
  if (globalSettings) {
    globalSettings.quoteTypes = types;
    saveSettings(globalSettings).then(success => {
      if (success) {
        renderQuoteTypesList(populateTypeDropdowns, populateTypeFilterCheckboxes);
        if (populateTypeDropdowns) populateTypeDropdowns();
        if (populateTypeFilterCheckboxes) populateTypeFilterCheckboxes();
        console.log('✅ Quote types updated');
      }
    });
  } else {
    // Fallback to localStorage
    saveQuoteTypes(types);
    renderQuoteTypesList(populateTypeDropdowns, populateTypeFilterCheckboxes);
    if (populateTypeDropdowns) populateTypeDropdowns();
    if (populateTypeFilterCheckboxes) populateTypeFilterCheckboxes();
  }
}

// ============= TYPE MANAGEMENT - TRAINING =============

/**
 * Get training types from settings
 */
export function getTrainingTypes() {
  // Require global settings to be loaded
  if (!globalSettings) {
    console.error('❌ FATAL: globalSettings not loaded! Settings must be initialized before calling getTrainingTypes()');
    throw new Error('Settings not loaded. Please refresh the page.');
  }
  
  if (!globalSettings.trainingTypes || !Array.isArray(globalSettings.trainingTypes)) {
    console.error('❌ FATAL: trainingTypes missing or invalid in settings:', globalSettings);
    throw new Error('Training types configuration is missing or invalid in settings.json');
  }
  
  return globalSettings.trainingTypes;
}

/**
 * Save training types
 */
export function saveTrainingTypes(types) {
  // Update global settings
  if (globalSettings) {
    globalSettings.trainingTypes = types;
    saveSettings(globalSettings);
  } else {
    // Fallback to localStorage
    localStorage.setItem('trainingTypes', JSON.stringify(types));
  }
}

/**
 * Render training types list in settings UI
 */
export function renderTrainingTypesList(populateTrainingTypeFilterCheckboxes) {
  const container = getElementByIdSafe('trainingTypesList');
  if (!container) return;
  
  const types = getTrainingTypes();
  
  container.innerHTML = types.map((type, index) => `
    <div class="quote-type-item" data-index="${index}">
      <input type="text" class="quote-type-icon-input" value="${type.icon}" placeholder="🏋️" maxlength="2" />
      <input type="text" class="quote-type-value-input" value="${type.value}" placeholder="WEIGHTS" />
      <input type="text" class="quote-type-label-input" value="${type.label}" placeholder="Weights" />
      <div class="quote-type-actions">
        ${types.length > 1 ? '<button class="btn-icon-small btn-delete-type" title="Delete Type">🗑️</button>' : ''}
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  container.querySelectorAll('.quote-type-item').forEach((item, index) => {
    const iconInput = item.querySelector('.quote-type-icon-input');
    const valueInput = item.querySelector('.quote-type-value-input');
    const labelInput = item.querySelector('.quote-type-label-input');
    const deleteBtn = item.querySelector('.btn-delete-type');
    
    // Update on change
    const updateType = () => {
      const types = getTrainingTypes();
      types[index] = {
        icon: iconInput.value || '🏋️',
        value: valueInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'CUSTOM',
        label: labelInput.value || 'Custom'
      };
      saveTrainingTypesAndRefresh(types, populateTrainingTypeFilterCheckboxes);
    };
    
    iconInput.addEventListener('change', updateType);
    valueInput.addEventListener('change', updateType);
    labelInput.addEventListener('change', updateType);
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete training type "${types[index].label}"? This cannot be undone.`)) {
          const types = getTrainingTypes();
          types.splice(index, 1);
          saveTrainingTypesAndRefresh(types, populateTrainingTypeFilterCheckboxes);
        }
      });
    }
  });
}

/**
 * Save training types and refresh UI
 */
function saveTrainingTypesAndRefresh(types, populateTrainingTypeFilterCheckboxes) {
  // Save to file via API
  if (globalSettings) {
    globalSettings.trainingTypes = types;
    saveSettings(globalSettings).then(success => {
      if (success) {
        renderTrainingTypesList(populateTrainingTypeFilterCheckboxes);
        if (populateTrainingTypeFilterCheckboxes) populateTrainingTypeFilterCheckboxes();
        console.log('✅ Training types updated');
      }
    });
  } else {
    // Fallback to localStorage
    saveTrainingTypes(types);
    renderTrainingTypesList(populateTrainingTypeFilterCheckboxes);
    if (populateTrainingTypeFilterCheckboxes) populateTrainingTypeFilterCheckboxes();
  }
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
 * Render note types list in settings UI
 */
export function renderNoteTypesList(rebuildMenuFn) {
  const container = getElementByIdSafe('noteTypesList', 'renderNoteTypesList');
  if (!container) return;

  const types = getNoteTypesSettings();

  const behaviorBadge = (b) => {
    const badges = { quote: '📖 Quote', training: '🏋️ Training', generic: '📄 Generic' };
    return `<span class="note-type-behavior-badge" title="Behavior determines which fields are shown">${badges[b] || b}</span>`;
  };

  container.innerHTML = types.map((type, index) => `
    <div class="quote-type-item" data-index="${index}">
      <input type="text" class="note-type-icon-input" value="${type.icon}" placeholder="📝" maxlength="2" ${type.core ? 'title="Core type — icon only editable"' : ''} />
      <input type="text" class="note-type-label-input" value="${type.label}" placeholder="My Type" />
      ${behaviorBadge(type.behavior || 'generic')}
      <div class="quote-type-actions">
        ${!type.core ? `<button class="btn-icon-small btn-delete-type" title="Delete Type">🗑️</button>` : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.quote-type-item').forEach((item, index) => {
    const iconInput = item.querySelector('.note-type-icon-input');
    const labelInput = item.querySelector('.note-type-label-input');
    const deleteBtn = item.querySelector('.btn-delete-type');

    const updateType = () => {
      const current = getNoteTypesSettings();
      current[index] = {
        ...current[index],
        icon: iconInput.value || '📝',
        label: labelInput.value || 'Custom',
      };
      saveNoteTypesAndRefresh(current, rebuildMenuFn);
    };

    iconInput.addEventListener('change', updateType);
    labelInput.addEventListener('change', updateType);

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const current = getNoteTypesSettings();
        if (confirm(`Delete note type "${current[index].label}"?\nExisting notes of this type will still exist in the database but won't appear in the menu.`)) {
          current.splice(index, 1);
          saveNoteTypesAndRefresh(current, rebuildMenuFn);
        }
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

/**
 * Apply header color
 */
function applyHeaderColor(color) {
  const modalHeaders = document.querySelectorAll('.modal-header');
  modalHeaders.forEach(header => {
    header.style.backgroundColor = color;
  });
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
  const deleteButtons = document.querySelectorAll('.btn-danger');
  deleteButtons.forEach(btn => {
    btn.style.backgroundColor = color;
    // Calculate darker hover color
    const hoverColor = darkenColor(color, 10);
    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = hoverColor;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = color;
    });
  });
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
  // Apply to Author, Source, and Quote/Note modal footers
  const style = document.getElementById('modalFooterStyle') || document.createElement('style');
  style.id = 'modalFooterStyle';
  style.textContent = `
    #authorModal .form-actions { background: ${color} !important; }
    #sourceModal .form-actions { background: ${color} !important; }
    #quoteModal .form-actions { background: ${color} !important; }
  `;
  if (!style.parentNode) {
    document.head.appendChild(style);
  }
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
  
  // Display Quotes by Real Size setting
  if (displayQuotesByRealSizeCheckbox) {
    // Load saved setting from globalSettings (default: false)
    const realSizeEnabled = globalSettings?.displayQuotesByRealSize === true;
    displayQuotesByRealSizeCheckbox.checked = realSizeEnabled;
    
    // Apply initial state
    applyQuoteSizingMode(realSizeEnabled);
    
    // Listen for changes
    displayQuotesByRealSizeCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('displayQuotesByRealSize', isEnabled);
      applyQuoteSizingMode(isEnabled);
    });
  }
  
  // Display Image Quotes Long setting
  if (displayImageQuotesLongCheckbox) {
    // Load saved setting from globalSettings (default: false)
    const imageLongEnabled = globalSettings?.displayImageQuotesLong === true;
    displayImageQuotesLongCheckbox.checked = imageLongEnabled;
    
    // Listen for changes
    displayImageQuotesLongCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('displayImageQuotesLong', isEnabled);
      // Reload quotes to apply the setting
      if (loadQuotes) loadQuotes();
    });
  }
  
  // Show Long Quotes Expanded setting
  if (showLongQuotesExpandedCheckbox) {
    // Load saved setting from globalSettings (default: false)
    const expandLongEnabled = globalSettings?.showLongQuotesExpanded === true;
    showLongQuotesExpandedCheckbox.checked = expandLongEnabled;
    
    // Listen for changes
    showLongQuotesExpandedCheckbox.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSetting('showLongQuotesExpanded', isEnabled);
      // Reload quotes to apply the setting
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
}

/**
 * Initialize color customization UI
 * (Extracted to keep initializeSettings more readable)
 */
function initializeColorCustomization() {
  // ── Save / Load palette buttons ──────────────────────────────────────────
  const savePaletteBtn  = getElementByIdSafe('savePaletteBtn');
  const loadPaletteBtn  = getElementByIdSafe('loadPaletteBtn');
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
      reader.onload = (ev) => {
        try {
          const palette = JSON.parse(ev.target.result);
          if (!palette.colors || typeof palette.colors !== 'object') {
            alert('Invalid palette file — missing "colors" object.');
            return;
          }

          // Apply each color by setting the picker value and firing its 'input' event.
          // The existing event listener in initializeColorCustomization() will then call
          // the correct apply() function (CSS variables) AND updateSetting() for us.
          const validKeys = ['button','header','tag','delete','cancel','activeCounter','totalCounter','menu','appBg','modalFooter'];
          let applied = 0;
          for (const key of validKeys) {
            const color = palette.colors[key];
            if (!color) continue;
            const picker = document.getElementById(`${key}Color`);
            const text   = document.getElementById(`${key}ColorText`);
            if (picker) {
              picker.value = color;
              picker.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (text) text.value = color;
            applied++;
          }

          const name = palette.name ? `"${palette.name}"` : 'palette';
          // Show brief confirmation; settings are already saved by the dispatched events
          setTimeout(() => {
            alert(`✅ Loaded ${name} — ${applied} colors applied.`);
          }, 50);
        } catch {
          alert('Could not read palette file — make sure it is a valid JSON file.');
        }
        paletteFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // ── Color pickers and their controls ────────────────────────────────────
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
}
