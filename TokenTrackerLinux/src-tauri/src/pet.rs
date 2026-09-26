//! Floating desktop pet — the Linux counterpart of `TokenTrackerWin/PetWindow.cs`.
//!
//! A transparent, undecorated window loads the shared `pet.html` page from the
//! bundled server. The page feeds itself usage, limits, currency and locale
//! (`dashboard/src/lib/pet-linux-host.js`); this module owns the window and the
//! settings the dashboard's Pet page edits: visibility, size, character and bot
//! colour, persisted to `pet.json` in the app config directory.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, LogicalSize, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::oauth::DashboardBaseUrl;

pub const PET_LABEL: &str = "pet";
const MAIN_LABEL: &str = "main";
const SETTINGS_FILE: &str = "pet.json";

// Geometry mirrors PetWindow.cs / pet.jsx:sizeFor(). The window is wider than
// the sprite so the 340px bubble never touches the edge.
const WINDOW_WIDTH: f64 = 400.0;
const MIN_BUBBLE_BAND: f64 = 138.0;
/// Windows grows the bubble band on demand and moves the window up to keep the
/// sprite still. Wayland clients can't move their own window, so the band is
/// fixed at a height that fits the hover card with several limit rows.
pub const BUBBLE_BAND: f64 = 230.0;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PetSettings {
    pub visible: bool,
    pub size: String,
    pub character: String,
    pub bot_color: String,
}

impl Default for PetSettings {
    fn default() -> Self {
        Self {
            visible: false,
            size: "medium".into(),
            character: "clawd".into(),
            bot_color: "auto".into(),
        }
    }
}

impl PetSettings {
    fn normalized(self) -> Self {
        Self {
            visible: self.visible,
            size: normalize_size(&self.size).into(),
            character: normalize_character(&self.character),
            bot_color: normalize_bot_color(&self.bot_color),
        }
    }
}

pub fn normalize_size(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "small" => "small",
        "large" => "large",
        _ => "medium",
    }
}

fn is_slug(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Built-ins plus imported pet ids (`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`,
/// as on Windows). Anything else falls back to Clawd so a bad value can never
/// become script.
pub fn normalize_character(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    if is_slug(&value, 64) && !value.starts_with('-') && !value.ends_with('-') {
        value
    } else {
        "clawd".into()
    }
}

pub fn normalize_bot_color(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    if is_slug(&value, 32) {
        value
    } else {
        "auto".into()
    }
}

/// Window size for a size preset: the preset's sprite area plus the fixed bubble band.
pub fn window_size(size: &str) -> (f64, f64) {
    let base = match normalize_size(size) {
        "small" => 230.0,
        "large" => 286.0,
        _ => 254.0,
    };
    (WINDOW_WIDTH, base - MIN_BUBBLE_BAND + BUBBLE_BAND)
}

/// The sprite square inside the window, as `(x, y, side)` — pet.jsx centres a
/// `min(width, height - band) - 8` square in the area under the bubble band.
pub fn sprite_rect(width: f64, height: f64) -> (f64, f64, f64) {
    let side = (width.min(height - BUBBLE_BAND) - 8.0).max(40.0);
    let x = (width - side) / 2.0;
    let y = BUBBLE_BAND + (height - BUBBLE_BAND - side) / 2.0;
    (x, y, side)
}

pub struct PetState {
    settings: Mutex<PetSettings>,
    path: Option<PathBuf>,
}

impl PetState {
    pub fn load(path: Option<PathBuf>) -> Self {
        let settings = path
            .as_ref()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|raw| serde_json::from_str::<PetSettings>(&raw).ok())
            .unwrap_or_default()
            .normalized();
        Self {
            settings: Mutex::new(settings),
            path,
        }
    }

    pub fn get(&self) -> PetSettings {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }

    fn update(&self, change: impl FnOnce(&mut PetSettings)) -> PetSettings {
        let Ok(mut settings) = self.settings.lock() else {
            return PetSettings::default();
        };
        change(&mut settings);
        *settings = settings.clone().normalized();
        let snapshot = settings.clone();
        drop(settings);
        if let Err(error) = self.save(&snapshot) {
            eprintln!("[TokenTracker] failed to save pet settings: {error}");
        }
        snapshot
    }

    fn save(&self, settings: &PetSettings) -> std::io::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let json = serde_json::to_vec_pretty(settings).map_err(std::io::Error::other)?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(tmp, path)
    }
}

pub fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(SETTINGS_FILE))
}

/// Apply one change from the dashboard's Pet page (`setPetSetting`).
fn apply_setting(settings: &mut PetSettings, key: &str, value: &Value) {
    let text = value.as_str().unwrap_or_default();
    match key {
        "visible" => settings.visible = value.as_bool().unwrap_or(false),
        "size" => settings.size = text.into(),
        "character" => settings.character = text.into(),
        "botColor" => settings.bot_color = text.into(),
        _ => {}
    }
}

fn js_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into())
}

/// Push the settings the page can't read on its own into the pet window.
fn push_to_pet<R: Runtime>(window: &WebviewWindow<R>, settings: &PetSettings) {
    let script = format!(
        "window.__ttPetCharacter={};window.__ttPetBotColor={};window.__ttPetBubbleBand={};\
         window.dispatchEvent(new Event('pet:character'));\
         window.dispatchEvent(new Event('pet:botColor'));\
         window.dispatchEvent(new Event('pet:bubble-band'));",
        js_string(&settings.character),
        js_string(&settings.bot_color),
        BUBBLE_BAND,
    );
    let _ = window.eval(script);
}

/// Answer the dashboard's `getPetSettings` / confirm a change, as macOS and Windows do.
fn push_to_dashboard<R: Runtime>(app: &AppHandle<R>, settings: &PetSettings) {
    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    let Ok(detail) = serde_json::to_string(settings) else {
        return;
    };
    let _ = main.eval(format!(
        "window.dispatchEvent(new CustomEvent('native:petSettings', {{ detail: {detail} }}));"
    ));
}

/// Make only the sprite square take pointer input; the transparent padding and
/// the bubble band pass clicks through to whatever is underneath.
fn apply_input_region<R: Runtime>(window: &WebviewWindow<R>, size: &str) {
    use gtk::prelude::WidgetExt;

    let (width, height) = window_size(size);
    let (x, y, side) = sprite_rect(width, height);
    let Ok(gtk_window) = window.gtk_window() else {
        return;
    };
    let Some(gdk_window) = gtk_window.window() else {
        return;
    };
    let rect = gtk::cairo::RectangleInt::new(x as i32, y as i32, side as i32, side as i32);
    let region = gtk::cairo::Region::create_rectangle(&rect);
    gdk_window.input_shape_combine_region(&region, 0, 0);
}

fn build_window<R: Runtime>(
    app: &AppHandle<R>,
    base_url: &str,
    settings: &PetSettings,
) -> Result<WebviewWindow<R>, String> {
    // No `?app=1`: it would set the sticky native-app flag in localStorage,
    // which this origin shares with the dashboard window.
    let url = format!("{base_url}/pet.html")
        .parse::<tauri::Url>()
        .map_err(|error| format!("invalid pet URL: {error}"))?;
    let (width, height) = window_size(&settings.size);
    let push_app = app.clone();
    let window = WebviewWindowBuilder::new(app, PET_LABEL, WebviewUrl::External(url))
        .title("TokenTracker Pet")
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        // Keep the page transparent before its own stylesheet lands.
        .initialization_script(
            "try{var s=document.createElement('style');\
             s.textContent='html,body,#pet-root{background:transparent!important}';\
             (document.head||document.documentElement).appendChild(s);}catch(e){}",
        )
        .on_page_load(move |window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let settings = push_app.state::<PetState>().get();
                push_to_pet(&window, &settings);
            }
        })
        .build()
        .map_err(|error| error.to_string())?;
    Ok(window)
}

/// Show or hide the pet to match the saved settings. Must run on the main thread.
pub fn sync_window<R: Runtime>(app: &AppHandle<R>) {
    let settings = app.state::<PetState>().get();
    let existing = app.get_webview_window(PET_LABEL);

    if !settings.visible {
        if let Some(window) = existing {
            let _ = window.hide();
        }
        return;
    }

    let window = match existing {
        Some(window) => window,
        None => {
            // The page is served by the bundled server; before it is up there is
            // nothing to load. start_dashboard calls back here once it is.
            let Some(base_url) = app.state::<DashboardBaseUrl>().get() else {
                return;
            };
            match build_window(app, &base_url, &settings) {
                Ok(window) => window,
                Err(error) => {
                    eprintln!("[TokenTracker] failed to create the pet window: {error}");
                    return;
                }
            }
        }
    };

    let (width, height) = window_size(&settings.size);
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    apply_input_region(&window, &settings.size);
    push_to_pet(&window, &settings);
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    let settings = app.state::<PetState>().update(|s| s.visible = visible);
    sync_window(app);
    push_to_dashboard(app, &settings);
    crate::tray::refresh_menu(app);
}

fn handle_pet_message<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, message: &str) {
    match message {
        "pet:drag" | "pet:drag-left" | "pet:drag-right" => {
            if let Err(error) = window.start_dragging() {
                eprintln!("[TokenTracker] pet drag failed: {error}");
            }
        }
        "pet:context-menu" => crate::tray::show_main_window(app),
        // The bubble band is fixed on Linux (see BUBBLE_BAND).
        _ => {}
    }
}

fn handle_dashboard_message<R: Runtime>(app: &AppHandle<R>, message: &Value) {
    match message.get("type").and_then(Value::as_str) {
        Some("getPetSettings") => push_to_dashboard(app, &app.state::<PetState>().get()),
        Some("setPetSetting") => {
            let Some(key) = message.get("key").and_then(Value::as_str) else {
                return;
            };
            let value = message.get("value").cloned().unwrap_or(Value::Null);
            let settings = app
                .state::<PetState>()
                .update(|s| apply_setting(s, key, &value));
            sync_window(app);
            push_to_dashboard(app, &settings);
            crate::tray::refresh_menu(app);
        }
        // A pet was imported or removed: make the pet page re-read its catalog.
        Some("refreshPetCatalog") => {
            if let Some(pet) = app.get_webview_window(PET_LABEL) {
                push_to_pet(&pet, &app.state::<PetState>().get());
            }
        }
        _ => {}
    }
}

/// Single entry point for both the pet page (`"pet:*"` strings) and the
/// dashboard's Pet page (`{ type, key?, value? }` objects).
#[tauri::command]
pub fn pet_bridge<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, message: Value) {
    match (window.label(), &message) {
        (PET_LABEL, Value::String(text)) => handle_pet_message(&app, &window, text),
        (MAIN_LABEL, Value::Object(_)) => handle_dashboard_message(&app, &message),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_normalize_to_the_three_presets() {
        assert_eq!(normalize_size("Large"), "large");
        assert_eq!(normalize_size(" small "), "small");
        assert_eq!(normalize_size("huge"), "medium");
    }

    #[test]
    fn characters_are_slugs_or_clawd() {
        assert_eq!(normalize_character("Sprout"), "sprout");
        assert_eq!(normalize_character("my-pet-2"), "my-pet-2");
        assert_eq!(normalize_character("'-alert(1)-'"), "clawd");
        assert_eq!(normalize_character("-bad"), "clawd");
        assert_eq!(normalize_character(""), "clawd");
        assert_eq!(normalize_character(&"a".repeat(65)), "clawd");
    }

    #[test]
    fn bot_colors_are_short_slugs_or_auto() {
        assert_eq!(normalize_bot_color("Mint"), "mint");
        assert_eq!(normalize_bot_color("red;alert(1)"), "auto");
        assert_eq!(normalize_bot_color(&"a".repeat(33)), "auto");
    }

    #[test]
    fn sprite_sits_under_the_bubble_band_for_every_size() {
        for size in ["small", "medium", "large"] {
            let (w, h) = window_size(size);
            let (x, y, side) = sprite_rect(w, h);
            assert!(y >= BUBBLE_BAND, "{size}: sprite overlaps the bubble band");
            assert!(y + side <= h, "{size}: sprite runs past the bottom");
            assert!(
                (x * 2.0 + side - w).abs() < 1e-9,
                "{size}: sprite not centred"
            );
        }
        // Same sprite sizes as Windows: base height - 138 band - 8.
        assert_eq!(
            sprite_rect(window_size("medium").0, window_size("medium").1).2,
            254.0 - 138.0 - 8.0
        );
    }

    #[test]
    fn dashboard_settings_apply_by_key() {
        let mut settings = PetSettings::default();
        apply_setting(&mut settings, "visible", &Value::Bool(true));
        apply_setting(&mut settings, "size", &Value::String("large".into()));
        apply_setting(&mut settings, "botColor", &Value::String("mint".into()));
        apply_setting(&mut settings, "unknown", &Value::String("x".into()));
        assert!(settings.visible);
        assert_eq!(settings.size, "large");
        assert_eq!(settings.bot_color, "mint");
    }

    #[test]
    fn settings_round_trip_through_the_file() {
        let dir = std::env::temp_dir().join(format!("tt-pet-{}", std::process::id()));
        let path = dir.join(SETTINGS_FILE);
        let state = PetState::load(Some(path.clone()));
        assert_eq!(state.get(), PetSettings::default());
        state.update(|s| {
            s.visible = true;
            s.character = "BYTE".into();
        });
        let reloaded = PetState::load(Some(path));
        assert!(reloaded.get().visible);
        assert_eq!(reloaded.get().character, "byte");
        let _ = std::fs::remove_dir_all(dir);
    }
}
