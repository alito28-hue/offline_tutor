// Exact nearest-neighbour search. The pack is small enough to compare every passage, and unlike the SDK's
// approximate index, which can miss passages depending on how it was built, this gives the same result on every start.
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const norm = a => Math.sqrt(dot(a, a));

export const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b) || 1);

export const topMatches = (query, documents, vectors, topK) => documents
  .map((content, i) => ({ content, score: cosine(query, vectors[i]) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, topK);
