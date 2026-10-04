export type ProjectAnalysis = {
    frameworks: string[];
    libraries: string[];
    languages: string[];
    packageManagers: string[];
    architecture: {
        frontend: boolean;
        backend: boolean;
        database: boolean;
    };
};

export function analyzeProject(
    files: {
        path: string;
        language: string;
        content: string;
    }[]
): ProjectAnalysis {
    const frameworks = new Set<string>();
    const libraries = new Set<string>();
    const languages = new Set<string>();
    const packageManagers = new Set<string>();

    let frontend = false;
    let backend = false;
    let database = false;

    for (const file of files) {
        const path = file.path.toLowerCase();

        if (file.language !== "Unknown") {
            languages.add(file.language);
        }

        if (
            path.includes("/frontend/") ||
            path.includes("/components/") ||
            path.includes("/app/")
        ) {
            frontend = true;
        }

        if (
            path.includes("/backend/") ||
            path.includes("/controllers/") ||
            path.includes("/routes/") ||
            path.includes("/services/")
        ) {
            backend = true;
        }

        if (
            path.includes("schema.prisma") ||
            path.includes("/models/") ||
            path.includes("/database/")
        ) {
            database = true;
        }

        if (
            file.language === "TypeScript/React" ||
            path.endsWith(".tsx")
        ) {
            frameworks.add("React");
        }

        if (path.endsWith("package.json")) {
            try {
                const packageJson = JSON.parse(file.content);

                const dependencies = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };

                if (dependencies.next) {
                    frameworks.add("Next.js");
                }

                if (dependencies.react) {
                    frameworks.add("React");
                }

                if (dependencies.express) {
                    libraries.add("Express");
                }

                if (dependencies["@tanstack/react-query"]) {
                    libraries.add("TanStack Query");
                }

                if (dependencies.mongoose) {
                    libraries.add("Mongoose");
                    database = true;
                }

                if (dependencies.prisma || dependencies["@prisma/client"]) {
                    libraries.add("Prisma");
                    database = true;
                }

                if (
                    dependencies["@supabase/supabase-js"] ||
                    dependencies["@supabase/ssr"]
                ) {
                    libraries.add("Supabase");
                    database = true;
                }

                if (dependencies.tailwindcss) {
                    libraries.add("Tailwind CSS");
                }

                if (dependencies.typescript) {
                    languages.add("TypeScript");
                }
            } catch {
                // Ignore invalid package.json files
            }
        }

        if (path.endsWith("package-lock.json")) {
            packageManagers.add("npm");
        }

        if (path.endsWith("yarn.lock")) {
            packageManagers.add("Yarn");
        }

        if (path.endsWith("pnpm-lock.yaml")) {
            packageManagers.add("pnpm");
        }

        if (path.endsWith("bun.lockb") || path.endsWith("bun.lock")) {
            packageManagers.add("Bun");
        }
    }

    return {
        frameworks: [...frameworks],
        libraries: [...libraries],
        languages: [...languages],
        packageManagers: [...packageManagers],
        architecture: {
            frontend,
            backend,
            database
        }
    };
}