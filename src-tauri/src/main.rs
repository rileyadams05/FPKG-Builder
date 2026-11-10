#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::Value;
#[cfg(target_os = "linux")]
use std::os::unix::ffi::OsStrExt;
use std::{
    ffi::CString,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
};
use tauri::{Emitter, Manager, State};

struct BuildState(Arc<AtomicBool>);

#[derive(Clone, Serialize)]
struct BuildError {
    message: String,
    details: String,
}

fn helper_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "windows") {
        "Vortex.Engine.Poc.exe"
    } else {
        "vortex-engine"
    };
    app.path()
        .resolve(
            format!("resources/engine/{name}"),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Could not locate the bundled packaging engine: {e}"))
}

#[tauri::command]
fn inspect_itemzflow(app: tauri::AppHandle, input_path: String) -> Result<Value, String> {
    let helper = helper_path(&app)?;
    let output = Command::new(helper)
        .arg("inspect-itemzflow")
        .arg(input_path.trim())
        .output()
        .map_err(|e| format!("Could not inspect the Itemzflow folder: {e}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(detail
            .lines()
            .last()
            .unwrap_or("The Itemzflow folder could not be inspected.")
            .to_owned());
    }
    let text = String::from_utf8(output.stdout)
        .map_err(|e| format!("The engine returned invalid inspection data: {e}"))?;
    serde_json::from_str(text.trim())
        .map_err(|e| format!("Could not read Itemzflow inspection results: {e}"))
}

#[tauri::command]
fn start_build(
    app: tauri::AppHandle,
    state: State<'_, BuildState>,
    input_path: String,
    update_choice: String,
) -> Result<(), String> {
    let input = input_path.trim().to_owned();
    if input.is_empty() {
        return Err("Drop the complete Itemzflow folder first.".into());
    }
    let helper = match helper_path(&app) {
        Ok(path) => path,
        Err(error) => return Err(error),
    };
    let input_path = Path::new(&input)
        .canonicalize()
        .map_err(|e| format!("Cannot access selected Itemzflow folder: {e}"))?;
    if !input_path.is_dir()
        || input_path
            .file_name()
            .and_then(|n| n.to_str())
            .map_or(true, |n| !n.eq_ignore_ascii_case("Itemzflow"))
    {
        return Err("Drop the complete folder named Itemzflow.".into());
    }
    let input = input_path.to_string_lossy().into_owned();
    let (output, expected_device) = validate_external_workspace(&input_path)?;
    if state
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A package build is already running.".into());
    }
    let busy = Arc::clone(&state.0);
    thread::spawn(move || {
        let outcome = run_build(
            &app,
            &helper,
            &input,
            &output,
            &expected_device,
            &update_choice,
        );
        if let Err((message, details)) = outcome {
            let _ = app.emit("builder-error", BuildError { message, details });
        }
        busy.store(false, Ordering::Release);
    });
    Ok(())
}

fn run_build(
    app: &tauri::AppHandle,
    helper: &Path,
    input: &str,
    output: &Path,
    expected_device: &str,
    update_choice: &str,
) -> Result<(), (String, String)> {
    let mut child = Command::new(helper)
        .arg("process")
        .arg(input)
        .arg(output)
        .arg(update_choice)
        .env("FPKG_BUILDER_EXPECTED_MOUNT_DEVICE", expected_device)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            (
                "Could not start the packaging engine.".into(),
                e.to_string(),
            )
        })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        (
            "Could not receive build progress.".into(),
            "Helper stdout was unavailable.".into(),
        )
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        (
            "Could not receive diagnostics.".into(),
            "Helper stderr was unavailable.".into(),
        )
    })?;
    let error_thread = thread::spawn(move || {
        let mut text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut text);
        text
    });
    let mut completion = None;
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) => {
                if let Ok(value) = serde_json::from_str::<Value>(&line) {
                    if value.get("event").and_then(Value::as_str) == Some("completed") {
                        completion = Some(value);
                    } else {
                        let _ = app.emit("builder-event", value);
                    }
                } else if !line.trim().is_empty() {
                    let _ = app.emit(
                        "builder-event",
                        serde_json::json!({"event":"engine-message","message":line}),
                    );
                }
            }
            Err(error) => {
                return Err((
                    "The packaging engine stopped sending progress.".into(),
                    error.to_string(),
                ))
            }
        }
    }
    let status = child.wait().map_err(|e| {
        (
            "Could not finish the packaging engine process.".into(),
            e.to_string(),
        )
    })?;
    let details = error_thread
        .join()
        .unwrap_or_else(|_| "Could not read engine diagnostics.".into());
    let validated_completion = completion
        .as_ref()
        .is_some_and(|value| value.get("validation").and_then(Value::as_str) == Some("passed"));
    if !status.success() || !validated_completion {
        let message = if details.trim().is_empty() {
            if completion.is_some() {
                format!("Packaging engine exited with {status}.")
            } else {
                "The package was not confirmed as complete and validated.".into()
            }
        } else {
            details
                .lines()
                .last()
                .unwrap_or("Package build failed.")
                .to_owned()
        };
        return Err((message, details));
    }
    if let Some(mut completion) = completion {
        let package = completion
            .get("packagePath")
            .and_then(Value::as_str)
            .map(PathBuf::from)
            .ok_or_else(|| {
                (
                    "The engine did not report the validated package path.".into(),
                    completion.to_string(),
                )
            })?;
        let package = package.canonicalize().map_err(|e| {
            (
                "The validated package is no longer accessible.".into(),
                e.to_string(),
            )
        })?;
        let output = output.canonicalize().map_err(|e| {
            (
                "The external FPKG folder is no longer accessible.".into(),
                e.to_string(),
            )
        })?;
        if package.parent() != Some(output.as_path())
            || package
                .extension()
                .and_then(|x| x.to_str())
                .map_or(true, |x| !x.eq_ignore_ascii_case("pkg"))
        {
            return Err((
                "The engine reported a package outside the external FPKG folder.".into(),
                package.display().to_string(),
            ));
        }
        let bytes = std::fs::metadata(&package)
            .map_err(|e| {
                (
                    "The validated package could not be inspected.".into(),
                    e.to_string(),
                )
            })?
            .len();
        completion["packagePath"] = Value::String(package.to_string_lossy().into_owned());
        completion["packageBytes"] = Value::from(bytes);
        let _ = app.emit("builder-event", completion);
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct MountInfo {
    device: String,
    mount_point: PathBuf,
    file_system: String,
    source: String,
}

fn unescape_mount_field(value: &str) -> String {
    let mut result = String::new();
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            let mut code = String::new();
            for _ in 0..3 {
                if let Some(next) = chars.next() {
                    code.push(next);
                }
            }
            match code.as_str() {
                "040" => result.push(' '),
                "011" => result.push('\t'),
                "012" => result.push('\n'),
                "134" => result.push('\\'),
                _ => {
                    result.push('\\');
                    result.push_str(&code);
                }
            }
        } else {
            result.push(ch);
        }
    }
    result
}

fn parse_mountinfo(text: &str) -> Vec<MountInfo> {
    text.lines()
        .filter_map(|line| {
            let (left, right) = line.split_once(" - ")?;
            let left: Vec<_> = left.split_whitespace().collect();
            let right: Vec<_> = right.split_whitespace().collect();
            if left.len() < 5 || right.len() < 2 {
                return None;
            }
            Some(MountInfo {
                device: left[2].to_owned(),
                mount_point: PathBuf::from(unescape_mount_field(left[4])),
                file_system: right[0].to_owned(),
                source: unescape_mount_field(right[1]),
            })
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn physical_block_device(device: &str, source: &str) -> Option<PathBuf> {
    let source_name = source
        .split('[')
        .next()
        .and_then(|path| Path::new(path).file_name())
        .and_then(|name| name.to_str());
    let sysfs_path = source_name
        .filter(|_| source.starts_with("/dev/"))
        .map(|name| format!("/sys/class/block/{name}"))
        .unwrap_or_else(|| format!("/sys/dev/block/{device}"));
    let mut path = std::fs::canonicalize(sysfs_path).ok()?;
    loop {
        if path.join("partition").exists() {
            path = path.parent()?.to_path_buf();
            continue;
        }
        if path.join("dev").is_file() {
            return Some(path);
        }
        path = path.parent()?.to_path_buf();
    }
}

fn validate_external_mount(
    root: &MountInfo,
    selected: &MountInfo,
    root_physical_device: Option<&Path>,
    selected_physical_device: Option<&Path>,
) -> Result<(), String> {
    if selected.mount_point == Path::new("/") || selected.device == root.device {
        return Err("Select the Itemzflow folder from a separately mounted external SSD or HDD. Builds are blocked on the internal Linux filesystem.".into());
    }
    if root_physical_device.is_none() || selected_physical_device.is_none() {
        return Err("FPKG Builder could not confirm that the selected mount is a separate physical drive. Reconnect the external drive and try again.".into());
    }
    if root_physical_device == selected_physical_device {
        return Err("The selected folder is on the same physical drive as the Linux installation. Select an external SSD or HDD.".into());
    }
    let fs = selected.file_system.to_ascii_lowercase();
    let large_file_systems = [
        "ext4", "ext3", "ext2", "exfat", "ntfs", "ntfs3", "fuseblk", "btrfs", "xfs", "f2fs",
    ];
    if !large_file_systems.contains(&fs.as_str()) || matches!(fs.as_str(), "vfat" | "msdos") {
        return Err(format!("The external drive uses '{fs}', which FPKG Builder cannot confirm supports PS4 package files larger than 4 GB. Use ext4, exFAT, NTFS, Btrfs or XFS."));
    }
    if !selected.source.starts_with("/dev/") {
        return Err(format!(
            "The selected mount '{}' is not identified as an external block device.",
            selected.mount_point.display()
        ));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn validate_external_workspace(input: &Path) -> Result<(PathBuf, String), String> {
    let contents = std::fs::read_to_string("/proc/self/mountinfo")
        .map_err(|e| format!("Could not inspect mounted storage: {e}"))?;
    let mounts = parse_mountinfo(&contents);
    let find_mount = |path: &Path| {
        mounts
            .iter()
            .filter(|m| path.starts_with(&m.mount_point))
            .max_by_key(|m| m.mount_point.components().count())
            .cloned()
    };
    let root = find_mount(Path::new("/")).ok_or("Could not identify the Linux root filesystem.")?;
    let selected =
        find_mount(input).ok_or("Could not identify the selected folder's mounted filesystem.")?;
    validate_external_mount(
        &root,
        &selected,
        physical_block_device(&root.device, &root.source).as_deref(),
        physical_block_device(&selected.device, &selected.source).as_deref(),
    )?;
    let output = input
        .parent()
        .ok_or("Could not find the drive folder containing Itemzflow.")?
        .join("FPKG");
    std::fs::create_dir_all(&output)
        .map_err(|e| format!("Could not create FPKG output folder on the external drive: {e}"))?;
    let output = output
        .canonicalize()
        .map_err(|e| format!("Could not access external FPKG folder: {e}"))?;
    let output_mount =
        find_mount(&output).ok_or("Could not identify the FPKG output filesystem.")?;
    if output_mount.device != selected.device || !output.starts_with(&selected.mount_point) {
        return Err("The FPKG output folder is not on the same external filesystem as the selected Itemzflow folder.".into());
    }
    let probe = output.join(format!(".fpkg-builder-write-check-{}", std::process::id()));
    let probe_result = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe);
    match probe_result {
        Ok(file) => {
            drop(file);
            std::fs::remove_file(&probe)
                .map_err(|e| format!("External-drive write check could not be cleaned up: {e}"))?;
        }
        Err(e) => return Err(format!("The external drive is not writable: {e}")),
    }
    let source_size = tree_bytes(input)?;
    let required = source_size
        .checked_add((source_size / 10).max(256 * 1024 * 1024))
        .ok_or("The selected dump is too large to estimate required storage.")?;
    let available = available_bytes(&output)?;
    if available < required {
        return Err(format!(
            "The external drive needs about {} free for this build, but only {} is available.",
            human_bytes(required),
            human_bytes(available)
        ));
    }
    Ok((output, selected.device))
}

#[cfg(not(target_os = "linux"))]
fn validate_external_workspace(_input: &Path) -> Result<(PathBuf, String), String> {
    Err("FPKG Builder package builds are supported on Linux with a separately mounted external drive.".into())
}

fn tree_bytes(root: &Path) -> Result<u64, String> {
    let mut total = 0_u64;
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        for entry in std::fs::read_dir(&folder)
            .map_err(|e| format!("Could not scan external dump storage: {e}"))?
        {
            let entry = entry.map_err(|e| format!("Could not inspect an Itemzflow entry: {e}"))?;
            let path = entry.path();
            let meta = std::fs::symlink_metadata(&path)
                .map_err(|e| format!("Could not inspect {}: {e}", path.display()))?;
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                pending.push(path);
            } else if meta.is_file() {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();
                if name.ends_with(".complete")
                    || path.extension().and_then(|x| x.to_str()).is_some_and(|x| {
                        x.eq_ignore_ascii_case("log") || x.eq_ignore_ascii_case("gp4")
                    })
                {
                    continue;
                }
                total = total
                    .checked_add(meta.len())
                    .ok_or("Dump size exceeds supported storage estimation.")?;
            }
        }
    }
    Ok(total)
}

#[cfg(target_os = "linux")]
fn available_bytes(path: &Path) -> Result<u64, String> {
    let c_path = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| "The external path contains an invalid null byte.")?;
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    let result = unsafe { libc::statvfs(c_path.as_ptr(), &mut stats) };
    if result != 0 {
        return Err(format!(
            "Could not read free space on the external drive: {}",
            std::io::Error::last_os_error()
        ));
    }
    (stats.f_bavail as u64)
        .checked_mul(stats.f_frsize as u64)
        .ok_or_else(|| "External free-space value overflowed.".to_owned())
}

#[cfg(not(target_os = "linux"))]
fn available_bytes(_path: &Path) -> Result<u64, String> {
    Err("Linux storage information is unavailable.".into())
}

fn human_bytes(value: u64) -> String {
    let units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let mut amount = value as f64;
    let mut unit = 0;
    while amount >= 1024.0 && unit < units.len() - 1 {
        amount /= 1024.0;
        unit += 1;
    }
    format!("{amount:.1} {}", units[unit])
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BuildState(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![inspect_itemzflow, start_build])
        .run(tauri::generate_context!())
        .expect("error while running FPKG Builder");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mount(device: &str, mount_point: &str, file_system: &str, source: &str) -> MountInfo {
        MountInfo {
            device: device.into(),
            mount_point: PathBuf::from(mount_point),
            file_system: file_system.into(),
            source: source.into(),
        }
    }

    #[test]
    fn mountinfo_unescapes_mount_paths_and_reads_filesystem() {
        let mounts =
            parse_mountinfo("36 25 8:17 / /media/riley/My\\040Drive rw - exfat /dev/sdb1 rw");
        assert_eq!(mounts.len(), 1);
        assert_eq!(mounts[0].mount_point, Path::new("/media/riley/My Drive"));
        assert_eq!(mounts[0].file_system, "exfat");
        assert_eq!(mounts[0].source, "/dev/sdb1");
    }

    #[test]
    fn external_mount_must_be_separate_physical_storage_and_large_file_compatible() {
        let root = mount("8:2", "/", "ext4", "/dev/sda2");
        let external = mount("8:17", "/media/riley/Drive", "exfat", "/dev/sdb1");
        assert!(validate_external_mount(
            &root,
            &external,
            Some(Path::new("/sys/sda")),
            Some(Path::new("/sys/sdb"))
        )
        .is_ok());
        assert!(validate_external_mount(
            &root,
            &external,
            Some(Path::new("/sys/sda")),
            Some(Path::new("/sys/sda"))
        )
        .is_err());
        let fat = mount("8:18", "/media/riley/FAT", "vfat", "/dev/sdb2");
        assert!(validate_external_mount(
            &root,
            &fat,
            Some(Path::new("/sys/sda")),
            Some(Path::new("/sys/sdb"))
        )
        .is_err());
        assert!(
            validate_external_mount(&root, &external, None, Some(Path::new("/sys/sdb"))).is_err()
        );
    }
}

