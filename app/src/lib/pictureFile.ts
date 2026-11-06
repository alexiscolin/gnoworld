/** The file of a world's picture: its id's slashes made underscores, then the hash of the inputs it was taken from (8 digits). */
export const pictureFile = (id: string, inputs: string): string => `${id.replaceAll("/", "_")}.${inputs}.webp`;
