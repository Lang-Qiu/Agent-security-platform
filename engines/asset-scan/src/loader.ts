// 加载 YAML

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export function loadFingerprints() {
    const file = path.join(__dirname, "../rules/fingerprints.v1.yaml");
    return yaml.load(fs.readFileSync(file, "utf-8")) as any;
}

export function loadProbes() {
    const file = path.join(__dirname, "../rules/probes.v1.yaml");
    return yaml.load(fs.readFileSync(file, "utf-8")) as any;
}