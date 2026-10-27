/** Narrow structural declarations for the Node built-ins used by our build scripts. */
declare module "node:fs" {
  export function mkdirSync(path: URL, options: { recursive: true }): string | undefined;
  export function writeFileSync(path: URL, data: Uint8Array): void;
}
declare module "node:zlib" {
  export function deflateSync(data: Uint8Array): Uint8Array;
}
declare module "node:fs/promises" {
  export function readFile(path: string | URL): Promise<Uint8Array>;
  export function readFile(path: string | URL, encoding: "utf8"): Promise<string>;
  export function readdir(path: string, options: { recursive: true; withFileTypes: true }): Promise<{
    name: string; parentPath: string; isFile(): boolean;
  }[]>;
}
declare module "node:crypto" {
  interface Hash { update(data: string | Uint8Array): Hash; digest(encoding: "hex"): string }
  export function createHash(algorithm: "sha256"): Hash;
}
declare module "node:url" {
  export function fileURLToPath(url: URL): string;
}
