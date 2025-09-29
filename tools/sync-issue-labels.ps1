param(
  [string]$JsonlPath = 'tools/gh-issues-import.jsonl'
)
$ErrorActionPreference = 'Continue'

# Ensure labels exist (force to set color/description if needed)
$labels = @(
  @{name='phase-1'; color='5319e7'; desc='Phase 1 (MVP)';},
  @{name='setup'; color='1d76db'; desc='Project setup';},
  @{name='enhancement'; color='a2eeef'; desc='Feature';},
  @{name='audio-engine'; color='fbca04'; desc='Audio engine';},
  @{name='ui'; color='d4c5f9'; desc='User Interface';},
  @{name='logic'; color='0052cc'; desc='Logic/Model';}
)
foreach ($l in $labels) {
  try { gh label create $($l.name) --color $($l.color) --description $($l.desc) --force | Out-Null } catch { }
}

# Ensure milestone exists
$msName = 'Phase 1 (MVP) Release'
try { gh api -X POST repos/:owner/:repo/milestones -f title=$msName -f state='open' | Out-Null } catch { }

if (-not (Test-Path $JsonlPath)) { throw "JSONL not found: $JsonlPath" }

# Read as UTF-8 and parse per line (ignore empty)
$lines = Get-Content -Path $JsonlPath -Encoding UTF8
$specs = @()
foreach ($ln in $lines) {
  if ([string]::IsNullOrWhiteSpace($ln)) { continue }
  try { $specs += ($ln | ConvertFrom-Json) } catch { Write-Host "skip invalid jsonl line" }
}
$allIssues = gh issue list --state all --limit 500 --json number,title | ConvertFrom-Json

foreach ($s in $specs) {
  $title = [string]$s.title
  $labelsToAdd = @(); if ($s.labels) { $labelsToAdd = @($s.labels) }
  $ms = $s.milestone
  $match = $allIssues | Where-Object { $_.title -eq $title } | Select-Object -First 1
  if ($null -eq $match) {
    # Create if missing (idempotent-ish)
    $args = @('issue','create','--title',$title,'--body',([string]$s.body))
    if ($ms) { $args += @('--milestone',$ms) }
    foreach ($lab in $labelsToAdd) { $args += @('--label',$lab) }
    try { & gh @args | Out-Null } catch { Write-Host "create failed for: $title" }
  } else {
    if ($ms) { try { gh issue edit $match.number --milestone $ms | Out-Null } catch { } }
    foreach ($lab in $labelsToAdd) { try { gh issue edit $match.number --add-label $lab | Out-Null } catch { } }
  }
}
