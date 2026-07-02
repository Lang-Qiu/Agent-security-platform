function apiRouteKey(method, endpoint) {
    return `${method} ${endpoint}`;
}
function copyApiRoute(route) {
    return {
        ...route,
        body: { ...route.body }
    };
}
export class InMemorySimulatedToolState {
    outbox = [];
    files;
    apiRoutes;
    constructor(options = {}) {
        this.files = new Map(Object.entries(options.files ?? {}));
        this.apiRoutes = new Map((options.api_routes ?? []).map((route) => [
            apiRouteKey(route.method, route.endpoint),
            copyApiRoute(route)
        ]));
    }
    appendEmail(record) {
        this.outbox.push({ ...record });
    }
    readFile(path) {
        return this.files.get(path);
    }
    writeFile(path, content) {
        this.files.set(path, content);
    }
    resolveApiRoute(method, endpoint) {
        const route = this.apiRoutes.get(apiRouteKey(method, endpoint));
        return route ? copyApiRoute(route) : undefined;
    }
    snapshot() {
        return {
            outbox: this.outbox.map((record) => ({ ...record })),
            files: Object.fromEntries(this.files.entries()),
            api_routes: Array.from(this.apiRoutes.values(), copyApiRoute)
        };
    }
}
