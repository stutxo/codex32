// Next Link handles basePath for navigation; plain image/SVG URLs need it too.
export function publicAsset(path: `/${string}`): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
}
