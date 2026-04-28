# Generation Engine Spec

## Engine location

```txt
engine/wasm-engine/
```

## Language

- C++17
- Emscripten WebAssembly target

## Determinism

The same `engineVersion + recipe` must generate the same `mapHash`.

Rules:

- no `Math.random()` for generation
- no language default RNG without explicit deterministic spec
- use a documented deterministic PRNG
- prefer integer/fixed-point thresholds where possible
- include `engineVersion` in saved recipes

## MVP input

```json
{
  "engineVersion": "0.1.0",
  "seed": 12345,
  "width": 256,
  "height": 256,
  "features": {
    "mountains": true,
    "forests": true,
    "trees": true,
    "roads": true,
    "caves": false,
    "rivers": false,
    "villages": true
  },
  "algorithms": {
    "terrain": "noise-island",
    "cave": "cellular-automata",
    "road": "astar",
    "objectPlacement": "biome-density"
  },
  "params": {
    "waterLevel": 0.38,
    "mountainLevel": 0.72,
    "forestDensity": 0.55,
    "caveDensity": 0.42,
    "roadComplexity": 0.4
  }
}
```

## MVP output

```txt
MapData
- width
- height
- heightMap
- terrainMap
- objectList
- collisionMap
- costMap
- portalList
- stats
- mapHash
```

## Generation pipeline

```txt
validate recipe
initialize deterministic PRNG
create heightMap
classify terrainMap
apply enabled feature generators
create objectList
create collisionMap
create costMap
create portalList
compute stats
compute mapHash
return MapData
```

## Initial algorithms

### Terrain

- `noise-island`: value/simple noise + island falloff
- `radial-island`: simpler radial falloff for early MVP

### Caves

- `cellular-automata`: cave layer or cave regions
- `random-walk`: simple tunnel regions

### Roads

- `simple-path`: connect key points with low-cost paths
- `astar`: use costMap when available

### Objects

- `biome-density`: trees based on biome/terrain
- `scatter`: deterministic random placement with constraints

## Stats

MVP stats:

- waterRatio
- landRatio
- forestRatio
- mountainRatio
- treeCount
- roadLength
- caveAreaRatio
- villageCount
- blockedRatio
- reachableAreaRatio later
- generationTimeMs client-measured

## Validation

The engine wrapper should reject:

- width/height outside limits
- unsupported algorithms
- params outside allowed ranges
- disabled feature output appearing in MapData
