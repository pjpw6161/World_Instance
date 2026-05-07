param(
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$AdminToken,

    [string]$Prefix = "WF-SMOKE"
)

$ErrorActionPreference = "Stop"

function Resolve-ApiBaseUrl {
    param([string]$BaseUrl)

    $trimmed = $BaseUrl.Trim().TrimEnd("/")
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw "ApiBaseUrl must not be empty."
    }
    if ($trimmed.EndsWith("/api")) {
        return $trimmed.Substring(0, $trimmed.Length - 4)
    }
    return $trimmed
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==> $Name"
    try {
        & $Action
        Write-Host "OK: $Name"
    }
    catch {
        Write-Error "FAILED at step '$Name': $($_.Exception.Message)"
        exit 1
    }
}

function Assert-Condition {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Convert-ToJsonBody {
    param([object]$Value)
    return $Value | ConvertTo-Json -Depth 32 -Compress
}

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [hashtable]$Headers = @{}
    )

    $uri = "$script:BaseUrl$Path"
    $params = @{
        Method = $Method
        Uri = $uri
        Headers = $Headers
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = Convert-ToJsonBody $Body
    }
    return Invoke-RestMethod @params
}

function New-SmokeRecipe {
    param([int64]$Seed)

    return [ordered]@{
        engineVersion = "0.1.0"
        seed = $Seed
        width = 256
        height = 256
        features = [ordered]@{
            mountains = $true
            forests = $true
            trees = $true
            roads = $true
            caves = $false
            rivers = $false
            villages = $true
        }
        algorithms = [ordered]@{
            terrain = "noise-island"
            cave = "cellular-automata"
            road = "astar"
            objectPlacement = "biome-density"
        }
        params = [ordered]@{
            waterLevel = 0.38
            mountainLevel = 0.72
            forestDensity = 0.55
            caveDensity = 0.42
            roadComplexity = 0.4
        }
    }
}

function New-SmokeStats {
    return [ordered]@{
        waterRatio = 0.25
        landRatio = 0.75
        forestRatio = 0.24
        mountainRatio = 0.1
        treeCount = 10
        roadLength = 4
        caveAreaRatio = 0.0
        villageCount = 1
        creatureCount = 4
        surfaceCreatureCount = 3
        caveCreatureCount = 1
        portalCount = 1
        reachableAreaRatio = 0.76
        blockedRatio = 0.15
        generationTimeMs = 1
        livingStats = [ordered]@{
            creatureCount = 4
            surfaceCreatureCount = 3
            caveCreatureCount = 1
            reachableAreaRatio = 0.76
            blockedTileRatio = 0.15
            portalCount = 1
            npcCount = 1
            livingDensity = 0.00008
            creatureDensity = 0.00006
        }
    }
}

function Search-ContainsProject {
    param(
        [object]$SearchResponse,
        [string]$ProjectId
    )

    foreach ($result in $SearchResponse.results) {
        if ([string]$result.projectId -eq $ProjectId) {
            return $true
        }
    }
    return $false
}

function Wait-ForSearchProject {
    param(
        [string]$Path,
        [string]$ProjectId,
        [int]$Attempts = 10,
        [int]$DelaySeconds = 1
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        $response = Invoke-Json -Method Get -Path $Path
        if (Search-ContainsProject -SearchResponse $response -ProjectId $ProjectId) {
            return $true
        }
        if ($attempt -lt $Attempts) {
            Write-Host "Search result not visible yet; retrying in $DelaySeconds second(s)... ($attempt/$Attempts)"
            Start-Sleep -Seconds $DelaySeconds
        }
    }
    return $false
}

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
    Write-Error "AdminToken must not be empty."
    exit 2
}

$script:BaseUrl = Resolve-ApiBaseUrl $ApiBaseUrl
$runId = (Get-Date -Format "yyyyMMddHHmmss") + "-" + ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$email = "smoke-$runId@example.com"
$password = "Password123!"
$title = "$Prefix API Smoke $runId"
$mapHash = "smoke-$runId"
$encodedTitle = [uri]::EscapeDataString($title)
$authHeaders = @{}
$projectId = $null

Write-Host "World Forge API smoke test"
Write-Host "API base URL: $script:BaseUrl"
Write-Host "Smoke prefix: $Prefix"
Write-Host "Smoke title: $title"
Write-Host "This script creates test data and does not delete production data."

Invoke-Step "API health" {
    $health = Invoke-Json -Method Get -Path "/api/health"
    Assert-Condition ($health.status -eq "ok") "Expected health.status to be ok."
}

Invoke-Step "signup" {
    $signup = Invoke-Json -Method Post -Path "/api/auth/signup" -Body @{
        email = $email
        password = $password
        nickname = "Smoke Test User"
    }
    Assert-Condition ($signup.tokenType -eq "Bearer") "Expected signup tokenType Bearer."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($signup.token)) "Expected signup token."
}

Invoke-Step "login" {
    $login = Invoke-Json -Method Post -Path "/api/auth/login" -Body @{
        email = $email
        password = $password
    }
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($login.token)) "Expected login token."
    $script:authHeaders = @{ Authorization = "Bearer $($login.token)" }
}

Invoke-Step "map save as private" {
    $created = Invoke-Json -Method Post -Path "/api/maps" -Headers $script:authHeaders -Body @{
        title = $title
        description = "Created by deployment smoke test. Safe to leave for audit."
        recipe = New-SmokeRecipe -Seed 24680
        stats = New-SmokeStats
        mapHash = $mapHash
    }
    $script:projectId = [string]$created.id
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($script:projectId)) "Expected created project id."
    Assert-Condition ($created.visibility -eq "PRIVATE") "Expected created map to be PRIVATE."
}

Invoke-Step "private map is not searchable before publish" {
    $privateSearch = Invoke-Json -Method Get -Path "/api/search/maps?keyword=$encodedTitle"
    Assert-Condition (-not (Search-ContainsProject -SearchResponse $privateSearch -ProjectId $script:projectId)) "Private map appeared in public search before publish."
}

Invoke-Step "map publish" {
    $published = Invoke-Json -Method Patch -Path "/api/maps/$script:projectId" -Headers $script:authHeaders -Body @{
        visibility = "PUBLIC"
    }
    Assert-Condition ($published.visibility -eq "PUBLIC") "Expected published map visibility PUBLIC."
}

Invoke-Step "reindex public maps" {
    $reindex = Invoke-Json -Method Post -Path "/api/admin/search/maps/reindex" -Headers @{
        "X-World-Forge-Admin-Token" = $AdminToken
    }
    Write-Host "Index: $($reindex.indexName)"
    Write-Host "Public projects: $($reindex.publicProjects)"
    Write-Host "Indexed documents: $($reindex.indexedDocuments)"
    Write-Host "Skipped projects: $($reindex.skippedProjects)"
    Write-Host "Rebuilt at: $($reindex.rebuiltAt)"
    Assert-Condition ($null -ne $reindex.indexedDocuments) "Expected reindex indexedDocuments count."
}

Invoke-Step "search published map" {
    Assert-Condition (Wait-ForSearchProject -Path "/api/search/maps?keyword=$encodedTitle" -ProjectId $script:projectId) "Published map was not found in public search after waiting for search refresh."
}

Invoke-Step "facets" {
    $facets = Invoke-Json -Method Get -Path "/api/search/maps/facets"
    Assert-Condition ($null -ne $facets.features) "Expected facets.features in response."
    Assert-Condition ($null -ne $facets.terrainAlgorithms) "Expected facets.terrainAlgorithms in response."
}

Write-Host ""
Write-Host "Smoke test complete."
Write-Host "Created user: $email"
Write-Host "Created map project: $script:projectId"
Write-Host "Created public title: $title"
