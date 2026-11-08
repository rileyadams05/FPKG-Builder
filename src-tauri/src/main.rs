#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::Value;
use std::{
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
fn start_build(
    app: tauri::AppHandle,
    state: State<'_, BuildState>,
    input_path: String,
) -> Result<(), String> {
    let input = input_path.trim().to_owned();
    if input.is_empty() {
        return Err("Drop the complete Itemzflow folder first.".into());
    }
    let helper = match helper_path(&app) {
        Ok(path) => path,
        Err(error) => return Err(error),
    };
    let input_path = PathBuf::from(&input);
    let parent = input_path.parent().ok_or_else(|| {
        "Could not determine the Itemzflow folder's parent directory.".to_string()
    })?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let staging = parent.join(format!(".fpkg-builder-staging-{nonce}"));
    std::fs::create_dir(&staging)
        .map_err(|e| format!("Could not prepare temporary package storage: {e}"))?;
    if state
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("A package build is already running.".into());
    }
    let busy = Arc::clone(&state.0);
    thread::spawn(move || {
        let outcome = run_build(&app, &helper, &input, &staging);
        if let Err((message, details)) = outcome {
            let _ = std::fs::remove_dir_all(&staging);
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
    staging: &Path,
) -> Result<(), (String, String)> {
    let mut child = Command::new(helper)
        .arg("process")
        .arg(input)
        .arg(staging)
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
    if let Some(completion) = completion {
        let _ = app.emit(
            "builder-ready-to-save",
            serde_json::json!({
                "completion": completion,
                "stagingDirectory": staging.to_string_lossy()
            }),
        );
    }
    Ok(())
}

#[tauri::command]
fn finalize_package(
    app: tauri::AppHandle,
    staged_path: String,
    destination_path: String,
    completion: Value,
) -> Result<(), String> {
    let staged = PathBuf::from(&staged_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let stage_dir = staged
        .parent()
        .ok_or("Staged package has no parent directory")?;
    if !stage_dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(".fpkg-builder-staging-"))
    {
        return Err("The temporary package path is invalid.".into());
    }
    let destination = PathBuf::from(destination_path);
    if destination
        .extension()
        .and_then(|x| x.to_str())
        .map_or(true, |ext| !ext.eq_ignore_ascii_case("pkg"))
    {
        return Err("Choose a destination filename ending in .pkg.".into());
    }
    if destination.exists() {
        return Err("A file already exists at that location. Choose a different filename.".into());
    }
    let parent = destination
        .parent()
        .ok_or("The selected destination has no parent folder")?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Could not access the selected destination: {e}"))?;
    let partial = destination.with_file_name(format!(
        ".{}.partial",
        destination.file_name().unwrap().to_string_lossy()
    ));
    let copy_result = (|| -> std::io::Result<()> {
        let mut source = std::fs::File::open(&staged)?;
        let mut target = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&partial)?;
        std::io::copy(&mut source, &mut target)?;
        target.sync_all()?;
        std::fs::rename(&partial, &destination)?;
        Ok(())
    })();
    if let Err(error) = copy_result {
        let _ = std::fs::remove_file(&partial);
        return Err(format!("Could not save the validated package: {error}"));
    }
    let _ = std::fs::remove_dir_all(stage_dir);
    let mut result = completion;
    result["packagePath"] = Value::String(destination.to_string_lossy().into_owned());
    result["outputFolder"] = Value::String(parent.to_string_lossy().into_owned());
    result["packageBytes"] = Value::from(
        std::fs::metadata(&destination)
            .map_err(|e| e.to_string())?
            .len(),
    );
    app.emit("builder-event", result).map_err(|e| e.to_string())
}

#[tauri::command]
fn discard_staged_package(staging_directory: String) -> Result<(), String> {
    let staging = PathBuf::from(staging_directory);
    if !staging
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(".fpkg-builder-staging-"))
    {
        return Err("The temporary package path is invalid.".into());
    }
    if staging.exists() {
        std::fs::remove_dir_all(staging).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BuildState(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            start_build,
            finalize_package,
            discard_staged_package
        ])
        .run(tauri::generate_context!())
        .expect("error while running FPKG Builder");
}
