export function median(values) {
    const sortedValues = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sortedValues.length / 2);

    if (sortedValues.length % 2 === 0) {
        return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
    }

    return sortedValues[middle];
}

export function removeDeadzone(value, deadzone) {
    const magnitude = Math.abs(value);
    if (magnitude <= deadzone) {
        return 0;
    }

    const rescaledMagnitude = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
    return Math.sign(value) * rescaledMagnitude;
}

export function createOneEuroFilter(config) {
    let previousRawValue = null;
    let previousFilteredValue = 0;
    let previousFilteredDerivative = 0;
    let previousTimeMs = null;

    const calculateAlpha = (cutoffHz, deltaSeconds) => {
        const timeConstant = 1 / (2 * Math.PI * cutoffHz);
        return 1 / (1 + timeConstant / deltaSeconds);
    };

    return {
        reset() {
            previousRawValue = null;
            previousFilteredValue = 0;
            previousFilteredDerivative = 0;
            previousTimeMs = null;
        },
        filter(value, timeMs) {
            if (!Number.isFinite(value)) {
                return previousFilteredValue;
            }

            if (previousTimeMs === null) {
                previousRawValue = value;
                previousFilteredValue = value;
                previousFilteredDerivative = 0;
                previousTimeMs = timeMs;
                return value;
            }

            const elapsedSeconds = (timeMs - previousTimeMs) / 1000;
            const deltaSeconds = Math.min(0.2, Math.max(0.001, elapsedSeconds));
            const rawDerivative = (value - previousRawValue) / deltaSeconds;
            const derivativeAlpha = calculateAlpha(
                config.derivativeCutoffHz,
                deltaSeconds
            );

            previousFilteredDerivative +=
                (rawDerivative - previousFilteredDerivative) * derivativeAlpha;

            const cutoffHz =
                config.minCutoffHz +
                config.speedCoefficient * Math.abs(previousFilteredDerivative);
            const valueAlpha = calculateAlpha(cutoffHz, deltaSeconds);

            previousFilteredValue +=
                (value - previousFilteredValue) * valueAlpha;
            previousRawValue = value;
            previousTimeMs = timeMs;

            return previousFilteredValue;
        },
    };
}
