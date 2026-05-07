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
import type { SampleWorldPreset } from "../editor/sampleWorlds";
import { algorithmLabel } from "../i18n/korean";

interface ControlPanelProps {
  recipe: GenerationRecipe;
  isGenerating: boolean;
  samplePresets?: readonly SampleWorldPreset[];
  onRecipeChange: (recipe: GenerationRecipe) => void;
  onGenerate: () => void;
  onSampleSelect?: (preset: SampleWorldPreset) => void;
}

export function ControlPanel({
  recipe,
  isGenerating,
  samplePresets = [],
  onRecipeChange,
  onGenerate,
  onSampleSelect,
}: ControlPanelProps) {
  return (
    <aside className="control-panel" aria-label="세계 설계 패널">
      {samplePresets.length > 0 ? (
        <section className="control-section sample-world-section">
          <h2>샘플 세계</h2>
          <p>포트폴리오 데모용으로 성격이 뚜렷한 설계를 바로 불러옵니다.</p>
          <div className="sample-world-list">
            {samplePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="sample-world-button"
                onClick={() => onSampleSelect?.(preset)}
              >
                <strong>{preset.title}</strong>
                <span>{preset.tagline}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="control-section">
        <h2>세계 크기</h2>
        <div className="control-grid two-col">
          <label>
            <span>너비</span>
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
            <span>높이</span>
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
          <span>시드</span>
          <span className="seed-inputs">
            <input
              type="number"
              min={0}
              max={4294967295}
              value={recipe.seed}
              onChange={(event) => onRecipeChange(withSeed(recipe, Number(event.target.value)))}
            />
            <button type="button" className="secondary-button" onClick={() => onRecipeChange(withSeed(recipe, createRandomSeed()))}>
              새 시드
            </button>
          </span>
        </label>
      </section>

      <section className="control-section">
        <h2>세계 요소</h2>
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
        <h2>생성 알고리즘</h2>
        <AlgorithmSelect<"terrain">
          label="지형 알고리즘"
          value={recipe.algorithms.terrain}
          options={algorithmOptions.terrain}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "terrain", value))}
        />
        <AlgorithmSelect<"cave">
          label="동굴 알고리즘"
          value={recipe.algorithms.cave}
          options={algorithmOptions.cave}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "cave", value))}
        />
        <AlgorithmSelect<"road">
          label="도로 알고리즘"
          value={recipe.algorithms.road}
          options={algorithmOptions.road}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "road", value))}
        />
        <AlgorithmSelect<"objectPlacement">
          label="오브젝트 배치 알고리즘"
          value={recipe.algorithms.objectPlacement}
          options={algorithmOptions.objectPlacement}
          onChange={(value) => onRecipeChange(withAlgorithm(recipe, "objectPlacement", value))}
        />
      </section>

      <section className="control-section">
        <h2>성격 조율</h2>
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
        {isGenerating ? "세계 빚는 중" : "세계 빚기"}
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
            {algorithmLabel(String(option))}
          </option>
        ))}
      </select>
    </label>
  );
}
