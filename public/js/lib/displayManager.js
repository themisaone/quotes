/**
 * displayManager.js
 * 
 * Main quotes/notes display and list management
 * Handles loading, filtering, pagination, and rendering the main list view
 * 
 * EXTRACTED FROM app.js - Initial extraction, maintainability refactoring pending
 * 
 * Main functions:
 * - loadQuotes() - Load and display quotes with current filters
 * - displayQuotes() - Render quotes list
 * - loadTotalCount() - Update counters
 * 
 * Dependencies:
 * - api.js for API_URL and fetchWithRetry
 * - cardRenderer.js for createQuoteCard
 */

import { API_URL, fetchWithRetry } from './api.js';
import { createQuoteCard } from './cardRenderer.js';

// Module state
let currentQuotesData = []; // Store for PDF export
let currentPage = 1;
const quotesPerPage = 20;

/**
 * Build URL parameters for quotes API based on current filters
 */
function buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const params = new URLSearchParams();
  
  // Search filters
  const searchQuote = document.getElementById("searchQuote");
  const searchAuthor = document.getElementById("searchAuthor");
  const searchSource = document.getElementById("searchSource");
  const searchTags = document.getElementById("searchTags");
  const searchScore = document.getElementById("searchScore");
  
  if (searchQuote?.value) params.append("quote", searchQuote.value);
  if (searchAuthor?.value) params.append("author", searchAuthor.value);
  if (searchSource?.value) params.append("source", searchSource.value);
  if (searchTags?.value) params.append("tags", searchTags.value);
  if (searchScore?.value) params.append("score", searchScore.value);
  
  // Note type filter
  if (currentNoteTypeFilter) {
    params.append("note_type", currentNoteTypeFilter);
  }

  // Quote source type filters (for Quote view or All Notes view)
  if (currentNoteTypeFilter === null || currentNoteTypeFilter === 'quote') {
    const selectedTypes = [];
    const typeCheckboxes = document.querySelectorAll('.type-filter-options input[type="checkbox"]');
    typeCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedTypes.push(checkbox.dataset.type);
      }
    });
    
    const quoteTypes = getQuoteTypes();
    const totalTypes = quoteTypes.length;
    if (selectedTypes.length > 0 && selectedTypes.length < totalTypes) {
      params.append("types", selectedTypes.join(","));
    }
  }
  
  // Training type filters (for training view)
  if (currentNoteTypeFilter === 'training') {
    const selectedTrainingTypes = [];
    const trainingTypeCheckboxes = document.querySelectorAll('.training-type-filter-options input[type="checkbox"]');
    trainingTypeCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedTrainingTypes.push(checkbox.dataset.type);
      }
    });
    
    if (selectedTrainingTypes.length > 0) {
      params.append("training_types", selectedTrainingTypes.join(","));
    }
    
    // Year and month filters
    const yearFilter = document.getElementById('trainingYearFilter')?.value;
    const monthFilter = document.getElementById('trainingMonthFilter')?.value;
    
    if (yearFilter) params.append("year", yearFilter);
    if (monthFilter && yearFilter) params.append("month", monthFilter);
  }
  
  // Metadata search filters
  if (document.getElementById("searchHasAuthor")?.checked) {
    const condition = document.getElementById("searchAuthorCondition")?.value;
    params.append("hasAuthor", condition === "has" ? "true" : "false");
  }
  if (document.getElementById("searchHasSource")?.checked) {
    const condition = document.getElementById("searchSourceCondition")?.value;
    params.append("hasSource", condition === "has" ? "true" : "false");
  }
  if (document.getElementById("searchHasNote")?.checked) {
    const condition = document.getElementById("searchNoteCondition")?.value;
    params.append("hasNote", condition === "has" ? "true" : "false");
  }
  if (document.getElementById("searchHasTags")?.checked) {
    const condition = document.getElementById("searchTagsCondition")?.value;
    params.append("hasTags", condition === "has" ? "true" : "false");
  }
  if (document.getElementById("searchHasImage")?.checked) {
    const condition = document.getElementById("searchImageCondition")?.value;
    params.append("hasImage", condition === "has" ? "true" : "false");
  }

  // Pagination
  const offset = (currentPage - 1) * quotesPerPage;
  params.append("limit", quotesPerPage);
  params.append("offset", offset);
  
  return params;
}

/**
 * Load and display quotes with current filters
 */
export async function loadQuotes(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const quotesList = document.getElementById("quotesList");
  
  try {
    const params = buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
    const response = await fetchWithRetry(`${API_URL}/quotes?${params.toString()}`);
    const quotes = await response.json();

    currentQuotesData = quotes;
    displayQuotes(quotes, currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
    await loadTotalCount(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
  } catch (error) {
    console.error("Error loading quotes:", error);
    if (quotesList) {
      quotesList.innerHTML = '<div class="no-quotes">Failed to load quotes. Please try again.</div>';
    }
  }
}

/**
 * Load and update total count with filters
 */
export async function loadTotalCount(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const totalCountElement = document.getElementById("totalCount");
  const typeCountElement = document.getElementById("typeCount");
  const filteredCountElement = document.getElementById("filteredCount");
  
  try {
    const params = buildQuotesParams(currentNoteTypeFilter, getQuoteTypes, getTrainingTypes);
    
    const response = await fetchWithRetry(`${API_URL}/quotes/count?${params.toString()}`);
    const data = await response.json();
    
    if (totalCountElement) totalCountElement.textContent = data.grandTotal || 0;
    if (typeCountElement) typeCountElement.textContent = data.typeTotal || 0;
    if (filteredCountElement) filteredCountElement.textContent = data.count || 0;
  } catch (error) {
    console.error("Error loading count:", error);
    if (totalCountElement) totalCountElement.textContent = "?";
    if (typeCountElement) typeCountElement.textContent = "?";
    if (filteredCountElement) filteredCountElement.textContent = "?";
  }
}

/**
 * Display quotes in the list
 */
export function displayQuotes(quotes, currentNoteTypeFilter, getQuoteTypes, getTrainingTypes) {
  const quotesList = document.getElementById("quotesList");
  const quoteCount = document.getElementById("quoteCount");
  
  if (quoteCount) {
    quoteCount.textContent = `(${quotes.length})`;
  }

  if (!quotesList) {
    console.error("quotesList element not found");
    return;
  }

  if (quotes.length === 0) {
    quotesList.innerHTML = '<div class="no-quotes">No notes found.</div>';
    return;
  }

  quotesList.innerHTML = quotes
    .map(quote => createQuoteCard(quote, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes))
    .join("");
}

/**
 * Get current quotes data (for PDF export)
 */
export function getCurrentQuotesData() {
  return currentQuotesData;
}

/**
 * Get/Set current page
 */
export function getCurrentPage() {
  return currentPage;
}

export function setCurrentPage(page) {
  currentPage = page;
}

export function getQuotesPerPage() {
  return quotesPerPage;
}
