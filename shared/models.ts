export type DecisionModel = {
  id: string;
  provider: 'ollama' | 'openrouter';
  model: string;
  label: string;
  available: boolean;
  reason: string | null;
};

export type ModelCatalog = {
  models: DecisionModel[];
  selectedId: string | null;
  discoveryError: string | null;
};

/** Sucht ab dem gewählten Eintrag vorwärts und beginnt am Listenende wieder oben. */
export function nextAvailableModel(
  models: DecisionModel[],
  selectedId: string | null,
) {
  const index = models.findIndex((model) => model.id === selectedId);
  for (let offset = 0; offset < models.length; offset++) {
    const candidate = models[(Math.max(index, 0) + offset) % models.length];
    if (candidate.available) return candidate.id;
  }
  return null;
}
