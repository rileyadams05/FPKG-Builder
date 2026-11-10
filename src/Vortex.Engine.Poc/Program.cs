using System.Text.RegularExpressions;
using System.Text.Json;
using System.Diagnostics;
using System.IO.MemoryMappedFiles;
using LibOrbisPkg.GP4;
using LibOrbisPkg.PFS;
using LibOrbisPkg.PKG;
using LibOrbisPkg.SFO;

return args.Length == 0 ? Usage() : args[0] switch
{
    "fixture" when args.Length == 2 => CreateFixture(args[1]),
    "inspect-itemzflow" when args.Length == 2 => InspectItemzflow(args[1]),
    "gp4" when args.Length == 3 => GenerateGp4(args[1], args[2]),
    "inspect" when args.Length == 2 => Inspect(args[1]),
    "generate-gp4" when args.Length == 2 => GenerateWhenMissing(args[1]),
    "process" when args.Length == 3 => ProcessInput(args[1], args[2], "auto"),
    "process" when args.Length == 4 => ProcessInput(args[1], args[2], args[3]),
    "discover" when args.Length <= 2 => DiscoverDumps(args.Length == 2 ? args[1] : null),
    "build-dump" when args.Length == 3 => BuildDump(args[1], args[2]),
    "build" when args.Length == 3 => Build(args[1], args[2]),
    _ => Usage()
};

static int Usage()
{
    Console.Error.WriteLine("Usage: Vortex.Engine.Poc fixture <folder> | inspect <dump-root> | discover [settings.ini] | process <dump-folder-or-gp4> <output-folder> | generate-gp4 <dump-folder> | build-dump <dump-folder> <output-folder>");
    return 2;
}

static int CreateFixture(string folder)
{
    var root = Path.GetFullPath(folder);
    if (Directory.Exists(root) && Directory.EnumerateFileSystemEntries(root).Any())
        return Fail($"Refusing to populate a non-empty fixture folder: {root}");
    Directory.CreateDirectory(Path.Combine(root, "sce_sys"));
    File.WriteAllText(Path.Combine(root, "eboot.bin"), "FPKG Builder LibOrbisPkg controlled fixture\n");
    var sfo = new ParamSfo();
    sfo.SetValue("CATEGORY", SfoEntryType.Utf8, "gd", 4);
    sfo.SetValue("CONTENT_ID", SfoEntryType.Utf8, "IV0000-CUSA00001_00-AAAAAAAAAAAAAAAA", 48);
    sfo.SetValue("TITLE", SfoEntryType.Utf8, "Vortex POC Fixture", 128);
    sfo.SetValue("TITLE_ID", SfoEntryType.Utf8, "CUSA00001", 16);
    using var stream = File.Create(Path.Combine(root, "sce_sys", "param.sfo"));
    sfo.Write(stream);
    Console.WriteLine($"Fixture created: {root}");
    return 0;
}

static int GenerateGp4(string dumpFolder, string gp4Path)
{
    var root = Path.GetFullPath(dumpFolder);
    if (!Directory.Exists(root)) return Fail($"Source folder does not exist: {root}");
    var target = Path.GetFullPath(gp4Path);
    if (File.Exists(target)) return Fail($"Refusing to overwrite existing GP4: {target}");
    try
    {
        var (project, count, metadata) = CreateGp4Project(root);
        var validation = Gp4Validator.ValidateProject(project, root);
        foreach (var issue in validation) Console.WriteLine($"{issue.Type}: {issue.Message}");
        if (validation.Any(x => x.Type == ValidateResult.ResultType.Fatal)) return Fail("Generated GP4 failed LibOrbisPkg validation.");
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        using (var output = File.Create(target)) Gp4Project.WriteTo(project, output);
        Console.WriteLine($"Generated GP4 with {count} source files for {metadata.TitleId}: {target}");
        return 0;
    }
    catch (Exception ex) { return Fail(ex.Message); }
}

static (Gp4Project Project, int FileCount, DumpMetadata Metadata) CreateGp4Project(string root)
{
    var metadata = ReadDumpMetadata(root);
    var project = Gp4Project.Create(VolumeType.pkg_ps4_app);
    project.volume.Package.ContentId = metadata.ContentId;
    project.volume.volume_ts = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
    var pending = new Stack<string>();
    pending.Push(root);
    var count = 0;
    while (pending.Count > 0)
    {
        var directory = pending.Pop();
        foreach (var child in Directory.EnumerateFileSystemEntries(directory))
        {
            var attributes = File.GetAttributes(child);
            if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
            if ((attributes & FileAttributes.Directory) != 0)
            {
                pending.Push(child);
                continue;
            }
            var relative = Path.GetRelativePath(root, child).Replace('\\', '/');
            if (relative.StartsWith("../", StringComparison.Ordinal) || Path.IsPathRooted(relative))
                throw new InvalidDataException($"Unsafe path found in source: {relative}");
            if (Path.GetExtension(child).Equals(".gp4", StringComparison.OrdinalIgnoreCase) || !IncludeInGeneratedGp4(relative)) continue;
            project.files.Items.Add(new Gp4File { OrigPath = relative, TargetPath = relative });
            var parent = Path.GetDirectoryName(relative)?.Replace('\\', '/');
            if (!string.IsNullOrEmpty(parent))
            {
                Dir? dir = null;
                foreach (var segment in parent.Split('/')) dir = project.AddDir(dir, segment);
            }
            count++;
        }
    }
    return (project, count, metadata);
}

static int InspectItemzflow(string inputPath)
{
    try
    {
        var input = Path.GetFullPath(inputPath);
        if (!Directory.Exists(input)) throw new DirectoryNotFoundException($"Itemzflow folder not found: {input}");
        var games = Directory.EnumerateDirectories(input, "*", SearchOption.TopDirectoryOnly)
            .Where(path => (File.GetAttributes(path) & FileAttributes.ReparsePoint) == 0 && HasSfo(path)).ToList();
        var baseFolders = games.Where(path => !Path.GetFileName(path).EndsWith("-patch", StringComparison.OrdinalIgnoreCase)
            && !Path.GetFileName(path).Contains("-dlc", StringComparison.OrdinalIgnoreCase)
            && !IsDlcDumpFolder(path)).ToList();
        if (baseFolders.Count != 1) throw new InvalidDataException(baseFolders.Count == 0
            ? "No base-game folder was found inside Itemzflow."
            : "More than one base-game folder was found. Keep one game in the Itemzflow folder at a time.");
        var baseFolder = baseFolders[0];
        var metadata = ReadDumpMetadata(baseFolder);
        if (!Path.GetFileName(baseFolder).Equals(metadata.TitleId, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The base-game folder name must match its TITLE_ID.");
        var patch = Path.Combine(input, metadata.TitleId + "-patch");
        var hasPatch = Directory.Exists(patch);
        if (hasPatch && !HasSfo(patch)) throw new InvalidDataException("The matching -patch folder has no sce_sys/param.sfo.");
        var updatePkg = Path.Combine(input, "Update.pkg");
        if (hasPatch && File.Exists(updatePkg)) throw new InvalidDataException("Both a matching Itemzflow update folder and Update.pkg are present. Keep only one update source in the Itemzflow folder.");
        var detectedUpdate = hasPatch || File.Exists(updatePkg);
        EmitEvent(new {
            @event = "dump-inspected", inputPath = input, basePath = baseFolder,
            title = metadata.Title, titleId = metadata.TitleId, contentId = metadata.ContentId,
            hasUpdate = detectedUpdate, updateKind = hasPatch ? "itemzflow-folder" : File.Exists(updatePkg) ? "pkg" : null,
            updatePath = hasPatch ? patch : File.Exists(updatePkg) ? updatePkg : null,
            hasGp4 = FindExistingGp4(baseFolder, metadata.TitleId, metadata.ContentId) is not null
        });
        return 0;
    }
    catch (Exception ex) { return Fail(ex.Message); }
}

static int ProcessInput(string inputPath, string outputFolder, string updateChoice)
{
    var timer = Stopwatch.StartNew();
    var input = Path.GetFullPath(inputPath);
    if (!Directory.Exists(input)) return Fail($"Drop the Itemzflow folder that contains your game dump folders: {input}");
    if (!string.Equals(Path.GetFileName(Path.TrimEndingDirectorySeparator(input)), "Itemzflow", StringComparison.OrdinalIgnoreCase))
        return Fail("Drop the complete folder named Itemzflow. It should contain the CUSA game folder and, when present, its matching -patch folder.");
    EnsureExpectedExternalMount(outputFolder);

    string? extractedUpdate = null;
    try
    {
        var games = Directory.EnumerateDirectories(input, "*", SearchOption.TopDirectoryOnly)
            .Where(path => (File.GetAttributes(path) & FileAttributes.ReparsePoint) == 0 && HasSfo(path))
            .ToList();
        var baseFolders = games.Where(path => !Path.GetFileName(path).EndsWith("-patch", StringComparison.OrdinalIgnoreCase)
            && !Path.GetFileName(path).Contains("-dlc", StringComparison.OrdinalIgnoreCase)
            && !IsDlcDumpFolder(path)).ToList();
        if (baseFolders.Count != 1)
            throw new InvalidDataException(baseFolders.Count == 0
                ? "No base-game folder was found inside Itemzflow. The folder must contain sce_sys/param.sfo."
                : "More than one base-game folder was found. Put one game's files in the Itemzflow folder at a time.");

        var baseFolder = baseFolders[0];
        var projectRoot = Path.GetDirectoryName(input) ?? input;
        var metadata = ReadDumpMetadata(baseFolder);
        if (!Path.GetFileName(baseFolder).Equals(metadata.TitleId, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The base-game folder name must match its TITLE_ID (for example, CUSA12345).");
        var patchPath = Path.Combine(input, metadata.TitleId + "-patch");
        if (Directory.Exists(patchPath) && !HasSfo(patchPath))
            throw new InvalidDataException($"The matching update folder '{Path.GetFileName(patchPath)}' is present but does not contain sce_sys/param.sfo.");
        var patchFolder = games.SingleOrDefault(path =>
            Path.GetFileName(path).Equals(metadata.TitleId + "-patch", StringComparison.OrdinalIgnoreCase));
        var updatePkg = Path.Combine(input, "Update.pkg");
        var hasUpdatePkg = File.Exists(updatePkg);
        if (patchFolder is not null && hasUpdatePkg)
            throw new InvalidDataException("Both a matching Itemzflow update folder and Update.pkg are present. Keep only one update source in the Itemzflow folder.");
        if (patchFolder is null && !hasUpdatePkg && string.Equals(updateChoice, "yes", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("No update was found. Place the matching Itemzflow -patch folder or a compatible file named Update.pkg inside the selected Itemzflow folder, then rescan.");
        var unrelated = games.Where(path => !string.Equals(path, baseFolder, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(path, patchFolder, StringComparison.OrdinalIgnoreCase)
            && !Path.GetFileName(path).Contains("-dlc", StringComparison.OrdinalIgnoreCase)
            && !IsDlcDumpFolder(path)).ToList();
        if (unrelated.Count > 0)
            throw new InvalidDataException("Itemzflow contains another game or an unrecognized dump folder. Keep only the selected base game and its matching -patch folder together.");

        var includeUpdate = patchFolder is not null || hasUpdatePkg;
        EmitEvent(new { @event = "input-accepted", inputType = includeUpdate ? "base-game-and-update" : "base-game", inputPath = input, titleId = metadata.TitleId, title = metadata.Title });
        var project = LoadOrGenerateDumpProject(baseFolder, projectRoot, metadata, true, out var baseGp4Mode);
        EmitEvent(new { @event = "gp4-ready", mode = baseGp4Mode, titleId = metadata.TitleId });
        if (patchFolder is not null)
        {
            var patchMetadata = ReadDumpMetadata(patchFolder);
            if (!string.Equals(metadata.TitleId, patchMetadata.TitleId, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The update folder does not match the base game's title ID.");
            MergePatchProject(project, projectRoot, patchFolder, patchMetadata);
            EmitEvent(new { @event = "update-merged", titleId = metadata.TitleId });
        }
        else if (hasUpdatePkg)
        {
            extractedUpdate = Path.Combine(projectRoot, $".fpkg-builder-update-{Guid.NewGuid():N}");
            EnsureExpectedExternalMount(outputFolder);
            Directory.CreateDirectory(extractedUpdate);
            var patchMetadata = ExtractUpdatePackage(updatePkg, extractedUpdate, metadata.TitleId, project, projectRoot, outputFolder);
            MergePatchProject(project, projectRoot, extractedUpdate, patchMetadata);
            EmitEvent(new { @event = "update-merged", titleId = metadata.TitleId, source = "Update.pkg" });
        }
        var validation = Gp4Validator.ValidateProject(project, projectRoot);
        foreach (var issue in validation) Console.Error.WriteLine($"{issue.Type}: {issue.Message}");
        if (validation.Any(x => x.Type == ValidateResult.ResultType.Fatal))
            throw new InvalidDataException("The combined base-game/update project did not pass LibOrbisPkg validation.");

        return BuildProject(project, projectRoot, outputFolder, structuredProgress: true, metadata: metadata, jobTimer: timer);
    }
    catch (Exception ex) { return Fail(ex.Message); }
    finally
    {
        if (extractedUpdate is not null && Directory.Exists(extractedUpdate))
        {
            try { Directory.Delete(extractedUpdate, recursive: true); }
            catch (Exception cleanupError) { Console.Error.WriteLine($"Temporary update extraction could not be removed: {cleanupError.Message}"); }
        }
    }
}

static Gp4Project LoadOrGenerateDumpProject(string dumpFolder, string projectRoot, DumpMetadata metadata, bool isBaseGame, out string mode)
{
    var existing = FindExistingGp4(dumpFolder, metadata.TitleId, metadata.ContentId)
        ?? FindMatchingContainerGp4(projectRoot, metadata.TitleId, metadata.ContentId);
    if (existing is not null)
    {
        try
        {
            var resolved = LoadAndResolveProject(existing, dumpFolder);
            var projectMetadata = ReadProjectMetadata(resolved.Project, resolved.ProjectDirectory);
            if (!string.Equals(projectMetadata.TitleId, metadata.TitleId, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(projectMetadata.ContentId, metadata.ContentId, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The GP4 project metadata does not match the selected Itemzflow dump.");
            var usableType = isBaseGame
                ? resolved.Project.volume.Type == VolumeType.pkg_ps4_app
                : resolved.Project.volume.Type is VolumeType.pkg_ps4_patch or VolumeType.pkg_ps4_app;
            var validProject = true;
            if (isBaseGame)
            {
                var issues = Gp4Validator.ValidateProject(resolved.Project, resolved.ProjectDirectory);
                validProject = !issues.Any(x => x.Type == ValidateResult.ResultType.Fatal);
            }
            else
            {
                // Patch projects are inputs to a merged app, not standalone build targets.
                validProject = resolved.Project.files.Items.Count > 0;
            }
            if (validProject && usableType)
            {
                mode = "reused";
                return RebaseProjectFiles(resolved.Project, projectRoot, dumpFolder, resolved.ProjectDirectory);
            }
            Console.Error.WriteLine($"Existing GP4 was not suitable and remains untouched: {existing}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Existing GP4 could not be used and remains untouched ({existing}): {ex.Message}");
        }
    }
    mode = "generated";
    var (generated, _, _) = CreateGp4Project(dumpFolder);
    return RebaseProjectFiles(generated, projectRoot, dumpFolder, dumpFolder);
}

static Gp4Project RebaseProjectFiles(Gp4Project project, string projectRoot, string sourceFolder, string projectDirectory)
{
    foreach (var file in project.files.Items)
    {
        var target = NormalizeGp4RelativePath(file.TargetPath, "target path");
        var original = Path.GetFullPath(Path.Combine(projectDirectory, (file.OrigPath ?? target).Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        if (!IsWithin(sourceFolder, original) || !File.Exists(original))
            original = Path.GetFullPath(Path.Combine(sourceFolder, target.Replace('/', Path.DirectorySeparatorChar)));
        if (!IsWithin(sourceFolder, original) || !File.Exists(original))
            throw new FileNotFoundException($"A GP4 source file is missing: {target}");
        file.OrigPath = Path.GetRelativePath(projectRoot, original).Replace('\\', '/');
    }
    return project;
}

static void MergePatchProject(Gp4Project baseProject, string projectRoot, string patchFolder, DumpMetadata patchMetadata)
{
    var patch = LoadOrGenerateDumpProject(patchFolder, projectRoot, patchMetadata, false, out _);
    var filesByTarget = baseProject.files.Items.ToDictionary(x => NormalizeGp4RelativePath(x.TargetPath, "target path"), StringComparer.OrdinalIgnoreCase);
    foreach (var file in patch.files.Items)
    {
        var target = NormalizeGp4RelativePath(file.TargetPath, "update target path");
        // The base app's param.sfo identifies the resulting app package. The update's
        // SFO identifies a patch package and must not replace it in a merged app PKG.
        if (target.Equals("sce_sys/param.sfo", StringComparison.OrdinalIgnoreCase)) continue;
        var source = Path.GetFullPath(Path.Combine(projectRoot, (file.OrigPath ?? target).Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        if (!IsWithin(patchFolder, source) || !File.Exists(source))
            throw new FileNotFoundException($"An update GP4 source file is missing: {target}");
        var mergedFile = new Gp4File { TargetPath = target, OrigPath = Path.GetRelativePath(projectRoot, source).Replace('\\', '/') };
        if (filesByTarget.TryGetValue(target, out var replaced))
        {
            var index = baseProject.files.Items.IndexOf(replaced);
            baseProject.files.Items[index] = mergedFile;
            filesByTarget[target] = mergedFile;
        }
        else
        {
            baseProject.files.Items.Add(mergedFile);
            filesByTarget.Add(target, mergedFile);
        }
        AddTargetDirectories(baseProject, target);
    }
}

static DumpMetadata ExtractUpdatePackage(string pkgPath, string destination, string expectedTitleId, Gp4Project baseProject, string projectRoot, string outputFolder)
{
    using var mapped = MemoryMappedFile.CreateFromFile(pkgPath, FileMode.Open, null, 0, MemoryMappedFileAccess.Read);
    using var packageStream = mapped.CreateViewStream(0, 0, MemoryMappedFileAccess.Read);
    var pkg = new PkgReader(packageStream).ReadPkg();
    var contentIdMatch = Regex.Match(pkg.Header.content_id ?? string.Empty, "^[A-Z]{2}[0-9]{4}-([A-Z0-9]{9})_00-[A-Z0-9]{16}$");
    if (!contentIdMatch.Success || !string.Equals(contentIdMatch.Groups[1].Value, expectedTitleId, StringComparison.OrdinalIgnoreCase))
        throw new InvalidDataException("Update.pkg has a different or invalid TITLE_ID; it cannot be combined with this base game.");
    if (pkg.Header.content_type != ContentType.DP)
        throw new InvalidDataException("Update.pkg is not a PS4 patch package (DP content type). A base-game PKG cannot be used as an update.");
    packageStream.Position = 0;
    var validation = new PkgValidator(pkg).Validate(packageStream).ToList();
    var failures = validation.Where(x => x.Item2 == PkgValidator.ValidationResult.Fail).ToList();
    if (failures.Count > 0)
        throw new InvalidDataException("Update.pkg failed LibOrbisPkg validation and was not extracted: " + string.Join("; ", failures.Select(x => x.Item1.Name)));

    using var outerView = mapped.CreateViewAccessor((long)pkg.Header.pfs_image_offset, (long)pkg.Header.pfs_image_size, MemoryMappedFileAccess.Read);
    var outer = new PfsReader(outerView, pkg.Header.pfs_flags, pkg.GetEkpfs());
    var innerFile = outer.GetFile("pfs_image.dat") ?? throw new InvalidDataException("Update.pkg has no inner game PFS image.");
    using var compressedInner = innerFile.GetView();
    using var decompressedInner = new PFSCReader(compressedInner);
    EnsureUpdateExtractionSpace(decompressedInner.DataLength, baseProject, projectRoot, outputFolder);
    var inner = new PfsReader(decompressedInner);
    foreach (var file in inner.GetAllFiles())
    {
        var relative = file.FullName.TrimStart('/');
        if (relative.StartsWith("uroot/", StringComparison.OrdinalIgnoreCase)) relative = relative[6..];
        relative = NormalizeGp4RelativePath(relative, "Update.pkg path");
        var target = Path.GetFullPath(Path.Combine(destination, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!IsWithin(destination, target)) throw new InvalidDataException($"Update.pkg contains an unsafe path: {file.FullName}");
        EnsureExpectedExternalMount(outputFolder);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1024 * 1024, FileOptions.SequentialScan);
        using var source = file.GetView();
        var buffer = new byte[1024 * 1024];
        long offset = 0;
        while (offset < file.size)
        {
            var count = (int)Math.Min(buffer.Length, file.size - offset);
            source.Read(offset, buffer, 0, count);
            output.Write(buffer, 0, count);
            offset += count;
        }
    }
    var metadata = ReadDumpMetadata(destination);
    if (!string.Equals(metadata.TitleId, expectedTitleId, StringComparison.OrdinalIgnoreCase))
        throw new InvalidDataException("The extracted Update.pkg metadata does not match the base game TITLE_ID.");
    return metadata;
}

static void EnsureUpdateExtractionSpace(long expandedUpdateBytes, Gp4Project baseProject, string projectRoot, string outputFolder)
{
    if (expandedUpdateBytes <= 0)
        throw new InvalidDataException("Update.pkg contains an invalid compressed PFS size.");

    long baseBytes = 0;
    foreach (var file in baseProject.files.Items)
    {
        var source = Path.GetFullPath(Path.Combine(projectRoot, (file.OrigPath ?? file.TargetPath)
            .Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        if (!File.Exists(source)) throw new FileNotFoundException($"A base-game source file is missing: {file.TargetPath}");
        baseBytes = checked(baseBytes + new FileInfo(source).Length);
    }

    // Update.pkg extraction and the final combined package coexist on the external
    // drive while the build runs. Estimate the package as base + expanded update,
    // then reserve 10% (at least 256 MiB) for PFS/PKG metadata and filesystem slack.
    var packageEstimate = checked(baseBytes + expandedUpdateBytes);
    var safetyMargin = Math.Max(packageEstimate / 10, 256L * 1024 * 1024);
    var required = checked(expandedUpdateBytes + packageEstimate + safetyMargin);
    var output = Path.GetFullPath(outputFolder);
    var drive = DriveInfo.GetDrives()
        .Where(d => d.IsReady && output.StartsWith(Path.GetFullPath(d.Name), OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
        .OrderByDescending(d => d.Name.Length)
        .FirstOrDefault();
    if (drive is null)
        throw new IOException("Could not identify the external drive for Update.pkg extraction and package output.");
    if (drive.AvailableFreeSpace < required)
        throw new IOException($"Not enough free space on the external drive for Update.pkg extraction and the combined package. About {FormatBytes(required)} is needed; {FormatBytes(drive.AvailableFreeSpace)} is available.");
}

static void AddTargetDirectories(Gp4Project project, string target)
{
    var parent = Path.GetDirectoryName(target)?.Replace('\\', '/');
    if (string.IsNullOrEmpty(parent)) return;
    Dir? directory = null;
    foreach (var segment in parent.Split('/')) directory = project.AddDir(directory, segment);
}

static DumpMetadata ReadProjectMetadata(Gp4Project project, string projectDirectory)
{
    var contentId = project.volume.Package.ContentId;
    if (string.IsNullOrWhiteSpace(contentId)) throw new InvalidDataException("GP4 has no CONTENT_ID.");
    var match = Regex.Match(contentId, "^[A-Z]{2}[0-9]{4}-([A-Z0-9]{9})_00-[A-Z0-9]{16}$");
    if (!match.Success) throw new InvalidDataException("GP4 has an invalid CONTENT_ID.");
    var titleId = match.Groups[1].Value;
    var sfoEntry = project.files.Items.FirstOrDefault(f =>
        string.Equals(f.TargetPath?.Replace('\\', '/'), "sce_sys/param.sfo", StringComparison.OrdinalIgnoreCase));
    if (sfoEntry is not null)
    {
        var sfoPath = Path.GetFullPath(Path.Combine(projectDirectory, (sfoEntry.OrigPath ?? sfoEntry.TargetPath).Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        if (File.Exists(sfoPath))
        {
            using var stream = File.OpenRead(sfoPath);
            var sfo = ParamSfo.FromStream(stream);
            var fileTitleId = sfo["TITLE_ID"]?.ToString();
            var fileContentId = sfo["CONTENT_ID"]?.ToString();
            if (!string.Equals(fileTitleId, titleId, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(fileContentId, contentId, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("GP4 CONTENT_ID does not match its sce_sys/param.sfo metadata.");
            return new DumpMetadata(titleId, contentId, sfo["TITLE"]?.ToString() ?? titleId);
        }
    }
    return new DumpMetadata(titleId, contentId, titleId);
}

static int DiscoverDumps(string? explicitSettingsPath)
{
    var settingsFiles = new HashSet<string>(StringComparer.Ordinal);
    if (!string.IsNullOrWhiteSpace(explicitSettingsPath) && File.Exists(explicitSettingsPath))
        settingsFiles.Add(Path.GetFullPath(explicitSettingsPath));
    foreach (var candidate in StandardItemzflowSettingsPaths())
        if (File.Exists(candidate)) settingsFiles.Add(Path.GetFullPath(candidate));

    var roots = new HashSet<string>(StringComparer.Ordinal);
    foreach (var settingsFile in settingsFiles)
    {
        try
        {
            var configured = ReadDumperPath(settingsFile);
            if (!string.IsNullOrWhiteSpace(configured) && Directory.Exists(configured)) roots.Add(Path.GetFullPath(configured));
        }
        catch (Exception ex) { Console.Error.WriteLine($"Could not read {settingsFile}: {ex.Message}"); }
    }
    foreach (var mountRoot in AccessibleMountRoots()) roots.Add(Path.GetFullPath(mountRoot));

    var found = new HashSet<string>(StringComparer.Ordinal);
    foreach (var root in roots)
    {
        try
        {
            foreach (var folder in FindDumpFolders(root)) found.Add(Path.GetFullPath(folder));
        }
        catch (Exception ex) { Console.Error.WriteLine($"Could not scan {root}: {ex.Message}"); }
    }

    foreach (var folder in found.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
    {
        try
        {
            var metadata = ReadDumpMetadata(folder);
            var gp4 = FindExistingGp4(folder, metadata.TitleId, metadata.ContentId);
            EmitEvent(new { @event = "dump-candidate", path = folder, title = metadata.Title, titleId = metadata.TitleId, contentId = metadata.ContentId, hasGp4 = gp4 is not null });
        }
        catch (Exception ex) { Console.Error.WriteLine($"Skipping candidate {folder}: {ex.Message}"); }
    }
    EmitEvent(new { @event = "discovery-complete", count = found.Count });
    return 0;
}

static IEnumerable<string> StandardItemzflowSettingsPaths()
{
    yield return "/user/app/ITEM00001/settings.ini";
    for (var i = 0; i < 16; i++) yield return $"/mnt/usb{i}/settings.ini";
    foreach (var root in AccessibleMountRoots()) yield return Path.Combine(root, "settings.ini");
}

static IEnumerable<string> AccessibleMountRoots()
{
    var roots = new HashSet<string>(StringComparer.Ordinal);
    foreach (var basePath in new[] { "/media", "/run/media", "/mnt" })
    {
        if (!Directory.Exists(basePath)) continue;
        try
        {
            var userPath = Path.Combine(basePath, Environment.UserName);
            var scanPath = Directory.Exists(userPath) ? userPath : basePath;
            foreach (var directory in Directory.EnumerateDirectories(scanPath, "*", SearchOption.TopDirectoryOnly))
                if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) == 0) roots.Add(directory);
        }
        catch { }
    }
    return roots;
}

static string? ReadDumperPath(string settingsPath)
{
    var inSettings = false;
    foreach (var rawLine in File.ReadLines(settingsPath))
    {
        var line = rawLine.Trim();
        if (line.Length == 0 || line.StartsWith(';') || line.StartsWith('#')) continue;
        if (line.StartsWith('[') && line.EndsWith(']'))
        {
            inSettings = string.Equals(line[1..^1], "Settings", StringComparison.OrdinalIgnoreCase);
            continue;
        }
        if (!inSettings) continue;
        var separator = line.IndexOf('=');
        if (separator > 0 && string.Equals(line[..separator].Trim(), "Dumper_Path", StringComparison.OrdinalIgnoreCase))
            return line[(separator + 1)..].Trim().Trim('"');
    }
    return null;
}

static void EmitEvent(object value) => Console.WriteLine(JsonSerializer.Serialize(value));

static bool IncludeInGeneratedGp4(string relativePath)
{
    var path = relativePath.Replace('\\', '/');
    if (path.Contains(".fself", StringComparison.OrdinalIgnoreCase)) return false;

    var excluded = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "sce_sys/about", "sce_sys/about/", "sce_sys/.digests", "sce_sys/.entry_keys",
        "sce_sys/.image_key", "sce_sys/.unknown_0x21", "sce_sys/.general_digests",
        "sce_sys/.unknown_0xC0", "sce_sys/.metas", "sce_sys/.entry_names",
        "sce_sys/license.dat", "sce_sys/license.info", "sce_sys/selfinfo.dat",
        "sce_sys/imageinfo.dat", "sce_sys/target-deltainfo.dat", "sce_sys/origin-deltainfo.dat",
        "sce_sys/psreserved.dat", "sce_sys/playgo-chunk.dat", "sce_sys/playgo-chunk.sha",
        "sce_sys/playgo-manifest.xml", "sce_sys/pubtoolinfo.dat", "sce_sys/app/playgo-chunk.dat",
        "sce_sys/app/playgo-chunk.sha", "sce_sys/app/playgo-manifest.xml", "sce_sys/icon0.dds",
        "sce_sys/pic0.dds", "sce_sys/pic1.dds", "sce_discmap.plt", "sce_discmap_patch.plt"
    };
    if (excluded.Contains(path) || path.StartsWith("sce_sys/about/", StringComparison.OrdinalIgnoreCase)) return false;
    if (path.EndsWith(".encrypted", StringComparison.OrdinalIgnoreCase) && excluded.Contains(path[..^10])) return false;

    for (var i = 0; i < 31; i++)
    {
        if (path.Equals($"sce_sys/icon0_{i:00}.dds", StringComparison.OrdinalIgnoreCase) ||
            path.Equals($"sce_sys/pic1_{i:00}.dds", StringComparison.OrdinalIgnoreCase)) return false;
    }
    return true;
}

static int Inspect(string path)
{
    var selected = Path.GetFullPath(path);
    if (!Directory.Exists(selected)) return Fail($"Selected folder does not exist: {selected}");
    var candidates = FindDumpFolders(selected).ToList();
    if (candidates.Count == 0)
    {
        Console.WriteLine("No Itemzflow-style dump found. Select the folder that contains sce_sys/param.sfo.");
        return 0;
    }

    foreach (var folder in candidates)
    {
        DumpMetadata sfo;
        try { sfo = ReadDumpMetadata(folder); }
        catch (Exception ex)
        {
            Console.WriteLine($"Dump candidate {folder} has invalid metadata: {ex.Message}");
            continue;
        }
        Console.WriteLine($"Dump: {folder}");
        Console.WriteLine($"  Title: {sfo.Title}");
        Console.WriteLine($"  Title ID: {sfo.TitleId}");
        Console.WriteLine($"  Content ID: {sfo.ContentId}");
        string? gp4;
        try { gp4 = FindExistingGp4(folder, sfo.TitleId, sfo.ContentId); }
        catch (Exception ex)
        {
            Console.WriteLine($"  GP4 selection error: {ex.Message}");
            continue;
        }
        if (gp4 is null)
        {
            Console.WriteLine("  GP4: not found (generation is available)");
            continue;
        }

        Console.WriteLine($"  GP4: {gp4}");
        try
        {
            var project = LoadAndResolveProject(gp4, folder);
            var validation = Gp4Validator.ValidateProject(project.Project, project.ProjectDirectory);
            foreach (var issue in validation) Console.WriteLine($"  {issue.Type}: {issue.Message}");
            Console.WriteLine(validation.Any(x => x.Type == ValidateResult.ResultType.Fatal)
                ? "  GP4 status: invalid"
                : "  GP4 status: valid");
        }
        catch (Exception ex) { Console.WriteLine($"  GP4 status: invalid ({ex.Message})"); }
    }
    return 0;
}

static int GenerateWhenMissing(string dumpFolder)
{
    var root = Path.GetFullPath(dumpFolder);
    if (!Directory.Exists(root)) return Fail($"Dump folder does not exist: {root}");
    DumpMetadata metadata;
    string? existing;
    try
    {
        metadata = ReadDumpMetadata(root);
        existing = FindExistingGp4(root, metadata.TitleId, metadata.ContentId);
    }
    catch (Exception ex) { return Fail(ex.Message); }
    if (existing is not null)
    {
        try
        {
            var loaded = LoadAndResolveProject(existing, root);
            var issues = Gp4Validator.ValidateProject(loaded.Project, loaded.ProjectDirectory);
            if (!issues.Any(x => x.Type == ValidateResult.ResultType.Fatal))
            {
                Console.WriteLine($"Keeping valid existing Itemzflow GP4: {existing}");
                return 0;
            }
            foreach (var issue in issues) Console.WriteLine($"{issue.Type}: {issue.Message}");
            return Fail($"Existing GP4 is invalid and was left untouched: {existing}");
        }
        catch (Exception ex)
        {
            return Fail($"Existing GP4 could not be loaded and was left untouched: {ex.Message}");
        }
    }

    var generatedPath = Path.Combine(root, metadata.TitleId + ".gp4");
    if (File.Exists(generatedPath)) return Fail($"Refusing to overwrite existing project: {generatedPath}");
    return GenerateGp4(root, generatedPath);
}

static int BuildDump(string dumpFolder, string outputFolder)
{
    var root = Path.GetFullPath(dumpFolder);
    if (!Directory.Exists(root)) return Fail($"Dump folder does not exist: {root}");
    string? gp4;
    try
    {
        var metadata = ReadDumpMetadata(root);
        gp4 = FindExistingGp4(root, metadata.TitleId, metadata.ContentId);
    }
    catch (Exception ex) { return Fail(ex.Message); }
    if (gp4 is null)
        return Fail($"No GP4 was found in {root}. Choose Generate GP4 first; the dump will remain unchanged.");

    try
    {
        var resolved = LoadAndResolveProject(gp4, root);
        Console.Error.WriteLine($"Using existing GP4 without rewriting it: {gp4}");
        return BuildProject(resolved.Project, resolved.ProjectDirectory, outputFolder, structuredProgress: true);
    }
    catch (Exception ex)
    {
        return Fail($"Existing GP4 could not be used: {ex.Message}");
    }
}

static IEnumerable<string> FindDumpFolders(string selectedRoot)
{
    if (HasSfo(selectedRoot)) yield return selectedRoot;
    foreach (var child in Directory.EnumerateDirectories(selectedRoot, "*", SearchOption.TopDirectoryOnly))
    {
        if ((File.GetAttributes(child) & FileAttributes.ReparsePoint) == 0 && HasSfo(child)) yield return child;
    }
}

static bool HasSfo(string folder) => File.Exists(Path.Combine(folder, "sce_sys", "param.sfo"));

static bool IsDlcDumpFolder(string folder)
{
    try
    {
        using var stream = File.OpenRead(Path.Combine(folder, "sce_sys", "param.sfo"));
        return string.Equals(ParamSfo.FromStream(stream)["CATEGORY"]?.ToString(), "ac", StringComparison.OrdinalIgnoreCase);
    }
    catch { return false; }
}

static DumpMetadata ReadDumpMetadata(string folder)
{
    var sfoPath = Path.Combine(folder, "sce_sys", "param.sfo");
    if (!File.Exists(sfoPath)) throw new InvalidDataException($"Required file sce_sys/param.sfo was not found in {folder}");
    using var stream = File.OpenRead(sfoPath);
    var sfo = ParamSfo.FromStream(stream);
    var titleId = sfo["TITLE_ID"]?.ToString();
    var contentId = sfo["CONTENT_ID"]?.ToString();
    if (string.IsNullOrWhiteSpace(titleId) || !Regex.IsMatch(titleId, "^[A-Z0-9]{9}$"))
        throw new InvalidDataException("param.sfo does not contain a valid 9-character TITLE_ID.");
    if (string.IsNullOrWhiteSpace(contentId) || !Regex.IsMatch(contentId, "^[A-Z]{2}[0-9]{4}-[A-Z0-9]{9}_00-[A-Z0-9]{16}$"))
        throw new InvalidDataException("param.sfo does not contain a valid CONTENT_ID.");
    return new DumpMetadata(titleId, contentId, sfo["TITLE"]?.ToString() ?? "(title unavailable)");
}

static string? FindExistingGp4(string folder, string titleId, string contentId)
{
    var projects = Directory.EnumerateFiles(folder, "*.gp4", SearchOption.TopDirectoryOnly)
        .OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToList();
    var preferred = projects.FirstOrDefault(p =>
        Path.GetFileNameWithoutExtension(p).Equals(titleId, StringComparison.OrdinalIgnoreCase) ||
        Path.GetFileNameWithoutExtension(p).Equals(contentId, StringComparison.OrdinalIgnoreCase));
    if (preferred is not null) return preferred;
    if (projects.Count == 1) return projects[0];
    if (projects.Count > 1) throw new InvalidDataException("Multiple GP4 projects were found; select the intended project explicitly.");
    return null;
}

static string? FindMatchingContainerGp4(string container, string titleId, string contentId)
{
    var matches = Directory.EnumerateFiles(container, "*.gp4", SearchOption.TopDirectoryOnly)
        .Where(path => Path.GetFileNameWithoutExtension(path).Equals(titleId, StringComparison.OrdinalIgnoreCase) ||
                       Path.GetFileNameWithoutExtension(path).Equals(contentId, StringComparison.OrdinalIgnoreCase))
        .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
        .ToList();

    if (matches.Count > 1)
        throw new InvalidDataException("Multiple GP4 projects matching this game were found in the selected Itemzflow folder.");
    return matches.SingleOrDefault();
}

static (Gp4Project Project, string ProjectDirectory) LoadAndResolveProject(string gp4Path, string dumpRoot)
{
    var projectPath = Path.GetFullPath(gp4Path);
    var projectDirectory = Path.GetDirectoryName(projectPath)!;
    Gp4Project project;
    using (var stream = File.OpenRead(projectPath)) project = Gp4Project.ReadFrom(stream);
    var root = Path.GetFullPath(dumpRoot);

    foreach (var file in project.files.Items)
    {
        var target = NormalizeGp4RelativePath(file.TargetPath, "target path");
        var original = file.OrigPath ?? target;
        string? resolved = null;

        if (!LooksAbsolute(original))
        {
            var byOriginal = Path.GetFullPath(Path.Combine(projectDirectory, original.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
            if (IsWithin(root, byOriginal) && File.Exists(byOriginal)) resolved = byOriginal;
        }

        if (resolved is null)
        {
            var byTarget = Path.GetFullPath(Path.Combine(root, target.Replace('/', Path.DirectorySeparatorChar)));
            if (IsWithin(root, byTarget) && File.Exists(byTarget)) resolved = byTarget;
        }

        if (resolved is null)
            throw new FileNotFoundException($"Could not resolve GP4 entry '{target}' to a file in the selected dump.");

        // Rebase only the in-memory object. The user's GP4 file is never rewritten.
        file.OrigPath = Path.GetRelativePath(projectDirectory, resolved);
    }

    return (project, projectDirectory);
}

static bool LooksAbsolute(string path) =>
    Path.IsPathRooted(path) || Regex.IsMatch(path, "^[A-Za-z]:[\\\\/]") || path.StartsWith("\\\\", StringComparison.Ordinal);

static string NormalizeGp4RelativePath(string path, string field)
{
    if (string.IsNullOrWhiteSpace(path) || LooksAbsolute(path)) throw new InvalidDataException($"GP4 {field} must be relative.");
    var normalized = path.Replace('\\', '/');
    if (normalized.Split('/').Any(segment => segment == ".." || segment == ".") || normalized.StartsWith('/'))
        throw new InvalidDataException($"GP4 {field} contains a rooted or traversal path: {path}");
    return normalized;
}

static bool IsWithin(string root, string path)
{
    var relative = Path.GetRelativePath(root, path);
    return relative != ".." && !relative.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal) && !Path.IsPathRooted(relative);
}

static void EnsureExpectedExternalMount(string outputPath)
{
    var expectedDevice = Environment.GetEnvironmentVariable("FPKG_BUILDER_EXPECTED_MOUNT_DEVICE");
    if (string.IsNullOrWhiteSpace(expectedDevice)) return;

    var fullOutput = Path.GetFullPath(outputPath);
    string? actualDevice = null;
    var bestMountDepth = -1;
    foreach (var line in File.ReadLines("/proc/self/mountinfo"))
    {
        var separator = line.IndexOf(" - ", StringComparison.Ordinal);
        if (separator < 0) continue;
        var fields = line[..separator].Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (fields.Length < 5) continue;
        var mountPoint = fields[4]
            .Replace("\\040", " ", StringComparison.Ordinal)
            .Replace("\\011", "\t", StringComparison.Ordinal)
            .Replace("\\012", "\n", StringComparison.Ordinal)
            .Replace("\\134", "\\", StringComparison.Ordinal);
        var fullMount = Path.GetFullPath(mountPoint);
        if (!IsWithin(fullMount, fullOutput)) continue;
        var depth = fullMount.Count(character => character == Path.DirectorySeparatorChar);
        if (depth <= bestMountDepth) continue;
        actualDevice = fields[2];
        bestMountDepth = depth;
    }

    if (!string.Equals(actualDevice, expectedDevice, StringComparison.Ordinal))
        throw new IOException("The external drive became unavailable or the FPKG folder moved to a different filesystem. The package build was stopped before opening its output file.");
}

static int BuildProject(Gp4Project project, string projectDirectory, string outputFolder, bool structuredProgress = false, DumpMetadata? metadata = null, Stopwatch? jobTimer = null)
{
    jobTimer ??= Stopwatch.StartNew();
    var progressSamples = new Dictionary<string, Queue<(long Ticks, long Bytes)>>(StringComparer.Ordinal);
    void Log(string message)
    {
        if (structuredProgress) Console.Error.WriteLine(message);
        else Console.WriteLine(message);
    }
    void Emit(object message)
    {
        if (structuredProgress) Console.WriteLine(JsonSerializer.Serialize(message));
    }
    void EmitMeasuredProgress(PkgBuildProgress progress)
    {
        double? bytesPerSecond = null;
        double? stageEtaSeconds = null;
        if (progress.BytesTotal is long total && total > 0)
        {
            var key = progress.Scope + ":" + progress.Stage;
            var now = Stopwatch.GetTimestamp();
            if (!progressSamples.TryGetValue(key, out var samples))
                progressSamples[key] = samples = new Queue<(long Ticks, long Bytes)>();
            if (samples.Count > 0 && progress.BytesProcessed < samples.Last().Bytes)
                samples.Clear();
            samples.Enqueue((now, progress.BytesProcessed));
            while (samples.Count > 2 && now - samples.Peek().Ticks > Stopwatch.Frequency * 5)
                samples.Dequeue();
            if (samples.Count >= 2)
            {
                var first = samples.Peek();
                var last = samples.Last();
                var elapsed = (last.Ticks - first.Ticks) / (double)Stopwatch.Frequency;
                if (elapsed >= 1 && last.Bytes > first.Bytes)
                {
                    bytesPerSecond = (last.Bytes - first.Bytes) / elapsed;
                    if (progress.BytesProcessed < total)
                        stageEtaSeconds = (total - progress.BytesProcessed) / bytesPerSecond.Value;
                }
            }
        }
        Emit(new
        {
            @event = "build-progress",
            stage = progress.Stage,
            scope = progress.Scope,
            bytesProcessed = progress.BytesProcessed,
            bytesTotal = progress.BytesTotal,
            currentFile = progress.CurrentFile,
            bytesPerSecond,
            stageEtaSeconds
        });
    }

    var issues = Gp4Validator.ValidateProject(project, projectDirectory);
    foreach (var issue in issues) Log($"{issue.Type}: {issue.Message}");
    if (issues.Any(x => x.Type == ValidateResult.ResultType.Fatal)) return Fail("GP4 validation failed; no package was built.");

    var output = Path.GetFullPath(outputFolder);
    try { EnsureOutputSpaceAndPreserveSource(project, projectDirectory, output); }
    catch (Exception ex) { return Fail(ex.Message); }
    var packagePath = Path.Combine(output, project.volume.Package.ContentId + ".pkg");
    if (File.Exists(packagePath)) return Fail($"Refusing to overwrite existing output: {packagePath}");
    var partialPath = Path.Combine(output, $".{project.volume.Package.ContentId}.{Guid.NewGuid():N}.partial");
    try
    {
        new PkgBuilder(PkgProperties.FromGp4(project, projectDirectory)).Write(
            partialPath,
            Log,
            EmitMeasuredProgress,
            () => EnsureExpectedExternalMount(output));

        Emit(new { @event = "validation-started", packagePath });
        using var package = File.OpenRead(partialPath);
        var parsed = new PkgReader(package).ReadPkg();
        var results = new PkgValidator(parsed).Validate(package).ToList();
        package.Dispose();
        foreach (var (validation, result) in results)
            Log($"{result}: {validation.Type} {validation.Name}");
        if (results.Any(x => x.Item2 == PkgValidator.ValidationResult.Fail))
        {
            Emit(new { @event = "validation-failed", packagePath });
            File.Delete(partialPath);
            return Fail("Package validation reported a failure; the incomplete output was removed.");
        }
        EnsureExpectedExternalMount(output);
        File.Move(partialPath, packagePath);
        Emit(new
        {
            @event = "completed",
            packagePath,
            packageBytes = new FileInfo(packagePath).Length,
            validation = "passed",
            title = metadata?.Title ?? metadata?.TitleId ?? project.volume.Package.ContentId,
            titleId = metadata?.TitleId,
            contentId = metadata?.ContentId ?? project.volume.Package.ContentId,
            outputFolder = output,
            buildDurationSeconds = jobTimer.Elapsed.TotalSeconds
        });
        Log($"Validated PKG output: {packagePath} ({new FileInfo(packagePath).Length} bytes)");
        return 0;
    }
    catch (Exception buildError)
    {
        if (File.Exists(partialPath))
        {
            try { File.Delete(partialPath); }
            catch (Exception cleanupError)
            {
                throw new IOException($"Package build failed ({buildError.Message}) and the partial file could not be removed ({cleanupError.Message}): {partialPath}", buildError);
            }
        }
        throw;
    }
}

static void EnsureOutputSpaceAndPreserveSource(Gp4Project project, string projectDirectory, string outputFolder)
{
    var sourceRoot = Path.GetFullPath(projectDirectory);
    var output = Path.GetFullPath(outputFolder);
    foreach (var file in project.files.Items)
    {
        var source = Path.GetFullPath(Path.Combine(sourceRoot, (file.OrigPath ?? file.TargetPath).Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        var sourceDirectory = Path.GetDirectoryName(source)!;
        if (IsWithin(sourceDirectory, output) || IsWithin(output, source))
            throw new InvalidOperationException("The package output folder overlaps a source folder. The original dump must remain separate from FPKG output.");
    }
    Directory.CreateDirectory(output);

    long sourceBytes = 0;
    foreach (var file in project.files.Items)
    {
        var source = Path.GetFullPath(Path.Combine(projectDirectory, (file.OrigPath ?? file.TargetPath).Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
        sourceBytes = checked(sourceBytes + new FileInfo(source).Length);
    }
    var estimatedRequired = checked(sourceBytes + Math.Max(sourceBytes / 10, 128L * 1024 * 1024));
    var fullOutput = Path.GetFullPath(outputFolder);
    var drive = DriveInfo.GetDrives()
        .Where(d => d.IsReady && fullOutput.StartsWith(Path.GetFullPath(d.Name), OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
        .OrderByDescending(d => d.Name.Length)
        .FirstOrDefault();
    if (drive is null) throw new IOException("Could not determine available free space for the selected output folder.");
    if (drive.AvailableFreeSpace < estimatedRequired)
        throw new IOException($"Not enough free space in the output destination. About {FormatBytes(estimatedRequired)} is recommended; {FormatBytes(drive.AvailableFreeSpace)} is available.");
    EmitSpaceCheck(output, sourceBytes, estimatedRequired, drive.AvailableFreeSpace);
}

static void EmitSpaceCheck(string outputFolder, long sourceBytes, long estimatedRequired, long availableBytes)
{
    EmitEvent(new { @event = "space-check", outputFolder, sourceBytes, estimatedRequiredBytes = estimatedRequired, availableBytes, passed = true });
}

static string FormatBytes(long bytes)
{
    string[] units = ["B", "KB", "MB", "GB", "TB"];
    double value = bytes;
    var unit = 0;
    while (value >= 1024 && unit < units.Length - 1) { value /= 1024; unit++; }
    return $"{value:0.##} {units[unit]}";
}

static int Build(string gp4Path, string outputFolder)
{
    var projectPath = Path.GetFullPath(gp4Path);
    if (!File.Exists(projectPath)) return Fail($"GP4 project does not exist: {projectPath}");
    try
    {
        var resolved = LoadAndResolveProject(projectPath, Path.GetDirectoryName(projectPath)!);
        return BuildProject(resolved.Project, resolved.ProjectDirectory, outputFolder);
    }
    catch (Exception ex)
    {
        return Fail($"GP4 could not be used: {ex.Message}");
    }
}

static int Fail(string message)
{
    Console.Error.WriteLine("ERROR: " + message);
    return 1;
}

record DumpMetadata(string TitleId, string ContentId, string Title);
