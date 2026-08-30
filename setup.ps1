<#
    FieldPilot - one-shot local setup for Windows / PowerShell.

    Usage:  .\setup.ps1
    Safe to re-run: it skips whatever is already in place.
#>

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n=== $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "  [ok] $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  [!]  $text" -ForegroundColor Yellow }

Step "Checking Node.js"
$nodeVersion = (node --version) -replace "v", ""
$major = [int]($nodeVersion.Split(".")[0])
if ($major -lt 22) { throw "Node 22+ required. Found $nodeVersion. Install from https://nodejs.org" }
Ok "Node $nodeVersion"

Step "Installing dependencies"
npm install
Ok "Dependencies installed"

Step "Starting Postgres"
try {
    docker compose up -d | Out-Null
    Ok "Postgres running on localhost:5432"
    Start-Sleep -Seconds 4
} catch {
    Warn "Docker not available. Point DATABASE_URL at your own Postgres before continuing."
}

Step "Creating .env.local"
if (Test-Path ".env.local") {
    Ok ".env.local already exists - leaving it alone"
} else {
    Copy-Item ".env.example" ".env.local"
    $secret = node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    (Get-Content ".env.local") -replace "^AUTH_SECRET=.*", "AUTH_SECRET=$secret" | Set-Content ".env.local"
    Ok "Created .env.local with a generated AUTH_SECRET"
    Warn "Add your ASSEMBLYAI_API_KEY to .env.local before starting a voice job"
}

Step "Applying database schema"
npm run db:push
Ok "Schema applied"

Step "Loading demo data"
npm run seed

Step "Verifying the build"
npm run typecheck
npm test
Ok "Typecheck and tests passed"

Write-Host "`n----------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Ready. Next:" -ForegroundColor Cyan
Write-Host "   1. Put your ASSEMBLYAI_API_KEY in .env.local"
Write-Host "   2. npm run dev"
Write-Host "   3. Open http://localhost:3000/api/health  (check everything is green)"
Write-Host "   4. Sign in: demo@fieldpilot.app / fieldpilot123"
Write-Host "   5. Voice job -> Start talking -> `"I'm at Site 14. Pump 3 is vibrating again.`""
Write-Host "----------------------------------------------------------`n" -ForegroundColor Cyan
