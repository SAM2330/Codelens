import { parse } from "@babel/parser";
import { AnalyzedFile } from "./repositoryAnalyzer";
import { Dependency } from "./dependencyAnalyzer";
import { APIAnalysis } from "./apiAnalyzer";

export type CodeFlowStep = {
    type: "route" | "controller" | "service" | "external_api";
    name?: string;
    file?: string;
    line?: number;
    url?: string;
};

export type CodeFlow = {
    entryPoint: string;
    route: string;
    handler?: string;
    steps?: CodeFlowStep[];
};

export function analyzeCodeFlows(
    files: AnalyzedFile[],
    dependencies: Dependency[],
    api: APIAnalysis
): CodeFlow[] {
    const flows: CodeFlow[] = [];

    for (const endpoint of api.endpoints) {
        const routeFile = files.find(
            (file) => file.path === endpoint.file
        );

        if (!routeFile) {
            continue;
        }

        const route = `${endpoint.method} ${endpoint.path}`;

        if (!endpoint.handler) {
            flows.push({
                entryPoint: routeFile.path,
                route
            });

            continue;
        }

        const [controllerName, methodName] =
            endpoint.handler.split(".");

        if (!controllerName || !methodName) {
            flows.push({
                entryPoint: routeFile.path,
                route,
                handler: endpoint.handler
            });

            continue;
        }

        // Find the controller imported by the route file.
        const routeDependencies = dependencies.filter(
            (dependency) =>
                dependency.from === routeFile.path
        );

        const controller = routeDependencies
            .map((dependency) =>
                files.find(
                    (file) => file.path === dependency.to
                )
            )
            .find(
                (file) =>
                    file !== undefined &&
                    file.type === "Controller" &&
                    file.structure.classes.some(
                        (symbol) =>
                            symbol.name === controllerName
                    )
            );

        if (!controller) {
            flows.push({
                entryPoint: routeFile.path,
                route,
                handler: endpoint.handler
            });

            continue;
        }

        const controllerMethod =
            controller.structure.functions.find(
                (symbol) =>
                    symbol.name === methodName &&
                    symbol.type === "method"
            );

        const steps: CodeFlowStep[] = [
            {
                type: "route",
                name: route,
                file: routeFile.path,
                line: endpoint.line
            },
            {
                type: "controller",
                name: endpoint.handler,
                file: controller.path,
                line: controllerMethod?.startLine
            }
        ];

        if (!controllerMethod) {
            flows.push({
                entryPoint: routeFile.path,
                route,
                handler: endpoint.handler,
                steps
            });

            continue;
        }

        /*
         * Get only the source code belonging to the
         * exact controller method.
         */
        const methodContent = getMethodContent(
            controller.content,
            controllerMethod.startLine,
            controllerMethod.endLine
        );

        /*
         * Find services imported by the controller.
         */
        const controllerDependencies =
            dependencies.filter(
                (dependency) =>
                    dependency.from === controller.path
            );

        const services = controllerDependencies
            .map((dependency) =>
                files.find(
                    (file) => file.path === dependency.to
                )
            )
            .filter(
                (file): file is AnalyzedFile =>
                    file !== undefined &&
                    file.type === "Service"
            );

        /*
         * Find the exact service methods called
         * inside this controller method.
         */
        const serviceCalls = findServiceCalls(
            methodContent,
            services
        );

        for (const serviceCall of serviceCalls) {
            const service = serviceCall.file;

            const serviceMethod =
                service.structure.functions.find(
                    (symbol) =>
                        symbol.name === serviceCall.method &&
                        symbol.type === "method"
                );

            steps.push({
                type: "service",
                name: `${getClassName(service)}.${serviceCall.method}`,
                file: service.path,
                line: serviceMethod?.startLine
            });

            /*
             * Trace nested calls inside the service method.
             */
            if (serviceMethod) {
                const serviceMethodContent =
                    getMethodContent(
                        service.content,
                        serviceMethod.startLine,
                        serviceMethod.endLine
                    );

                const nestedCalls =
                    findServiceCalls(
                        serviceMethodContent,
                        [service]
                    );

                for (const nestedCall of nestedCalls) {
                    if (
                        nestedCall.method ===
                        serviceCall.method
                    ) {
                        continue;
                    }

                    const nestedMethod =
                        service.structure.functions.find(
                            (symbol) =>
                                symbol.name === nestedCall.method &&
                                symbol.type === "method"
                        );

                    steps.push({
                        type: "service",
                        name: `${getClassName(service)}.${nestedCall.method}`,
                        file: service.path,
                        line: nestedMethod?.startLine
                    });

                    /*
                     * Detect external API usage.
                     */
                    if (
                        nestedMethod &&
                        nestedCall.method === "fetchFromTMDB"
                    ) {
                        const apiUrl =
                            findTMDBEndpoint(
                                serviceMethodContent
                            );

                        if (apiUrl) {
                            steps.push({
                                type: "external_api",
                                url: apiUrl
                            });
                        }
                    }
                }

                /*
                 * fetchFromTMDB may be called directly by
                 * the service method.
                 */
                if (
                    serviceMethodContent.includes(
                        "fetchFromTMDB"
                    )
                ) {
                    const apiUrl =
                        findTMDBEndpoint(
                            serviceMethodContent
                        );

                    if (apiUrl) {
                        steps.push({
                            type: "external_api",
                            url: apiUrl
                        });
                    }
                }
            }
        }

        flows.push({
            entryPoint: routeFile.path,
            route,
            handler: endpoint.handler,
            steps
        });
    }

    return flows;
}

function getMethodContent(
    content: string,
    startLine: number,
    endLine: number
): string {
    return content
        .split("\n")
        .slice(startLine - 1, endLine)
        .join("\n");
}

function findServiceCalls(
    content: string,
    services: AnalyzedFile[]
): {
    file: AnalyzedFile;
    method: string;
}[] {
    const calls: {
        file: AnalyzedFile;
        method: string;
    }[] = [];

    for (const service of services) {
        const className = getClassName(service);

        if (!className) {
            continue;
        }

        const regex = new RegExp(
            `\\b${className}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`,
            "g"
        );

        let match;

        while ((match = regex.exec(content)) !== null) {
            calls.push({
                file: service,
                method: match[1]
            });
        }
    }

    return calls;
}

function getClassName(
    file: AnalyzedFile
): string | null {
    return (
        file.structure.classes.find(
            (symbol) => symbol.type === "class"
        )?.name || null
    );
}

function findTMDBEndpoint(
    content: string
): string | null {
    const match = content.match(
        /["'`](\/(?:trending|discover|movie|tv|search)[^"'`]*)["'`]/
    );

    if (!match) {
        return null;
    }

    return `https://api.themoviedb.org/3${match[1]}`;
}