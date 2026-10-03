
import { parse } from "@babel/parser";

export type ASTSymbol = {
    name: string;
    type: string;
    startLine: number;
    endLine: number;
};

export type ASTAnalysis = {
    functions: ASTSymbol[];
    classes: ASTSymbol[];
    interfaces: ASTSymbol[];
    types: ASTSymbol[];
    imports: ASTSymbol[];
    exports: ASTSymbol[];
};

export function analyzeAST(
    fileName: string,
    content: string
): ASTAnalysis {
    const ast = parse(content, {
        sourceType: "unambiguous",
        sourceFilename: fileName,
        plugins: ["typescript", "jsx"]
    });

    const functions: ASTSymbol[] = [];
    const classes: ASTSymbol[] = [];
    const interfaces: ASTSymbol[] = [];
    const types: ASTSymbol[] = [];
    const imports: ASTSymbol[] = [];
    const exports: ASTSymbol[] = [];

    function addSymbol(
        collection: ASTSymbol[],
        name: string,
        type: string,
        node: any
    ) {
        if (!node.loc) return;

        collection.push({
            name,
            type,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line
        });
    }

    function visit(node: any) {
        if (!node || typeof node !== "object") return;

        if (node.type === "FunctionDeclaration" && node.id) {
            addSymbol(
                functions,
                node.id.name,
                "function",
                node
            );
        }

        if (node.type === "ClassDeclaration" && node.id) {
            addSymbol(
                classes,
                node.id.name,
                "class",
                node
            );
        }

        if (
            node.type === "VariableDeclarator" &&
            node.id?.type === "Identifier" &&
            (
                node.init?.type === "ArrowFunctionExpression" ||
                node.init?.type === "FunctionExpression"
            )
        ) {
            addSymbol(
                functions,
                node.id.name,
                "function",
                node
            );
        }

        if (
            node.type === "ClassMethod" &&
            node.key?.type === "Identifier"
        ) {
            addSymbol(
                functions,
                node.key.name,
                "method",
                node
            );
        }

        if (
            node.type === "ObjectMethod" &&
            node.key?.type === "Identifier"
        ) {
            addSymbol(
                functions,
                node.key.name,
                "method",
                node
            );
        }

        if (
            node.type === "TSInterfaceDeclaration" &&
            node.id
        ) {
            addSymbol(
                interfaces,
                node.id.name,
                "interface",
                node
            );
        }

        if (
            node.type === "TSTypeAliasDeclaration" &&
            node.id
        ) {
            addSymbol(
                types,
                node.id.name,
                "type",
                node
            );
        }

        if (node.type === "ImportDeclaration") {
            const name =
                node.source?.value || "unknown";

            addSymbol(
                imports,
                name,
                "import",
                node
            );
        }

        if (
            node.type === "ExportNamedDeclaration" ||
            node.type === "ExportDefaultDeclaration"
        ) {
            const declaration = node.declaration;

            const name =
                declaration?.id?.name ||
                declaration?.name ||
                "default";

            addSymbol(
                exports,
                name,
                "export",
                node
            );
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

    return {
        functions,
        classes,
        interfaces,
        types,
        imports,
        exports
    };
}
