import unzipper from "unzipper";

export async function downloadRepository(
    owner: string,
    repo: string,
    branch: string
) {
    const response = await fetch(
        `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`
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
