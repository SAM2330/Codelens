import unzipper from "unzipper";

export async function downloadRepository(
    owner: string,
    repo: string,
    branch: string
) {
    const response = await fetch(
    `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`,
    {
        signal: AbortSignal.timeout(60000)
    }
);

    if (!response.ok) {
        throw new Error("Failed to download repository");
    }

    const buffer = await response.arrayBuffer();

    const directory = await unzipper.Open.buffer(
        Buffer.from(buffer)
    );

    return directory;
}

export async function readRepositoryFile(
    directory: unzipper.CentralDirectory,
    path: string
) {
    const file = directory.files.find(
        (file) => file.path === path
    );

    if (!file) {
        throw new Error(`File not found: ${path}`);
    }

    return file.buffer();
}