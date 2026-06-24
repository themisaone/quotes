function buildAuthorsListQuery({ search } = {}) {
  let query = `
            SELECT a.*, 
                   COUNT(q.id) as quote_count
            FROM authors a
            LEFT JOIN notes q ON a.id = q.author_id
        `;
  const params = [];

  if (search) {
    query += " WHERE a.name ILIKE $1";
    params.push(`%${search}%`);
  }

  query += " GROUP BY a.id ORDER BY a.name ASC";
  return { query, params };
}

function buildSourcesListQuery({ search, type } = {}) {
  let query = `
            SELECT s.*, 
                   COUNT(q.id) as quote_count,
                   (
                       SELECT a.name 
                       FROM notes q2 
                       JOIN authors a ON q2.author_id = a.id 
                       WHERE q2.source_id = s.id 
                       GROUP BY a.id, a.name 
                       ORDER BY COUNT(*) DESC 
                       LIMIT 1
                   ) as primary_author_name,
                   (
                       SELECT a.id 
                       FROM notes q2 
                       JOIN authors a ON q2.author_id = a.id 
                       WHERE q2.source_id = s.id 
                       GROUP BY a.id 
                       ORDER BY COUNT(*) DESC 
                       LIMIT 1
                   ) as primary_author_id
            FROM sources s
            LEFT JOIN notes q ON s.id = q.source_id
            WHERE 1=1
        `;
  const params = [];
  let paramCounter = 1;

  if (search) {
    query += ` AND s.name ILIKE $${paramCounter}`;
    params.push(`%${search}%`);
    paramCounter++;
  }

  if (type) {
    query += ` AND s.type = $${paramCounter}`;
    params.push(type);
  }

  query += " GROUP BY s.id ORDER BY s.name ASC";
  return { query, params };
}

function buildAuthorUpdateQuery({ id, name, description, image }) {
  const updateParams = [];
  const updateFields = [];
  let paramCount = 1;

  if (name !== undefined && name !== null) {
    updateFields.push(`name = $${paramCount}`);
    updateParams.push(name.trim());
    paramCount++;
  }

  if (description !== undefined) {
    updateFields.push(`description = $${paramCount}`);
    updateParams.push(description?.trim() || "");
    paramCount++;
  }

  if (image !== undefined) {
    updateFields.push(`image = $${paramCount}`);
    updateParams.push(image);
    paramCount++;
  }

  updateParams.push(id);

  return {
    query: `UPDATE authors 
       SET ${updateFields.join(", ")}
       WHERE id = $${paramCount}
       RETURNING *`,
    params: updateParams,
    updateFields,
  };
}

function buildSourceUpdateQuery({ id, name, type, image }) {
  const updateParams = [];
  const updateFields = [];
  let paramCount = 1;

  if (name !== undefined && name !== null) {
    updateFields.push(`name = $${paramCount}`);
    updateParams.push(name.trim());
    paramCount++;
  }

  if (image !== undefined) {
    updateFields.push(`image = $${paramCount}`);
    updateParams.push(image);
    paramCount++;
  }

  if (type !== undefined && type !== null) {
    updateFields.push(`type = $${paramCount}`);
    updateParams.push(type);
    paramCount++;
  }

  updateParams.push(id);

  return {
    query: `UPDATE sources 
       SET ${updateFields.join(", ")}
       WHERE id = $${paramCount}
       RETURNING *`,
    params: updateParams,
    updateFields,
  };
}

function buildAuthorMergeResponse({ oldName, targetAuthor }) {
  return {
    merged: true,
    oldName,
    newName: targetAuthor.name,
    targetAuthorId: targetAuthor.id,
    message: `Author "${oldName}" merged into existing author "${targetAuthor.name}"`,
  };
}

function buildSourceMergeResponse({ oldName, targetSource }) {
  return {
    merged: true,
    oldName,
    newName: targetSource.name,
    targetSourceId: targetSource.id,
    message: `Source "${oldName}" merged into existing source "${targetSource.name}"`,
  };
}

function buildAuthorUpdateResponse({ oldName, author, requestedName }) {
  return {
    merged: false,
    oldName,
    newName: author.name,
    author,
    message: requestedName ? `Author renamed from "${oldName}" to "${author.name}"` : "Author updated",
  };
}

function buildSourceUpdateResponse({ oldName, source, requestedName }) {
  return {
    merged: false,
    oldName,
    newName: source.name,
    source,
    message: requestedName ? `Source renamed from "${oldName}" to "${source.name}"` : "Source updated",
  };
}

function buildEntityDeleteSuccessMessage(entityType) {
  const label = entityType === "author" ? "Author" : "Source";
  return { message: `${label} deleted successfully` };
}

module.exports = {
  buildAuthorMergeResponse,
  buildAuthorUpdateQuery,
  buildAuthorUpdateResponse,
  buildAuthorsListQuery,
  buildEntityDeleteSuccessMessage,
  buildSourceMergeResponse,
  buildSourceUpdateQuery,
  buildSourceUpdateResponse,
  buildSourcesListQuery,
};
