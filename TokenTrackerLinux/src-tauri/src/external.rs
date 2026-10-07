//! Routing for links that should leave the app window.
//!
//! The dashboard renders external links as `target="_blank"` (service status
//! cards, leaderboard profiles, GitHub links). WebKitGTK's default `create`
//! handler returns no webview, so without an explicit handler those clicks are
//! a silent no-op — the macOS (`WKUIDelegate.createWebViewWith`) and Windows
//! (`CoreWebView2.NewWindowRequested`) clients both hand the URL to the system
//! browser instead, and this is the Linux counterpart.

use std::process::Command;

use tauri::Url;

/// URLs the dashboard is allowed to load inside the app window.
///
/// Only `http`/`https` can escape to the browser: the loading screen is served
/// over Tauri's own `tauri://` scheme and the dashboard over the loopback
/// server, and any other scheme (`about:`, `blob:`, `data:`) is webview
/// bookkeeping that must not be handed to `xdg-open`.
pub fn is_internal_url(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return true;
    }
    match url.host_str() {
        Some(host) => {
            host == "127.0.0.1"
                || host == "localhost"
                || host == "::1"
                || host == "[::1]"
                || host.ends_with(".localhost")
        }
        // Tauri's custom protocol has no host on some WebKit versions.
        None => true,
    }
}

/// Hand an external URL to the system browser. Returns whether it was opened.
pub fn open_in_browser(url: &Url) -> bool {
    if is_internal_url(url) {
        return false;
    }
    match Command::new("xdg-open").arg(url.as_str()).spawn() {
        Ok(_) => true,
        Err(error) => {
            eprintln!("[TokenTracker] failed to open {url} in the system browser: {error}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> Url {
        Url::parse(raw).expect("valid url")
    }

    #[test]
    fn keeps_app_and_loopback_urls_inside_the_window() {
        for internal in [
            "http://127.0.0.1:17680/dashboard",
            "http://localhost:17680/",
            "https://127.0.0.1:17680/",
            "http://tauri.localhost/index.html",
            "tauri://localhost/index.html",
            "about:blank",
            "blob:http://127.0.0.1:17680/1234",
        ] {
            assert!(is_internal_url(&url(internal)), "{internal}");
        }
    }

    #[test]
    fn sends_provider_status_pages_to_the_browser() {
        for external in [
            "https://status.anthropic.com/",
            "https://status.openai.com/",
            "https://status.cursor.com/",
            "http://example.com/",
            // A loopback-looking host that is not loopback.
            "https://127.0.0.1.evil.com/",
            "https://localhost.evil.com/",
        ] {
            assert!(!is_internal_url(&url(external)), "{external}");
        }
    }
}
