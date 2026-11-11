// Whether the settings ask for low quality (the page's data-quality): the one reader the space's parts share.
export const lowQuality = (): boolean => document.documentElement.dataset["quality"] === "low";
