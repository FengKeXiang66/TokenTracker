namespace TokenTrackerWin;

/// <summary>
/// Classifies the small set of dispatcher failures that are safe to absorb.
/// Window/WebView callbacks can race a deliberate dispatcher shutdown and
/// surface cancellation or disposal exceptions after the UI has already been
/// torn down. Everything else is left unhandled so a genuine programming or
/// rendering failure is not silently hidden by the tray host.
/// </summary>
internal static class DispatcherExceptionPolicy
{
    internal enum RecoveryKind
    {
        None,
        IgnoreAfterShutdown,
        IgnoreCancellation,
        RecreateDashboardWebView,
    }

    public static RecoveryKind Classify(Exception? exception, bool dispatcherShuttingDown)
    {
        if (dispatcherShuttingDown) return RecoveryKind.IgnoreAfterShutdown;
        if (exception is OperationCanceledException) return RecoveryKind.IgnoreCancellation;
        if (exception is ObjectDisposedException disposed
            && IsWebViewObject(disposed.ObjectName))
            return RecoveryKind.RecreateDashboardWebView;
        return RecoveryKind.None;
    }

    private static bool IsWebViewObject(string? objectName)
    {
        if (string.IsNullOrWhiteSpace(objectName)) return false;
        return objectName.Contains("webview", StringComparison.OrdinalIgnoreCase)
            || objectName.Contains("corewebview", StringComparison.OrdinalIgnoreCase);
    }
}
