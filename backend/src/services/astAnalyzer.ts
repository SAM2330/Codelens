
import { parse } from "@babel/parser";

export type ASTAnalysis = {
    functions: string[];
    classes: string[];
};

export function analyzeAST(
    fileName: string,
    content: string
): ASTAnalysis {
    const ast = parse(content, {
        sourceType: "unambiguous",
        sourceFilename: fileName,
        plugins: [
            "typescript",
            "jsx"
        ]
    });

    const functions: string[] = [];
    const classes: string[] = [];

    function visit(node: any) {
        if (!node || typeof node !== "object") {
            return;
        }

        // Regular function declarations
        if (
            node.type === "FunctionDeclaration" &&
            node.id
        ) {
            functions.push(node.id.name);
        }

        // Classes
        if (
            node.type === "ClassDeclaration" &&
            node.id
        ) {
            classes.push(node.id.name);
        }

        // Arrow functions and function expressions
        if (
            node.type === "VariableDeclarator" &&
            node.id?.type === "Identifier"
        ) {
            if (
                node.init?.type === "ArrowFunctionExpression" ||
                node.init?.type === "FunctionExpression"
            ) {
                functions.push(node.id.name);
            }
        }

        // Class methods
        if (
            node.type === "ClassMethod" &&
            node.key?.type === "Identifier"
        ) {
            functions.push(node.key.name);
        }

        // Object methods
        if (
            node.type === "ObjectMethod" &&
            node.key?.type === "Identifier"
        ) {
            functions.push(node.key.name);
        }

        // Recursively visit child nodes
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
        functions: [...new Set(functions)],
        classes: [...new Set(classes)]
    };
}


// console.log(
//     analyzeAST(
//         "test.ts",
//         `
//         function login(user: string) {
//             return user;
//         }

//         function logout() {}

//         class UserService {}
//         `
//     )
// );