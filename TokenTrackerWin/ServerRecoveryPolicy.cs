namespace TokenTrackerWin;

/// <summary>
/// Small, deterministic policy for restarting the bundled local server. Keeping the
/// retry budget and backoff calculation pure makes the recovery loop easy to verify
/// without launching Node or a WebView2 runtime in unit tests.
/// </summary>
internal static class ServerRecoveryPolicy
{
    public const int MaxAttempts = 3;

    public static TimeSpan DelayForAttempt(int attempt)
    {
        if (attempt < 1) throw new ArgumentOutOfRangeException(nameof(attempt));
        return TimeSpan.FromSeconds(Math.Min(8, attempt * 2));
    }

    public static bool HasAttemptsRemaining(int attempt) => attempt < MaxAttempts;
}
