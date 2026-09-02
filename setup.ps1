<#
    FieldPilot - local setup for Windows / PowerShell.

    Usage:
        .\setup.ps1              full setup
        .\setup.ps1 -Check       diagnose only, change nothing
        .\setup.ps1 -SkipDocker  use a Postgres you already run

    Safe to re-run. It never reports success for a step that failed.
#>

[CmdletBinding()]
param(
    [switch]$Check,
    [switch]$SkipDocker,
    # Force a specific host port for Postgres. Omitted, setup picks a free one.
    [int]$DbPort = 0
)

$ErrorActionPreference = "Stop"

function Step($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  [ok]   $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [warn] $t" -ForegroundColor Yellow }
function Bad($t)  { Write-Host "  [fail] $t" -ForegroundColor Red }

<#
  PowerShell does not throw on a non-zero exit code from a native program, and
  $ErrorActionPreference does not change that. Every external command therefore
  goes through here, so a failure can never be reported as success.
#>
function Invoke-Native {
    param([string]$Command, [string]$What)
    Write-Host "  > $Command" -ForegroundColor DarkGray
    $global:LASTEXITCODE = 0
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." }
}

# Always operate on the folder this script lives in, never on whatever
# directory the terminal happened to be pointing at.
Set-Location -LiteralPath $PSScriptRoot
Write-Host "FieldPilot setup" -ForegroundColor Cyan
Write-Host "Working in: $PSScriptRoot" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
Step "Checking the project files are here"

$required = @("package.json", ".env.example", "docker-compose.yml", "src", "scripts")
$missing  = $required | Where-Object { -not (Test-Path -LiteralPath $_) }

if ($missing.Count -gt 0) {
    Bad "This folder is missing: $($missing -join ', ')"

    # The most common cause: the zip was extracted into a subfolder and only
    # setup.ps1 was copied out. Find the real project and say exactly where it is.
    $candidate = Get-ChildItem -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "package.json") } |
        Select-Object -First 1

    Write-Host ""
    if ($candidate) {
        Write-Host "The project appears to be in a subfolder. Run this instead:" -ForegroundColor Yellow
        Write-Host "    cd `"$($candidate.FullName)`"" -ForegroundColor White
        Write-Host "    .\setup.ps1" -ForegroundColor White
    } else {
        Write-Host "Extract fieldpilot.zip into this folder first, so that" -ForegroundColor Yellow
        Write-Host "package.json sits next to setup.ps1, then run it again." -ForegroundColor Yellow
    }
    exit 1
}
Ok "All project files present"

# ---------------------------------------------------------------------------
Step "Checking Node.js"

try { $nodeVersion = (node --version) -replace "v", "" }
catch { Bad "Node.js is not on PATH. Install Node 22+ from https://nodejs.org"; exit 1 }

$major = [int]($nodeVersion.Split(".")[0])
if ($major -lt 22) { Bad "Node 22+ required, found $nodeVersion."; exit 1 }
Ok "Node $nodeVersion"

# ---------------------------------------------------------------------------
Step "Checking this folder is writable"

# npm's EPERM on Windows is almost always a drive root, a synced folder, or
# antivirus - not a bug in the project. Catch it before npm does.
$here = (Get-Location).Path
if ($here -match '^[A-Za-z]:\\?$') {
    Bad "The project is at a drive root ($here). npm cannot install there."
    Write-Host "  Move it into a normal folder, for example E:\projects\fieldpilot" -ForegroundColor Yellow
    exit 1
}
if ($here -match 'OneDrive|Dropbox|Google Drive') {
    Warn "This folder is inside a syncing cloud drive. Sync locks files mid-install."
    Warn "If npm install fails with EPERM, move the project outside it."
}

try {
    $probe = Join-Path $here ".fieldpilot-write-test"
    New-Item -ItemType File -Path $probe -Force | Out-Null
    Remove-Item -LiteralPath $probe -Force
    Ok "Folder is writable"
} catch {
    Bad "Cannot write to $here."
    Write-Host "  Check folder permissions, close editors holding files open," -ForegroundColor Yellow
    Write-Host "  and add this folder to your antivirus exclusions." -ForegroundColor Yellow
    exit 1
}

if ($Check) {
    Step "Check mode - stopping before any changes"
    Write-Host "  Run .\setup.ps1 without -Check to install." -ForegroundColor DarkGray
    exit 0
}

# ---------------------------------------------------------------------------
Step "Installing dependencies"
Invoke-Native "npm install --no-audit --no-fund" "npm install"
Ok "Dependencies installed"

# ---------------------------------------------------------------------------
Step "Starting Postgres"

<#
  Another project may already own 5432 — a second Postgres container is the
  usual culprit. Rather than failing, pick a free port and write it to BOTH
  places that need it, so docker-compose.yml and .env.local can never disagree.
#>
function Test-PortFree([int]$port) {
    try { return -not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
    catch { return $true }
}

$chosenPort = 0

if ($SkipDocker) {
    Ok "Skipped - using the DATABASE_URL you configured"
} else {
    $dockerPresent = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
    if (-not $dockerPresent) {
        Warn "Docker is not on PATH."
        Warn "Start your own Postgres, point DATABASE_URL at it, then re-run with -SkipDocker."
    } else {
        if ($DbPort -gt 0) {
            $chosenPort = $DbPort
        } else {
            $chosenPort = 5432
            while (-not (Test-PortFree $chosenPort) -and $chosenPort -lt 5450) {
                # Is it OUR container already running there? Then it is not a conflict.
                $owner = (docker ps --filter "publish=$chosenPort" --format "{{.Names}}" 2>$null) -join ""
                if ($owner -match "fieldpilot-db") { break }
                Warn "Port $chosenPort is already in use$(if ($owner) { " by $owner" }). Trying $($chosenPort + 1)."
                $chosenPort++
            }
        }
        Ok "Using host port $chosenPort for Postgres"

        # Compose reads .env automatically; this is the single source for the port.
        $envFile = Join-Path $PSScriptRoot ".env"
        $lines = @()
        if (Test-Path -LiteralPath $envFile) {
            $lines = (Get-Content $envFile) | Where-Object { $_ -notmatch "^FIELDPILOT_DB_PORT=" }
        }
        ($lines + "FIELDPILOT_DB_PORT=$chosenPort") | Set-Content $envFile

        try {
            Invoke-Native "docker compose up -d" "docker compose up"
        } catch {
            Bad $_.Exception.Message
            Write-Host "  Is Docker Desktop running? If a stale container is holding the port:" -ForegroundColor Yellow
            Write-Host "    docker rm -f fieldpilot-db; .\setup.ps1" -ForegroundColor Yellow
            exit 1
        }

        # Poll readiness instead of sleeping a fixed guess. Postgres accepting
        # TCP is not the same as Postgres being ready to answer a query, and a
        # too-short sleep is why "schema push failed" appears right after a
        # successful "container started".
        Write-Host "  waiting for Postgres to accept queries..." -ForegroundColor DarkGray
        $ready = $false
        foreach ($i in 1..40) {
            docker exec fieldpilot-db pg_isready -U fieldpilot -d fieldpilot 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if ($ready) { Ok "Postgres is accepting queries" }
        else {
            Bad "Postgres did not become ready within 40 seconds."
            Write-Host "  Inspect it with: docker compose logs db" -ForegroundColor Yellow
            exit 1
        }
    }
}

# ---------------------------------------------------------------------------
Step "Creating .env.local"

if (Test-Path -LiteralPath ".env.local") {
    Ok ".env.local already exists - leaving it untouched"
} else {
    Copy-Item -LiteralPath ".env.example" -Destination ".env.local"
    $secret = node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    (Get-Content ".env.local") -replace "^AUTH_SECRET=.*", "AUTH_SECRET=$secret" | Set-Content ".env.local"
    Ok "Created .env.local with a generated AUTH_SECRET"
}

# Keep DATABASE_URL in step with the port docker actually published. This
# mismatch — compose on one port, .env.local on another — is the single most
# common breakage when a project is re-extracted over an existing setup.
if ($chosenPort -gt 0) {
    $envLocal = Get-Content ".env.local" -Raw
    $current = [regex]::Match($envLocal, "(?m)^DATABASE_URL=.*?localhost:(\d+)/")
    if ($current.Success -and $current.Groups[1].Value -ne "$chosenPort") {
        Warn "DATABASE_URL points at port $($current.Groups[1].Value) but Postgres is on $chosenPort. Correcting it."
        $envLocal = [regex]::Replace($envLocal, "(?m)^(DATABASE_URL=.*localhost):\d+/", "`$1:$chosenPort/")
        Set-Content ".env.local" $envLocal.TrimEnd()
        Ok "DATABASE_URL now points at port $chosenPort"
    }
}

$envText = Get-Content ".env.local" -Raw
if ($envText -match "(?m)^ASSEMBLYAI_API_KEY=\s*$") {
    Warn "ASSEMBLYAI_API_KEY is empty. Voice will not start until you add it."
    Warn "Everything else, including the typed input, works without it."
}

# ---------------------------------------------------------------------------
Step "Applying the database schema"
try {
    Invoke-Native "npm run db:push" "Schema push"
    Ok "Schema applied"
} catch {
    Bad $_.Exception.Message
    Write-Host "  Postgres is probably not reachable yet. Check DATABASE_URL in .env.local," -ForegroundColor Yellow
    Write-Host "  confirm the container is healthy with: docker compose ps" -ForegroundColor Yellow
    exit 1
}

# ---------------------------------------------------------------------------
Step "Loading demo data"
Invoke-Native "npm run seed" "Seed"

# ---------------------------------------------------------------------------
Step "Verifying the build"
Invoke-Native "npm run typecheck" "Typecheck"
Invoke-Native "npm test" "Unit tests"
Ok "Typecheck and tests passed"

# ---------------------------------------------------------------------------
Write-Host "`n-----------------------------------------------------------" -ForegroundColor Green
Write-Host " Setup complete." -ForegroundColor Green
Write-Host "-----------------------------------------------------------" -ForegroundColor Green
Write-Host "   1. Put your ASSEMBLYAI_API_KEY in .env.local"
Write-Host "   2. npm run dev"
Write-Host "   3. Open http://localhost:3000/api/health   (everything should be green)"
Write-Host "   4. Sign in: demo@fieldpilot.app / fieldpilot123"
Write-Host "   5. Voice job -> Start talking -> `"I'm at Site 14. Pump 3 is vibrating again.`""
Write-Host ""
Write-Host "   Diagnose anything later with:  npm run doctor" -ForegroundColor DarkGray
Write-Host ""
