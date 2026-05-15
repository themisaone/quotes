/**
 * API Client Library
 * Handles all communication with the backend
 */

// Auto-detect API URL based on current host
export const API_URL = `${window.location.origin}/api`;

/**
 * Fetch with automatic retry logic
 * Useful for handling temporary connection issues (e.g., server restart)
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`Connection failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Get quotes with filters
 */
export async function getQuotes(filters = {}) {
  const params = new URLSearchParams();
  
  // Add all non-empty filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, value);
    }
  });
  
  const url = `${API_URL}/quotes?${params.toString()}`;
  const response = await fetchWithRetry(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch quotes: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get quote count with filters
 */
export async function getQuoteCount(filters = {}) {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, value);
    }
  });
  
  const url = `${API_URL}/quotes/count?${params.toString()}`;
  const response = await fetchWithRetry(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch count: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Generic GET request helper
 * @param {string} endpoint - The API endpoint (e.g., 'quotes/123', 'settings')
 * @param {string} resourceName - Name for error messages (e.g., 'quote', 'settings')
 */
async function getResource(endpoint, resourceName) {
  const response = await fetch(`${API_URL}/${endpoint}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${resourceName}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Generic POST/PUT/DELETE request helper
 * @param {string} endpoint - The API endpoint
 * @param {string} method - HTTP method ('POST', 'PUT', 'DELETE')
 * @param {Object} data - Request body (optional)
 * @param {string} resourceName - Name for error messages
 */
async function modifyResource(endpoint, method, data, resourceName) {
  const options = {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${API_URL}/${endpoint}`, options);
  
  if (!response.ok) {
    throw new Error(`Failed to ${method.toLowerCase()} ${resourceName}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get single quote by ID
 */
export async function getQuote(id) {
  return getResource(`quotes/${id}`, 'quote');
}

/**
 * Create new quote
 */
export async function createQuote(quoteData) {
  return modifyResource('quotes', 'POST', quoteData, 'quote');
}

/**
 * Update existing quote
 */
export async function updateQuote(id, quoteData) {
  return modifyResource(`quotes/${id}`, 'PUT', quoteData, 'quote');
}

/**
 * Delete quote
 */
export async function deleteQuote(id) {
  return modifyResource(`quotes/${id}`, 'DELETE', null, 'quote');
}

/**
 * Get training years (distinct years from training notes)
 */
export async function getTrainingYears() {
  return getResource('quotes/training-years', 'training years');
}

/**
 * Get settings from server
 */
export async function getSettings() {
  return getResource('settings', 'settings');
}

/**
 * Generic search function
 * @param {string} endpoint - The API endpoint ('authors', 'sources', 'tags')
 * @param {string} search - The search term
 * @param {string} queryParam - The query parameter name (default: 'search')
 */
async function searchGeneric(endpoint, search, queryParam = 'search') {
  const response = await fetch(`${API_URL}/${endpoint}?${queryParam}=${encodeURIComponent(search)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to search ${endpoint}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Search authors
 */
export async function searchAuthors(search) {
  return searchGeneric('authors', search);
}

/**
 * Search sources
 */
export async function searchSources(search) {
  return searchGeneric('sources', search);
}

/**
 * Search tags
 */
export async function searchTags(search) {
  return searchGeneric('tags/search', search, 'q');
}

/**
 * Save settings to server
 */
export async function saveSettings(settings) {
  return modifyResource('settings', 'POST', settings, 'settings');
}

/**
 * Export data to JSON
 */
export async function exportToJson(filters = {}) {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, value);
    }
  });
  
  const url = `${API_URL}/export/json?${params.toString()}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to export: ${response.statusText}`);
  }
  
  return response.blob();
}

/**
 * Import data from JSON
 */
export async function importFromJson(data, options = {}) {
  const response = await fetch(`${API_URL}/import/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, options })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to import: ${response.statusText}`);
  }
  
  return response.json();
}
