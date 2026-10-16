/**
 * Splits text into overlapping chunks, preferring paragraph and sentence
 * boundaries so a retrieved chunk reads as a coherent passage.
 */

export const DEFAULT_TARGET = 900;
export const DEFAULT_OVERLAP = 150;

function splitSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitLongParagraph(paragraph, target) {
  const pieces = [];
  let current = '';

  for (const sentence of splitSentences(paragraph)) {
    if (current && current.length + sentence.length + 1 > target) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

/** Tail of the previous piece, so a fact split across a boundary is still findable. */
function overlapTail(text, overlap) {
  if (overlap <= 0 || text.length <= overlap) return '';
  const tail = text.slice(-overlap);
  const boundary = tail.search(/[.!?]\s/);
  return boundary === -1 ? tail : tail.slice(boundary + 2);
}

export function chunkText(text, { target = DEFAULT_TARGET, overlap = DEFAULT_OVERLAP } = {}) {
  const normalised = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!normalised) return [];

  const paragraphs = normalised
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  const pieces = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= target) {
      pieces.push(paragraph);
      continue;
    }

    pieces.push(...splitLongParagraph(paragraph, target));
  }

  // Merge undersized pieces so we do not store fragments.
  const merged = [];

  for (const piece of pieces) {
    const previous = merged[merged.length - 1];

    if (previous && previous.length + piece.length + 1 <= target) {
      merged[merged.length - 1] = `${previous} ${piece}`;
    } else {
      merged.push(piece);
    }
  }

  if (merged.length <= 1) return merged;

  return merged.map((piece, index) => {
    if (index === 0) return piece;
    const tail = overlapTail(merged[index - 1], overlap);
    return tail ? `${tail} ${piece}` : piece;
  });
}
