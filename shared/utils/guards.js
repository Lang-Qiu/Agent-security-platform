export function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isString(value) {
    return typeof value === "string";
}
export function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
export function isBoolean(value) {
    return typeof value === "boolean";
}
export function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
export function isOneOf(allowedValues, value) {
    return typeof value === "string" && allowedValues.includes(value);
}
// R12 (Phase 2 rework review P1 #3): strict ISO-8601 validation with real
// calendar date checking. Shared across campaign ingest, supervision, and
// sandbox contracts to avoid duplicating the regex and calendar logic.
const ISO_8601_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isValidCalendarDate(year, month, day) {
    if (month < 1 || month > 12)
        return false;
    if (day < 1 || day > 31)
        return false;
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2) {
        const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        return day <= (isLeapYear ? 29 : 28);
    }
    return day <= daysInMonth[month - 1];
}
export function isStrictIso8601(value) {
    if (!isString(value))
        return false;
    const match = value.match(ISO_8601_PATTERN);
    if (!match)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day))
        return false;
    return Number.isFinite(Date.parse(value));
}
// Returns the parsed epoch milliseconds, or null if the value is not a
// strict ISO-8601 timestamp. Used for monotonicity checks on PARSED
// instants rather than lexicographic string comparison.
export function parseIso8601Instant(value) {
    if (!isStrictIso8601(value))
        return null;
    return Date.parse(value);
}
