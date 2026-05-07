param(
    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$AdminToken
)

$ErrorActionPreference = "Stop"

function Get-ReindexUri {
    param([string]$BaseUrl)

    $trimmed = $BaseUrl.Trim().TrimEnd("/")
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw "ApiBaseUrl must not be empty."
    }

    if ($trimmed.EndsWith("/api")) {
        return "$trimmed/admin/search/maps/reindex"
    }

    return "$trimmed/api/admin/search/maps/reindex"
}

try {
    if ([string]::IsNullOrWhiteSpace($AdminToken)) {
        throw "AdminToken must not be empty."
    }

    $uri = Get-ReindexUri -BaseUrl $ApiBaseUrl
    Write-Host "Reindexing public map search projection through Spring Boot API..."
    Write-Host "Endpoint: $uri"

    $response = Invoke-RestMethod -Method Post -Uri $uri -Headers @{
        "X-World-Forge-Admin-Token" = $AdminToken
    }

    Write-Host "Reindex complete."
    Write-Host "Index: $($response.indexName)"
    Write-Host "Public projects: $($response.publicProjects)"
    Write-Host "Indexed documents: $($response.indexedDocuments)"
    Write-Host "Skipped projects: $($response.skippedProjects)"
    Write-Host "Rebuilt at: $($response.rebuiltAt)"
    exit 0
}
catch {
    Write-Error "Search reindex failed: $($_.Exception.Message)"
    exit 1
}
