use tauri::Url;
use tokentracker_linux::external::is_internal_url;

fn url(raw: &str) -> Url {
    Url::parse(raw).expect("valid url")
}

/// The dashboard is served from the loopback port the bundled server picked, so
/// the check must not be pinned to a single port, and the loading screen is
/// served over Tauri's own scheme before that port exists.
#[test]
fn dashboard_navigation_stays_in_the_window() {
    for internal in [
        "http://127.0.0.1:17680/dashboard",
        "http://127.0.0.1:41235/status",
        "http://localhost:17680/",
        "tauri://localhost/index.html",
        "http://tauri.localhost/index.html",
    ] {
        assert!(is_internal_url(&url(internal)), "{internal}");
    }
}

/// Every provider card on the Service Status page is a `target="_blank"` link
/// to a third-party status page; those must leave for the system browser.
#[test]
fn provider_status_pages_leave_the_window() {
    for external in [
        "https://status.anthropic.com/",
        "https://status.openai.com/",
        "https://status.cursor.com/",
        "https://www.githubstatus.com/",
        "https://github.com/xiufengsun/TokenTracker",
    ] {
        assert!(!is_internal_url(&url(external)), "{external}");
    }
}
