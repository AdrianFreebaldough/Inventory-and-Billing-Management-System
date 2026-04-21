$authBody = @{email='owner@test.com'; password='owner123'} | ConvertTo-Json
$res = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $authBody -ContentType "application/json"
$headers = @{ Authorization = "Bearer $($res.token)" }

# Filtered endpoints to avoid 404s
$endpoints = @(
    @{ uri="http://localhost:3000/api/owner/disposal"; name="disposal"; nameField="name"; parentField="requestedBy"; idField="referenceId" },
    @{ uri="http://localhost:3000/api/owner/inventory/requests/pending"; name="inventory-pending"; nameField="name"; parentField="requestedBy"; idField="_id" },
    @{ uri="http://localhost:3000/api/owner/inventory/requests/all"; name="inventory-all"; nameField="name"; parentField="requestedBy"; idField="_id" }
)

$bad = @()
foreach ($e in $endpoints) {
    try {
        $r = Invoke-RestMethod -Uri $e.uri -Method Get -Headers $headers
        foreach ($item in $r.data) {
            $val = if ($e.parentField) { $item.($e.parentField).($e.nameField) } else { $item.($e.nameField) }
            if ($val -and (($val -match '@') -or ($val -match '^[a-fA-F0-9]{24}$') -or ($val -match '^[A-Z]{2,}-\d+'))) {
                $bad += [pscustomobject]@{ endpoint=$e.name; id=$item.($e.idField); name=$val }
            }
        }
    } catch { 
        Write-Warning "Failed to fetch $($e.uri): $_"
    }
}
$bad | ConvertTo-Json
