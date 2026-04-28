import type { AlgorithmSelection, GenerationRecipe } from "@world-forge/shared";
import {
  algorithmOptions,
  createRandomSeed,
  featureOptions,
  formatParam,
  paramOptions,
  sizeOptions,
  withAlgorithm,
  withFeature,
  withMapSize,
  withParam,
  withSeed,
} from "../editor/editorState";

interface ControlPanelProps {
  recipe: GenerationRecipe;
  isGenerating: boolean;
  onRecipeChange: (recipe: GenerationRecipe) => void;
  onGenerate: () => void;
}

export function ControlPanel({ recipe, isGenerating, onRecipeChange, onGenerate }: ControlPanelProps) {
  return (
    <aside className="control-panel" aria-label="Map recipe controls">
      <section className="control-section">
        <h2>Map</h2>
        <div className="control-grid two-col">
          <label>
            <span>Width</span>
            <select
              value={recipe.width}
              onChange={(event) => onRecipeChange(withMapSize(recipe, Number(event.target.value), recipe.height))}
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Height</span>
            <select
              value={recipe.height}
              onChange={(event) => onRecipeChange(withMapSize(recipe, recipe.width, Number(event.target.value)))}
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="seed-row">
          <span>Seed</span>
          <span className="seed-inputs">
            <input
              type="number"
              min={0}
              max={4294967295}
              value={recipe.seed}
              onChange={(event) => onRecipeChange(withSeed(recipe, Number(event.target.value)))}
            />
            <button type="button" className="secondary-button" onClick={() => onRecipeChange(withSeed(recipe, createRandomSeed()))}>
              Random
            </button>
          </span>
        </label>
      </section>

      <section className="control-section">
        <h2>Features</h2>
        <div className="feature-grid">
          {featureOptions.map((feature) => (
            <label key={feature.key} className="checkbox-row">
              <input
                type="checkbox"
                checked={recipe.features[feature.key]}
                onChange={(event) => onRecipeChange(withFeature(recipe, feature.key, event.target.checked))}
              />
              <span>{feature.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="control-section">
        <h2>Algorithms</h2>
        <AlgorithmSelect<"terrain">
          label="Terrain"
          value={recipe.algorithms.terrain}
          options={algorithmOptions.terrain}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "terrain", value))}
        />
        <AlgorithmSelect<"cave">
          label="Cave"
          value={recipe.algorithms.cave}
          options={algorithmOptions.cave}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "cave", value))}
        />
        <AlgorithmSelect<"road">
          label="Road"
          value={recipe.algorithms.road}
          options={algorithmOptions.road}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "road", value))}
        />
        <AlgorithmSelect<"objectPlacement">
          label="Objects"
          value={recipe.algorithms.objectPlacement}
          options={algorithmOptions.objectPlacement}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "objectPlacement", value))}
        />
      </section>

      <section className="control-section">
        <h2>Parameters</h2>
        {paramOptions.map((param) => (
          <label key={param.key} className="range-row">
            <span>
              {param.label}
              <output>{formatParam(recipe.params[param.key])}</output>
            </span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={recipe.params[param.key]}
              onChange={(event) => onRecipeChange(withParam(recipe, param.key, Number(event.target.value)))}
            />
          </label>
        ))}
      </section>

      <button type="button" className="generate-button" onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? "Generating" : "Generate"}
      </button>
    </aside>
  );
}

interface AlgorithmSelectProps<K extends keyof AlgorithmSelection> {
  label: string;
  value: AlgorithmSelection[K];
  options: readonly AlgorithmSelection[K][];
  onChange: (value: AlgorithmSelection[K]) => void;
}

function AlgorithmSelect<K extends keyof AlgorithmSelection>({
  label,
  value,
  options,
  onChange,
}: AlgorithmSelectProps<K>) {
  return (
    <label className="select-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as AlgorithmSelection[K])}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
