using TokenTrackerWin;
using Xunit;

namespace TokenTrackerWin.Tests;

public sealed class DispatcherExceptionPolicyTests
{
    [Fact]
    public void CancellationAndDisposalAreRecoverableWhileDispatcherIsAlive()
    {
        Assert.Equal(
            DispatcherExceptionPolicy.RecoveryKind.IgnoreCancellation,
            DispatcherExceptionPolicy.Classify(new OperationCanceledException(), false));
        Assert.Equal(
            DispatcherExceptionPolicy.RecoveryKind.RecreateDashboardWebView,
            DispatcherExceptionPolicy.Classify(new ObjectDisposedException("WebView2"), false));
    }

    [Fact]
    public void UnknownExceptionsAreNotAbsorbed()
    {
        Assert.Equal(
            DispatcherExceptionPolicy.RecoveryKind.None,
            DispatcherExceptionPolicy.Classify(new InvalidOperationException("render failure"), false));
        Assert.Equal(
            DispatcherExceptionPolicy.RecoveryKind.None,
            DispatcherExceptionPolicy.Classify(new ObjectDisposedException("TextBox"), false));
    }

    [Fact]
    public void ShutdownMakesLateDispatcherCallbacksRecoverable()
    {
        Assert.Equal(
            DispatcherExceptionPolicy.RecoveryKind.IgnoreAfterShutdown,
            DispatcherExceptionPolicy.Classify(new InvalidOperationException("late callback"), true));
    }
}
