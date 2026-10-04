import { AnalyzedFile } from "./repositoryAnalyzer";

export type DatabaseModel = {
    name: string;
    file: string;
    line: number;
};

export type DatabaseAnalysis = {
    provider: string | null;
    orm: string | null;
    models: DatabaseModel[];
};

export function analyzeDatabase(
    files: AnalyzedFile[]
): DatabaseAnalysis {
    let provider: string | null = null;
    let orm: string | null = null;

    const models: DatabaseModel[] = [];

    for (const file of files) {
        const path = file.path.toLowerCase();
        const content = file.content;

        if (path.endsWith("schema.prisma")) {
            orm = "Prisma";

            const providerMatch = content.match(
                /provider\s*=\s*"([^"]+)"/
            );

            if (providerMatch) {
                provider = providerMatch[1];
            }

            const modelRegex =
                /model\s+([A-Za-z0-9_]+)/g;

            let match;

            while ((match = modelRegex.exec(content)) !== null) {
                models.push({
                    name: match[1],
                    file: file.path,
                    line: getLineNumber(content, match.index)
                });
            }
        }

        if (content.includes("mongoose")) {
            orm = orm || "Mongoose";
        }

        if (
            content.includes("@supabase/supabase-js") ||
            content.includes("createClient")
        ) {
            orm = orm || "Supabase";
        }
    }

    return {
        provider,
        orm,
        models
    };
}

function getLineNumber(
    content: string,
    position: number
): number {
    return content.slice(0, position).split("\n").length;
}