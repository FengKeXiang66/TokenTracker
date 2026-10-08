//! What the dashboard is told about the desktop it runs on.

use std::path::PathBuf;
use std::process::Command;

const TOP_BAR_EXTENSION: &str = "tokentracker@tokentracker.cc";

/// Whether `XDG_CURRENT_DESKTOP` (a colon-separated list such as
/// `ubuntu:GNOME`) names a GNOME Shell session, the only one that can load the
/// top-bar extension. Budgie and GNOME Flashback also list `GNOME` but run
/// their own panels.
pub fn is_gnome_shell(current_desktop: &str) -> bool {
    let names: Vec<&str> = current_desktop.split(':').collect();
    names.iter().any(|name| name.eq_ignore_ascii_case("gnome"))
        && !names.iter().any(|name| {
            name.eq_ignore_ascii_case("budgie") || name.eq_ignore_ascii_case("gnome-flashback")
        })
}

/// Whether `gsettings get org.gnome.shell enabled-extensions` output lists the
/// top-bar extension.
pub fn lists_top_bar_extension(enabled_extensions: &str) -> bool {
    enabled_extensions.contains(&format!("'{TOP_BAR_EXTENSION}'"))
}

/// The .deb, .rpm and Arch packages install it system-wide; a checkout
/// install links it into the user's data dir.
fn top_bar_extension_installed() -> bool {
    let user_data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")));
    let mut dirs = vec![PathBuf::from("/usr/share")];
    dirs.extend(user_data);
    dirs.iter().any(|dir| {
        dir.join("gnome-shell/extensions")
            .join(TOP_BAR_EXTENSION)
            .is_dir()
    })
}

fn top_bar_extension_enabled() -> bool {
    Command::new("gsettings")
        .args(["get", "org.gnome.shell", "enabled-extensions"])
        .output()
        .is_ok_and(|out| {
            out.status.success() && lists_top_bar_extension(&String::from_utf8_lossy(&out.stdout))
        })
}

/// Offer the top-bar card only where "Set up" can finish without a checkout:
/// GNOME Shell with the extension installed but not turned on yet. That leaves
/// out the AppImage, which can't install it.
pub fn init_script() -> String {
    let offer = std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|value| is_gnome_shell(&value))
        && top_bar_extension_installed()
        && !top_bar_extension_enabled();
    format!("window.__TOKENTRACKER_OFFER_TOP_BAR__ = {offer};")
}
