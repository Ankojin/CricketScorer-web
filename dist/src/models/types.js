export function isPhysicalBall(ball) {
    return !ball.isAdjustment &&
        ball.extrasType !== 'WIDE' &&
        ball.extrasType !== 'NO_BALL' &&
        ball.wicketType !== 'RETIRED_HURT';
}
