const palette = ["#b14cff", "#33c5ff", "#00d46a", "#ff7a3d", "#ffd024"];

const venue = (circuit_key, country, points, cornerLabels = []) => ({
  circuit_key,
  country,
  points,
  cornerLabels,
  accent: palette[circuit_key.length % palette.length],
});

// These are intentionally stylized venue studies rather than official
// engineering layouts. The coordinates are normalized so the renderer can
// fit every venue into the same responsive scene.
export const CIRCUIT_GEOMETRY = {
  "australian-grand-prix": venue("australian-grand-prix", "Australia", [[-1.2, 0.2], [-0.9, 0.8], [-0.2, 0.95], [0.55, 0.75], [1.05, 0.25], [0.92, -0.5], [0.35, -0.9], [-0.45, -0.82], [-1.0, -0.5], [-1.2, 0.2]], [1, 3, 6, 9]),
  "chinese-grand-prix": venue("chinese-grand-prix", "China", [[-1.25, -0.45], [-0.8, -0.9], [-0.15, -0.82], [0.45, -0.48], [1.2, -0.35], [0.78, 0.1], [0.18, 0.25], [0.9, 0.75], [0.25, 1.05], [-0.55, 0.8], [-1.25, -0.45]], [1, 4, 7]),
  "japanese-grand-prix": venue("japanese-grand-prix", "Japan", [[-1.2, 0.2], [-0.85, 0.75], [-0.2, 0.82], [0.45, 0.55], [0.92, 0.1], [0.78, -0.35], [0.25, -0.68], [-0.22, -0.45], [-0.58, -0.9], [-1.05, -0.72], [-1.2, 0.2]], [2, 5, 8]),
  "miami-grand-prix": venue("miami-grand-prix", "United States", [[-1.25, -0.72], [-0.55, -0.8], [0.25, -0.55], [1.1, -0.2], [0.9, 0.35], [0.35, 0.62], [0.9, 0.92], [0.1, 1.0], [-0.65, 0.72], [-1.25, -0.72]], [1, 4, 7]),
  "canadian-grand-prix": venue("canadian-grand-prix", "Canada", [[-1.18, -0.45], [-0.62, -0.88], [0.08, -0.72], [0.62, -0.96], [1.12, -0.45], [0.75, 0.0], [1.0, 0.48], [0.42, 0.85], [-0.35, 0.68], [-0.92, 0.35], [-1.18, -0.45]], [2, 5, 8]),
  "monaco-grand-prix": venue("monaco-grand-prix", "Monaco", [[-1.25, -0.62], [-0.48, -0.8], [0.2, -0.62], [0.82, -0.9], [1.18, -0.38], [0.62, 0.05], [1.0, 0.5], [0.4, 0.72], [-0.18, 0.48], [-0.82, 0.8], [-1.25, -0.62]], [1, 4, 7, 9]),
  "barcelona-grand-prix": venue("barcelona-grand-prix", "Spain", [[-1.25, -0.5], [-0.82, -0.9], [-0.1, -0.88], [0.6, -0.64], [1.1, -0.2], [0.78, 0.35], [0.98, 0.88], [0.2, 0.98], [-0.35, 0.5], [-0.9, 0.72], [-1.25, -0.5]], [2, 5, 8]),
  "austrian-grand-prix": venue("austrian-grand-prix", "Austria", [[-1.25, -0.42], [-0.6, -0.82], [0.2, -0.75], [0.92, -0.36], [1.18, 0.18], [0.55, 0.25], [0.72, 0.86], [0.05, 0.98], [-0.55, 0.72], [-1.25, -0.42]], [1, 4, 7]),
  "british-grand-prix": venue("british-grand-prix", "United Kingdom", [[-1.25, -0.55], [-0.58, -0.86], [0.2, -0.75], [0.98, -0.42], [1.12, 0.2], [0.55, 0.5], [0.8, 0.98], [0.05, 0.8], [-0.28, 0.35], [-0.88, 0.72], [-1.25, -0.55]], [2, 5, 8]),
  "belgian-grand-prix": venue("belgian-grand-prix", "Belgium", [[-1.3, -0.45], [-0.75, -0.9], [-0.05, -0.78], [0.55, -0.96], [1.15, -0.35], [0.72, 0.05], [1.0, 0.62], [0.28, 0.92], [-0.35, 0.55], [-0.9, 0.75], [-1.3, -0.45]], [1, 4, 7, 9]),
  "hungarian-grand-prix": venue("hungarian-grand-prix", "Hungary", [[-1.24, -0.58], [-0.82, -0.98], [-0.16, -0.82], [0.5, -0.95], [1.05, -0.4], [0.62, 0.08], [1.12, 0.54], [0.5, 0.9], [-0.18, 0.62], [-0.85, 0.78], [-1.24, -0.58]], [2, 5, 8]),
  "dutch-grand-prix": venue("dutch-grand-prix", "Netherlands", [[-1.24, -0.58], [-0.72, -0.92], [-0.08, -0.78], [0.5, -0.96], [1.12, -0.32], [0.72, 0.12], [1.02, 0.72], [0.3, 0.92], [-0.34, 0.5], [-0.9, 0.75], [-1.24, -0.58]], [1, 4, 7]),
  "italian-grand-prix": venue("italian-grand-prix", "Italy", [[-1.22, -0.85], [0.98, -0.82], [1.15, -0.32], [-0.22, -0.18], [-0.92, 0.2], [-0.35, 0.52], [0.95, 0.65], [1.1, 0.98], [-1.1, 0.9], [-1.22, -0.85]], [2, 5, 8]),
  "spanish-grand-prix": venue("spanish-grand-prix", "Spain", [[-1.2, -0.45], [-0.72, -0.9], [0.0, -0.8], [0.72, -0.96], [1.18, -0.35], [0.68, 0.08], [1.0, 0.72], [0.35, 0.92], [-0.35, 0.55], [-0.95, 0.76], [-1.2, -0.45]], [2, 5, 8]),
  "azerbaijan-grand-prix": venue("azerbaijan-grand-prix", "Azerbaijan", [[-1.24, -0.7], [-0.45, -0.84], [0.4, -0.75], [1.2, -0.3], [0.7, 0.02], [1.08, 0.62], [0.35, 0.8], [-0.18, 0.48], [-0.85, 0.95], [-1.24, -0.7]], [1, 4, 7]),
  "bahrain-grand-prix": venue("bahrain-grand-prix", "Bahrain", [[-1.18, -0.5], [-0.65, -0.92], [0.0, -0.78], [0.65, -0.96], [1.12, -0.42], [0.68, 0.05], [1.02, 0.75], [0.2, 0.92], [-0.4, 0.5], [-0.92, 0.78], [-1.18, -0.5]], [2, 5, 8]),
  "singapore-grand-prix": venue("singapore-grand-prix", "Singapore", [[-1.18, -0.58], [-0.68, -0.88], [-0.12, -0.68], [0.5, -0.92], [1.1, -0.42], [0.74, 0.08], [1.08, 0.65], [0.4, 0.84], [-0.22, 0.5], [-0.82, 0.78], [-1.18, -0.58]], [1, 4, 7]),
  "united-states-grand-prix": venue("united-states-grand-prix", "United States", [[-1.24, -0.52], [-0.72, -0.95], [0.0, -0.76], [0.62, -0.96], [1.18, -0.38], [0.65, 0.1], [0.98, 0.78], [0.22, 0.94], [-0.42, 0.55], [-0.96, 0.8], [-1.24, -0.52]], [2, 5, 8]),
  "mexico-city-grand-prix": venue("mexico-city-grand-prix", "Mexico", [[-1.2, -0.62], [-0.52, -0.92], [0.2, -0.8], [0.9, -0.92], [1.18, -0.32], [0.68, 0.08], [1.0, 0.65], [0.28, 0.94], [-0.24, 0.5], [-0.85, 0.78], [-1.2, -0.62]], [1, 4, 7]),
  "s-o-paulo-grand-prix": venue("s-o-paulo-grand-prix", "Brazil", [[-1.2, -0.52], [-0.65, -0.9], [0.05, -0.78], [0.72, -0.95], [1.15, -0.36], [0.6, 0.0], [1.02, 0.68], [0.26, 0.95], [-0.3, 0.52], [-0.9, 0.76], [-1.2, -0.52]], [2, 5, 8]),
  "las-vegas-grand-prix": venue("las-vegas-grand-prix", "United States", [[-1.25, -0.84], [1.15, -0.84], [1.12, -0.32], [-0.4, -0.2], [-0.86, 0.2], [0.96, 0.42], [1.18, 0.92], [-1.12, 0.92], [-1.25, -0.84]], [2, 5, 7]),
  "qatar-grand-prix": venue("qatar-grand-prix", "Qatar", [[-1.2, -0.5], [-0.62, -0.86], [0.0, -0.78], [0.7, -0.96], [1.14, -0.4], [0.65, 0.02], [1.0, 0.7], [0.28, 0.94], [-0.3, 0.5], [-0.9, 0.78], [-1.2, -0.5]], [1, 4, 7]),
  "abu-dhabi-grand-prix": venue("abu-dhabi-grand-prix", "United Arab Emirates", [[-1.2, -0.58], [-0.65, -0.92], [0.05, -0.78], [0.72, -0.95], [1.16, -0.36], [0.62, 0.05], [1.02, 0.68], [0.3, 0.92], [-0.3, 0.52], [-0.9, 0.78], [-1.2, -0.58]], [2, 5, 8]),
};

const fallback = (circuitKey = "unknown-venue") => {
  let hash = 0;
  for (const char of circuitKey) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 9) * Math.PI * 2;
    const wobble = 0.78 + ((hash + index * 13) % 18) / 100;
    return [Math.cos(angle) * 1.2 * wobble, Math.sin(angle) * 0.82 * wobble];
  });
  return venue(circuitKey, "Venue study", points, [2, 5, 8]);
};

export const getCircuitGeometry = (circuitKey, eventName = "") => {
  const key = circuitKey || eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return CIRCUIT_GEOMETRY[key] || fallback(key);
};
