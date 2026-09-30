//! What the dashboard is told about the desktop it runs on.

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

/// Lets the dashboard offer the top-bar extension only where it can run.
pub fn init_script() -> String {
    let gnome = std::env::var("XDG_CURRENT_DESKTOP")
        .map(|value| is_gnome_shell(&value))
        .unwrap_or(false);
    format!("window.__TOKENTRACKER_GNOME_SHELL__ = {gnome};")
}
