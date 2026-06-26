const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const QUOTE_SOURCE_TYPE_COUNT = 6;

function parseSearchQuery(searchQuery) {
  if (!searchQuery) return { operator: "SIMPLE", terms: [] };

  if (searchQuery.includes(" && ")) {
    const terms = searchQuery.split(" && ").map((term) => term.trim()).filter((term) => term);
    return { operator: "AND", terms };
  }

  if (searchQuery.includes(" || ")) {
    const terms = searchQuery.split(" || ").map((term) => term.trim()).filter((term) => term);
    return { operator: "OR", terms };
  }

  return { operator: "SIMPLE", terms: [searchQuery.trim()] };
}

function buildTextSearchCondition(searchQuery, columnName, paramCounter, params) {
  const { operator, terms } = parseSearchQuery(searchQuery);

  if (terms.length === 0) {
    return { condition: "", newParamCounter: paramCounter };
  }

  const columns = Array.isArray(columnName) ? columnName : [columnName];
  const termMatch = (placeholder) => columns.length === 1
    ? `${columns[0]} ILIKE $${placeholder}`
    : `(${columns.map((column) => `${column} ILIKE $${placeholder}`).join(" OR ")})`;

  if (operator === "SIMPLE") {
    params.push(`%${terms[0]}%`);
    return {
      condition: ` AND ${termMatch(paramCounter)}`,
      newParamCounter: paramCounter + 1,
    };
  }

  if (operator === "AND") {
    const conditions = terms.map((term) => {
      params.push(`%${term}%`);
      const condition = termMatch(paramCounter);
      paramCounter++;
      return condition;
    });
    return {
      condition: ` AND (${conditions.join(" AND ")})`,
      newParamCounter: paramCounter,
    };
  }

  if (operator === "OR") {
    const conditions = terms.map((term) => {
      params.push(`%${term}%`);
      const condition = termMatch(paramCounter);
      paramCounter++;
      return condition;
    });
    return {
      condition: ` AND (${conditions.join(" OR ")})`,
      newParamCounter: paramCounter,
    };
  }

  return { condition: "", newParamCounter: paramCounter };
}

function buildTagExistsClause(paramCounter) {
  return `EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name ILIKE $${paramCounter}
      )`;
}

function buildTagSearchCondition(searchQuery, paramCounter, params) {
  const { operator, terms } = parseSearchQuery(searchQuery);

  if (terms.length === 0) {
    return { condition: "", newParamCounter: paramCounter };
  }

  if (operator === "SIMPLE" || operator === "AND") {
    const searchTags = operator === "SIMPLE"
      ? terms[0].split(",").map((tag) => tag.trim()).filter((tag) => tag)
      : terms;
    const conditions = searchTags.map((tag) => {
      const exclude = tag.startsWith("!");
      const tagName = exclude ? tag.slice(1).trim() : tag;
      if (!tagName) return "";
      params.push(`%${tagName}%`);
      const existsClause = buildTagExistsClause(paramCounter);
      paramCounter++;
      return exclude ? ` AND NOT ${existsClause}` : ` AND ${existsClause}`;
    }).filter((condition) => condition);
    return {
      condition: conditions.join(""),
      newParamCounter: paramCounter,
    };
  }

  if (operator === "OR") {
    terms.forEach((tag) => {
      params.push(`%${tag}%`);
    });
    const placeholders = terms.map((_, index) => `$${paramCounter + index}`).join(", ");
    const condition = ` AND EXISTS (
      SELECT 1 FROM note_tags qt 
      JOIN tags t ON qt.tag_id = t.id 
      WHERE qt.note_id = q.id AND t.name ILIKE ANY(ARRAY[${placeholders}])
    )`;
    return {
      condition,
      newParamCounter: paramCounter + terms.length,
    };
  }

  return { condition: "", newParamCounter: paramCounter };
}

function buildAnyTermMatch(paramCounter, { useJoins = true } = {}) {
  const authorMatch = useJoins
    ? `a.name ILIKE $${paramCounter}`
    : `EXISTS (SELECT 1 FROM authors a WHERE a.id = q.author_id AND a.name ILIKE $${paramCounter})`;
  const sourceMatch = useJoins
    ? `s.name ILIKE $${paramCounter}`
    : `EXISTS (SELECT 1 FROM sources s WHERE s.id = q.source_id AND s.name ILIKE $${paramCounter})`;

  return `(
    q.note_text ILIKE $${paramCounter}
    OR q.note_title ILIKE $${paramCounter}
    OR q.comment ILIKE $${paramCounter}
    OR ${authorMatch}
    OR ${sourceMatch}
    OR EXISTS (
      SELECT 1 FROM note_tags qt
      JOIN tags t ON qt.tag_id = t.id
      WHERE qt.note_id = q.id AND t.name ILIKE $${paramCounter}
    )
  )`;
}

function buildAnySearchCondition(searchQuery, paramCounter, params, { useJoins = true } = {}) {
  const { operator, terms } = parseSearchQuery(searchQuery);

  if (terms.length === 0) return { condition: "", newParamCounter: paramCounter };

  const termConditions = terms.map((term) => {
    params.push(`%${term}%`);
    const match = buildAnyTermMatch(paramCounter, { useJoins });
    paramCounter++;
    return match;
  });

  if (operator === "SIMPLE") {
    return { condition: ` AND ${termConditions[0]}`, newParamCounter: paramCounter };
  }

  const joiner = operator === "OR" ? " OR " : " AND ";
  return {
    condition: ` AND (${termConditions.join(joiner)})`,
    newParamCounter: paramCounter,
  };
}

function createState(query) {
  return {
    query,
    params: [],
    paramCounter: 1,
  };
}

function appendCondition(state, condition) {
  state.query += condition;
}

function appendParamCondition(state, condition, value) {
  state.query += condition.replace("?", `$${state.paramCounter}`);
  state.params.push(value);
  state.paramCounter++;
}

function hasExactNoteIdFilter(filters) {
  return Boolean(filters?.noteId && !isNaN(parseInt(filters.noteId)));
}

function appendNoteTypeFilter(state, filters, allowedTypes) {
  if (filters.note_type) {
    appendParamCondition(state, " AND q.note_type = ?", filters.note_type);
  } else if (hasExactNoteIdFilter(filters)) {
    return;
  } else {
    appendParamCondition(state, " AND q.note_type = ANY(?)", allowedTypes);
  }
}

function appendTextSearch(state, searchQuery, columns) {
  if (!searchQuery) return;
  const { condition, newParamCounter } = buildTextSearchCondition(
    searchQuery,
    columns,
    state.paramCounter,
    state.params
  );
  appendCondition(state, condition);
  state.paramCounter = newParamCounter;
}

function appendAnySearch(state, searchQuery) {
  if (!searchQuery) return;
  const { condition, newParamCounter } = buildAnySearchCondition(
    searchQuery,
    state.paramCounter,
    state.params
  );
  appendCondition(state, condition);
  state.paramCounter = newParamCounter;
}

function appendAuthorSourceFilters(state, filters) {
  if (filters.author) {
    appendParamCondition(state, " AND a.name ILIKE ?", `%${filters.author}%`);
  }

  if (filters.source) {
    appendParamCondition(state, " AND s.name ILIKE ?", `%${filters.source}%`);
  }
}

function appendTagSearch(state, tags) {
  if (!tags) return;
  const { condition, newParamCounter } = buildTagSearchCondition(
    tags,
    state.paramCounter,
    state.params
  );
  appendCondition(state, condition);
  state.paramCounter = newParamCounter;
}

function appendScoreFilter(state, score) {
  if (!score) return;

  if (score.includes("-")) {
    const [min, max] = score.split("-").map((part) => part.trim());
    if (min && max && !isNaN(min) && !isNaN(max)) {
      state.query += ` AND q.score >= $${state.paramCounter} AND q.score <= $${state.paramCounter + 1}`;
      state.params.push(min, max);
      state.paramCounter += 2;
    }
  } else if (score.endsWith("+")) {
    const min = score.replace("+", "").trim();
    if (min && !isNaN(min)) {
      appendParamCondition(state, " AND q.score >= ?", min);
    }
  } else {
    appendParamCondition(state, " AND q.score = ?", score.trim());
  }
}

function appendQuoteSourceTypesFilter(state, filters) {
  if (!filters.types) return;

  const typeArray = filters.types.split(",").filter((type) => type);
  if (typeArray.length > 0 && typeArray.length < QUOTE_SOURCE_TYPE_COUNT) {
    if (filters.note_type === "quote") {
      appendParamCondition(state, " AND q.type = ANY(?)", typeArray);
    } else {
      appendParamCondition(state, " AND (q.note_type != 'quote' OR q.type = ANY(?))", typeArray);
    }
  }
}

function appendTrainingTypesFilter(state, filters) {
  if (!filters.training_types) return;

  const trainingTypeArray = filters.training_types.split(",").filter((type) => type);
  if (trainingTypeArray.length > 0) {
    if (filters.note_type === "training") {
      appendParamCondition(state, " AND q.type = ANY(?)", trainingTypeArray);
    } else {
      appendParamCondition(state, " AND (q.note_type != 'training' OR q.type = ANY(?))", trainingTypeArray);
    }
  }
}

function appendGenericSubTypesFilter(state, filters) {
  if (!filters.generic_sub_types) return;

  const genericSubTypeArray = filters.generic_sub_types.split(",").filter((type) => type);
  if (genericSubTypeArray.length > 0) {
    appendParamCondition(state, " AND q.type = ANY(?)", genericSubTypeArray);
  }
}

function appendYearMonthTagFilters(state, filters) {
  if (filters.year) {
    state.query += ` AND EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name = $${state.paramCounter}
      )`;
    state.params.push(filters.year.toString());
    state.paramCounter++;
  }

  if (filters.month) {
    const monthName = MONTH_NAMES[parseInt(filters.month) - 1];
    state.query += ` AND EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name = $${state.paramCounter}
      )`;
    state.params.push(monthName);
    state.paramCounter++;
  }
}

function appendMetadataFilters(state, filters) {
  if (filters.hasAuthor === "true") {
    appendCondition(state, " AND q.author_id IS NOT NULL");
  } else if (filters.hasAuthor === "false") {
    appendCondition(state, " AND q.author_id IS NULL");
  }

  if (filters.hasSource === "true") {
    appendCondition(state, " AND q.source_id IS NOT NULL");
  } else if (filters.hasSource === "false") {
    appendCondition(state, " AND q.source_id IS NULL");
  }

  if (filters.hasNote === "true") {
    appendCondition(state, " AND q.comment IS NOT NULL AND q.comment != ''");
  } else if (filters.hasNote === "false") {
    appendCondition(state, " AND (q.comment IS NULL OR q.comment = '')");
  }

  if (filters.hasTags === "true") {
    appendCondition(state, " AND EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)");
  } else if (filters.hasTags === "false") {
    appendCondition(state, " AND NOT EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)");
  }

  if (filters.hasImage === "true") {
    appendCondition(state, " AND q.attachment_full IS NOT NULL AND q.attachment_full != ''");
  } else if (filters.hasImage === "false") {
    appendCondition(state, " AND (q.attachment_full IS NULL OR q.attachment_full = '')");
  }

  if (filters.hasImageType === "true") {
    appendCondition(state, " AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND q.attachment_type = 'image'");
  } else if (filters.hasImageType === "false") {
    appendCondition(state, " AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND (q.attachment_type IS NULL OR q.attachment_type != 'image')");
  }

  if (filters.hasTranslationGroup === "true") {
    appendCondition(state, " AND q.translation_group IS NOT NULL AND q.translation_group != ''");
  } else if (filters.hasTranslationGroup === "false") {
    appendCondition(state, " AND (q.translation_group IS NULL OR q.translation_group = '')");
  }

  if (filters.hasMultipleAttachments === "true") {
    appendCondition(state, " AND (SELECT COUNT(*) FROM note_attachments WHERE note_id = q.id) > 1");
  } else if (filters.hasMultipleAttachments === "false") {
    appendCondition(state, " AND (SELECT COUNT(*) FROM note_attachments WHERE note_id = q.id) <= 1");
  }

  if (filters.hasTitle === "true") {
    appendCondition(state, " AND q.note_title IS NOT NULL AND q.note_title != '' AND q.note_title != 'No title'");
  } else if (filters.hasTitle === "false") {
    appendCondition(state, " AND (q.note_title IS NULL OR q.note_title = '' OR q.note_title = 'No title')");
  }

  if (filters.hasText === "true") {
    appendCondition(state, " AND q.note_text IS NOT NULL AND q.note_text != ''");
  } else if (filters.hasText === "false") {
    appendCondition(state, " AND (q.note_text IS NULL OR q.note_text = '')");
  }
}

function appendHiddenFilters(state, filters) {
  if (filters.hideEncryptedNotes === "true") {
    appendCondition(
      state,
      " AND q.attachment_type IS DISTINCT FROM 'encrypted'" +
        " AND NOT EXISTS (SELECT 1 FROM note_attachments WHERE note_id = q.id AND attachment_type = 'encrypted')"
    );
  }

  if (filters.hideTag) {
    state.query += ` AND NOT EXISTS (
        SELECT 1 FROM note_tags nt
        JOIN tags t ON nt.tag_id = t.id
        WHERE nt.note_id = q.id AND LOWER(t.name) = LOWER($${state.paramCounter})
      )`;
    state.params.push(filters.hideTag);
    state.paramCounter++;
  }
}

function appendNoteIdFilter(state, noteId) {
  if (noteId && !isNaN(parseInt(noteId))) {
    appendParamCondition(state, " AND q.id = ?", parseInt(noteId));
  }
}

function appendDateFilter(state, date) {
  if (date) {
    appendParamCondition(state, " AND q.note_date = ?", date);
  }
}

function appendTranslationGroupFilter(state, translationGroup) {
  if (translationGroup) {
    appendParamCondition(state, " AND q.translation_group = ?", translationGroup);
  }
}

function appendDateRangeFilters(state, filters) {
  if (filters.dateFrom) {
    appendParamCondition(state, " AND q.note_date >= ?", filters.dateFrom);
  }
  if (filters.dateTo) {
    appendParamCondition(state, " AND q.note_date <= ?", filters.dateTo);
  }
}

function appendAuthorSourceIdFilters(state, filters) {
  if (filters.author_id && filters.author_id !== "all") {
    const authorId = parseInt(filters.author_id, 10);
    if (Number.isFinite(authorId)) {
      appendParamCondition(state, " AND q.author_id = ?", authorId);
    }
  }

  if (filters.source_id && filters.source_id !== "all") {
    const sourceId = parseInt(filters.source_id, 10);
    if (Number.isFinite(sourceId)) {
      appendParamCondition(state, " AND q.source_id = ?", sourceId);
    }
  }
}

function appendBulkAuthorSourceFilters(state, filters) {
  if (filters.author) {
    appendParamCondition(
      state,
      " AND EXISTS (SELECT 1 FROM authors a WHERE a.id = q.author_id AND a.name ILIKE ?)",
      `%${filters.author}%`
    );
  }

  if (filters.source) {
    appendParamCondition(
      state,
      " AND EXISTS (SELECT 1 FROM sources s WHERE s.id = q.source_id AND s.name ILIKE ?)",
      `%${filters.source}%`
    );
  }
}

function appendBulkAnySearch(state, searchQuery) {
  if (!searchQuery) return;
  const { condition, newParamCounter } = buildAnySearchCondition(
    searchQuery,
    state.paramCounter,
    state.params,
    { useJoins: false }
  );
  appendCondition(state, condition);
  state.paramCounter = newParamCounter;
}

function appendPaginationAndSort(state, filters) {
  if (filters.note_type === "training") {
    state.query = `
        WITH tagged_quotes AS (
          ${state.query}
        ),
        year_tags AS (
          SELECT qt.note_id, t.name as year_tag
          FROM note_tags qt
          JOIN tags t ON qt.tag_id = t.id
          WHERE t.name ~ '^[0-9]{4}$'
        ),
        month_tags AS (
          SELECT qt.note_id, t.name as month_tag,
            CASE t.name
              WHEN 'January' THEN 1
              WHEN 'February' THEN 2
              WHEN 'March' THEN 3
              WHEN 'April' THEN 4
              WHEN 'May' THEN 5
              WHEN 'June' THEN 6
              WHEN 'July' THEN 7
              WHEN 'August' THEN 8
              WHEN 'September' THEN 9
              WHEN 'October' THEN 10
              WHEN 'November' THEN 11
              WHEN 'December' THEN 12
            END as month_order
          FROM note_tags qt
          JOIN tags t ON qt.tag_id = t.id
          WHERE t.name IN ('January','February','March','April','May','June','July','August','September','October','November','December')
        )
        SELECT tq.*
        FROM tagged_quotes tq
        LEFT JOIN year_tags yt ON tq.id = yt.note_id
        LEFT JOIN month_tags mt ON tq.id = mt.note_id
        ORDER BY 
          yt.year_tag DESC NULLS LAST,
          CASE WHEN mt.month_tag IS NULL THEN 0 ELSE 1 END,
          mt.month_order DESC,
          CASE WHEN tq.note_date IS NULL THEN 0 ELSE 1 END,
          EXTRACT(DAY FROM tq.note_date) DESC,
          tq.updated_at DESC
        LIMIT $${state.paramCounter} OFFSET $${state.paramCounter + 1}
      `;
  } else {
    state.query += ` ORDER BY q.updated_at DESC LIMIT $${state.paramCounter} OFFSET $${state.paramCounter + 1}`;
  }

  state.params.push(parseInt(filters.limit || 20), parseInt(filters.offset || 0));
}

function buildQuoteCountQuery(filters, allowedTypes) {
  const state = createState(`
      SELECT COUNT(*) as count
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
  `);

  appendNoteTypeFilter(state, filters, allowedTypes);
  appendTextSearch(state, filters.quote, ["q.note_text", "q.note_title", "q.comment"]);
  appendAnySearch(state, filters.any);
  appendAuthorSourceFilters(state, filters);
  appendTagSearch(state, filters.tags);
  appendDateFilter(state, filters.date);
  appendQuoteSourceTypesFilter(state, filters);
  appendTrainingTypesFilter(state, filters);
  appendGenericSubTypesFilter(state, filters);
  appendYearMonthTagFilters(state, filters);
  appendDateRangeFilters(state, filters);
  appendScoreFilter(state, filters.score);
  appendMetadataFilters(state, filters);
  appendHiddenFilters(state, filters);
  appendTranslationGroupFilter(state, filters.translation_group);
  appendNoteIdFilter(state, filters.noteId);

  return {
    query: state.query,
    params: state.params,
  };
}

function buildQuoteListQuery(filters, allowedTypes) {
  const state = createState(`
      SELECT DISTINCT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
    `);

  appendTextSearch(state, filters.quote, ["q.note_text", "q.note_title", "q.comment"]);
  appendAnySearch(state, filters.any);
  appendAuthorSourceFilters(state, filters);
  appendTagSearch(state, filters.tags);
  appendDateFilter(state, filters.date);
  appendScoreFilter(state, filters.score);
  appendQuoteSourceTypesFilter(state, filters);
  appendNoteIdFilter(state, filters.noteId);
  appendMetadataFilters(state, filters);
  appendHiddenFilters(state, filters);
  appendTranslationGroupFilter(state, filters.translation_group);
  appendNoteTypeFilter(state, filters, allowedTypes);
  appendTrainingTypesFilter(state, filters);
  appendGenericSubTypesFilter(state, filters);
  appendYearMonthTagFilters(state, filters);
  appendDateRangeFilters(state, filters);
  appendPaginationAndSort(state, filters);

  return {
    query: state.query,
    params: state.params,
  };
}

function buildBulkFilterQuery(filters = {}, allowedTypes = []) {
  const safeFilters = filters || {};
  const state = createState("FROM notes q WHERE 1=1");
  const textSearch = safeFilters.search || safeFilters.quote;
  const tagSearch = safeFilters.tag || safeFilters.tags;

  appendNoteTypeFilter(state, safeFilters, allowedTypes);
  appendAuthorSourceIdFilters(state, safeFilters);
  appendTextSearch(state, textSearch, ["q.note_text", "q.note_title", "q.comment"]);
  appendBulkAnySearch(state, safeFilters.any);
  appendBulkAuthorSourceFilters(state, safeFilters);
  appendTagSearch(state, tagSearch);
  appendDateFilter(state, safeFilters.date);
  appendQuoteSourceTypesFilter(state, safeFilters);
  appendTrainingTypesFilter(state, safeFilters);
  appendGenericSubTypesFilter(state, safeFilters);
  appendYearMonthTagFilters(state, safeFilters);
  appendDateRangeFilters(state, safeFilters);
  appendScoreFilter(state, safeFilters.score);
  appendMetadataFilters(state, safeFilters);
  appendHiddenFilters(state, safeFilters);
  appendTranslationGroupFilter(state, safeFilters.translation_group);
  appendNoteIdFilter(state, safeFilters.noteId);

  return {
    query: state.query,
    params: state.params,
  };
}

module.exports = {
  MONTH_NAMES,
  parseSearchQuery,
  buildTextSearchCondition,
  buildTagSearchCondition,
  buildAnySearchCondition,
  buildQuoteCountQuery,
  buildQuoteListQuery,
  buildBulkFilterQuery,
};
