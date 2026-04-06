// 信号匹配

export function matchSignal(signal: any, probe: any): boolean {
    const { signal_type, match_operator, match_value } = signal;

    let target = "";

    // 支持三种信号类型
    if (signal_type === "body") target = probe.body || "";
    if (signal_type === "path") target = probe.path || "";
    if (signal_type === "port") target = String(probe.port || "");

    if (match_operator === "contains") {
        return target.includes(match_value);
    }

    if (match_operator === "equals") {
        return target === match_value;
    }

    if (match_operator === "in") {
        return match_value.split(",").includes(target);
    }

    return false;
}