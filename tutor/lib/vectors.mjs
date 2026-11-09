// Exact nearest-neighbour search over unit vectors. Comparing every passage takes milliseconds at this size, and unlike
// the SDK's approximate index, which can miss passages depending on how it was built, it gives the same result on every start.
export const unit = v => {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const n = Math.sqrt(sum) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
};

export const similarity = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

export const cosine = (a, b) => similarity(unit(a), unit(b));

export const topMatches = (query, documents, vectors, topK, keep = () => true) => {
  const q = unit(query);
  const hits = [];
  for (let i = 0; i < documents.length; i++) if (keep(documents[i])) hits.push({ content: documents[i], score: similarity(q, unit(vectors[i])) });
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
};
