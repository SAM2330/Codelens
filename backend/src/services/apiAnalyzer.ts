import { parse } from "@babel/parser";
import { AnalyzedFile } from "./repositoryAnalyzer";

export type APIEndpoint = {
    method: string;
    path: string;
    file: string;
    line: number;
    framework: string;
    handler?: string;
};

export type APIAnalysis = {
    endpoints: APIEndpoint[];
    externalAPIs: string[];
};

export function analyzeAPIs(
    files: AnalyzedFile[]
): APIAnalysis {
    const endpoints: APIEndpoint[] = [];
    const externalAPIs = new Set<string>();

    for (const file of files) {
        const content = file.content;

        // Analyze Express routes using Babel AST
        try {
            const ast = parse(content, {
                sourceType: "unambiguous",
                sourceFilename: file.path,
                plugins: ["typescript", "jsx"]
            });

            function visit(node: any) {
                if (!node || typeof node !== "object") {
                    return;
                }

                if (
                    node.type === "CallExpression" &&
                    node.callee?.type === "MemberExpression" &&
                    node.callee.object?.type === "Identifier" &&
                    (node.callee.object.name === "router" ||
                        node.callee.object.name === "app") &&
                    node.callee.property?.type === "Identifier"
                ) {
                    const method = node.callee.property.name.toLowerCase();

                    const supportedMethods = [
                        "get",
                        "post",
                        "put",
                        "patch",
                        "delete",
                        "options",
                        "head"
                    ];

                    if (supportedMethods.includes(method)) {
                        const pathArgument = node.arguments[0];

                        if (
                            pathArgument?.type === "StringLiteral"
                        ) {
                            let handler: string | undefined;

                            // Start from the last argument.
                            // This allows middleware to appear before
                            // the actual controller handler.
                            for (
                                let i = node.arguments.length - 1;
                                i >= 1;
                                i--
                            ) {
                                const argument = node.arguments[i];

                                if (
                                    argument?.type === "MemberExpression" &&
                                    argument.object?.type === "Identifier" &&
                                    argument.property?.type === "Identifier"
                                ) {
                                    handler =
                                        `${argument.object.name}.${argument.property.name}`;

                                    break;
                                }
                            }

                            endpoints.push({
                                method: method.toUpperCase(),
                                path: pathArgument.value,
                                file: file.path,
                                line: node.loc?.start.line || 1,
                                framework: "Express",
                                handler
                            });
                        }
                    }
                }

                for (const key of Object.keys(node)) {
                    if (
                        key === "loc" ||
                        key === "start" ||
                        key === "end"
                    ) {
                        continue;
                    }

                    const value = node[key];

                    if (Array.isArray(value)) {
                        for (const child of value) {
                            visit(child);
                        }
                    } else if (
                        value &&
                        typeof value === "object"
                    ) {
                        visit(value);
                    }
                }
            }

            visit(ast.program);
        } catch {
            // Ignore files that cannot be parsed
        }

        // Detect external API URLs passed to fetch()
        const fetchRegex =
            /fetch\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/g;

        let match;

        while ((match = fetchRegex.exec(content)) !== null) {
            externalAPIs.add(match[1]);
        }

        // Detect external API URLs passed to axios
        const axiosRegex =
            /axios\.(get|post|put|patch|delete)\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/g;

        while ((match = axiosRegex.exec(content)) !== null) {
            externalAPIs.add(match[2]);
        }
    }

    return {
        endpoints,
        externalAPIs: [...externalAPIs]
    };
}