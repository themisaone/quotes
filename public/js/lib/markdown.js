export const NOTE_FORMAT_HTML = 'html';
export const NOTE_FORMAT_MARKDOWN = 'markdown';

export function normalizeNoteFormat(value) {
  return String(value || NOTE_FORMAT_HTML).trim().toLowerCase() === NOTE_FORMAT_MARKDOWN
    ? NOTE_FORMAT_MARKDOWN
    : NOTE_FORMAT_HTML;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function sanitizeUrl(value, { image = false } = {}) {
  const url = String(value || '').trim();
  if (!url) return '';
  const lowered = url.replace(/[\u0000-\u001f\s]+/g, '').toLowerCase();
  if (
    lowered.startsWith('javascript:') ||
    lowered.startsWith('vbscript:') ||
    lowered.startsWith('file:')
  ) {
    return '';
  }
  if (lowered.startsWith('data:')) {
    return image && /^data:image\/(?:png|gif|jpe?g|webp|svg\+xml);/i.test(url) ? url : '';
  }
  return url;
}

function renderInline(markdown) {
  const codeTokens = [];
  let text = String(markdown ?? '').replace(/`([^`\n]+)`/g, (_match, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);

  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt, url) => {
    const safeUrl = sanitizeUrl(url, { image: true });
    if (!safeUrl) return escapeHtml(alt);
    return `<img src="${escapeAttribute(safeUrl)}" alt="${alt}">`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return label;
    return `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  text = text
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>')
    .replace(/_([^_\s][^_]*?)_/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  codeTokens.forEach((html, index) => {
    text = text.replace(new RegExp(`\\u0000CODE${index}\\u0000`, 'g'), html);
  });

  return text;
}

function isFence(line) {
  return line.match(/^```(.*)$/);
}

function isBlockStarter(line) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*([-*+])\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    isFence(line)
  );
}

function renderList(lines, startIndex, ordered) {
  const items = [];
  let index = startIndex;
  const itemRe = ordered
    ? /^\s*\d+[.)]\s+(.+)$/
    : /^\s*[-*+]\s+(.+)$/;

  while (index < lines.length) {
    const match = lines[index].match(itemRe);
    if (!match) break;
    items.push(`<li>${renderInline(match[1])}</li>`);
    index++;
  }

  return {
    html: `<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`,
    nextIndex: index,
  };
}

function renderBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      const blankStart = index;
      while (index < lines.length && !lines[index].trim()) index++;
      const blankCount = index - blankStart;
      if (blocks.length > 0 && index < lines.length) {
        for (let i = 1; i < blankCount; i++) {
          blocks.push('<p><br></p>');
        }
      }
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      index++;
      const codeLines = [];
      while (index < lines.length && !isFence(lines[index])) {
        codeLines.push(lines[index]);
        index++;
      }
      if (index < lines.length) index++;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index++;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push('<hr>');
      index++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index++;
      }
      blocks.push(`<blockquote>${renderBlocks(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const list = renderList(lines, index, false);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = renderList(lines, index, true);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStarter(lines[index])
    ) {
      paragraph.push(lines[index]);
      index++;
    }
    blocks.push(`<p>${renderInline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }

  return blocks.join('');
}

export function renderMarkdown(markdown) {
  if (!String(markdown || '').trim()) return '';
  return renderBlocks(markdown);
}

export function renderNoteText(note) {
  const noteText = typeof note === 'object' && note !== null ? note.note_text : note;
  const noteFormat = typeof note === 'object' && note !== null ? note.note_format : NOTE_FORMAT_HTML;
  return normalizeNoteFormat(noteFormat) === NOTE_FORMAT_MARKDOWN
    ? renderMarkdown(noteText)
    : (noteText || '');
}

export function noteTextToPlainText(note) {
  const div = document.createElement('div');
  div.innerHTML = renderNoteText(note);
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

export function isNoteTextEmpty(note) {
  if (!note || !note.note_text) return true;
  if (normalizeNoteFormat(note.note_format) === NOTE_FORMAT_MARKDOWN) {
    return !String(note.note_text).trim();
  }
  return /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*$/i.test(note.note_text);
}
