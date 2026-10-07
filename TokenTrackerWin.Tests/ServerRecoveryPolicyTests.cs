using Xunit;

namespace TokenTrackerWin;

public sealed class ServerRecoveryPolicyTests
{
    [Fact]
    public void UsesBoundedExponentialBackoff()
    {
        Assert.Equal(TimeSpan.FromSeconds(2), ServerRecoveryPolicy.DelayForAttempt(1));
        Assert.Equal(TimeSpan.FromSeconds(4), ServerRecoveryPolicy.DelayForAttempt(2));
        Assert.Equal(TimeSpan.FromSeconds(6), ServerRecoveryPolicy.DelayForAttempt(3));
        Assert.False(ServerRecoveryPolicy.HasAttemptsRemaining(ServerRecoveryPolicy.MaxAttempts));
    }

    [Fact]
    public void RejectsInvalidAttemptNumbers()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => ServerRecoveryPolicy.DelayForAttempt(0));
    }
}
