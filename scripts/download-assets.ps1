[CmdletBinding()]
param(
    # Manifest JSON: { "files": [ { "file", "target", "root": "models|downloads", "bytes", "sha256", "official_url", "mirror_url" } ] }
    [Parameter(Mandatory = $true)][string]$Manifest,
    # Root for "models" entries (usually the shared ComfyUI folder, e.g. F:\Local-AI\video\ComfyUI)
    [Parameter(Mandatory = $true)][string]$ModelRoot,
    # Root for "downloads" entries (installers, wheels) and the reports folder
    [Parameter(Mandatory = $true)][string]$DownloadRoot,
    [ValidateSet('Mirror', 'Official')][string]$Source = 'Official',
    [string]$Proxy,
    [switch]$PlanOnly
)
# Run by the USER in their own PowerShell. The agent only prepares the manifest and this command.
# Parallel download with resume (aria2c), per-file SHA256, independent re-verification, session lock.
# Never deletes partial files: on failure, run the same command again to resume.
$ErrorActionPreference = 'Stop'
$m = Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest | ConvertFrom-Json
$files = @($m.files)
if ($files.Count -lt 1) { throw 'Manifest has no files.' }
$ModelRoot = [IO.Path]::GetFullPath($ModelRoot)
$DownloadRoot = [IO.Path]::GetFullPath($DownloadRoot)
$aria = Get-Command aria2c -CommandType Application -ErrorAction SilentlyContinue
if (-not $aria -and -not $PlanOnly) { throw 'aria2c not found. Install it first (e.g. winget install aria2.aria2), or download the URLs manually and re-run with -PlanOnly to see targets.' }

$lines = [Collections.Generic.List[string]]::new()
$plan = @()
$total = [long]0
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($f in $files) {
    $root = if ($f.root -eq 'downloads') { $DownloadRoot } else { $ModelRoot }
    $name = [string]$f.file
    if ([string]::IsNullOrWhiteSpace($name) -or $name -ne [IO.Path]::GetFileName($name)) { throw "Invalid file name: $name" }
    $dir = [IO.Path]::GetFullPath((Join-Path $root ([string]$f.target)))
    $path = Join-Path $dir $name
    if (-not $path.StartsWith($root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Target escapes root: $path" }
    if (-not $seen.Add($path)) { throw "Duplicate target: $path" }
    if ($f.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or [long]$f.bytes -le 0) { throw "Missing sha256 or bytes for $name" }
    $url = if ($Source -eq 'Mirror' -and $f.mirror_url) { [string]$f.mirror_url } else { [string]$f.official_url }
    if (([Uri]$url).Scheme -ne 'https') { throw "Not an https URL: $url" }
    $lines.Add($url); $lines.Add("  dir=$dir"); $lines.Add("  out=$name"); $lines.Add("  checksum=sha-256=$($f.sha256)")
    $total += [long]$f.bytes
    $plan += [pscustomobject]@{ file = $name; path = $path; bytes = [long]$f.bytes; sha256 = ([string]$f.sha256).ToLower() }
    Write-Output "$name -> $dir"
}
Write-Output ("Source=$Source; files=$($files.Count); total_GB=" + [Math]::Round($total / 1e9, 2))
if ($PlanOnly) { Write-Output 'PLAN ONLY: nothing downloaded.'; return }

New-Item -ItemType Directory -Force -Path $DownloadRoot, (Join-Path $DownloadRoot 'reports') | Out-Null
$lock = $null
try {
    try { $lock = [IO.File]::Open((Join-Path $DownloadRoot 'download-assets.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another download session is running. Do not run two at once.' }
    foreach ($p in $plan) { New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($p.path)) | Out-Null }
    $listFile = Join-Path $DownloadRoot 'download-assets.txt'
    [IO.File]::WriteAllLines($listFile, $lines, [Text.UTF8Encoding]::new($false))
    $ariaArgs = @('--no-conf=true', '--continue=true', '--max-concurrent-downloads=3', '-x8', '-s8', '-k4M', '--file-allocation=none',
        '--check-integrity=true', '--auto-file-renaming=false', '--allow-overwrite=false', '--max-tries=5', '--retry-wait=5',
        '--connect-timeout=20', '--timeout=60', "--input-file=$listFile")
    if ($Proxy) { $ariaArgs += "--all-proxy=$Proxy" }
    & $aria.Source @ariaArgs
    if ($LASTEXITCODE -ne 0) { throw 'DOWNLOAD INCOMPLETE: keep the files and run the same command again to resume.' }
    $report = @()
    $ok = $true
    foreach ($p in $plan) {
        $exists = Test-Path -LiteralPath $p.path
        $size = if ($exists) { (Get-Item -LiteralPath $p.path).Length } else { 0 }
        $hash = if ($exists) { (Get-FileHash -LiteralPath $p.path -Algorithm SHA256).Hash.ToLower() } else { '' }
        $pass = $exists -and $size -eq $p.bytes -and $hash -eq $p.sha256
        if (-not $pass) { $ok = $false }
        $report += [pscustomobject]@{ file = $p.file; path = $p.path; bytes = $size; expected_bytes = $p.bytes; sha256 = $hash; expected_sha256 = $p.sha256; pass = $pass }
    }
    $reportPath = Join-Path $DownloadRoot 'reports\download-verification.json'
    $report | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    if (-not $ok) { throw "VERIFICATION FAILED: see $reportPath. Do not install; tell the agent." }
    Write-Output "PASS: all files passed size and SHA256 checks. Report: $reportPath"
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
}
