$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$package = Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$outputDirectory = Join-Path $projectRoot 'release-artifacts/source'
$archiveName = "FPKG-Builder-$version-source.zip"
$archivePath = Join-Path $outputDirectory $archiveName
$temporaryRoot = Join-Path $outputDirectory (".staging-" + [guid]::NewGuid().ToString('N'))
$bundleRoot = Join-Path $temporaryRoot "FPKG-Builder-$version"

New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$generatedDirectoryNames = @('bin', 'obj', 'target', 'node_modules', '.git', '.vs')
function Copy-SourceTree([string]$source, [string]$destination) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    foreach ($entry in Get-ChildItem -LiteralPath $source -Force) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        if ($entry.PSIsContainer) {
            if ($generatedDirectoryNames -contains $entry.Name) { continue }
            Copy-SourceTree $entry.FullName (Join-Path $destination $entry.Name)
        } else {
            Copy-Item -LiteralPath $entry.FullName -Destination $destination
        }
    }
}

try {
    $directories = @('.github', 'docs', 'packaging', 'src', 'tools', 'vendor/LibOrbisPkg')
    foreach ($relative in $directories) {
        Copy-SourceTree (Join-Path $projectRoot $relative) (Join-Path $bundleRoot $relative)
    }

    $files = @(
        'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'README.md',
        'THIRD_PARTY_NOTICES.md'
    )
    foreach ($relative in $files) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $relative) -Destination $bundleRoot
    }

    $tauriRoot = Join-Path $bundleRoot 'src-tauri'
    New-Item -ItemType Directory -Path $tauriRoot -Force | Out-Null
    foreach ($relative in @('build.rs', 'Cargo.toml', 'Cargo.lock', 'tauri.conf.json')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "src-tauri/$relative") -Destination $tauriRoot
    }
    foreach ($relative in @('capabilities', 'icons', 'src')) {
        Copy-SourceTree (Join-Path $projectRoot "src-tauri/$relative") (Join-Path $tauriRoot $relative)
    }

    $resourceSource = Join-Path $projectRoot 'src-tauri/resources'
    $resourceDestination = Join-Path $tauriRoot 'resources'
    New-Item -ItemType Directory -Path $resourceDestination -Force | Out-Null
    foreach ($file in @('THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_DEPENDENCY_LICENSES.md', 'LibOrbisPkg-LICENSE.txt')) {
        Copy-Item -LiteralPath (Join-Path $resourceSource $file) -Destination $resourceDestination
    }
    Copy-SourceTree (Join-Path $resourceSource 'licenses') (Join-Path $resourceDestination 'licenses')

    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    $archiveTimestamp = [datetime]::new(2026, 11, 7, 0, 0, 0, [DateTimeKind]::Utc)
    Get-ChildItem -LiteralPath $bundleRoot -Force -Recurse | ForEach-Object { $_.LastWriteTimeUtc = $archiveTimestamp }
    (Get-Item -LiteralPath $bundleRoot).LastWriteTimeUtc = $archiveTimestamp
    Add-Type -AssemblyName System.IO.Compression
    $archiveStream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $zip = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $archiveRootName = Split-Path $bundleRoot -Leaf
        $bundlePrefix = [IO.Path]::GetFullPath($bundleRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        foreach ($file in Get-ChildItem -LiteralPath $bundleRoot -File -Recurse -Force) {
            $relative = $file.FullName.Substring($bundlePrefix.Length).Replace('\', '/')
            $entry = $zip.CreateEntry("$archiveRootName/$relative", [IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = [DateTimeOffset]::new($archiveTimestamp, [TimeSpan]::Zero)
            $sourceStream = [IO.File]::OpenRead($file.FullName)
            try {
                $entryStream = $entry.Open()
                try { $sourceStream.CopyTo($entryStream) }
                finally { $entryStream.Dispose() }
            }
            finally { $sourceStream.Dispose() }
        }
    }
    finally {
        $zip.Dispose()
        $archiveStream.Dispose()
    }
    $hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $archiveName" | Set-Content -LiteralPath (Join-Path $outputDirectory 'SHA256SUMS') -Encoding ascii
    Get-FileHash -LiteralPath $archivePath -Algorithm SHA256 | Select-Object Hash, Path
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolvedTemporary = (Resolve-Path -LiteralPath $temporaryRoot).Path
        $outputBase = [IO.Path]::GetFullPath($outputDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if (-not $resolvedTemporary.StartsWith($outputBase, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove staging directory outside the source artifact folder: $resolvedTemporary"
        }
        Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    }
}
