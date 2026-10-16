/**
 * Deterministic, dependency-free embedding model.
 *
 * Documents are projected into a fixed-dimension vector space using the hashing
 * trick over unigrams and bigrams, weighted with sublinear TF and IDF and
 * L2-normalised. That makes cosine similarity meaningful without shipping a
 * neural network or downloading model weights.
 *
 * The interface (`fit`, `embed`, `toPairs`) is deliberately small so a neural
 * embedder can be swapped in later without touching the store or the pipeline.
 */

export const DEFAULT_DIMENSIONS = 512;

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'you', 'your',
  'yours', 'yourself', 'yourselves',
]);

/** FNV-1a, 32-bit — stable across runs and platforms. */
function hash(text, seed = 0x811c9dc5) {
  let value = seed;

  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }

  return value >>> 0;
}

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 1 && token.length < 24 && !STOPWORDS.has(token) && !/^\d+$/.test(token),
    );
}

/** Unigrams plus bigrams, so short phrases carry some word order. */
export function features(tokens) {
  const out = [];

  for (let index = 0; index < tokens.length; index += 1) {
    out.push(tokens[index]);

    if (index + 1 < tokens.length) {
      out.push(`${tokens[index]}_${tokens[index + 1]}`);
    }
  }

  return out;
}

export function createEmbedder({ dimensions = DEFAULT_DIMENSIONS } = {}) {
  /** feature -> number of chunks containing it */
  const documentFrequency = new Map();
  let chunkCount = 0;

  function idf(feature) {
    const frequency = documentFrequency.get(feature) ?? 0;
    return Math.log((1 + chunkCount) / (1 + frequency)) + 1;
  }

  /** Learn from a chunk before embedding it (call once per chunk, in order). */
  function fit(tokens) {
    chunkCount += 1;
    const seen = new Set(features(tokens));

    for (const feature of seen) {
      documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
    }
  }

  /**
   * Project text into the space. Returns sparse `[index, weight]` pairs, so a
   * vector costs a few dozen numbers instead of `dimensions` of zeros.
   */
  function embed(tokens) {
    const counts = new Map();

    for (const feature of features(tokens)) {
      counts.set(feature, (counts.get(feature) ?? 0) + 1);
    }

    const vector = new Map();

    for (const [feature, count] of counts) {
      const weight = (1 + Math.log(count)) * idf(feature);
      const index = hash(feature) % dimensions;
      const sign = hash(feature, 0x9e3779b9) % 2 === 0 ? 1 : -1;

      vector.set(index, (vector.get(index) ?? 0) + sign * weight);
    }

    let norm = 0;
    for (const weight of vector.values()) norm += weight * weight;

    norm = Math.sqrt(norm) || 1;

    const pairs = [...vector.entries()]
      .map(([index, weight]) => [index, weight / norm])
      .filter(([, weight]) => Math.abs(weight) > 1e-9)
      .sort((a, b) => a[0] - b[0]);

    return pairs;
  }

  return {
    dimensions,
    fit,
    embed,
    tokenize,
    get stats() {
      return { dimensions, chunkCount, features: documentFrequency.size };
    },
    /** Persisted so a reloaded store weights queries the same way. */
    exportState() {
      return {
        dimensions,
        chunkCount,
        documentFrequency: [...documentFrequency.entries()],
      };
    },
    importState(state) {
      if (!state) return;
      chunkCount = state.chunkCount ?? 0;
      documentFrequency.clear();

      for (const [feature, frequency] of state.documentFrequency ?? []) {
        documentFrequency.set(feature, frequency);
      }
    },
  };
}

/** Cosine similarity between two sparse vectors. */
export function cosine(a, b) {
  if (!a?.length || !b?.length) return 0;

  const left = a.length <= b.length ? a : b;
  const right = left === a ? b : a;
  const lookup = new Map(right);

  let dot = 0;

  for (const [index, weight] of left) {
    const other = lookup.get(index);
    if (other !== undefined) dot += weight * other;
  }

  // Both sides are unit vectors, so the dot product is the cosine.
  return dot;
}
