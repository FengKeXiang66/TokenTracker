use tokentracker_linux::desktop::{is_gnome_shell, lists_top_bar_extension};

#[test]
fn gnome_shell_sessions_are_recognised() {
    for value in [
        "GNOME",
        "ubuntu:GNOME",
        "pop:GNOME",
        "GNOME-Classic:GNOME",
        "gnome",
    ] {
        assert!(is_gnome_shell(value), "{value}");
    }
}

#[test]
fn other_desktops_are_not_gnome_shell() {
    for value in [
        "",
        "KDE",
        "XFCE",
        "X-Cinnamon",
        "MATE",
        "Budgie:GNOME",
        "GNOME-Flashback:GNOME",
        "COSMIC",
    ] {
        assert!(!is_gnome_shell(value), "{value}");
    }
}

#[test]
fn enabled_extension_list_is_matched_by_exact_uuid() {
    assert!(lists_top_bar_extension(
        "['ubuntu-dock@ubuntu.com', 'tokentracker@tokentracker.cc']"
    ));
    assert!(!lists_top_bar_extension("@as []"));
    assert!(!lists_top_bar_extension(
        "['old-tokentracker@tokentracker.cc']"
    ));
}
