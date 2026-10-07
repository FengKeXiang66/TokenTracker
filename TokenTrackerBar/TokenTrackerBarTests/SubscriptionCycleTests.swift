import XCTest

/// Native twin of `dashboard/src/lib/subscription-display.test.js`. The
/// menu-bar Limits panel draws its subscription bar from
/// `SubscriptionCycle.cycleView`, so the same calendar math the web dashboard
/// already pins down here must hold on macOS too.
final class SubscriptionCycleTests: XCTestCase {

    func testManualSubscriptionWithoutProviderContentHasNoQuotaExplanation() {
        XCTAssertTrue(SubscriptionSectionPolicy.usesSubscriptionOnly(
            hasQuotaRows: false, hasResetContent: false, hasServiceStatus: false
        ))
    }

    func testQuotaResetAndIncidentContentKeepTheProviderSection() {
        for quota in [false, true] {
            for reset in [false, true] {
                for status in [false, true] where quota || reset || status {
                    XCTAssertFalse(SubscriptionSectionPolicy.usesSubscriptionOnly(
                        hasQuotaRows: quota, hasResetContent: reset, hasServiceStatus: status
                    ))
                }
            }
        }
    }

    private static let dayMs: Double = 86400000

    /// 2026-08-16T06:00:00Z, matching the web fixture's default boundary.
    private static let defaultEndMs: Double = 1786860000000

    private func ms(_ iso: String) -> Double {
        guard let value = SubscriptionCycle.parseDateMs(iso) else {
            XCTFail("fixture date should parse: \(iso)")
            return .nan
        }
        return value
    }

    private func makeSubscription(
        cycle: String = "monthly",
        autoRenew: Bool = true,
        nextBillingAt: String = "2026-08-16T06:00:00.000Z",
        startedAt: String? = nil
    ) -> SubscriptionRecord {
        SubscriptionRecord(
            id: "sub-1",
            service: "GPT",
            plan: "Plus",
            provider: nil,
            autoRenew: autoRenew,
            cycle: cycle,
            nextBillingAt: nextBillingAt,
            startedAt: startedAt,
            createdAt: nil,
            updatedAt: nil
        )
    }

    // MARK: - parseDateMs

    func testParseDateMsAcceptsFractionalAndPlainISO8601() {
        // The API returns milliseconds; older records omit them.
        XCTAssertEqual(
            ms("2026-08-16T06:00:00.000Z"),
            Self.defaultEndMs,
            accuracy: 0.5
        )
        XCTAssertEqual(
            ms("2026-08-16T06:00:00Z"),
            Self.defaultEndMs,
            accuracy: 0.5
        )
    }

    func testParseDateMsRejectsGarbage() {
        XCTAssertNil(SubscriptionCycle.parseDateMs("not a date"))
        XCTAssertNil(SubscriptionCycle.parseDateMs(""))
    }

    // MARK: - addMonthsUtc

    func testAddMonthsUtcClampsMonthEndToTheTargetMonth() {
        // Jan 31 + 1 month must land on the last day of February, not Mar 2/3.
        let jan31 = ms("2026-01-31T12:00:00.000Z")
        XCTAssertEqual(
            SubscriptionCycle.addMonthsUtc(ms: jan31, months: 1),
            ms("2026-02-28T12:00:00.000Z"),
            accuracy: 0.5
        )
        // Leap year keeps Feb 29.
        let leapJan31 = ms("2028-01-31T12:00:00.000Z")
        XCTAssertEqual(
            SubscriptionCycle.addMonthsUtc(ms: leapJan31, months: 1),
            ms("2028-02-29T12:00:00.000Z"),
            accuracy: 0.5
        )
    }

    func testAddMonthsUtcKeepsTheAnchorDayWhenTheTargetMonthIsLongEnough() {
        XCTAssertEqual(
            SubscriptionCycle.addMonthsUtc(ms: ms("2026-08-15T09:30:00.000Z"), months: -1),
            ms("2026-07-15T09:30:00.000Z"),
            accuracy: 0.5
        )
    }

    // MARK: - cycleView

    func testCycleViewReturnsNilForAnUnparseableDate() {
        XCTAssertNil(SubscriptionCycle.cycleView(
            subscription: makeSubscription(nextBillingAt: "not a date"),
            nowMs: Self.defaultEndMs
        ))
    }

    func testCycleViewDefaultsLegacyRecordsWithoutACycleToMonthly() {
        let now = ms("2026-08-10T00:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(cycle: ""),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        // Aug 16 end -> Jul 16 start; the span is 31 days, not 30 or 365.
        XCTAssertEqual(view.startMs, ms("2026-07-16T06:00:00.000Z"), accuracy: 0.5)
        XCTAssertEqual(view.cycleDays, 31)
    }

    func testCycleViewComputesAnExactFutureCycleForANonRenewingRecord() {
        let now = ms("2026-08-10T06:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(autoRenew: false),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertEqual(view.startMs, ms("2026-07-16T06:00:00.000Z"), accuracy: 0.5)
        XCTAssertEqual(view.endMs, Self.defaultEndMs, accuracy: 0.5)
        XCTAssertEqual(view.progress, 25.0 / 31.0, accuracy: 1e-10)
        XCTAssertFalse(view.expired)
    }

    func testCycleViewMarksOnlyNonRenewingRecordsAsExpiredPastTheirDate() {
        let now = ms("2026-08-18T00:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(autoRenew: false),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertTrue(view.expired)
        XCTAssertEqual(view.progress, 1.0, accuracy: 1e-10)
        // A manual record does not roll forward past its own boundary.
        XCTAssertEqual(view.endMs, Self.defaultEndMs, accuracy: 0.5)
    }

    func testCycleViewRollsAnAutoRenewRecordForwardAndClampsShortMonths() {
        // Recorded renewal Jan 31 with no explicit anchor: the implied anchor is
        // the Dec 31 cycle start, so boundaries stay Jan 31 -> Feb 28 (clamped)
        // -> Mar 31 and the day-31 anchor survives the short month instead of
        // permanently drifting to the 28th.
        let now = ms("2026-03-05T00:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(nextBillingAt: "2026-01-31T12:00:00.000Z"),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertEqual(view.endMs, ms("2026-03-31T12:00:00.000Z"), accuracy: 0.5)
        XCTAssertEqual(view.startMs, ms("2026-02-28T12:00:00.000Z"), accuracy: 0.5)
        XCTAssertFalse(view.expired)
    }

    func testCycleViewRollsWeeklyRecordsByWholeWeeks() {
        let now = ms("2026-03-18T00:00:00.000Z") // 17 days after the recorded end
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(cycle: "weekly", nextBillingAt: "2026-03-01T00:00:00.000Z"),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertEqual(view.endMs, ms("2026-03-22T00:00:00.000Z"), accuracy: 0.5)
        XCTAssertEqual(view.cycleDays, 7)
    }

    func testCycleViewAdvancesAWeeklyRecordWhenNowLandsExactlyOnTheRenewal() {
        // Landing exactly on the boundary must open the next week; otherwise the
        // bar pins at 100% and reads as expired while the badge says auto-renew.
        let endMs = ms("2026-03-01T00:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(cycle: "weekly", nextBillingAt: "2026-03-01T00:00:00.000Z"),
            nowMs: endMs
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertEqual(view.endMs, endMs + 7 * Self.dayMs, accuracy: 0.5)
        XCTAssertEqual(view.progress, 0.0, accuracy: 1e-10)
        XCTAssertFalse(view.expired)
    }

    func testCycleViewRollsYearlyRecordsWithLeapClamping() {
        let now = ms("2026-03-05T00:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(cycle: "yearly", nextBillingAt: "2024-02-29T12:00:00.000Z"),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        // Feb 29 2024 -> Feb 28 2025 -> Feb 28 2026 (still past `now`) -> Feb 28 2027.
        XCTAssertEqual(view.endMs, ms("2027-02-28T12:00:00.000Z"), accuracy: 0.5)
    }

    func testCycleViewDerivesBoundsInUTCAcrossDSTTransitionDays() {
        // 2026-03-08 is the US DST jump and 2026-03-29 the EU one. Local-time
        // calendar math would shift the computed start by an hour.
        for endIso in ["2026-03-08T12:00:00.000Z", "2026-03-29T12:00:00.000Z"] {
            let endMs = ms(endIso)
            let view = SubscriptionCycle.cycleView(
                subscription: makeSubscription(autoRenew: false, nextBillingAt: endIso),
                nowMs: endMs - 14 * Self.dayMs
            )
            guard let view else { return XCTFail("expected a cycle view for \(endIso)") }
            XCTAssertEqual(view.endMs, endMs, accuracy: 0.5)
            XCTAssertEqual(
                view.startMs,
                SubscriptionCycle.addMonthsUtc(ms: endMs, months: -1),
                accuracy: 0.5
            )
        }
    }

    func testCycleViewUsesTheStoredStartedAtAsTheBillingAnchor() {
        // A record carrying the user's subscription date anchors on it, so the
        // window is [startedAt, startedAt + 1 cycle) rather than a month back
        // from the stored boundary.
        let startedAt = "2026-08-20T04:00:00.000Z"
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(
                cycle: "yearly",
                autoRenew: false,
                nextBillingAt: "2027-08-20T04:00:00.000Z",
                startedAt: startedAt
            ),
            nowMs: ms("2026-10-06T04:00:00.000Z")
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertEqual(view.startMs, ms(startedAt), accuracy: 0.5)
        XCTAssertEqual(view.endMs, ms("2027-08-20T04:00:00.000Z"), accuracy: 0.5)
        XCTAssertFalse(view.expired)
    }

    func testCycleViewKeepsTheBarInsideZeroToOne() {
        let now = ms("2026-08-16T06:00:00.000Z")
        let view = SubscriptionCycle.cycleView(
            subscription: makeSubscription(autoRenew: false),
            nowMs: now
        )
        guard let view else { return XCTFail("expected a cycle view") }
        XCTAssertGreaterThanOrEqual(view.progress, 0.0)
        XCTAssertLessThanOrEqual(view.progress, 1.0)
        XCTAssertGreaterThanOrEqual(view.cycleDays, 1)
    }

    // MARK: - remainingLabel

    func testRemainingLabelFormatsMinutesHoursAndDays() {
        let now = Self.defaultEndMs
        XCTAssertEqual(SubscriptionCycle.remainingLabel(endMs: now + 5 * 60000, nowMs: now), "5m")
        XCTAssertEqual(SubscriptionCycle.remainingLabel(endMs: now + 17 * 3600000, nowMs: now), "17h")
        XCTAssertEqual(SubscriptionCycle.remainingLabel(endMs: now + 6 * Self.dayMs, nowMs: now), "6d")
    }

    func testRemainingLabelReportsExpiryOnceTheEndHasPassed() {
        let now = Self.defaultEndMs
        XCTAssertEqual(
            SubscriptionCycle.remainingLabel(endMs: now - 1, nowMs: now),
            Strings.subscriptionExpired
        )
    }
}
